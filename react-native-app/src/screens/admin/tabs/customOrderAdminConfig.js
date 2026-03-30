export const CUSTOM_ORDER_CATALOG_KEY = 'custom_order_catalog';

const DEFAULT_ARRANGEMENT_PRICE_RANGES = Object.freeze({
  'Funeral Wreath (Large, 100 flowers)': {
    estimatedPriceMin: 5000,
    estimatedPriceMax: 10000,
    estimatedPriceNote: '',
  },
  'Funeral Flower Stand (Medium, 50 flowers)': {
    estimatedPriceMin: 1000,
    estimatedPriceMax: 1500,
    estimatedPriceNote: '',
  },
  'Bridal Bouquet (20 flowers)': {
    estimatedPriceMin: 1000,
    estimatedPriceMax: 2000,
    estimatedPriceNote: '',
  },
  'Table Centerpiece (12 flowers)': {
    estimatedPriceMin: 1000,
    estimatedPriceMax: 1500,
    estimatedPriceNote: '',
  },
  'Corsage (3 flowers)': {
    estimatedPriceMin: 200,
    estimatedPriceMax: 500,
    estimatedPriceNote: 'per piece',
  },
  'Flower Box (Medium, 9 flowers)': {
    estimatedPriceMin: 800,
    estimatedPriceMax: 1000,
    estimatedPriceNote: '',
  },
  'Heart-Shaped Funeral Wreath (Medium, 50 flowers)': {
    estimatedPriceMin: 3000,
    estimatedPriceMax: 5000,
    estimatedPriceNote: '',
  },
});

const DEFAULT_FLOWERS = [
  { value: 'Roses', label: 'Roses', img: 'https://images.pexels.com/photos/56866/garden-rose-red-pink-56866.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Tulips', label: 'Tulips', img: 'https://images.pexels.com/photos/36753/flower-purple-lical-blosso.jpg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Sunflowers', label: 'Sunflowers', img: 'https://images.pexels.com/photos/1002703/pexels-photo-1002703.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Lilies', label: 'Lilies', img: 'https://images.pexels.com/photos/6629632/pexels-photo-6629632.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Orchids', label: 'Orchids', img: 'https://images.pexels.com/photos/132474/pexels-photo-132474.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Carnations', label: 'Carnations', img: 'https://images.pexels.com/photos/14532594/pexels-photo-14532594.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Mixed Flowers', label: 'Mixed Flowers', img: 'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=800' },
  { value: 'Others', label: 'Others', img: 'https://images.pexels.com/photos/931173/pexels-photo-931173.jpeg?auto=compress&cs=tinysrgb&w=800', isCustomOption: true },
];

