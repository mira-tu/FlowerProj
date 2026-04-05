import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
    buildCustomerProfilePayload,
    getUserContactNumber,
    getUserNameParts,
} from '../utils/customerProfile';
import {
    ensureVerifiedUserSession,
    getPasswordResetRedirectUrl,
    resendEmailVerification,
} from '../utils/emailVerification';
import '../styles/Auth.css';

const getFriendlyVerificationError = (error) => {
    const message = String(error?.message || '').toLowerCase();

    if (!message) {
        return 'Unable to resend the verification email. Please try again.';
    }

    if (message.includes('email rate limit') || message.includes('rate limit') || message.includes('too many requests')) {
        return 'Please wait a moment before requesting another verification email.';
    }

    if (message.includes('already') && (message.includes('confirmed') || message.includes('verified'))) {
        return 'Your email is already verified. You may now log in.';
    }

    return error.message || 'Unable to resend the verification email. Please try again.';
};

const getFriendlyResetRequestError = (error) => {
    const message = String(error?.message || '').toLowerCase();

    if (!message) {
        return 'Unable to send a reset link right now. Please try again later.';
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
        return 'Please wait a moment before requesting another reset email.';
    }

    return 'Unable to send a reset link right now. Please try again later.';
};

const Login = ({ onLogin }) => {
    const location = useLocation();
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
    const [verificationEmail, setVerificationEmail] = useState('');
    const [verificationMessage, setVerificationMessage] = useState('');
    const [verificationError, setVerificationError] = useState('');
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [showVerificationHelp, setShowVerificationHelp] = useState(false);
    const resetRedirectTo = getPasswordResetRedirectUrl();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const verificationState = params.get('verification');
        const resetState = params.get('reset');
        const emailFromQuery = params.get('email') || '';

        if (emailFromQuery) {
            setEmail(emailFromQuery);
            setVerificationEmail(emailFromQuery);
        }

        if (resetState === 'success') {
            setVerificationMessage('Your password has been updated. You may now sign in.');
            setVerificationError('');
            setError('');
        }

        if (verificationState === 'pending') {
            setShowVerificationHelp(true);
            setVerificationMessage('Check your email for the verification link before logging in.');
            setVerificationError('');
            setError('');
            return;
        }

        if (verificationState === 'required') {
            setShowVerificationHelp(true);
            setVerificationMessage('');
            setVerificationError('');
            setError('Please verify your email before logging in.');
        }
    }, [location.search]);

    const handleResendVerification = async () => {
        const targetEmail = (verificationEmail || email).trim().toLowerCase();

        setVerificationMessage('');
        setVerificationError('');
        setError('');

        if (!targetEmail) {
            setVerificationError('Enter your email address first so we know where to send the link.');
            return;
        }

        setVerificationLoading(true);

        try {
            const { data, error: resendError } = await resendEmailVerification(targetEmail);

            if (resendError) {
                throw resendError;
            }

            setVerificationMessage(data?.message || 'We sent a verification link to your email address.');
            setShowVerificationHelp(true);
        } catch (resendError) {
            console.error('Verification resend error:', resendError);
            const friendlyMessage = getFriendlyVerificationError(resendError);

            if (friendlyMessage.toLowerCase().includes('already verified')) {
                setVerificationMessage(friendlyMessage);
                setShowVerificationHelp(true);
                return;
            }

            setVerificationError(friendlyMessage);
        } finally {
            setVerificationLoading(false);
        }
    };

    const handleLogin = async (event) => {
        event.preventDefault();
        setError('');
        setVerificationMessage('');
        setVerificationError('');
        setLoading(true);

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError || !data?.user) {
                console.error('Login error:', signInError || 'Unknown authentication error');

                if (signInError?.message?.toLowerCase().includes('email not confirmed')) {
                    setShowVerificationHelp(true);
                    setVerificationEmail(email.trim().toLowerCase());
                    setError('Please verify your email before logging in.');
                } else {
                    setError('Invalid email or password');
                }

                return;
            }

            const verificationState = await ensureVerifiedUserSession(data.user);

            if (verificationState.shouldSignOut) {
                await supabase.auth.signOut();
                setShowVerificationHelp(true);
                setVerificationEmail(data.user.email || email.trim().toLowerCase());
                setError('Please verify your email before logging in.');
                return;
            }

            navigate('/');

            if (typeof onLogin === 'function') {
                onLogin();
            }

            const { user } = data;
            const nameParts = getUserNameParts({}, user);
            const profilePayload = buildCustomerProfilePayload({
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName,
                email: user.email,
                contactNumber: getUserContactNumber({}, user),
                birthday: user.user_metadata?.birthdate || '',
                gender: user.user_metadata?.gender || '',
            });

            supabase
                .from('users')
                .upsert({
                    id: user.id,
                    ...profilePayload,
                }, { onConflict: 'id' })
                .then(({ error: upsertError }) => {
                    if (upsertError) {
                        console.warn('Non-blocking: failed to sync user profile to public.users:', upsertError.message);
                    }
                })
                .catch((upsertException) => {
                    console.warn('Non-blocking: user profile sync error:', upsertException);
                });
        } catch (loginException) {
            console.error('Unexpected login error:', loginException);
            setError('Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (event) => {
        event.preventDefault();
        setResetMessage('');
        setResetError('');
        setResetLoading(true);

        try {
            const normalizedResetEmail = String(resetEmail || '').trim().toLowerCase();
            const { error: resetPasswordError } = await supabase.auth.resetPasswordForEmail(normalizedResetEmail, {
                redirectTo: resetRedirectTo,
            });

            if (resetPasswordError) {
                throw resetPasswordError;
            }

            setResetMessage('If an account exists for that email, a password reset link has been sent.');
        } catch (resetPasswordException) {
            console.error('Password reset error:', resetPasswordException);
            setResetError(getFriendlyResetRequestError(resetPasswordException));
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
                        <h2>Jocerry&apos;s Flower Shop!</h2>
                        <p>We&apos;re so happy to see you again.</p>
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
                                        onChange={(event) => setResetEmail(event.target.value)}
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
                                {verificationMessage && (
                                    <div className="alert alert-success" role="alert">
                                        {verificationMessage}
                                    </div>
                                )}
                                {verificationError && (
                                    <div className="alert alert-danger" role="alert">
                                        {verificationError}
                                    </div>
                                )}

                                <div className="form-floating mb-3">
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="floatingInput"
                                        placeholder="name@example.com"
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                            setVerificationEmail(event.target.value);
                                        }}
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
                                        onChange={(event) => setPassword(event.target.value)}
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
                                            setResetEmail((previousEmail) => previousEmail || email);
                                            setResetMessage('');
                                            setResetError('');
                                        }}
                                    >
                                        Forgot Password?
                                    </button>
                                </div>

                                {showVerificationHelp && (
                                    <div className="mb-4">
                                        <button
                                            type="button"
                                            className="auth-link small btn btn-link p-0"
                                            onClick={handleResendVerification}
                                            disabled={verificationLoading}
                                        >
                                            {verificationLoading ? 'Sending verification email...' : 'Resend verification email'}
                                        </button>
                                    </div>
                                )}

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
                        Don&apos;t have an account? <Link to="/signup" className="auth-link">Sign Up</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
