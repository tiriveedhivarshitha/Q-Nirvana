import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { Activity, Clock, Users, AlertTriangle, RefreshCw } from 'lucide-react';



export default function QueueStatus() {
    const { user } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [queueStatus, setQueueStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadAppointments();

        // Real-time updates via WebSocket
        const wsUrl = `ws://localhost:5000?userId=${user?.id || 'patient'}`;
        let ws;

        const connectWS = () => {
            ws = new WebSocket(wsUrl);
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'UPDATE_DASHBOARD') {
                        console.log('🔄 Queue status update received');
                        // Reload data after a short delay to ensure DB consistency
                        setTimeout(() => {
                            if (selectedAppt) loadQueue(selectedAppt.id);
                            loadAppointments(false);
                        }, 500);
                    }
                } catch (err) { }
            };
            ws.onclose = () => setTimeout(connectWS, 5000);
        };
        connectWS();

        return () => { if (ws) ws.close(); };
    }, [selectedAppt?.id]);

    const loadAppointments = async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        try {
            const res = await api.get('/patient/appointments');
            const allAppts = res.data.appointments || [];
            // 'waiting' is the correct backend status for queued patients
            const active = allAppts.filter(a =>
                ['scheduled', 'waiting', 'in_progress'].includes(a.status)
            );
            setAppointments(active);
            if (active.length > 0 && !selectedAppt) {
                setSelectedAppt(active[0]);
                loadQueue(active[0].id);
            }
        } catch (e) {
            console.error('Failed to load appointments:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadQueue = async (apptId) => {
        setRefreshing(true);
        try {
            const res = await api.get(`/patient/queue-status/${apptId}`);
            setQueueStatus(res.data.queueStatus);
        } catch (e) {
            // Queue not yet created
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) return (
        <div className="page-loader">
            <div className="spinner spinner-dark" />
            <p className="text-muted">Loading queue status…</p>
        </div>
    );

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h2 className="section-title">My Queue Status</h2>
                <p className="section-sub">Real-time position in the OPD queue</p>
            </div>

            {appointments.length === 0 ? (
                <div className="card" style={{ padding: '60px 36px', textAlign: 'center' }}>
                    <Activity size={48} color="var(--slate-300)" style={{ margin: '0 auto 16px' }} />
                    <h3 style={{ color: 'var(--slate-700)', marginBottom: 8 }}>No Active Queue</h3>
                    <p style={{ color: 'var(--slate-500)', marginBottom: 20 }}>You have no active appointments in queue. Book an OPD to see your queue status.</p>
                    <a href="/patient/book-opd" className="btn btn-primary">Book Appointment</a>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
                    {/* Appointment selector */}
                    <div>
                        {appointments.map(a => (
                            <div key={a.id}
                                onClick={() => { setSelectedAppt(a); loadQueue(a.id); }}
                                style={{
                                    padding: '14px 16px', cursor: 'pointer', marginBottom: 10,
                                    borderRadius: 12, border: `2px solid ${selectedAppt?.id === a.id ? 'var(--navy-500)' : 'var(--slate-200)'}`,
                                    background: selectedAppt?.id === a.id ? '#eff6ff' : 'white',
                                    transition: 'all 0.2s',
                                }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>Dr. {a.doctor_name}</div>
                                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{a.appointment_date} at {a.appointment_time}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <div>
                                        <span className={`badge badge-${a.status === 'in_progress' ? 'green' : 'blue'}`} style={{ marginRight: a.reschedule_count >= 1 ? 8 : 0 }}>
                                            {a.status?.replace('_', ' ')}
                                        </span>
                                        {a.reschedule_count >= 1 && (
                                            <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                                Rescheduled
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Queue display */}
                    <div>
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
                                <p style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 8 }}>Your Queue Number</p>
                                <div style={{
                                    width: 120, height: 120, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--navy-800), var(--navy-500))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 20px', fontSize: 48, fontWeight: 900, color: 'white',
                                    boxShadow: '0 8px 30px rgba(37,99,235,0.35)',
                                }}>
                                    {queueStatus?.position || selectedAppt?.queue_position || '—'}
                                </div>
                                {selectedAppt?.reschedule_count >= 1 && (
                                    <div style={{ marginBottom: 20, color: '#d97706', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <RefreshCw size={14} /> Rescheduled Appointment
                                    </div>
                                )}
                                {queueStatus ? (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 16 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--slate-900)' }}>{queueStatus.patients_ahead}</div>
                                                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>Ahead of you</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal-600)' }}>{queueStatus.estimated_wait_minutes}</div>
                                                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>Est. wait (min)</div>
                                            </div>
                                        </div>
                                        {queueStatus.patients_ahead <= 2 && (
                                            <div className="alert alert-warning" style={{ marginBottom: 0 }}>
                                                <AlertTriangle size={16} />
                                                <span><strong>Almost your turn!</strong> Please proceed to the OPD waiting area now.</span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-muted">Queue position will appear after check-in</p>
                                )}
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
                                    <button className="btn btn-outline btn-sm" onClick={() => loadQueue(selectedAppt.id)} disabled={refreshing}>
                                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                                        Refresh Status
                                    </button>
                                    {selectedAppt?.status !== 'in_progress' && selectedAppt?.status !== 'completed' && selectedAppt?.status !== 'cancelled' && (
                                        <Link
                                            to={selectedAppt.reschedule_count >= 1 ? '#' : `/patient/book-opd?doctor_id=${selectedAppt.doctor_id}&reschedule_id=${selectedAppt.id}`}
                                            onClick={(e) => {
                                                if (selectedAppt.reschedule_count >= 1) {
                                                    e.preventDefault();
                                                    toast.error('Rescheduling is limited to once per appointment.');
                                                }
                                            }}
                                            className={`btn btn-sm ${selectedAppt.reschedule_count >= 1 ? 'btn-ghost' : 'btn-primary'}`}
                                            title={selectedAppt.reschedule_count >= 1 ? "Already rescheduled once" : "Free Reschedule"}
                                            style={{ opacity: selectedAppt.reschedule_count >= 1 ? 0.5 : 1, cursor: selectedAppt.reschedule_count >= 1 ? 'not-allowed' : 'pointer' }}
                                        >
                                            Reschedule
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
