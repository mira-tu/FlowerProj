const toProductId = (item = {}) => {
  const rawId = item?.productId ?? item?.id ?? null;
  return rawId === null || rawId === undefined ? '' : String(rawId);
};

export const isFreeShippingEnabled = (value) => (
  value === true
  || value === 'true'
  || value === 1
  || value === '1'
);

export const buildFreeShippingLookup = (products = []) => Object.fromEntries(
  (Array.isArray(products) ? products : []).map((product) => [
    String(product?.id ?? ''),
    isFreeShippingEnabled(product?.is_free_shipping),
  ]),
);

export const cartQualifiesForFreeShipping = (items = [], freeShippingLookup = {}) => {
  const productIds = (Array.isArray(items) ? items : [])
    .map((item) => toProductId(item))
    .filter(Boolean);

  if (!productIds.length) {
    return false;
  }

  return productIds.every((productId) => freeShippingLookup[productId] === true);
};
