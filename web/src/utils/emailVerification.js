import { supabase } from '../config/supabase';
import {
    buildCustomerProfilePayload,
    buildDefaultAddressPayload,
    getUserContactNumber,
    getUserNameParts,
} from './customerProfile';

export const EMAIL_VERIFICATION_PATH = '/email-verification';
export const PASSWORD_RESET_PATH = '/reset-password';

const VALID_USER_ROLES = new Set(['customer', 'admin', 'employee']);
const FALLBACK_SITE_URL = 'https://jocerrys-flowershop.up.railway.app';
const PASSWORD_RECOVERY_STORAGE_KEY = 'auth.password-recovery.in-progress';
const AUTH_QUERY_KEYS = new Set([
    'code',
    'error',
    'error_description',
    'redirect_to',
    'token',
    'token_hash',
    'type',
]);
const AUTH_HASH_KEYS = new Set([
    'access_token',
    'error',
    'error_description',
    'expires_at',
    'expires_in',
    'provider_token',
    'refresh_token',
    'token_hash',
    'token_type',
    'type',
]);

const normalizeBaseUrl = (value = '') => String(value || '').trim().replace(/\/+$/, '');
const getBrowserLocation = () => (typeof window === 'undefined' ? null : window.location);

const getCurrentWindowOrigin = () => {
    const location = getBrowserLocation();

    if (!location?.origin) {
        return '';
    }

    return normalizeBaseUrl(location.origin);
};

const getSafeWindowOrigin = () => {
    const currentWindowOrigin = getCurrentWindowOrigin();

    if (currentWindowOrigin) {
        return currentWindowOrigin;
    }

    const configuredOrigin = normalizeBaseUrl(
        import.meta.env.VITE_SITE_URL
        || import.meta.env.VITE_PUBLIC_SITE_URL
    );

    if (configuredOrigin) {
        return configuredOrigin;
    }

    if (typeof window === 'undefined' || !window.location?.origin) {
        return FALLBACK_SITE_URL;
    }

    return normalizeBaseUrl(window.location.origin);
};

const normalizeUserRole = (value) => (
    VALID_USER_ROLES.has(value) ? value : 'customer'
);

const buildAuthBackedProfilePayload = (authUser, existingRole) => {
    const nameParts = getUserNameParts({}, authUser);
    const profilePayload = buildCustomerProfilePayload({
        firstName: nameParts.firstName,
        middleName: nameParts.middleName,
        lastName: nameParts.lastName,
        email: authUser?.email || '',
        contactNumber: authUser?.user_metadata?.phone || '',
        birthday: authUser?.user_metadata?.birthdate || '',
        gender: authUser?.user_metadata?.gender || '',
    });

    return {
        id: authUser.id,
        ...profilePayload,
        role: normalizeUserRole(existingRole || authUser?.user_metadata?.role || authUser?.app_metadata?.role),
    };
};

export const getEmailVerificationRedirectOrigin = () => getSafeWindowOrigin();
export const getEmailVerificationRedirectUrl = () => `${getSafeWindowOrigin()}${EMAIL_VERIFICATION_PATH}`;
export const getPasswordResetRedirectUrl = () => `${getSafeWindowOrigin()}${PASSWORD_RESET_PATH}`;

