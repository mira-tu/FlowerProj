import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { formatPhoneNumber } from '../utils/format';
import InfoModal from '../components/InfoModal';
import CheckoutAddressSelection from '../components/CheckoutAddressSelection';
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

const arrangementOptions = [
    {
        label: 'Funeral',
        options: [
            { value: 'Funeral Wreath (Large, 100 flowers)', label: 'Funeral Wreath (Large, 100 flowers)' },
            { value: 'Funeral Wreath (Medium, 50 flowers)', label: 'Funeral Wreath (Medium, 50 flowers)' },
            { value: 'Funeral Flower Stand (Large, 100 flowers)', label: 'Funeral Flower Stand (Large, 100 flowers)' },
            { value: 'Funeral Flower Stand (Medium, 50 flowers)', label: 'Funeral Flower Stand (Medium, 50 flowers)' },
            { value: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)', label: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)' },
            { value: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)', label: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)' },
        ]
    },
    {
        label: 'Bridal / Wedding',
        options: [
            { value: 'Bridal Bouquet (20 flowers)', label: 'Bridal Bouquet (20 flowers)' },
            { value: 'Bridesmaid Bouquet (10 flowers)', label: 'Bridesmaid Bouquet (10 flowers)' },
            { value: 'Corsage (3 flowers)', label: 'Corsage (3 flowers)' },
        ]
    },
    {
        label: 'General',
        options: [
            { value: 'Table Centerpiece (12 flowers)', label: 'Table Centerpiece (12 flowers)' },
            { value: 'Flower Box (Medium, 9 flowers)', label: 'Flower Box (Medium, 9 flowers)' },
            { value: 'Flower Box (Large, 15 flowers)', label: 'Flower Box (Large, 15 flowers)' },
        ]
    },
    {
        label: 'Custom',
        options: [
            { value: 'Other', label: 'Others (Specify below)' },
        ]
    }
];

const flattenedArrangementOptions = arrangementOptions.flatMap((group) => group.options);

