import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { supabase } from '../config/supabase';
import '../styles/SpecialOrder.css';
import '../styles/Shop.css';
import { formatPhoneNumber } from '../utils/format';
import InfoModal from '../components/InfoModal';

const initialFormState = {
    recipientName: '',
    occasion: '',
    otherOccasion: '',
    eventDate: '', // Added
    contactNumber: '',
    preferences: '',
    addons: [],
    inspirationFile: null,
    message: '',
    deliveryAddress: '', // New field for address
};

const SpecialOrder = ({ user }) => {
    const navigate = useNavigate();
    const [dateStatus, setDateStatus] = useState({ isValid: true, message: '' });
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
    const [formData, setFormData] = useState(initialFormState);
    const [status, setStatus] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    // Address Modal State
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [addressForm, setAddressForm] = useState({ street: '', barangay: '' });
    const [barangays, setBarangays] = useState([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });

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
            if (parsedInquiry.requestData.type === 'special_order') {
                const {
                    recipient_name,
                    occasion,
                    event_date, // Added
                    notes,
                    addons,
                    message,
                    deliveryAddress,
                    contact_number,
                } = parsedInquiry.requestData;

                const standardOccasions = ['Birthday', 'Anniversary', 'Valentines', 'MothersDay', 'JustBecause', 'Apology'];
                const isOther = occasion && !standardOccasions.includes(occasion);

                setFormData(prev => ({
                    ...prev,
                    recipientName: recipient_name || '',
                    occasion: isOther ? 'Other' : (occasion || ''),
                    otherOccasion: isOther ? occasion : '',
                    eventDate: event_date || '', // Added
                    contactNumber: formatPhoneNumber(contact_number || user?.user_metadata?.phone || ''),
                    preferences: notes || '',
                    addons: addons || [],
                    message: message || '',
                    deliveryAddress: deliveryAddress || '',
                    inspirationFile: null, // File object cannot be restored from JSON
                }));

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

    const handleAddonsChange = (event) => {
        const { value, checked } = event.target;
        setFormData(prev => {
            let newAddons = [...prev.addons];

            if (checked) {
                if (value === 'None') {
                    newAddons = ['None'];
                } else {
                    newAddons = newAddons.filter(item => item !== 'None');
                    newAddons.push(value);
                }
            } else {
                newAddons = newAddons.filter(item => item !== value);
            }

            return { ...prev, addons: newAddons };
        });
    };

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

        // Add eventDate handling
        let nextValue = value;
        if (name === 'eventDate' && value) {
            nextValue = value < minEventDate ? minEventDate : value;
        }

        setFormData((prev) => ({
            ...prev,
            [name]: nextValue, // Use nextValue here
        }));
    };

    const handleSaveAddress = () => {
        const { street, barangay } = addressForm;
        if (!street || !barangay) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please fill in all address fields.' });
            return;
        }
        const fullAddress = `${street}, ${barangay}, Zamboanga City`;
        setFormData(prev => ({ ...prev, deliveryAddress: fullAddress }));
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
            setStatus({ type: 'error', message: 'You must be logged in to place a special order.' });
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

            const occasion = formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion;
            const finalAddons = formData.addons.includes('None') ? [] : formData.addons;

            const inquiryData = {
                name: `Special Order: ${occasion || 'Custom'}`,
                image: imagePreview,
                requestData: {
                    type: 'special_order',
                    recipient_name: formData.recipientName,
                    occasion: occasion,
                    event_date: formData.eventDate, // Added
                    contact_number: formData.contactNumber,
                    addons: finalAddons,
                    deliveryAddress: formData.deliveryAddress,
                    image_url: imageUrl,
                    notes: formData.preferences,
                    message: formData.message,
                }
            };

            localStorage.setItem('bookingInquiry', JSON.stringify(inquiryData));
            navigate('/booking-cart');

        } catch (error) {
            console.error('Error preparing special order:', error);
            setStatus({ type: 'error', message: 'Failed to prepare your order. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
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
        <div className="special-order-page">
            <section id="orderForm" className="special-section bg-light">
                <div className="container py-5">
                    <div className="text-center mb-5">
                        <h1 className="display-5 fw-bold font-playfair mb-3">Make It Extra Special</h1>
                        <p className="lead text-muted">Add a personal touch with our curated selection of gifts and custom arrangements.</p>
                    </div>
                    <div className="row justify-content-center">
                        <div className="col-lg-8">
                            <div className="card border-0 shadow-lg rounded-4 overflow-hidden">
                                <div className="card-header bg-white border-0 text-center pt-5 pb-3">
                                    <h2 className="fw-bold text-dark font-playfair">Custom Order Request</h2>
                                    <p className="text-muted">Tell us exactly what you need</p>
                                    {status && (
                                        <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-danger'} mb-0`}>
                                            {status.message}
                                        </div>
                                    )}
                                </div>
                                <div className="card-body p-5">
                                    <form onSubmit={handleSubmit}>
                                        <div className="row g-4">
                                            {/* Form fields remain the same */}
                                            <div className="col-12">
                                                <h5 className="fw-bold text-secondary mb-3">
                                                    <i className="fas fa-user-friends me-2"></i>
                                                    Who is this for?
                                                </h5>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="recipientName">Recipient Name</label>
                                                <input
                                                    type="text"
                                                    id="recipientName"
                                                    name="recipientName"
                                                    className="form-control bg-light border-0 py-3"
                                                    placeholder="Name of recipient"
                                                    value={formData.recipientName}
                                                    onChange={handleChange}
                                                    required
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="contactNumber">Contact Number</label>
                                                <input
                                                    type="tel"
                                                    id="contactNumber"
                                                    name="contactNumber"
                                                    className="form-control bg-light border-0 py-3"
                                                    placeholder="e.g., 09171234567"
                                                    value={formData.contactNumber}
                                                    onChange={handleChange}
                                                    required
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-semibold" htmlFor="occasion">Occasion</label>
                                                <select
                                                    id="occasion"
                                                    name="occasion"
                                                    className="form-select bg-light border-0 py-3"
                                                    value={formData.occasion}
                                                    onChange={handleChange}
                                                    required
                                                >
                                                    <option value="" disabled>Select Occasion</option>
                                                    <option value="Birthday">Birthday</option>
                                                    <option value="Anniversary">Anniversary</option>
                                                    <option value="Valentines">Valentine's</option>
                                                    <option value="MothersDay">Mother's Day</option>
                                                    <option value="JustBecause">Just Because</option>
                                                    <option value="Apology">Apology</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                                {formData.occasion === 'Other' && (
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

                                            <div className="col-12 mt-4">
                                                <label className="form-label fw-semibold" htmlFor="deliveryAddress">Delivery Address</label>
                                                <input
                                                    type="text"
                                                    id="deliveryAddress"
                                                    name="deliveryAddress"
                                                    className="form-control bg-light border-0 py-3"
                                                    placeholder="Click to select delivery address"
                                                    value={formData.deliveryAddress}
                                                    onFocus={() => setShowAddressModal(true)}
                                                    readOnly
                                                    required
                                                />
                                            </div>

                                            <div className="col-12 mt-4">
                                                <label className="form-label fw-semibold" htmlFor="preferences">Your Vision in Words</label>
                                                <textarea
                                                    id="preferences"
                                                    name="preferences"
                                                    className="form-control bg-light border-0 py-3"
                                                    rows="3"
                                                    placeholder="Describe your desired arrangement. Think about flowers, color, and style."
                                                    value={formData.preferences}
                                                    onChange={handleChange}
                                                ></textarea>
                                            </div>
                                            <div className="col-12 mt-4">
                                                <label className="form-label fw-semibold">Add-on Items</label>
                                                <div className="addon-options">
                                                    <div className="form-check">
                                                        <input className="form-check-input" type="checkbox" value="Chocolates" id="addonChocolates" name="addons" onChange={handleAddonsChange} checked={formData.addons.includes('Chocolates')} />
                                                        <label className="form-check-label" htmlFor="addonChocolates">Chocolates</label>
                                                    </div>
                                                    <div className="form-check">
                                                        <input className="form-check-input" type="checkbox" value="Teddy Bear" id="addonTeddyBear" name="addons" onChange={handleAddonsChange} checked={formData.addons.includes('Teddy Bear')} />
                                                        <label className="form-check-label" htmlFor="addonTeddyBear">Teddy Bear</label>
                                                    </div>
                                                    <div className="form-check">
                                                        <input className="form-check-input" type="checkbox" value="Balloons" id="addonBalloons" name="addons" onChange={handleAddonsChange} checked={formData.addons.includes('Balloons')} />
                                                        <label className="form-check-label" htmlFor="addonBalloons">Balloons</label>
                                                    </div>
                                                    <div className="form-check">
                                                        <input className="form-check-input" type="checkbox" value="Message Card" id="addonMessageCard" name="addons" onChange={handleAddonsChange} checked={formData.addons.includes('Message Card')} />
                                                        <label className="form-check-label" htmlFor="addonMessageCard">Message Card</label>
                                                    </div>
                                                    <div className="form-check">
                                                        <input className="form-check-input" type="checkbox" value="None" id="addonNone" name="addons" onChange={handleAddonsChange} checked={formData.addons.includes('None')} />
                                                        <label className="form-check-label" htmlFor="addonNone">None</label>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="col-12 mt-4">
                                                <label className="form-label fw-semibold" htmlFor="inspirationFile">Inspiration Gallery</label>
                                                {imagePreview ? (
                                                    <div className="position-relative">
                                                        <img
                                                            src={imagePreview}
                                                            alt="Preview"
                                                            style={{
                                                                width: '100%',
                                                                maxHeight: '400px',
                                                                objectFit: 'contain',
                                                                borderRadius: '12px',
                                                                border: '2px solid #e0e0e0',
                                                                padding: '10px',
                                                                background: '#f8f9fa'
                                                            }}
                                                        />
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
                                                <label className="form-label fw-semibold" htmlFor="message">Message for Card (Optional)</label>
                                                <textarea id="message" name="message" className="form-control bg-light border-0 py-3" rows="3" placeholder="Write your heartfelt message here..." value={formData.message} onChange={handleChange}></textarea>
                                            </div>
                                            <div className="col-12 mt-5">
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
                            <h4>Set Delivery Address</h4>
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

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
            />
        </div>
    );
};

export default SpecialOrder;