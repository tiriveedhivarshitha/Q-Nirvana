const cron = require('node-cron');
const moment = require('moment-timezone');
const { db } = require('../db/firebase');
const { sendEmail, emailTemplates } = require('./emailService');

const startCronJobs = () => {
  console.log('⏳ Starting background cron jobs...');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = moment.utc();

      // ─── 1. HANDLE 20-MINUTE SLOT EXPIRY ───
      // Find appointments created > 20 mins ago that are NOT confirmed
      const expiryThreshold = now.clone().subtract(20, 'minutes').toISOString();

      const unconfirmedSnapshot = await db.collection('appointments')
        .where('status', '==', 'scheduled')
        .where('is_confirmed', '==', false)
        .where('created_at', '<=', expiryThreshold)
        .get();

      for (const doc of unconfirmedSnapshot.docs) {
        const appt = doc.data();
        if (appt.status === 'expired') continue;

        console.log(`🕒 Terminating expired slot: ${appt.id}`);

        // 1. Mark as expired in DB
        await db.collection('appointments').doc(doc.id).update({
          status: 'expired',
          updated_at: new Date().toISOString()
        });

        // 2. Remove from active queue
        await db.collection('patient_queue').doc(doc.id).delete();

        // 3. Send automated email
        const pDoc = await db.collection('users').doc(appt.patient_id).get();
        const dDoc = await db.collection('users').doc(appt.doctor_id).get();

        if (pDoc.exists) {
          const patient = pDoc.data();
          const doctorName = dDoc.exists ? dDoc.data().full_name : 'your doctor';
          const rescheduleLink = `http://localhost:5173/patient/book-opd?doctor_id=${appt.doctor_id}`;

          const template = emailTemplates.appointmentExpired(
            patient.full_name,
            doctorName,
            appt.appointment_time,
            rescheduleLink
          );

          const emailRes = await sendEmail({
            to: patient.email,
            subject: template.subject,
            html: template.html
          });

          // Log email status
          await db.collection('appointments').doc(doc.id).update({
            expiry_email_sent: emailRes.success,
            expiry_email_logged_at: new Date().toISOString()
          });
        }
      }

      // ─── 2. HANDLE 20-MINUTE START REMINDER (EXISTING) ───
      const targetMin = now.clone().add(20, 'minutes');
      const targetMax = now.clone().add(21, 'minutes');

      const startUTCStr = targetMin.toISOString();
      const maxUTCStr = targetMax.toISOString();

      const snapshot = await db.collection('appointments')
        .where('status', '==', 'scheduled')
        .where('start_time_utc', '>=', startUTCStr)
        .where('start_time_utc', '<', maxUTCStr)
        .get();

      for (const doc of snapshot.docs) {
        const appt = doc.data();
        if (appt.reminder_sent || appt.status === 'expired') continue;

        const ppDoc = await db.collection('users').doc(appt.patient_id).get();
        const dpDoc = await db.collection('users').doc(appt.doctor_id).get();

        if (ppDoc.exists && dpDoc.exists) {
          const patient = ppDoc.data();
          const doctor = dpDoc.data();

          const template = emailTemplates.appointmentReminder(
            patient.full_name,
            doctor.full_name,
            appt.appointment_date,
            appt.start_time_utc
          );

          sendEmail({
            to: patient.email,
            subject: template.subject,
            html: template.html
          });

          await db.collection('appointments').doc(doc.id).update({
            reminder_sent: true
          });
        }
      }

      // ─── 3. HANDLE 1-HOUR REMINDER (Requirement 5) ───
      const hourStart = now.clone().add(55, 'minutes').toISOString();
      const hourEnd = now.clone().add(65, 'minutes').toISOString();

      const hourSnapshot = await db.collection('appointments')
        .where('status', '==', 'scheduled')
        .where('start_time_utc', '>=', hourStart)
        .where('start_time_utc', '<=', hourEnd)
        .get();

      for (const doc of hourSnapshot.docs) {
        const appt = doc.data();
        if (appt.reminder_1h_sent || appt.status === 'expired') continue;

        const ppDoc = await db.collection('users').doc(appt.patient_id).get();
        const dpDoc = await db.collection('users').doc(appt.doctor_id).get();

        if (ppDoc.exists && dpDoc.exists) {
          const patient = ppDoc.data();
          const doctor = dpDoc.data();

          const template = emailTemplates.reminder1Hour(
            patient.full_name,
            doctor.full_name,
            appt.appointment_date,
            appt.appointment_time
          );

          await sendEmail({
            to: patient.email,
            subject: template.subject,
            html: template.html
          });

          await db.collection('appointments').doc(doc.id).update({
            reminder_1h_sent: true
          });
          console.log(`⏰ 1-hour reminder sent to ${patient.email} for appt ${appt.id}`);
        }
      }
    } catch (error) {
      console.error('❌ Cron Job Error:', error);
    }
  });
};

module.exports = { startCronJobs };
