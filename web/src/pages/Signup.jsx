import React, { useMemo, useState } from 'react';
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
import '../styles/Auth.css';

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
        birthday: '',
        gender: '',
    });
    const [address, setAddress] = useState(DEFAULT_SIGNUP_ADDRESS);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const maxBirthday = useMemo(() => new Date().toISOString().split('T')[0], []);

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((prev) => ({
            ...prev,
            [name]: name === 'contactNumber' ? formatPhoneNumber(value) : value,
        }));

        setFieldErrors((prev) => ({
            ...prev,
            [name]: '',
        }));
        setError('');
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
    };

    const validateForm = () => {
        const nextErrors = {};

        if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required.';
        if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required.';
        if (!formData.email.trim()) nextErrors.email = 'Email is required.';
        if (!formData.contactNumber.trim()) nextErrors.contactNumber = 'Contact number is required.';
        if (!formData.birthday) nextErrors.birthday = 'Birthday is required.';
        if (!formData.gender) nextErrors.gender = 'Gender is required.';
        if (!formData.password) nextErrors.password = 'Password is required.';
        if (!formData.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.';

        if (formData.password && formData.password.length < 6) {
            nextErrors.password = 'Password must be at least 6 characters.';
        }

        if (formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword) {
            nextErrors.confirmPassword = 'Passwords do not match.';
        }

        if (formData.contactNumber && !isValidContactNumber(formData.contactNumber)) {
            nextErrors.contactNumber = 'Please enter a valid mobile number (11 digits starting with 09).';
        }

        if (formData.birthday && formData.birthday > maxBirthday) {
            nextErrors.birthday = 'Birthday cannot be in the future.';
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
        setSuccess('');

        if (!validateForm()) {
            setError('Please complete the required fields before creating your account.');
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
                setSuccess('This email may already have an account. Try logging in, or resend the verification email from the login page.');
                setTimeout(() => {
                    navigate(`/login?verification=pending&email=${encodeURIComponent(profilePayload.email)}`);
                }, 3500);
                return;
            }

            if (data.session) {
                const { error: signOutError } = await supabase.auth.signOut();

                if (signOutError) {
                    console.warn('Signup sign-out warning:', signOutError);
                }

                throw new Error('Email confirmation is turned off in Supabase. Enable Confirm email before using signup.');
            }

            setSuccess('Account created. Please check your email and open the verification link before logging in.');
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
                        {error && (
                            <div className="alert alert-danger" role="alert">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="alert alert-success" role="alert">
                                {success}
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
                                        className="form-control"
                                        id="floatingMiddleName"
                                        name="middleName"
                                        placeholder="Middle Name"
                                        value={formData.middleName}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingMiddleName">Middle Name (Optional)</label>
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

                        <div className="row g-2 mb-3">
                            <div className="col-md-6">
                                <div className="form-floating">
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
                            </div>
                            <div className="col-md-6">
                                <div className="form-floating">
                                    <input
                                        type="date"
                                        className={`form-control ${fieldErrors.birthday ? 'is-invalid' : ''}`}
                                        id="floatingBirthday"
                                        name="birthday"
                                        max={maxBirthday}
                                        value={formData.birthday}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingBirthday">Birthday</label>
                                    {fieldErrors.birthday && <div className="invalid-feedback">{fieldErrors.birthday}</div>}
                                </div>
                            </div>
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
                                <option value="">Select Gender</option>
                                {GENDER_OPTIONS.map((option) => (
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
