import {
    getCancellationItemDisplayLabel,
    getRequestItemsFromData,
    normalizeCancellationItem,
    summarizeCancellationItems,
} from './orderCancellation';
import { parseMultiDeliveryNotes } from './deliveryDestinations';

const ACTIVE_REFUND_STATUSES = ['requested', 'approved', 'gcash_submitted', 'processing'];

const parseJsonObject = (value) => {
    if (!value) return {};

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }

    return typeof value === 'object' ? value : {};
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const roundCurrency = (value) => Math.round((Number.parseFloat(String(value ?? 0)) || 0) * 100) / 100;

const toNonNegativeNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? fallback));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getEntityData = (entity = {}) => parseJsonObject(entity?.requestData || entity?.data);

const getFirstPositiveNumber = (...values) => {
    for (const value of values) {
        const parsed = Number.parseFloat(String(value ?? ''));
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return 0;
};

const normalizeRefundSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
        return null;
    }

    const amountPaid = toNonNegativeNumber(snapshot?.amount_paid ?? snapshot?.amountPaid ?? 0, 0);
    const preCancellationSubtotal = toNonNegativeNumber(
        snapshot?.pre_cancellation_subtotal ?? snapshot?.preCancellationSubtotal ?? 0,
        0,
    );
    const preCancellationShippingFee = toNonNegativeNumber(
        snapshot?.pre_cancellation_shipping_fee ?? snapshot?.preCancellationShippingFee ?? 0,
        0,
    );
    const preCancellationTotal = toNonNegativeNumber(
        snapshot?.pre_cancellation_total
        ?? snapshot?.preCancellationTotal
        ?? (preCancellationSubtotal + preCancellationShippingFee),
        0,
    );
    const paymentStatus = normalizeStatus(snapshot?.payment_status ?? snapshot?.paymentStatus ?? '');
    const capturedAt = String(snapshot?.captured_at ?? snapshot?.capturedAt ?? '').trim();

    if (
        amountPaid <= 0
        && preCancellationSubtotal <= 0
        && preCancellationShippingFee <= 0
        && preCancellationTotal <= 0
        && !paymentStatus
        && !capturedAt
    ) {
        return null;
    }

    return {
        amount_paid: amountPaid,
        payment_status: paymentStatus,
        pre_cancellation_subtotal: preCancellationSubtotal,
        pre_cancellation_shipping_fee: preCancellationShippingFee,
        pre_cancellation_total: preCancellationTotal,
        captured_at: capturedAt || null,
    };
};

const getOrderNotesMetadata = (entity = {}) => {
    if (entity?.notesMetadata && typeof entity.notesMetadata === 'object') {
        return entity.notesMetadata;
    }

    if (typeof entity?.notes === 'string') {
        return parseMultiDeliveryNotes(entity.notes).metadata || null;
    }

    return null;
};

export const getEntityRefundSnapshot = (entity = {}) => {
    const entityData = getEntityData(entity);
    const notesMetadata = getOrderNotesMetadata(entity);

    return normalizeRefundSnapshot(
        entity?.refund_snapshot
        ?? entity?.refundSnapshot
        ?? entityData?.refund_snapshot
        ?? entityData?.refundSnapshot
        ?? notesMetadata?.refund_snapshot
        ?? notesMetadata?.refundSnapshot
        ?? null,
    );
};

export const createRefundSnapshot = (entity = {}) => {
    const entityData = getEntityData(entity);
    const amountPaid = toNonNegativeNumber(
        entity?.amount_received ?? entityData?.amount_received ?? 0,
        0,
    );
    const paymentStatus = normalizeStatus(entity?.payment_status ?? entityData?.payment_status ?? '');
    const preCancellationSubtotal = toNonNegativeNumber(
        entity?.subtotal ?? entityData?.subtotal ?? 0,
        0,
    );
    const preCancellationShippingFee = toNonNegativeNumber(
        entity?.shipping_fee
        ?? entity?.delivery_fee
        ?? entityData?.shipping_fee
        ?? entityData?.delivery_fee
        ?? 0,
        0,
    );
    const preCancellationTotal = toNonNegativeNumber(
        entity?.total
        ?? entity?.finalPrice
        ?? entity?.final_price
        ?? entityData?.final_price
        ?? entityData?.estimated_total
        ?? entityData?.total
        ?? (preCancellationSubtotal + preCancellationShippingFee),
        0,
    );

    return normalizeRefundSnapshot({
        amount_paid: amountPaid,
        payment_status: paymentStatus,
        pre_cancellation_subtotal: preCancellationSubtotal,
        pre_cancellation_shipping_fee: preCancellationShippingFee,
        pre_cancellation_total: preCancellationTotal,
        captured_at: new Date().toISOString(),
    });
};

export const hasRecordedPayment = ({ paymentStatus, amountPaid = 0 }) => (
    toNonNegativeNumber(amountPaid, 0) > 0 || normalizeStatus(paymentStatus) === 'paid'
);

export const hasActiveRefundRequest = (refundRequest) => (
    ACTIVE_REFUND_STATUSES.includes(normalizeStatus(refundRequest?.status))
);

