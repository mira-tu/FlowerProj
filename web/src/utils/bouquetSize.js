export const BOUQUET_SIZE_TIERS = Object.freeze([
  { label: 'Small', range: '3-6 stems', min: 3, max: 6, visualScale: 1 },
  { label: 'Medium', range: '7-12 stems', min: 7, max: 12, visualScale: 1.16 },
  { label: 'Large', range: '13+ stems', min: 13, max: Number.POSITIVE_INFINITY, visualScale: 1.35 },
]);

export const getBouquetSizeInfo = (stemCount) => {
  const count = Number.parseInt(stemCount, 10);
  if (!Number.isFinite(count) || count < 3) {
    return null;
  }

  return BOUQUET_SIZE_TIERS.find((tier) => count >= tier.min && count <= tier.max) || null;
};

export const getBouquetSizeDisplay = (stemCount) => {
  const sizeInfo = getBouquetSizeInfo(stemCount);
  const count = Number.parseInt(stemCount, 10);

  if (!sizeInfo || !Number.isFinite(count)) {
    return stemCount ? `${stemCount} stems` : null;
  }

  return `${sizeInfo.label} (${count} stems)`;
};
