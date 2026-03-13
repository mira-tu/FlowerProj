import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';
import { groupDeliveryDestinations } from '../utils/deliveryDestinations';

const DeliveryDestinationsSummary = ({ destinations, title = 'Delivery Stops', fallbackRider = null }) => {
    const groups = useMemo(() => groupDeliveryDestinations(destinations), [destinations]);
    const [riderLookup, setRiderLookup] = useState({});

    const riderIds = useMemo(
        () => Array.from(
            new Set(
                groups
                    .flatMap((group) => group.assignedRiderIds || [])
                    .map((riderId) => String(riderId || '').trim())
                    .filter(Boolean)
            )
        ),
        [groups]
    );
    const riderIdsKey = riderIds.join('|');

    useEffect(() => {
        let isMounted = true;

        const loadRiders = async () => {
            if (!riderIds.length) {
                setRiderLookup({});
                return;
            }

            const { data, error } = await supabase
                .from('users')
                .select('id, name, phone')
                .in('id', riderIds);

            if (!isMounted) {
                return;
            }

            if (error) {
                console.error('Error loading stop rider details:', error);
                setRiderLookup({});
                return;
            }

            setRiderLookup(
                Object.fromEntries((data || []).map((rider) => [String(rider.id), rider]))
            );
        };

        loadRiders();

        return () => {
            isMounted = false;
        };
    }, [riderIdsKey]);

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
                {groups.map((group, index) => {
                    const assignedRiderNames = (group.assignedRiderIds || [])
                        .map((riderId) => riderLookup[String(riderId)]?.name)
                        .filter(Boolean);
                    const fallbackRiderLabel = fallbackRider?.name
                        ? `${fallbackRider.name}${fallbackRider.phone ? ` (${fallbackRider.phone})` : ''}`
                        : null;
                    const riderLabel = assignedRiderNames.length
                        ? assignedRiderNames.join(', ')
                        : fallbackRiderLabel;

                    return (
                        <div
                            key={group.groupKey || `${group.addressId || 'address'}-${index}`}
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

                            <div className="small mt-3" style={{ color: riderLabel ? '#2563eb' : '#f97316', fontWeight: 600 }}>
                                <i className="fas fa-bicycle me-2"></i>
                                {riderLabel ? riderLabel : 'Rider not assigned yet'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DeliveryDestinationsSummary;
