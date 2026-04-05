import { formatPhoneNumber } from './format';

export const GENDER_OPTIONS = [
    { value: 'Female', label: 'Female' },
    { value: 'Male', label: 'Male' },
    { value: 'Non-binary', label: 'Non-binary' },
    { value: 'Prefer not to say', label: 'Prefer not to say' },
];

export const DEFAULT_SIGNUP_ADDRESS = {
    street: '',
    barangay: '',
    city: 'Zamboanga City',
};

const toTrimmedString = (value) => String(value || '').trim();

const getSourceMetadata = (source) => (
    source?.user_metadata && typeof source.user_metadata === 'object'
        ? source.user_metadata
        : source && typeof source === 'object'
            ? source
            : {}
);

export const buildFullName = ({ firstName = '', middleName = '', lastName = '' }) => (
    [firstName, middleName, lastName]
        .map(toTrimmedString)
        .filter(Boolean)
        .join(' ')
);

export const splitFullName = (value = '') => {
    const parts = toTrimmedString(value).split(/\s+/).filter(Boolean);

    if (!parts.length) {
        return {
            firstName: '',
            middleName: '',
            lastName: '',
        };
    }

    if (parts.length === 1) {
        return {
            firstName: parts[0],
            middleName: '',
            lastName: '',
        };
    }

    if (parts.length === 2) {
        return {
            firstName: parts[0],
            middleName: '',
            lastName: parts[1],
        };
    }

    return {
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(' '),
        lastName: parts[parts.length - 1],
    };
};

export const getUserNameParts = (profile = {}, authUser = null) => {
    const metadata = getSourceMetadata(authUser);
    const fallbackName = toTrimmedString(
        profile?.full_name
        || profile?.name
        || metadata?.full_name
        || metadata?.name
    );
    const fallbackParts = splitFullName(fallbackName);

    return {
        firstName: toTrimmedString(profile?.first_name || metadata?.first_name || fallbackParts.firstName),
        middleName: toTrimmedString(profile?.middle_name || metadata?.middle_name || fallbackParts.middleName),
        lastName: toTrimmedString(profile?.last_name || metadata?.last_name || fallbackParts.lastName),
    };
};

export const getUserFullName = (profile = {}, authUser = null) => {
    const metadata = getSourceMetadata(authUser || profile);
    const explicitName = toTrimmedString(
        profile?.full_name
        || profile?.name
        || metadata?.full_name
        || metadata?.name
    );

    if (explicitName) {
        return explicitName;
    }

    return buildFullName(getUserNameParts(profile, authUser));
};

export const getUserContactNumber = (profile = {}, authUser = null) => {
    const metadata = getSourceMetadata(authUser || profile);
    return formatPhoneNumber(profile?.phone || metadata?.phone || '');
};

export const isValidContactNumber = (value = '') => /^09\d{9}$/.test(String(value || '').replace(/\D/g, ''));

export const buildCustomerProfilePayload = ({
    firstName = '',
    middleName = '',
    lastName = '',
    email = '',
    contactNumber = '',
    birthday = '',
    gender = '',
} = {}) => {
    const normalizedFirstName = toTrimmedString(firstName);
    const normalizedMiddleName = toTrimmedString(middleName);
    const normalizedLastName = toTrimmedString(lastName);
    const normalizedEmail = toTrimmedString(email).toLowerCase();
    const normalizedContactNumber = formatPhoneNumber(contactNumber);
    const normalizedBirthday = toTrimmedString(birthday);
    const normalizedGender = toTrimmedString(gender);

    return {
        name: buildFullName({
            firstName: normalizedFirstName,
            middleName: normalizedMiddleName,
            lastName: normalizedLastName,
        }),
        first_name: normalizedFirstName,
        middle_name: normalizedMiddleName || null,
        last_name: normalizedLastName,
        email: normalizedEmail,
        phone: normalizedContactNumber,
        birthdate: normalizedBirthday || null,
        gender: normalizedGender || null,
        role: 'customer',
    };
};

export const buildCustomerMetadata = (values = {}) => {
    const profilePayload = buildCustomerProfilePayload(values);

    return {
        name: profilePayload.name,
        full_name: profilePayload.name,
        first_name: profilePayload.first_name,
        middle_name: profilePayload.middle_name || '',
        last_name: profilePayload.last_name,
        phone: profilePayload.phone,
        birthdate: profilePayload.birthdate || '',
        gender: profilePayload.gender || '',
    };
};

export const buildDefaultAddressMetadata = (address = {}) => ({
    default_address_label: 'Home',
    default_address_street: toTrimmedString(address?.street),
    default_address_barangay: toTrimmedString(address?.barangay),
    default_address_city: toTrimmedString(address?.city || DEFAULT_SIGNUP_ADDRESS.city),
});

export const buildCustomerProfileFormState = (profile = {}, authUser = null) => {
    const nameParts = getUserNameParts(profile, authUser);
    const metadata = getSourceMetadata(authUser);

    return {
        firstName: nameParts.firstName,
        middleName: nameParts.middleName,
        lastName: nameParts.lastName,
        phone: getUserContactNumber(profile, authUser),
        dateOfBirth: toTrimmedString(profile?.birthdate || metadata?.birthdate),
        gender: toTrimmedString(profile?.gender || metadata?.gender),
        currentPassword: '',
        newPassword: '',
    };
};

export const hasCompleteAddress = (address = {}) => (
    Boolean(
        toTrimmedString(address?.street)
        && toTrimmedString(address?.barangay)
        && toTrimmedString(address?.city || DEFAULT_SIGNUP_ADDRESS.city)
    )
);

export const formatAddressSummary = (address = {}) => (
    [
        toTrimmedString(address?.street),
        toTrimmedString(address?.barangay),
        toTrimmedString(address?.city || DEFAULT_SIGNUP_ADDRESS.city),
    ]
        .filter(Boolean)
        .join(', ')
);

export const buildDefaultAddressPayload = ({
    userId,
    firstName = '',
    middleName = '',
    lastName = '',
    contactNumber = '',
    address = {},
} = {}) => ({
    user_id: userId,
    label: 'Home',
    name: buildFullName({ firstName, middleName, lastName }),
    phone: formatPhoneNumber(contactNumber),
    street: toTrimmedString(address?.street),
    barangay: toTrimmedString(address?.barangay),
    city: toTrimmedString(address?.city || DEFAULT_SIGNUP_ADDRESS.city),
    province: '',
    is_default: true,
});
