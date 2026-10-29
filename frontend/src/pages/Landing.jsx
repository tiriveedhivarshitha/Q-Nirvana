import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Shield, Activity, Users, Zap, Award, ArrowRight, CheckCircle, MapPin, Navigation, X, Loader, Send } from 'lucide-react';

const FEATURES = [
    { icon: '🏥', title: 'Smart OPD Booking', desc: 'Book appointments with real-time doctor availability and queue tracking.' },
    { icon: '⚡', title: 'Live Queue Tracking', desc: 'Monitor your queue position and dynamic wait time in real-time.' },
    { icon: '🚑', title: 'Emergency Dispatch', desc: 'One-tap ambulance dispatch with Dijkstra\'s optimal route algorithm.' },
    { icon: '🩸', title: 'Blood Bank', desc: 'Real-time blood inventory management with instant request processing.' },
    { icon: '🛏️', title: 'Bed Management', desc: 'Track AC, ICU, ventilated beds with live occupancy status.' },
    { icon: '📋', title: 'Medical Records', desc: 'Secure, tamper-proof patient history accessible anytime.' },
];

const STATS = [
    { value: '10,000+', label: 'Patients Served' },
    { value: '99.9%', label: 'Uptime' },
    { value: '< 30s', label: 'Emergency Response' },
    { value: '4', label: 'User Roles' },
];

