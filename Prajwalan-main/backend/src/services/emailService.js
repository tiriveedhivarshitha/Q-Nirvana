const nodemailer = require('nodemailer');
const moment = require('moment-timezone');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('❌ CRITICAL ERROR: EMAIL_USER or EMAIL_PASS environment variables are missing.');
  console.error('❌ Email service cannot be initialized. Add them to your .env file.');
  // Failing safely - Do not interrupt app startup, but warn loudly that emails will fail
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

console.log(`📧 Email service initialized for: ${process.env.EMAIL_USER || 'MISSING_USER'}`);

const sendEmail = async ({ to, subject, html, attachments }, retryCount = 0) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Failed to send email: Missing EMAIL_USER or EMAIL_PASS environment variables.');
    return { success: false, error: 'Email configuration is missing' };
  }

  // Fire and forget mechanism to prevent blocking user flow
  const attemptSend = async () => {
    try {
      const mailOptions = {
        from: `"Q Nirvana Hospital" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      };
      if (attachments) {
        mailOptions.attachments = attachments;
      }
      const info = await transporter.sendMail(mailOptions);
      console.log(`📧 Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ Email send error (Attempt ${retryCount + 1}):`, err.message);
      if (retryCount < 2) {
        console.log(`⏳ Retrying email to ${to} in 5 seconds...`);
        await new Promise(res => setTimeout(res, 5000));
        return sendEmail({ to, subject, html }, retryCount + 1);
      } else {
        // Log to database on final failure
        try {
          const { db } = require('../db/firebase');
          await db.collection('email_failures').add({
            to,
            subject,
            error: err.message,
            failed_at: new Date().toISOString(),
          });
          console.log(`📝 Logged email failure to database for ${to}`);
        } catch (dbErr) {
          console.error('❌ Failed to log email error to DB:', dbErr.message);
        }
        return { success: false, error: err.message };
      }
    }
  };

  if (retryCount === 0) {
    // Return immediately to not block user flow, but run the promise
    attemptSend().catch(console.error);
    return { success: true, message: 'Email queued for sending' };
  } else {
    // Being called from a retry, return the promise
    return attemptSend();
  }
};


const emailTemplates = {
  welcomeIST: (name, role) => {
    const timeIST = moment().tz('Asia/Kolkata').format('DD MMM YYYY, hh:mm A');
    return {
      subject: 'Welcome to Q Nirvana Hospital Management System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #1e40af;">Welcome, ${name}! 🎉</h2>
          <p>Your account has been successfully created.</p>
          <p><strong>Role:</strong> ${role}</p>
          <p><strong>Registration Date & Time (IST):</strong> ${timeIST}</p>
          <p>Thank you for joining Q Nirvana!</p>
        </div>
      `,
    };
  },

  appointmentReminder: (name, doctorName, date, timeUTC) => {
    // Time must be IST
    const timeIST = moment(timeUTC).tz('Asia/Kolkata').format('hh:mm A');
    return {
      subject: '⏳ Appointment Reminder - Q Nirvana',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #f59e0b;">Upcoming Appointment!</h2>
          <p>Dear ${name}, this is a reminder that your appointment starts in 20 minutes.</p>
          <p><strong>Doctor:</strong> Dr. ${doctorName}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${timeIST} (IST)</p>
          <p>Please log in to your dashboard to join the meeting or check hospital details.</p>
        </div>
      `,
    };
  },

  doctorDeclined: (name, doctorName, date, timeUTC, reason) => {
    return {
      subject: '❌ Appointment Declined - Q Nirvana',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #dc2626;">Appointment Declined</h2>
          <p>Dear ${name}, Dr. ${doctorName} has declined your appointment originally scheduled for ${date}.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please log in to your dashboard to rebook the appointment with another available slot or doctor.</p>
        </div>
      `,
    };
  },

  appointmentCompleted: (name, doctorName, timeUTC) => {
    const timeIST = moment(timeUTC).tz('Asia/Kolkata').format('DD MMM YYYY, hh:mm A');
    return {
      subject: '✅ Appointment Completed - Q Nirvana',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #10b981;">Appointment Completed</h2>
          <p>Dear ${name}, your appointment with Dr. ${doctorName} is now complete.</p>
          <p><strong>Completed At (IST):</strong> ${timeIST}</p>
          <p>If the doctor provided a prescription, you can download it from your dashboard.</p>
          <p>We'd love to hear your feedback! <a href="http://localhost:5173/patient/settings">Click here to submit feedback</a>.</p>
        </div>
      `,
    };
  },

  welcome: (name) => ({
    subject: 'Welcome to Q Nirvana Hospital Management System',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%); border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 30px;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">🏥 Q Nirvana</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 16px;">Hospital Management System</p>
        </div>
        <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1e293b; margin: 0 0 16px;">Welcome, ${name}! 🎉</h2>
          <p style="color: #475569; line-height: 1.6;">Your account has been successfully created. You now have access to our comprehensive hospital management platform.</p>
        </div>
      </div>
    `,
  }),

  appointmentConfirmation: (name, doctorName, date, time, queueNumber, qrCodeBase64) => {
    const attachments = [];
    let qrCodeImgHtml = '';

    if (qrCodeBase64) {
      const base64Data = qrCodeBase64.split('base64,')[1];
      if (base64Data) {
        attachments.push({
          filename: 'qrcode.png',
          content: base64Data,
          encoding: 'base64',
          cid: 'qrcode-img'
        });
        qrCodeImgHtml = `<img src="cid:qrcode-img" alt="Appointment QR Code" style="width: 200px; height: 200px; border-radius: 8px; border: 2px solid #e2e8f0;" />`;
      }
    }

    return {
      subject: 'OPD Appointment Confirmed - Q Nirvana',
      attachments,
      html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%); border-radius: 16px; padding: 40px; text-align: center; margin-bottom: 30px;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🏥 Q Nirvana</h1>
        </div>
        <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1e293b; margin: 0 0 8px;">Appointment Confirmed ✅</h2>
          <p style="color: #475569;">Dear <strong>${name}</strong>, your OPD appointment has been booked.</p>
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div><span style="color: #6b7280;">Doctor:</span> <strong style="color: #1e293b;">Dr. ${doctorName}</strong></div>
              <div><span style="color: #6b7280;">Date:</span> <strong style="color: #1e293b;">${date}</strong></div>
              <div><span style="color: #6b7280;">Time:</span> <strong style="color: #1e293b;">${time}</strong></div>
              <div><span style="color: #6b7280;">Queue Number:</span> <strong style="color: #1e40af; font-size: 20px;">#${queueNumber}</strong></div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #1e293b; font-weight: bold;">Present this QR at appointment time.</p>
            ${qrCodeImgHtml}
          </div>
        </div>
      </div>
    `
    };
  },

  queueAlert: (name, minutesLeft) => ({
    subject: `⏰ Your Turn in ${minutesLeft} Minutes - Q Nirvana`,
    html: `<p>Almost Your Turn, ${name}!</p>`,
  }),

  emergencyAlert: (name, type) => ({
    subject: '🚨 Emergency Alert - Q Nirvana',
    html: `<p>Emergency declared for ${name}.</p>`,
  }),

  disasterAlert: (location, incidentLabel, resources, peopleCount) => {
    const mapsUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    const resourceRows = resources.map(r =>
      `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #fee2e2;font-size:14px">${r.icon} ${r.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #fee2e2;font-size:14px;font-weight:700;color:#dc2626;text-align:right">${r.qty} ${r.unit}</td>
      </tr>`
    ).join('');
    return {
      subject: '🚨 DISASTER ALERT — ESI-X Dispatch Notification — Q Nirvana',
      html: `
        <div style="font-family:'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:2px solid #ef4444">
          <div style="background:linear-gradient(135deg,#b91c1c,#e63946);padding:28px 32px;text-align:center">
            <div style="font-size:48px;margin-bottom:8px">🚨</div>
            <h1 style="color:white;margin:0;font-size:24px;font-weight:800">DISASTER ALERT — IMMEDIATE ACTION</h1>
            <p style="color:rgba(255,255,255,0.85);margin-top:8px;font-size:14px">ESI-X Emergency Severity Intelligence · Q Nirvana Hospital</p>
          </div>
          <div style="padding:32px">
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:24px">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px">📍 Accident Location</p>
              <p style="margin:0;font-size:15px;color:#1e293b;font-weight:600">${location.address}</p>
              <p style="margin:6px 0 0;font-size:12px;color:#64748b">Coordinates: ${location.lat}, ${location.lng}</p>
              <a href="${mapsUrl}" style="display:inline-block;margin-top:12px;background:#3b82f6;color:white;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">🗺️ View on Google Maps</a>
            </div>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Incident Type</p>
              <p style="margin:0;font-size:16px;color:#1e293b;font-weight:700">${incidentLabel}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#64748b">People Affected: <strong style="color:#1e293b">${peopleCount}</strong></p>
            </div>
            <h3 style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:700">🧰 ESI Resource Requirements</h3>
            <table style="width:100%;border-collapse:collapse;border:1px solid #fecaca;border-radius:10px;overflow:hidden">
              <thead><tr style="background:#fef2f2">
                <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px">Resource</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px">Units Required</th>
              </tr></thead>
              <tbody>${resourceRows}</tbody>
            </table>
            <p style="margin:24px 0 0;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px">This alert was generated by ESI-X Disaster Intelligence. Log in to the <strong>Q Nirvana Admin Dashboard → Emergencies</strong> to view full dispatch details.</p>
          </div>
        </div>
      `,
    };
  },

  twoFactorOtp: (name, otp, purpose) => {
    const purposeText = {
      'login': 'Security Login',
      'setup': 'Secure Setup',
      'disable': 'Security Disable',
      'registration': 'Email Verification'
    }[purpose] || 'Verification';

    return {
      subject: `🔐 Your Q Nirvana ${purposeText} Code: ${otp}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #1e40af; margin: 0; font-size: 24px; font-weight: 800;">🏥 Q Nirvana</h1>
              <p style="color: #64748b; margin-top: 8px; font-size: 14px;">Hospital Management System security</p>
            </div>
            
            <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px; text-align: center;">${purposeText}</h2>
            <p style="color: #475569; line-height: 1.6; margin-bottom: 24px;">Hi ${name},<br>Use the verification code below to complete your ${purposeText.toLowerCase()}.</p>
            
            <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e40af;">${otp}</span>
            </div>
            
            <p style="color: #64748b; font-size: 13px; text-align: center; margin-bottom: 32px;">This code will expire in <strong>5 minutes</strong>.<br>If you did not request this, please ignore this email or contact security.</p>
            
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 24px;">
            <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">© 2026 Q Nirvana Hospital Management System. All rights reserved.</p>
          </div>
        </div>
      `,
    };
  },

  emergencyConfirmation: (patientName, hospitalName, doctorName, roomNumber, eta) => {
    return {
      subject: '🚨 EMERGENCY CONFIRMED - Q Nirvana Hospital',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 25px; border: 3px solid #ef4444; border-radius: 12px;">
          <h2 style="color: #ef4444; text-align: center; margin-bottom: 20px;">🚨 Emergency Booking Confirmed</h2>
          <p>Dear ${patientName},</p>
          <p>Your emergency ICU booking has been successfully processed. Please proceed to the hospital immediately.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #ef4444;">
            <p><strong>Hospital:</strong> ${hospitalName}</p>
            <p><strong>ICU Room:</strong> ${roomNumber}</p>
            <p><strong>On-Duty Surgeon:</strong> ${doctorName}</p>
            <p><strong>Estimated Arrival:</strong> ${eta} minutes</p>
          </div>
          <p style="text-align: center; font-weight: bold; color: #ef4444;">AMBULANCE PROTOCOL INITIATED</p>
          <p style="font-size: 11px; color: #64748b; margin-top: 30px; text-align: center;">This is an automated emergency alert from the Q Nirvana Network.</p>
        </div>
      `,
    };
  },

  appointmentExpired: (name, doctorName, slotTime, rescheduleLink) => ({
    subject: 'Your Appointment Slot Has Expired – Please Reschedule',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #64748b; margin-top: 0;">Appointment Slot Expired ⏳</h2>
        <p>Dear <strong>${name}</strong>,</p>
        <p>Your appointment slot with <strong>Dr. ${doctorName}</strong> at <strong>${slotTime}</strong> has expired as it was not confirmed within the required 20-minute window.</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px dashed #cbd5e1;">
          <p style="margin: 0; color: #475569; font-size: 14px;">The slot has been released back to the available pool. Please use the button below to reschedule your visit.</p>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${rescheduleLink}" style="background: #1e40af; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Reschedule Appointment</a>
        </div>
        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #e2e8f0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">If you have any questions, contact our support at support@qnirvana.com</p>
      </div>
    `
  }),

  reminder1Hour: (name, doctorName, date, time) => ({
    subject: 'Reminder: Your Appointment is in 1 Hour - Q Nirvana',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1e40af; margin: 0; font-size: 24px;">🏥 Q Nirvana</h1>
        </div>
        <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px; text-align: center;">Appointment Reminder</h2>
        <p style="color: #475569; line-height: 1.6;">Hi ${name}, this is a reminder that your appointment with <strong>Dr. ${doctorName}</strong> is scheduled in <strong>1 hour</strong>.</p>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <div style="margin-bottom: 12px;"><span style="color: #64748b;">Date:</span> <strong style="color: #1e293b;">${date}</strong></div>
          <div style="margin-bottom: 12px;"><span style="color: #64748b;">Time:</span> <strong style="color: #1e293b;">${time}</strong></div>
          <div style="margin-bottom: 12px;"><span style="color: #64748b;">Location:</span> <strong style="color: #1e293b;">Main Block, 2nd Floor, Q Nirvana Hospital</strong></div>
          <div><span style="color: #64748b;">Support:</span> <strong style="color: #1e293b;">+91 98765 43210</strong></div>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">Please arrive 10 minutes early for check-in. If you need to reschedule, please visit your dashboard.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">© 2026 Q Nirvana Hospital. Main Street, Bhimavaram.</p>
      </div>
    `
  }),
};

module.exports = { sendEmail, emailTemplates };