export const getRefundFallbackAmount = (entity = {}) => {
    const entityData = getEntityData(entity);
    const refundSnapshot = getEntityRefundSnapshot(entity);

    return roundCurrency(getFirstPositiveNumber(
        entity?.total,
        entity?.finalPrice,
        entity?.final_price,
        entityData?.final_price,
        entityData?.estimated_total,
        entityData?.total,
        refundSnapshot?.pre_cancellation_total,
        0,
    ));
};

export const getEntityCancellationItems = (entity = {}) => {
    if (Array.isArray(entity?.items) && entity.items.length) {
        return entity.items;
    }

    return getRequestItemsFromData(getEntityData(entity));
};

export const getEntityShippingFee = (entity = {}) => {
    const entityData = getEntityData(entity);
    const refundSnapshot = getEntityRefundSnapshot(entity);

    return roundCurrency(getFirstPositiveNumber(
        entity?.shipping_fee,
        entity?.delivery_fee,
        entityData?.shipping_fee,
        entityData?.delivery_fee,
        refundSnapshot?.pre_cancellation_shipping_fee,
        0,
    ));
};

export const getCancellationRefundContext = (entity = {}) => {
    const entityData = getEntityData(entity);
    const refundSnapshot = getEntityRefundSnapshot(entity);
    const paymentStatus = entity?.payment_status
        ?? entityData?.payment_status
        ?? refundSnapshot?.payment_status
        ?? '';
    const amountPaid = roundCurrency(getFirstPositiveNumber(
        entity?.amount_received,
        entityData?.amount_received,
        refundSnapshot?.amount_paid,
        0,
    ));
    const fallbackAmount = getRefundFallbackAmount(entity);
    const paymentCap = amountPaid > 0 ? amountPaid : fallbackAmount;
    const items = getEntityCancellationItems(entity);
    const summary = summarizeCancellationItems(items);
    const shippingFee = getEntityShippingFee(entity);
    const normalizedEntityStatus = normalizeStatus(entity?.status);
    const hasAnyCancellation = summary.cancelledSubtotal > 0 || normalizedEntityStatus === 'cancelled';

    let refundAmount = 0;

    if (summary.cancelledSubtotal > 0) {
        refundAmount = summary.cancelledSubtotal + (summary.allCancelled ? shippingFee : 0);
    } else if (normalizedEntityStatus === 'cancelled') {
        refundAmount = paymentCap;
    }

    return {
        amountPaid,
        fallbackAmount,
        paymentCap,
        shippingFee,
        refundSnapshot,
        summary,
        hasAnyCancellation,
        hasRecordedPayment: hasRecordedPayment({ paymentStatus, amountPaid }),
        refundAmount: roundCurrency(Math.min(Math.max(refundAmount, 0), Math.max(paymentCap, 0))),
    };
};

export const canRequestRefundAfterCancellation = ({ entity, refundRequest }) => {
    const context = getCancellationRefundContext(entity);
    return context.hasRecordedPayment
        && context.hasAnyCancellation
        && context.refundAmount > 0
        && !hasActiveRefundRequest(refundRequest);
};

export const getLatestCancellationEntry = (entity = {}) => {
    const items = getEntityCancellationItems(entity);
    const historyEntries = [];

    items.forEach((item, index) => {
        const normalizedItem = normalizeCancellationItem(item, index);
        const cancellationHistory = Array.isArray(item?.cancellation_history)
            ? item.cancellation_history
            : [];

        cancellationHistory.forEach((entry) => {
            historyEntries.push({
                cancelledAt: entry?.cancelled_at || null,
                quantity: Number.parseInt(String(entry?.quantity ?? 0), 10) || 0,
                reason: String(entry?.reason || '').trim(),
                itemLabel: getCancellationItemDisplayLabel(normalizedItem),
            });
        });
    });

    historyEntries.sort((left, right) => (
        new Date(right.cancelledAt || 0).getTime() - new Date(left.cancelledAt || 0).getTime()
    ));

    return historyEntries[0] || null;
};

export const buildRefundReasonFromCancelledEntity = (entity = {}, customerReason = '') => {
    const trimmedCustomerReason = String(customerReason || '').trim();
    const latestCancellation = getLatestCancellationEntry(entity);
    const refundContext = getCancellationRefundContext(entity);
    const lines = ['Refund requested after cancellation.'];

    if (latestCancellation?.itemLabel) {
        lines.push(`Latest cancelled item: ${latestCancellation.itemLabel}`);
    }

    if (latestCancellation?.quantity) {
        lines.push(`Latest cancelled quantity: ${latestCancellation.quantity}`);
    }

    if (refundContext.summary.cancelledQuantityTotal > 0) {
        lines.push(`Total cancelled quantity: ${refundContext.summary.cancelledQuantityTotal}`);
    }

    if (refundContext.refundAmount > 0) {
        lines.push(`Requested refund amount: PHP ${refundContext.refundAmount.toLocaleString()}`);
    }

    lines.push(`Customer refund reason: ${trimmedCustomerReason}`);

    return lines.join('\n');
};
