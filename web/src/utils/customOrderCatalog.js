import { supabase } from '../config/supabase';

const flowerOptions = [
  { value: 'Roses', label: 'Roses', img: 'https://images.pexels.com/photos/56866/garden-rose-red-pink-56866.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Tulips', label: 'Tulips', img: 'https://images.pexels.com/photos/36753/flower-purple-lical-blosso.jpg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Sunflowers', label: 'Sunflowers', img: 'https://images.pexels.com/photos/1002703/pexels-photo-1002703.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Lilies', label: 'Lilies', img: 'https://images.pexels.com/photos/6629632/pexels-photo-6629632.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Orchids', label: 'Orchids', img: 'https://images.pexels.com/photos/132474/pexels-photo-132474.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Carnations', label: 'Carnations', img: 'https://images.pexels.com/photos/14532594/pexels-photo-14532594.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Mixed Flowers', label: 'Mixed Flowers', img: 'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Others', label: 'Others', img: 'https://images.pexels.com/photos/931173/pexels-photo-931173.jpeg?auto=compress&cs=tinysrgb&w=800' },
];

const arrangementOptions = [
  {
    label: 'Funeral',
    options: [
      {
        value: 'Funeral Wreath (Large, 100 flowers)',
        label: 'Funeral Wreath (Large, 100 flowers)',
        description: 'Grand circular tribute arrangement for memorial ceremonies and chapel displays.',
        img: 'https://images.pexels.com/photos/931166/pexels-photo-931166.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Funeral Wreath (Medium, 50 flowers)',
        label: 'Funeral Wreath (Medium, 50 flowers)',
        description: 'Balanced wreath size ideal for intimate memorial services and family offerings.',
        img: 'https://images.pexels.com/photos/2479312/pexels-photo-2479312.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Funeral Flower Stand (Large, 100 flowers)',
        label: 'Funeral Flower Stand (Large, 100 flowers)',
        description: 'Tall standing floral tribute with fuller blooms for ceremonial entrances.',
        img: 'https://images.pexels.com/photos/1739347/pexels-photo-1739347.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Funeral Flower Stand (Medium, 50 flowers)',
        label: 'Funeral Flower Stand (Medium, 50 flowers)',
        description: 'Medium-sized stand arrangement that offers elegant sympathy presentation.',
        img: 'https://images.pexels.com/photos/1169084/pexels-photo-1169084.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
        label: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
        description: 'Large heart tribute that symbolizes love and remembrance for the departed.',
        img: 'https://images.pexels.com/photos/696996/pexels-photo-696996.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
        label: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
        description: 'Meaningful heart-shaped sympathy wreath with a softer floral silhouette.',
        img: 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
    ],
  },
  {
    label: 'Bridal / Wedding',
    options: [
      {
        value: 'Bridal Bouquet (20 flowers)',
        label: 'Bridal Bouquet (20 flowers)',
        description: 'Signature wedding bouquet designed for the bride with premium bloom selection.',
        img: 'https://images.pexels.com/photos/931171/pexels-photo-931171.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Bridesmaid Bouquet (10 flowers)',
        label: 'Bridesmaid Bouquet (10 flowers)',
        description: 'Coordinated bouquet style for bridesmaids that complements the bridal theme.',
        img: 'https://images.pexels.com/photos/6032926/pexels-photo-6032926.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Corsage (3 flowers)',
        label: 'Corsage (3 flowers)',
        description: 'Delicate wearable floral accent for formal events and entourage members.',
        img: 'https://images.pexels.com/photos/931176/pexels-photo-931176.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
    ],
  },
  {
    label: 'General',
    options: [
      {
        value: 'Table Centerpiece (12 flowers)',
        label: 'Table Centerpiece (12 flowers)',
        description: 'Low-profile arrangement perfect for dining tables and reception decor.',
        img: 'https://images.pexels.com/photos/1070850/pexels-photo-1070850.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Flower Box (Medium, 9 flowers)',
        label: 'Flower Box (Medium, 9 flowers)',
        description: 'Compact flower box suited for thoughtful gifting and personal celebrations.',
        img: 'https://images.pexels.com/photos/2111192/pexels-photo-2111192.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
      {
        value: 'Flower Box (Large, 15 flowers)',
        label: 'Flower Box (Large, 15 flowers)',
        description: 'Larger boxed arrangement with fuller volume for statement gifting.',
        img: 'https://images.pexels.com/photos/931170/pexels-photo-931170.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
    ],
  },
  {
    label: 'Custom',
    options: [
      {
        value: 'Other',
        label: 'Others (Specify below)',
        description: 'Request a fully custom design and specify arrangement details below.',
        img: 'https://images.pexels.com/photos/931174/pexels-photo-931174.jpeg?auto=compress&cs=tinysrgb&w=1200',
      },
    ],
  },
];

const flattenedArrangementOptions = arrangementOptions.flatMap((group) => group.options);

export const extractFlowersPerArrangement = (arrangementLabel = '') => {
  if (!arrangementLabel) return 0;
  const match = arrangementLabel.match(/(\d+)\s*flowers?/i);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const dedupeFlowerOptions = (optionLists = []) => {
  const uniqueOptions = [];
  const seenValues = new Set();

  optionLists.flat().forEach((option) => {
    if (!option) return;
    const key = String(option.value || option.label || '').trim();
    if (!key || seenValues.has(key)) return;
    seenValues.add(key);
    uniqueOptions.push(option);
  });

  return uniqueOptions;
};

export const buildCombinedOtherFlowersText = (otherFlowersTextByArrangement = {}) => (
  Array.from(
    new Set(
      Object.values(otherFlowersTextByArrangement || {})
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ).join(', ')
);

const colorOptions = [
  { value: 'Pastel Pinks and Whites', label: 'Pastel Pinks and Whites', colors: ['#ffc0cb', '#ffffff'] },
  { value: 'Rustic Autumn Colors', label: 'Rustic Autumn Colors', colors: ['#d2691e', '#8b4513', '#cd853f'] },
  { value: 'Classic Red and White', label: 'Classic Red and White', colors: ['#ff0000', '#ffffff'] },
  { value: 'All White / Elegant', label: 'All White / Elegant', colors: ['#ffffff', '#f5f5f5'] },
  { value: 'Vibrant / Colorful', label: 'Vibrant / Colorful', colors: ['#ff0000', '#ffff00', '#0000ff'] },
  { value: 'Soft Blues and Purples', label: 'Soft Blues and Purples', colors: ['#add8e6', '#800080'] },
  { value: 'Others', label: 'Others', colors: [] },
];

export const CUSTOM_ORDER_CATALOG_KEY = 'custom_order_catalog';

export const DEFAULT_CUSTOM_ORDER_CATALOG = {
  version: 1,
  flowers: flowerOptions.map((item, index) => ({
    id: `flower-${index + 1}`,
    value: item.value,
    label: item.label,
    img: item.img,
    isActive: true,
    isCustomOption: item.value === 'Others',
  })),
  arrangements: flattenedArrangementOptions.map((item, index) => ({
    id: `arrangement-${index + 1}`,
    value: item.value,
    label: item.label,
    groupLabel: arrangementOptions.find((group) => group.options.some((option) => option.value === item.value))?.label || 'General',
    description: item.description || '',
    img: item.img || '',
    flowersPerArrangement: extractFlowersPerArrangement(item.label),
    isActive: true,
    isCustomOption: item.value === 'Other',
  })),
  colors: colorOptions.map((item, index) => ({
    id: `color-${index + 1}`,
    value: item.value,
    label: item.label,
    colors: item.colors,
    isActive: true,
    isCustomOption: item.value === 'Others',
  })),
};

const makeCatalogItemId = (value, prefix) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized ? `${prefix}-${normalized}` : `${prefix}-${Date.now()}`;
};

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const normalizeCatalogImage = (value) => String(value || '').trim();

const normalizeCatalogColorSwatches = (colors = []) => (
  Array.isArray(colors)
    ? colors
      .map((color) => String(color || '').trim())
      .filter(Boolean)
      .slice(0, 6)
    : []
);

const normalizeFlowerCatalogItem = (item, index) => {
  const label = String(item?.label || item?.value || `Flower ${index + 1}`).trim();
  const value = String(item?.value || label).trim();

  return {
    id: String(item?.id || makeCatalogItemId(value || label, 'flower')),
    value: value || `flower-${index + 1}`,
    label,
    img: normalizeCatalogImage(item?.img),
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

const normalizeArrangementCatalogItem = (item, index) => {
  const label = String(item?.label || item?.value || `Arrangement ${index + 1}`).trim();
  const value = String(item?.value || label).trim();
  const flowersPerArrangement = toPositiveInteger(
    item?.flowersPerArrangement,
    extractFlowersPerArrangement(label),
  );

  return {
    id: String(item?.id || makeCatalogItemId(value || label, 'arrangement')),
    value: value || `arrangement-${index + 1}`,
    label,
    groupLabel: String(item?.groupLabel || 'General').trim() || 'General',
    description: String(item?.description || '').trim(),
    img: normalizeCatalogImage(item?.img),
    flowersPerArrangement,
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

const normalizeColorCatalogItem = (item, index) => {
  const label = String(item?.label || item?.value || `Color ${index + 1}`).trim();
  const value = String(item?.value || label).trim();

  return {
    id: String(item?.id || makeCatalogItemId(value || label, 'color')),
    value: value || `color-${index + 1}`,
    label,
    colors: normalizeCatalogColorSwatches(item?.colors),
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

export const normalizeCustomOrderCatalog = (catalog) => {
  const sourceCatalog = catalog && typeof catalog === 'object' ? catalog : DEFAULT_CUSTOM_ORDER_CATALOG;

  return {
    version: toPositiveInteger(sourceCatalog.version, 1) || 1,
    flowers: (Array.isArray(sourceCatalog.flowers) && sourceCatalog.flowers.length
      ? sourceCatalog.flowers
      : DEFAULT_CUSTOM_ORDER_CATALOG.flowers)
      .map(normalizeFlowerCatalogItem)
      .filter((item) => item.label),
    arrangements: (Array.isArray(sourceCatalog.arrangements) && sourceCatalog.arrangements.length
      ? sourceCatalog.arrangements
      : DEFAULT_CUSTOM_ORDER_CATALOG.arrangements)
      .map(normalizeArrangementCatalogItem)
      .filter((item) => item.label),
    colors: (Array.isArray(sourceCatalog.colors) && sourceCatalog.colors.length
      ? sourceCatalog.colors
      : DEFAULT_CUSTOM_ORDER_CATALOG.colors)
      .map(normalizeColorCatalogItem)
      .filter((item) => item.label),
  };
};

export const buildGroupedArrangementOptions = (arrangements = []) => {
  const groupedOptions = new Map();

  arrangements.forEach((item) => {
    const groupLabel = String(item?.groupLabel || 'General').trim() || 'General';
    if (!groupedOptions.has(groupLabel)) {
      groupedOptions.set(groupLabel, []);
    }

    groupedOptions.get(groupLabel).push({
      value: item.value,
      label: item.label,
      groupLabel,
      description: item.description || '',
      img: item.img || '',
      flowersPerArrangement: item.flowersPerArrangement || 0,
      isCustomOption: Boolean(item.isCustomOption),
    });
  });

  return Array.from(groupedOptions.entries()).map(([label, options]) => ({
    label,
    options,
  }));
};

export const isCustomCatalogOption = (option) => Boolean(option?.isCustomOption);

export const fetchCustomOrderCatalog = async () => {
  try {
    const { data, error } = await supabase
      .from('app_content')
      .select('value')
      .eq('key', CUSTOM_ORDER_CATALOG_KEY)
      .maybeSingle();

    if (error || !data?.value) {
      return normalizeCustomOrderCatalog(DEFAULT_CUSTOM_ORDER_CATALOG);
    }

    return normalizeCustomOrderCatalog(JSON.parse(data.value));
  } catch (error) {
    console.error('Error loading custom order catalog:', error);
    return normalizeCustomOrderCatalog(DEFAULT_CUSTOM_ORDER_CATALOG);
  }
};
