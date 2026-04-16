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
    requestPasswordReset,
    resendEmailVerification,
    secureSignIn,
} from '../utils/emailVerification';
import '../styles/Auth.css';

const DEFAULT_LOGIN_RETRY_SECONDS = 30;
const DEFAULT_RESET_RETRY_SECONDS = 60;
const DEFAULT_RESET_DAILY_LIMIT_SECONDS = 24 * 60 * 60;

const getFriendlyVerificationError = (error) => {
    const message = String(error?.message || '').toLowerCase();

    if (!message) {
        return 'Unable to resend the verification email. Please try again.';
    }

    if (message.includes('email rate limit') || message.includes('rate limit') || message.includes('too many requests')) {
        return 'Please wait a moment before requesting another verification email.';
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

const formatLoginRetryMessage = (secondsRemaining) => (
    `Too many login attempts. Try again in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}.`
);

const formatCompactRetryDuration = (secondsRemaining) => {
    if (secondsRemaining < 60) {
        return `${secondsRemaining}s`;
    }

    if (secondsRemaining < 3600) {
        const minutes = Math.floor(secondsRemaining / 60);
        const seconds = secondsRemaining % 60;

        return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
    }

    const hours = Math.floor(secondsRemaining / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);

    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

const Login = ({ onLogin }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loginRetryAfter, setLoginRetryAfter] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showReset, setShowReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetRetryAfter, setResetRetryAfter] = useState(0);
    const [resetRetryMode, setResetRetryMode] = useState('');
    const [resetRetryEmail, setResetRetryEmail] = useState('');
    const [verificationEmail, setVerificationEmail] = useState('');
    const [verificationMessage, setVerificationMessage] = useState('');
    const [verificationError, setVerificationError] = useState('');
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [showVerificationHelp, setShowVerificationHelp] = useState(false);
    const isLoginLocked = loginRetryAfter > 0;
    const hasResetRetryTimer = resetRetryAfter > 0;
    const normalizedResetEmail = String(resetEmail || '').trim().toLowerCase();
    const isResetLocked = resetRetryAfter > 0
        && Boolean(normalizedResetEmail)
        && normalizedResetEmail === resetRetryEmail;
    const loginErrorMessage = isLoginLocked
        ? formatLoginRetryMessage(loginRetryAfter)
        : error;
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

    useEffect(() => {
        if (!verificationMessage) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setVerificationMessage('');
        }, 10000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [verificationMessage]);

    useEffect(() => {
        if (!resetMessage) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setResetMessage('');
        }, 10000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [resetMessage]);

    useEffect(() => {
        if (!resetError) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setResetError('');
        }, 10000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [resetError]);

    useEffect(() => {
        if (!isLoginLocked) {
            return undefined;
        }

        const intervalId = window.setInterval(() => {
            setLoginRetryAfter((previousSeconds) => {
                if (previousSeconds <= 1) {
                    window.clearInterval(intervalId);
                    return 0;
                }

                return previousSeconds - 1;
            });
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [isLoginLocked]);

    useEffect(() => {
        if (!hasResetRetryTimer) {
            return undefined;
        }

        const intervalId = window.setInterval(() => {
            setResetRetryAfter((previousSeconds) => {
                if (previousSeconds <= 1) {
                    window.clearInterval(intervalId);
                    return 0;
                }

                return previousSeconds - 1;
            });
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [hasResetRetryTimer]);

    useEffect(() => {
        if (resetRetryAfter > 0) {
            return;
        }

        if (resetRetryMode) {
            setResetRetryMode('');
        }

        if (resetRetryEmail) {
            setResetRetryEmail('');
        }
    }, [resetRetryAfter, resetRetryMode, resetRetryEmail]);

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
            const { error: resendError } = await resendEmailVerification(targetEmail);

            if (resendError) {
                throw resendError;
            }

            setVerificationMessage('If an eligible account exists for that email, a verification link has been sent.');
            setShowVerificationHelp(true);
        } catch (resendError) {
            console.error('Verification resend error:', resendError);
            const friendlyMessage = getFriendlyVerificationError(resendError);

            setVerificationError(friendlyMessage);
        } finally {
            setVerificationLoading(false);
        }
    };

    const handleLogin = async (event) => {
        event.preventDefault();

        if (isLoginLocked) {
            return;
        }

        setError('');
        setVerificationMessage('');
        setVerificationError('');
        setLoading(true);

        try {
            const { data: loginData, error: signInError } = await secureSignIn(
                email,
                password,
            );

            if (signInError) {
                console.error('Login error:', signInError || 'Unknown authentication error');
                const message = String(signInError?.message || '').toLowerCase();

                if (signInError?.status === 429 || message.includes('too many login attempts')) {
                    const retryAfterSeconds = Number(signInError?.retryAfterSeconds);

                    setLoginRetryAfter(
                        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                            ? Math.ceil(retryAfterSeconds)
                            : DEFAULT_LOGIN_RETRY_SECONDS,
                    );
                    setError('');
                } else {
                    setLoginRetryAfter(0);
                    setError('Invalid email or password');
                }

                return;
            }

            const sessionPayload = loginData?.session;

            if (!sessionPayload?.access_token || !sessionPayload?.refresh_token) {
                throw new Error('Unable to establish your session. Please try again.');
            }

            const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
                access_token: sessionPayload.access_token,
                refresh_token: sessionPayload.refresh_token,
            });

            if (setSessionError || !sessionData?.session?.user) {
                throw setSessionError || new Error('Unable to establish your session. Please try again.');
            }

            const authUser = sessionData.session.user;
            const verificationState = await ensureVerifiedUserSession(authUser);

            if (verificationState.shouldSignOut) {
                await supabase.auth.signOut();
                setLoginRetryAfter(0);
                setError('Invalid email or password');
                return;
            }

            setLoginRetryAfter(0);
            navigate('/');

            if (typeof onLogin === 'function') {
                onLogin();
            }

            const nameParts = getUserNameParts({}, authUser);
            const profilePayload = buildCustomerProfilePayload({
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName,
                email: authUser.email,
                contactNumber: getUserContactNumber({}, authUser),
                birthday: authUser.user_metadata?.birthdate || '',
                gender: authUser.user_metadata?.gender || '',
            });

            supabase
                .from('users')
                .upsert({
                    id: authUser.id,
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
            setLoginRetryAfter(0);
            setError('Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (event) => {
        event.preventDefault();

        if (isResetLocked) {
            return;
        }

        setResetMessage('');
        setResetError('');
        setResetLoading(true);

        try {
            const { error: resetPasswordError } = await requestPasswordReset(normalizedResetEmail);

            if (resetPasswordError) {
                throw resetPasswordError;
            }

            setResetRetryEmail(normalizedResetEmail);
            setResetRetryMode('cooldown');
            setResetRetryAfter(DEFAULT_RESET_RETRY_SECONDS);
            setResetMessage('If an account exists for that email, a password reset link has been sent.');
        } catch (resetPasswordException) {
            console.error('Password reset error:', resetPasswordException);
            const message = String(resetPasswordException?.message || '').toLowerCase();
            const retryAfterSeconds = Number(resetPasswordException?.retryAfterSeconds);
            const resetRateLimitMode = resetPasswordException?.code === 'daily_limit'
                ? 'daily_limit'
                : 'cooldown';

            if (
                resetPasswordException?.status === 429
                || resetPasswordException?.code === 'cooldown'
                || resetPasswordException?.code === 'daily_limit'
                || message.includes('rate limit')
                || message.includes('too many requests')
            ) {
                setResetRetryEmail(normalizedResetEmail);
                setResetRetryMode(resetRateLimitMode);
                setResetRetryAfter(
                    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                        ? Math.ceil(retryAfterSeconds)
                        : resetRateLimitMode === 'daily_limit'
                            ? DEFAULT_RESET_DAILY_LIMIT_SECONDS
                            : DEFAULT_RESET_RETRY_SECONDS,
                );
                setResetError('');
            } else {
                setResetRetryEmail('');
                setResetRetryMode('');
                setResetRetryAfter(0);
                setResetError(getFriendlyResetRequestError(resetPasswordException));
            }
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
                                    disabled={resetLoading || isResetLocked}
                                >
                                    {resetLoading
                                        ? 'Sending...'
                                        : isResetLocked
                                            ? `Try again in ${formatCompactRetryDuration(resetRetryAfter)}`
                                            : 'Send reset link'}
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
                                {loginErrorMessage && (
                                    <div className="alert alert-danger" role="alert">
                                        {loginErrorMessage}
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
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-control"
                                        id="floatingPassword"
                                        placeholder="Password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingPassword">Password</label>
                                    <button
                                        type="button"
                                        className="btn btn-link position-absolute top-50 end-0 translate-middle-y me-3 p-0 text-secondary"
                                        style={{ zIndex: 4 }}
                                        onClick={() => setShowPassword((previous) => !previous)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fa-regular ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                                    </button>
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

                                <button type="submit" className="btn btn-auth" disabled={loading || isLoginLocked}>
                                    {loading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            Please wait...
                                        </>
                                    ) : isLoginLocked ? (
                                        `Try again in ${loginRetryAfter}s`
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
