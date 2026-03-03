import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { formatPhoneNumber } from '../utils/format';
import InfoModal from '../components/InfoModal';
import '../styles/BookEvent.css'; // Reusing event styling basics
import '../styles/Shop.css';

const flowerOptions = [
    { value: 'Roses', label: 'Roses' },
    { value: 'Tulips', label: 'Tulips' },
    { value: 'Sunflowers', label: 'Sunflowers' },
    { value: 'Lilies', label: 'Lilies' },
    { value: 'Orchids', label: 'Orchids' },
    { value: 'Carnations', label: 'Carnations' },
    { value: 'Mixed Flowers', label: 'Mixed Flowers' },
    { value: 'Others', label: 'Others' }
];

const colorOptions = [
    { value: 'Pastel Pinks and Whites', label: 'Pastel Pinks and Whites', colors: ['#ffc0cb', '#ffffff'] },
    { value: 'Rustic Autumn Colors', label: 'Rustic Autumn Colors', colors: ['#d2691e', '#8b4513', '#cd853f'] },
    { value: 'Classic Red and White', label: 'Classic Red and White', colors: ['#ff0000', '#ffffff'] },
    { value: 'All White / Elegant', label: 'All White / Elegant', colors: ['#ffffff', '#f5f5f5'] },
    { value: 'Vibrant / Colorful', label: 'Vibrant / Colorful', colors: ['#ff0000', '#ffff00', '#0000ff'] },
    { value: 'Soft Blues and Purples', label: 'Soft Blues and Purples', colors: ['#add8e6', '#800080'] },
    { value: 'Others', label: 'Others', colors: [] }
];

const customColorOptionLabel = ({ label, colors }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        {colors && colors.length > 0 && (
            <div style={{ display: 'flex', marginRight: '10px' }}>
                {colors.map((color, index) => (
                    <div
                        key={index}
                        style={{
                            width: '15px',
                            height: '15px',
                            backgroundColor: color,
                            borderRadius: '50%',
                            marginLeft: index > 0 ? '-5px' : '0',
                            border: '1px solid #ccc'
                        }}
                    ></div>
                ))}
            </div>
        )}
        <span>{label}</span>
    </div>
);

