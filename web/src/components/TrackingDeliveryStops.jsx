import React, { useMemo } from 'react';
import {
    DELIVERY_CONFIRMATION_OWNER,
    DELIVERY_CONFIRMATION_STATUS,
    getDeliveryStopDisplayLabel,
    normalizeDeliveryDestinations,
} from '../utils/deliveryDestinations';

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

const TrackingDeliveryStops = ({
    destinations,
    title = 'Delivery Stops',
    confirmingUnitKey = null,
    onConfirmStop = null,
    fallbackRider = null,
}) => {
    const stops = useMemo(
        () => normalizeDeliveryDestinations(destinations).filter((stop) => stop.confirmation_owner),
        [destinations]
    );

    if (!stops.length) {
        return null;
    }

    return (
        <div className="checkout-section">
            <h5 className="section-title">
                <i className="fas fa-route"></i>
                {title} ({stops.length})
            </h5>

            <div className="d-grid gap-3">
                {stops.map((stop, index) => {
                    const statusConfig = getStopStatusConfig(stop);
                    const canConfirm = typeof onConfirmStop === 'function'
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
                                        {stop.recipient_phone ? ` • ${stop.recipient_phone}` : ''}
                                    </div>
                                    {stop.addressText ? (
                                        <div className="small text-muted mt-1">{stop.addressText}</div>
                                    ) : null}
                                </div>

                                <div className="d-flex gap-2 flex-wrap justify-content-end">
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
                                    <span
                                        className="badge rounded-pill"
                                        style={{ background: statusConfig.background, color: statusConfig.color }}
                                    >
                                        {statusConfig.label}
                                    </span>
                                </div>
                            </div>

                            {fallbackRider?.name ? (
                                <div className="small mt-3" style={{ color: '#2563eb', fontWeight: 600 }}>
                                    <i className="fas fa-bicycle me-2"></i>
                                    {fallbackRider.name}{fallbackRider.phone ? ` (${fallbackRider.phone})` : ''}
                                </div>
                            ) : null}

                            {stop.proof_image_url ? (
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
                                    {stop.proof_note ? (
                                        <div className="small text-muted mt-2">{stop.proof_note}</div>
                                    ) : null}
                                </div>
                            ) : null}

                            {stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED && stop.confirmed_at ? (
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
