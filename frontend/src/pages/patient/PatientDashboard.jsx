import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Calendar, Bed, Droplets, FileText, Activity, ShieldAlert, Users, Clock, TrendingUp, Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PatientDashboard() {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [appointments, setAppointments] = useState([]);
    const [bloodBank, setBloodBank] = useState([]);
    const [beds, setBeds] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        try {
            const [p, a, bb, b] = await Promise.all([
                api.get('/patient/profile').catch(() => ({ data: {} })),
                api.get('/patient/appointments').catch(() => ({ data: { appointments: [] } })),
                api.get('/patient/blood-bank').catch(() => ({ data: { bloodBank: [] } })),
                api.get('/patient/beds').catch(() => ({ data: { summary: [] } })),
            ]);
            setProfile(p.data.profile);
            setAppointments(a.data.appointments || []);
            setBloodBank(bb.data.bloodBank || []);
            setBeds(b.data.summary || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const upcoming = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');
    const totalAvailBeds = beds.reduce((s, b) => s + parseInt(b.available || 0), 0);

    const QUICK_LINKS = [
        { label: 'Book OPD', icon: Calendar, to: '/patient/book-opd', color: 'blue', bg: '#dbeafe' },
        { label: 'My Queue', icon: Activity, to: '/patient/queue', color: '#0d9488', bg: '#ccfbf1' },
        { label: 'Beds & Rooms', icon: Bed, to: '/patient/beds', color: '#7c3aed', bg: '#ede9fe' },
        { label: 'Blood Bank', icon: Droplets, to: '/patient/blood-bank', color: '#dc2626', bg: '#fee2e2' },
        { label: 'My History', icon: FileText, to: '/patient/history', color: '#d97706', bg: '#fef3c7' },
        { label: 'Hospital Map', icon: MapPin, to: '/patient/blueprint', color: '#10b981', bg: '#d1fae5' },
        { label: 'Family Access', icon: Users, to: '/patient/family', color: '#0891b2', bg: '#cffafe' },
        { label: 'Emergency', icon: ShieldAlert, to: '/patient/emergency', color: '#dc2626', bg: '#fee2e2' },
    ];

    if (loading) {
        return (
            <div className="page-loader">
                <div className="spinner spinner-dark" style={{ width: 36, height: 36 }} />
                <p className="text-muted">Loading your dashboard…</p>
            </div>
        );
    }

    return (
        <div>
            {/* Welcome */}
            <div style={{
                background: 'linear-gradient(135deg, var(--navy-900), #0f2044)',
                borderRadius: 'var(--radius-xl)',
                padding: '32px 36px',
                marginBottom: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', filter: 'blur(40px)' }} />
                <div style={{ position: 'relative' }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 }}>Good day,</p>
                    <h2 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0 }}>{user?.full_name} 👋</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 6 }}>
                        {upcoming.length > 0
                            ? `You have ${upcoming.length} upcoming appointment${upcoming.length > 1 ? 's' : ''}`
                            : 'No upcoming appointments. Book one today!'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 16, flexShrink: 0, position: 'relative' }}>
                    {profile?.blood_group && (
                        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#f87171' }}>{profile.blood_group}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Blood Group</div>
                        </div>
                    )}
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#2dd4bf' }}>{upcoming.length}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Appointments</div>
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--slate-800)' }}>Quick Actions</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 14 }}>
                    {QUICK_LINKS.map(q => (
                        <Link key={q.label} to={q.to} style={{
                            background: 'white',
                            border: '1px solid var(--slate-200)',
                            borderRadius: 12,
                            padding: '20px 12px',
                            textAlign: 'center',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                            display: 'block',
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.borderColor = q.color; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--slate-200)'; }}
                        >
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: q.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                                <q.icon size={20} color={q.color} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-700)' }}>{q.label}</div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Stats row */}
            <div className="grid-4" style={{ marginBottom: 28 }}>
                <div className="stat-card">
                    <div className="stat-icon blue"><Calendar size={22} color="var(--navy-600)" /></div>
                    <div>
                        <div className="stat-label">Upcoming Appointments</div>
                        <div className="stat-value">{upcoming.length}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon teal"><Bed size={22} color="var(--teal-600)" /></div>
                    <div>
                        <div className="stat-label">Available Beds</div>
                        <div className="stat-value">{totalAvailBeds}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><Droplets size={22} color="var(--danger)" /></div>
                    <div>
                        <div className="stat-label">Blood Bank Total</div>
                        <div className="stat-value">{bloodBank.length > 0 ? bloodBank.reduce((s, b) => s + (Number(b.units_available) || 0), 0) : 0}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><FileText size={22} color="var(--success)" /></div>
                    <div>
                        <div className="stat-label">Total Consultations</div>
                        <div className="stat-value">{appointments.filter(a => a.status === 'completed').length}</div>
                    </div>
                </div>
            </div>

            {/* Upcoming Appointments & Blood Bank */}
            <div className="grid-2">
                {/* Appointments List */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Upcoming Appointments</div>
                            <div className="card-subtitle">Your scheduled OPD visits</div>
                        </div>
                        <Link to="/patient/book-opd" className="btn btn-primary btn-sm">+ Book</Link>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {upcoming.length === 0 ? (
                            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                                <Calendar size={40} color="var(--slate-300)" style={{ margin: '0 auto 12px' }} />
                                <p className="text-muted">No upcoming appointments</p>
                                <Link to="/patient/book-opd" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Book Now</Link>
                            </div>
                        ) : (
                            upcoming.slice(0, 5).map(a => {
                                const isExpired = a.status === 'expired';
                                const needsConfirmation = a.is_confirmed === false && !isExpired;

                                return (
                                    <div key={a.id} style={{ padding: '16px 24px', borderBottom: '1px solid var(--slate-100)', display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: isExpired ? '#f1f5f9' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Calendar size={18} color={isExpired ? '#94a3b8' : "var(--navy-600)"} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: isExpired ? '#94a3b8' : 'var(--slate-900)' }}>Dr. {a.doctor_name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{a.specialization} · {a.appointment_date} at {a.appointment_time}</div>
                                            {needsConfirmation && (
                                                <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={12} /> Confirm within 20 mins to avoid expiry
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                            <span className={`badge badge-${isExpired ? 'gray' : (a.status === 'in_queue' ? 'blue' : 'teal')}`}>
                                                {a.status?.replace('_', ' ')}
                                            </span>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {needsConfirmation && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await api.post(`/patient/appointments/${a.id}/confirm`);
                                                                toast.success('Appointment confirmed!');
                                                                load(); // refresh
                                                            } catch (e) { toast.error('Confirmation failed'); }
                                                        }}
                                                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'var(--success)', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                                                        Confirm
                                                    </button>
                                                )}
                                                {!isExpired && a.status !== 'completed' && a.status !== 'cancelled' && (
                                                    <Link to={`/patient/book-opd?doctor_id=${a.doctor_id}&reschedule_id=${a.id}`}
                                                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'var(--navy-600)', color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                                                        Reschedule
                                                    </Link>
                                                )}
                                                {isExpired && (
                                                    <Link to={`/patient/book-opd?doctor_id=${a.doctor_id}`}
                                                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'var(--slate-600)', color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                                                        Rebook
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Blood Bank Summary */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Blood Bank Status</div>
                            <div className="card-subtitle">Current availability</div>
                        </div>
                        <Link to="/patient/blood-bank" className="btn btn-outline btn-sm">View All</Link>
                    </div>
                    <div className="card-body" style={{ padding: '12px 24px' }}>
                        {bloodBank.length === 0 ? (
                            <p className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>Loading blood bank data…</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {bloodBank.map(b => {
                                    const units = Number(b.units_available) || 0;
                                    const level = units < 5 ? 'critical' : units < 15 ? 'low' : 'normal';
                                    const colors = { critical: '#fee2e2', low: '#fef3c7', normal: '#d1fae5' };
                                    const textColors = { critical: 'var(--danger)', low: '#b45309', normal: 'var(--success)' };
                                    const isUserGroup = profile?.blood_group === b.blood_group;
                                    return (
                                        <div key={b.blood_group} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 12px', borderRadius: 10,
                                            background: isUserGroup ? '#eff6ff' : colors[level],
                                            border: isUserGroup ? '1px solid var(--navy-300)' : `1px solid ${colors[level]}`,
                                            position: 'relative'
                                        }}>
                                            {isUserGroup && <span style={{ position: 'absolute', top: -10, right: 6, fontSize: 10, background: 'var(--navy-600)', color: 'white', padding: '2px 6px', borderRadius: 12 }}>Your Group</span>}
                                            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: isUserGroup ? 'var(--navy-600)' : textColors[level] }}>
                                                {b.blood_group}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 16, color: isUserGroup ? 'var(--navy-800)' : textColors[level] }}>{units}</div>
                                                <div style={{ fontSize: 11, color: isUserGroup ? 'var(--navy-600)' : textColors[level], opacity: 0.8 }}>units · {level}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