export const getLocationSearchParams = () => new URLSearchParams(getBrowserLocation()?.search || '');
export const getLocationHashParams = () => new URLSearchParams((getBrowserLocation()?.hash || '').replace(/^#/, ''));

export const getAuthErrorMessageFromLocation = () => {
    const searchParams = getLocationSearchParams();
    const hashParams = getLocationHashParams();

    return (
        searchParams.get('error_description')
        || searchParams.get('error')
        || hashParams.get('error_description')
        || hashParams.get('error')
        || ''
    );
};

export const clearSensitiveAuthParamsFromUrl = () => {
    const location = getBrowserLocation();

    if (!location) {
        return;
    }

    const url = new URL(location.href);
    const nextSearchParams = new URLSearchParams(url.search);
    const nextHashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

    AUTH_QUERY_KEYS.forEach((key) => nextSearchParams.delete(key));
    AUTH_HASH_KEYS.forEach((key) => nextHashParams.delete(key));

    const nextSearch = nextSearchParams.toString();
    const nextHash = nextHashParams.toString();
    const nextRelativeUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`;

    window.history.replaceState({}, document.title, nextRelativeUrl);
};

export const hasRecoveryLinkIndicators = () => {
    const searchParams = getLocationSearchParams();
    const hashParams = getLocationHashParams();
    const actionType = String(searchParams.get('type') || hashParams.get('type') || '').trim().toLowerCase();

    return Boolean(
        actionType === 'recovery'
        || searchParams.get('token_hash')
        || searchParams.get('code')
        || hashParams.get('access_token')
        || hashParams.get('refresh_token')
    );
};

export const markPasswordRecoveryInProgress = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'true');
};

export const isPasswordRecoveryInProgress = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === 'true';
};

export const clearPasswordRecoveryInProgress = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
};

export const fetchUserVerificationProfile = async (userId) => {
    if (!userId) {
        return { data: null, error: null };
    }

    return supabase
        .from('users')
        .select('id, role, email_verified, email_verified_at')
        .eq('id', userId)
        .maybeSingle();
};

export const syncVerifiedUserProfile = async (authUser) => {
    if (!authUser?.id) {
        return { verified: false, wasAlreadyVerified: false, error: null };
    }

    const { data: existingProfile, error: existingProfileError } = await fetchUserVerificationProfile(authUser.id);

    if (existingProfileError) {
        return {
            verified: false,
            wasAlreadyVerified: false,
            error: existingProfileError,
        };
    }

    const confirmedAt =
        authUser?.email_confirmed_at ||
        authUser?.confirmed_at ||
        existingProfile?.email_verified_at ||
        new Date().toISOString();

    const nextProfile = {
        ...buildAuthBackedProfilePayload(authUser, existingProfile?.role),
        email_verified: true,
        email_verified_at: confirmedAt,
    };

    const { error: upsertError } = await supabase
        .from('users')
        .upsert(nextProfile, { onConflict: 'id' });

    const addressSyncResult = await ensureDefaultAddressForVerifiedUser(authUser);

    return {
        verified: !upsertError,
        wasAlreadyVerified: Boolean(existingProfile?.email_verified),
        error: upsertError || addressSyncResult.error,
    };
};

export const ensureDefaultAddressForVerifiedUser = async (authUser) => {
    if (!authUser?.id) {
        return { created: false, error: null };
    }

    const metadata = authUser.user_metadata || {};
    const street = String(metadata.default_address_street || '').trim();
    const barangay = String(metadata.default_address_barangay || '').trim();
    const city = String(metadata.default_address_city || '').trim() || 'Zamboanga City';

    if (!street || !barangay) {
        return { created: false, error: null };
    }

    const { data: existingAddresses, error: existingAddressesError } = await supabase
        .from('addresses')
        .select('id')
        .eq('user_id', authUser.id)
        .limit(1);

    if (existingAddressesError) {
        return {
            created: false,
            error: existingAddressesError,
        };
    }

    if (existingAddresses?.length) {
        return { created: false, error: null };
    }

    const nameParts = getUserNameParts({}, authUser);
    const { error: insertError } = await supabase
        .from('addresses')
        .insert([
            buildDefaultAddressPayload({
                userId: authUser.id,
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName,
                contactNumber: getUserContactNumber({}, authUser),
                address: {
                    street,
                    barangay,
                    city,
                },
            }),
        ]);

    return {
        created: !insertError,
        error: insertError,
    };
};

export const ensureVerifiedUserSession = async (authUser) => {
    if (!authUser?.id) {
        return {
            user: null,
            shouldSignOut: false,
            error: null,
        };
    }

    const { data: verificationProfile, error: verificationProfileError } = await fetchUserVerificationProfile(authUser.id);

    if (verificationProfileError) {
        return {
            user: authUser,
            shouldSignOut: false,
            error: verificationProfileError,
        };
    }

    const authUserIsConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);

    if (!verificationProfile) {
        if (authUserIsConfirmed) {
            const syncResult = await syncVerifiedUserProfile(authUser);

            return {
                user: authUser,
                shouldSignOut: false,
                error: syncResult.error,
            };
        }

        return {
            user: null,
            shouldSignOut: true,
            error: null,
        };
    }

    if (verificationProfile.email_verified) {
        const addressSyncResult = await ensureDefaultAddressForVerifiedUser(authUser);

        return {
            user: authUser,
            shouldSignOut: false,
            error: addressSyncResult.error,
        };
    }

    if (authUserIsConfirmed) {
        const syncResult = await syncVerifiedUserProfile(authUser);

        if (!syncResult.error) {
            return {
                user: authUser,
                shouldSignOut: false,
                error: null,
            };
        }

        return {
            user: authUser,
            shouldSignOut: false,
            error: syncResult.error,
        };
    }

    return {
        user: null,
        shouldSignOut: true,
        error: null,
    };
};

export const resendEmailVerification = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
        return {
            data: null,
            error: new Error('Email is required to resend the verification link.'),
        };
    }

    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
            emailRedirectTo: getEmailVerificationRedirectUrl(),
        },
    });

    return {
        data: error ? null : {
            status: 'sent',
            message: 'We sent another verification email. Check your inbox and spam folder.',
        },
        error,
    };
};

export const secureSignIn = async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
        return {
            data: null,
            error: new Error('Email and password are required to sign in.'),
        };
    }

    const { data, error } = await supabase.functions.invoke('secure-login', {
        body: {
            email: normalizedEmail,
            password: normalizedPassword,
        },
    });

    if (!error) {
        return { data, error: null };
    }

    if (error?.context && typeof error.context.json === 'function') {
        try {
            const errorPayload = await error.context.json();
            const nextError = new Error(
                errorPayload?.message || error.message || 'Unable to sign in right now.',
            );
            nextError.status = error.context.status;
            nextError.code = errorPayload?.status;

            const retryAfterSeconds = Number(errorPayload?.retry_after_seconds);

            if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
                nextError.retryAfterSeconds = Math.ceil(retryAfterSeconds);
            }

            if (errorPayload?.blocked_until) {
                nextError.blockedUntil = errorPayload.blocked_until;
            }

            return {
                data: null,
                error: nextError,
            };
        } catch {
            // Fall through to the original error below.
        }
    }

    return {
        data: null,
        error,
    };
};

export const checkSignupEmailAvailability = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
        return {
            data: null,
            error: new Error('Email is required to create an account.'),
        };
    }

    const { data, error } = await supabase.functions.invoke('check-signup-email', {
        body: {
            email: normalizedEmail,
        },
    });

    if (!error) {
        return { data, error: null };
    }

    if (error?.context && typeof error.context.json === 'function') {
        try {
            const errorPayload = await error.context.json();
            const nextError = new Error(errorPayload?.message || error.message || 'Unable to check this email right now.');
            nextError.status = error.context.status;
            nextError.code = errorPayload?.status;

            return {
                data: null,
                error: nextError,
            };
        } catch {
            // Fall through to the original error below.
        }
    }

    return {
        data: null,
        error,
    };
};

export const requestPasswordReset = async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
        return {
            data: null,
            error: new Error('Email is required to request a password reset link.'),
        };
    }

    const { data, error } = await supabase.functions.invoke('request-password-reset', {
        body: {
            email: normalizedEmail,
            redirectTo: getPasswordResetRedirectUrl(),
        },
    });

    if (!error) {
        return { data, error: null };
    }

    if (error?.context && typeof error.context.json === 'function') {
        try {
            const errorPayload = await error.context.json();
            const nextError = new Error(errorPayload?.message || error.message || 'Unable to send a reset link right now.');
            nextError.status = error.context.status;
            nextError.code = errorPayload?.status;

            const retryAfterSeconds = Number(errorPayload?.retry_after_seconds);

            if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
                nextError.retryAfterSeconds = Math.ceil(retryAfterSeconds);
            }

            if (errorPayload?.blocked_until) {
                nextError.blockedUntil = errorPayload.blocked_until;
            }

            return {
                data: null,
                error: nextError,
            };
        } catch {
            // Fall through to the original error below.
        }
    }

    return {
        data: null,
        error,
    };
};
