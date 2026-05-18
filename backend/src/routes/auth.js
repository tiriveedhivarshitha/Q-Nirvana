const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../db/firebase');
const { sendEmail, emailTemplates } = require('../services/emailService');

const router = express.Router();

// Validation rules
const registerValidation = [
    body('full_name').trim().isLength({ min: 2 }).withMessage('Full name required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('mobile').matches(/^[0-9+]{10,15}$/).withMessage('Valid mobile number required (10-15 digits)'),
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
    body('role').isIn(['patient', 'doctor', 'admin', 'driver']).withMessage('Invalid role'),
];

const loginValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
];

// Helpers
const generateId = () => Math.random().toString(36).substr(2, 9);

// POST /api/auth/register
router.post('/register', registerValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { full_name, email, mobile, password, role, ...extra } = req.body;

    try {
        // Check if email already exists
        const emailCheck = await db.collection('users').where('email', '==', email).get();
        if (!emailCheck.empty) {
            return res.status(409).json({ success: false, message: 'the email is already is registred' });
        }

        // Check if mobile already exists
        const mobileCheck = await db.collection('users').where('mobile', '==', mobile).get();
        if (!mobileCheck.empty) {
            return res.status(409).json({ success: false, message: 'Mobile number already registered' });
        }

        const password_hash = await bcrypt.hash(password, 12);

        // Create user document
        const userRef = db.collection('users').doc();
        const userId = userRef.id;

        const userData = {
            id: userId,
            full_name,
            email,
            mobile,
            password_hash,
            role,
            is_verified: false,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await userRef.set(userData);

        // Create role-specific profile
        if (role === 'patient') {
            const { dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone } = extra;
            let age = null;
            if (dob) {
                const birthDate = new Date(dob);
                const today = new Date();
                age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            }

            await db.collection('patient_profiles').doc(userId).set({
                id: userId, // Using same ID as user for 1:1 mapping
                user_id: userId,
                dob: dob || null,
                age,
                gender: gender || null,
                blood_group: blood_group || null,
                address: address || null,
                emergency_contact_name: emergency_contact_name || null,
                emergency_contact_phone: emergency_contact_phone || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        } else if (role === 'doctor') {
            const { specialization, license_number, department, qualification, experience_years } = extra;
            await db.collection('doctor_profiles').doc(userId).set({
                id: userId,
                user_id: userId,
                specialization: specialization || 'General',
                license_number: license_number || `LIC-${Date.now()}`,
                department: department || null,
                qualification: qualification || null,
                experience_years: experience_years || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        } else if (role === 'driver') {
            const { vehicle_number, license_number } = extra;
            await db.collection('driver_profiles').doc(userId).set({
                id: userId,
                user_id: userId,
                vehicle_number: vehicle_number || `AMB-${Date.now()}`,
                license_number: license_number || `DL-${Date.now()}`,
                status: 'available',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }

        // MANDATORY REGISTRATION OTP FOR ALL (Requirement 5)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await db.collection('otp_store').doc(userId).set({
            otp_hash: otpHash,
            expiresAt,
            purpose: 'registration',
            email,
            userId,
            attempts: 0
        });

        const tmplOTP = emailTemplates.twoFactorOtp(full_name, otp, 'registration');
        sendEmail({ to: email, subject: tmplOTP.subject, html: tmplOTP.html }).catch(console.error);

        return res.status(201).json({
            success: true,
            requires_verification: true,
            user_id: userId,
            message: 'OTP sent to your email for verification.'
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log(`🔍 Login attempt for: ${email}`);

    try {
        const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();

        if (snapshot.empty) {
            console.warn(`❌ User not found: ${email}`);
            return res.status(401).json({ success: false, message: 'wrong password or the email' });
        }

        // Fix: Ensure user object has ID even if not in document data
        const userDocData = snapshot.docs[0].data();
        const user = { ...userDocData, id: snapshot.docs[0].id };

        console.log(`✅ User found: ${user.email}, role: ${user.role}`);

        if (!user.is_active) {
            console.warn(`⚠️ User inactive: ${email}`);
            return res.status(403).json({ success: false, message: 'Account is deactivated' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'wrong password or the email' });
        }

        // Check 2FA (for all roles now - Requirement 4)
        if (user.two_fa_enabled && user.two_fa_email) {
            // Check for temporary lockout (Requirement 2/4)
            // Note: Removed orderBy to avoid mandatory index requirement
            const securityDocs = await db.collection('security_logs')
                .where('userId', '==', user.id)
                .where('type', '==', 'LOCKOUT_TEN_MINS')
                .get();

            if (!securityDocs.empty) {
                // Find most recent manually
                const logs = securityDocs.docs.map(d => d.data());
                const lastLock = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

                const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
                if (new Date(lastLock.timestamp) > tenMinsAgo) {
                    return res.status(403).json({ success: false, message: 'Account locked for 10 minutes due to multiple failed attempts.' });
                }
            }

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = await bcrypt.hash(otp, 10);
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            await db.collection('otp_store').doc(user.id).set({
                otp_hash: otpHash,
                expiresAt,
                purpose: 'login',
                email: user.two_fa_email,
                userId: user.id,
                attempts: 0
            });

            const tmpl = emailTemplates.twoFactorOtp(user.full_name, otp, 'login');
            sendEmail({ to: user.two_fa_email, subject: tmpl.subject, html: tmpl.html }).catch(console.error);

            return res.json({
                success: true,
                requires_2fa: true,
                two_fa_email: user.two_fa_email.replace(/(.{2})(.+)(@.+)/, '$1***$3'),
                user_id: user.id,
                message: `OTP sent to ${user.two_fa_email.replace(/(.{2})(.+)(@.+)/, '$1***$3')}`
            });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        });

        return res.json({
            success: true,
            token,
            user: { ...user, password_hash: undefined },
        });
    } catch (err) {
        console.error('Login error detail:', err);
        return res.status(500).json({ success: false, message: 'Server error during login. Please try again later.' });
    }
});

// POST /api/auth/verify-login-otp - verify OTP during login
router.post('/verify-login-otp', async (req, res) => {
    const { user_id, otp } = req.body;
    if (!user_id || !otp) return res.status(400).json({ success: false, message: 'user_id and otp required' });

    try {
        const otpDoc = await db.collection('otp_store').doc(user_id).get();
        if (!otpDoc.exists) return res.status(400).json({ success: false, message: 'OTP expired or not found' });

        const stored = otpDoc.data();
        if (stored.purpose !== 'login') return res.status(400).json({ success: false, message: 'Invalid OTP purpose' });

        // Limit attempts (3 tries)
        if (stored.attempts >= 3) {
            await db.collection('otp_store').doc(user_id).delete();
            await db.collection('security_logs').add({
                userId: user_id, type: 'OTP_BRUTE_FORCE_PREVENTION',
                message: '3 failed OTP attempts during login',
                timestamp: new Date().toISOString()
            });
            return res.status(403).json({ success: false, message: 'Too many attempts. Please request a new code.' });
        }

        if (new Date() > new Date(stored.expiresAt)) {
            await db.collection('otp_store').doc(user_id).delete();
            return res.status(400).json({ success: false, message: 'OTP has expired. Please log in again.' });
        }

        const isMatch = await bcrypt.compare(otp.trim(), stored.otp_hash);
        if (!isMatch) {
            const newAttempts = (stored.attempts || 0) + 1;
            await db.collection('otp_store').doc(user_id).update({ attempts: newAttempts });

            if (newAttempts >= 3) {
                await db.collection('security_logs').add({
                    userId: user_id,
                    type: 'LOCKOUT_TEN_MINS',
                    message: `3 failed OTP attempts. Account locked for 10 mins.`,
                    timestamp: new Date().toISOString()
                });
                return res.status(403).json({ success: false, message: '3 failed attempts. Account locked for 10 minutes.' });
            }
            return res.status(400).json({ success: false, message: `Incorrect OTP. ${3 - newAttempts} attempts left.` });
        }

        // OTP valid – delete it, return token
        await db.collection('otp_store').doc(user_id).delete();

        const userDoc = await db.collection('users').doc(user_id).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User no longer exists' });

        const user = { ...userDoc.data(), id: userDoc.id };

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        });

        return res.json({
            success: true,
            token,
            user: { ...user, password_hash: undefined },
        });
    } catch (err) {
        console.error('OTP verify error:', err);
        return res.status(500).json({ success: false, message: 'Server error during verification' });
    }
});

// ─── START GENERIC 2FA ENDPOINTS (SETTINGS) ───

// POST /api/auth/setup-send-otp - send OTP to NEW email being set up
router.post('/setup-send-otp', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await db.collection('otp_store').doc(decoded.id).set({
            otp_hash: otpHash,
            expiresAt,
            purpose: 'setup',
            email,
            userId: decoded.id,
            attempts: 0
        });

        const userDoc = await db.collection('users').doc(decoded.id).get();
        const tmpl = emailTemplates.twoFactorOtp(userDoc.data().full_name, otp, 'setup');
        await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html });

        return res.json({ success: true, message: `OTP sent to ${email}` });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

// POST /api/auth/verify-setup - verify OTP and enable 2FA
router.post('/verify-setup', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { otp } = req.body;

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const otpDoc = await db.collection('otp_store').doc(decoded.id).get();
        if (!otpDoc.exists) return res.status(400).json({ success: false, message: 'OTP expired or not found' });

        const stored = otpDoc.data();
        if (stored.purpose !== 'setup') return res.status(400).json({ success: false, message: 'Invalid OTP' });

        // Implementation of retry limit (Max 3 attempts)
        if ((stored.attempts || 0) >= 3) {
            return res.status(403).json({ success: false, message: 'Maximum retry attempts reached. Please request a new code.' });
        }

        const isMatch = await bcrypt.compare(otp.trim(), stored.otp_hash);
        if (!isMatch) {
            const newAttempts = (stored.attempts || 0) + 1;
            await db.collection('otp_store').doc(decoded.id).update({ attempts: newAttempts });
            return res.status(400).json({ success: false, message: `Incorrect OTP. ${3 - newAttempts} attempts remaining.` });
        }

        // Update user
        await db.collection('users').doc(decoded.id).update({
            two_fa_enabled: true,
            two_fa_email: stored.email,
            updated_at: new Date().toISOString()
        });

        await db.collection('otp_store').doc(decoded.id).delete();
        return res.json({ success: true, message: 'Two-Step Verification enabled successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// POST /api/auth/disable-send-otp - request OTP to disable existing 2FA
router.post('/disable-send-otp', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userDoc = await db.collection('users').doc(decoded.id).get();
        const user = userDoc.data();
        if (!user.two_fa_enabled || !user.two_fa_email) return res.status(400).json({ success: false, message: '2FA not enabled' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await db.collection('otp_store').doc(decoded.id).set({
            otp_hash: otpHash,
            expiresAt,
            purpose: 'disable',
            email: user.two_fa_email,
            userId: decoded.id,
            attempts: 0
        });

        const tmpl = emailTemplates.twoFactorOtp(user.full_name, otp, 'disable');
        await sendEmail({ to: user.two_fa_email, subject: tmpl.subject, html: tmpl.html });

        return res.json({ success: true, message: 'OTP sent to your 2FA email' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed' });
    }
});

// POST /api/auth/verify-disable
router.post('/verify-disable', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { otp } = req.body;

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const otpDoc = await db.collection('otp_store').doc(decoded.id).get();
        if (!otpDoc.exists) return res.status(400).json({ success: false, message: 'OTP expired' });

        const stored = otpDoc.data();
        if (stored.purpose !== 'disable') return res.status(400).json({ success: false, message: 'Invalid OTP' });

        // Implementation of retry limit (Max 3 attempts)
        if ((stored.attempts || 0) >= 3) {
            return res.status(403).json({ success: false, message: 'Maximum retry attempts reached. Please request a new code.' });
        }

        const isMatch = await bcrypt.compare(otp.trim(), stored.otp_hash);
        if (!isMatch) {
            const newAttempts = (stored.attempts || 0) + 1;
            await db.collection('otp_store').doc(decoded.id).update({ attempts: newAttempts });
            return res.status(400).json({ success: false, message: `Incorrect OTP. ${3 - newAttempts} attempts remaining.` });
        }

        await db.collection('users').doc(decoded.id).update({
            two_fa_enabled: false,
            two_fa_email: null
        });

        await db.collection('otp_store').doc(decoded.id).delete();
        return res.json({ success: true, message: 'Two-Step Verification disabled' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// POST /api/auth/verify-registration-otp - unified registration handler
router.post('/verify-registration-otp', async (req, res) => {
    const { user_id, otp } = req.body;
    if (!user_id || !otp) return res.status(400).json({ success: false, message: 'User ID and OTP required' });

    try {
        const otpDoc = await db.collection('otp_store').doc(user_id).get();
        if (!otpDoc.exists) return res.status(400).json({ success: false, message: 'OTP expired or not found' });

        const stored = otpDoc.data();
        if (stored.purpose !== 'registration') return res.status(400).json({ success: false, message: 'Invalid OTP purpose' });

        if (new Date() > new Date(stored.expiresAt)) {
            await db.collection('otp_store').doc(user_id).delete();
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        const isMatch = await bcrypt.compare(otp.trim(), stored.otp_hash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Incorrect OTP' });

        // Mark user as verified
        await db.collection('users').doc(user_id).update({
            is_verified: true,
            updated_at: new Date().toISOString()
        });

        const userDoc = await db.collection('users').doc(user_id).get();
        const user = { ...userDoc.data(), id: userDoc.id };

        // Send welcome email now that they're verified
        const tmpl = emailTemplates.welcomeIST(user.full_name, user.role);
        sendEmail({ to: user.email, subject: tmpl.subject, html: tmpl.html }).catch(console.error);

        // Delete OTP
        await db.collection('otp_store').doc(user_id).delete();

        // Issue token
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        });

        return res.json({
            success: true,
            token,
            user: { ...user, password_hash: undefined }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userDoc = await db.collection('users').doc(decoded.id).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });

        const user = { ...userDoc.data(), id: userDoc.id };
        return res.json({ success: true, user: { ...user, password_hash: undefined } });
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

module.exports = router;