const DEFAULT_ARRANGEMENTS = [
  {
    value: 'Funeral Wreath (Large, 100 flowers)',
    label: 'Funeral Wreath (Large, 100 flowers)',
    groupLabel: 'Funeral',
    description: 'Grand circular tribute arrangement for memorial ceremonies and chapel displays.',
    img: 'https://images.pexels.com/photos/931166/pexels-photo-931166.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 100,
  },
  {
    value: 'Funeral Wreath (Medium, 50 flowers)',
    label: 'Funeral Wreath (Medium, 50 flowers)',
    groupLabel: 'Funeral',
    description: 'Balanced wreath size ideal for intimate memorial services and family offerings.',
    img: 'https://images.pexels.com/photos/2479312/pexels-photo-2479312.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 50,
  },
  {
    value: 'Funeral Flower Stand (Large, 100 flowers)',
    label: 'Funeral Flower Stand (Large, 100 flowers)',
    groupLabel: 'Funeral',
    description: 'Tall standing floral tribute with fuller blooms for ceremonial entrances.',
    img: 'https://images.pexels.com/photos/1739347/pexels-photo-1739347.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 100,
  },
  {
    value: 'Funeral Flower Stand (Medium, 50 flowers)',
    label: 'Funeral Flower Stand (Medium, 50 flowers)',
    groupLabel: 'Funeral',
    description: 'Medium-sized stand arrangement that offers elegant sympathy presentation.',
    img: 'https://images.pexels.com/photos/1169084/pexels-photo-1169084.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 50,
  },
  {
    value: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
    label: 'Heart-Shaped Funeral Wreath (Large, 100 flowers)',
    groupLabel: 'Funeral',
    description: 'Large heart tribute that symbolizes love and remembrance for the departed.',
    img: 'https://images.pexels.com/photos/696996/pexels-photo-696996.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 100,
  },
  {
    value: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
    label: 'Heart-Shaped Funeral Wreath (Medium, 50 flowers)',
    groupLabel: 'Funeral',
    description: 'Meaningful heart-shaped sympathy wreath with a softer floral silhouette.',
    img: 'https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 50,
  },
  {
    value: 'Bridal Bouquet (20 flowers)',
    label: 'Bridal Bouquet (20 flowers)',
    groupLabel: 'Bridal / Wedding',
    description: 'Signature wedding bouquet designed for the bride with premium bloom selection.',
    img: 'https://images.pexels.com/photos/931171/pexels-photo-931171.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 20,
  },
  {
    value: 'Bridesmaid Bouquet (10 flowers)',
    label: 'Bridesmaid Bouquet (10 flowers)',
    groupLabel: 'Bridal / Wedding',
    description: 'Coordinated bouquet style for bridesmaids that complements the bridal theme.',
    img: 'https://images.pexels.com/photos/6032926/pexels-photo-6032926.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 10,
  },
  {
    value: 'Corsage (3 flowers)',
    label: 'Corsage (3 flowers)',
    groupLabel: 'Bridal / Wedding',
    description: 'Delicate wearable floral accent for formal events and entourage members.',
    img: 'https://images.pexels.com/photos/931176/pexels-photo-931176.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 3,
  },
  {
    value: 'Table Centerpiece (12 flowers)',
    label: 'Table Centerpiece (12 flowers)',
    groupLabel: 'General',
    description: 'Low-profile arrangement perfect for dining tables and reception decor.',
    img: 'https://images.pexels.com/photos/1070850/pexels-photo-1070850.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 12,
  },
  {
    value: 'Flower Box (Medium, 9 flowers)',
    label: 'Flower Box (Medium, 9 flowers)',
    groupLabel: 'General',
    description: 'Compact flower box suited for thoughtful gifting and personal celebrations.',
    img: 'https://images.pexels.com/photos/2111192/pexels-photo-2111192.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 9,
  },
  {
    value: 'Flower Box (Large, 15 flowers)',
    label: 'Flower Box (Large, 15 flowers)',
    groupLabel: 'General',
    description: 'Larger boxed arrangement with fuller volume for statement gifting.',
    img: 'https://images.pexels.com/photos/931170/pexels-photo-931170.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 15,
  },
  {
    value: 'Other',
    label: 'Others (Specify below)',
    groupLabel: 'Custom',
    description: 'Request a fully custom design and specify arrangement details below.',
    img: 'https://images.pexels.com/photos/931174/pexels-photo-931174.jpeg?auto=compress&cs=tinysrgb&w=1200',
    flowersPerArrangement: 0,
    isCustomOption: true,
  },
];

const DEFAULT_COLORS = [
  { value: 'Pastel Pinks and Whites', label: 'Pastel Pinks and Whites', colors: ['#ffc0cb', '#ffffff'] },
  { value: 'Rustic Autumn Colors', label: 'Rustic Autumn Colors', colors: ['#d2691e', '#8b4513', '#cd853f'] },
  { value: 'Classic Red and White', label: 'Classic Red and White', colors: ['#ff0000', '#ffffff'] },
  { value: 'All White / Elegant', label: 'All White / Elegant', colors: ['#ffffff', '#f5f5f5'] },
  { value: 'Vibrant / Colorful', label: 'Vibrant / Colorful', colors: ['#ff0000', '#ffff00', '#0000ff'] },
  { value: 'Soft Blues and Purples', label: 'Soft Blues and Purples', colors: ['#add8e6', '#800080'] },
  { value: 'Others', label: 'Others', colors: [], isCustomOption: true },
];

const trimText = (value) => String(value || '').trim();

const buildSlug = (value, fallbackPrefix) => {
  const normalized = trimText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `${fallbackPrefix}-${Date.now()}`;
};

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const normalizePriceValue = (value, fallback = 0) => {
  const parsed = toNonNegativeNumber(value, fallback);
  return Math.round(parsed * 100) / 100;
};

const normalizePriceNote = (value) => trimText(value);

const resolveArrangementPriceDefaults = (item, label, value) => {
  const lookupKeys = [label, value].map((entry) => trimText(entry)).filter(Boolean);
  const fallback = lookupKeys
    .map((key) => DEFAULT_ARRANGEMENT_PRICE_RANGES[key])
    .find(Boolean);

  const estimatedPriceMin = normalizePriceValue(
    item?.estimatedPriceMin ?? item?.priceRangeMin ?? fallback?.estimatedPriceMin,
    0,
  );
  const estimatedPriceMaxCandidate = normalizePriceValue(
    item?.estimatedPriceMax ?? item?.priceRangeMax ?? fallback?.estimatedPriceMax ?? estimatedPriceMin,
    estimatedPriceMin,
  );

  return {
    estimatedPriceMin,
    estimatedPriceMax: estimatedPriceMaxCandidate < estimatedPriceMin ? estimatedPriceMin : estimatedPriceMaxCandidate,
    estimatedPriceNote: normalizePriceNote(
      item?.estimatedPriceNote ?? item?.priceRangeNote ?? fallback?.estimatedPriceNote,
    ),
  };
};

