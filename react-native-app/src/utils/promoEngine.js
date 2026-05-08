export const PROMO_CHANNELS = {
  CATALOG: 'catalog',
  CUSTOMIZED: 'customized',
  CUSTOM_ORDER: 'custom_order',
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundCurrency = (value) => Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100;

export const normalizePromoCode = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();

export const generatePromoCode = (prefix = 'PROMO') => {
  const cleanPrefix = normalizePromoCode(prefix).replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PROMO';
  return `${cleanPrefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
  if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (typeof parsed === 'string') return parsed.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof parsed === 'object') return Object.values(parsed).map((item) => String(item ?? '').trim()).filter(Boolean);
  return [];
};

const normalizeComparable = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
const targetListIsUnset = (targets) => targets === null || !Array.isArray(targets) || targets.length === 0;
const targetListHas = (targets, values = []) => {
  if (targets === null) return true;
  if (!Array.isArray(targets) || targets.length === 0) return false;
  const normalizedTargets = new Set(targets.map(normalizeComparable).filter(Boolean));
  return values.some((value) => normalizedTargets.has(normalizeComparable(value)));
};
const normalizeDiscountType = (value) => String(value || '').trim().toLowerCase() === 'amount' ? 'amount' : 'percent';
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
  code: normalizePromoCode(promo.code),
  name: String(promo.name || promo.code || 'Discount').trim(),
  discount_type: normalizeDiscountType(promo.discount_type),
  discount_percent: Math.max(0, Math.min(100, toFiniteNumber(promo.discount_percent))),
  discount_amount: Math.max(0, roundCurrency(promo.discount_amount)),
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
  if (!supabase || !channelScope) return { promos: [], unavailable: true };

  const { data, error } = await supabase
    .from('discount_promos')
    .select('*')
    .in('channel_scope', [channelScope, 'all']);

  if (error) {
    if (isMissingPromoInfrastructureError(error)) return { promos: [], unavailable: true, error };
    throw error;
  }

  const promos = (data || []).map(normalizePromo);
  const promoIds = promos.map((promo) => promo.id).filter(Boolean);
  if (!promoIds.length) return { promos, unavailable: false };

  const { data: usageRows, error: usageError } = await supabase.rpc('get_discount_promo_usage', {
    p_promo_ids: promoIds,
  });

  if (usageError && !isMissingPromoInfrastructureError(usageError)) {
    console.warn('Unable to load discount promo usage counts.', usageError);
  }

  const usageByPromoId = new Map(
    (usageRows || []).map((row) => [String(row.promo_id), {
      total_redemptions: Number.parseInt(row.total_count, 10) || 0,
      user_redemptions: Number.parseInt(row.user_count, 10) || 0,
    }])
  );

  return {
    promos: promos.map((promo) => ({
      ...promo,
      ...(usageByPromoId.get(String(promo.id)) || {}),
    })),
    unavailable: false,
  };
};

const normalizeLine = (line = {}, index = 0) => {
  const quantity = Math.max(1, Number.parseInt(line.quantity ?? line.qty ?? 1, 10) || 1);
  const unitPrice = Math.max(0, roundCurrency(line.unitPrice ?? line.price));
  const originalUnitPrice = Math.max(unitPrice, roundCurrency(line.originalUnitPrice ?? line.original_price ?? line.originalPrice ?? unitPrice));
  return {
    ...line,
    key: String(line.key ?? line.id ?? `line-${index}`),
    name: String(line.name || line.label || `Item ${index + 1}`).trim(),
    quantity,
    unitPrice,
    originalUnitPrice,
    originalSubtotal: roundCurrency(originalUnitPrice * quantity),
    currentSubtotal: roundCurrency(unitPrice * quantity),
    targetKeys: [
      line.key,
      line.id,
      line.name,
      line.label,
      ...(Array.isArray(line.targetKeys) ? line.targetKeys : []),
    ].filter(Boolean),
  };
};

const promoMatchesChannel = (promo, channelScope) => promo.channel_scope === 'all' || promo.channel_scope === channelScope;

const getPromoAvailability = (promo, { now = new Date(), subtotalBeforeDiscount = 0 } = {}) => {
  if (!promo?.is_active) return false;
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startsAtTime = promo.starts_at ? new Date(promo.starts_at).getTime() : null;
  const endsAtTime = promo.ends_at ? new Date(promo.ends_at).getTime() : null;
  if (startsAtTime && Number.isFinite(startsAtTime) && nowTime < startsAtTime) return false;
  if (endsAtTime && Number.isFinite(endsAtTime) && nowTime > endsAtTime) return false;
  if (promo.usage_limit_total && promo.total_redemptions >= promo.usage_limit_total) return false;
  if (promo.usage_limit_per_user && promo.user_redemptions >= promo.usage_limit_per_user) return false;
  if (promo.minimum_subtotal > 0 && subtotalBeforeDiscount < promo.minimum_subtotal) return false;
  return true;
};

const getPromoModeEligible = (promo, { enteredCode = '', channelScope, occasions = [] } = {}) => {
  const normalizedCode = normalizePromoCode(enteredCode);
  if (promo.discount_mode === 'coupon_code') return Boolean(normalizedCode && promo.code === normalizedCode);
  if (promo.discount_mode === 'automatic_event') return true;
  if (promo.discount_mode === 'occasion_based') {
    if (channelScope !== PROMO_CHANNELS.CUSTOM_ORDER) return false;
    if (targetListIsUnset(promo.occasion_targets)) return true;
    return targetListHas(promo.occasion_targets, occasions);
  }
  return false;
};

const lineMatchesPromoTargets = (line, promo, { channelScope, occasions = [], arrangementTargets = [] } = {}) => {
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

const buildPromoLineBreakdown = (matchingLines = [], promo = {}) => {
  const eligibleSubtotal = roundCurrency(matchingLines.reduce((sum, line) => sum + line.originalSubtotal, 0));
  if (eligibleSubtotal <= 0) return { lineBreakdown: [], discountTotal: 0 };

  const discountType = normalizeDiscountType(promo.discount_type);
  const discountPercent = Math.max(0, Math.min(100, toFiniteNumber(promo.discount_percent)));
  const fixedDiscountAmount = Math.max(0, roundCurrency(promo.discount_amount));

  if (discountType === 'amount') {
    const cappedDiscountAmount = Math.min(fixedDiscountAmount, eligibleSubtotal);
    let remainingDiscount = cappedDiscountAmount;
    let remainingSubtotal = eligibleSubtotal;
    const lineBreakdown = matchingLines.map((line, index) => {
      const isLastLine = index === matchingLines.length - 1;
      const discountAmount = isLastLine
        ? remainingDiscount
        : roundCurrency(Math.min(
          line.originalSubtotal,
          remainingDiscount * (line.originalSubtotal / Math.max(remainingSubtotal, line.originalSubtotal))
        ));
      remainingDiscount = Math.max(0, roundCurrency(remainingDiscount - discountAmount));
      remainingSubtotal = Math.max(0, roundCurrency(remainingSubtotal - line.originalSubtotal));

      return {
        key: line.key,
        name: line.name,
        quantity: line.quantity,
        original_subtotal: line.originalSubtotal,
        discount_amount: discountAmount,
        final_subtotal: Math.max(0, roundCurrency(line.originalSubtotal - discountAmount)),
        discount_percent: null,
        discount_type: discountType,
        promo_discount_amount: fixedDiscountAmount,
        source: 'promo',
        promo_id: promo.id,
        promo_code: promo.code,
      };
    }).filter((line) => line.discount_amount > 0);

    return {
      lineBreakdown,
      discountTotal: roundCurrency(lineBreakdown.reduce((sum, line) => sum + line.discount_amount, 0)),
    };
  }

  const lineBreakdown = matchingLines.map((line) => {
    const discountAmount = roundCurrency(line.originalSubtotal * (discountPercent / 100));
    return {
      key: line.key,
      name: line.name,
      quantity: line.quantity,
      original_subtotal: line.originalSubtotal,
      discount_amount: discountAmount,
      final_subtotal: Math.max(0, roundCurrency(line.originalSubtotal - discountAmount)),
      discount_percent: discountPercent,
      discount_type: discountType,
      promo_discount_amount: null,
      source: 'promo',
      promo_id: promo.id,
      promo_code: promo.code,
    };
  }).filter((line) => line.discount_amount > 0);

  return {
    lineBreakdown,
    discountTotal: roundCurrency(lineBreakdown.reduce((sum, line) => sum + line.discount_amount, 0)),
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
  const subtotalBeforeDiscount = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.originalSubtotal, 0));
  const normalizedPromos = (Array.isArray(promos) ? promos : []).map(normalizePromo);
  const candidates = [];

  normalizedPromos.forEach((promo) => {
    if (!promoMatchesChannel(promo, channelScope)) return;
    if (!getPromoAvailability(promo, { now, subtotalBeforeDiscount })) return;
    if (!getPromoModeEligible(promo, { enteredCode, channelScope, occasions })) return;

    const matchingLines = normalizedLines.filter((line) => lineMatchesPromoTargets(line, promo, {
      channelScope,
      occasions,
      arrangementTargets,
    }));
    const { lineBreakdown, discountTotal } = buildPromoLineBreakdown(matchingLines, promo);

    if (discountTotal > 0) {
      candidates.push({
        source: 'promo',
        promo,
        label: promo.name || promo.code,
        discountTotal,
        lineBreakdown,
      });
    }
  });

  const chosenCandidate = candidates.reduce((best, candidate) => {
    if (!best) return candidate;
    return candidate.discountTotal > best.discountTotal ? candidate : best;
  }, null);
  const discountTotal = roundCurrency(chosenCandidate?.discountTotal || 0);
  const subtotalAfterDiscount = Math.max(0, roundCurrency(subtotalBeforeDiscount - discountTotal));
  const finalTotal = Math.max(0, roundCurrency(subtotalAfterDiscount + roundCurrency(shippingFee)));

  return {
    channelScope,
    enteredCode: normalizePromoCode(enteredCode),
    promos: normalizedPromos,
    lines: normalizedLines,
    chosenCandidate,
    chosenPromo: chosenCandidate?.promo || null,
    appliedPromoCode: chosenCandidate?.promo?.code || null,
    discountTotal,
    subtotalBeforeDiscount,
    subtotalAfterDiscount,
    shippingFee: roundCurrency(shippingFee),
    finalTotal,
    lineBreakdown: chosenCandidate?.lineBreakdown || [],
  };
};

export const buildDiscountSnapshot = (pricing) => {
  if (!pricing || pricing.discountTotal <= 0) return null;
  return {
    source: pricing.chosenCandidate?.source || 'none',
    promo_id: pricing.chosenPromo?.id || null,
    promo_code: pricing.chosenPromo?.code || null,
    promo_name: pricing.chosenPromo?.name || pricing.chosenCandidate?.label || null,
    discount_type: pricing.chosenPromo?.discount_type || null,
    discount_percent: pricing.chosenPromo?.discount_percent || null,
    discount_amount: pricing.chosenPromo?.discount_amount || null,
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

export const buildDiscountFields = (pricing) => ({
  discount_total: roundCurrency(pricing?.discountTotal || 0),
  discount_snapshot: buildDiscountSnapshot(pricing),
  applied_promo_code: pricing?.chosenPromo?.code || null,
});

export const hasRedeemablePromo = (pricing) => Boolean(pricing?.chosenPromo?.id && pricing.discountTotal > 0);

export const applyReservedDiscountRedemption = async (supabase, {
  pricing,
  userId,
  requestId,
  channelScope,
} = {}) => {
  if (!supabase || !requestId || !userId || !hasRedeemablePromo(pricing)) return { skipped: true };

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
    if (isMissingPromoInfrastructureError(updateError)) return { skipped: true, unavailable: true, error: updateError };
    throw updateError;
  }

  if (Array.isArray(updatedRows) && updatedRows.length > 0) return { skipped: false, updated: true };

  const { error } = await supabase.from('discount_redemptions').insert([{
    promo_id: pricing.chosenPromo.id,
    user_id: userId,
    request_id: requestId,
    channel_scope: channelScope || pricing.channelScope,
    discount_amount: pricing.discountTotal,
    subtotal_before_discount: pricing.subtotalBeforeDiscount,
    subtotal_after_discount: pricing.subtotalAfterDiscount,
    status: 'applied',
  }]);

  if (error) {
    if (isMissingPromoInfrastructureError(error)) return { skipped: true, unavailable: true, error };
    throw error;
  }

  return { skipped: false, inserted: true };
};

export const voidReservedDiscountRedemptions = async (supabase, { requestId = null, orderId = null } = {}) => {
  if (!supabase || (!requestId && !orderId)) return { skipped: true };

  let query = supabase
    .from('discount_redemptions')
    .update({ status: 'voided' })
    .eq('status', 'reserved');

  if (requestId) query = query.eq('request_id', requestId);
  if (orderId) query = query.eq('order_id', orderId);

  const { error } = await query;
  if (error) {
    if (isMissingPromoInfrastructureError(error)) return { skipped: true, unavailable: true, error };
    throw error;
  }

  return { skipped: false };
};
