import React from 'react';
import { createDeliveryAssignments, syncDeliveryAssignments } from '../utils/deliveryDestinations';

const MultiAddressDeliverySection = ({
    checkoutItems,
    savedAddresses,
    selectedAddressId,
    enabled,
    setEnabled,
    assignments,
    setAssignments,
}) => {
    const totalUnits = checkoutItems.reduce((sum, item) => sum + (parseInt(item?.qty ?? item?.quantity ?? 1, 10) || 1), 0);

    if (totalUnits <= 1) {
        return null;
    }

    const activeAddresses = Array.isArray(savedAddresses) ? savedAddresses : [];

    const handleToggle = () => {
        if (enabled) {
            setEnabled(false);
            return;
        }

        const nextAssignments = assignments?.length
            ? syncDeliveryAssignments(checkoutItems, assignments, selectedAddressId)
            : createDeliveryAssignments(checkoutItems, selectedAddressId);

        setAssignments(nextAssignments);
        setEnabled(true);
    };

    const handleAddressChange = (unitKey, addressId) => {
        setAssignments((prevAssignments) => prevAssignments.map((assignment) => (
            assignment.unitKey === unitKey
                ? { ...assignment, addressId }
                : assignment
        )));
    };

    return (
        <div className="checkout-section">
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div>
                    <h5 className="section-title mb-2">
                        <i className="fas fa-route"></i>
                        Multiple Delivery Addresses
                    </h5>
                    <p className="text-muted mb-0">
                        Split this checkout into separate delivery stops while keeping one payment transaction.
                    </p>
                </div>
                <div className="form-check form-switch m-0">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        id="multiAddressToggle"
                        checked={enabled}
                        onChange={handleToggle}
                    />
                    <label className="form-check-label fw-semibold" htmlFor="multiAddressToggle">
                        Enable
                    </label>
                </div>
            </div>

            {!enabled && (
                <div className="mt-3 small text-muted">
                    All items will use the currently selected delivery address.
                </div>
            )}

            {enabled && (
                <>
                    <div className="alert alert-info mt-3 mb-0">
                        <i className="fas fa-info-circle me-2"></i>
                        Each bouquet unit below can be assigned to its own saved address.
                    </div>

                    <div className="mt-3 d-grid gap-3">
                        {assignments.map((assignment) => {
                            const selectedAddress = activeAddresses.find((address) => String(address.id) === String(assignment.addressId));

                            return (
                                <div
                                    key={assignment.unitKey}
                                    className="p-3 rounded-4"
                                    style={{ border: '1px solid #f2d5df', background: '#fffafb' }}
                                >
                                    <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
                                        <div>
                                            <div className="fw-bold">{assignment.itemName}</div>
                                            <div className="small text-muted">
                                                Bouquet {assignment.unitNumber} of {assignment.quantity}
                                            </div>
                                        </div>
                                        <span
                                            className="badge rounded-pill"
                                            style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}
                                        >
                                            1 delivery unit
                                        </span>
                                    </div>

                                    <label className="form-label small text-muted fw-bold">Assign address</label>
                                    <select
                                        className="form-select"
                                        value={assignment.addressId || ''}
                                        onChange={(event) => handleAddressChange(assignment.unitKey, event.target.value)}
                                    >
                                        <option value="">Select an address</option>
                                        {activeAddresses.map((address) => (
                                            <option key={address.id} value={address.id}>
                                                {address.label || 'Saved Address'} - {`${address.street}, ${address.barangay}, ${address.city}`}
                                            </option>
                                        ))}
                                    </select>

                                    {selectedAddress && (
                                        <div className="small mt-2 text-muted">
                                            <div><strong>Recipient:</strong> {selectedAddress.name}</div>
                                            <div><strong>Phone:</strong> {selectedAddress.phone}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default MultiAddressDeliverySection;
