import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';

const CheckoutAddressSelection = ({
    user,
    address,
    setAddress,
    selectedAddressId,
    setSelectedAddressId,
    showInfoModal
}) => {
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [addressForm, setAddressForm] = useState({
        id: null,
        label: 'Home',
        name: '',
        phone: '',
        street: '',
        barangay: '',
        city: 'Zamboanga City',
        province: 'Zamboanga del Sur',
        zip: '7000',
        is_default: false
    });
    const [formErrors, setFormErrors] = useState({});
    const [barangays, setBarangays] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [addressLoading, setAddressLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAddressSelect = useCallback((addressId, addressesToSearch = savedAddresses) => {
        if (!addressesToSearch) return;
        const selectedAddr = addressesToSearch.find(addr => String(addr.id) === String(addressId));
        if (selectedAddr) {
            setAddress({
                name: selectedAddr.name || '',
                phone: selectedAddr.phone || '',
                street: selectedAddr.street || '',
                barangay: selectedAddr.barangay || '',
                city: selectedAddr.city || '',
                province: selectedAddr.province || '',
            });
            setSelectedAddressId(selectedAddr.id);
        }
    }, [savedAddresses, setAddress, setSelectedAddressId]);

    useEffect(() => {
        const fetchAddresses = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('user_id', user.id);

                if (error) {
                    console.error('Error fetching addresses:', error);
                    return;
                }

                const activeAddresses = data.filter(addr => !addr.label.startsWith('[DEL]'));
                setSavedAddresses(activeAddresses);

                if (activeAddresses && activeAddresses.length > 0) {
                    if (!selectedAddressId) {
                        const defaultAddress = activeAddresses.find(addr => addr.is_default) || activeAddresses[0];
                        if (defaultAddress) {
                            handleAddressSelect(defaultAddress.id, activeAddresses);
                        }
                    }
                } else {
                    setAddress({
                        name: user?.user_metadata?.name || user?.email || '',
                        phone: user?.user_metadata?.phone || '',
                        street: '',
                        barangay: '',
                        city: '',
                        province: '',
                    });
                    setSelectedAddressId(null);
                }
            } else {
                setSavedAddresses([]);
                setAddress({ name: '', phone: '', street: '', barangay: '', city: '', province: '' });
                setSelectedAddressId(null);
            }
        };

        fetchAddresses();
    }, [user, handleAddressSelect]);

    const selectStyles = {
        control: (provided) => ({
            ...provided,
            borderColor: '#dee2e6',
            borderRadius: '0.375rem',
            padding: '2px',
            minHeight: '38px',
            fontSize: '1rem',
        }),
        menu: (provided) => ({
            ...provided,
            zIndex: 1050,
        }),
    };

    const openAddressModal = (addressToEdit = null) => {
        if (addressToEdit) {
            setIsEditingAddress(true);
            setAddressForm({ ...addressToEdit });
        } else {
            setIsEditingAddress(false);
            setAddressForm({
                id: null,
                label: 'Home',
                name: user?.user_metadata?.name || user?.email || '',
                phone: user?.user_metadata?.phone || '',
                street: '',
                barangay: '',
                city: 'Zamboanga City',
                province: 'Zamboanga del Sur',
                zip: '7000',
                is_default: false
            });
            setSelectedBarangay(null);
        }
        setFormErrors({});
        setShowAddressModal(true);
    };

    useEffect(() => {
        if (showAddressModal) {
            setAddressLoading(true);
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/097332000/barangays/`)
                .then(response => response.json())
                .then(data => {
                    const barangayOptions = data.map(b => ({ value: b.code, label: b.name }));
                    setBarangays(barangayOptions);

                    if (isEditingAddress && addressForm.barangay) {
                        const existingOption = barangayOptions.find(b => b.label === addressForm.barangay);
                        if (existingOption) {
                            setSelectedBarangay(existingOption);
                        }
                    }
                })
                .catch(error => console.error('Error fetching barangays:', error))
                .finally(() => setAddressLoading(false));
        }
    }, [showAddressModal, isEditingAddress, addressForm.barangay]);

    const handleAddressFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setAddressForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSaveAddress = async (e) => {
        e.preventDefault();

        if (!addressForm.street || !addressForm.barangay || !addressForm.city || !addressForm.province || !addressForm.phone || !addressForm.name) {
            showInfoModal('Required Fields', 'Please fill in all required fields.');
            return;
        }

        const cleanPhone = addressForm.phone.replace(/\D/g, '');
        const phoneRegex = /^09\d{9}$/;

        if (!phoneRegex.test(cleanPhone)) {
            setFormErrors({ phone: 'Please enter a valid mobile number (11 digits starting with 09)' });
            return;
        }

        setIsProcessing(true);
        // eslint-disable-next-line
        const { id, zip, ...addressData } = addressForm;
        const payload = { ...addressData, user_id: user.id };

        try {
            if (payload.is_default) {
                await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id);
            }

            let data, error;
            if (isEditingAddress && id) {
                const result = await supabase.from('addresses').update(payload).eq('id', id).select();
                data = result.data; error = result.error;
            } else {
                const result = await supabase.from('addresses').insert([payload]).select();
                data = result.data; error = result.error;
            }

            if (error) throw error;

            const { data: newAddresses } = await supabase.from('addresses').select('*').eq('user_id', user.id);
            const activeAddresses = newAddresses.filter(addr => !addr.label.startsWith('[DEL]'));
            setSavedAddresses(activeAddresses);

            if (data && data.length > 0) {
                handleAddressSelect(data[0].id, activeAddresses);
            }

            setShowAddressModal(false);
        } catch (err) {
            console.error('Error saving address:', err);
            showInfoModal('Error', 'Failed to save address. ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="checkout-section">
            <h5 className="section-title mb-3">
                <i className="fas fa-map-marker-alt"></i> Delivery Address
            </h5>

            {user ? (
                savedAddresses.length > 0 ? (
                    <div className="mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <label className="form-label small text-muted fw-bold mb-0">Select from your saved addresses</label>
                            <button
                                className="btn btn-sm btn-link text-decoration-none p-0"
                                onClick={() => openAddressModal()}
                                style={{ color: 'var(--shop-pink)' }}
                            >
                                <i className="fas fa-plus-circle me-1"></i> Add New
                            </button>
                        </div>
                        <select
                            className="form-select"
                            value={selectedAddressId || ''}
                            onChange={(e) => handleAddressSelect(e.target.value)}
                        >
                            {savedAddresses.map(addr => (
                                <option key={addr.id} value={addr.id}>
                                    {addr.label} {addr.is_default && '(Default)'} - {`${addr.street}, ${addr.barangay}, ${addr.city}`}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div className="alert alert-warning">
                        <div className="d-flex justify-content-between align-items-center">
                            <div>
                                <i className="fas fa-info-circle me-2"></i> You have no saved addresses.
                            </div>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => openAddressModal()}
                                style={{ background: 'var(--shop-pink)', border: 'none' }}
                            >
                                Add Address
                            </button>
                        </div>
                    </div>
                )
            ) : (
                <div className="alert alert-danger">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    Please <Link to="/login" style={{ color: 'var(--shop-pink)' }}>log in</Link> to use the delivery option.
                </div>
            )}

            {selectedAddressId && (
                <div className="p-3 rounded position-relative" style={{ background: '#f8f9fa' }}>
                    <button
                        className="btn btn-sm btn-link position-absolute top-0 end-0 mt-2 me-2"
                        onClick={() => {
                            const addr = savedAddresses.find(a => String(a.id) === String(selectedAddressId));
                            openAddressModal(addr);
                        }}
                        style={{ color: 'var(--shop-pink)' }}
                    >
                        <i className="fas fa-edit"></i> Edit
                    </button>
                    <p className='mb-1'><strong>Recipient:</strong> {address.name}</p>
                    <p className='mb-1'><strong>Phone:</strong> {address.phone}</p>
                    <p className='mb-0'><strong>Address:</strong> {`${address.street}, ${address.barangay}, ${address.city}`}</p>
                </div>
            )}

            {showAddressModal && (
                <div className="modal-overlay" onClick={() => !isProcessing && setShowAddressModal(false)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="modal-header-custom">
                            <h4>{isEditingAddress ? 'Edit Address' : 'Add New Address'}</h4>
                            <button className="modal-close" onClick={() => !isProcessing && setShowAddressModal(false)} disabled={isProcessing}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            <form onSubmit={handleSaveAddress}>
                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label">Location Label (Optional)</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="label"
                                            placeholder="e.g. Home, Office"
                                            value={addressForm.label}
                                            onChange={handleAddressFormChange}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Full Name <span className="text-danger">*</span></label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="name"
                                            required
                                            value={addressForm.name}
                                            onChange={handleAddressFormChange}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Phone Number <span className="text-danger">*</span></label>
                                        <input
                                            type="tel"
                                            className={`form-control ${formErrors.phone ? 'is-invalid' : ''}`}
                                            name="phone"
                                            required
                                            value={addressForm.phone}
                                            onChange={(e) => {
                                                const formatted = formatPhoneNumber(e.target.value);
                                                setAddressForm(prev => ({ ...prev, phone: formatted }));
                                                const clean = formatted.replace(/\D/g, '');
                                                if (/^09\d{9}$/.test(clean)) {
                                                    if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                                                }
                                            }}
                                        />
                                        {formErrors.phone && <div className="invalid-feedback">{formErrors.phone}</div>}
                                    </div>
                                    <div className="col-md-12">
                                        <label className="form-label">Street Address <span className="text-danger">*</span></label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="street"
                                            placeholder="House No., Street Name, Subdivision"
                                            required
                                            value={addressForm.street}
                                            onChange={handleAddressFormChange}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Barangay <span className="text-danger">*</span></label>
                                        <Select
                                            styles={selectStyles}
                                            options={barangays}
                                            isLoading={addressLoading}
                                            placeholder="Select Barangay"
                                            onChange={option => {
                                                setSelectedBarangay(option);
                                                setAddressForm(prev => ({ ...prev, barangay: option ? option.label : '' }));
                                            }}
                                            value={selectedBarangay}
                                            isClearable
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">City/Municipality <span className="text-danger">*</span></label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            name="city"
                                            readOnly
                                            disabled
                                            style={{ backgroundColor: '#e9ecef' }}
                                            value={addressForm.city}
                                            onChange={handleAddressFormChange}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 d-flex justify-content-end gap-2">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setShowAddressModal(false)}
                                        disabled={isProcessing}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={isProcessing}
                                        style={{ background: 'var(--shop-pink)', border: 'none' }}
                                    >
                                        {isProcessing ? 'Saving...' : 'Save Address'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CheckoutAddressSelection;
