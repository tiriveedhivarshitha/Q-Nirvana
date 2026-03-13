import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Route, RefreshCw, Activity, Clock, MapPin, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const locationPinIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', // Location pin icon
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -35]
});

const hospitalBuildingIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/4320/4320337.png', // Hospital building icon
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
});

// Priority Queue for pure JS Dijkstra
function PriorityQueue() {
    this.values = [];
    this.enqueue = (val, priority) => {
        this.values.push({ val, priority });
        this.sort();
    };
    this.dequeue = () => this.values.shift();
    this.sort = () => this.values.sort((a, b) => a.priority - b.priority);
}

// 1. Pure JS Dijkstra Implementation
const runDijkstra = (graph, startNode) => {
    const distances = {};
    const previous = {};
    const pq = new PriorityQueue();

    for (let vertex in graph) {
        if (vertex === String(startNode)) {
            distances[vertex] = 0;
            pq.enqueue(vertex, 0);
        } else {
            distances[vertex] = Infinity;
            pq.enqueue(vertex, Infinity);
        }
        previous[vertex] = null;
    }

    while (pq.values.length) {
        let smallest = pq.dequeue().val;
        if (distances[smallest] === Infinity) continue;

        for (let neighbor in graph[smallest]) {
            let candidate = distances[smallest] + graph[smallest][neighbor];
            if (candidate < distances[neighbor]) {
                distances[neighbor] = candidate;
                previous[neighbor] = smallest;
                pq.enqueue(neighbor, candidate);
            }
        }
    }
    return { distances, previous };
};

const getPath = (previous, endNode) => {
    const path = [];
    let current = endNode;
    while (current) {
        path.unshift(current);
        current = previous[current];
    }
    return path;
};

// Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// 2. Generate Nodes in Bhimavaram
const GENERATE_NODES = () => {
    const baseLat = 16.5445;
    const baseLng = 81.5218;
    const step = 0.005;

    return {
        0: { lat: baseLat, lng: baseLng, name: "Current Location" },
        1: { lat: baseLat + step, lng: baseLng + step },
        2: { lat: baseLat - step, lng: baseLng - step },
        3: { lat: baseLat + step * 2, lng: baseLng },
        4: { lat: baseLat - step * 2, lng: baseLng + step / 2 },
        5: { lat: baseLat + step * 3, lng: baseLng + step * 2 },
        6: { lat: baseLat, lng: baseLng - step * 2 },
        7: { lat: baseLat - step * 3, lng: baseLng - step },
        8: { lat: baseLat - step * 2.5, lng: baseLng + step * 2 },
        9: { lat: baseLat + step * 4, lng: baseLng + step },
        10: { lat: baseLat + step * 1.5, lng: baseLng - step * 3 },
        11: { lat: baseLat - step, lng: baseLng - step * 3 },
        12: { lat: baseLat - step * 4, lng: baseLng },
        13: { lat: baseLat - step * 1, lng: baseLng + step * 3 },
        14: { lat: baseLat - step * 2, lng: baseLng - step * 4 },
        15: { lat: baseLat + step * 2.5, lng: baseLng - step * 1.5 },
    };
};

const defaultEdges = [
    [0, 1], [0, 2], [0, 6], [1, 3], [1, 13], [2, 4], [2, 7],
    [3, 5], [3, 9], [4, 8], [4, 12], [5, 9], [6, 10], [6, 11],
    [7, 12], [7, 14], [8, 13], [10, 14], [11, 14], [3, 10], [12, 8],
    [0, 15], [15, 5], [15, 10]
];

const HOSPITALS = [
    { id: 'h1', name: "U.V.S.M. Eye Hospital", node: 5 },
    { id: 'h2', name: "Mohan Hospital", node: 7 },
    { id: 'h3', name: "Subhadra Surgical and Maternity Centre", node: 8 },
    { id: 'h4', name: "Sri Krishna Eye Institute", node: 9 },
    { id: 'h5', name: "Madhu Chalapathi Urological Hospital", node: 10 },
    { id: 'h6', name: "Lakshmi Skin Hospital", node: 11 },
    { id: 'h7', name: "Sri Rangaraju Children's Hospital", node: 13 },
    { id: 'h8', name: "Rajan Raju ENT Hospital", node: 14 }
];

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