const BookEvent = ({ user }) => {
    const [formData, setFormData] = useState({
        customerName: user?.user_metadata?.full_name || '',
        email: user?.email || '',
        contactNumber: formatPhoneNumber(user?.user_metadata?.phone || ''),
        recipientName: user?.user_metadata?.full_name || '',
        occasion: '',
        otherOccasion: '',
        otherArrangementType: '',
        otherFlowersText: '',
        colorPreference: '',
        otherColorPreference: '',
        eventDate: '',
        eventTime: '',
        venue: '',
        selectedFlowers: [],
        arrangementType: '',
        specialInstructions: '',
        inspirationFile: null
    });

    const [imagePreview, setImagePreview] = useState(null);
    const [fileSizeError, setFileSizeError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dateError, setDateError] = useState('');
    const [timeError, setTimeError] = useState('');

    const navigate = useNavigate();

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (user) {
            const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';
            const userEmail = user?.email || '';
            const userPhone = formatPhoneNumber(user?.user_metadata?.phone || '');

            setFormData(prev => ({
                ...prev,
                customerName: prev.customerName === '' ? userName : prev.customerName,
                email: prev.email === '' ? userEmail : prev.email,
                contactNumber: prev.contactNumber === '' ? userPhone : prev.contactNumber,
                recipientName: prev.recipientName === '' ? userName : prev.recipientName
            }));
        }
    }, [user]);

    // Prevent past dates
    const minEventDate = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'contactNumber') {
            setFormData(prev => ({ ...prev, [name]: formatPhoneNumber(value) }));
            return;
        }

        let nextValue = value;
        if (name === 'eventDate' && value) {
            nextValue = value < minEventDate ? minEventDate : value;
        }

        setFormData(prev => ({ ...prev, [name]: nextValue }));
    };

    const handleFlowerSelect = (selectedOptions) => {
        setFormData(prev => ({ ...prev, selectedFlowers: selectedOptions || [] }));
    };

    const handleColorSelect = (selectedOption) => {
        setFormData(prev => ({ ...prev, colorPreference: selectedOption ? selectedOption.value : '' }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        setFileSizeError('');

        if (file) {
            // Check file type
            if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
                setFileSizeError('Please upload a JPG or PNG file.');
                return;
            }

            // Check file size (e.g., max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                setFileSizeError('File size exceeds 5MB limit.');
                return;
            }

            setFormData(prev => ({ ...prev, inspirationFile: file }));

            // Compress image before storing as base64 to avoid localStorage quota issues
            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.onload = () => {
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                    setImagePreview(compressedBase64);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = (e) => {
        e.stopPropagation();
        setImagePreview(null);
        setFormData(prev => ({ ...prev, inspirationFile: null }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const triggerValidation = (e) => {
        e.preventDefault();

        // Basic required checks (HTML5 usually catches these but good to be safe)
        if (!formData.customerName || !formData.contactNumber || !formData.occasion || !formData.eventDate || !formData.venue || !formData.arrangementType || !formData.recipientName) {
            alert('Please fill in all required fields marked with *');
            return;
        }

        setShowConfirmModal(true);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);

        // 1. Prepare Cart Item
        const newCartItem = {
            id: Date.now(),
            serviceType: "Event/Special Request",
            customerName: formData.customerName,
            email: formData.email,
            contactNumber: formData.contactNumber,
            recipientName: formData.recipientName,
            occasion: formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion,
            eventDate: formData.eventDate,
            eventTime: formData.eventTime,
            venue: formData.venue,
            arrangementType: formData.arrangementType === 'Other' ? formData.otherArrangementType : formData.arrangementType,
            flowers: formData.selectedFlowers.map(f => f.label).join(', ') + (formData.otherFlowersText ? ` (${formData.otherFlowersText})` : ''),
            colorPreference: formData.colorPreference === 'Others' ? formData.otherColorPreference : formData.colorPreference,
            specialInstructions: formData.specialInstructions,
            inspirationImageBase64: imagePreview,
            price: null
        };

        // 2. Save to Local Storage
        let currentCart = [];
        try {
            const stored = localStorage.getItem('bookingCart');
            if (stored) {
                currentCart = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to parse bookingCart from localStorage", e);
        }

        currentCart.push(newCartItem);
        // Prevent Local Storage Quota Limit by keeping only the 5 most recent Custom Booking drafts
        if (currentCart.length > 5) {
            currentCart = currentCart.slice(-5);
        }

        try {
            localStorage.setItem('bookingCart', JSON.stringify(currentCart));
        } catch (e) {
            console.error("Quota Exceeded! Resetting tracking cart forcefully", e);
            localStorage.setItem('bookingCart', JSON.stringify([newCartItem])); // Reset with newest item only
        }

        // 3. Clear modal and navigate
        setShowConfirmModal(false);
        setIsSubmitting(false);
        navigate('/cart');
    };

    return (
        <div style={{ backgroundColor: '#fcfaf8', minHeight: '100vh', paddingTop: '80px', paddingBottom: '60px' }}>
            <div className="container">

                {/* Header Section */}
                <div className="text-center mb-5 mt-4">
                    <h1 className="display-4 fw-bold font-playfair text-dark">Custom Floral & Event Booking</h1>
                    <p className="lead text-muted mx-auto" style={{ maxWidth: '700px' }}>
                        Whether it's a personalized bouquet or full event styling, let us bring your floral vision to life. Fill out the details below to request a quote.
                    </p>
                </div>

                <div className="row justify-content-center">
                    <div className="col-lg-9">
                        <div className="card border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                            <div className="card-body p-4 p-md-5 bg-white">

                                <form onSubmit={triggerValidation}>

                                    {/* SECTION 1: Personal Details */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="fas fa-user-circle me-3 fs-3"></i> Personal Information
                                    </h4>

                                    <div className="row g-4 mb-5">
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Your Full Name <span className="text-danger">*</span></label>
                                            <input type="text" name="customerName" className="form-control bg-light border-0 py-3" value={formData.customerName} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Email Address <span className="text-danger">*</span></label>
                                            <input type="email" name="email" className="form-control bg-light border-0 py-3" value={formData.email} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Contact Number <span className="text-danger">*</span></label>
                                            <input type="tel" name="contactNumber" className="form-control bg-light border-0 py-3" placeholder="e.g., 0917 123 4567" value={formData.contactNumber} onChange={handleChange} required />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Recipient Full Name <span className="text-danger">*</span></label>
                                            <input type="text" name="recipientName" className="form-control bg-light border-0 py-3" value={formData.recipientName} onChange={handleChange} placeholder="Who will receive this order?" required />
                                        </div>
                                    </div>

                                    <hr className="my-5 text-muted opacity-25" />

                                    {/* SECTION 2: Event Details */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="far fa-calendar-alt me-3 fs-3"></i> Delivery & Event Details
                                    </h4>

                                    <div className="row g-4 mb-5">
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Occasion <span className="text-danger">*</span></label>
                                            <select name="occasion" className="form-select bg-light border-0 py-3" value={formData.occasion} onChange={handleChange} required>
                                                <option value="" disabled>Select Occasion</option>
                                                <option value="Birthday">Birthday</option>
                                                <option value="Wedding">Wedding</option>
                                                <option value="Anniversary">Anniversary</option>
                                                <option value="Graduation">Graduation</option>
                                                <option value="Corporate Event">Corporate Event</option>
                                                <option value="Valentine's Day">Valentine’s Day</option>
                                                <option value="Mother's Day">Mother’s Day</option>
                                                <option value="Sympathy/Funeral">Sympathy/Funeral</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            {formData.occasion === 'Other' && (
                                                <input type="text" name="otherOccasion" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify the occasion" value={formData.otherOccasion} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Venue / Full Delivery Address <span className="text-danger">*</span></label>
                                            <input type="text" name="venue" className="form-control bg-light border-0 py-3" placeholder="Enter complete address..." value={formData.venue} onChange={handleChange} required />
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Date Needed <span className="text-danger">*</span></label>
                                            <input
                                                type="date"
                                                name="eventDate"
                                                className={`form-control bg-light border-0 py-3 ${dateError ? 'is-invalid border-danger border-1' : ''}`}
                                                min={minEventDate}
                                                value={formData.eventDate}
                                                onChange={(e) => {
                                                    const date = new Date(e.target.value);
                                                    const day = date.getUTCDay();
                                                    // 0 is Sunday, 6 is Saturday
                                                    if (day === 0 || day === 6) {
                                                        setDateError("Deliveries are only available on Weekdays (Monday to Friday).");
                                                    } else {
                                                        setDateError('');
                                                    }
                                                    handleChange(e);
                                                }}
                                                required
                                            />
                                            {dateError ? (
                                                <div className="invalid-feedback d-block">{dateError}</div>
                                            ) : (
                                                <div className="form-text small">Available Monday - Friday only.</div>
                                            )}
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Preferred Time</label>
                                            <input
                                                type="time"
                                                name="eventTime"
                                                className={`form-control bg-light border-0 py-3 ${timeError ? 'is-invalid border-danger border-1' : ''}`}
                                                value={formData.eventTime}
                                                min="09:00"
                                                max="16:00"
                                                onChange={(e) => {
                                                    const timeStr = e.target.value;
                                                    if (timeStr) {
                                                        const [hours, mins] = timeStr.split(':').map(Number);
                                                        if (hours < 9 || hours > 16 || (hours === 16 && mins > 0)) {
                                                            setTimeError("Our operating hours are from 9:00 AM to 4:00 PM.");
                                                        } else {
                                                            setTimeError('');
                                                        }
                                                    } else {
                                                        setTimeError('');
                                                    }
                                                    handleChange(e);
                                                }}
                                            />
                                            {timeError ? (
                                                <div className="invalid-feedback d-block">{timeError}</div>
                                            ) : (
                                                <div className="form-text small">Business hours: 9:00 AM - 4:00 PM.</div>
                                            )}
                                        </div>
                                    </div>

                                    <hr className="my-5 text-muted opacity-25" />

                                    {/* SECTION 3: Floral Preferences */}
                                    <h4 className="fw-bold mb-4 d-flex align-items-center" style={{ color: 'var(--shop-pink)' }}>
                                        <i className="fas fa-leaf me-3 fs-3"></i> Floral Specifications
                                    </h4>

                                    <div className="row g-4 mb-4">
                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Arrangement Type <span className="text-danger">*</span></label>
                                            <select name="arrangementType" className="form-select bg-light border-0 py-3" value={formData.arrangementType} onChange={handleChange} required>
                                                <option value="" disabled>Select Type</option>
                                                <option value="Bouquet">Hand-tied Bouquet</option>
                                                <option value="Flower Box">Flower Box</option>
                                                <option value="Basket Arrangement">Basket Arrangement</option>
                                                <option value="Table Centerpiece">Table Centerpiece</option>
                                                <option value="Stage Decoration">Stage Decoration</option>
                                                <option value="Car Decoration">Bridal Car Decoration</option>
                                                <option value="Full Event Styling">Full Event Styling</option>
                                                <option value="Other">Others</option>
                                            </select>
                                            {formData.arrangementType === 'Other' && (
                                                <input type="text" name="otherArrangementType" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify arrangement type" value={formData.otherArrangementType} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Preferred Flowers</label>
                                            <Select
                                                isMulti
                                                options={flowerOptions}
                                                placeholder="Select flowers (Optional)"
                                                onChange={handleFlowerSelect}
                                                value={formData.selectedFlowers}
                                                styles={{
                                                    control: (base) => ({
                                                        ...base,
                                                        border: '0',
                                                        backgroundColor: '#f8f9fa',
                                                        padding: '6px',
                                                        borderRadius: '8px'
                                                    })
                                                }}
                                            />
                                            {formData.selectedFlowers.some(f => f.value === 'Others') && (
                                                <input type="text" name="otherFlowersText" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify flowers (e.g., Peonies, Baby's Breath)" value={formData.otherFlowersText} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-12 mt-3">
                                            <label className="form-label fw-semibold">Color Palette & Theme Preference</label>
                                            <Select
                                                options={colorOptions}
                                                formatOptionLabel={customColorOptionLabel}
                                                placeholder="Select Color Theme (Optional)"
                                                onChange={handleColorSelect}
                                                value={colorOptions.find(option => option.value === formData.colorPreference) || null}
                                                isClearable
                                                styles={{
                                                    control: (base) => ({
                                                        ...base,
                                                        border: '0',
                                                        backgroundColor: '#f8f9fa',
                                                        padding: '6px',
                                                        borderRadius: '8px'
                                                    })
                                                }}
                                            />
                                            {formData.colorPreference === 'Others' && (
                                                <input type="text" name="otherColorPreference" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify your color preference" value={formData.otherColorPreference} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold">Special Instructions</label>
                                            <textarea name="specialInstructions" className="form-control bg-light border-0 py-3" rows="5" placeholder="Include any specific directions, themes, budgets, or other details you'd like us to know..." value={formData.specialInstructions} onChange={handleChange}></textarea>
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold d-block">Inspiration Photo (Optional)</label>
                                            <span className="text-muted small d-block mb-3">Upload a reference photo (JPG or PNG, max 5MB).</span>

                                            {imagePreview ? (
                                                <div className="position-relative d-inline-block">
                                                    <img src={imagePreview} alt="Inspiration Preview" className="rounded-3 border shadow-sm" style={{ maxHeight: '200px', maxWidth: '100%', objectFit: 'cover' }} />
                                                    <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 rounded-circle" onClick={removeImage} style={{ width: '32px', height: '32px', padding: 0 }}><i className="fas fa-times"></i></button>
                                                </div>
                                            ) : (
                                                <div className="p-5 text-center bg-light rounded-4 border" style={{ borderStyle: 'dashed !important', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                                                    <i className="fas fa-cloud-upload-alt fs-1 text-muted mb-3"></i>
                                                    <p className="mb-0 fw-semibold">Click to upload image</p>
                                                    <input type="file" className="d-none" ref={fileInputRef} onChange={handleFileChange} accept=".jpg,.jpeg,.png" />
                                                </div>
                                            )}
                                            {fileSizeError && <p className="text-danger small mt-2"><i className="fas fa-exclamation-circle me-1"></i>{fileSizeError}</p>}
                                        </div>
                                    </div>

                                    <div className="mt-5 pt-4 text-center">
                                        <button
                                            type="submit"
                                            className="btn btn-pink rounded-pill px-5 py-3 fw-bold fs-5 shadow-sm text-white"
                                            style={{ minWidth: '250px' }}
                                            disabled={!!dateError || !!timeError}
                                        >
                                            Review Request <i className="fas fa-arrow-right ms-2"></i>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="modal-overlay" style={{ zIndex: 1060 }}>
                    <div className="modal-content-custom bg-white p-4" style={{ maxWidth: '500px' }}>
                        <div className="text-center mb-4">
                            <div className="bg-light rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: '80px', height: '80px' }}>
                                <i className="fas fa-clipboard-check text-pink fs-1"></i>
                            </div>
                            <h3 className="fw-bold font-playfair">Confirm Your Request</h3>
                            <p className="text-muted">Please verify your details before submitting.</p>
                        </div>

                        <div className="bg-light rounded p-3 mb-4 small" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Your Name:</span>
                                <span className="fw-semibold text-end">{formData.customerName}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Email:</span>
                                <span className="fw-semibold text-end">{formData.email}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Contact:</span>
                                <span className="fw-semibold text-end">{formData.contactNumber}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Recipient:</span>
                                <span className="fw-semibold text-end">{formData.recipientName || '—'}</span>
                            </div>
                            <hr className="my-2" />
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Occasion:</span>
                                <span className="fw-semibold text-end">{formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Venue:</span>
                                <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{formData.venue}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Date Needed:</span>
                                <span className="fw-semibold text-end">{formData.eventDate}</span>
                            </div>
                            {formData.eventTime && (
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Preferred Time:</span>
                                    <span className="fw-semibold text-end">{formData.eventTime}</span>
                                </div>
                            )}
                            <hr className="my-2" />
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Arrangement:</span>
                                <span className="fw-semibold text-end">{formData.arrangementType === 'Other' ? formData.otherArrangementType : formData.arrangementType}</span>
                            </div>
                            {formData.selectedFlowers.length > 0 && (
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Flowers:</span>
                                    <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>
                                        {formData.selectedFlowers.map(f => f.label).join(', ')}
                                        {formData.otherFlowersText ? ` (${formData.otherFlowersText})` : ''}
                                    </span>
                                </div>
                            )}
                            {formData.colorPreference && (
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Color Theme:</span>
                                    <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>
                                        {formData.colorPreference === 'Others' ? formData.otherColorPreference : formData.colorPreference}
                                    </span>
                                </div>
                            )}
                            {formData.specialInstructions && (
                                <div className="mb-2">
                                    <span className="text-muted d-block mb-1">Special Instructions:</span>
                                    <span className="fw-semibold" style={{ whiteSpace: 'pre-line' }}>{formData.specialInstructions}</span>
                                </div>
                            )}
                            {imagePreview && (
                                <div className="mt-2 text-center">
                                    <span className="text-muted d-block mb-1">Inspiration Photo:</span>
                                    <img src={imagePreview} alt="Inspiration" className="rounded-3 border" style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'cover' }} />
                                </div>
                            )}
                        </div>

                        <div className="d-flex gap-3">
                            <button className="btn btn-light flex-grow-1 py-2 fw-semibold" onClick={() => setShowConfirmModal(false)} disabled={isSubmitting}>Edit Details</button>
                            <button className="btn btn-pink flex-grow-1 py-2 fw-semibold shadow-sm" onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                                Submit Request
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookEvent;
