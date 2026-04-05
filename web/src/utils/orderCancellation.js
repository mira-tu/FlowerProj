import { getSelectedEstimateFromItem } from './customOrderV4';

const roundCurrency = (value) => {
    const amount = Number.parseFloat(String(value ?? 0));
    if (!Number.isFinite(amount)) {
        return 0;
    }

    return Math.round(amount * 100) / 100;
};

const toPositiveInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildCancellationItemKey = (item = {}, index = 0) => (
    String(
        item.cancellation_key
        || item.id
        || item.listId
        || item.product_id
        || `item-${index}`,
    )
);

export const getOriginalItemQuantity = (item = {}) => {
    const quantityCandidates = [
        item.original_quantity,
        item.quantity,
        item.qty,
        item.arrangementQuantity,
        item.arrangement_quantity,
    ];

    for (const candidate of quantityCandidates) {
        const parsed = toPositiveInteger(candidate, 0);
        if (parsed > 0) {
            return parsed;
        }
    }

    return 1;
};

export const getCancelledItemQuantity = (item = {}) => {
    const originalQuantity = getOriginalItemQuantity(item);
    const parsed = toPositiveInteger(item.cancelled_quantity, 0);
    return Math.min(parsed, originalQuantity);
};

export const getRemainingItemQuantity = (item = {}) => (
    Math.max(0, getOriginalItemQuantity(item) - getCancelledItemQuantity(item))
);

export const getItemUnitPrice = (item = {}) => {
    const originalQuantity = getOriginalItemQuantity(item);
    const selectedEstimate = getSelectedEstimateFromItem(item);
    const totalPriceCandidates = [
        item.total_price,
        item.line_total,
        item.lineTotal,
        item.total,
        item.price,
        selectedEstimate?.estimatedPrice,
        item.estimatedPrice,
    ];

    for (const candidate of totalPriceCandidates) {
        const parsed = roundCurrency(candidate);
        if (parsed > 0) {
            return roundCurrency(parsed / Math.max(originalQuantity, 1));
        }
    }

    return 0;
};

export const normalizeCancellationItem = (item = {}, index = 0) => {
    const originalQuantity = getOriginalItemQuantity(item);
    const cancelledQuantity = getCancelledItemQuantity(item);
    const remainingQuantity = Math.max(0, originalQuantity - cancelledQuantity);
    const unitPrice = getItemUnitPrice(item);
    const totalPrice = roundCurrency(unitPrice * originalQuantity);
    const remainingTotal = roundCurrency(unitPrice * remainingQuantity);
    const cancelledTotal = roundCurrency(unitPrice * cancelledQuantity);

    return {
        ...item,
        cancellationKey: buildCancellationItemKey(item, index),
        originalQuantity,
        cancelledQuantity,
        remainingQuantity,
        unitPrice,
        totalPrice,
        remainingTotal,
        cancelledTotal,
        isFullyCancelled: remainingQuantity === 0,
    };
};

export const summarizeCancellationItems = (items = []) => {
    const normalizedItems = Array.isArray(items)
        ? items.map((item, index) => normalizeCancellationItem(item, index))
        : [];
    const activeItems = normalizedItems.filter((item) => item.remainingQuantity > 0);

    return {
        items: normalizedItems,
        activeItems,
        hasItems: normalizedItems.length > 0,
        hasCancellations: normalizedItems.some((item) => item.cancelledQuantity > 0),
        allCancelled: normalizedItems.length > 0 && activeItems.length === 0,
        remainingSubtotal: roundCurrency(activeItems.reduce((sum, item) => sum + item.remainingTotal, 0)),
        cancelledSubtotal: roundCurrency(normalizedItems.reduce((sum, item) => sum + item.cancelledTotal, 0)),
    };
};

export const getRequestItemsFromData = (requestData = {}) => {
    if (!requestData || typeof requestData !== 'object') {
        return [];
    }

    const sourceItems = Array.isArray(requestData.items) && requestData.items.length
        ? requestData.items
        : [requestData];

    return sourceItems.filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0);
};

export const applyRequestItemCancellation = (item = {}, cancelQuantity, reason) => {
    const normalizedItem = normalizeCancellationItem(item);
    const quantityToCancel = Math.min(
        normalizedItem.remainingQuantity,
        toPositiveInteger(cancelQuantity, 0),
    );

    const nextCancelledQuantity = normalizedItem.cancelledQuantity + quantityToCancel;
    const cancellationHistory = Array.isArray(item.cancellation_history)
        ? item.cancellation_history
        : [];

    return {
        ...item,
        cancellation_key: item.cancellation_key || normalizedItem.cancellationKey,
        cancelled_quantity: nextCancelledQuantity,
        cancellation_history: [
            ...cancellationHistory,
            {
                quantity: quantityToCancel,
                reason: String(reason || '').trim(),
                cancelled_at: new Date().toISOString(),
            },
        ],
        updated_at: new Date().toISOString(),
    };
};