const extractFlowersPerArrangement = (arrangementLabel = '') => {
    if (!arrangementLabel) return 0;
    const match = arrangementLabel.match(/(\d+)\s*flowers?/i);
    if (!match) return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

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

const buildMultiSelectStyles = (hasError) => ({
    control: (base, state) => ({
        ...base,
        border: hasError ? '1px solid #dc3545' : '1px solid rgba(240, 123, 150, 0.14)',
        backgroundColor: '#fffaf8',
        padding: '8px 10px',
        borderRadius: '18px',
        minHeight: '60px',
        boxShadow: state.isFocused ? '0 0 0 4px rgba(240, 123, 150, 0.12)' : 'none',
        transition: 'all 0.2s ease',
        '&:hover': {
            borderColor: hasError ? '#dc3545' : 'rgba(240, 123, 150, 0.4)'
        }
    }),
    valueContainer: (base) => ({
        ...base,
        gap: '6px',
        padding: 0
    }),
    placeholder: (base) => ({
        ...base,
        color: '#8f7f86'
    }),
    multiValue: (base) => ({
        ...base,
        backgroundColor: 'rgba(240, 123, 150, 0.14)',
        borderRadius: '999px',
        padding: '3px 6px'
    }),
    multiValueLabel: (base) => ({
        ...base,
        color: '#7a2444',
        fontWeight: 600,
        paddingRight: '6px'
    }),
    multiValueRemove: (base) => ({
        ...base,
        color: '#7a2444',
        borderRadius: '999px',
        ':hover': {
            backgroundColor: 'rgba(122, 36, 68, 0.12)',
            color: '#7a2444'
        }
    }),
    clearIndicator: (base) => ({
        ...base,
        color: '#b9a7af',
        ':hover': {
            color: '#7a2444'
        }
    }),
    dropdownIndicator: (base, state) => ({
        ...base,
        color: state.isFocused ? '#f07b96' : '#b9a7af',
        ':hover': {
            color: '#f07b96'
        }
    }),
    indicatorSeparator: () => ({
        display: 'none'
    }),
    menu: (base) => ({
        ...base,
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 18px 40px rgba(65, 35, 46, 0.12)'
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
            ? 'rgba(240, 123, 150, 0.16)'
            : state.isFocused
                ? '#fff2f5'
                : '#fff',
        color: '#41232e',
        cursor: 'pointer'
    }),
    groupHeading: (base) => ({
        ...base,
        fontWeight: 700,
        color: '#6c4b57',
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em'
    })
});

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
        arrangementTypes: [],
        arrangementQuantities: {},
        flowerQuantity: '',
        specialInstructions: '',
        inspirationFile: null
    });

    const [imagePreview, setImagePreview] = useState(null);
    const [fileSizeError, setFileSizeError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showImageZoom, setShowImageZoom] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });
    const [dateError, setDateError] = useState('');
    const [timeError, setTimeError] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState(null);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [validated, setValidated] = useState(false);

    // Sync selected address to venue field
    useEffect(() => {
        if (deliveryAddress) {
            const venueStr = `${deliveryAddress.street || ''}, ${deliveryAddress.barangay || ''}, ${deliveryAddress.city || ''}, ${deliveryAddress.province || ''}`.replace(/, ,/g, ',').replace(/^, |, $/g, '');
            setFormData(prev => ({ ...prev, venue: venueStr }));
        }
    }, [deliveryAddress]);

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

    const selectedArrangementOptions = useMemo(
        () => flattenedArrangementOptions.filter((option) => formData.arrangementTypes.includes(option.value)),
        [formData.arrangementTypes]
    );

    const hasOtherArrangement = formData.arrangementTypes.includes('Other');

    const otherFlowersPerArrangement = useMemo(() => {
        const parsedCount = Number.parseInt(formData.flowerQuantity, 10);
        return Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0;
    }, [formData.flowerQuantity]);

    const arrangementDetails = useMemo(() => {
        if (!selectedArrangementOptions.length) return [];

        return selectedArrangementOptions.map((option) => {
            const parsedQty = Number.parseInt(formData.arrangementQuantities?.[option.value], 10);
            const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
            const isOther = option.value === 'Other';
            const label = isOther
                ? (formData.otherArrangementType?.trim() || option.label)
                : option.label;
            const flowersPerArrangement = isOther
                ? otherFlowersPerArrangement
                : extractFlowersPerArrangement(option.label);

            return {
                value: option.value,
                label,
                quantity,
                flowersPerArrangement,
                totalFlowers: flowersPerArrangement > 0 ? flowersPerArrangement * quantity : 0
            };
        });
    }, [formData.arrangementQuantities, formData.otherArrangementType, otherFlowersPerArrangement, selectedArrangementOptions]);

    const arrangementSummary = useMemo(
        () => arrangementDetails.map((detail) => detail.label + ' x' + detail.quantity).join(', '),
        [arrangementDetails]
    );

    const totalArrangementQuantity = useMemo(
        () => arrangementDetails.reduce((sum, detail) => sum + detail.quantity, 0),
        [arrangementDetails]
    );

    const totalEstimatedFlowers = useMemo(
        () => arrangementDetails.reduce((sum, detail) => sum + detail.totalFlowers, 0),
        [arrangementDetails]
    );

    const handleArrangementSelect = (selectedOptions) => {
        const selectedValues = (selectedOptions || []).map((option) => option.value);
        setFormData(prev => {
            const nextQuantities = {};
            selectedValues.forEach((value) => {
                const existingQty = Number.parseInt(prev.arrangementQuantities?.[value], 10);
                nextQuantities[value] = Number.isFinite(existingQty) && existingQty > 0 ? String(existingQty) : '1';
            });

            const nextState = {
                ...prev,
                arrangementTypes: selectedValues,
                arrangementQuantities: nextQuantities
            };

            if (!selectedValues.includes('Other')) {
                nextState.otherArrangementType = '';
                nextState.flowerQuantity = '';
            }

            return nextState;
        });
    };

    const handleArrangementQuantityChange = (arrangementValue, value) => {
        const digitsOnly = value.replace(/[^\d]/g, '');
        const nextValue = digitsOnly === '' ? '' : String(Math.max(1, Number.parseInt(digitsOnly, 10)));
        setFormData(prev => ({
            ...prev,
            arrangementQuantities: {
                ...prev.arrangementQuantities,
                [arrangementValue]: nextValue
            }
        }));
    };

    const handleArrangementQuantityStep = (arrangementValue, direction) => {
        const currentValue = Number.parseInt(formData.arrangementQuantities?.[arrangementValue], 10);
        const safeCurrentValue = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : 1;
        const nextValue = Math.max(1, safeCurrentValue + direction);
        handleArrangementQuantityChange(arrangementValue, String(nextValue));
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
        const form = e.currentTarget;

        if (form.checkValidity() === false) {
            e.stopPropagation();
            setValidated(true);

            // Find the first invalid element and scroll to it
            setTimeout(() => {
                const firstInvalid = form.querySelector(':invalid');
                if (firstInvalid) {
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Optional: add focus for accessibility
                    firstInvalid.focus({ preventScroll: true });
                }
            }, 100);

            // Generic missing fields warning
            setInfoModal({
                show: true,
                title: 'Missing Required Fields',
                message: 'Please fill in all highlighted required fields.'
            });
            return;
        }

        if (!user) {
            setInfoModal({
                show: true,
                title: 'Login Required',
                message: 'Please login first to submit a custom booking request.',
                linkTo: '/login',
                linkText: 'Log In'
            });
            return;
        }

        // Custom validation logic passed, clear validated state if any
        setValidated(true); // Keep it true so greens show
        setShowConfirmModal(true);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);

        const arrangementSelections = arrangementDetails.map((detail) => ({
            arrangement_type: detail.value,
            arrangement_label: detail.label,
            quantity: detail.quantity,
            flowers_per_arrangement: detail.flowersPerArrangement || 0,
            total_flowers: detail.totalFlowers || 0
        }));

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
            address_id: selectedAddressId || null,
            deliveryAddress: deliveryAddress || null,
            arrangementType: arrangementSummary || selectedArrangementOptions.map((option) => option.label).join(', '),
            arrangementTypes: selectedArrangementOptions.map((option) => option.value === 'Other' ? (formData.otherArrangementType?.trim() || option.label) : option.label),
            arrangementTypeValues: selectedArrangementOptions.map((option) => option.value),
            arrangementQuantities: formData.arrangementQuantities,
            arrangementSelections,
            arrangementSummary,
            arrangementQuantity: totalArrangementQuantity || 1,
            flowerQuantity: hasOtherArrangement ? (formData.flowerQuantity || null) : null,
            totalFlowers: totalEstimatedFlowers > 0 ? totalEstimatedFlowers : null,
            flowers: formData.selectedFlowers.map(f => f.label).join(', ') + (formData.otherFlowersText ? ` (${formData.otherFlowersText})` : ''),
            colorPreference: formData.colorPreference === 'Others' ? formData.otherColorPreference : formData.colorPreference,
            specialInstructions: formData.specialInstructions,
            inspirationImageBase64: imagePreview,
            price: null
        };

        // 2. Save to Local Storage
        let currentCart = [];
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        try {
            const stored = localStorage.getItem(cartKey);
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
            localStorage.setItem(cartKey, JSON.stringify(currentCart));
        } catch (e) {
            console.error("Quota Exceeded! Resetting tracking cart forcefully", e);
            localStorage.setItem(cartKey, JSON.stringify([newCartItem])); // Reset with newest item only
        }

        // 3. Clear modal and navigate
        setShowConfirmModal(false);
        setIsSubmitting(false);
        navigate('/cart', { state: { justAdded: 'booking' } });
    };

    return (
        <div style={{ backgroundColor: '#fcfaf8', minHeight: '100vh', paddingTop: '80px', paddingBottom: '60px' }}>
            <style>
                {`
                .hide-valid-indicators.was-validated .form-control:valid, 
                .hide-valid-indicators.was-validated .form-select:valid {
                    border-color: #dee2e6 !important;
                    padding-right: .75rem !important;
                    background-image: none !important;
                }
                `}
            </style>
            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
                linkState={infoModal.linkState}
            />
            <div className="container">

                {/* Header Section */}
                <div className="text-center mb-5 mt-4">
                    <h1 className="display-4 fw-bold font-playfair text-dark">Custom Floral & Custom Order</h1>
                    <p className="lead text-muted mx-auto" style={{ maxWidth: '700px' }}>
                        Whether it's a personalized bouquet or full event styling, let us bring your floral vision to life. Fill out the details below to request a quote.
                    </p>
                </div>

                <div className="row justify-content-center">
                    <div className="col-lg-9">
                        <div className="card border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                            <div className="card-body p-4 p-md-5 bg-white">

                                <form noValidate className={`hide-valid-indicators ${validated ? 'was-validated' : ''}`} onSubmit={triggerValidation}>

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

                                        <div className="col-12">
                                            <label className="form-label fw-semibold">Venue / Delivery Address <span className="text-danger">*</span></label>
                                            {user ? (
                                                <CheckoutAddressSelection
                                                    user={user}
                                                    address={deliveryAddress}
                                                    setAddress={setDeliveryAddress}
                                                    selectedAddressId={selectedAddressId}
                                                    setSelectedAddressId={setSelectedAddressId}
                                                    showInfoModal={(title, message) => setInfoModal({ show: true, title, message })}
                                                />
                                            ) : (
                                                <input type="text" name="venue" className="form-control bg-light border-0 py-3" placeholder="Enter complete address..." value={formData.venue} onChange={handleChange} required />
                                            )}
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
                                        <div className="col-12">
                                            <div className="arrangement-builder">
                                                <div className="row g-4 align-items-start">
                                                    <div className="col-12 position-relative">
                                                        <label className="form-label fw-semibold">Arrangement Type <span className="text-danger">*</span></label>
                                                        <Select
                                                            isMulti
                                                            options={arrangementOptions}
                                                            placeholder="Search or select type..."
                                                            onChange={handleArrangementSelect}
                                                            value={flattenedArrangementOptions.filter((option) => formData.arrangementTypes.includes(option.value))}
                                                            closeMenuOnSelect={false}
                                                            styles={buildMultiSelectStyles(validated && formData.arrangementTypes.length === 0)}
                                                        />
                                                        <input
                                                            type="text"
                                                            tabIndex={-1}
                                                            style={{ opacity: 0, height: 0, position: 'absolute', bottom: 10, left: 20 }}
                                                            value={formData.arrangementTypes.length > 0 ? 'selected' : ''}
                                                            onChange={() => { }}
                                                            required
                                                        />
                                                        {validated && formData.arrangementTypes.length === 0 && (
                                                            <div className="text-danger small mt-1">Please select at least one arrangement type.</div>
                                                        )}
                                                        <div className="form-text arrangement-helper-text">
                                                            Choose one or more arrangement types, then set the quantity for each selection below.
                                                        </div>
                                                        {hasOtherArrangement && (
                                                            <div className="arrangement-other-panel mt-3">
                                                                <input type="text" name="otherArrangementType" className="form-control bg-light border-0 py-3" placeholder="Describe your custom arrangement" value={formData.otherArrangementType} onChange={handleChange} required />
                                                                <div className="mt-3">
                                                                    <label className="form-label fw-semibold mb-2">Flowers per "Others" Arrangement</label>
                                                                    <input type="number" name="flowerQuantity" className="form-control bg-light border-0 py-3" placeholder="e.g., 50" min="1" value={formData.flowerQuantity} onChange={handleChange} required />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="col-12">
                                                        <label className="form-label fw-semibold">Arrangement Quantities</label>
                                                        {arrangementDetails.length === 0 ? (
                                                            <div className="arrangement-empty-state">
                                                                <div className="arrangement-empty-state__title">No arrangement selected yet</div>
                                                                <div className="arrangement-empty-state__text">Selected arrangement types will appear here as cards so the quantity for each one is easy to adjust.</div>
                                                            </div>
                                                        ) : (
                                                            <div className="arrangement-card-grid">
                                                                {arrangementDetails.map((detail) => (
                                                                    <div key={detail.value} className="arrangement-qty-card">
                                                                        <div className="arrangement-qty-card__head">
                                                                            <div>
                                                                                <div className="arrangement-qty-card__title">{detail.label}</div>
                                                                                <div className="arrangement-qty-card__meta">
                                                                                    {detail.flowersPerArrangement > 0
                                                                                        ? detail.flowersPerArrangement + ' flowers each'
                                                                                        : 'Custom flower count pending'}
                                                                                </div>
                                                                            </div>
                                                                            <div className="arrangement-qty-card__pill">
                                                                                Qty {detail.quantity}
                                                                            </div>
                                                                        </div>

                                                                        <div className="arrangement-stepper">
                                                                            <button
                                                                                type="button"
                                                                                className="arrangement-stepper__button"
                                                                                onClick={() => handleArrangementQuantityStep(detail.value, -1)}
                                                                                aria-label={'Decrease quantity for ' + detail.label}
                                                                            >
                                                                                -
                                                                            </button>
                                                                            <input
                                                                                type="number"
                                                                                className="arrangement-stepper__input"
                                                                                min="1"
                                                                                value={formData.arrangementQuantities?.[detail.value] || '1'}
                                                                                onChange={(e) => handleArrangementQuantityChange(detail.value, e.target.value)}
                                                                                aria-label={'Quantity for ' + detail.label}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                className="arrangement-stepper__button"
                                                                                onClick={() => handleArrangementQuantityStep(detail.value, 1)}
                                                                                aria-label={'Increase quantity for ' + detail.label}
                                                                            >
                                                                                +
                                                                            </button>
                                                                        </div>

                                                                        <div className="arrangement-qty-card__footer">
                                                                            {detail.totalFlowers > 0
                                                                                ? detail.totalFlowers + ' flowers total for this arrangement'
                                                                                : 'Add a flower count for the custom arrangement to estimate the total.'}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-12 mt-3 position-relative">
                                            <label className="form-label fw-semibold">Preferred Flowers <span className="text-danger">*</span></label>
                                            <Select
                                                isMulti
                                                options={flowerOptions}
                                                placeholder="Select flowers..."
                                                onChange={handleFlowerSelect}
                                                value={formData.selectedFlowers}
                                                styles={buildMultiSelectStyles(validated && (!formData.selectedFlowers || formData.selectedFlowers.length === 0))}
                                            />
                                            <input
                                                type="text"
                                                tabIndex={-1}
                                                style={{ opacity: 0, height: 0, position: 'absolute', bottom: 10, left: 20 }}
                                                value={formData.selectedFlowers.length > 0 ? 'selected' : ''}
                                                onChange={() => { }}
                                                required
                                            />
                                            {validated && (!formData.selectedFlowers || formData.selectedFlowers.length === 0) && (
                                                <div className="text-danger small mt-1">Please select at least one preferred flower.</div>
                                            )}
                                            {formData.selectedFlowers.some(f => f.value === 'Others') && (
                                                <input type="text" name="otherFlowersText" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify flowers (e.g., Peonies, Baby's Breath)" value={formData.otherFlowersText} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-12 mt-3 position-relative">
                                            <label className="form-label fw-semibold">Color Palette & Theme Preference <span className="text-danger">*</span></label>
                                            <Select
                                                options={colorOptions}
                                                formatOptionLabel={customColorOptionLabel}
                                                placeholder="Select Color Theme..."
                                                onChange={handleColorSelect}
                                                value={colorOptions.find(option => option.value === formData.colorPreference) || null}
                                                isClearable
                                                styles={{
                                                    control: (base) => ({
                                                        ...base,
                                                        border: (validated && !formData.colorPreference) ? '1px solid #dc3545' : '0',
                                                        backgroundColor: '#f8f9fa',
                                                        padding: '6px',
                                                        borderRadius: '8px',
                                                        boxShadow: 'none'
                                                    })
                                                }}
                                            />
                                            <input
                                                type="text"
                                                tabIndex={-1}
                                                style={{ opacity: 0, height: 0, position: 'absolute', bottom: 10, left: 20 }}
                                                value={formData.colorPreference || ''}
                                                onChange={() => { }}
                                                required
                                            />
                                            {validated && !formData.colorPreference && (
                                                <div className="text-danger small mt-1">Please select a color theme.</div>
                                            )}
                                            {formData.colorPreference === 'Others' && (
                                                <input type="text" name="otherColorPreference" className="form-control bg-light border-0 py-3 mt-2" placeholder="Please specify your color preference" value={formData.otherColorPreference} onChange={handleChange} required />
                                            )}
                                        </div>

                                        <div className="col-12 mt-4">
                                            <label className="form-label fw-semibold">Special Instructions <span className="text-danger">*</span></label>
                                            <textarea name="specialInstructions" className="form-control bg-light border-0 py-3" rows="5" placeholder="Include any specific directions, themes, budgets, or other details you'd like us to know..." value={formData.specialInstructions} onChange={handleChange} required></textarea>
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
                <div className="modal-overlay" style={{ zIndex: 1060 }} onClick={(e) => { if (e.target === e.currentTarget) setShowConfirmModal(false); }}>
                    <div className="modal-content-custom bg-white p-4" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="text-center mb-4">
                            <h3 className="fw-bold font-playfair">Confirm Your Request</h3>
                            <p className="text-muted">Please verify your details before submitting.</p>
                        </div>

                        <div className="bg-light rounded p-3 mb-4 small">
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
                                <span className="fw-semibold text-end" style={{ maxWidth: '60%' }}>{arrangementSummary || 'N/A'}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Total Quantity:</span>
                                <span className="fw-semibold text-end">{totalArrangementQuantity || 1}</span>
                            </div>
                            {hasOtherArrangement && formData.flowerQuantity && (
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Flowers per "Others" Arrangement:</span>
                                    <span className="fw-semibold text-end">{formData.flowerQuantity}</span>
                                </div>
                            )}
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
                                    <img
                                        src={imagePreview}
                                        alt="Inspiration"
                                        className="rounded-3 border"
                                        style={{ maxHeight: '120px', maxWidth: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                        onClick={() => setShowImageZoom(true)}
                                        title="Click to zoom"
                                    />
                                    <p className="text-muted small mt-1 mb-0"><i className="fas fa-search-plus me-1"></i>Click image to zoom</p>
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

            {/* Image Zoom Modal */}
            {showImageZoom && imagePreview && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 1070, cursor: 'pointer' }}
                    onClick={() => setShowImageZoom(false)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '20px' }}>
                        <img
                            src={imagePreview}
                            alt="Zoomed Inspiration"
                            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookEvent;

