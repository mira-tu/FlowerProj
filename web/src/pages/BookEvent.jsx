import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { supabase } from '../config/supabase';
import '../styles/BookEvent.css';
import '../styles/Shop.css';
import { formatPhoneNumber } from '../utils/format'; // Import the shared utility
import InfoModal from '../components/InfoModal'; const initialFormState = {
    recipientName: '',
    contactNumber: '',
    eventType: '',
    otherOccasion: '',
    eventDate: '',
    venue: '',
    details: '',
    inspirationFile: null,
};

const BookEvent = ({ user }) => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState(initialFormState);
    const [status, setStatus] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    const [showAddressModal, setShowAddressModal] = useState(false);
    const [addressForm, setAddressForm] = useState({
        street: '',
        barangay: '',
    });

    const [barangays, setBarangays] = useState([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                contactNumber: formatPhoneNumber(user.user_metadata?.phone || '')
            }));

            const fetchSavedAddresses = async () => {
                const { data } = await supabase.from('addresses').select('*').eq('user_id', user.id);
                if (data) setSavedAddresses(data.filter(addr => !addr.label.startsWith('[DEL]')));
            };
            fetchSavedAddresses();
        }
    }, [user]);

    // Fetch barangays for Zamboanga City when modal opens
    useEffect(() => {
        if (showAddressModal) {
            setAddressLoading(true);
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/097332000/barangays/`)
                .then(response => response.json())
                .then(data => {
                    const barangayOptions = data.map(b => ({ value: b.code, label: b.name }));
                    setBarangays(barangayOptions);
                })
                .catch(error => console.error('Error fetching barangays:', error))
                .finally(() => setAddressLoading(false));
        }
    }, [showAddressModal]);

    useEffect(() => {
        const savedInquiry = localStorage.getItem('bookingInquiry');
        if (savedInquiry) {
            const parsedInquiry = JSON.parse(savedInquiry);
            if (parsedInquiry.requestData.type === 'booking') {
                const {
                    recipient_name,
                    occasion,
                    event_date,
                    venue,
                    notes,
                    contact_number,
                } = parsedInquiry.requestData;

                setFormData({
                    recipientName: recipient_name || '',
                    contactNumber: formatPhoneNumber(contact_number || user?.user_metadata?.phone || ''),
                    eventType: occasion || '',
                    eventDate: event_date || '',
                    venue: venue || '',
                    details: notes || '',
                    inspirationFile: null, // File object cannot be restored from JSON
                });

                if (parsedInquiry.image) {
                    setImagePreview(parsedInquiry.image);
                }
            }
        }
    }, [user]);

    const minEventDate = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);



    const handleChange = (event) => {
        const { name, value, files } = event.target;

        if (files && files[0]) {
            const file = files[0];
            setFormData((prev) => ({ ...prev, [name]: file }));

            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
            return;
        }

        if (name === 'contactNumber') {
            setFormData((prev) => ({ ...prev, [name]: formatPhoneNumber(value) }));
            return;
        }

        let nextValue = value;
        if (name === 'eventDate' && value) {
            nextValue = value < minEventDate ? minEventDate : value;
        }
        setFormData((prev) => ({ ...prev, [name]: nextValue }));
    };

    const handleSaveAddress = () => {
        const { street, barangay } = addressForm;
        if (!street || !barangay) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please fill in all address fields.' });
            return;
        }
        const fullAddress = `${street}, ${barangay}, Zamboanga City`;
        setFormData(prev => ({ ...prev, venue: fullAddress }));
        setShowAddressModal(false);
    };

    const openFilePicker = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleUploadKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setStatus(null);
        setIsSubmitting(true);

        if (!user) {
            setStatus({ type: 'error', message: 'You must be logged in to book an event.' });
            setIsSubmitting(false);
            return;
        }

        if (!formData.contactNumber) {
            setStatus({ type: 'error', message: 'Please provide a contact number.' });
            setIsSubmitting(false);
            return;
        }

        try {
            let imageUrl = null;
            if (formData.inspirationFile) {
                const file = formData.inspirationFile;
                const fileName = `${user.id}-${Date.now()}_${file.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('request-images')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('request-images').getPublicUrl(fileName);
                imageUrl = urlData.publicUrl;
            }

            const occasion = formData.eventType === 'Other' ? formData.otherOccasion : formData.eventType;

            const inquiryData = {
                name: `Event Booking: ${occasion || 'Custom'}`,
                image: imagePreview,
                requestData: {
                    type: 'booking',
                    recipient_name: formData.recipientName,
                    contact_number: formData.contactNumber,
                    occasion: occasion,
                    event_date: formData.eventDate,
                    venue: formData.venue,
                    image_url: imageUrl,
                    notes: formData.details,
                }
            };

            // Store prepared inquiry and open a review modal so the user
            // can confirm before adding to the booking cart.
            localStorage.setItem('bookingInquiry', JSON.stringify(inquiryData));
            setShowReviewModal(true);

        } catch (error) {
            console.error('Error preparing event booking:', error);
            setStatus({ type: 'error', message: 'Failed to prepare your booking. Please try again.' });
            setIsSubmitting(false);
        }
    };

    const handleConfirmReview = () => {
        setIsSubmitting(false);
        setShowReviewModal(false);
        navigate('/booking-cart');
    };

    const handleCancelReview = () => {
        setIsSubmitting(false);
        setShowReviewModal(false);
    };

    const selectStyles = {
        control: (provided) => ({
            ...provided,
            borderColor: '#ddd',
            borderRadius: '8px',
            padding: '4px',
            fontSize: '16px',
        }),
        menu: (provided) => ({
            ...provided,
            zIndex: 1050, // Ensure dropdown appears above other content
        }),
    };

    return (
        <div className="book-event-page">
            <section id="bookingForm" className="booking-section bg-light">
                <div className="container py-5">
                    <div className="text-center mb-5">
                        <h1 className="display-5 fw-bold font-playfair mb-3">Let's Create Something Beautiful</h1>
                        <p className="lead text-muted">From intimate gatherings to grand celebrations, we bring your floral dreams to life.</p>
                    </div>
                    <div className="row justify-content-center">
                        <div className="col-lg-8">
                            <div className="card border-0 shadow-lg rounded-4 overflow-hidden">
                                <div className="card-header bg-white border-0 text-center pt-5 pb-3">
                                    <h2 className="fw-bold text-dark font-playfair">Event Details</h2>
                                    <p className="text-muted">Tell us about your special day</p>
                                    {status && (
                                        <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-danger'} mb-0`}>
                                            {status.message}
                                        </div>
                                    )}
                                </div>
                                <div className="card-body p-5">
                                    <form onSubmit={handleSubmit}>
                                        <div className="row g-4">
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="recipientName">Recipient Name</label>
                                                <input type="text" id="recipientName" name="recipientName" className="form-control bg-light border-0 py-3" placeholder="Enter recipient's name" value={formData.recipientName} onChange={handleChange} required />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="contactNumber">Contact Number</label>
                                                <input type="tel" id="contactNumber" name="contactNumber" className="form-control bg-light border-0 py-3" placeholder="e.g., 09171234567" value={formData.contactNumber} onChange={handleChange} required />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="eventType">Occasion</label>
                                                <select id="eventType" name="eventType" className="form-select bg-light border-0 py-3" value={formData.eventType} onChange={handleChange} required>
                                                    <option value="" disabled>Select an occasion</option>
                                                    <option value="Wedding">Wedding</option>
                                                    <option value="Debut">Debut / Birthday</option>
                                                    <option value="Anniversary">Anniversary</option>
                                                    <option value="Corporate">Corporate Event</option>
                                                    <option value="Funeral">Funeral / Sympathy</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                                {formData.eventType === 'Other' && (
                                                    <input
                                                        type="text"
                                                        name="otherOccasion"
                                                        className="form-control bg-light border-0 py-3 mt-2"
                                                        placeholder="Please specify"
                                                        value={formData.otherOccasion || ''}
                                                        onChange={handleChange}
                                                        required
                                                    />
                                                )}
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="eventDate">Event Date</label>
                                                <input type="date" id="eventDate" name="eventDate" className="form-control bg-light border-0 py-3" value={formData.eventDate} onChange={handleChange} min={minEventDate} required />
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label fw-semibold" htmlFor="venue">Venue Address</label>
                                                <input
                                                    type="text"
                                                    id="venue"
                                                    name="venue"
                                                    className="form-control bg-light border-0 py-3"
                                                    placeholder="Click to select address"
                                                    value={formData.venue}
                                                    onFocus={() => setShowAddressModal(true)}
                                                    readOnly
                                                    required
                                                />
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label fw-semibold" htmlFor="details">Additional Notes</label>
                                                <textarea id="details" name="details" className="form-control bg-light border-0 py-3" rows="4" placeholder="Tell us more about your event..." value={formData.details} onChange={handleChange}></textarea>
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label fw-semibold" htmlFor="inspirationFile">Inspiration Gallery</label>
                                                {imagePreview ? (
                                                    <div className="position-relative">
                                                        <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '12px', border: '2px solid #e0e0e0', padding: '10px', background: '#f8f9fa' }} />
                                                        <button type="button" className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2" onClick={(e) => { e.stopPropagation(); setImagePreview(null); setFormData((prev) => ({ ...prev, inspirationFile: null })); if (fileInputRef.current) { fileInputRef.current.value = ''; } }} style={{ zIndex: 10 }}><i className="fas fa-times"></i></button>
                                                    </div>
                                                ) : (
                                                    <div className="upload-box p-5 text-center bg-light rounded-4 border-dashed" role="button" tabIndex={0} onClick={openFilePicker} onKeyDown={handleUploadKeyDown}>
                                                        <i className="fas fa-cloud-upload-alt fa-2x text-primary mb-3"></i>
                                                        <p className="mb-2">Upload an image or drag and drop</p>
                                                        <input type="file" id="inspirationFile" name="inspirationFile" className="form-control visually-hidden" ref={fileInputRef} onChange={handleChange} accept="image/*" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="col-12 mt-4">
                                                <button type="submit" className="btn btn-pink w-100 py-3 rounded-pill fw-bold shadow-sm" disabled={isSubmitting}>
                                                    {isSubmitting ? 'Processing...' : 'Review Inquiry'}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {showAddressModal && (
                <div className="modal-overlay" onClick={() => setShowAddressModal(false)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h4>Set Venue Address</h4>
                            <button className="modal-close" onClick={() => setShowAddressModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            {user && savedAddresses.length > 0 && (
                                <div className="form-group mb-4">
                                    <label className="form-label text-muted small fw-bold">Select a saved address to auto-fill:</label>
                                    <select
                                        className="form-select"
                                        value={selectedSavedAddressId}
                                        onChange={(e) => {
                                            const id = e.target.value;
                                            setSelectedSavedAddressId(id);
                                            if (!id) return;
                                            const addr = savedAddresses.find(a => String(a.id) === String(id));
                                            if (addr) {
                                                setAddressForm({
                                                    street: addr.street,
                                                    barangay: addr.barangay
                                                });
                                                const option = barangays.find(b => b.label.toLowerCase() === addr.barangay.toLowerCase());
                                                if (option) {
                                                    setSelectedBarangay(option);
                                                } else {
                                                    setSelectedBarangay({ label: addr.barangay, value: addr.barangay });
                                                }
                                            }
                                        }}
                                    >
                                        <option value="" disabled>-- Choose an Address --</option>
                                        {savedAddresses.map(addr => (
                                            <option key={addr.id} value={addr.id}>
                                                {addr.label} - {addr.street}, {addr.barangay}
                                            </option>
                                        ))}
                                    </select>
                                    <hr className="mt-4 mb-2" />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Barangay</label>
                                <Select
                                    styles={selectStyles}
                                    options={barangays}
                                    isLoading={addressLoading}
                                    placeholder="Select Barangay"
                                    onChange={option => {
                                        setSelectedBarangay(option);
                                        setAddressForm({ ...addressForm, barangay: option ? option.label : '' });
                                        setSelectedSavedAddressId("");
                                    }}
                                    value={selectedBarangay}
                                    isClearable
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Street Address</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    value={addressForm.street}
                                    onChange={e => {
                                        setAddressForm({ ...addressForm, street: e.target.value });
                                        setSelectedSavedAddressId("");
                                    }}
                                    placeholder="e.g., House No., Street Name, Subdivision"
                                />
                            </div>

                            <button
                                className="btn"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={handleSaveAddress}
                            >
                                Save Address
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReviewModal && (
                <div className="modal-overlay" onClick={handleCancelReview}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h4>Review Inquiry</h4>
                            <button className="modal-close" onClick={handleCancelReview}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            <p className="mb-2"><strong>Recipient:</strong> {formData.recipientName}</p>
                            <p className="mb-2"><strong>Contact:</strong> {formData.contactNumber}</p>
                            <p className="mb-2"><strong>Occasion:</strong> {formData.eventType === 'Other' ? formData.otherOccasion : formData.eventType}</p>
                            <p className="mb-2"><strong>Event Date:</strong> {formData.eventDate}</p>
                            <p className="mb-2"><strong>Venue:</strong> {formData.venue}</p>
                            {formData.details && (
                                <p className="mb-3"><strong>Notes:</strong> {formData.details}</p>
                            )}
                            <button
                                className="btn w-100 mt-3"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={handleConfirmReview}
                            >
                                Add to Booking Cart
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
            />
        </div>
    );
};

export default BookEvent;