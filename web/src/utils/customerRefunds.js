import {
    getCancellationItemDisplayLabel,
    getRequestItemsFromData,
    normalizeCancellationItem,
    summarizeCancellationItems,
} from './orderCancellation';

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

export const hasRecordedPayment = ({ paymentStatus, amountPaid = 0 }) => (
    toNonNegativeNumber(amountPaid, 0) > 0 || normalizeStatus(paymentStatus) === 'paid'
);

export const hasActiveRefundRequest = (refundRequest) => (
    ACTIVE_REFUND_STATUSES.includes(normalizeStatus(refundRequest?.status))
);

export const getRefundFallbackAmount = (entity = {}) => {
    const entityData = getEntityData(entity);

    return toNonNegativeNumber(
        entity?.total
        ?? entity?.finalPrice
        ?? entity?.final_price
        ?? entityData?.final_price
        ?? entityData?.estimated_total
        ?? entityData?.total
        ?? 0,
        0,
    );
};

export const getEntityCancellationItems = (entity = {}) => {
    if (Array.isArray(entity?.items) && entity.items.length) {
        return entity.items;
    }

    return getRequestItemsFromData(getEntityData(entity));
};

export const getEntityShippingFee = (entity = {}) => {
    const entityData = getEntityData(entity);

    return toNonNegativeNumber(
        entity?.shipping_fee
        ?? entity?.delivery_fee
        ?? entityData?.shipping_fee
        ?? entityData?.delivery_fee
        ?? 0,
        0,
    );
};

export const getCancellationRefundContext = (entity = {}) => {
    const entityData = getEntityData(entity);
    const paymentStatus = entity?.payment_status ?? entityData?.payment_status ?? '';
    const amountPaid = toNonNegativeNumber(entity?.amount_received ?? entityData?.amount_received ?? 0, 0);
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