const formatPesoAmount = (value) => `\u20b1${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

export const formatCustomOrderArrangementPriceRange = (item) => {
  const min = normalizePriceValue(item?.estimatedPriceMin, 0);
  const max = normalizePriceValue(item?.estimatedPriceMax, 0);
  const note = normalizePriceNote(item?.estimatedPriceNote);

  if (min <= 0 && max <= 0) {
    return '';
  }

  const rangeText = max > min
    ? `${formatPesoAmount(min)}\u2013${formatPesoAmount(max)}`
    : formatPesoAmount(Math.max(min, max));

  return note ? `${rangeText} ${note}` : rangeText;
};

const normalizeColorSwatches = (colors = []) => (
  Array.isArray(colors)
    ? colors
      .map((color) => trimText(color))
      .filter(Boolean)
      .slice(0, 6)
    : []
);

export const buildCustomOrderItemId = (value, prefix) => `${prefix}-${buildSlug(value, prefix)}`;

export const buildCustomOrderOptionValue = (label, prefix) => buildSlug(label, prefix);

const normalizeFlower = (item, index) => {
  const label = trimText(item?.label || item?.value || `Flower ${index + 1}`);
  const value = trimText(item?.value || label) || `flower-${index + 1}`;

  return {
    id: trimText(item?.id) || buildCustomOrderItemId(value, 'flower'),
    value,
    label,
    img: typeof item?.img === 'string' ? item.img : item?.img || '',
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

const normalizeArrangement = (item, index) => {
  const label = trimText(item?.label || item?.value || `Arrangement ${index + 1}`);
  const value = trimText(item?.value || label) || `arrangement-${index + 1}`;
  const priceDefaults = resolveArrangementPriceDefaults(item, label, value);

  return {
    id: trimText(item?.id) || buildCustomOrderItemId(value, 'arrangement'),
    value,
    label,
    groupLabel: trimText(item?.groupLabel || 'General') || 'General',
    description: trimText(item?.description),
    img: typeof item?.img === 'string' ? item.img : item?.img || '',
    flowersPerArrangement: toPositiveInteger(item?.flowersPerArrangement, 0),
    estimatedPriceMin: priceDefaults.estimatedPriceMin,
    estimatedPriceMax: priceDefaults.estimatedPriceMax,
    estimatedPriceNote: priceDefaults.estimatedPriceNote,
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

const normalizeColor = (item, index) => {
  const label = trimText(item?.label || item?.value || `Color ${index + 1}`);
  const value = trimText(item?.value || label) || `color-${index + 1}`;

  return {
    id: trimText(item?.id) || buildCustomOrderItemId(value, 'color'),
    value,
    label,
    colors: normalizeColorSwatches(item?.colors),
    isActive: item?.isActive !== false,
    isCustomOption: Boolean(item?.isCustomOption),
  };
};

export const DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG = {
  version: 1,
  flowers: DEFAULT_FLOWERS.map(normalizeFlower),
  arrangements: DEFAULT_ARRANGEMENTS.map(normalizeArrangement),
  colors: DEFAULT_COLORS.map(normalizeColor),
};

export const normalizeCustomOrderAdminCatalog = (catalog) => {
  const sourceCatalog = catalog && typeof catalog === 'object' ? catalog : DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG;

  return {
    version: toPositiveInteger(sourceCatalog.version, 1) || 1,
    flowers: (Array.isArray(sourceCatalog.flowers) && sourceCatalog.flowers.length
      ? sourceCatalog.flowers
      : DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG.flowers
    )
      .map(normalizeFlower)
      .filter((item) => item.label),
    arrangements: (Array.isArray(sourceCatalog.arrangements) && sourceCatalog.arrangements.length
      ? sourceCatalog.arrangements
      : DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG.arrangements
    )
      .map(normalizeArrangement)
      .filter((item) => item.label),
    colors: (Array.isArray(sourceCatalog.colors) && sourceCatalog.colors.length
      ? sourceCatalog.colors
      : DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG.colors
    )
      .map(normalizeColor)
      .filter((item) => item.label),
  };
};

export const createEmptyCustomOrderItem = (type) => {
  if (type === 'arrangement') {
    return {
      id: '',
      value: '',
      label: '',
      groupLabel: 'General',
      description: '',
      img: '',
      flowersPerArrangement: '0',
      estimatedPriceMin: '',
      estimatedPriceMax: '',
      estimatedPriceNote: '',
      isActive: true,
      isCustomOption: false,
    };
  }

  if (type === 'flower') {
    return {
      id: '',
      value: '',
      label: '',
      img: '',
      isActive: true,
      isCustomOption: false,
    };
  }

  return {
    id: '',
    value: '',
    label: '',
    colorsText: '',
    colors: [],
    isActive: true,
    isCustomOption: false,
  };
};

export const parseColorSwatchText = (value) => normalizeColorSwatches(
  String(value || '')
    .split(',')
    .map((item) => item.trim())
);
