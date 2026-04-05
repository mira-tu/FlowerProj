import { supabase } from '../config/supabase';
import {
    buildCustomerProfilePayload,
    buildDefaultAddressPayload,
    getUserContactNumber,
    getUserNameParts,
} from './customerProfile';

export const EMAIL_VERIFICATION_PATH = '/email-verification';

const VALID_USER_ROLES = new Set(['customer', 'admin', 'employee']);
const FALLBACK_SITE_URL = 'https://flowerproj.vercel.app';

const normalizeBaseUrl = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const getSafeWindowOrigin = () => {
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

export const getPasswordResetRedirectUrl = () => `${getSafeWindowOrigin()}/reset-password`;

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
