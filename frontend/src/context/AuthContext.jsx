import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('qnirvana_token');
            if (token) {
                try {
                    // Try to get fresh user data from server
                    const res = await api.get('/auth/me');
                    if (res.data.success) {
                        const u = res.data.user;
                        localStorage.setItem('qnirvana_user', JSON.stringify(u));
                        setUser(u);
                    }
                } catch (err) {
                    // If token is invalid or server error, fallback to stored data
                    const stored = localStorage.getItem('qnirvana_user');
                    if (stored) setUser(JSON.parse(stored));
                    else logout();
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    const refreshUser = async () => {
        try {
            const res = await api.get('/auth/me');
            if (res.data.success) {
                const u = res.data.user;
                localStorage.setItem('qnirvana_user', JSON.stringify(u));
                setUser(u);
                return u;
            }
        } catch (err) {
            console.error('Failed to refresh user:', err);
        }
    };

    const login = async (email, password) => {
        const res = await api.post('/auth/login', { email, password });
        // If doctor has 2FA, backend returns requires_2fa: true without a token
        if (res.data.requires_2fa) {
            return res.data; // caller handles OTP step
        }
        const { token, user: u } = res.data;
        localStorage.setItem('qnirvana_token', token);
        localStorage.setItem('qnirvana_user', JSON.stringify(u));
        setUser(u);
        return u;
    };

    const completeLoginWithOtp = async (user_id, otp) => {
        const res = await api.post('/auth/verify-login-otp', { user_id, otp });
        const { token, user: u } = res.data;
        localStorage.setItem('qnirvana_token', token);
        localStorage.setItem('qnirvana_user', JSON.stringify(u));
        setUser(u);
        return u;
    };

    const register = async (formData) => {
        const res = await api.post('/auth/register', formData);
        // If registration requires verification (OTP)
        if (res.data.requires_verification) {
            return res.data; // caller handles OTP step
        }
        const { token, user: u } = res.data;
        localStorage.setItem('qnirvana_token', token);
        localStorage.setItem('qnirvana_user', JSON.stringify(u));
        setUser(u);
        return u;
    };

    const completeRegistrationWithOtp = async (user_id, otp) => {
        const res = await api.post('/auth/verify-registration-otp', { user_id, otp });
        const { token, user: u } = res.data;
        localStorage.setItem('qnirvana_token', token);
        localStorage.setItem('qnirvana_user', JSON.stringify(u));
        setUser(u);
        return u;
    };

    const logout = () => {
        localStorage.removeItem('qnirvana_token');
        localStorage.removeItem('qnirvana_user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{
            user, loading, login, register, logout,
            completeLoginWithOtp, completeRegistrationWithOtp, refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
