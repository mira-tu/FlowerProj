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

            if (error) {
                throw error;
            }

            // Login successful
            // Supabase returns user and session
            const { user, session } = data;

            // Upsert user data into public.users table to ensure consistency
            const { error: upsertError } = await supabase
                .from('users')
                .upsert({
                    id: user.id,
                    name: user.user_metadata.name || user.email, // Use name from metadata or fallback to email
                    email: user.email,
                    phone: user.user_metadata.phone || null, // Correctly syncs phone from metadata
                    role: 'customer' // Default role
                }, { onConflict: 'id' }); // Upsert by id

            if (upsertError) {
                console.error('Error upserting user into public.users:', upsertError);
                // Decide how critical this error is. For now, we proceed with login, but log the error.
            }

            // onLogin(); // No longer needed as user state is handled by App.jsx onAuthStateChange

            // Always redirect to home page for customers
            navigate('/');
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || 'Invalid email or password');
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
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail);

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
                        <h2>Jocery's Flower Shop!</h2>
                        <p>We're so happy to see you again.</p>
                    </div>
                </div>
                <div className="auth-form-container">
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

                        <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" id="rememberMe" />
                                <label className="form-check-label text-muted" htmlFor="rememberMe">
                                    Remember me
                                </label>
                            </div>
                            <button
                                type="button"
                                className="auth-link small text-nowrap btn btn-link p-0"
                                onClick={() => {
                                    setShowReset((prev) => !prev);
                                    setResetEmail((prev) => prev || email);
                                    setResetMessage('');
                                    setResetError('');
                                }}
                            >
                                Forgot Password?
                            </button>
                        </div>

                        <button type="submit" className="btn btn-auth" disabled={loading}>
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    {showReset && (
                        <div className="mt-4">
                            <h6 className="fw-semibold mb-2">Reset your password</h6>
                            <p className="text-muted small mb-3">
                                Enter your email and we&apos;ll send you a reset link.
                            </p>
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
                        </div>
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
