import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
    clearSensitiveAuthParamsFromUrl,
    getAuthErrorMessageFromLocation,
    getLocationHashParams,
    getLocationSearchParams,
    syncVerifiedUserProfile,
} from '../utils/emailVerification';
import '../styles/Auth.css';

const VERIFICATION_TIMEOUT_MS = 10000;

const STATUS_COPY = {
    verified: {
        eyebrow: 'Verification Complete',
        title: 'Your email has been confirmed',
        tone: 'success',
        message: 'Your email address has been successfully confirmed. You may now log in to your account.',
        note: 'Return to the login page and sign in using the email address and password you registered with.',
        cta: 'Go to Login',
    },
    already_verified: {
        eyebrow: 'Already Verified',
        title: 'Your email is already confirmed',
        tone: 'success',
        message: 'This email address has already been confirmed. You may now log in to your account.',
        note: 'Return to the login page and sign in using the email address and password you registered with.',
        cta: 'Go to Login',
    },
    expired: {
        eyebrow: 'Link Expired',
        title: 'This verification link has expired',
        tone: 'warning',
        message: 'This verification link has expired. Please request a new one.',
        note: 'Return to the login page and use the resend verification option to receive a fresh link.',
        cta: 'Back to Login',
    },
    invalid: {
        eyebrow: 'Invalid Link',
        title: 'We could not confirm this email',
        tone: 'danger',
        message: 'This verification link is invalid. Please request a new one.',
        note: 'The link may be incomplete, outdated, or already replaced by a newer verification email.',
        cta: 'Back to Login',
    },
    error: {
        eyebrow: 'Verification Problem',
        title: 'We could not verify this email right now',
        tone: 'danger',
        message: 'We could not verify this email right now. Please try again.',
        note: 'Please wait a moment and try the link again. If the problem continues, request a new verification email from the login page.',
        cta: 'Back to Login',
    },
};

const normalizeMessage = (value = '') => decodeURIComponent(String(value).replace(/\+/g, ' ')).trim();

const getStatusFromError = (value = '') => {
    const message = normalizeMessage(value).toLowerCase();

    if (!message) {
        return 'invalid';
    }

    if (message.includes('already') && (message.includes('confirmed') || message.includes('verified'))) {
        return 'already_verified';
    }

    if (message.includes('expired')) {
        return 'expired';
    }

    if (message.includes('invalid') || message.includes('otp') || message.includes('token')) {
        return 'invalid';
    }

    return 'error';
};

