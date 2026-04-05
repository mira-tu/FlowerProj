const toProductId = (item = {}) => {
  const rawId = item?.productId ?? item?.id ?? null;
  return rawId === null || rawId === undefined ? '' : String(rawId);
};

const roundCurrency = (value) => {
  const parsed = Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100) / 100;
};

const getPromoMinimumAmount = (value) => roundCurrency(value);
export const isFreeShippingEnabled = (value) => (
  value === true
  || value === 'true'
  || value === 1
  || value === '1'
);

export const getFreeShippingPromoDetails = (product = {}) => {
  const enabled = isFreeShippingEnabled(product?.is_free_shipping);
  const minimumOrderAmount = getPromoMinimumAmount(product?.free_shipping_min_order_amount);

  return {
    enabled,
    minimumOrderAmount,
    isConfigured: enabled && minimumOrderAmount > 0,
  };
};

export const buildFreeShippingLookup = (products = []) => Object.fromEntries(
  (Array.isArray(products) ? products : []).map((product) => [
    String(product?.id ?? ''),
    getFreeShippingPromoDetails(product),
  ]),
);

export const evaluateFreeShippingPromo = (items = [], freeShippingLookup = {}) => {
  const productIds = (Array.isArray(items) ? items : [])
    .map((item) => toProductId(item))
    .filter(Boolean);
  const subtotal = (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + ((Number(item?.price || 0) || 0) * (Number(item?.qty || 1) || 1)),
    0,
  );

  if (!productIds.length) {
    return {
      qualifies: false,
      hasPromoProducts: false,
      allProductsEligible: false,
      requiredSubtotal: 0,
      amountRemaining: 0,
      subtotal,
    };
  }

  const promoEntries = productIds
    .map((productId) => freeShippingLookup[productId] || { enabled: false, minimumOrderAmount: 0 });
  const promoEligibleEntries = promoEntries.filter(
    (entry) => entry.enabled === true && entry.minimumOrderAmount > 0,
  );
  const allProductsEligible = promoEntries.length > 0 && promoEntries.every(
    (entry) => entry.enabled === true && entry.minimumOrderAmount > 0,
  );
  const requiredSubtotal = allProductsEligible
    ? promoEntries.reduce((maxAmount, entry) => Math.max(maxAmount, entry.minimumOrderAmount), 0)
    : 0;
  const amountRemaining = allProductsEligible
    ? Math.max(0, roundCurrency(requiredSubtotal - subtotal))
    : 0;

  return {
    qualifies: allProductsEligible && subtotal >= requiredSubtotal,
    hasPromoProducts: promoEligibleEntries.length > 0,
    allProductsEligible,
    requiredSubtotal,
    amountRemaining,
    subtotal: roundCurrency(subtotal),
  };
};

export const cartQualifiesForFreeShipping = (items = [], freeShippingLookup = {}) => (
  evaluateFreeShippingPromo(items, freeShippingLookup).qualifies
);

const CUSTOMIZED_STUDIO_FREE_SHIPPING_KEYS = [
  'customized_free_shipping_enabled',
  'customized_free_shipping_min_order_amount',
];

const getAppContentValue = (entries = [], key) => (
  (Array.isArray(entries) ? entries : []).find((entry) => entry?.key === key)?.value ?? ''
);

export const buildCustomizedStudioPromoSettings = (entries = []) => {
  const enabled = isFreeShippingEnabled(getAppContentValue(entries, 'customized_free_shipping_enabled'));
  const minimumOrderAmount = getPromoMinimumAmount(
    getAppContentValue(entries, 'customized_free_shipping_min_order_amount'),
  );

  return {
    enabled,
    minimumOrderAmount,
    isConfigured: enabled && minimumOrderAmount > 0,
  };
};

export const fetchCustomizedStudioPromoSettings = async (supabaseClient) => {
  const { data, error } = await supabaseClient
    .from('app_content')
    .select('key, value')
    .in('key', CUSTOMIZED_STUDIO_FREE_SHIPPING_KEYS);

  if (error) {
    throw error;
  }

  return buildCustomizedStudioPromoSettings(data || []);
};

export const evaluateStandaloneFreeShippingPromo = (subtotal = 0, promoSettings = {}) => {
  const safeSubtotal = roundCurrency(subtotal);
  const minimumOrderAmount = getPromoMinimumAmount(promoSettings?.minimumOrderAmount);
  const enabled = isFreeShippingEnabled(promoSettings?.enabled);
  const isConfigured = enabled && minimumOrderAmount > 0;
  const amountRemaining = isConfigured ? Math.max(0, roundCurrency(minimumOrderAmount - safeSubtotal)) : 0;

  return {
    enabled,
    minimumOrderAmount,
    isConfigured,
    subtotal: safeSubtotal,
    amountRemaining,
    qualifies: isConfigured && safeSubtotal >= minimumOrderAmount,
  };
};
