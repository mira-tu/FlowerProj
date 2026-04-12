const toText = (value) => String(value ?? '').trim();

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const parseMoney = (value) => {
    if (!hasValue(value)) {
        return 0;
    }

    const normalized = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));

    return Number.isFinite(normalized) ? normalized : 0;
};

const parseQuantity = (value, fallback = 1) => {
    if (!hasValue(value)) {
        return fallback;
    }

    const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getRowLabel = (item = {}, index = 0) => (
    toText(item?.label)
    || toText(item?.product_name)
    || toText(item?.productName)
    || toText(item?.flowerName)
    || toText(item?.name)
    || `Item ${index + 1}`
);

export const CUSTOM_ORDER_QUOTE_TYPE_LABELS = {
    arrangement: 'Arrangement',
    flower: 'Flower',
    labor: 'Labor',
    material: 'Material',
    extra: 'Extra',
    delivery: 'Delivery',
};

export const normalizeCustomOrderQuoteType = (rawType, label = '') => {
    const normalizedType = toText(rawType).toLowerCase();
    if (normalizedType && Object.prototype.hasOwnProperty.call(CUSTOM_ORDER_QUOTE_TYPE_LABELS, normalizedType)) {
        return normalizedType;
    }

    const normalizedLabel = toText(label).toLowerCase();
    if (normalizedLabel.includes('delivery')) return 'delivery';
    if (
        normalizedLabel.includes('arrangement')
        || normalizedLabel.includes('bouquet')
        || normalizedLabel.includes('stand')
        || normalizedLabel.includes('halo')
        || normalizedLabel.includes('arch')
    ) {
        return 'arrangement';
    }
    if (normalizedLabel.includes('labor')) return 'labor';
    if (normalizedLabel.includes('material')) return 'material';
    if (normalizedLabel.includes('flower') || normalizedLabel.includes('rose') || normalizedLabel.includes('tulip')) {
        return 'flower';
    }

    return 'extra';
};

export const getCustomOrderQuoteTypeLabel = (type) => (
    CUSTOM_ORDER_QUOTE_TYPE_LABELS[normalizeCustomOrderQuoteType(type)] || CUSTOM_ORDER_QUOTE_TYPE_LABELS.extra
);

export const normalizeCustomOrderQuoteLineItems = (breakdown = {}) => {
    const rawLineItems = Array.isArray(breakdown?.line_items) ? breakdown.line_items : [];

    if (rawLineItems.length) {
        return rawLineItems
            .map((item, index) => {
                const label = getRowLabel(item, index);
                const quantity = parseQuantity(item?.quantity ?? item?.qty, 1);
                const arrangementGroup = toText(item?.arrangement_group || item?.arrangementGroup);
                const explicitAmount = [item?.amount, item?.total, item?.line_total, item?.lineTotal]
                    .find(hasValue);
                const unitAmountCandidate = [item?.unit_price, item?.unitPrice, item?.price]
                    .find(hasValue);
                const unitAmount = hasValue(unitAmountCandidate)
                    ? parseMoney(unitAmountCandidate)
                    : (
                        hasValue(explicitAmount) && quantity > 1
                            ? parseMoney(explicitAmount) / quantity
                            : parseMoney(explicitAmount)
                    );
                const totalAmount = hasValue(explicitAmount)
                    ? parseMoney(explicitAmount)
                    : parseMoney(unitAmount) * quantity;

                return {
                    key: `${arrangementGroup || 'general'}-${label}-${index}`,
                    type: normalizeCustomOrderQuoteType(item?.type, label),
                    label,
                    amount: totalAmount,
                    reason: toText(item?.reason || item?.notes || item?.description),
                    arrangementGroup: arrangementGroup || '',
                    quantity,
                    unitAmount,
                    showQuantity: Boolean(hasValue(item?.quantity ?? item?.qty) && quantity > 1 && unitAmount > 0),
                };
            })
            .filter((item) => item.label);
    }

    return Object.keys(breakdown?.quantity_per_flower || {}).map((flowerName, index) => {
        const quantity = parseQuantity(breakdown?.quantity_per_flower?.[flowerName], 1);
        const unitAmount = parseMoney(breakdown?.price_per_flower?.[flowerName]);
        return {
            key: `flower-${flowerName}-${index}`,
            type: 'flower',
            label: flowerName,
            amount: quantity * unitAmount,
            reason: '',
            arrangementGroup: '',
            quantity,
            unitAmount,
            showQuantity: true,
        };
    });
};

export const groupCustomOrderQuoteLineItems = (lineItems = []) => {
    const groups = [];
    const groupMap = new Map();

    (Array.isArray(lineItems) ? lineItems : []).forEach((item, index) => {
        const groupKey = item?.arrangementGroup || '';
        if (!groupMap.has(groupKey)) {
            const group = {
                key: groupKey || `ungrouped-${index}`,
                title: groupKey || '',
                items: [],
                subtotal: 0,
            };
            groupMap.set(groupKey, group);
            groups.push(group);
        }

        const group = groupMap.get(groupKey);
        group.items.push(item);
        if (item?.type !== 'delivery') {
            group.subtotal += parseMoney(item?.amount);
        }
    });

    return groups;
};

export const summarizeCustomOrderQuoteBreakdown = (breakdown = {}, fallbackShipping = 0) => {
    const lineItems = normalizeCustomOrderQuoteLineItems(breakdown);
    const derivedShipping = lineItems
        .filter((item) => item.type === 'delivery')
        .reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const subtotal = hasValue(breakdown?.computed_subtotal ?? breakdown?.subtotal)
        ? parseMoney(breakdown?.computed_subtotal ?? breakdown?.subtotal)
        : lineItems
            .filter((item) => item.type !== 'delivery')
            .reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const shipping = hasValue(breakdown?.shipping_fee ?? breakdown?.shippingFee)
        ? parseMoney(breakdown?.shipping_fee ?? breakdown?.shippingFee)
        : (derivedShipping || parseMoney(fallbackShipping));
    const total = hasValue(breakdown?.computed_total ?? breakdown?.total)
        ? parseMoney(breakdown?.computed_total ?? breakdown?.total)
        : subtotal + shipping;

    return {
        lineItems,
        groupedLineItems: groupCustomOrderQuoteLineItems(lineItems.filter((item) => item.type !== 'delivery')),
        subtotal,
        shipping,
        total,
    };
};
