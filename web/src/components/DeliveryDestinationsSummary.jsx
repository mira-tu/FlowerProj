import React from 'react';
import { groupDeliveryDestinations } from '../utils/deliveryDestinations';

const DeliveryDestinationsSummary = ({ destinations, title = 'Delivery Stops' }) => {
    const groups = groupDeliveryDestinations(destinations);

    if (!groups.length) {
        return null;
    }

    return (
        <div className="checkout-section">
            <h5 className="section-title">
                <i className="fas fa-location-dot"></i>
                {title} ({groups.length})
            </h5>

            <div className="d-grid gap-3">
                {groups.map((group, index) => (
                    <div
                        key={`${group.addressId || 'address'}-${index}`}
                        className="p-3 rounded-4"
                        style={{ border: '1px solid #f0d7e1', background: '#fffafb' }}
                    >
                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                            <div>
                                <div className="fw-bold">
                                    {group.recipientName || group.addressLabel || `Stop ${index + 1}`}
                                </div>
                                {group.recipientPhone && (
                                    <div className="small text-muted">{group.recipientPhone}</div>
                                )}
                                {group.addressText && (
                                    <div className="small text-muted mt-1">{group.addressText}</div>
                                )}
                            </div>
                            <span className="badge rounded-pill text-bg-light">
                                Stop {index + 1}
                            </span>
                        </div>

                        <div className="mt-3">
                            {group.items.map((item) => (
                                <div key={item.unitKey} className="small text-dark mb-1">
                                    <i className="fas fa-gift me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                    {item.itemName} #{item.unitNumber}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DeliveryDestinationsSummary;
