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

export const buildFreeShippingLookup = (products = []) => Object.fromEntries(
  (Array.isArray(products) ? products : []).map((product) => [
    String(product?.id ?? ''),
    {
      enabled: isFreeShippingEnabled(product?.is_free_shipping),
      minimumOrderAmount: getPromoMinimumAmount(product?.free_shipping_min_order_amount),
    },
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
