import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';
import {
    DELIVERY_CONFIRMATION_OWNER,
    DELIVERY_CONFIRMATION_STATUS,
    getDeliveryStopCounts,
    getDeliveryStopDisplayLabel,
    isDeliveryStopCancelled,
    normalizeDeliveryDestinations,
} from '../utils/deliveryDestinations';

const CUSTOMER_CONFIRMATION_VISIBLE_STATUSES = new Set([
    'out_for_delivery',
    'delivered',
    'completed',
    'claimed',
]);

const formatStopTimestamp = (value) => {
    if (!value) {
        return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const getStopStatusConfig = (stop) => {
    if (isDeliveryStopCancelled(stop)) {
        return {
            label: 'Cancelled',
            color: '#b91c1c',
            background: '#fee2e2',
        };
    }

    if (stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
        return {
            label: stop.confirmed_by_actor === 'customer' ? 'Confirmed by you' : 'Delivered with rider proof',
            color: '#166534',
            background: '#dcfce7',
        };
    }

    if (stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.RIDER) {
        return {
            label: 'Awaiting rider proof',
            color: '#7c2d12',
            background: '#ffedd5',
        };
    }

    return {
        label: 'Awaiting your confirmation',
        color: '#1d4ed8',
        background: '#dbeafe',
    };
};

const formatRiderLabel = (rider) => {
    if (!rider?.name) {
        return '';
    }

    return rider.phone ? `${rider.name} (${rider.phone})` : rider.name;
};

const TrackingDeliveryStops = ({
    destinations,
    title = 'Delivery Stops',
    confirmingUnitKey = null,
    onConfirmStop = null,
    fallbackRider = null,
    currentDeliveryStatus = '',
}) => {
    const normalizedDeliveryStatus = String(currentDeliveryStatus || '').trim().toLowerCase();
    const canShowCustomerConfirmation = CUSTOMER_CONFIRMATION_VISIBLE_STATUSES.has(normalizedDeliveryStatus);
    const [riderLookup, setRiderLookup] = useState({});
    const stops = useMemo(
        () => normalizeDeliveryDestinations(destinations).filter((stop) => stop.confirmation_owner || isDeliveryStopCancelled(stop)),
        [destinations]
    );
    const stopCounts = useMemo(() => getDeliveryStopCounts(destinations), [destinations]);
    const riderIds = useMemo(
        () => Array.from(
            new Set(
                stops
                    .flatMap((stop) => [stop.assigned_rider_id, stop.confirmed_by_user_id])
                    .map((value) => String(value || '').trim())
                    .filter(Boolean)
            )
        ),
        [stops]
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
                console.error('Error loading tracking rider details:', error);
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
    }, [riderIdsKey, riderIds.length]);

    if (!stops.length) {
        return null;
    }

    return (
        <div className="checkout-section">
            <h5 className="section-title">
                <i className="fas fa-route"></i>
                {title} ({stopCounts.activeCount} active{stopCounts.cancelledCount ? `, ${stopCounts.cancelledCount} cancelled` : ''})
            </h5>

            <div className="d-grid gap-3">
                {stops.map((stop, index) => {
                    const isCancelled = isDeliveryStopCancelled(stop);
                    const statusConfig = getStopStatusConfig(stop);
                    const assignedRiderId = String(stop.assigned_rider_id || '').trim();
                    const confirmedRiderId = String(stop.confirmed_by_user_id || '').trim();
                    const fallbackAssignedRider = !assignedRiderId && stops.length <= 1 ? fallbackRider : null;
                    const fallbackConfirmedRider = !confirmedRiderId && stops.length <= 1 ? fallbackRider : null;
                    const assignedRider = assignedRiderId
                        ? (riderLookup[assignedRiderId] || (
                            fallbackRider && String(fallbackRider.id || '').trim() === assignedRiderId
                                ? fallbackRider
                                : null
                        ))
                        : fallbackAssignedRider;
                    const confirmedRider = confirmedRiderId
                        ? (riderLookup[confirmedRiderId] || (
                            fallbackRider && String(fallbackRider.id || '').trim() === confirmedRiderId
                                ? fallbackRider
                                : null
                        ))
                        : (fallbackConfirmedRider || assignedRider);
                    const assignedRiderLabel = formatRiderLabel(assignedRider);
                    const confirmedRiderLabel = formatRiderLabel(confirmedRider);
                    const canConfirm = typeof onConfirmStop === 'function'
                        && !isCancelled
                        && canShowCustomerConfirmation
                        && stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER
                        && stop.confirmation_status !== DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
                    const isConfirming = confirmingUnitKey === stop.unit_key;

                    return (
                        <div
                            key={stop.unit_key || `delivery-stop-${index + 1}`}
                            className="p-3 rounded-4"
                            style={{ border: '1px solid #f0d7e1', background: '#fffafb' }}
                        >
                            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                                <div>
                                    <div className="fw-bold">{getDeliveryStopDisplayLabel(stop, index)}</div>
                                    <div className="small text-muted mt-1">
                                        {stop.recipient_name || stop.address_label || `Stop ${index + 1}`}
                                        {stop.recipient_phone ? ` - ${stop.recipient_phone}` : ''}
                                    </div>
                                    {stop.addressText ? (
                                        <div className="small text-muted mt-1">{stop.addressText}</div>
                                    ) : null}
                                </div>

                                <div className="d-flex gap-2 flex-wrap justify-content-end">
                                    {!isCancelled ? (
                                        <span
                                            className="badge rounded-pill"
                                            style={{
                                                background: stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER ? '#fce7f3' : '#ede9fe',
                                                color: stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER ? '#be185d' : '#6d28d9',
                                            }}
                                        >
                                            {stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER
                                                ? 'Customer confirmation'
                                                : 'Rider proof required'}
                                        </span>
                                    ) : null}
                                    <span
                                        className="badge rounded-pill"
                                        style={{ background: statusConfig.background, color: statusConfig.color }}
                                    >
                                        {statusConfig.label}
                                    </span>
                                </div>
                            </div>

                            {!isCancelled && (assignedRiderLabel || stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.RIDER) ? (
                                <div className="small mt-3" style={{ color: '#2563eb', fontWeight: 600 }}>
                                    <i className="fas fa-bicycle me-2"></i>
                                    {assignedRiderLabel || 'Rider not assigned yet'}
                                </div>
                            ) : null}

                            {isCancelled && (stop.cancelled_at || stop.cancelled_reason) ? (
                                <div className="small mt-3" style={{ color: '#b91c1c', fontWeight: 600 }}>
                                    {stop.cancelled_at ? `Cancelled on ${formatStopTimestamp(stop.cancelled_at)}` : 'Cancelled'}
                                    {stop.cancelled_reason ? `: ${stop.cancelled_reason}` : ''}
                                </div>
                            ) : null}

                            {!isCancelled && stop.proof_image_url ? (
                                <div className="mt-3">
                                    <div className="small fw-semibold text-muted mb-2">Proof of delivery</div>
                                    <img
                                        src={stop.proof_image_url}
                                        alt={`Proof for ${getDeliveryStopDisplayLabel(stop, index)}`}
                                        style={{
                                            width: '100%',
                                            maxWidth: '320px',
                                            borderRadius: '16px',
                                            border: '1px solid #f2d5df',
                                            objectFit: 'cover',
                                        }}
                                    />
                                    {confirmedRiderLabel && stop.confirmed_by_actor !== 'customer' ? (
                                        <div className="small mt-2" style={{ color: '#166534', fontWeight: 600 }}>
                                            Delivered by {confirmedRiderLabel}
                                        </div>
                                    ) : null}
                                    {stop.proof_note ? (
                                        <div className="small text-muted mt-2">{stop.proof_note}</div>
                                    ) : null}
                                </div>
                            ) : null}

                            {!isCancelled && stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED && stop.confirmed_at ? (
                                <div className="small text-muted mt-3">
                                    Confirmed on {formatStopTimestamp(stop.confirmed_at)}
                                </div>
                            ) : null}

                            {canConfirm ? (
                                <button
                                    type="button"
                                    className="btn btn-sm mt-3"
                                    style={{
                                        background: 'var(--shop-success)',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '10px 16px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                    }}
                                    onClick={() => onConfirmStop(stop)}
                                    disabled={isConfirming}
                                >
                                    {isConfirming ? 'Confirming...' : 'Confirm Delivery Received'}
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TrackingDeliveryStops;
