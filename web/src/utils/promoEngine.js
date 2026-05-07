export const PROMO_CHANNELS = {
    CATALOG: 'catalog',
    CUSTOMIZED: 'customized',
    CUSTOM_ORDER: 'custom_order',
};

const REAL_PROMO_SOURCES = new Set(['promo']);
const BUILT_IN_PROMO_ID = '__built_in_product_discount__';

const toFiniteNumber = (value, fallback = 0) => {
    const numericValue = typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const roundCurrency = (value) => Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;

export const normalizePromoCode = (value) => (
    String(value || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase()
);

export const generatePromoCode = (prefix = 'PROMO') => {
    const cleanPrefix = normalizePromoCode(prefix).replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PROMO';
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${cleanPrefix}${randomPart}`;
};

const parseJsonValue = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const normalizeTargetList = (value) => {
    const parsed = parseJsonValue(value, value);
    if (parsed === null || parsed === undefined) return null;

    if (Array.isArray(parsed)) {
        return parsed
            .map((item) => String(item ?? '').trim())
            .filter(Boolean);
    }

    if (typeof parsed === 'string') {
        return parsed
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    if (typeof parsed === 'object') {
        return Object.values(parsed)
            .map((item) => String(item ?? '').trim())
            .filter(Boolean);
    }

    return [];
};

const normalizeComparable = (value) => (
    String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '-')
);

const targetListHas = (targets, values = []) => {
    if (targets === null) return true;
    if (!Array.isArray(targets) || targets.length === 0) return false;

    const normalizedTargets = new Set(targets.map(normalizeComparable).filter(Boolean));
    return values.some((value) => normalizedTargets.has(normalizeComparable(value)));
};

const targetListIsUnset = (targets) => targets === null || !Array.isArray(targets) || targets.length === 0;

const isMissingPromoInfrastructureError = (error) => {
    const code = String(error?.code || '').toLowerCase();
    const message = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();

    return code === '42p01'
        || code === '42703'
        || code === 'pgrst202'
        || code === 'pgrst204'
        || code === 'pgrst205'
        || message.includes('discount_promos')
        || message.includes('discount_redemptions')
        || message.includes('get_discount_promo_usage')
        || message.includes('schema cache')
        || message.includes('could not find');
};

export const normalizePromo = (promo = {}) => ({
    ...promo,
    id: promo.id,
    code: normalizePromoCode(promo.code),
    name: String(promo.name || promo.code || 'Discount').trim(),
    description: String(promo.description || '').trim(),
    discount_percent: Math.max(0, Math.min(100, toFiniteNumber(promo.discount_percent))),
    channel_scope: String(promo.channel_scope || 'all').trim(),
    discount_mode: String(promo.discount_mode || 'coupon_code').trim(),
    target_scope: String(promo.target_scope || 'order').trim(),
    is_active: promo.is_active !== false,
    usage_limit_total: promo.usage_limit_total === null || promo.usage_limit_total === undefined
        ? null
        : Math.max(0, Number.parseInt(promo.usage_limit_total, 10) || 0),
    usage_limit_per_user: promo.usage_limit_per_user === null || promo.usage_limit_per_user === undefined
        ? null
        : Math.max(0, Number.parseInt(promo.usage_limit_per_user, 10) || 0),
    minimum_subtotal: Math.max(0, roundCurrency(promo.minimum_subtotal)),
    occasion_targets: normalizeTargetList(promo.occasion_targets) || [],
    product_ids: normalizeTargetList(promo.product_ids) || [],
    category_ids: normalizeTargetList(promo.category_ids) || [],
    custom_order_arrangement_targets: normalizeTargetList(promo.custom_order_arrangement_targets) || [],
    customized_item_targets: normalizeTargetList(promo.customized_item_targets),
    applies_to_sale_items: promo.applies_to_sale_items !== false,
    total_redemptions: Number.parseInt(promo.total_redemptions, 10) || 0,
    user_redemptions: Number.parseInt(promo.user_redemptions, 10) || 0,
});

export const fetchDiscountPromos = async (supabase, { channelScope } = {}) => {
    if (!supabase || !channelScope) {
        return { promos: [], unavailable: true };
    }

    const channelValues = [channelScope, 'all'];
    const { data, error } = await supabase
        .from('discount_promos')
        .select('*')
        .in('channel_scope', channelValues);

    if (error) {
        if (isMissingPromoInfrastructureError(error)) {
            console.warn('Discount promo infrastructure is not available yet.', error);
            return { promos: [], unavailable: true, error };
        }
        throw error;
    }

    const promos = (data || []).map(normalizePromo);
    const promoIds = promos.map((promo) => promo.id).filter(Boolean);

    if (!promoIds.length) {
        return { promos, unavailable: false };
    }

    const { data: usageRows, error: usageError } = await supabase.rpc('get_discount_promo_usage', {
        p_promo_ids: promoIds,
    });

    if (usageError && !isMissingPromoInfrastructureError(usageError)) {
        console.warn('Unable to load discount promo usage counts.', usageError);
    }

    const usageByPromoId = new Map(
        (usageRows || []).map((row) => [
            String(row.promo_id),
            {
                total_redemptions: Number.parseInt(row.total_count, 10) || 0,
                user_redemptions: Number.parseInt(row.user_count, 10) || 0,
            },
        ])
    );

    return {
        promos: promos.map((promo) => ({
            ...promo,
            ...(usageByPromoId.get(String(promo.id)) || {}),
        })),
        unavailable: false,
    };
};

const getLineQuantity = (line = {}) => Math.max(1, Number.parseInt(line.quantity ?? line.qty ?? 1, 10) || 1);

const normalizeLine = (line = {}, index = 0) => {
    const quantity = getLineQuantity(line);
    const currentUnitPrice = Math.max(0, roundCurrency(line.unitPrice ?? line.price));
    const explicitOriginalUnitPrice = line.originalUnitPrice ?? line.original_price ?? line.originalPrice;
    const builtInDiscountPercent = Math.max(0, Math.min(100, toFiniteNumber(
        line.builtInDiscountPercent
        ?? line.discount_percentage
        ?? line.discountPercentage
    )));
    const derivedOriginalUnitPrice = builtInDiscountPercent > 0 && builtInDiscountPercent < 100
        ? roundCurrency(currentUnitPrice / (1 - builtInDiscountPercent / 100))
        : currentUnitPrice;
    const originalUnitPrice = Math.max(
        currentUnitPrice,
        roundCurrency(explicitOriginalUnitPrice ?? derivedOriginalUnitPrice)
    );
    const originalSubtotal = roundCurrency(originalUnitPrice * quantity);
    const currentSubtotal = roundCurrency(currentUnitPrice * quantity);
    const builtInDiscountAmount = Math.max(0, roundCurrency(originalSubtotal - currentSubtotal));

    return {
        ...line,
        key: String(line.key ?? line.id ?? line.productId ?? line.product_id ?? `line-${index}`),
        productId: line.productId ?? line.product_id ?? line.id ?? null,
        categoryId: line.categoryId ?? line.category_id ?? null,
        name: String(line.name || line.label || `Item ${index + 1}`).trim(),
        quantity,
        originalUnitPrice,
        unitPrice: currentUnitPrice,
        originalSubtotal,
        currentSubtotal,
        builtInDiscountPercent,
        builtInDiscountAmount,
        hasBuiltInDiscount: builtInDiscountAmount > 0,
        targetKeys: [
            line.key,
            line.id,
            line.productId,
            line.product_id,
            line.categoryId,
            line.category_id,
            line.name,
            line.label,
            line.bouquetSizeLabel,
            line.bouquetSizeRange,
            ...(Array.isArray(line.targetKeys) ? line.targetKeys : []),
        ].filter(Boolean),
    };
};

const promoMatchesChannel = (promo, channelScope) => (
    promo.channel_scope === 'all' || promo.channel_scope === channelScope
);

const getPromoAvailability = (promo, { now = new Date(), subtotalBeforeDiscount = 0 } = {}) => {
    if (!promo?.is_active) return 'inactive';

    const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const startsAtTime = promo.starts_at ? new Date(promo.starts_at).getTime() : null;
    const endsAtTime = promo.ends_at ? new Date(promo.ends_at).getTime() : null;

    if (startsAtTime && Number.isFinite(startsAtTime) && nowTime < startsAtTime) return 'scheduled';
    if (endsAtTime && Number.isFinite(endsAtTime) && nowTime > endsAtTime) return 'expired';

    if (promo.usage_limit_total && promo.total_redemptions >= promo.usage_limit_total) return 'over_limit';
    if (promo.usage_limit_per_user && promo.user_redemptions >= promo.usage_limit_per_user) return 'user_limit';
    if (promo.minimum_subtotal > 0 && subtotalBeforeDiscount < promo.minimum_subtotal) return 'minimum';

    return 'available';
};

const getPromoModeEligible = (promo, { enteredCode = '', channelScope, occasions = [] } = {}) => {
    const normalizedCode = normalizePromoCode(enteredCode);
    const mode = promo.discount_mode;

    if (mode === 'coupon_code') {
        return Boolean(normalizedCode && promo.code === normalizedCode);
    }

    if (mode === 'automatic_event') {
        return true;
    }

    if (mode === 'occasion_based') {
        if (channelScope !== PROMO_CHANNELS.CUSTOM_ORDER) return false;
        if (targetListIsUnset(promo.occasion_targets)) return true;
        return targetListHas(promo.occasion_targets, occasions);
    }

    return false;
};

const lineMatchesPromoTargets = (line, promo, { channelScope, occasions = [], arrangementTargets = [] } = {}) => {
    if (channelScope === PROMO_CHANNELS.CATALOG) {
        const hasProductTargets = !targetListIsUnset(promo.product_ids);
        const hasCategoryTargets = !targetListIsUnset(promo.category_ids);
        if (!hasProductTargets && !hasCategoryTargets) return true;

        return targetListHas(promo.product_ids, [line.productId, ...line.targetKeys])
            || targetListHas(promo.category_ids, [line.categoryId, ...line.targetKeys]);
    }

    if (channelScope === PROMO_CHANNELS.CUSTOMIZED) {
        if (promo.customized_item_targets === null || targetListIsUnset(promo.customized_item_targets)) return true;
        return targetListHas(promo.customized_item_targets, [
            ...line.targetKeys,
            ...(Array.isArray(line.customizedTargets) ? line.customizedTargets : []),
        ]);
    }

    if (channelScope === PROMO_CHANNELS.CUSTOM_ORDER) {
        const hasArrangementTargets = !targetListIsUnset(promo.custom_order_arrangement_targets);
        const hasOccasionTargets = !targetListIsUnset(promo.occasion_targets);
        if (!hasArrangementTargets && !hasOccasionTargets) return true;

        return targetListHas(promo.custom_order_arrangement_targets, [
            ...line.targetKeys,
            ...arrangementTargets,
            ...(Array.isArray(line.arrangementTargets) ? line.arrangementTargets : []),
        ])
            || targetListHas(promo.occasion_targets, [
                ...occasions,
                ...(Array.isArray(line.occasionTargets) ? line.occasionTargets : []),
            ]);
    }

    return true;
};

const buildLineBreakdown = (lines, promo, { channelScope, occasions, arrangementTargets } = {}) => {
    const discountPercent = Math.max(0, Math.min(100, toFiniteNumber(promo.discount_percent)));
    const matchingLines = lines.filter((line) => {
        if (!promo.applies_to_sale_items && line.hasBuiltInDiscount) return false;
        return lineMatchesPromoTargets(line, promo, { channelScope, occasions, arrangementTargets });
    });

    const breakdown = matchingLines.map((line) => {
        const discountAmount = roundCurrency(line.originalSubtotal * (discountPercent / 100));
        const finalSubtotal = Math.max(0, roundCurrency(line.originalSubtotal - discountAmount));

        return {
            key: line.key,
            name: line.name,
            quantity: line.quantity,
            original_subtotal: line.originalSubtotal,
            discount_amount: discountAmount,
            final_subtotal: finalSubtotal,
            discount_percent: discountPercent,
            source: 'promo',
            promo_id: promo.id,
            promo_code: promo.code,
        };
    }).filter((line) => line.discount_amount > 0);

    return {
        breakdown,
        discountTotal: roundCurrency(breakdown.reduce((sum, line) => sum + line.discount_amount, 0)),
        eligibleSubtotal: roundCurrency(matchingLines.reduce((sum, line) => sum + line.originalSubtotal, 0)),
    };
};

const buildPromoCandidate = (lines, promo, options = {}) => {
    const { breakdown, discountTotal, eligibleSubtotal } = buildLineBreakdown(lines, promo, options);

    if (eligibleSubtotal <= 0 || discountTotal <= 0) {
        return null;
    }

    return {
        id: promo.id,
        source: 'promo',
        promo,
        label: promo.name || promo.code,
        discountTotal,
        lineBreakdown: breakdown,
    };
};

const buildBuiltInCandidate = (lines) => {
    const lineBreakdown = lines
        .filter((line) => line.builtInDiscountAmount > 0)
        .map((line) => ({
            key: line.key,
            name: line.name,
            quantity: line.quantity,
            original_subtotal: line.originalSubtotal,
            discount_amount: line.builtInDiscountAmount,
            final_subtotal: line.currentSubtotal,
            discount_percent: line.builtInDiscountPercent,
            source: 'built_in_product_discount',
            promo_id: BUILT_IN_PROMO_ID,
            promo_code: null,
        }));
    const discountTotal = roundCurrency(lineBreakdown.reduce((sum, line) => sum + line.discount_amount, 0));

    if (discountTotal <= 0) return null;

    return {
        id: BUILT_IN_PROMO_ID,
        source: 'built_in_product_discount',
        promo: null,
        label: 'Product discount',
        discountTotal,
        lineBreakdown,
    };
};

export const calculatePromoPricing = ({
    lines = [],
    promos = [],
    channelScope,
    enteredCode = '',
    shippingFee = 0,
    occasions = [],
    arrangementTargets = [],
    now = new Date(),
} = {}) => {
    const normalizedLines = (Array.isArray(lines) ? lines : []).map(normalizeLine);
    const subtotalBeforeDiscount = roundCurrency(
        normalizedLines.reduce((sum, line) => sum + line.originalSubtotal, 0)
    );
    const normalizedPromos = (Array.isArray(promos) ? promos : []).map(normalizePromo);
    const normalizedCode = normalizePromoCode(enteredCode);
    const candidates = [
        buildBuiltInCandidate(normalizedLines),
    ].filter(Boolean);

    normalizedPromos.forEach((promo) => {
        if (!promoMatchesChannel(promo, channelScope)) return;
        if (getPromoAvailability(promo, { now, subtotalBeforeDiscount }) !== 'available') return;
        if (!getPromoModeEligible(promo, { enteredCode: normalizedCode, channelScope, occasions })) return;

        const candidate = buildPromoCandidate(normalizedLines, promo, {
            channelScope,
            occasions,
            arrangementTargets,
        });
        if (candidate) {
            candidates.push(candidate);
        }
    });

    const chosenCandidate = candidates.reduce((best, candidate) => {
        if (!best) return candidate;
        return candidate.discountTotal > best.discountTotal ? candidate : best;
    }, null);
    const discountTotal = roundCurrency(chosenCandidate?.discountTotal || 0);
    const subtotalAfterDiscount = Math.max(0, roundCurrency(subtotalBeforeDiscount - discountTotal));
    const finalTotal = Math.max(0, roundCurrency(subtotalAfterDiscount + roundCurrency(shippingFee)));
    const chosenPromo = REAL_PROMO_SOURCES.has(chosenCandidate?.source) ? chosenCandidate.promo : null;

    return {
        channelScope,
        enteredCode: normalizedCode,
        promos: normalizedPromos,
        lines: normalizedLines,
        eligiblePromos: normalizedPromos.filter((promo) => (
            promoMatchesChannel(promo, channelScope)
            && getPromoAvailability(promo, { now, subtotalBeforeDiscount }) === 'available'
        )),
        chosenCandidate,
        chosenPromo,
        appliedPromoCode: chosenPromo?.code || null,
        discountTotal,
        subtotalBeforeDiscount,
        subtotalAfterDiscount,
        shippingFee: roundCurrency(shippingFee),
        finalTotal,
        lineBreakdown: chosenCandidate?.lineBreakdown || [],
        validation: getEnteredPromoValidation({
            promos: normalizedPromos,
            enteredCode: normalizedCode,
            chosenPromo,
            channelScope,
            subtotalBeforeDiscount,
            now,
            occasions,
        }),
    };
};

export const getEnteredPromoValidation = ({
    promos = [],
    enteredCode = '',
    chosenPromo = null,
    channelScope,
    subtotalBeforeDiscount = 0,
    now = new Date(),
    occasions = [],
} = {}) => {
    const normalizedCode = normalizePromoCode(enteredCode);
    if (!normalizedCode) return null;

    const promo = (Array.isArray(promos) ? promos : [])
        .map(normalizePromo)
        .find((candidate) => candidate.code === normalizedCode);

    if (!promo) return { status: 'invalid', promo: null };
    if (!promoMatchesChannel(promo, channelScope)) return { status: 'ineligible', promo };

    const availability = getPromoAvailability(promo, { now, subtotalBeforeDiscount });
    if (availability !== 'available') return { status: availability, promo };

    if (!getPromoModeEligible(promo, { enteredCode: normalizedCode, channelScope, occasions })) {
        return { status: 'ineligible', promo };
    }

    if (!chosenPromo || chosenPromo.id !== promo.id) {
        return { status: 'not_best', promo };
    }

    return { status: 'applied', promo };
};

export const getPromoValidationMessage = (validation) => {
    if (!validation) return '';

    switch (validation.status) {
        case 'applied':
            return `${validation.promo?.name || validation.promo?.code || 'Discount'} applied.`;
        case 'invalid':
            return 'That discount code was not found.';
        case 'inactive':
            return 'That discount code is inactive.';
        case 'scheduled':
            return 'That discount code is not active yet.';
        case 'expired':
            return 'That discount code has expired.';
        case 'over_limit':
            return 'That discount code has reached its usage limit.';
        case 'user_limit':
            return 'You have already used that discount code.';
        case 'minimum':
            return `That discount requires a minimum subtotal of PHP ${roundCurrency(validation.promo?.minimum_subtotal).toLocaleString()}.`;
        case 'ineligible':
            return 'That discount code is not eligible for these items.';
        case 'not_best':
            return 'That code is valid, but a better discount is already applied.';
        default:
            return 'That discount code could not be applied.';
    }
};

export const buildDiscountSnapshot = (pricing) => {
    if (!pricing || pricing.discountTotal <= 0) {
        return null;
    }

    return {
        source: pricing.chosenCandidate?.source || 'none',
        promo_id: pricing.chosenPromo?.id || null,
        promo_code: pricing.chosenPromo?.code || null,
        promo_name: pricing.chosenPromo?.name || pricing.chosenCandidate?.label || null,
        discount_percent: pricing.chosenPromo?.discount_percent || null,
        discount_mode: pricing.chosenPromo?.discount_mode || null,
        target_scope: pricing.chosenPromo?.target_scope || null,
        channel_scope: pricing.channelScope,
        discount_total: pricing.discountTotal,
        subtotal_before_discount: pricing.subtotalBeforeDiscount,
        subtotal_after_discount: pricing.subtotalAfterDiscount,
        shipping_fee: pricing.shippingFee,
        final_total: pricing.finalTotal,
        line_breakdown: pricing.lineBreakdown,
        applied_at: new Date().toISOString(),
    };
};

export const buildDiscountFields = (pricing) => {
    const snapshot = buildDiscountSnapshot(pricing);

    return {
        discount_total: roundCurrency(pricing?.discountTotal || 0),
        discount_snapshot: snapshot,
        applied_promo_code: pricing?.chosenPromo?.code || null,
    };
};

export const hasRedeemablePromo = (pricing) => Boolean(pricing?.chosenPromo?.id && pricing.discountTotal > 0);

export const recordDiscountRedemption = async (supabase, {
    pricing,
    userId,
    orderId = null,
    requestId = null,
    channelScope,
    status = 'applied',
} = {}) => {
    if (!supabase || !userId || !hasRedeemablePromo(pricing)) {
        return { skipped: true };
    }

    const payload = {
        promo_id: pricing.chosenPromo.id,
        user_id: userId,
        order_id: orderId,
        request_id: requestId,
        channel_scope: channelScope || pricing.channelScope,
        discount_amount: pricing.discountTotal,
        subtotal_before_discount: pricing.subtotalBeforeDiscount,
        subtotal_after_discount: pricing.subtotalAfterDiscount,
        status,
    };

    const { data, error } = await supabase
        .from('discount_redemptions')
        .insert([payload])
        .select()
        .single();

    if (error) {
        if (isMissingPromoInfrastructureError(error)) {
            console.warn('Discount redemption could not be recorded because promo tables are unavailable.', error);
            return { skipped: true, unavailable: true, error };
        }
        throw error;
    }

    return { data, skipped: false };
};

export const applyReservedDiscountRedemption = async (supabase, {
    pricing,
    userId,
    requestId,
    channelScope,
} = {}) => {
    if (!supabase || !requestId || !userId || !hasRedeemablePromo(pricing)) {
        return { skipped: true };
    }

    const updatePayload = {
        status: 'applied',
        discount_amount: pricing.discountTotal,
        subtotal_before_discount: pricing.subtotalBeforeDiscount,
        subtotal_after_discount: pricing.subtotalAfterDiscount,
    };

    const { data: updatedRows, error: updateError } = await supabase
        .from('discount_redemptions')
        .update(updatePayload)
        .eq('request_id', requestId)
        .eq('promo_id', pricing.chosenPromo.id)
        .eq('status', 'reserved')
        .select('id');

    if (updateError) {
        if (isMissingPromoInfrastructureError(updateError)) {
            return { skipped: true, unavailable: true, error: updateError };
        }
        throw updateError;
    }

    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        return { skipped: false, updated: true };
    }

    return recordDiscountRedemption(supabase, {
        pricing,
        userId,
        requestId,
        channelScope,
        status: 'applied',
    });
};

export const voidReservedDiscountRedemptions = async (supabase, {
    requestId = null,
    orderId = null,
} = {}) => {
    if (!supabase || (!requestId && !orderId)) {
        return { skipped: true };
    }

    let query = supabase
        .from('discount_redemptions')
        .update({ status: 'voided' })
        .eq('status', 'reserved');

    if (requestId) {
        query = query.eq('request_id', requestId);
    }

    if (orderId) {
        query = query.eq('order_id', orderId);
    }

    const { error } = await query;
    if (error) {
        if (isMissingPromoInfrastructureError(error)) {
            return { skipped: true, unavailable: true, error };
        }
        throw error;
    }

    return { skipped: false };
};
