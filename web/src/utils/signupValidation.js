export const MIN_SIGNUP_AGE = 18;
export const MIN_PASSWORD_LENGTH = 8;

const NAME_SANITIZE_PATTERN = /[^A-Za-z\s]/g;
const MULTIPLE_SPACES_PATTERN = /\s+/g;
const VALID_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const BIRTHDAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
});

const normalizeName = (value = '') => String(value || '')
    .replace(MULTIPLE_SPACES_PATTERN, ' ')
    .trim();

export const sanitizeNameInput = (value = '') => String(value || '')
    .replace(NAME_SANITIZE_PATTERN, '')
    .replace(MULTIPLE_SPACES_PATTERN, ' ')
    .replace(/^\s+/, '');

const formatBirthdayPart = (value) => String(value).padStart(2, '0');

const normalizeReferenceDate = (referenceDate = new Date()) => (
    new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
);

const buildValidBirthdayDate = (year, month, day) => {
    const normalizedYear = Number.parseInt(year, 10);
    const normalizedMonth = Number.parseInt(month, 10);
    const normalizedDay = Number.parseInt(day, 10);

    if (
        !Number.isInteger(normalizedYear)
        || !Number.isInteger(normalizedMonth)
        || !Number.isInteger(normalizedDay)
    ) {
        return null;
    }

    const candidate = new Date(normalizedYear, normalizedMonth - 1, normalizedDay);

    if (
        candidate.getFullYear() !== normalizedYear
        || candidate.getMonth() !== normalizedMonth - 1
        || candidate.getDate() !== normalizedDay
    ) {
        return null;
    }

    return candidate;
};

export const getLatestAllowedBirthday = (
    minimumAge = MIN_SIGNUP_AGE,
    referenceDate = new Date(),
) => {
    const today = normalizeReferenceDate(referenceDate);
    const cutoffDate = new Date(
        today.getFullYear() - minimumAge,
        today.getMonth(),
        today.getDate(),
    );

    return {
        year: String(cutoffDate.getFullYear()),
        month: formatBirthdayPart(cutoffDate.getMonth() + 1),
        day: formatBirthdayPart(cutoffDate.getDate()),
        iso: `${cutoffDate.getFullYear()}-${formatBirthdayPart(cutoffDate.getMonth() + 1)}-${formatBirthdayPart(cutoffDate.getDate())}`,
        label: BIRTHDAY_LABEL_FORMATTER.format(cutoffDate),
    };
};

export const calculateAgeFromBirthdayParts = (
    year,
    month,
    day,
    referenceDate = new Date(),
) => {
    const birthdayDate = buildValidBirthdayDate(year, month, day);

    if (!birthdayDate) {
        return null;
    }

    const today = normalizeReferenceDate(referenceDate);
    let age = today.getFullYear() - birthdayDate.getFullYear();
    const hasReachedBirthdayThisYear =
        today.getMonth() > birthdayDate.getMonth()
        || (
            today.getMonth() === birthdayDate.getMonth()
            && today.getDate() >= birthdayDate.getDate()
        );

    if (!hasReachedBirthdayThisYear) {
        age -= 1;
    }

    return age;
};

export const isAtLeastAgeFromBirthdayParts = (
    year,
    month,
    day,
    minimumAge = MIN_SIGNUP_AGE,
    referenceDate = new Date(),
) => {
    const age = calculateAgeFromBirthdayParts(year, month, day, referenceDate);
    return age !== null && age >= minimumAge;
};

export const validateNameField = (value, label, { required = false } = {}) => {
    const normalizedValue = normalizeName(value);

    if (!normalizedValue) {
        return required ? `${label} is required.` : '';
    }

    if (!VALID_NAME_PATTERN.test(normalizedValue)) {
        return `${label} can only contain letters and spaces.`;
    }

    return '';
};

export const getPasswordStrength = (value = '') => {
    const password = String(value || '');
    const checks = {
        hasMinLength: password.length >= MIN_PASSWORD_LENGTH,
        hasLowercase: /[a-z]/.test(password),
        hasUppercase: /[A-Z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSymbol: /[^A-Za-z0-9\s]/.test(password),
    };
    const characterTypeCount = [
        checks.hasLowercase,
        checks.hasUppercase,
        checks.hasNumber,
        checks.hasSymbol,
    ].filter(Boolean).length;

    if (!password) {
        return {
            score: 0,
            label: 'Enter password',
            tone: 'neutral',
            isWeak: true,
            checks,
            characterTypeCount,
        };
    }

    if (checks.hasMinLength && characterTypeCount >= 4 && password.length >= 12) {
        return {
            score: 3,
            label: 'Strong',
            tone: 'strong',
            isWeak: false,
            checks,
            characterTypeCount,
        };
    }

    if (checks.hasMinLength && characterTypeCount >= 3) {
        return {
            score: 2,
            label: 'Fair',
            tone: 'fair',
            isWeak: false,
            checks,
            characterTypeCount,
        };
    }

    return {
        score: 1,
        label: 'Weak',
        tone: 'weak',
        isWeak: true,
        checks,
        characterTypeCount,
    };
};

export const getWeakPasswordMessage = () => (
    `Password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters and combine at least 3 of these: uppercase, lowercase, number, and symbol.`
);
