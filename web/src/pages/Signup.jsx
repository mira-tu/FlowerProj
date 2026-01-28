import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase'; // Import supabase client
// import { authAPI } from '../config/api'; // Remove authAPI
import '../styles/Auth.css';

const Signup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Validate password length
        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        name: `${formData.firstName} ${formData.lastName}` // Store full name in user metadata
                    }
                }
            });

            if (error) {
                throw error;
            }

            // Registration successful
            // Supabase returns user and session, but for signup it often requires email confirmation
            if (data.user && data.session) {
                // User signed up and logged in (e.g., no email confirmation needed)
                setSuccess('Registration successful! Redirecting to login...');
                
                // Insert user data into public.users table
                const { error: userInsertError } = await supabase
                    .from('users')
                    .insert({
                        id: data.user.id,
                        name: `${formData.firstName} ${formData.lastName}`,
                        email: formData.email,
                        phone: null, // Phone is not collected in signup form
                        role: 'customer' // Default role
                    });

                if (userInsertError) {
                    console.error('Error inserting user into public.users:', userInsertError);
                    setError('Registration failed: Could not save user profile. Please try again.');
                    setLoading(false);
                    return;
                }

                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else if (data.user && !data.session) {
                // User signed up, but email confirmation is required
                setSuccess('Registration successful! Please check your email to confirm your account before logging in.');

                // Insert user data into public.users table (even if not yet confirmed, they exist)
                const { error: userInsertError } = await supabase
                    .from('users')
                    .insert({
                        id: data.user.id,
                        name: `${formData.firstName} ${formData.lastName}`,
                        email: formData.email,
                        password: null,
                        phone: null,
                        role: 'customer'
                    });
                
                if (userInsertError) {
                    console.error('Error inserting user into public.users (email confirmation path):', userInsertError);
                    // This error might not be critical enough to stop signup but should be logged.
                    // For now, we'll let the user proceed to email confirmation message.
                }

                setTimeout(() => {
                    navigate('/login');
                }, 5000); // Give user more time to read message
            } else {
                setError('Registration failed. Please try again.');
            }
        } catch (err) {
            console.error('Signup error:', err);
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-image">
                    <div className="auth-overlay"></div>
                    <div className="auth-text">
                        <h2>Join Us!</h2>
                        <p>Create an account to start your floral journey.</p>
                    </div>
                </div>
                <div className="auth-form-container">
                    <h2 className="auth-title">Sign Up</h2>
                    <p className="auth-subtitle">Fill in your details to create an account.</p>

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

                        <div className="row g-2 mb-3">
                            <div className="col-md">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="floatingFirstName"
                                        name="firstName"
                                        placeholder="First Name"
                                        value={formData.firstName}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingFirstName">First Name</label>
                                </div>
                            </div>
                            <div className="col-md">
                                <div className="form-floating">
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="floatingLastName"
                                        name="lastName"
                                        placeholder="Last Name"
                                        value={formData.lastName}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                    <label htmlFor="floatingLastName">Last Name</label>
                                </div>
                            </div>
                        </div>
                        <div className="form-floating mb-3">
                            <input
                                type="email"
                                className="form-control"
                                id="floatingInput"
                                name="email"
                                placeholder="name@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                            <label htmlFor="floatingInput">Email address</label>
                        </div>
                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control"
                                id="floatingPassword"
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                            <label htmlFor="floatingPassword">Password</label>
                        </div>
                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control"
                                id="floatingConfirmPassword"
                                name="confirmPassword"
                                placeholder="Confirm Password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                            <label htmlFor="floatingConfirmPassword">Confirm Password</label>
                        </div>

                        <div className="form-check mb-4">
                            <input className="form-check-input" type="checkbox" id="terms" required disabled={loading} />
                            <label className="form-check-label text-muted small" htmlFor="terms">
                                I agree to the <a href="#" className="auth-link">Terms of Service</a> and <a href="#" className="auth-link">Privacy Policy</a>
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
        </div>
    );
};

export default Signup;
