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
    { value: 'Custom Selection', label: 'Custom Selection' }
];

const BookEvent = ({ user }) => {
    const [formData, setFormData] = useState({
        customerName: user?.user_metadata?.full_name || '',
        email: user?.email || '',
        contactNumber: formatPhoneNumber(user?.user_metadata?.phone || ''),
        recipientName: '',
        occasion: '',
        otherOccasion: '',
        eventDate: '',
        eventTime: '',
        venue: '',
        selectedFlowers: [],
        colorPreference: '',
        arrangementType: '',
        specialInstructions: '',
        inspirationFile: null
    });

    const [imagePreview, setImagePreview] = useState(null);
    const [fileSizeError, setFileSizeError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const navigate = useNavigate();

    const fileInputRef = useRef(null);

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

            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
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
        if (!formData.customerName || !formData.contactNumber || !formData.occasion || !formData.eventDate || !formData.venue || !formData.arrangementType) {
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
            arrangementType: formData.arrangementType,
            flowers: formData.selectedFlowers.map(f => f.label).join(', '),
            colorPreference: formData.colorPreference,
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
        localStorage.setItem('bookingCart', JSON.stringify(currentCart));

        // 3. Clear modal and navigate
        setShowConfirmModal(false);
        setIsSubmitting(false);
        navigate('/booking-cart');
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
                                            <label className="form-label fw-semibold">Recipient Name (If different)</label>
                                            <input type="text" name="recipientName" className="form-control bg-light border-0 py-3" value={formData.recipientName} onChange={handleChange} placeholder="Leave blank if for yourself" />
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
                                            <input type="date" name="eventDate" className="form-control bg-light border-0 py-3" min={minEventDate} value={formData.eventDate} onChange={handleChange} required />
                                        </div>

                                        <div className="col-md-6">
                                            <label className="form-label fw-semibold">Preferred Time</label>
                                            <input type="time" name="eventTime" className="form-control bg-light border-0 py-3" value={formData.eventTime} onChange={handleChange} />
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
                                            </select>
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
                                        </div>

                                        <div className="col-12 mt-3">
                                            <label className="form-label fw-semibold">Color Palette & Theme Preference</label>
                                            <input type="text" name="colorPreference" className="form-control bg-light border-0 py-3" placeholder="e.g., Pastel Pinks and Whites, Rustic Autumn Colors" value={formData.colorPreference} onChange={handleChange} />
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold">Special Instructions & Message Card</label>
                                            <textarea name="specialInstructions" className="form-control bg-light border-0 py-3" rows="5" placeholder="Include any specific details, themes, motifs, or what you want written on the message card..." value={formData.specialInstructions} onChange={handleChange}></textarea>
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
                                        <button type="submit" className="btn btn-pink rounded-pill px-5 py-3 fw-bold fs-5 shadow-sm text-white" style={{ minWidth: '250px' }}>
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

                        <div className="bg-light rounded p-3 mb-4 small">
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Name:</span>
                                <span className="fw-semibold text-end">{formData.customerName}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Occasion:</span>
                                <span className="fw-semibold text-end">{formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Type:</span>
                                <span className="fw-semibold text-end">{formData.arrangementType}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                                <span className="text-muted">Date Needed:</span>
                                <span className="fw-semibold text-end">{formData.eventDate}</span>
                            </div>
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
