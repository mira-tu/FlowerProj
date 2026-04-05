import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
    clearPasswordRecoveryInProgress,
    clearSensitiveAuthParamsFromUrl,
    getAuthErrorMessageFromLocation,
    hasRecoveryLinkIndicators,
    isPasswordRecoveryInProgress,
    markPasswordRecoveryInProgress,
} from '../utils/emailVerification';
import '../styles/Auth.css';

const MIN_PASSWORD_LENGTH = 6;

const STATUS_COPY = {
    checking: {
        eyebrow: 'Checking Link',
        title: 'Checking your reset link',
        tone: 'secondary',
        message: 'Please wait while we confirm your password reset request.',
        note: 'We are validating the reset link securely before allowing any password changes.',
    },
    ready: {
        eyebrow: 'Reset Approved',
        title: 'Choose a new password',
        tone: 'primary',
        message: 'Your reset link is valid. Enter a new password below.',
        note: 'For your security, this page only works after a valid password reset request.',
    },
    success: {
        eyebrow: 'Password Updated',
        title: 'Your password has been reset',
        tone: 'success',
        message: 'Your password has been updated. You may now sign in with your new password.',
        note: 'Use the same email address you requested the reset for when you log back in.',
    },
    expired: {
        eyebrow: 'Link Expired',
        title: 'This reset link has expired',
        tone: 'warning',
        message: 'This reset link has expired. Please request a new one from the login page.',
        note: 'For security, password reset links only work for a limited time.',
    },
    invalid: {
        eyebrow: 'Invalid Link',
        title: 'Invalid or expired reset link',
        tone: 'danger',
        message: 'Invalid or expired reset link. Please request a new one from the login page.',
        note: 'Typing the reset-password URL manually will not work without a valid reset request.',
    },
    error: {
        eyebrow: 'Reset Problem',
        title: 'We could not process this reset link',
        tone: 'danger',
        message: 'We could not process this reset link right now. Please request a new one.',
        note: 'If the issue continues, try sending yourself a fresh reset email.',
    },
};

const normalizeMessage = (value = '') => decodeURIComponent(String(value).replace(/\+/g, ' ')).trim();

