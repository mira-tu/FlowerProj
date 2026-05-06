const isNumericId = (value) => Number.isFinite(Number.parseInt(value, 10));

export const CUSTOMIZED_FLOWER_SIZE_LABELS = Object.freeze({
  small: 'Small',
  standard: 'Standard',
  large: 'Large',
});

export const getCustomizedFlowerSizeLabel = (item = {}) => {
  const explicitLabel = String(item?.flowerSizeLabel || item?.flower_size_label || '').trim();
  if (explicitLabel) return explicitLabel;

  const normalizedSize = String(item?.flowerSize || item?.flower_size || 'standard').trim().toLowerCase();
  return CUSTOMIZED_FLOWER_SIZE_LABELS[normalizedSize] || CUSTOMIZED_FLOWER_SIZE_LABELS.standard;
};

const createStockLookup = (stockItems = []) => {
  const lookup = new Map();

  (Array.isArray(stockItems) ? stockItems : []).forEach((item) => {
    if (!item?.id) return;
    lookup.set(String(item.id), item);
  });

  return lookup;
};

const mergePreviewFields = (baseItem = {}, overrideItem = {}) => ({
  ...baseItem,
  ...overrideItem,
  img: overrideItem?.img || overrideItem?.image || baseItem?.img || baseItem?.image || null,
  layerImg: overrideItem?.layerImg || overrideItem?.img || baseItem?.layerImg || baseItem?.img || null,
  stemImg: overrideItem?.stemImg || overrideItem?.layerImg || overrideItem?.img || baseItem?.stemImg || baseItem?.layerImg || baseItem?.img || null,
  groupName: overrideItem?.groupName || overrideItem?.wrapper_group_name || baseItem?.groupName || baseItem?.wrapper_group_name || null,
  wrapper_group_name: overrideItem?.wrapper_group_name || overrideItem?.groupName || baseItem?.wrapper_group_name || baseItem?.groupName || null,
  colorName: overrideItem?.colorName || overrideItem?.wrapper_color || baseItem?.colorName || baseItem?.wrapper_color || null,
  wrapper_color: overrideItem?.wrapper_color || overrideItem?.colorName || baseItem?.wrapper_color || baseItem?.colorName || null,
  customization_config: overrideItem?.customization_config || baseItem?.customization_config || null,
  ribbon_scope: overrideItem?.ribbon_scope || baseItem?.ribbon_scope || null,
});

const hydrateSelectionItem = (item, stockLookup) => {
  if (!item) return null;

  if (!isNumericId(item.id)) {
    return mergePreviewFields({}, item);
  }

  const stockMatch = stockLookup.get(String(item.id));
  return mergePreviewFields(stockMatch || {}, item);
};

export const hydrateCustomizedBouquetItem = (item, stockItems = []) => {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const stockLookup = createStockLookup(stockItems);
  const hydratedFlowers = (Array.isArray(item.flowers) ? item.flowers : [])
    .map((flower) => hydrateSelectionItem(flower, stockLookup))
    .filter(Boolean);

  const hydratedWrapper = hydrateSelectionItem(item.wrapper, stockLookup);
  const hydratedRibbon = hydrateSelectionItem(item.ribbon, stockLookup);

  return {
    ...item,
    flowers: hydratedFlowers,
    wrapper: hydratedWrapper,
    ribbon: hydratedRibbon,
  };
};

export const hydrateCustomizedBouquetItems = (items = [], stockItems = []) => (
  (Array.isArray(items) ? items : []).map((item) => hydrateCustomizedBouquetItem(item, stockItems))
);