const EmailVerification = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [status, setStatus] = useState('verified');
    const [message, setMessage] = useState(STATUS_COPY.verified.message);

    useEffect(() => {
        let isMounted = true;
        let isResolved = false;
        let timeoutId;

        const setPageStatus = (nextStatus, nextMessage) => {
            if (!isMounted) {
                return;
            }

            setStatus(nextStatus);
            setMessage(nextMessage || STATUS_COPY[nextStatus]?.message || STATUS_COPY.error.message);
            setIsLoading(false);
        };

        const finishWithConfirmedUser = async (user, fallbackStatus = 'verified') => {
            if (!isMounted || isResolved || !user) {
                return;
            }

            isResolved = true;
            window.clearTimeout(timeoutId);

            try {
                const syncResult = await syncVerifiedUserProfile(user);
                await supabase.auth.signOut();
                clearSensitiveAuthParamsFromUrl();

                if (syncResult.error) {
                    setPageStatus('error', STATUS_COPY.error.message);
                    return;
                }

                setPageStatus(fallbackStatus, STATUS_COPY[fallbackStatus]?.message || STATUS_COPY.verified.message);
            } catch (verificationError) {
                console.error('Email verification finish error:', verificationError);
                clearSensitiveAuthParamsFromUrl();
                setPageStatus('error', STATUS_COPY.error.message);
            }
        };

        const tryConfirmFromRedirect = async () => {
            const searchParams = getLocationSearchParams();
            const hashParams = getLocationHashParams();
            const actionType = String(searchParams.get('type') || hashParams.get('type') || '').trim().toLowerCase();
            const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
            const code = searchParams.get('code');
            const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

            if (tokenHash && ['signup', 'email', 'invite'].includes(actionType)) {
                const verificationType = actionType === 'email' ? 'email' : actionType === 'invite' ? 'invite' : 'signup';
                const { data, error: verifyError } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: verificationType,
                });

                if (verifyError) {
                    throw verifyError;
                }

                const verifiedUser = data?.user || data?.session?.user;

                if (verifiedUser) {
                    await finishWithConfirmedUser(verifiedUser, 'verified');
                    return true;
                }
            }

            if (code) {
                const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

                if (exchangeError) {
                    throw exchangeError;
                }

                const verifiedUser = data?.session?.user || data?.user;

                if (verifiedUser?.email_confirmed_at || verifiedUser?.confirmed_at) {
                    await finishWithConfirmedUser(verifiedUser, 'verified');
                    return true;
                }
            }

            if (accessToken && refreshToken) {
                const { data, error: setSessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });

                if (setSessionError) {
                    throw setSessionError;
                }

                const verifiedUser = data?.session?.user;

                if (verifiedUser?.email_confirmed_at || verifiedUser?.confirmed_at) {
                    await finishWithConfirmedUser(verifiedUser, 'verified');
                    return true;
                }
            }

            return false;
        };

        const resolveFromCurrentSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user;

            if (currentUser?.email_confirmed_at || currentUser?.confirmed_at) {
                await finishWithConfirmedUser(currentUser, 'verified');
                return true;
            }

            return false;
        };

        const errorMessage = getAuthErrorMessageFromLocation();

        if (errorMessage) {
            const nextStatus = getStatusFromError(errorMessage);
            clearSensitiveAuthParamsFromUrl();
            setPageStatus(nextStatus, STATUS_COPY[nextStatus]?.message || STATUS_COPY.error.message);
            return undefined;
        }

        timeoutId = window.setTimeout(() => {
            if (isResolved || !isMounted) {
                return;
            }

            isResolved = true;
            clearSensitiveAuthParamsFromUrl();
            setPageStatus('invalid', STATUS_COPY.invalid.message);
        }, VERIFICATION_TIMEOUT_MS);

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentUser = session?.user;

            if (currentUser?.email_confirmed_at || currentUser?.confirmed_at) {
                await finishWithConfirmedUser(currentUser, 'verified');
            }
        });

        Promise.resolve()
            .then(() => tryConfirmFromRedirect())
            .then((resolvedFromSession) => {
                if (resolvedFromSession || isResolved) {
                    return;
                }

                return resolveFromCurrentSession();
            })
            .then((resolvedFromSession) => {
                if (resolvedFromSession || isResolved) {
                    return;
                }

                window.setTimeout(async () => {
                    if (isResolved || !isMounted) {
                        return;
                    }

                    const resolvedAfterDelay = await resolveFromCurrentSession();

                    if (resolvedAfterDelay || isResolved || !isMounted) {
                        return;
                    }

                    isResolved = true;
                    window.clearTimeout(timeoutId);
                    clearSensitiveAuthParamsFromUrl();
                    setPageStatus('invalid', STATUS_COPY.invalid.message);
                }, 1500);
            })
            .catch((verificationError) => {
                console.error('Email verification page error:', verificationError);
                isResolved = true;
                window.clearTimeout(timeoutId);
                clearSensitiveAuthParamsFromUrl();
                const nextStatus = getStatusFromError(verificationError?.message || '');
                setPageStatus(nextStatus, STATUS_COPY[nextStatus]?.message || STATUS_COPY.error.message);
            });

        return () => {
            isMounted = false;

            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }

            subscription.unsubscribe();
        };
    }, []);

    const currentStatus = STATUS_COPY[status] || STATUS_COPY.error;

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h3>Email Confirmation</h3>
                        <h2>Jocerry&apos;s Flower Shop</h2>
                        <p>We&apos;re securing your account and preparing your sign-in access.</p>
                    </div>
                </div>
                <div className="auth-form-container auth-verification-panel">
                    {!isLoading && (
                        <div className="auth-verification-eyebrow">{currentStatus.eyebrow}</div>
                    )}
                    <h2 className="auth-title">
                        {isLoading ? 'Verifying your email' : currentStatus.title}
                    </h2>
                    <p className="auth-subtitle">
                        {isLoading
                            ? 'Please wait while we confirm your account.'
                            : currentStatus.note}
                    </p>

                    {isLoading ? (
                        <div className="d-flex align-items-center gap-3 py-3">
                            <div className="spinner-border text-danger" role="status" aria-hidden="true"></div>
                            <span>Checking your verification link...</span>
                        </div>
                    ) : (
                        <>
                            <div className={`alert alert-${currentStatus.tone}`} role="alert">
                                {message}
                            </div>

                            <div className="d-flex flex-column gap-2">
                                <Link to="/login" className="btn btn-auth">
                                    {currentStatus.cta}
                                </Link>
                                <Link to="/signup" className="auth-link text-center">
                                    Back to Sign Up
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmailVerification;
