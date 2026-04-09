import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import SignupAddressModal from '../components/SignupAddressModal';
import { formatPhoneNumber } from '../utils/format';
import {
    buildCustomerMetadata,
    buildDefaultAddressMetadata,
    buildCustomerProfilePayload,
    DEFAULT_SIGNUP_ADDRESS,
    formatAddressSummary,
    GENDER_OPTIONS,
    hasCompleteAddress,
    isValidContactNumber,
} from '../utils/customerProfile';
import { getEmailVerificationRedirectUrl } from '../utils/emailVerification';
import {
    getPasswordStrength,
    getWeakPasswordMessage,
    isAtLeastAgeFromBirthdayParts,
    MIN_PASSWORD_LENGTH,
    MIN_SIGNUP_AGE,
    sanitizeNameInput,
    validateNameField,
} from '../utils/signupValidation';
import '../styles/Auth.css';

const EARLIEST_BIRTH_YEAR = 1900;
const BIRTHDAY_INPUT_LENGTHS = {
    birthMonth: 2,
    birthDay: 2,
    birthYear: 4,
};
const MONTH_OPTIONS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
];
const NAME_FIELDS = new Set(['firstName', 'middleName', 'lastName']);

const sanitizeBirthdayInput = (part, value) => String(value || '')
    .replace(/\D/g, '')
    .slice(0, BIRTHDAY_INPUT_LENGTHS[part] || 4);

const getDaysInMonth = (year, month) => {
    if (!month) {
        return 31;
    }

    const normalizedYear = Number(year) || 2000;
    const normalizedMonth = Number(month);
    return new Date(normalizedYear, normalizedMonth, 0).getDate();
};

const isValidBirthdayParts = (year, month, day) => {
    if (!year || !month || !day) {
        return false;
    }

    const normalizedYear = Number(year);
    const normalizedMonth = Number(month);
    const normalizedDay = Number(day);

    if (!Number.isInteger(normalizedYear) || String(year).length !== 4) {
        return false;
    }

    if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
        return false;
    }

    const maxDay = getDaysInMonth(year, month);

    if (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > maxDay) {
        return false;
    }

    return true;
};

const buildIsoBirthday = (year, month, day) => (
    isValidBirthdayParts(year, month, day)
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : ''
);

