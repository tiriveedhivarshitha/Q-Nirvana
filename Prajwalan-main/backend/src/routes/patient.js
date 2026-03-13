const express = require('express');
const { db } = require('../db/firebase');
const { authenticate, authorize } = require('../middleware/auth');
const { calculatePriority, estimateWaitTime } = require('../services/priorityQueue');
const { sendEmail, emailTemplates } = require('../services/emailService');
const { sendTelegramMessage, telegramMessages } = require('../services/telegramService');

const router = express.Router();
router.use(authenticate, authorize('patient'));

// GET /api/patient/profile
router.get('/profile', async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();
        const profileDoc = await db.collection('patient_profiles').doc(req.user.id).get();

        if (!userDoc.exists || !profileDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }

        const profile = { ...userDoc.data(), ...profileDoc.data() };
        delete profile.password_hash;

        return res.json({ success: true, profile });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/doctors - list available doctors
router.get('/doctors', async (req, res) => {
    try {
        const doctorsSnapshot = await db.collection('doctor_profiles').get();
        const doctors = [];

        for (const doc of doctorsSnapshot.docs) {
            const profile = doc.data();
            if (!profile.user_id) continue; // Skip bad data

            const userDoc = await db.collection('users').doc(profile.user_id).get();
            if (userDoc.exists && userDoc.data().is_active) {
                const scheduleSnapshot = await db.collection('doctor_availability').where('doctor_id', '==', profile.user_id).get();
                const schedule = scheduleSnapshot.docs.map(s => s.data());

                doctors.push({
                    id: doc.id,
                    ...profile,
                    full_name: userDoc.data().full_name,
                    email: userDoc.data().email,
                    schedule
                });
            }
        }

        // Custom sort equivalent to ORDER BY dp.is_available DESC, dp.rating DESC
        doctors.sort((a, b) => {
            if (a.is_available !== b.is_available) return b.is_available ? 1 : -1;
            return (b.rating || 0) - (a.rating || 0);
        });

        return res.json({ success: true, doctors });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/doctors/:id/booked-slots
router.get('/doctors/:id/booked-slots', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'Date required' });

        const snapshot = await db.collection('appointments')
            .where('doctor_id', '==', req.params.id)
            .where('appointment_date', '==', date)
            .where('status', 'in', ['scheduled', 'in_progress'])
            .get();

        const bookedTimes = snapshot.docs
            .filter(doc => doc.data().status !== 'expired') // Release expired slots
            .map(doc => doc.data().appointment_time);
        return res.json({ success: true, bookedTimes });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/appointments - book OPD
router.post('/appointments', async (req, res) => {
    const { doctor_id, appointment_date, appointment_time, reason, is_emergency, is_maternity } = req.body;

    if (!reason || String(reason).trim() === '') {
        return res.status(400).json({ success: false, message: 'Reason for visit is required' });
    }

    try {
        const profileDoc = await db.collection('patient_profiles').doc(req.user.id).get();
        if (!profileDoc.exists) return res.status(404).json({ success: false, message: 'Patient profile not found' });
        const patient = profileDoc.data();

        const { priority, score } = calculatePriority({
            age: patient.age || 30,
            gender: patient.gender,
            is_emergency: is_emergency || false,
            is_maternity: is_maternity || false,
        });

        const apptsRef = db.collection('appointments');
        const queueRef = db.collection('patient_queue');

        // Check for double booking
        const existingSlot = await apptsRef
            .where('doctor_id', '==', doctor_id)
            .where('appointment_date', '==', appointment_date)
            .where('appointment_time', '==', appointment_time)
            .where('status', 'in', ['scheduled', 'in_progress'])
            .get();

        if (!existingSlot.empty) {
            return res.status(409).json({ success: false, message: 'Doctor is not available at this time. Slot already booked.' });
        }

        const queueCount = (await apptsRef
            .where('doctor_id', '==', doctor_id)
            .where('appointment_date', '==', appointment_date)
            .get()).size;

        const queuePosition = queueCount + 1;
        const estimatedWait = estimateWaitTime(queuePosition);

        // Unique ID constraint approach using combination of keys
        const cleanTime = appointment_time.replace(/[:\s]/g, '');
        const bookingId = `${doctor_id}_${appointment_date}_${cleanTime}`;

        const moment = require('moment-timezone');
        const start_time_utc = moment.tz(`${appointment_date} ${appointment_time}`, 'YYYY-MM-DD hh:mm A', 'Asia/Kolkata').utc().toISOString();

        const { v4: uuidv4 } = require('uuid');
        const QRCode = require('qrcode');

        const qrToken = uuidv4();
        const qrGeneratedAt = new Date().toISOString();

        // Expiry time points to the end of the day or strictly after appointment. We'll set it to start_time_utc + 3 hours just to be safe
        const expiryDate = new Date(new Date(start_time_utc).getTime() + (3 * 60 * 60 * 1000));
        const qrExpiryTime = expiryDate.toISOString();

        const qrPayload = {
            appointmentId: bookingId,
            token: qrToken,
            exp: qrExpiryTime
        };

        let qrCodeImageUrl = '';
        try {
            qrCodeImageUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));
            console.log(`[QR GENERATED]\nAppointment ID: ${bookingId}\nToken: ${qrToken}\nGenerated At (UTC): ${qrGeneratedAt}\nExpiry: ${qrExpiryTime}`);
        } catch (qrErr) {
            console.error('QR generation failed, rolling back:', qrErr);
            return res.status(500).json({ success: false, message: 'QR Code generation failed' });
        }

        const apptData = {
            id: bookingId,
            patient_id: patient.id,
            doctor_id,
            appointment_date,
            appointment_time,
            start_time_utc,
            reason,
            priority,
            priority_score: score,
            queue_position: queuePosition,
            estimated_wait_minutes: estimatedWait,
            is_emergency: is_emergency || false,
            status: 'scheduled',
            is_confirmed: false, // New flag for 20-min expiry logic
            payment_status: 'Paid', // Default for now as per requirement
            reschedule_count: 0,
            created_at: new Date().toISOString(),
            qrToken,
            qrCodeImageUrl,
            qrGeneratedAt,
            qrExpiryTime,
            qrVerified: false
        };

        // We use .doc(bookingId).create to enforce uniqueness!
        // Firebase create fails if the document already exists, meaning atomic race-condition safety.
        try {
            await apptsRef.doc(bookingId).create(apptData);
        } catch (fbError) {
            if (fbError.code === 6 /* ALREADY_EXISTS */) {
                return res.status(409).json({ success: false, message: 'Doctor is not available at this time. Slot just got grabbed by someone else!' });
            }
            throw fbError; // Standard errors
        }

        await queueRef.doc(bookingId).set({
            id: bookingId,
            appointment_id: bookingId,
            doctor_id,
            patient_id: patient.id,
            priority,
            priority_score: score,
            position: queuePosition,
            status: 'waiting',
            checked_in_at: new Date().toISOString()
        });

        if (req.app.locals.broadcastAll) {
            req.app.locals.broadcastAll({ type: 'UPDATE_DASHBOARD', section: 'appointments' });
        }

        const doctorProfile = (await db.collection('doctor_profiles').doc(doctor_id).get()).data();
        const doctorUser = (await db.collection('users').doc(doctorProfile.user_id).get()).data();
        const doctorName = doctorUser?.full_name || 'your doctor';

        const tmpl = emailTemplates.appointmentConfirmation(
            req.user.full_name, doctorName, appointment_date, appointment_time, queuePosition, qrCodeImageUrl
        );
        sendEmail({ to: req.user.email, subject: tmpl.subject, html: tmpl.html, attachments: tmpl.attachments }).then(() => {
            console.log(`[QR EMAIL SENT]\nAppointment ID: ${bookingId}\nPatient Email: ${req.user.email}`);
        }).catch(console.error);

        // Pass to Bull queue for scheduling
        const { scheduleReminder } = require('../services/queueService');
        scheduleReminder(apptData).catch(console.error);

        return res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            appointment: apptData,
        });
    } catch (err) {
        require('fs').appendFileSync('booking_error.log', err.stack + '\n');
        console.error('Booking error:', err);
        return res.status(500).json({ success: false, message: 'Booking failed' });
    }
});

