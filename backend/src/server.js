require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time queue updates
const wss = new WebSocketServer({ server });
const clients = new Map(); // userId => ws

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost`);
    const userId = url.searchParams.get('userId');
    if (userId) {
        clients.set(userId, ws);
        console.log(`🔌 WS connected: user ${userId}`);
    }
    ws.on('close', () => {
        if (userId) clients.delete(userId);
    });
});

// Broadcast to specific user
const notifyUser = (userId, payload) => {
    const ws = clients.get(userId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
    }
};

// Broadcast to all
const broadcastAll = (payload) => {
    clients.forEach((ws) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    });
};

// Attach to app for use in routes if needed
app.locals.notifyUser = notifyUser;
app.locals.broadcastAll = broadcastAll;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: '🏥 Q Nirvana API is running', timestamp: new Date().toISOString() });
});

// PUBLIC disaster alert endpoint (no auth - from disaster.html page)
app.post('/api/disaster-alert', async (req, res) => {
    try {
        const { pickup_lat, pickup_lng, pickup_address, incident_type, incident_label, people_count, resources, description } = req.body;
        const { db } = require('./db/firebase');
        const { sendEmail, emailTemplates } = require('./services/emailService');

        // Save to emergency_requests collection so it appears in admin panel
        const ref = db.collection('emergency_requests').doc();
        const data = {
            id: ref.id,
            patient_id: 'disaster_public',
            patient_name: 'ESI-X Disaster Alert',
            pickup_address: pickup_address || 'Unknown',
            pickup_lat: parseFloat(pickup_lat) || 0,
            pickup_lng: parseFloat(pickup_lng) || 0,
            hospital_lat: 16.5449,
            hospital_lng: 81.5212,
            description: description || `Disaster: ${incident_label} — ${people_count} people affected`,
            status: 'requested',
            severity: 'critical',
            incident_type: incident_type || 'unknown',
            incident_label: incident_label || 'Unknown Incident',
            people_count: people_count || 0,
            esi_resources: resources || [],
            source: 'disaster_page',
            created_at: new Date().toISOString()
        };
        await ref.set(data);

        // Broadcast to all admin dashboards via WebSocket
        if (app.locals.broadcastAll) {
            app.locals.broadcastAll({ type: 'UPDATE_DASHBOARD', section: 'emergencies' });
        }

        // Get admin email from DB (first admin user)
        let adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
        try {
            const adminSnap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
            if (!adminSnap.empty) adminEmail = adminSnap.docs[0].data().email || adminEmail;
        } catch (e) { /* use fallback */ }

        // Send alert email to admin
        if (adminEmail && resources && resources.length > 0) {
            const location = { lat: parseFloat(pickup_lat) || 0, lng: parseFloat(pickup_lng) || 0, address: pickup_address || 'Unknown' };
            const tmpl = emailTemplates.disasterAlert(location, incident_label || 'Unknown', resources, people_count || 0);
            sendEmail({ to: adminEmail, subject: tmpl.subject, html: tmpl.html }).catch(console.error);
        }

        return res.status(201).json({ success: true, emergency_id: ref.id, message: 'Disaster alert dispatched to hospital!' });
    } catch (err) {
        console.error('Disaster alert error:', err);
        return res.status(500).json({ success: false, message: 'Failed to dispatch alert' });
    }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patient', require('./routes/patient'));
app.use('/api/doctor', require('./routes/doctor'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/emergency', require('./routes/emergency'));
app.use('/api/driver', require('./routes/driver'));

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`\n🏥 Q Nirvana Backend running on PORT ${PORT}`);
    console.log(`📡 WebSocket server active`);
    console.log(`🌐 API: http://localhost:${PORT}/api/health\n`);

    // Start background queue jobs (e.g. Appointment reminders via Bull/Redis)
    const { cleanQueueOnStartup } = require('./services/queueService');
    const { startCronJobs } = require('./services/cronService');

    cleanQueueOnStartup();
    startCronJobs();
});