const Signup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        contactNumber: '',
        birthMonth: '',
        birthDay: '',
        birthYear: '',
        birthday: '',
        gender: '',
    });
    const [address, setAddress] = useState(DEFAULT_SIGNUP_ADDRESS);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState('');
    const [notice, setNotice] = useState({ type: '', message: '' });
    const [loading, setLoading] = useState(false);
    const [currentCalendarYear, setCurrentCalendarYear] = useState(() => new Date().getFullYear());
    const signupGenderOptions = useMemo(
        () => GENDER_OPTIONS.filter((option) => option.value !== 'Non-binary'),
        [],
    );
    const birthdayDayOptions = useMemo(() => {
        const totalDays = getDaysInMonth(formData.birthYear, formData.birthMonth);

        return Array.from({ length: totalDays }, (_, index) => {
            const value = String(index + 1).padStart(2, '0');
            return { value, label: String(index + 1) };
        });
    }, [formData.birthMonth, formData.birthYear]);
    const birthdayYearOptions = useMemo(() => {
        return Array.from({ length: currentCalendarYear - EARLIEST_BIRTH_YEAR + 1 }, (_, index) => {
            const value = String(currentCalendarYear - index);
            return { value, label: value };
        });
    }, [currentCalendarYear]);
    const passwordStrength = useMemo(
        () => getPasswordStrength(formData.password),
        [formData.password],
    );
    const noticeRef = useRef(null);

    const scrollNoticeIntoView = () => {
        window.setTimeout(() => {
            noticeRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 0);
    };

    useEffect(() => {
        if (!notice.message) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setNotice({ type: '', message: '' });
        }, 10000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [notice.message]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const nextYear = new Date().getFullYear();
            setCurrentCalendarYear((previousYear) => (
                previousYear === nextYear ? previousYear : nextYear
            ));
        }, 60 * 60 * 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    const handleChange = (event) => {
        const { name, value } = event.target;
        const nextValue = name === 'contactNumber'
            ? formatPhoneNumber(value)
            : NAME_FIELDS.has(name)
                ? sanitizeNameInput(value)
                : value;

        setFormData((prev) => ({
            ...prev,
            [name]: nextValue,
        }));

        setFieldErrors((prev) => ({
            ...prev,
            [name]: '',
        }));
        setError('');
        setNotice({ type: '', message: '' });
    };

    const handleBirthdayChange = (part, value) => {
        setFormData((prev) => {
            const sanitizedValue = sanitizeBirthdayInput(part, value);
            const next = {
                ...prev,
                [part]: sanitizedValue,
            };

            if (next.birthMonth) {
                const totalDaysInMonth = getDaysInMonth(next.birthYear, next.birthMonth);

                if (next.birthDay && Number(next.birthDay) > totalDaysInMonth) {
                    next.birthDay = '';
                }
            }

            next.birthday = buildIsoBirthday(next.birthYear, next.birthMonth, next.birthDay);
            return next;
        });

        setFieldErrors((prev) => ({
            ...prev,
            birthday: '',
        }));
        setError('');
        setNotice({ type: '', message: '' });
    };

    const handleAddressSave = (nextAddress) => {
        setAddress({
            ...DEFAULT_SIGNUP_ADDRESS,
            ...nextAddress,
        });
        setShowAddressModal(false);
        setFieldErrors((prev) => ({
            ...prev,
            address: '',
        }));
        setError('');
        setNotice({ type: '', message: '' });
    };

    const validateForm = () => {
        const nextErrors = {};
        const firstNameError = validateNameField(formData.firstName, 'First name', { required: true });
        const middleNameError = validateNameField(formData.middleName, 'Middle name');
        const lastNameError = validateNameField(formData.lastName, 'Last name', { required: true });

        if (firstNameError) nextErrors.firstName = firstNameError;
        if (middleNameError) nextErrors.middleName = middleNameError;
        if (lastNameError) nextErrors.lastName = lastNameError;
        if (!formData.email.trim()) nextErrors.email = 'Email is required.';
        if (!formData.contactNumber.trim()) nextErrors.contactNumber = 'Contact number is required.';
        if (!formData.birthMonth || !formData.birthDay || !formData.birthYear) nextErrors.birthday = 'Birthday is required.';
        if (!formData.gender) nextErrors.gender = 'Gender is required.';
        if (!formData.password) nextErrors.password = 'Password is required.';
        if (!formData.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.';

        if (formData.password && formData.password.length < MIN_PASSWORD_LENGTH) {
            nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        } else if (formData.password && passwordStrength.isWeak) {
            nextErrors.password = getWeakPasswordMessage();
        }

        if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
            nextErrors.confirmPassword = 'Passwords do not match.';
        }

        if (formData.contactNumber && !isValidContactNumber(formData.contactNumber)) {
            nextErrors.contactNumber = 'Please enter a valid mobile number (11 digits starting with 09).';
        }

        if (!nextErrors.birthday && !isValidBirthdayParts(formData.birthYear, formData.birthMonth, formData.birthDay)) {
            nextErrors.birthday = 'Please enter a valid birth date.';
        }

        if (
            !nextErrors.birthday
            && !isAtLeastAgeFromBirthdayParts(
                formData.birthYear,
                formData.birthMonth,
                formData.birthDay,
                MIN_SIGNUP_AGE,
            )
        ) {
            nextErrors.birthday = `You must be at least ${MIN_SIGNUP_AGE} years old.`;
        }

        if (!hasCompleteAddress(address)) {
            nextErrors.address = 'Please add your default address before creating your account.';
        }

        setFieldErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSignup = async (event) => {
        event.preventDefault();
        setError('');
        setNotice({ type: '', message: '' });

        if (!validateForm()) {
            setError('Please complete the required fields before creating your account.');
            scrollNoticeIntoView();
            return;
        }

        setLoading(true);
        let createdSession = false;

        const profilePayload = buildCustomerProfilePayload({
            firstName: formData.firstName,
            middleName: formData.middleName,
            lastName: formData.lastName,
            email: formData.email,
            contactNumber: formData.contactNumber,
            birthday: formData.birthday,
            gender: formData.gender,
        });
        const metadataPayload = buildCustomerMetadata({
            firstName: formData.firstName,
            middleName: formData.middleName,
            lastName: formData.lastName,
            contactNumber: formData.contactNumber,
            birthday: formData.birthday,
            gender: formData.gender,
        });
        const signupMetadata = {
            ...metadataPayload,
            ...buildDefaultAddressMetadata(address),
        };

        try {
            const { data, error: signupError } = await supabase.auth.signUp({
                email: profilePayload.email,
                password: formData.password,
                options: {
                    data: signupMetadata,
                    emailRedirectTo: getEmailVerificationRedirectUrl(),
                },
            });

            if (signupError) {
                throw signupError;
            }

            if (!data?.user?.id) {
                throw new Error('Registration failed. Please try again.');
            }

            createdSession = Boolean(data.session);

            const isExistingUserResponse =
                Array.isArray(data.user.identities) &&
                data.user.identities.length === 0;

            if (isExistingUserResponse) {
                setNotice({
                    type: 'danger',
                    message: 'An account with this email address already exists. Please use a different email address or log in instead.',
                });
                scrollNoticeIntoView();
                return;
            }

            if (data.session) {
                const { error: signOutError } = await supabase.auth.signOut();

                if (signOutError) {
                    console.warn('Signup sign-out warning:', signOutError);
                }

                throw new Error('Email confirmation is turned off in Supabase. Enable Confirm email before using signup.');
            }

            setNotice({
                type: 'success',
                message: 'Account created. Please check your email and open the verification link before logging in.',
            });
            scrollNoticeIntoView();
            setTimeout(() => {
                navigate(`/login?verification=pending&email=${encodeURIComponent(profilePayload.email)}`);
            }, 3500);
        } catch (signupException) {
            console.error('Signup error:', signupException);

            if (createdSession) {
                const { error: signOutError } = await supabase.auth.signOut();

                if (signOutError) {
                    console.warn('Signup cleanup sign-out warning:', signOutError);
                }
            }

            setError(signupException.message || 'Registration failed. Please try again.');
            scrollNoticeIntoView();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card auth-card-signup">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h2>Join Us!</h2>
                        <p>Create your account and set up your basic profile in one step.</p>
                    </div>
                </div>
                <div className="auth-form-container auth-form-container-signup">
                    <h2 className="auth-title">Sign Up</h2>
                    <p className="auth-subtitle">Enter your details once so future orders and forms are ready to go.</p>

                    <form onSubmit={handleSignup}>
                        <div ref={noticeRef}></div>
                        {error && (
                            <div className="alert alert-danger" role="alert">
                                {error}
                            </div>
                        )}
                        {notice.message && (
                            <div className={`alert alert-${notice.type === 'danger' ? 'danger' : 'success'}`} role="alert">
                                {notice.message}
                            </div>
                        )}

                        <div className="row g-2 mb-3 signup-name-row">
                            <div className="col-lg-4 col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        className={`form-control ${fieldErrors.firstName ? 'is-invalid' : ''}`}
                                        id="floatingFirstName"
                                        name="firstName"
                                        placeholder="First Name"
                                        value={formData.firstName}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingFirstName">First Name</label>
                                    {fieldErrors.firstName && <div className="invalid-feedback">{fieldErrors.firstName}</div>}
                                </div>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        className={`form-control ${fieldErrors.middleName ? 'is-invalid' : ''}`}
                                        id="floatingMiddleName"
                                        name="middleName"
                                        placeholder="Middle Name"
                                        value={formData.middleName}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingMiddleName">Middle Name (Optional)</label>
                                    {fieldErrors.middleName && <div className="invalid-feedback">{fieldErrors.middleName}</div>}
                                </div>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        className={`form-control ${fieldErrors.lastName ? 'is-invalid' : ''}`}
                                        id="floatingLastName"
                                        name="lastName"
                                        placeholder="Last Name"
                                        value={formData.lastName}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingLastName">Last Name</label>
                                    {fieldErrors.lastName && <div className="invalid-feedback">{fieldErrors.lastName}</div>}
                                </div>
                            </div>
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="email"
                                className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
                                id="floatingEmail"
                                name="email"
                                placeholder="name@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                            <label htmlFor="floatingEmail">Email Address</label>
                            {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="tel"
                                className={`form-control ${fieldErrors.contactNumber ? 'is-invalid' : ''}`}
                                id="floatingContactNumber"
                                name="contactNumber"
                                placeholder="0917-123-4567"
                                value={formData.contactNumber}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                            <label htmlFor="floatingContactNumber">Contact Number</label>
                            {fieldErrors.contactNumber && <div className="invalid-feedback">{fieldErrors.contactNumber}</div>}
                        </div>

                        <div className="mb-3">
                            <label className="form-label auth-select-label" htmlFor="signupBirthMonth">
                                Birthday
                            </label>
                            <div className="row g-2">
                                <div className="col-md-4 col-12">
                                    <select
                                        id="signupBirthMonth"
                                        className={`form-select auth-select ${fieldErrors.birthday ? 'is-invalid' : ''}`}
                                        value={formData.birthMonth}
                                        onChange={(event) => handleBirthdayChange('birthMonth', event.target.value)}
                                        required
                                        disabled={loading}
                                    >
                                        <option value="">Month</option>
                                        {MONTH_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-4 col-12">
                                    <select
                                        className={`form-select auth-select ${fieldErrors.birthday ? 'is-invalid' : ''}`}
                                        value={formData.birthDay}
                                        onChange={(event) => handleBirthdayChange('birthDay', event.target.value)}
                                        required
                                        disabled={loading}
                                    >
                                        <option value="">Day</option>
                                        {birthdayDayOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-4 col-12">
                                    <select
                                        className={`form-select auth-select ${fieldErrors.birthday ? 'is-invalid' : ''}`}
                                        value={formData.birthYear}
                                        onChange={(event) => handleBirthdayChange('birthYear', event.target.value)}
                                        required
                                        disabled={loading}
                                    >
                                        <option value="">Year</option>
                                        {birthdayYearOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {fieldErrors.birthday && <div className="invalid-feedback d-block">{fieldErrors.birthday}</div>}
                        </div>

                        <div className="mb-3">
                            <label className="form-label auth-select-label" htmlFor="floatingGender">
                                Gender <span className="text-danger">*</span>
                            </label>
                            <select
                                id="floatingGender"
                                name="gender"
                                className={`form-select auth-select ${fieldErrors.gender ? 'is-invalid' : ''}`}
                                value={formData.gender}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            >
                                <option value="" disabled hidden></option>
                                {signupGenderOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            {fieldErrors.gender && <div className="invalid-feedback d-block">{fieldErrors.gender}</div>}
                        </div>

                        <div className={`signup-address-panel mb-3 ${fieldErrors.address ? 'signup-address-panel-error' : ''}`}>
                            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                                <div>
                                    <div className="signup-address-title">Default Address</div>
                                    <p className="signup-address-text mb-0">
                                        {hasCompleteAddress(address)
                                            ? formatAddressSummary(address)
                                            : 'Add your main delivery address so it can be auto-selected on future orders.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary signup-address-trigger"
                                    onClick={() => setShowAddressModal(true)}
                                    disabled={loading}
                                >
                                    {hasCompleteAddress(address) ? 'Edit Address' : 'Add Address'}
                                </button>
                            </div>
                            {fieldErrors.address && (
                                <div className="invalid-feedback d-block mt-2">
                                    {fieldErrors.address}
                                </div>
                            )}
                        </div>

                        <div className="row g-2 mb-3">
                            <div className="col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="password"
                                        className={`form-control ${fieldErrors.password ? 'is-invalid' : ''}`}
                                        id="floatingPassword"
                                        name="password"
                                        placeholder="Password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingPassword">Password</label>
                                    {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
                                </div>
                            </div>
                            <div className="col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="password"
                                        className={`form-control ${fieldErrors.confirmPassword ? 'is-invalid' : ''}`}
                                        id="floatingConfirmPassword"
                                        name="confirmPassword"
                                        placeholder="Confirm Password"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingConfirmPassword">Confirm Password</label>
                                    {fieldErrors.confirmPassword && <div className="invalid-feedback">{fieldErrors.confirmPassword}</div>}
                                </div>
                            </div>
                        </div>

                        {formData.password && (
                            <div className="signup-password-strength mb-3" aria-live="polite">
                                <div className="signup-password-strength-header">
                                    <span className="signup-password-strength-title">Password strength</span>
                                    <span className={`signup-password-strength-label signup-password-strength-label-${passwordStrength.tone}`}>
                                        {passwordStrength.label}
                                    </span>
                                </div>
                                <div className="signup-password-strength-bars" role="presentation" aria-hidden="true">
                                    {[1, 2, 3].map((step) => (
                                        <span
                                            key={step}
                                            className={`signup-password-strength-bar ${
                                                passwordStrength.score >= step
                                                    ? `signup-password-strength-bar-${passwordStrength.tone}`
                                                    : ''
                                            }`}
                                        />
                                    ))}
                                </div>
                                <p className="signup-password-strength-note mb-0">
                                    Use at least {MIN_PASSWORD_LENGTH} characters and combine at least 3 of these:
                                    uppercase, lowercase, number, and symbol.
                                </p>
                            </div>
                        )}

                        <div className="form-check mb-4">
                            <input className="form-check-input" type="checkbox" id="terms" required disabled={loading} />
                            <label className="form-check-label text-muted small" htmlFor="terms">
                                I agree to the <Link to="/terms" className="auth-link" target="_blank">Terms of Service</Link> and <Link to="/privacy" className="auth-link" target="_blank">Privacy Policy</Link>
                            </label>
                        </div>

                        <button type="submit" className="btn btn-auth" disabled={loading}>
                            {loading ? 'Creating Account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="auth-footer">
                        Already have an account? <Link to="/login" className="auth-link">Log In</Link>
                    </div>
                </div>
            </div>

            <SignupAddressModal
                show={showAddressModal}
                initialValue={address}
                disabled={loading}
                onClose={() => setShowAddressModal(false)}
                onSave={handleAddressSave}
            />
        </div>
    );
};

export default Signup;
