import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import {
    clearSensitiveAuthParamsFromUrl,
    getAuthErrorMessageFromLocation,
    syncVerifiedUserProfile,
} from '../utils/emailVerification';
import '../styles/Auth.css';

const STATUS_COPY = {
    verified: {
        eyebrow: 'Account Confirmed',
        title: 'Your email has been verified',
        tone: 'success',
        message: 'Your account is now active. You may proceed to the login page and sign in using the email address and password you created.',
        note: 'You can now place orders, manage your profile, and continue using the shop normally.',
        cta: 'Proceed to Login',
    },
    already_verified: {
        eyebrow: 'Already Confirmed',
        title: 'This email is already verified',
        tone: 'success',
        message: 'Your account was already confirmed earlier. You may proceed to the login page anytime.',
        note: 'Use the same email and password you registered with to access your account.',
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

        const finishWithConfirmedUser = async (user) => {
            if (!isMounted || isResolved || !user) {
                return;
            }

            isResolved = true;
            clearSensitiveAuthParamsFromUrl();

            const syncResult = await syncVerifiedUserProfile(user);
            await supabase.auth.signOut();

            if (syncResult.error) {
                setPageStatus('error', STATUS_COPY.error.message);
                return;
            }

            const finalStatus = syncResult.wasAlreadyVerified ? 'already_verified' : 'verified';
            setPageStatus(finalStatus, STATUS_COPY[finalStatus].message);
        };

        const resolveFromCurrentSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user;

            if (currentUser?.email_confirmed_at || currentUser?.confirmed_at) {
                await finishWithConfirmedUser(currentUser);
                return true;
            }

            return false;
        };

        const errorMessage = getAuthErrorMessageFromLocation();

        if (errorMessage) {
            const nextStatus = getStatusFromError(errorMessage);
            clearSensitiveAuthParamsFromUrl();
            setPageStatus(nextStatus, normalizeMessage(errorMessage) || STATUS_COPY[nextStatus].message);
            return undefined;
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentUser = session?.user;

            if (currentUser?.email_confirmed_at || currentUser?.confirmed_at) {
                await finishWithConfirmedUser(currentUser);
            }
        });

        resolveFromCurrentSession()
            .then((resolvedFromSession) => {
                if (resolvedFromSession || isResolved) {
                    return;
                }

                timeoutId = window.setTimeout(async () => {
                    if (isResolved || !isMounted) {
                        return;
                    }

                    const resolvedAfterDelay = await resolveFromCurrentSession();

                    if (!resolvedAfterDelay && !isResolved && isMounted) {
                        clearSensitiveAuthParamsFromUrl();
                        setPageStatus('invalid', STATUS_COPY.invalid.message);
                    }
                }, 1500);
            })
            .catch((verificationError) => {
                console.error('Email verification page error:', verificationError);
                setPageStatus('error', STATUS_COPY.error.message);
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

                            <div className="auth-verification-checklist">
                                <div className="auth-verification-checklist-item">Use your registered email address when you log in.</div>
                                <div className="auth-verification-checklist-item">If you forget your password later, the reset link will be sent to the same email.</div>
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
