import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Heart, Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck, Key, ChevronLeft } from 'lucide-react';

export default function LoginPage() {
    const { login, completeLoginWithOtp } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);

    // 2FA state
    const [twoFaMode, setTwoFaMode] = useState(false);
    const [twoFaUserId, setTwoFaUserId] = useState('');
    const [twoFaMaskedEmail, setTwoFaMaskedEmail] = useState('');
    const [otpValue, setOtpValue] = useState('');

    const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (!form.email || !form.password) return toast.error('All fields required');
        setLoading(true);
        try {
            const result = await login(form.email, form.password);

            // Doctor 2FA required
            if (result?.requires_2fa) {
                setTwoFaUserId(result.user_id);
                setTwoFaMaskedEmail(result.two_fa_email);
                setTwoFaMode(true);
                toast.success(`Verification code sent to ${result.two_fa_email}`);
                return;
            }

            // Normal login success
            toast.success(`Welcome back, ${result.full_name}!`);
            const routes = { patient: '/patient', doctor: '/doctor', admin: '/admin', driver: '/driver' };
            navigate(routes[result.role] || '/');
        } catch (err) {
            const data = err.response?.data;
            if (data?.errors && Array.isArray(data.errors)) {
                toast.error(data.errors[0].msg);
            } else {
                toast.error(data?.message || 'Login failed. Check credentials.');
            }
        } finally {
            setLoading(false);
        }
    };

    const submitOtp = async (e) => {
        e.preventDefault();
        if (!otpValue || otpValue.length !== 6) return toast.error('Enter the 6-digit verification code');
        setLoading(true);
        try {
            const user = await completeLoginWithOtp(twoFaUserId, otpValue);
            toast.success(`Welcome back, ${user.full_name}! ✅`);
            const routes = { patient: '/patient', doctor: '/doctor', admin: '/admin', driver: '/driver' };
            navigate(routes[user.role] || '/');
        } catch (err) {
            const data = err.response?.data;
            toast.error(data?.message || 'Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const features = ['Priority queue management', 'Real-time patient notifications', 'Secure consultation records', 'Emergency response coordination'];

    return (
        <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {/* Left panel */}
            <div style={{
                background: 'linear-gradient(135deg, var(--navy-900) 0%, #0f2044 60%, #0c1e3d 100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '60px 48px', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: -100, right: -100, width: 350, height: 350, borderRadius: '50%', background: 'rgba(37,99,235,0.12)', filter: 'blur(50px)' }} />
                <div style={{ position: 'absolute', bottom: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: 'rgba(13,148,136,0.1)', filter: 'blur(40px)' }} />

                <Link to="/" style={{ position: 'absolute', top: 32, left: 40, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'white'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                    <ChevronLeft size={16} /> Back to Home
                </Link>

                <div style={{ position: 'relative', textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ width: 110, height: 110, margin: '0 auto 24px', background: 'white', borderRadius: 24, boxShadow: '0 8px 30px rgba(37,99,235,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <img src="/logo.png" alt="Q Nirvana Logo" style={{ width: '180%', height: '180%', objectFit: 'contain' }} />
                    </div>
                    <h1 style={{ color: 'white', fontSize: 36, fontWeight: 800, fontFamily: 'Space Grotesk', marginBottom: 12 }}>Q Nirvana</h1>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7 }}>Intelligent queue management and hospital operations platform</p>

                    <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
                        {features.map(f => (
                            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--teal-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <ArrowRight size={10} color="white" />
                                </div>
                                {f}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right panel */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: 'var(--slate-50)' }}>
                <div style={{ width: '100%', maxWidth: 420 }}>

                    {/* Normal login form */}
                    {!twoFaMode && (
                        <>
                            <div style={{ marginBottom: 36 }}>
                                <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--slate-900)', marginBottom: 6 }}>Welcome back</h2>
                                <p style={{ color: 'var(--slate-500)', fontSize: 14 }}>Sign in to your Q Nirvana account</p>
                            </div>

                            <form onSubmit={submit}>
                                <div className="form-group">
                                    <label className="form-label">Email Address <span className="required">*</span></label>
                                    <div className="input-group">
                                        <Mail className="input-icon-left" size={16} />
                                        <input
                                            type="email" name="email" value={form.email} onChange={handle}
                                            className="form-input" placeholder="you@example.com"
                                            autoComplete="email" required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Password <span className="required">*</span></label>
                                    <div className="input-group">
                                        <Lock className="input-icon-left" size={16} />
                                        <input
                                            type={showPwd ? 'text' : 'password'}
                                            name="password" value={form.password} onChange={handle}
                                            className="form-input" placeholder="Your password"
                                            style={{ paddingRight: 40 }} required
                                        />
                                        <button type="button" className="input-icon-right" onClick={() => setShowPwd(!showPwd)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                        <Link to="#" onClick={(e) => { e.preventDefault(); toast("Forgot password flow not implemented yet"); }} style={{ fontSize: 13, color: 'var(--navy-600)', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</Link>
                                    </div>
                                </div>

                                <button type="submit" className="btn btn-primary w-full" style={{ marginTop: 12 }} disabled={loading}>
                                    {loading ? <span className="spinner" /> : null}
                                    {loading ? 'Signing in...' : 'Sign In'}
                                </button>

                                <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', color: 'var(--slate-400)' }}>
                                    <div style={{ flex: 1, height: 1, backgroundColor: 'var(--slate-200)' }}></div>
                                    <span style={{ fontSize: 13, padding: '0 12px' }}>OR</span>
                                    <div style={{ flex: 1, height: 1, backgroundColor: 'var(--slate-200)' }}></div>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button type="button" onClick={() => toast("Google Sign In coming soon")} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                        </svg>
                                        Google
                                    </button>
                                    <button type="button" onClick={() => toast("X Sign In coming soon")} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#0f1419' }}>
                                        <svg width="18" height="18" viewBox="0 0 1200 1227" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" fill="currentColor" />
                                        </svg>
                                        X
                                    </button>
                                </div>
                            </form>

                            <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--slate-500)' }}>
                                Don't have an account?{' '}
                                <Link to="/register" style={{ color: 'var(--navy-600)', fontWeight: 600 }}>Register here</Link>
                            </p>
                        </>
                    )}

                    {/* 2FA OTP step */}
                    {twoFaMode && (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#1e40af,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 30px rgba(37,99,235,0.3)' }}>
                                    <ShieldCheck size={32} color="white" />
                                </div>
                                <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--slate-900)', marginBottom: 6 }}>Security Verification</h2>
                                <p style={{ color: 'var(--slate-500)', fontSize: 14 }}>
                                    Enter the verification code sent to<br />
                                    <strong style={{ color: 'var(--navy-600)' }}>{twoFaMaskedEmail}</strong>
                                </p>
                            </div>

                            <form onSubmit={submitOtp}>
                                <div className="form-group">
                                    <label className="form-label" style={{ textAlign: 'center', display: 'block' }}>
                                        <Key size={14} style={{ marginRight: 6 }} />
                                        Enter One-Time Password
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={otpValue}
                                        onChange={e => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        style={{ letterSpacing: 14, fontSize: 30, textAlign: 'center', fontWeight: 900, paddingTop: 14, paddingBottom: 14 }}
                                        autoFocus
                                    />
                                    <p style={{ fontSize: 12, color: 'var(--slate-400)', textAlign: 'center', marginTop: 8 }}>
                                        Check your Gmail inbox (and spam folder)
                                    </p>
                                </div>

                                <button type="submit" className="btn btn-primary w-full" style={{ marginTop: 8 }} disabled={loading}>
                                    {loading ? <span className="spinner" /> : null}
                                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                                </button>
                            </form>

                            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
                                <button onClick={() => { setTwoFaMode(false); setOtpValue(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)', fontSize: 14 }}>
                                    ← Back to login
                                </button>
                            </p>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
