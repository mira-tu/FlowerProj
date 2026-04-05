import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { supabase } from '../config/supabase';
import { DEFAULT_SIGNUP_ADDRESS } from '../utils/customerProfile';

const SignupAddressModal = ({
    show,
    initialValue,
    disabled = false,
    onClose,
    onSave,
}) => {
    const [addressForm, setAddressForm] = useState(DEFAULT_SIGNUP_ADDRESS);
    const [barangays, setBarangays] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!show) {
            return;
        }

        setAddressForm({
            ...DEFAULT_SIGNUP_ADDRESS,
            ...(initialValue || {}),
            city: initialValue?.city || DEFAULT_SIGNUP_ADDRESS.city,
        });
        setError('');
    }, [initialValue, show]);

    useEffect(() => {
        if (!show) {
            return;
        }

        let isActive = true;

        const fetchBarangays = async () => {
            setIsLoadingBarangays(true);

            try {
                const { data, error: barangayError } = await supabase
                    .from('barangay_fee')
                    .select('barangay_name')
                    .order('barangay_name', { ascending: true });

                if (barangayError) {
                    throw barangayError;
                }

                if (!isActive) {
                    return;
                }

                const nextOptions = (data || []).map((item) => ({
                    value: item.barangay_name,
                    label: item.barangay_name,
                }));

                setBarangays(nextOptions);
            } catch (fetchError) {
                console.error('Error fetching barangays for signup address modal:', fetchError);
                if (isActive) {
                    setBarangays([]);
                }
            } finally {
                if (isActive) {
                    setIsLoadingBarangays(false);
                }
            }
        };

        fetchBarangays();

        return () => {
            isActive = false;
        };
    }, [show]);

    useEffect(() => {
        if (!show) {
            return;
        }

        const nextSelectedBarangay = barangays.find((option) => option.label === addressForm.barangay) || null;
        setSelectedBarangay(nextSelectedBarangay);
    }, [addressForm.barangay, barangays, show]);

    const selectStyles = useMemo(() => ({
        control: (provided, state) => ({
            ...provided,
            borderColor: error && !addressForm.barangay ? '#dc3545' : (state.isFocused ? 'var(--main-pink)' : '#e9ecef'),
            borderRadius: '12px',
            minHeight: '56px',
            boxShadow: state.isFocused ? '0 0 0 4px rgba(240, 123, 150, 0.15)' : 'none',
            backgroundColor: '#fafafa',
        }),
        menu: (provided) => ({
            ...provided,
            zIndex: 2000,
        }),
        placeholder: (provided) => ({
            ...provided,
            color: '#999',
        }),
    }), [addressForm.barangay, error]);

    const handleSave = (event) => {
        event.preventDefault();

        if (!addressForm.street.trim() || !addressForm.barangay.trim() || !addressForm.city.trim()) {
            setError('Please complete your delivery address before continuing.');
            return;
        }

        onSave?.({
            street: addressForm.street.trim(),
            barangay: addressForm.barangay.trim(),
            city: addressForm.city.trim(),
        });
    };

    if (!show) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={() => !disabled && onClose?.()}>
            <div
                className="modal-content-custom signup-address-modal"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header-custom">
                    <h4>Default Address</h4>
                    <button
                        type="button"
                        className="modal-close"
                        onClick={() => !disabled && onClose?.()}
                        disabled={disabled}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="modal-body-custom">
                    <p className="text-muted small mb-4">
                        Add the address you want the system to use for delivery, orders, and future prefills.
                    </p>

                    <form onSubmit={handleSave}>
                        <div className="row g-3">
                            <div className="col-12">
                                <label className="form-label fw-semibold">Street Address <span className="text-danger">*</span></label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={addressForm.street}
                                    onChange={(event) => {
                                        setAddressForm((prev) => ({ ...prev, street: event.target.value }));
                                        if (error) {
                                            setError('');
                                        }
                                    }}
                                    placeholder="House No., Street, Purok, Subdivision"
                                    required
                                    disabled={disabled}
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-semibold">Barangay <span className="text-danger">*</span></label>
                                <Select
                                    styles={selectStyles}
                                    options={barangays}
                                    isLoading={isLoadingBarangays}
                                    placeholder="Select Barangay"
                                    value={selectedBarangay}
                                    onChange={(option) => {
                                        setSelectedBarangay(option);
                                        setAddressForm((prev) => ({
                                            ...prev,
                                            barangay: option ? option.label : '',
                                        }));
                                        if (error) {
                                            setError('');
                                        }
                                    }}
                                    isClearable
                                    isDisabled={disabled}
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-semibold">City</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={addressForm.city}
                                    onChange={(event) => {
                                        setAddressForm((prev) => ({ ...prev, city: event.target.value }));
                                        if (error) {
                                            setError('');
                                        }
                                    }}
                                    disabled={disabled}
                                    readOnly
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="alert alert-danger mt-3 mb-0" role="alert">
                                {error}
                            </div>
                        )}

                        <div className="d-flex justify-content-end gap-2 mt-4 flex-wrap">
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => onClose?.()}
                                disabled={disabled}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-auth signup-address-save"
                                disabled={disabled}
                            >
                                Save Address
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SignupAddressModal;