export default function NavigationMap() {
    const [nodes, setNodes] = useState(GENERATE_NODES());
    const [trafficMultipliers, setTrafficMultipliers] = useState({});
    const [graph, setGraph] = useState({});

    // Dijkstra Results
    const [distances, setDistances] = useState({});
    const [previous, setPrevious] = useState({});

    const [selectedHospital, setSelectedHospital] = useState(null);
    const [activePath, setActivePath] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [loading, setLoading] = useState(true);

    // Build Graph & Run Dijkstra
    const updateGraphAndRouting = () => {
        setLoading(true);
        const newGraph = {};
        Object.keys(nodes).forEach(n => newGraph[n] = {});

        defaultEdges.forEach(([u, v]) => {
            const dist = calculateDistance(nodes[u].lat, nodes[u].lng, nodes[v].lat, nodes[v].lng);
            const edgeKey = `${u}-${v}`;
            const traffic = trafficMultipliers[edgeKey] || 1.0;
            const weightedDist = dist * traffic;

            newGraph[u][v] = weightedDist;
            newGraph[v][u] = weightedDist;
        });

        const result = runDijkstra(newGraph, 0);
        setGraph(newGraph);
        setDistances(result.distances);
        setPrevious(result.previous);
        setLoading(false);

        if (selectedHospital) {
            const h = selectedHospital;
            setActivePath(getPath(result.previous, h.node.toString()));
        }
    };

    useEffect(() => {
        updateGraphAndRouting();
    }, [trafficMultipliers]);

    const randomizeTraffic = () => {
        const newTraffic = {};
        defaultEdges.forEach(([u, v]) => {
            const edgeKey = `${u}-${v}`;
            newTraffic[edgeKey] = 1.0 + Math.random() * 3.0;
        });
        setTrafficMultipliers(newTraffic);
        toast.success("Traffic Multipliers Updated!", { icon: '🚦' });
    };

    const handleHospitalSelect = (hosp) => {
        setSelectedHospital(hosp);
        const path = getPath(previous, hosp.node.toString());
        setActivePath(path);
        setSearchQuery('');
    };

    const hospitalList = useMemo(() => {
        if (!distances || Object.keys(distances).length === 0) return HOSPITALS;
        return HOSPITALS.map(h => {
            const dDist = distances[h.node] || 0;
            const timeMins = Math.ceil((dDist / 40.0) * 60);
            return { ...h, dijkstraDist: dDist.toFixed(2), timeMins };
        }).sort((a, b) => a.dijkstraDist - b.dijkstraDist);
    }, [distances]);

    const filteredHospitals = useMemo(() => {
        if (!searchQuery) return [];
        return hospitalList.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()) && h.id !== selectedHospital?.id);
    }, [searchQuery, hospitalList, selectedHospital]);

    const drawGraphEdges = () => {
        if (!graph || Object.keys(graph).length === 0) return null;
        const rendered = new Set();
        const components = [];

        Object.keys(graph).forEach(u => {
            Object.keys(graph[u]).forEach(v => {
                const edgeKey = [u, v].sort().join('-');
                if (!rendered.has(edgeKey)) {
                    rendered.add(edgeKey);

                    const weight = graph[u][v];
                    let trafficLevel = trafficMultipliers[edgeKey] || 1.0;

                    let color = '#94a3b8';
                    if (trafficLevel > 2.0) color = '#fbbf24';
                    if (trafficLevel > 3.0) color = '#ef4444';

                    const isPartOfActivePath = activePath.includes(u) && activePath.includes(v) &&
                        Math.abs(activePath.indexOf(u) - activePath.indexOf(v)) === 1;

                    components.push(
                        <Polyline
                            key={edgeKey}
                            positions={[[nodes[u].lat, nodes[u].lng], [nodes[v].lat, nodes[v].lng]]}
                            pathOptions={{
                                color: isPartOfActivePath ? '#3b82f6' : color,
                                weight: isPartOfActivePath ? 8 : (trafficLevel > 2.0 ? 4 : 2),
                                opacity: isPartOfActivePath ? 1 : 0.6
                            }}
                        >
                            {isPartOfActivePath && (
                                <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none text-[12px] font-bold">
                                    <span className="bg-white/95 px-2 py-1 rounded-md text-slate-800 shadow-sm border border-slate-200">
                                        {(graph[u][v]).toFixed(2)} km
                                    </span>
                                </Tooltip>
                            )}
                        </Polyline>
                    );
                }
            });
        });
        return components;
    };

    let fitCoords = [];
    if (activePath.length > 0) {
        fitCoords = activePath.map(n => [nodes[n].lat, nodes[n].lng]);
    } else {
        fitCoords = Object.keys(nodes).map(n => [nodes[n].lat, nodes[n].lng]);
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 64px)', backgroundColor: 'var(--slate-50)', overflow: 'hidden', fontFamily: 'var(--font-sans, inherit)', display: 'flex', flexDirection: 'column' }}>

            {/* Centered Location Search Bar */}
            <div style={{
                position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
                zIndex: 1000, width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', backgroundColor: 'white', borderRadius: '32px',
                    padding: '12px 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '100%', border: '1px solid var(--slate-200)'
                }}>
                    <MapPin size={24} style={{ color: 'var(--slate-400)', marginRight: '16px' }} />
                    <input
                        type="text"
                        placeholder="Search for a hospital..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '18px', fontWeight: 500, color: 'var(--slate-800)', backgroundColor: 'transparent' }}
                    />
                    <button onClick={randomizeTraffic} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--slate-500)', padding: '4px' }} title="Refresh Traffic">
                        <RefreshCw size={20} />
                    </button>
                </div>

                {filteredHospitals.length > 0 && (
                    <div style={{
                        marginTop: '8px', width: '100%', backgroundColor: 'white', borderRadius: '16px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 1001, border: '1px solid var(--slate-100)'
                    }}>
                        {filteredHospitals.map(h => (
                            <div
                                key={h.id}
                                onClick={() => handleHospitalSelect(h)}
                                style={{ padding: '16px 24px', cursor: 'pointer', borderBottom: '1px solid var(--slate-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--slate-800)' }}>{h.name}</span>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--slate-500)' }}>{h.dijkstraDist} km</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, position: 'relative', zIndex: 10, backgroundColor: 'var(--slate-200)' }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 2000, backgroundColor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity style={{ color: 'var(--navy-500)' }} size={64} />
                    </div>
                )}

                <MapContainer
                    center={[16.5445, 81.5218]}
                    zoom={15}
                    style={{ width: '100%', height: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                    />

                    <MapFitter coords={fitCoords} />
                    {drawGraphEdges()}

                    <Marker position={[nodes[0].lat, nodes[0].lng]} icon={locationPinIcon} zIndexOffset={1000}>
                        <Tooltip direction="right" permanent className="bg-white border-0 shadow-md font-bold text-slate-800 px-3 py-1.5 rounded-lg text-sm">
                            📍 Your Location
                        </Tooltip>
                    </Marker>

                    {HOSPITALS.map(h => (
                        <Marker
                            key={h.id}
                            position={[nodes[h.node].lat, nodes[h.node].lng]}
                            icon={hospitalBuildingIcon}
                            eventHandlers={{ click: () => handleHospitalSelect(h) }}
                        >
                            <Tooltip direction="top" offset={[0, -20]} opacity={1} permanent={selectedHospital?.id === h.id}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: selectedHospital?.id === h.id ? '#3b82f6' : 'var(--slate-700)' }}>
                                    {h.name}
                                </span>
                            </Tooltip>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {selectedHospital && (
                <div style={{
                    position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: 1000, width: '100%', maxWidth: '600px'
                }}>
                    <div style={{
                        backgroundColor: 'white', borderRadius: '24px', padding: '20px 24px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--slate-100)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: '50%' }}>
                                <Navigation size={28} style={{ color: '#3b82f6' }} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: 'var(--slate-800)' }}>{selectedHospital.name}</h3>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--slate-500)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={14} /> Dijkstra Optimal Route Computed
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '24px', textAlign: 'right' }}>
                            <div>
                                <p style={{ margin: '0 0 2px 0', fontSize: '12px', fontWeight: 600, color: 'var(--slate-400)', textTransform: 'uppercase' }}>Distance</p>
                                <p style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--slate-800)' }}>{selectedHospital.dijkstraDist} <span style={{ fontSize: '14px', fontWeight: 600 }}>km</span></p>
                            </div>
                            <div>
                                <p style={{ margin: '0 0 2px 0', fontSize: '12px', fontWeight: 600, color: 'var(--slate-400)', textTransform: 'uppercase' }}>Est. Time</p>
                                <p style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#3b82f6' }}>{selectedHospital.timeMins} <span style={{ fontSize: '14px', fontWeight: 600 }}>min</span></p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
