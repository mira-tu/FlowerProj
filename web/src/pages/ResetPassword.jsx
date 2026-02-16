import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/Auth.css';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => {
        const getSession = async () => {
            const { data } = await supabase.auth.getSession();
            setHasSession(!!data.session);
        };

        getSession();

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            setHasSession(!!session);
        });

        return () => subscription.subscription.unsubscribe();
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });

            if (updateError) {
                throw updateError;
            }

            setMessage('Your password has been updated. You can now sign in.');
            setPassword('');
            setConfirmPassword('');

            setTimeout(() => {
                navigate('/login');
            }, 1500);
        } catch (err) {
            console.error('Password update error:', err);
            setError(err.message || 'Unable to update password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h3>Reset Your Password</h3>
                        <h2>Jocery&apos;s Flower Shop</h2>
                        <p>Enter a new password to regain access.</p>
                    </div>
                </div>
                <div className="auth-form-container">
                    <h2 className="auth-title">Set a new password</h2>
                    <p className="auth-subtitle">
                        Choose a strong password you&apos;ll remember.
                    </p>

                    {!hasSession && (
                        <div className="alert alert-warning" role="alert">
                            This reset link is missing or expired. Request a new one from the login page.
                        </div>
                    )}

                    {message && (
                        <div className="alert alert-success" role="alert">
                            {message}
                        </div>
                    )}
                    {error && (
                        <div className="alert alert-danger" role="alert">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control"
                                id="newPassword"
                                placeholder="New password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading || !hasSession}
                            />
                            <label htmlFor="newPassword">New password</label>
                        </div>
                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control"
                                id="confirmPassword"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading || !hasSession}
                            />
                            <label htmlFor="confirmPassword">Confirm password</label>
                        </div>

                        <button type="submit" className="btn btn-auth" disabled={loading || !hasSession}>
                            {loading ? 'Updating...' : 'Update password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
