import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
    ShieldAlert, MapPin, Truck, Activity,
    Clock, Calendar, Phone, CheckCircle,
    Navigation, User, MoreHorizontal, Filter, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const hospitalIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/4320/4320337.png',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
});

const patientIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
});

const MapFitter = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords && coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [coords, map]);
    return null;
};

export default function AdminEmergencies() {
    const { user } = useAuth();
    const [emergencies, setEmergencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [routeModal, setRouteModal] = useState(null);

    useEffect(() => {
        loadData();

        // Real-time updates via WebSocket
        const wsUrl = `ws://localhost:5000?userId=${user?.id || 'admin_emergencies'}`;
        let ws;

        const connectWS = () => {
            ws = new WebSocket(wsUrl);
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'UPDATE_DASHBOARD' && data.section === 'emergencies') {
                        console.log('🚨 Emergency alert received');
                        loadData();
                    }
                } catch (err) { }
            };
            ws.onclose = () => setTimeout(connectWS, 5000);
        };
        connectWS();

        return () => { if (ws) ws.close(); };
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/emergencies');
            setEmergencies(res.data.emergencies || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'requested': return { badge: 'badge-red pulse', label: 'CRITICAL REQUEST', color: 'var(--danger)' };
            case 'accepted': return { badge: 'badge-blue', label: 'DRIVER ASSIGNED', color: 'var(--navy-500)' };
            case 'en_route': return { badge: 'badge-orange', label: 'PICKUP IN PROGRESS', color: 'var(--orange-500)' };
            case 'picked_up': return { badge: 'badge-teal', label: 'PATIENT ON BOARD', color: 'var(--teal-600)' };
            case 'at_hospital': return { badge: 'badge-purple', label: 'ARRIVED AT HOSPITAL', color: 'var(--senior)' };
            case 'completed': return { badge: 'badge-green', label: 'MISSION COMPLETED', color: 'var(--success)' };
            default: return { badge: 'badge-gray', label: status.toUpperCase(), color: 'var(--slate-500)' };
        }
    };

    const filteredEmergencies = filter === 'all'
        ? emergencies
        : emergencies.filter(e => e.status === filter || (filter === 'active' && !['completed', 'cancelled'].includes(e.status)));

    return (
        <div>
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="section-title">Emergency Command Center</h2>
                    <p className="section-sub">Oversight of all critical fleet movements and patient dispatches</p>
                </div>
                <div className="flex gap-4">
                    <div className="stat-label">Active Missions: <strong>{emergencies.filter(e => !['completed', 'cancelled'].includes(e.status)).length}</strong></div>
                    <button className="btn btn-danger btn-sm pulse" onClick={loadData}><Activity size={14} /> Refresh Feed</button>
                </div>
            </div>

            <div className="card mb-8">
                <div className="card-body flex gap-6 items-center">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                        <button
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === 'all' ? 'bg-white shadow-sm text-navy' : 'text-slate-500'}`}
                            onClick={() => setFilter('all')}
                        >All Missions</button>
                        <button
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === 'active' ? 'bg-white shadow-sm text-danger' : 'text-slate-500'}`}
                            onClick={() => setFilter('active')}
                        >Active Alerts</button>
                        <button
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === 'completed' ? 'bg-white shadow-sm text-success' : 'text-slate-500'}`}
                            onClick={() => setFilter('completed')}
                        >Completed</button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center card">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-muted">Synchronizing with dispatch servers...</p>
                </div>
            ) : filteredEmergencies.length === 0 ? (
                <div className="py-20 text-center card">
                    <ShieldAlert size={64} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-500 font-bold">No emergencies matching your filter</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredEmergencies.map(e => {
                        const style = getStatusStyle(e.status);
                        return (
                            <div key={e.id} className="card overflow-hidden hover:shadow-lg transition-shadow border-left-4" style={{ borderLeft: `4px solid ${style.color}` }}>
                                <div className="card-body p-0">
                                    <div className="flex flex-col md:flex-row">
                                        {/* Status & Patient Column */}
                                        <div className="p-6 md:w-1/3 border-r border-slate-100">
                                            <div className="flex justify-between items-start mb-4">
                                                <span className={style.badge}>{style.label}</span>
                                                <span className="text-[10px] font-mono text-slate-400">{e.id.substring(0, 8)}</span>
                                            </div>
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="avatar-sm bg-red-50 text-danger">{e.patient_name?.charAt(0) || 'P'}</div>
                                                <div>
                                                    <div className="font-bold text-slate-900">{e.patient_name || 'Anonymous Patient'}</div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} /> {e.patient_mobile}</div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                                <Clock size={12} /> Received: {new Date(e.created_at).toLocaleString()}
                                            </div>
                                        </div>

                                        {/* Logistics Column */}
                                        <div className="p-6 md:w-1/3 border-r border-slate-100 bg-slate-50/50">
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Pickup Point</p>
                                                    <p className="text-sm font-bold flex items-center gap-2">
                                                        <MapPin size={14} className="text-danger" />
                                                        {e.pickup_address || 'Coordinates Provided'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned Fleet Item</p>
                                                    <div className="flex items-center gap-2">
                                                        <Truck size={14} className="text-navy" />
                                                        <span className="text-sm font-bold">{e.driver_name || 'WAITING FOR DISPATCH'}</span>
                                                        {e.vehicle_number && <span className="badge badge-outline text-[10px]">{e.vehicle_number}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action/Data Column */}
                                        <div className="p-6 md:w-1/3 flex flex-col justify-between">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Emergency Details</p>
                                                {e.source === 'disaster_page' && (
                                                    <span className="badge badge-red pulse mb-2" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>ESI-X DISASTER</span>
                                                )}
                                                <p className="text-xs text-slate-600 line-clamp-2 mb-3">
                                                    {e.description || 'No additional details provided by solicitor.'}
                                                </p>
                                                {e.source === 'disaster_page' && e.esi_resources && e.esi_resources.length > 0 && (
                                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px' }}>
                                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>ESI Resources Required</p>
                                                        {e.esi_resources.map((r, idx) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                                                <span style={{ color: '#475569' }}>{r.icon} {r.name}</span>
                                                                <span style={{ fontWeight: 700, color: '#dc2626' }}>{r.qty} {r.unit}</span>
                                                            </div>
                                                        ))}
                                                        {e.people_count > 0 && (
                                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, borderTop: '1px solid #fecaca', paddingTop: 6 }}>
                                                                {e.people_count} people - {e.incident_label}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 mt-4">
                                                <button onClick={() => setRouteModal(e)} className="btn btn-outline btn-sm flex-1">View Route</button>
                                                <button className="btn btn-ghost btn-sm px-2 text-slate-400"><MoreHorizontal size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Route Map Modal */}
            {routeModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 800, height: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--slate-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <MapPin size={20} color="var(--danger)" />
                                    Emergency Route Map
                                </h3>
                                <p style={{ fontSize: 13, color: 'var(--slate-500)', margin: '4px 0 0 0' }}>Patient ID: {routeModal.id.substring(0, 8)}</p>
                            </div>
                            <button onClick={() => setRouteModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
                                <X size={24} color="var(--slate-400)" />
                            </button>
                        </div>

                        <div style={{ flex: 1, position: 'relative' }}>
                            {routeModal.pickup_lat && routeModal.pickup_lng ? (
                                <MapContainer
                                    center={[routeModal.pickup_lat, routeModal.pickup_lng]}
                                    zoom={14}
                                    style={{ width: '100%', height: '100%' }}
                                    zoomControl={false}
                                >
                                    <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />

                                    <MapFitter coords={[
                                        [routeModal.pickup_lat, routeModal.pickup_lng],
                                        routeModal.hospital_lat && routeModal.hospital_lng ? [routeModal.hospital_lat, routeModal.hospital_lng] : [routeModal.pickup_lat, routeModal.pickup_lng]
                                    ]} />

                                    <Marker position={[routeModal.pickup_lat, routeModal.pickup_lng]} icon={patientIcon}>
                                        <Popup><strong>Pickup Point</strong><br />{routeModal.pickup_address}</Popup>
                                    </Marker>

                                    {routeModal.hospital_lat && routeModal.hospital_lng && (
                                        <>
                                            <Marker position={[routeModal.hospital_lat, routeModal.hospital_lng]} icon={hospitalIcon}>
                                                <Popup><strong>Destination</strong><br />{routeModal.hospital_name}</Popup>
                                            </Marker>
                                            <Polyline
                                                positions={[
                                                    [routeModal.pickup_lat, routeModal.pickup_lng],
                                                    [routeModal.hospital_lat, routeModal.hospital_lng]
                                                ]}
                                                pathOptions={{ color: '#ef4444', weight: 4, dashArray: '10, 10' }}
                                            />
                                        </>
                                    )}
                                </MapContainer>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate-500)', flexDirection: 'column', gap: 12 }}>
                                    <MapPin size={48} color="var(--slate-300)" />
                                    <p>No valid GPS coordinates provided for this emergency.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