export default function LandingPage() {
    const [accidentModal, setAccidentModal] = useState(false);
    const [modalStep, setModalStep] = useState(1); // 1 = locate, 2 = send
    const [locating, setLocating] = useState(false);
    const [location, setLocation] = useState(null); // { lat, lng, address }
    const [nearestHospital, setNearestHospital] = useState(null);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleLocate = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                // Reverse geocode
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                    const data = await res.json();
                    setLocation({ lat, lng, address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
                } catch {
                    setLocation({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
                }

                // FETCH NEAREST HOSPITAL
                try {
                    const hRes = await fetch(`http://localhost:5000/api/emergency/hospitals?lat=${lat}&lng=${lng}`);
                    const hData = await hRes.json();
                    if (hData.success && hData.hospitals.length > 0) {
                        setNearestHospital(hData.hospitals[0]);
                    }
                } catch (err) {
                    console.error('Failed to fetch nearest hospital', err);
                }

                setLocating(false);
            },
            (err) => {
                setLocating(false);
                alert('Unable to retrieve location. Please allow location access and try again.');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleSendToHospital = async () => {
        if (!location) return;
        setSending(true);
        try {
            const res = await fetch('http://localhost:5000/api/patient/emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pickup_lat: location.lat,
                    pickup_lng: location.lng,
                    pickup_address: location.address,
                    description: 'Accident zone alert — sent from landing page',
                    severity: 'critical',
                }),
            });
            const data = await res.json();
            setSent(true);
        } catch (err) {
            alert('Failed to send alert. Please call 108 immediately.');
        } finally {
            setSending(false);
        }
    };

    const closeModal = () => { setAccidentModal(false); setLocation(null); setNearestHospital(null); setSent(false); setLocating(false); setModalStep(1); };
    return (
        <div style={{ minHeight: '100vh', fontFamily: 'Inter, sans-serif', background: 'var(--slate-50)' }}>
            {/* Navbar */}
            <nav style={{
                position: 'sticky', top: 0, zIndex: 100,
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--slate-200)',
                padding: '0 5%',
                height: '68px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <img src="/logo.png" alt="Q Nirvana Logo" style={{ width: '160%', height: '160%', objectFit: 'contain' }} />
                    </div>
                    <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy-800)', fontFamily: 'Space Grotesk' }}>Q Nirvana</span>
                        <span style={{ fontSize: 10, color: 'var(--slate-500)', display: 'block', lineHeight: 1, letterSpacing: '0.08em' }}>HOSPITAL MANAGEMENT</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <a href="/disaster.html" target="_blank" className="btn btn-sm" style={{ background: '#e63946', color: 'white', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 2s infinite' }}>
                        <span style={{ fontSize: '14px' }}>🚨 Accident Zone</span>
                    </a>
                    <Link to="/login" className="btn btn-outline btn-sm">Sign In</Link>
                    <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
                </div>
            </nav>

            {/* Hero */}
            <section style={{
                background: 'linear-gradient(135deg, var(--navy-900) 0%, #0f2044 50%, #0d2759 100%)',
                padding: '100px 5% 120px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative circles */}
                <div style={{ position: 'absolute', top: -80, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(37,99,235,0.1)', filter: 'blur(60px)' }} />
                <div style={{ position: 'absolute', bottom: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(13,148,136,0.12)', filter: 'blur(50px)' }} />

                <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>

                    <h1 style={{
                        fontSize: 'clamp(36px, 6vw, 64px)',
                        fontWeight: 800, color: 'white', lineHeight: 1.15,
                        margin: '0 0 24px', fontFamily: 'Space Grotesk',
                    }}>
                        Next-Generation<br />
                        <span style={{ background: 'linear-gradient(90deg,#2dd4bf,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Hospital Management
                        </span>
                    </h1>

                    <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', maxWidth: 580, margin: '0 auto 40px', lineHeight: 1.7 }}>
                        A secure, intelligent platform for patients, doctors, drivers, and administrators.
                        Powered by live queue algorithms and Dijkstra's routing.
                    </p>

                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/emergency" className="btn btn-xl" style={{
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            color: 'white',
                            border: 'none',
                            fontWeight: 800,
                            gap: 12,
                            padding: '0 32px',
                            boxShadow: '0 10px 25px rgba(220, 38, 38, 0.4)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 15px 30px rgba(220, 38, 38, 0.5)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 10px 25px rgba(220, 38, 38, 0.4)'; }}
                        >
                            <Shield color="white" size={24} />
                            EMERGENCY BOOKING
                        </Link>
                        <Link to="/register" className="btn btn-teal btn-xl" style={{ gap: 10 }}>
                            Start Now <ArrowRight size={18} />
                        </Link>
                        <Link to="/login" className="btn btn-outline btn-xl" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)' }}>
                            Sign In
                        </Link>
                    </div>



                    {/* Trust badges */}
                    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap' }}>
                        {['HIPAA Compliant', 'Encrypted Data', 'Real-time Alerts', '24/7 Emergency'].map(badge => (
                            <div key={badge} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                                <CheckCircle size={14} color="#2dd4bf" />
                                {badge}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section style={{ background: 'white', padding: '0', borderBottom: '1px solid var(--slate-200)' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', padding: '0' }}>
                    {STATS.map((s, i) => (
                        <div key={i} style={{
                            padding: '32px 24px',
                            textAlign: 'center',
                            borderRight: i < 3 ? '1px solid var(--slate-200)' : 'none'
                        }}>
                            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--navy-600)', fontFamily: 'Space Grotesk' }}>{s.value}</div>
                            <div style={{ fontSize: 13, color: 'var(--slate-500)', marginTop: 4 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section style={{ padding: '80px 5%', background: 'var(--slate-50)' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                        <h2 style={{ fontSize: 36, fontWeight: 800, color: 'var(--slate-900)', fontFamily: 'Space Grotesk', marginBottom: 12 }}>
                            Everything You Need
                        </h2>
                        <p style={{ fontSize: 16, color: 'var(--slate-500)', maxWidth: 500, margin: '0 auto' }}>
                            A comprehensive platform designed for every stakeholder in the healthcare ecosystem.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
                        {FEATURES.map((f, i) => (
                            <div key={i} style={{
                                background: 'white',
                                border: '1px solid var(--slate-200)',
                                borderRadius: 16,
                                padding: '28px 24px',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                                cursor: 'default',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                            >
                                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--slate-900)' }}>{f.title}</h3>
                                <p style={{ fontSize: 14, color: 'var(--slate-500)', lineHeight: 1.6 }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Roles */}
            <section style={{ padding: '80px 5%', background: 'white' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                        <h2 style={{ fontSize: 36, fontWeight: 800, color: 'var(--slate-900)', fontFamily: 'Space Grotesk', marginBottom: 12 }}>Four Powerful Dashboards</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20 }}>
                        {[
                            { role: 'Patient', icon: '👤', color: '#dbeafe', border: '#93c5fd', desc: 'Book OPD, track queue, blood bank, emergency bypass, family view.' },
                            { role: 'Doctor', icon: '🩺', color: '#ccfbf1', border: '#5eead4', desc: 'Manage live queue, record consultations, update availability.' },
                            { role: 'Admin', icon: '⚙️', color: '#ede9fe', border: '#c4b5fd', desc: 'Full oversight: beds, blood, staff, OPD assignment, audit logs.' },
                            { role: 'Driver', icon: '🚑', color: '#ffedd5', border: '#fdba74', desc: 'Accept emergencies, Dijkstra-optimized routes, status updates.' },
                        ].map(r => (
                            <div key={r.role} style={{ background: r.color, border: `1px solid ${r.border}`, borderRadius: 14, padding: '28px 22px' }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>{r.icon}</div>
                                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{r.role}</h3>
                                <p style={{ fontSize: 13, color: 'var(--slate-600)', lineHeight: 1.6 }}>{r.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section style={{
                background: 'linear-gradient(135deg, var(--navy-900), #0f2044)',
                padding: '80px 5%',
                textAlign: 'center'
            }}>
                <h2 style={{ fontSize: 36, fontWeight: 800, color: 'white', marginBottom: 16, fontFamily: 'Space Grotesk' }}>
                    Ready to Transform Healthcare?
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, marginBottom: 36, maxWidth: 500, margin: '0 auto 36px' }}>
                    Join Q Nirvana and experience the future of hospital management.
                </p>
                <Link to="/register" className="btn btn-teal btn-xl">
                    Create Your Account <ArrowRight size={18} />
                </Link>
            </section>

            {/* Footer */}
            <footer style={{ background: 'var(--navy-950)', padding: '24px 5%', textAlign: 'center' }}>
                <p style={{ color: 'var(--slate-500)', fontSize: 13 }}>
                    © 2026 Q Nirvana Hospital Management System
                </p>
            </footer>
            {/* Accident Zone Modal */}
            {accidentModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
                        {/* Header */}
                        <div style={{ background: 'linear-gradient(135deg, #b91c1c, #e63946)', padding: '20px 24px 16px', position: 'relative' }}>
                            <button onClick={closeModal} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} color="white" />
                            </button>
                            {/* Step indicator */}
                            {!sent && <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                                {[1, 2].map(s => (
                                    <div key={s} style={{ height: 4, borderRadius: 2, flex: 1, background: modalStep >= s ? 'white' : 'rgba(255,255,255,0.3)', transition: 'all 0.3s' }} />
                                ))}
                            </div>}
                            <div style={{ fontSize: 32, marginBottom: 6 }}>🚨</div>
                            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: 0 }}>
                                {sent ? 'Alert Sent!' : modalStep === 1 ? 'Step 1 — Share Your Location' : 'Step 2 — Send to Hospital'}
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                                {sent ? 'Help is on the way.' : modalStep === 1 ? 'We need your GPS location to dispatch help.' : 'Review your location and dispatch emergency services.'}
                            </p>
                        </div>

                        {/* Body */}
                        <div style={{ padding: 24 }}>
                            {/* SUCCESS screen */}
                            {sent ? (
                                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                    <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                                    <h3 style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>Alert Sent Successfully!</h3>
                                    <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>Emergency services have been notified. Help is on the way — stay calm and stay safe.</p>
                                    <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 10 }}>If urgent, also call <strong style={{ color: '#e63946' }}>108</strong></p>
                                    <button onClick={closeModal} style={{ marginTop: 20, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Close</button>
                                </div>

                                /* STEP 1 — Locate */
                            ) : modalStep === 1 ? (
                                <>
                                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: 18 }}>⚠️</span>
                                        <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}><strong>Location is required</strong> before sending alert. Please click "Locate Me" to capture your GPS.</p>
                                    </div>

                                    <div style={{ background: '#f8fafc', border: '2px dashed ' + (location ? '#22c55e' : '#cbd5e1'), borderRadius: 14, padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, minHeight: 72 }}>
                                        <MapPin size={22} color={location ? '#22c55e' : '#94a3b8'} />
                                        {location ? (
                                            <div>
                                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Location Captured</p>
                                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.4 }}>{location.address}</p>
                                                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>Lat: {location.lat.toFixed(5)}, Lng: {location.lng.toFixed(5)}</p>
                                            </div>
                                        ) : (
                                            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>No location yet. Click Locate Me below.</p>
                                        )}
                                    </div>

                                    <button onClick={handleLocate} disabled={locating}
                                        style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px solid #3b82f6', background: location ? '#f0fdf4' : 'white', color: location ? '#16a34a' : '#3b82f6', fontWeight: 700, fontSize: 15, cursor: locating ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, transition: 'all 0.2s' }}>
                                        {locating ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={18} />}
                                        {locating ? 'Getting your location...' : location ? '✓ Relocate Me' : 'Locate Me (Required)'}
                                    </button>

                                    <button onClick={() => setModalStep(2)} disabled={!location}
                                        style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: location ? '#1e40af' : '#e2e8f0', color: location ? 'white' : '#94a3b8', fontWeight: 800, fontSize: 15, cursor: location ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s' }}>
                                        <ArrowRight size={18} /> Next: Send to Hospital
                                    </button>
                                </>

                                /* STEP 2 — Send to Hospital */
                            ) : (
                                <>
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Your Location</p>
                                        <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{location?.address}</p>
                                    </div>

                                    {nearestHospital && (
                                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏥 Targeted Hospital (Nearest)</p>
                                            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e3a8a' }}>{nearestHospital.name}</p>
                                            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                                                <span style={{ fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Navigation size={12} /> {nearestHospital.distance} km away
                                                </span>
                                                <span style={{ fontSize: 12, color: nearestHospital.icu_beds_available > 0 ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Activity size={12} /> {nearestHospital.icu_beds_available} ICU Beds
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                                        <p style={{ margin: 0 }}>🚑 An ambulance will be dispatched from {nearestHospital?.name || 'the hospital'} to your GPS location immediately.</p>
                                    </div>

                                    <button onClick={handleSendToHospital} disabled={sending}
                                        style={{ width: '100%', padding: '18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #b91c1c, #e63946)', color: 'white', fontWeight: 800, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 24px rgba(230,57,70,0.45)', marginBottom: 12 }}>
                                        {sending ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />}
                                        {sending ? 'Dispatching...' : '🏥 Confirm — Send to Hospital'}
                                    </button>

                                    <button onClick={() => setModalStep(1)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                                        ← Back
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
