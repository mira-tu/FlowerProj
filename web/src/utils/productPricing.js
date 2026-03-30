const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const roundCurrency = (value) => Math.round(toFiniteNumber(value) * 100) / 100;

export const clampDiscountPercentage = (value) => {
  const numericValue = toFiniteNumber(value);

  if (numericValue <= 0) return 0;
  if (numericValue >= 100) return 100;

  return roundCurrency(numericValue);
};

export const computeDiscountedPrice = (originalPrice, discountPercentage) => {
  const safeOriginalPrice = Math.max(0, roundCurrency(originalPrice));
  const safeDiscountPercentage = clampDiscountPercentage(discountPercentage);

  if (safeDiscountPercentage <= 0) {
    return safeOriginalPrice;
  }

  return roundCurrency(safeOriginalPrice * (1 - safeDiscountPercentage / 100));
};

export const formatProductDiscountLabel = (discountPercentage) => {
  const safeDiscountPercentage = clampDiscountPercentage(discountPercentage);
  const formattedValue = Number.isInteger(safeDiscountPercentage)
    ? String(safeDiscountPercentage)
    : safeDiscountPercentage.toFixed(2).replace(/\.?0+$/, '');

  return `${formattedValue}% OFF`;
};

export const normalizeProductPricing = (product = {}) => {
  const rawOriginalPrice = product.original_price ?? product.originalPrice ?? product.price ?? 0;
  const rawDiscountedPrice = product.discounted_price ?? product.discountedPrice ?? product.price ?? 0;

  const originalPrice = Math.max(0, roundCurrency(rawOriginalPrice));
  const derivedDiscountPercentage = originalPrice > 0 && toFiniteNumber(rawDiscountedPrice) < originalPrice
    ? ((originalPrice - toFiniteNumber(rawDiscountedPrice)) / originalPrice) * 100
    : 0;
  const discountPercentage = clampDiscountPercentage(
    product.discount_percentage ?? product.discountPercentage ?? derivedDiscountPercentage,
  );
  const discountedPrice = Math.min(
    originalPrice,
    Math.max(0, roundCurrency(
      discountPercentage > 0
        ? (product.discounted_price ?? product.discountedPrice ?? computeDiscountedPrice(originalPrice, discountPercentage))
        : originalPrice,
    )),
  );
  const hasDiscount = discountPercentage > 0 && discountedPrice < originalPrice;
  const effectivePrice = hasDiscount ? discountedPrice : originalPrice;

  return {
    ...product,
    price: effectivePrice,
    original_price: originalPrice,
    originalPrice,
    discounted_price: discountedPrice,
    discountedPrice,
    discount_percentage: discountPercentage,
    discountPercentage,
    effective_price: effectivePrice,
    has_discount: hasDiscount,
  };
};
