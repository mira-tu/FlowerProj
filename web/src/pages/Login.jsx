import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase'; // Import supabase client
// import { authAPI } from '../config/api'; // Remove authAPI
import '../styles/Auth.css';

const Login = ({ onLogin }) => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showReset, setShowReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [resetError, setResetError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Customer login for web app using Supabase
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error || !data?.user) {
                // Normalize all auth failures to the same user-facing message
                // so tests and users consistently see clear feedback.
                console.error('Login error:', error || 'Unknown authentication error');
                setError('Invalid email or password');
                return;
            }

            // Login successful — redirect immediately.
            // The onAuthStateChange listener in App.jsx will pick up the session.
            navigate('/');

            // Fire-and-forget: sync user data to public.users table.
            // This must NOT block login or navigation — the table schema may
            // not match (e.g., UUID vs SERIAL id), so we catch and log only.
            const { user } = data;
            supabase
                .from('users')
                .upsert({
                    id: user.id,
                    name: user.user_metadata?.name || user.email,
                    email: user.email,
                    phone: user.user_metadata?.phone || null,
                    role: 'customer'
                }, { onConflict: 'id' })
                .then(({ error: upsertError }) => {
                    if (upsertError) {
                        console.warn('Non-blocking: failed to sync user profile to public.users:', upsertError.message);
                    }
                })
                .catch((err) => {
                    console.warn('Non-blocking: user profile sync error:', err);
                });
        } catch (err) {
            console.error('Unexpected login error:', err);
            setError('Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setResetMessage('');
        setResetError('');
        setResetLoading(true);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (resetError) {
                throw resetError;
            }

            setResetMessage('If an account exists for that email, a password reset link has been sent.');
        } catch (err) {
            console.error('Password reset error:', err);
            setResetError(err.message || 'Unable to send reset email. Please try again.');
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h3>Welcome to</h3>
                        <h2>Jocerry's Flower Shop!</h2>
                        <p>We're so happy to see you again.</p>
                    </div>
                </div>
                <div className="auth-form-container">
                    {showReset ? (
                        <>
                            <h2 className="auth-title">Reset your password</h2>
                            <p className="auth-subtitle">Enter your email and we&apos;ll send you a reset link.</p>
                            <form onSubmit={handleResetPassword}>
                                {resetMessage && (
                                    <div className="alert alert-success" role="alert">
                                        {resetMessage}
                                    </div>
                                )}
                                {resetError && (
                                    <div className="alert alert-danger" role="alert">
                                        {resetError}
                                    </div>
                                )}
                                <div className="form-floating mb-3">
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="resetEmail"
                                        placeholder="name@example.com"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        required
                                        disabled={resetLoading}
                                    />
                                    <label htmlFor="resetEmail">Email address</label>
                                </div>
                                <button
                                    type="submit"
                                    className="btn btn-auth"
                                    disabled={resetLoading}
                                >
                                    {resetLoading ? 'Sending...' : 'Send reset link'}
                                </button>
                            </form>

                            <button
                                type="button"
                                className="auth-link btn btn-link p-0 mt-3"
                                onClick={() => {
                                    setShowReset(false);
                                    setResetMessage('');
                                    setResetError('');
                                }}
                            >
                                Back to Login
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="auth-title">Login</h2>
                            <p className="auth-subtitle">Enter your details to access your account.</p>

                            <form onSubmit={handleLogin}>
                                {error && (
                                    <div className="alert alert-danger" role="alert">
                                        {error}
                                    </div>
                                )}

                                <div className="form-floating mb-3">
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="floatingInput"
                                        placeholder="name@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingInput">Email address</label>
                                </div>
                                <div className="form-floating mb-3">
                                    <input
                                        type="password"
                                        className="form-control"
                                        id="floatingPassword"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingPassword">Password</label>
                                </div>

                                <div className="d-flex justify-content-end align-items-center mb-4">
                                    <button
                                        type="button"
                                        className="auth-link small text-nowrap btn btn-link p-0"
                                        onClick={() => {
                                            setShowReset(true);
                                            setResetEmail((prev) => prev || email);
                                            setResetMessage('');
                                            setResetError('');
                                        }}
                                    >
                                        Forgot Password?
                                    </button>
                                </div>

                                <button type="submit" className="btn btn-auth" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            Please wait...
                                        </>
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>
                        </>
                    )}

                    <div className="auth-footer">
                        Don't have an account? <Link to="/signup" className="auth-link">Sign Up</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