const getResetStatusFromError = (value = '') => {
    const message = normalizeMessage(value).toLowerCase();

    if (!message) {
        return 'invalid';
    }

    if (message.includes('expired')) {
        return 'expired';
    }

    if (message.includes('invalid') || message.includes('otp') || message.includes('token')) {
        return 'invalid';
    }

    return 'error';
};

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('checking');
    const [message, setMessage] = useState(STATUS_COPY.checking.message);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;
        let timeoutId;
        const recoveryIndicatorsPresent = hasRecoveryLinkIndicators();
        const errorMessage = getAuthErrorMessageFromLocation();

        const setPageStatus = (nextStatus, nextMessage) => {
            if (!isMounted) {
                return;
            }

            setStatus(nextStatus);
            setMessage(nextMessage || STATUS_COPY[nextStatus]?.message || STATUS_COPY.error.message);
            setError('');
        };

        const resolveRecoverySession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user && (recoveryIndicatorsPresent || isPasswordRecoveryInProgress())) {
                markPasswordRecoveryInProgress();
                clearSensitiveAuthParamsFromUrl();
                setPageStatus('ready', STATUS_COPY.ready.message);
                return true;
            }

            return false;
        };

        if (errorMessage) {
            clearSensitiveAuthParamsFromUrl();
            clearPasswordRecoveryInProgress();
            const nextStatus = getResetStatusFromError(errorMessage);
            setPageStatus(nextStatus, normalizeMessage(errorMessage) || STATUS_COPY[nextStatus].message);
            return undefined;
        }

        const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session?.user) {
                markPasswordRecoveryInProgress();
                clearSensitiveAuthParamsFromUrl();
                setPageStatus('ready', STATUS_COPY.ready.message);
            }

            if (event === 'SIGNED_OUT') {
                clearPasswordRecoveryInProgress();
            }
        });

        resolveRecoverySession()
            .then((resolvedFromSession) => {
                if (resolvedFromSession) {
                    return;
                }

                timeoutId = window.setTimeout(async () => {
                    const resolvedAfterDelay = await resolveRecoverySession();

                    if (!resolvedAfterDelay && isMounted) {
                        clearSensitiveAuthParamsFromUrl();
                        clearPasswordRecoveryInProgress();
                        const fallbackStatus = recoveryIndicatorsPresent ? 'expired' : 'invalid';
                        setPageStatus(fallbackStatus, STATUS_COPY[fallbackStatus].message);
                    }
                }, 1800);
            })
            .catch((resetFlowError) => {
                console.error('Reset password page error:', resetFlowError);
                clearPasswordRecoveryInProgress();
                setPageStatus('error', STATUS_COPY.error.message);
            });

        return () => {
            isMounted = false;

            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }

            subscription.subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (status !== 'ready') {
            setError('Invalid or expired reset link. Please request a new one from the login page.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (String(password || '').trim().length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });

            if (updateError) {
                throw updateError;
            }

            clearSensitiveAuthParamsFromUrl();
            clearPasswordRecoveryInProgress();
            setStatus('success');
            setMessage(STATUS_COPY.success.message);
            setPassword('');
            setConfirmPassword('');
            await supabase.auth.signOut();

            window.setTimeout(() => {
                navigate('/login?reset=success');
            }, 1800);
        } catch (updatePasswordError) {
            console.error('Password update error:', updatePasswordError);
            setError(updatePasswordError?.message || 'Unable to update password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const currentStatus = STATUS_COPY[status] || STATUS_COPY.error;
    const isChecking = status === 'checking';
    const isReady = status === 'ready';

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h3>Reset Your Password</h3>
                        <h2>Jocerry&apos;s Flower Shop</h2>
                        <p>Only valid password recovery links can unlock this page.</p>
                    </div>
                </div>
                <div className="auth-form-container auth-verification-panel">
                    {!isChecking && (
                        <div className="auth-verification-eyebrow">{currentStatus.eyebrow}</div>
                    )}
                    <h2 className="auth-title">
                        {isChecking ? STATUS_COPY.checking.title : currentStatus.title}
                    </h2>
                    <p className="auth-subtitle">
                        {isChecking ? STATUS_COPY.checking.note : currentStatus.note}
                    </p>

                    {isChecking ? (
                        <div className="d-flex align-items-center gap-3 py-3">
                            <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
                            <span>Checking your password reset link...</span>
                        </div>
                    ) : (
                        <>
                            <div className={`alert alert-${currentStatus.tone}`} role="alert">
                                {message}
                            </div>
                            {error && (
                                <div className="alert alert-danger" role="alert">
                                    {error}
                                </div>
                            )}

                            {isReady ? (
                                <>
                                    <div className="auth-verification-checklist">
                                        <div className="auth-verification-checklist-item">Choose a password that is at least six characters long.</div>
                                        <div className="auth-verification-checklist-item">This page only works after a valid reset email has created a secure recovery session.</div>
                                    </div>

                                    <form onSubmit={handleSubmit}>
                                        <div className="form-floating mb-3">
                                            <input
                                                type="password"
                                                className="form-control"
                                                id="newPassword"
                                                placeholder="New password"
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                required
                                                disabled={loading}
                                                autoComplete="new-password"
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
                                                onChange={(event) => setConfirmPassword(event.target.value)}
                                                required
                                                disabled={loading}
                                                autoComplete="new-password"
                                            />
                                            <label htmlFor="confirmPassword">Confirm password</label>
                                        </div>

                                        <button type="submit" className="btn btn-auth" disabled={loading}>
                                            {loading ? 'Updating...' : 'Update password'}
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <div className="d-flex flex-column gap-2">
                                    <Link to="/login" className="btn btn-auth">
                                        Back to Login
                                    </Link>
                                    <Link to="/login" className="auth-link text-center">
                                        Request a New Reset Email
                                    </Link>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
