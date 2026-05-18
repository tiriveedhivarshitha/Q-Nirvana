const express = require('express');
const { db } = require('../db/firebase');
const { sendEmail, emailTemplates } = require('../services/emailService');
const router = express.Router();

// Haversine Distance helper
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

// GET /api/emergency/hospitals?lat=...&lng=...
router.get('/hospitals', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ message: 'Location is required' });

  try {
    const snapshot = await db.collection('hospitals').get();
    const hospitals = snapshot.docs.map(doc => {
      const data = doc.data();
      const d = calculateDistance(parseFloat(lat), parseFloat(lng), data.lat, data.lng);
      return { ...data, distance: d.toFixed(2) };
    }).sort((a, b) => a.distance - b.distance);

    return res.json({ success: true, hospitals });
  } catch (err) {
    return res.status(500).json({ message: 'Server error searching hospitals' });
  }
});

// GET /api/emergency/hospital/:id/doctors
router.get('/hospital/:id/doctors', async (req, res) => {
  try {
    const snapshot = await db.collection('doctor_profiles')
      .where('hospital_id', '==', req.params.id)
      .get();

    const doctors = snapshot.docs.map(doc => doc.data()).filter(d => d.status === 'active');
    return res.json({ success: true, doctors });
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching doctors' });
  }
});

// POST /api/emergency/book
router.post('/book', async (req, res) => {
  const { hospitalId, doctorId, patientLocation, patientEmail } = req.body;

  try {
    // Find ordered list of hospitals by distance
    const hSnap = await db.collection('hospitals').get();
    const hospitals = hSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .map(h => ({
        ...h,
        distance: calculateDistance(patientLocation.lat, patientLocation.lng, h.lat, h.lng)
      }))
      .sort((a, b) => a.distance - b.distance);

    // Find index of selected hospital
    let currentIndex = hospitals.findIndex(h => h.id === hospitalId);
    if (currentIndex === -1) currentIndex = 0;

    let selectedHosp = null;
    let availableBed = null;

    // Start checking from selected hospital onwards
    for (let i = currentIndex; i < hospitals.length; i++) {
      const h = hospitals[i];
      const bedsSnap = await db.collection('hospital_beds')
        .where('hospital_id', '==', h.id)
        .where('bed_type', '==', 'icu')
        .where('status', '==', 'available')
        .limit(1)
        .get();

      if (!bedsSnap.empty) {
        selectedHosp = h;
        availableBed = bedsSnap.docs[0].data();
        break;
      }
    }

    // If not found in those, check ones before the selected index as fallback
    if (!availableBed) {
      for (let i = 0; i < currentIndex; i++) {
        const h = hospitals[i];
        const bedsSnap = await db.collection('hospital_beds')
          .where('hospital_id', '==', h.id)
          .where('bed_type', '==', 'icu')
          .where('status', '==', 'available')
          .limit(1)
          .get();

        if (!bedsSnap.empty) {
          selectedHosp = h;
          availableBed = bedsSnap.docs[0].data();
          break;
        }
      }
    }

    if (!availableBed) {
      return res.status(404).json({ success: false, message: 'No ICU beds available nearby. Please contact emergency services.' });
    }

    // Pick doctor: If it's the original hospital, use requested doctor. Otherwise pick an available one.
    let bookingDoctorId = doctorId;
    if (selectedHosp.id !== hospitalId) {
      const drSnap = await db.collection('doctor_profiles')
        .where('hospital_id', '==', selectedHosp.id)
        .get();

      const activeDocs = drSnap.docs.filter(d => d.data().status === 'active');
      if (activeDocs.length === 0) {
        return res.status(500).json({ message: 'No available doctors in found hospital' });
      }
      bookingDoctorId = activeDocs[0].id;
    }

    const drDoc = await db.collection('doctor_profiles').doc(bookingDoctorId).get();
    const doctor = drDoc.data();

    // Transaction!
    const bookingId = `EMGCY_${Date.now()}`;
    await db.runTransaction(async (t) => {
      const bedRef = db.collection('hospital_beds').doc(availableBed.id);
      const hospRef = db.collection('hospitals').doc(selectedHosp.id);

      t.update(bedRef, {
        status: 'occupied',
        updated_at: new Date().toISOString(),
        emergency_flag: true
      });

      // Decrement cached count if exists
      if (typeof selectedHosp.icu_beds_available === 'number') {
        t.update(hospRef, {
          icu_beds_available: selectedHosp.icu_beds_available - 1
        });
      }

      // Create appointment
      const apptRef = db.collection('appointments').doc(bookingId);
      t.set(apptRef, {
        id: bookingId,
        hospital_id: selectedHosp.id,
        hospital_name: selectedHosp.name,
        doctor_id: bookingDoctorId,
        doctor_name: doctor.full_name,
        bed_id: availableBed.id,
        room_number: availableBed.room_number,
        status: 'confirmed',
        emergency_flag: true,
        patient_email: patientEmail || 'anonymous',
        location: patientLocation,
        created_at: new Date().toISOString()
      });

      // Create emergency request for dispatch tracking
      const reqRef = db.collection('emergency_requests').doc(bookingId);
      t.set(reqRef, {
        id: bookingId,
        patient_id: patientEmail || 'anonymous',
        patient_name: 'Emergency Patient',
        patient_mobile: 'N/A',
        pickup_address: `Lat: ${patientLocation.lat}, Lng: ${patientLocation.lng}`,
        pickup_lat: patientLocation.lat,
        pickup_lng: patientLocation.lng,
        status: 'requested',
        description: `Automatic dispatch to ${selectedHosp.name}`,
        hospital_id: selectedHosp.id,
        hospital_name: selectedHosp.name,
        created_at: new Date().toISOString()
      });
    });

    // 📧 Send immediate confirmation email
    if (patientEmail && patientEmail !== 'anonymous') {
      const tmpl = emailTemplates.emergencyConfirmation(
        'Emergency Patient', selectedHosp.name, doctor.full_name, availableBed.room_number, Math.ceil(selectedHosp.distance / 0.5)
      );
      sendEmail({ to: patientEmail, subject: tmpl.subject, html: tmpl.html }).catch(console.error);
    }

    return res.json({
      success: true,
      hospital: selectedHosp.name,
      room: availableBed.room_number,
      doctor: doctor.full_name,
      distance: selectedHosp.distance.toFixed(2),
      eta: Math.ceil(selectedHosp.distance / 0.5) // Example: 0.5km/min
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Emergency booking failed' });
  }
});

module.exports = router;
