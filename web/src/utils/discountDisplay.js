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

    return {
        discount_total: discountTotal,
        discount_snapshot: snapshot,
        applied_promo_code: appliedPromoCode || null,
        subtotal_before_discount: subtotalBeforeDiscount,
        subtotal_after_discount: subtotalAfterDiscount,
    };
};

