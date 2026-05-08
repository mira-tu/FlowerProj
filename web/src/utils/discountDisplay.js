const parseMaybeJson = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const toNumber = (value, fallback = 0) => {
    const parsed = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value) => (
    toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
);

export const getPromoDiscountLabel = (source = {}) => {
    const discountType = String(source?.discount_type ?? source?.discountType ?? '').trim().toLowerCase();
    const discountAmount = toNumber(source?.discount_amount ?? source?.discountAmount ?? 0);
    if (discountType === 'amount' && discountAmount > 0) {
        return `PHP ${formatNumber(discountAmount)} off`;
    }

    const discountPercent = toNumber(source?.discount_percent ?? source?.discountPercent ?? 0);
    if (discountPercent > 0) {
        return `${formatNumber(discountPercent)}%`;
    }

    return '';
};

export const getDiscountSnapshot = (record = {}, nestedData = null) => (
    parseMaybeJson(record?.discount_snapshot)
    || parseMaybeJson(nestedData?.discount_snapshot)
    || parseMaybeJson(record?.data?.discount_snapshot)
    || null
);

export const getDiscountDisplayFields = (record = {}, nestedData = null) => {
    const data = nestedData || record?.data || record?.requestData || {};
    const snapshot = getDiscountSnapshot(record, data);
    const discountTotal = toNumber(
        record?.discount_total
        ?? data?.discount_total
        ?? snapshot?.discount_total
        ?? 0
    );
    const appliedPromoCode = String(
        record?.applied_promo_code
        ?? data?.applied_promo_code
        ?? snapshot?.promo_code
        ?? ''
    ).trim();
    const subtotalBeforeDiscount = toNumber(
        snapshot?.subtotal_before_discount
        ?? data?.subtotal_before_discount
        ?? null,
        0
    );
    const subtotalAfterDiscount = toNumber(
        snapshot?.subtotal_after_discount
        ?? data?.subtotal_after_discount
        ?? null,
        0
    );
    const discountLabel = getPromoDiscountLabel(snapshot)
        || getPromoDiscountLabel(data)
        || getPromoDiscountLabel(record);

    return {
        discount_total: discountTotal,
        discount_snapshot: snapshot,
        applied_promo_code: appliedPromoCode || null,
        discount_label: discountLabel || null,
        subtotal_before_discount: subtotalBeforeDiscount,
        subtotal_after_discount: subtotalAfterDiscount,
    };
};
