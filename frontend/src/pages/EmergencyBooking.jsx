import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Activity, ShieldAlert, Heart, Clock, AlertTriangle, CheckCircle, Search, User } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api/emergency';

export default function EmergencyBooking() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: location, 2: hospitals, 3: doctors, 4: confirmation, 5: success
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [selectedHosp, setSelectedHosp] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);

  // Step 1: Request Location
  const requestLocation = () => {
    setLoading(true);
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        fetchHospitals(c);
      },
      (err) => {
        toast.error('Location access is required for emergency services.');
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Step 2: Fetch Hospitals
  const fetchHospitals = async (location) => {
    try {
      const res = await axios.get(`${API_URL}/hospitals?lat=${location.lat}&lng=${location.lng}`);
      setHospitals(res.data.hospitals);
      setStep(2);
    } catch (err) {
      toast.error('Failed to find nearby hospitals');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Select Hospital -> Fetch Doctors
  const handleHospSelect = async (h) => {
    setSelectedHosp(h);
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/hospital/${h.id}/doctors`);
      setDoctors(res.data.doctors);
      setStep(3);
    } catch (err) {
      toast.error('Failed to fetch surgeons');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Final Booking
  const handleBook = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/book`, {
        hospitalId: selectedHosp.id,
        doctorId: selectedDoctor.id,
        patientLocation: coords,
        patientEmail: 'patient@example.com' // Mock or from form
      });
      setBookingResult(res.data);
      setStep(5);
      toast.success('Emergency booking confirmed! 🚑');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--slate-50)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #ef4444, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 30px rgba(239, 68, 68, 0.4)' }}>
            <ShieldAlert size={40} color="white" />
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: 'var(--slate-900)' }}>EMERGENCY RESPONSE</h1>
          <p style={{ color: 'var(--slate-500)', fontSize: 16 }}>Immediate life-critical assistance and ICU bed allocation</p>
        </div>

        {/* Progress Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 40 }}>
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} style={{ width: 40, height: 8, borderRadius: 4, background: step >= s ? s === 5 && step < 5 ? 'var(--slate-200)' : '#ef4444' : 'var(--slate-200)', transition: 'all 0.4s' }} />
          ))}
        </div>

        {/* Main Content */}
        <div className="card" style={{ border: step === 1 ? '1px solid var(--slate-200)' : 'none', overflow: 'hidden' }}>

          {/* Step 1: Location Assistance */}
          {step === 1 && (
            <div className="card-body" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ marginBottom: 32 }}>
                <MapPin size={64} color="var(--navy-500)" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--slate-900)' }}>Location Required</h2>
                <p style={{ color: 'var(--slate-500)', maxWidth: 400, margin: '0 auto' }}>
                  We need your current location to identify the nearest hospital with available ICU facilities and surgeons.
                </p>
              </div>
              <button
                onClick={requestLocation}
                className="btn w-full btn-xl"
                style={{ background: 'var(--navy-900)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : <Navigation size={20} />}
                {loading ? 'Acquiring GPS...' : 'GRANT LOCATION ACCESS'}
              </button>
            </div>
          )}

          {/* Step 2: Hospitals Search */}
          {step === 2 && (
            <div className="card-body" style={{ padding: 32 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Search size={24} color="var(--navy-600)" />
                Nearest Hospitals
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hospitals.map((h, idx) => (
                  <div
                    key={h.id}
                    onClick={() => handleHospSelect(h)}
                    style={{
                      padding: 24, borderRadius: 16, border: '1.5px solid var(--slate-100)',
                      cursor: 'pointer', transition: 'all 0.2s', background: 'white',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      position: 'relative'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy-300)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--slate-100)'}
                  >
                    {idx === 0 && (
                      <div style={{ position: 'absolute', top: -10, left: 20, background: 'var(--navy-600)', color: 'white', padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em' }}>
                        RECOMMENDED - NEAREST
                      </div>
                    )}
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700 }}>{h.name}</h3>
                      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--slate-500)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={14} /> {h.distance} km</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: h.icu_beds_available > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          <Activity size={14} /> {h.icu_beds_available} ICU Beds
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-outline btn-sm">Select</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Doctor Selection */}
          {step === 3 && (
            <div className="card-body" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <button onClick={() => setStep(2)} className="btn btn-ghost" style={{ padding: 8 }}>←</button>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Available Surgeons</h2>
                  <p className="text-muted" style={{ margin: 0 }}>On-duty at {selectedHosp?.name}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {doctors.map(d => (
                  <div
                    key={d.id}
                    onClick={() => { setSelectedDoctor(d); setStep(4); }}
                    style={{
                      padding: 20, borderRadius: 16, border: '1.5px solid var(--slate-100)',
                      cursor: 'pointer', background: 'white', textAlign: 'center'
                    }}
                  >
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <User size={28} color="var(--navy-600)" />
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0' }}>{d.full_name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--slate-500)', margin: 0 }}>{d.specialization}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Final Confirmation */}
          {step === 4 && (
            <div className="card-body" style={{ padding: 48 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', marginBottom: 32 }}>Confirm Critical Care Booking</h2>

              <div style={{ background: 'var(--slate-50)', borderRadius: 24, padding: 32, marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--slate-200)' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Hospital</span>
                  <span style={{ fontWeight: 700 }}>{selectedHosp?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--slate-200)' }}>
                  <span style={{ color: 'var(--slate-500)' }}>Specialist Surgeon</span>
                  <span style={{ fontWeight: 700 }}>{selectedDoctor?.full_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate-500)' }}>ICU Allocation</span>
                  <span style={{ fontWeight: 700, color: 'var(--success)' }}>Automatic Priority</span>
                </div>
              </div>

              <div className="alert alert-warning" style={{ marginBottom: 32 }}>
                <AlertTriangle size={16} />
                <span>Emergency ICU beds are reserved instantly. Please proceed immediately upon confirmation.</span>
              </div>

              <button
                onClick={handleBook}
                className="btn w-full btn-xl"
                style={{ background: '#ef4444', color: 'white', fontSize: 20, fontWeight: 800 }}
                disabled={loading}
              >
                {loading ? 'FINALIZING ALLOCATION...' : 'BOOK EMERGENCY APPOINTMENT'}
              </button>
            </div>
          )}

          {/* Step 5: Success Output */}
          {step === 5 && bookingResult && (
            <div className="card-body" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <CheckCircle size={48} color="var(--success)" />
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Booking Confirmed!</h2>
              <p className="text-muted" style={{ marginBottom: 40 }}>Emergency protocol initiated. Help is awaiting your arrival.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>
                <div style={{ padding: 20, borderRadius: 20, background: 'white', border: '1px solid var(--slate-100)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--slate-400)', fontSize: 12, marginBottom: 8 }}>
                    <Heart size={14} /> ICU ALLOCATION
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Room {bookingResult.room}</div>
                  <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>Reserved & Sterilized</div>
                </div>
                <div style={{ padding: 20, borderRadius: 20, background: 'white', border: '1px solid var(--slate-100)', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--slate-400)', fontSize: 12, marginBottom: 8 }}>
                    <User size={14} /> ON-DUTY SURGEON
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{bookingResult.doctor}</div>
                  <div style={{ fontSize: 12, color: 'var(--navy-600)', fontWeight: 600 }}>Emergency Dept</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--slate-400)', fontSize: 11, marginBottom: 4 }}>DISTANCE</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{bookingResult.distance} km</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--slate-400)', fontSize: 11, marginBottom: 4 }}>ESTIMATED ARRIVAL</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444' }}>{bookingResult.eta} mins</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => window.print()} className="btn btn-outline w-full">Print Slip</button>
                <button onClick={() => navigate('/login')} className="btn btn-primary w-full">Back to Login</button>
              </div>
            </div>
          )}

        </div>

        {/* Footer Link */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button onClick={() => navigate('/login')} className="btn btn-ghost" style={{ color: 'var(--slate-500)' }}>
            Cancel and return to login
          </button>
        </div>

      </div>
    </div>
  );
}