// GET /api/patient/appointments - my appointments
router.get('/appointments', async (req, res) => {
    try {
        const snapshot = await db.collection('appointments')
            .where('patient_id', '==', req.user.id)
            .get();

        if (snapshot.empty) return res.json({ success: true, appointments: [] });

        // Fetch all doctor info in parallel (not sequentially) to eliminate lag
        const appointments = await Promise.all(snapshot.docs.map(async (doc) => {
            const appt = doc.data();
            try {
                const doctorProfileDoc = await db.collection('doctor_profiles').doc(appt.doctor_id).get();
                const doctorProfile = doctorProfileDoc.exists ? doctorProfileDoc.data() : {};
                const doctorUser = doctorProfile.user_id
                    ? (await db.collection('users').doc(doctorProfile.user_id).get()).data()
                    : {};
                return {
                    ...appt,
                    doctor_name: doctorUser?.full_name || 'Unknown',
                    specialization: doctorProfile?.specialization || 'N/A',
                    department: doctorProfile?.department || 'N/A'
                };
            } catch {
                return { ...appt, doctor_name: 'Unknown', specialization: 'N/A', department: 'N/A' };
            }
        }));

        appointments.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

        return res.json({ success: true, appointments });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/queue-status/:appointmentId
router.get('/queue-status/:appointmentId', async (req, res) => {
    try {
        const queueDoc = await db.collection('patient_queue').doc(req.params.appointmentId).get();
        if (!queueDoc.exists) return res.status(404).json({ success: false, message: 'Queue entry not found' });
        const entry = queueDoc.data();

        const apptDoc = await db.collection('appointments').doc(entry.appointment_id).get();
        const appt = apptDoc.exists ? apptDoc.data() : {};

        const doctorProfile = (await db.collection('doctor_profiles').doc(entry.doctor_id).get()).data() || {};
        const doctorUser = doctorProfile.user_id ? (await db.collection('users').doc(doctorProfile.user_id).get()).data() : {};

        // Filter by appointment_date to only compare today's queue (prevents full-scan lag)
        const appointmentDate = appt.appointment_date || new Date().toISOString().split('T')[0];
        const aheadSnapshot = await db.collection('patient_queue')
            .where('doctor_id', '==', entry.doctor_id)
            .where('status', '==', 'waiting')
            .get();

        const myScore = entry.priority_score || 0;
        const myCheckIn = entry.checked_in_at ? new Date(entry.checked_in_at).getTime() : Date.now();

        let patientsAhead = 0;
        aheadSnapshot.forEach(doc => {
            const d = doc.data();
            if (d.id === entry.id) return;
            // Only count entries for the same appointment date
            const dApptDate = d.appointment_date || '';
            if (dApptDate && dApptDate !== appointmentDate) return;
            const s = d.priority_score || 0;
            const c = d.checked_in_at ? new Date(d.checked_in_at).getTime() : 0;
            // Higher score goes first. Same score but earlier check-in goes first.
            if (s > myScore || (s === myScore && c < myCheckIn)) {
                patientsAhead++;
            }
        });

        if (patientsAhead === 2) {
            if (req.user.telegram_chat_id) {
                sendTelegramMessage(
                    req.user.telegram_chat_id,
                    telegramMessages.queueAlert2Ahead(req.user.full_name, doctorUser?.full_name || 'Unknown')
                ).catch(console.error);
            }
            const tmpl = emailTemplates.queueAlert(req.user.full_name, 20);
            sendEmail({ to: req.user.email, subject: tmpl.subject, html: tmpl.html }).catch(console.error);
        }

        return res.json({
            success: true,
            queueStatus: {
                position: entry.position,
                status: entry.status,
                checked_in_at: entry.checked_in_at,
                estimated_wait_minutes: appt.estimated_wait_minutes,
                priority: appt.priority,
                appointment_time: appt.appointment_time,
                doctor_name: doctorUser?.full_name || 'Unknown',
                patients_ahead: patientsAhead,
                estimated_wait_minutes_actual: patientsAhead * 10
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});


// GET /api/patient/beds - check bed availability
router.get('/beds', async (req, res) => {
    try {
        const snapshot = await db.collection('hospital_beds').get();
        const beds = snapshot.docs.map(doc => doc.data());

        const summary = beds.reduce((acc, bed) => {
            const type = bed.bed_type;
            if (!acc[type]) acc[type] = { bed_type: type, total: 0, available: 0, occupied: 0 };
            acc[type].total++;
            if (bed.status === 'available') acc[type].available++;
            if (bed.status === 'occupied') acc[type].occupied++;
            return acc;
        }, {});

        const available_beds = beds.filter(b => b.status === 'available');

        return res.json({ success: true, summary: Object.values(summary), available_beds, beds: available_beds });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/book-bed - book a bed/admission
router.post('/book-bed', async (req, res) => {
    const { bed_id, assign_o2, notes } = req.body;
    try {
        const bedRef = db.collection('hospital_beds').doc(bed_id);
        const bedDoc = await bedRef.get();

        if (!bedDoc.exists) return res.status(404).json({ success: false, message: 'Bed not found' });
        if (bedDoc.data().status !== 'available') return res.status(400).json({ success: false, message: 'Bed is no longer available' });

        await bedRef.update({
            status: 'occupied',
            patient_id: req.user.id,
            admitted_at: new Date().toISOString(),
            o2_cylinder_assigned: assign_o2 || false,
            specialty_equipment: notes ? { notes } : null,
            updated_at: new Date().toISOString()
        });

        if (req.app.locals.broadcastAll) {
            req.app.locals.broadcastAll({ type: 'UPDATE_DASHBOARD', section: 'beds' });

            // Broadcast emergency/bed notification to all active dashboards
            req.app.locals.broadcastAll({
                type: 'NEW_NOTIFICATION',
                role: 'doctor', // frontend will filter
                notification: {
                    id: Date.now(),
                    type: 'warning',
                    title: 'New Bed Booked',
                    sub: `Patient ${req.user.full_name} reserved a bed in ${bedDoc.data().ward_name}`
                }
            });
        }

        return res.json({
            success: true,
            message: `Bed in ${bedDoc.data().ward_name} booked successfully. Please proceed to the hospital for admission.`
        });
    } catch (err) {
        console.error('Bed booking error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/blood-bank
router.get('/blood-bank', async (req, res) => {
    try {
        const snapshot = await db.collection('blood_bank').get();
        const bloodBank = snapshot.docs.map(doc => doc.data());
        bloodBank.sort((a, b) => a.blood_group.localeCompare(b.blood_group));
        return res.json({ success: true, bloodBank });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/blood-request
router.post('/blood-request', async (req, res) => {
    const { blood_group, units_needed, urgency, notes } = req.body;
    try {
        const reqRef = db.collection('blood_requests').doc();
        const requestData = {
            id: reqRef.id,
            patient_id: req.user.id,
            requested_by: req.user.id,
            blood_group,
            units_needed: units_needed || 1,
            urgency: urgency || 'normal',
            status: 'pending',
            notes,
            created_at: new Date().toISOString()
        };
        await reqRef.set(requestData);

        if (req.app.locals.broadcastAll) {
            req.app.locals.broadcastAll({ type: 'UPDATE_DASHBOARD', section: 'blood_bank' });
        }
        return res.status(201).json({ success: true, request: requestData });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/medical-history (and alias /history)
router.get(['/medical-history', '/history'], async (req, res) => {
    try {
        const snapshot = await db.collection('medical_records')
            .where('patient_id', '==', req.user.id)
            .get();

        const records = [];
        for (const doc of snapshot.docs) {
            const record = doc.data();
            let doctor_name = 'Unknown';
            let specialization = '';
            let department = '';

            if (record.doctor_id) {
                const docProf = (await db.collection('doctor_profiles').doc(record.doctor_id).get()).data();
                if (docProf) {
                    const docUser = (await db.collection('users').doc(docProf.user_id).get()).data();
                    doctor_name = docUser?.full_name || 'Unknown';
                    specialization = docProf.specialization;
                    department = docProf.department;
                }
            }

            records.push({ ...record, doctor_name, specialization, department });
        }

        records.sort((a, b) => new Date(b.record_date) - new Date(a.record_date));

        return res.json({ success: true, medicalRecords: records, records });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/stats
router.get('/stats', async (req, res) => {
    try {
        const recordsSnapshot = await db.collection('medical_records')
            .where('patient_id', '==', req.user.id)
            .get();

        const allRecords = recordsSnapshot.docs.map(d => d.data());
        allRecords.sort((a, b) => new Date(b.record_date) - new Date(a.record_date));
        const last_date = allRecords.length === 0 ? 'None' : allRecords[0].record_date;

        const consults = await db.collection('appointments')
            .where('patient_id', '==', req.user.id)
            .where('status', '==', 'completed')
            .get();

        return res.json({
            success: true,
            summary: {
                last_consultation: last_date,
                total_consultations: consults.size,
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/family-access - grant family access
router.post('/family-access', async (req, res) => {
    const { family_member_name, family_member_email, relation } = req.body;
    try {
        const ref = db.collection('family_access').doc();
        const data = {
            id: ref.id,
            patient_id: req.user.id,
            family_member_name,
            family_member_email,
            relation,
            is_active: true,
            granted_at: new Date().toISOString()
        };
        await ref.set(data);
        return res.status(201).json({ success: true, access: data });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/family-access
router.get('/family-access', async (req, res) => {
    try {
        const snapshot = await db.collection('family_access')
            .where('patient_id', '==', req.user.id)
            .get();
        const familyAccess = snapshot.docs.map(doc => doc.data());
        familyAccess.sort((a, b) => new Date(b.granted_at) - new Date(a.granted_at));
        return res.json({ success: true, familyAccess });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/emergency - emergency bypass
router.post('/emergency', async (req, res) => {
    const { description, pickup_address, pickup_lat, pickup_lng } = req.body;
    try {
        // Find nearest hospital dynamically
        const hospitalsSlot = await db.collection('hospitals').get();
        const hospitals = hospitalsSlot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const calculateDistance = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        let nearestHosp = null;
        let minDistance = Infinity;

        hospitals.forEach(h => {
            const d = calculateDistance(pickup_lat, pickup_lng, h.lat, h.lng);
            if (d < minDistance) {
                minDistance = d;
                nearestHosp = h;
            }
        });

        const hospital_lat = nearestHosp ? nearestHosp.lat : 12.9716;
        const hospital_lng = nearestHosp ? nearestHosp.lng : 77.5946;
        const hospital_name = nearestHosp ? nearestHosp.name : 'Main General Hospital';

        const ref = db.collection('emergency_requests').doc();
        const data = {
            id: ref.id,
            patient_id: req.user.id,
            pickup_address,
            pickup_lat,
            pickup_lng,
            hospital_id: nearestHosp ? nearestHosp.id : 'default',
            hospital_name,
            hospital_lat,
            hospital_lng,
            description: description || `Emergency alert near ${pickup_address}`,
            status: 'requested',
            created_at: new Date().toISOString()
        };

        await ref.set(data);

        if (req.app.locals.broadcastAll) {
            req.app.locals.broadcastAll({ type: 'UPDATE_DASHBOARD', section: 'emergencies' });
        }

        const tmpl = emailTemplates.emergencyAlert(req.user.full_name, 'general');
        sendEmail({ to: req.user.email, subject: tmpl.subject, html: tmpl.html }).catch(console.error);

        return res.status(201).json({
            success: true,
            emergency: data,
            nearest_hospital: hospital_name,
            distance: minDistance.toFixed(2),
            message: `Emergency request raised. Moving to ${hospital_name} (${minDistance.toFixed(2)} km). Ambulance dispatched!`
        });
    } catch (err) {
        console.error('Emergency Bypass Error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/shared-with-me - medical records shared with this patient (as family)
router.get('/shared-with-me', async (req, res) => {
    try {
        const snapshot = await db.collection('family_access')
            .where('family_member_email', '==', req.user.email)
            .where('is_active', '==', true)
            .get();

        const sharedData = [];
        for (const faDoc of snapshot.docs) {
            const fa = faDoc.data();
            const patientUser = (await db.collection('users').doc(fa.patient_id).get()).data();
            const patientProfile = (await db.collection('patient_profiles').doc(fa.patient_id).get()).data();

            const recordsSnapshot = await db.collection('medical_records')
                .where('patient_id', '==', fa.patient_id)
                .get();

            const records = [];
            for (const mrDoc of recordsSnapshot.docs) {
                const mr = mrDoc.data();
                let docName = 'Unknown';
                if (mr.doctor_id) {
                    const dProf = (await db.collection('doctor_profiles').doc(mr.doctor_id).get()).data();
                    if (dProf) {
                        const dUser = (await db.collection('users').doc(dProf.user_id).get()).data();
                        docName = dUser?.full_name || 'Unknown';
                    }
                }
                records.push({
                    diagnosis: mr.diagnosis,
                    prescription: mr.prescription,
                    date: mr.record_date,
                    doctor: docName
                });
            }

            sharedData.push({
                patient_name: patientUser.full_name,
                patient_email: patientUser.email,
                relation: fa.relation,
                age: patientProfile.age,
                blood_group: patientProfile.blood_group,
                records
            });
        }

        return res.json({ success: true, sharedData });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/patient/notifications
router.get('/notifications', async (req, res) => {
    try {
        const snapshot = await db.collection('notifications')
            .where('user_id', '==', req.user.id)
            .orderBy('sent_at', 'desc')
            .limit(50)
            .get();
        return res.json({ success: true, notifications: snapshot.docs.map(doc => doc.data()) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/patient/appointments/:id/confirm
router.post('/appointments/:id/confirm', async (req, res) => {
    try {
        const apptRef = db.collection('appointments').doc(req.params.id);
        const appt = await apptRef.get();
        if (!appt.exists) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (appt.data().patient_id !== req.user.id) return res.status(403).json({ success: false, message: 'Unauthorized' });

        await apptRef.update({ is_confirmed: true });
        return res.json({ success: true, message: 'Appointment confirmed' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Confirmation failed' });
    }
});

// POST /api/patient/appointments/:id/reschedule
router.post('/appointments/:id/reschedule', async (req, res) => {
    const { appointment_date, appointment_time, start_time_utc } = req.body;
    const oldId = req.params.id;

    if (!appointment_date || !appointment_time || !start_time_utc) {
        return res.status(400).json({ success: false, message: 'Missing rescheduling details' });
    }

    try {
        const oldDocRef = db.collection('appointments').doc(oldId);
        const oldDoc = await oldDocRef.get();

        if (!oldDoc.exists) {
            return res.status(404).json({ success: false, message: 'Original appointment not found' });
        }

        const oldData = oldDoc.data();
        if (oldData.patient_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // 👮 Business Rule: Only 1 free reschedule
        if (oldData.reschedule_count >= 1) {
            return res.status(400).json({ success: false, message: 'Rescheduling is limited to once per appointment to prevent misuse.' });
        }

        const cleanTime = appointment_time.replace(/[:\s]/g, '');
        const newId = `${oldData.doctor_id}_${appointment_date}_${cleanTime}`;
        const newDoc = await db.collection('appointments').doc(newId).get();

        if (newDoc.exists) {
            return res.status(409).json({ success: false, message: 'The selected slot is already booked. Please choose another time.' });
        }

        const batch = db.batch();

        // 1. Remove old appointment and its queue entry
        batch.delete(oldDocRef);
        batch.delete(db.collection('patient_queue').doc(oldId));

        // 2. Queue Position logic
        const queueCount = (await db.collection('appointments')
            .where('doctor_id', '==', oldData.doctor_id)
            .where('appointment_date', '==', appointment_date)
            .get()).size;
        const queuePosition = queueCount + 1;
        const estimatedWait = queuePosition * 10;

        // 3. Create new appointment with same payment info
        const newData = {
            ...oldData,
            id: newId,
            appointment_date,
            appointment_time,
            start_time_utc,
            is_confirmed: true, // Rescheduled appointments are pre-confirmed
            queue_position: queuePosition,
            estimated_wait_minutes: estimatedWait,
            reschedule_count: (oldData.reschedule_count || 0) + 1,
            rescheduled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            reminder_sent: false,
            reminder_1h_sent: false
        };

        batch.set(db.collection('appointments').doc(newId), newData);

        batch.set(db.collection('patient_queue').doc(newId), {
            id: newId,
            appointment_id: newId,
            doctor_id: oldData.doctor_id,
            patient_id: req.user.id,
            priority: oldData.priority || 'standard',
            priority_score: oldData.priority_score || 0,
            position: queuePosition,
            status: 'waiting',
            checked_in_at: new Date().toISOString()
        });

        await batch.commit();

        console.log(`♻️ Rescheduled appt: ${oldId} -> ${newId}`);

        return res.json({
            success: true,
            message: 'Appointment Rescheduled Successfully. No additional payment required.',
            appointment: newData
        });
    } catch (err) {
        console.error('Reschedule error:', err);
        return res.status(500).json({ success: false, message: 'Server error during rescheduling' });
    }
});

module.exports = router;

