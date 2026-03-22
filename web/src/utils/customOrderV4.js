import customOrderGuideImage from '../assets/pictures/aboutpage/Custom-Order.jpg';
import customizedGuideImage from '../assets/pictures/aboutpage/Customized-image.jpg';
import specialOrderStageImage from '../assets/pictures/SPECIALORDERPAGE.jpg';
import valentineOriginalImage from '../assets/pictures/occasions/VALENTINES1.png';
import valentineBalancedImage from '../assets/pictures/occasions/VALENTINES7.png';
import graduationBouquetImage from '../assets/pictures/occasions/GRADUATION2.png';
import sympathyOriginalImage from '../assets/pictures/occasions/SYMPATHY2.png';
import sympathyBalancedImage from '../assets/pictures/occasions/SYMPATHY1.png';
import mothersDayImage from '../assets/pictures/occasions/MOTHERSDAY4.png';

const DEFAULT_PAGE_COPY_V4_FORM = {
  title: 'Custom Order',
  subtitle: 'Choose a floral concept, tell us your budget, and compare budget-fit versions before you send your request.',
  budgetHelper:
    'We will suggest lighter versions of the same arrangement concept when your budget is below the original target design.',
  comparisonTitle: 'Budget-fit alternatives',
  comparisonSubtitle:
    'Based on your budget, here are alternative versions of the same arrangement concept.',
  reviewNote:
    'These are rough estimates to guide your request. Our team will still review the final materials and confirm the final quote.',
};

const DEFAULT_PAGE_COPY_V4 = {
  title: 'Custom Order v4',
  subtitle: 'Browse our custom arrangement catalogue, select a concept, and compare visual budget-fit versions before sending your request.',
  budgetHelper:
    'Enter your budget and we will suggest lighter visual versions of the same arrangement concept when needed.',
  comparisonTitle: 'Compare original and budget-fit versions',
  comparisonSubtitle:
    'See the original concept beside practical, lower-budget alternatives with preview images and change explanations.',
  reviewNote:
    'These previews are rough visual guides. Final flower availability, exact materials, and final pricing are still confirmed after florist review.',
};

const DEFAULT_DESIGNS = [
  {
    id: 'garden-romance-bouquet',
    title: 'Garden Romance Bouquet',
    category: 'Bouquet',
    description:
      'A soft romantic hand bouquet with premium roses, airy fillers, and a layered wrap.',
    roughDescription:
      'Best for birthdays, anniversaries, and thoughtful surprise deliveries.',
    notes:
      'Fuller rose coverage, airy fillers, and layered wrapping create the original look. Lower-budget versions keep the same romantic concept with lighter finishing details.',
    priceRangeLabel: 'Usually around PHP 3,800 to PHP 5,000 depending on package and add-ons.',
    sortOrder: 10,
    isActive: true,
    referenceImages: [
      { id: 'garden-romance-main', url: valentineOriginalImage, alt: 'Garden Romance bouquet original reference' },
      { id: 'garden-romance-alt', url: valentineBalancedImage, alt: 'Garden Romance lighter bouquet inspiration' },
      { id: 'garden-romance-detail', url: graduationBouquetImage, alt: 'Garden Romance fuller bouquet detail' },
    ],
    visualVariants: [
      {
        id: 'garden-romance-original',
        label: 'Original preview',
        imageUrl: valentineOriginalImage,
        alt: 'Garden Romance bouquet original preview',
        caption: 'Full romantic bouquet with premium wrapping and fuller rose count.',
        budgetBand: 'original',
        isOriginal: true,
      },
      {
        id: 'garden-romance-closest',
        label: 'Closest match preview',
        imageUrl: graduationBouquetImage,
        alt: 'Garden Romance closest-match preview',
        caption: 'Keeps the full bouquet concept while trimming accessories and lighter extras first.',
        strategyId: 'closest-match',
        budgetBand: 'high',
        budgetRatioMax: 0.96,
      },
      {
        id: 'garden-romance-balanced',
        label: 'Balanced preview',
        imageUrl: valentineBalancedImage,
        alt: 'Garden Romance balanced preview',
        caption: 'Balanced version with a simpler wrap and a slightly lighter rose count.',
        strategyId: 'balanced-changes',
        budgetBand: 'mid',
        budgetRatioMax: 0.88,
      },
      {
        id: 'garden-romance-essentials',
        label: 'Essentials preview',
        imageUrl: customOrderGuideImage,
        alt: 'Garden Romance essentials preview',
        caption: 'Compact version that keeps the same romantic palette with simpler presentation.',
        strategyId: 'essentials-only',
        budgetBand: 'lowest',
        budgetRatioMax: 0.76,
      },
    ],
    packageTiers: [
      { id: 'signature', name: 'Signature', description: 'Full layered finish', price: 780, sizeLabel: 'Large', isDefault: true },
      { id: 'classic', name: 'Classic', description: 'Balanced premium look', price: 520, sizeLabel: 'Medium' },
      { id: 'essentials', name: 'Essentials', description: 'Simpler presentation', price: 320, sizeLabel: 'Compact' },
    ],
    wrappers: [
      { id: 'layered-blush', name: 'Layered blush wrap', description: 'Double wrapper finish', price: 260, isDefault: true },
      { id: 'soft-cream', name: 'Soft cream wrap', description: 'Single premium wrap', price: 170 },
      { id: 'kraft-satin', name: 'Kraft satin wrap', description: 'Budget-friendly wrap', price: 110 },
    ],
    components: [
      {
        id: 'premium-roses',
        label: 'Premium roses',
        role: 'main',
        quantity: 18,
        minQuantity: 10,
        unitPrice: 120,
        cheaperLabel: 'Classic roses',
        cheaperUnitPrice: 92,
      },
      {
        id: 'spray-roses',
        label: 'Spray roses',
        role: 'accent',
        quantity: 6,
        minQuantity: 2,
        unitPrice: 55,
        cheaperLabel: 'Carnation accents',
        cheaperUnitPrice: 38,
      },
      {
        id: 'baby-breath',
        label: "Baby's breath",
        role: 'filler',
        quantity: 4,
        minQuantity: 1,
        unitPrice: 70,
        cheaperLabel: 'Seasonal filler',
        cheaperUnitPrice: 42,
      },
    ],
    accessories: [
      { id: 'pearl-pins', name: 'Pearl pins', description: 'Decorative pearl accents', price: 120, defaultSelected: true, removable: true },
      { id: 'satin-tail', name: 'Satin ribbon tails', description: 'Long satin tails', price: 90, defaultSelected: true, removable: true },
    ],
    addOns: [
      { id: 'fairy-lights', name: 'Fairy lights', description: 'Warm micro lights', price: 180 },
      { id: 'gift-card', name: 'Printed message card', description: 'Premium card insert', price: 60 },
      { id: 'butterfly-picks', name: 'Butterfly picks', description: 'Decorative butterfly picks', price: 120 },
    ],
  },
  {
    id: 'elegant-sympathy-stand',
    title: 'Elegant Sympathy Stand',
    category: 'Sympathy',
    description:
      'A tall white-and-green sympathy arrangement with a clean formal presentation.',
    roughDescription:
      'Designed for wakes, memorial services, and respectful condolence arrangements.',
    notes:
      'The original concept focuses on a formal standing tribute with white focal flowers. Lower-budget versions keep the respectful silhouette while simplifying finishings and stem choices.',
    priceRangeLabel: 'Usually around PHP 4,600 to PHP 6,300 depending on tier and memorial add-ons.',
    sortOrder: 20,
    isActive: true,
    referenceImages: [
      { id: 'sympathy-main', url: sympathyOriginalImage, alt: 'Elegant sympathy stand original reference' },
      { id: 'sympathy-alt', url: sympathyBalancedImage, alt: 'Elegant sympathy stand lighter reference' },
      { id: 'sympathy-detail', url: specialOrderStageImage, alt: 'Standing sympathy arrangement detail' },
    ],
    visualVariants: [
      {
        id: 'sympathy-original',
        label: 'Original preview',
        imageUrl: sympathyOriginalImage,
        alt: 'Elegant sympathy stand original preview',
        caption: 'Formal white sympathy arrangement with a fuller tribute finish.',
        budgetBand: 'original',
        isOriginal: true,
      },
      {
        id: 'sympathy-closest',
        label: 'Closest match preview',
        imageUrl: specialOrderStageImage,
        alt: 'Elegant sympathy stand closest-match preview',
        caption: 'Keeps the standing tribute feel while simplifying premium extras first.',
        strategyId: 'closest-match',
        budgetBand: 'high',
        budgetRatioMax: 0.95,
      },
      {
        id: 'sympathy-balanced',
        label: 'Balanced preview',
        imageUrl: sympathyBalancedImage,
        alt: 'Elegant sympathy stand balanced preview',
        caption: 'Balanced version with lighter flower coverage and simpler finishing details.',
        strategyId: 'balanced-changes',
        budgetBand: 'mid',
        budgetRatioMax: 0.87,
      },
      {
        id: 'sympathy-essentials',
        label: 'Essentials preview',
        imageUrl: customOrderGuideImage,
        alt: 'Elegant sympathy stand essentials preview',
        caption: 'Most compact tribute version that preserves the respectful arrangement concept.',
        strategyId: 'essentials-only',
        budgetBand: 'lowest',
        budgetRatioMax: 0.74,
      },
    ],
    packageTiers: [
      { id: 'grand-stand', name: 'Grand Stand', description: 'Tall and full presentation', price: 1150, sizeLabel: 'Large', isDefault: true },
      { id: 'formal-stand', name: 'Formal Stand', description: 'Balanced standing arrangement', price: 760, sizeLabel: 'Medium' },
      { id: 'tribute-stand', name: 'Tribute Stand', description: 'Simpler stand setup', price: 480, sizeLabel: 'Compact' },
    ],
    wrappers: [
      { id: 'formal-drape', name: 'Formal drape finish', description: 'Layered drape and ribbon', price: 210, isDefault: true },
      { id: 'clean-ribbon', name: 'Clean ribbon finish', description: 'Neat simple ribbon finish', price: 120 },
      { id: 'basic-stand-cover', name: 'Basic stand cover', description: 'Essential stand cover', price: 70 },
    ],
    components: [
      {
        id: 'white-roses',
        label: 'White roses',
        role: 'main',
        quantity: 24,
        minQuantity: 14,
        unitPrice: 115,
        cheaperLabel: 'White carnations',
        cheaperUnitPrice: 72,
      },
      {
        id: 'white-mums',
        label: 'White mums',
        role: 'accent',
        quantity: 10,
        minQuantity: 6,
        unitPrice: 58,
        cheaperLabel: 'Mixed white mums',
        cheaperUnitPrice: 46,
      },
      {
        id: 'eucalyptus',
        label: 'Eucalyptus greens',
        role: 'filler',
        quantity: 8,
        minQuantity: 4,
        unitPrice: 38,
        cheaperLabel: 'Seasonal greens',
        cheaperUnitPrice: 24,
      },
    ],
    accessories: [
      { id: 'printed-ribbon', name: 'Printed condolence ribbon', description: 'Custom text ribbon', price: 150, defaultSelected: true, removable: true },
      { id: 'accent-bow', name: 'Accent bow cluster', description: 'Full bow cluster', price: 100, defaultSelected: true, removable: true },
    ],
    addOns: [
      { id: 'memorial-card', name: 'Large memorial card', description: 'Printed tribute card', price: 90 },
      { id: 'extra-stand-base', name: 'Decorated stand base', description: 'Upgraded base styling', price: 170 },
      { id: 'soft-lanterns', name: 'Soft lantern accents', description: 'Pair of memorial lanterns', price: 240 },
    ],
  },
  {
    id: 'sunny-table-centerpiece',
    title: 'Sunny Table Centerpiece',
    category: 'Event Styling',
    description:
      'A cheerful low centerpiece with focal blooms, supporting flowers, and table-friendly styling.',
    roughDescription:
      'Works for intimate weddings, receptions, and birthday tablescapes.',
    notes:
      'The original concept feels bright and welcoming on a guest table. Lower-budget versions keep the cheerful color story while simplifying the base, accessories, and flower count.',
    priceRangeLabel: 'Usually around PHP 2,000 to PHP 3,400 per table depending on styling choices.',
    sortOrder: 30,
    isActive: true,
    referenceImages: [
      { id: 'centerpiece-main', url: mothersDayImage, alt: 'Sunny centerpiece original reference' },
      { id: 'centerpiece-alt', url: customizedGuideImage, alt: 'Sunny centerpiece close detail' },
      { id: 'centerpiece-detail', url: customOrderGuideImage, alt: 'Sunny centerpiece lighter setup' },
    ],
    visualVariants: [
      {
        id: 'centerpiece-original',
        label: 'Original preview',
        imageUrl: mothersDayImage,
        alt: 'Sunny centerpiece original preview',
        caption: 'Lusher event piece with a brighter flower count and more styled presentation.',
        budgetBand: 'original',
        isOriginal: true,
      },
      {
        id: 'centerpiece-closest',
        label: 'Closest match preview',
        imageUrl: customizedGuideImage,
        alt: 'Sunny centerpiece closest-match preview',
        caption: 'Keeps the table styling concept with smaller finishing adjustments first.',
        strategyId: 'closest-match',
        budgetBand: 'high',
        budgetRatioMax: 0.95,
      },
      {
        id: 'centerpiece-balanced',
        label: 'Balanced preview',
        imageUrl: customOrderGuideImage,
        alt: 'Sunny centerpiece balanced preview',
        caption: 'Balanced version with a neater base and lower-cost flower substitutions.',
        strategyId: 'balanced-changes',
        budgetBand: 'mid',
        budgetRatioMax: 0.86,
      },
      {
        id: 'centerpiece-essentials',
        label: 'Essentials preview',
        imageUrl: specialOrderStageImage,
        alt: 'Sunny centerpiece essentials preview',
        caption: 'Most compact styling version for customers who need the same concept at the lowest workable estimate.',
        strategyId: 'essentials-only',
        budgetBand: 'lowest',
        budgetRatioMax: 0.72,
      },
    ],
    packageTiers: [
      { id: 'premium-table', name: 'Premium Table Set', description: 'Lush centerpiece styling', price: 640, sizeLabel: 'Large', isDefault: true },
      { id: 'classic-table', name: 'Classic Table Set', description: 'Balanced centerpiece styling', price: 430, sizeLabel: 'Medium' },
      { id: 'simple-table', name: 'Simple Table Set', description: 'Neat compact styling', price: 250, sizeLabel: 'Compact' },
    ],
    wrappers: [
      { id: 'gold-base', name: 'Gold accent base', description: 'Premium base dressing', price: 180, isDefault: true },
      { id: 'linen-base', name: 'Linen base', description: 'Soft cloth base finish', price: 120 },
      { id: 'clear-base', name: 'Clear base finish', description: 'Simple clean base', price: 60 },
    ],
    components: [
      {
        id: 'sunflowers',
        label: 'Sunflowers',
        role: 'main',
        quantity: 8,
        minQuantity: 5,
        unitPrice: 110,
        cheaperLabel: 'Yellow gerberas',
        cheaperUnitPrice: 76,
      },
      {
        id: 'yellow-roses',
        label: 'Yellow roses',
        role: 'accent',
        quantity: 10,
        minQuantity: 6,
        unitPrice: 68,
        cheaperLabel: 'Yellow carnations',
        cheaperUnitPrice: 44,
      },
      {
        id: 'table-foliage',
        label: 'Textured foliage',
        role: 'filler',
        quantity: 6,
        minQuantity: 3,
        unitPrice: 28,
        cheaperLabel: 'Seasonal foliage',
        cheaperUnitPrice: 18,
      },
    ],
    accessories: [
      { id: 'candle-ring', name: 'Candle ring accents', description: 'Side candle styling', price: 140, defaultSelected: true, removable: true },
      { id: 'mini-ribbons', name: 'Mini satin ribbons', description: 'Accent ribbons', price: 70, defaultSelected: true, removable: true },
    ],
    addOns: [
      { id: 'name-tags', name: 'Table name tags', description: 'Printed table markers', price: 90 },
      { id: 'extra-candles', name: 'Extra candles', description: 'Add a candle pair', price: 130 },
      { id: 'premium-vase', name: 'Premium vase upgrade', description: 'Glass vase upgrade', price: 210 },
    ],
  },
];

export const DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG = {
  version: 1,
  pageCopy: DEFAULT_PAGE_COPY_V4_FORM,
  designs: DEFAULT_DESIGNS,
};

export const DEFAULT_CUSTOM_ORDER_V4_CATALOG = {
  version: 4,
  pageCopy: DEFAULT_PAGE_COPY_V4,
  designs: DEFAULT_DESIGNS,
};

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

const makeId = (value, prefix = 'item') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || prefix;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const formatChangeCurrency = (value) => `PHP ${roundCurrency(value).toLocaleString('en-PH')}`;

const getDefaultItem = (items = [], fallbackIndex = 0) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  return normalizedItems.find((item) => item?.isDefault) || normalizedItems[fallbackIndex] || null;
};

const getNextCheaperItem = (items = [], currentId) => {
  const sorted = [...(Array.isArray(items) ? items : [])]
    .map((item) => ({ ...item, price: roundCurrency(item.price) }))
    .sort((left, right) => left.price - right.price);

  const current = sorted.find((item) => item.id === currentId) || sorted[sorted.length - 1];
  if (!current) return null;

  const cheaperOptions = sorted.filter((item) => item.price < current.price);
  return cheaperOptions.length ? cheaperOptions[cheaperOptions.length - 1] : null;
};

const normalizeReferenceImages = (images = [], fallbackImages = []) => {
  const finalImages = Array.isArray(images) && images.length ? images : fallbackImages;
  return finalImages
    .map((image, index) => {
      if (!image) return null;
      if (typeof image === 'string') {
        return {
          id: `image-${index + 1}`,
          url: image,
          alt: `Reference image ${index + 1}`,
        };
      }

      return {
        id: image.id || `image-${index + 1}`,
        url: image.url || image.uri || '',
        alt: image.alt || image.caption || `Reference image ${index + 1}`,
      };
    })
    .filter((image) => image?.url);
};

const normalizeVisualVariants = (variants = [], fallbackVariants = [], fallbackImage = null) => {
  const finalVariants = Array.isArray(variants) && variants.length ? variants : fallbackVariants;
  const normalizedVariants = finalVariants
    .map((variant, index) => {
      if (!variant) return null;
      if (typeof variant === 'string') {
        return {
          id: `variant-${index + 1}`,
          label: `Preview ${index + 1}`,
          imageUrl: variant,
          alt: `Preview image ${index + 1}`,
          caption: '',
          strategyId: '',
          packageTierId: '',
          wrapperId: '',
          budgetBand: '',
          budgetRatioMax: 0,
          isOriginal: index === 0,
        };
      }

      return {
        id: variant.id || `variant-${index + 1}`,
        label: variant.label || `Preview ${index + 1}`,
        imageUrl: variant.imageUrl || variant.url || variant.uri || '',
        alt: variant.alt || variant.caption || variant.label || `Preview image ${index + 1}`,
        caption: variant.caption || '',
        strategyId: variant.strategyId || '',
        packageTierId: variant.packageTierId || '',
        wrapperId: variant.wrapperId || '',
        budgetBand: variant.budgetBand || '',
        budgetRatioMax: Math.max(0, toNumber(variant.budgetRatioMax, 0)),
        isOriginal: Boolean(variant.isOriginal),
      };
    })
    .filter((variant) => variant?.imageUrl);

  if (normalizedVariants.length) {
    return normalizedVariants;
  }

  if (fallbackImage?.url) {
    return [{
      id: 'variant-original',
      label: 'Original preview',
      imageUrl: fallbackImage.url,
      alt: fallbackImage.alt || 'Original preview',
      caption: '',
      strategyId: '',
      packageTierId: '',
      wrapperId: '',
      budgetBand: 'original',
      budgetRatioMax: 1,
      isOriginal: true,
    }];
  }

  return [];
};

const normalizeComponent = (component, index) => {
  const quantity = Math.max(1, Math.round(toNumber(component?.quantity, 1)));
  const minQuantity = Math.max(0, Math.min(quantity, Math.round(toNumber(component?.minQuantity, 0))));

  return {
    id: component?.id || makeId(component?.label || `component-${index + 1}`, 'component'),
    label: component?.label || `Component ${index + 1}`,
    role: component?.role || 'accent',
    quantity,
    minQuantity,
    unitPrice: roundCurrency(component?.unitPrice),
    cheaperLabel: component?.cheaperLabel || '',
    cheaperUnitPrice: roundCurrency(component?.cheaperUnitPrice),
  };
};

const normalizeSelectableItems = (items = [], typePrefix) => {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: item?.id || makeId(item?.name || `${typePrefix}-${index + 1}`, typePrefix),
      name: item?.name || `${typePrefix} ${index + 1}`,
      description: item?.description || '',
      price: roundCurrency(item?.price),
      isDefault: Boolean(item?.isDefault),
      defaultSelected: Boolean(item?.defaultSelected),
      removable: item?.removable !== false,
      sizeLabel: item?.sizeLabel || '',
    }))
    .filter((item) => item.name);
};

export const normalizeCustomOrderV4Catalog = (catalog) => {
  const sourceCatalog = catalog && typeof catalog === 'object' ? catalog : DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG;
  const sourceDesigns = Array.isArray(sourceCatalog.designs) && sourceCatalog.designs.length
    ? sourceCatalog.designs
    : DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG.designs;

  return {
    version: sourceCatalog.version || 1,
    pageCopy: {
      ...DEFAULT_PAGE_COPY_V4_FORM,
      ...(sourceCatalog.pageCopy && typeof sourceCatalog.pageCopy === 'object' ? sourceCatalog.pageCopy : {}),
    },
    designs: sourceDesigns.map((design, index) => {
      const fallbackDesign = DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG.designs[index] || DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG.designs[0];
      const packageTiers = normalizeSelectableItems(design?.packageTiers, 'tier');
      const wrappers = normalizeSelectableItems(design?.wrappers, 'wrapper');
      const accessories = normalizeSelectableItems(design?.accessories, 'accessory');
      const addOns = normalizeSelectableItems(design?.addOns, 'addon');
      const referenceImages = normalizeReferenceImages(design?.referenceImages, fallbackDesign.referenceImages);
      const components = (Array.isArray(design?.components) && design.components.length
        ? design.components
        : fallbackDesign.components
      ).map(normalizeComponent);

      return {
        id: design?.id || fallbackDesign.id || makeId(design?.title || `design-${index + 1}`, 'design'),
        title: design?.title || fallbackDesign.title || `Design ${index + 1}`,
        category: design?.category || fallbackDesign.category || 'Custom Order',
        description: design?.description || fallbackDesign.description || '',
        roughDescription: design?.roughDescription || fallbackDesign.roughDescription || '',
        notes: design?.notes || fallbackDesign.notes || '',
        priceRangeLabel: design?.priceRangeLabel || fallbackDesign.priceRangeLabel || '',
        sortOrder: Math.max(0, Math.round(toNumber(design?.sortOrder, fallbackDesign.sortOrder || ((index + 1) * 10)))),
        isActive: design?.isActive !== false,
        referenceImages,
        visualVariants: normalizeVisualVariants(design?.visualVariants, fallbackDesign.visualVariants, referenceImages[0] || null),
        packageTiers: packageTiers.length ? packageTiers : normalizeSelectableItems(fallbackDesign.packageTiers, 'tier'),
        wrappers: wrappers.length ? wrappers : normalizeSelectableItems(fallbackDesign.wrappers, 'wrapper'),
        accessories: accessories.length ? accessories : normalizeSelectableItems(fallbackDesign.accessories, 'accessory'),
        addOns: addOns.length ? addOns : normalizeSelectableItems(fallbackDesign.addOns, 'addon'),
        components,
      };
    }),
  };
};

const fetchCatalogByKey = async (supabase, key, fallbackCatalog) => {
  try {
    const { data, error } = await supabase
      .from('app_content')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error || !data?.value) {
      return normalizeCustomOrderV4Catalog(fallbackCatalog);
    }

    return normalizeCustomOrderV4Catalog(JSON.parse(data.value));
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
    return normalizeCustomOrderV4Catalog(fallbackCatalog);
  }
};

export const fetchCustomOrderV4FormCatalog = async (supabase) => fetchCatalogByKey(supabase, 'custom_order_v4_catalog', DEFAULT_CUSTOM_ORDER_V4_FORM_CATALOG);
export const fetchCustomOrderV4Catalog = async (supabase) => fetchCatalogByKey(supabase, 'custom_order_v4_catalog', DEFAULT_CUSTOM_ORDER_V4_CATALOG);

export const getActiveCustomOrderCatalogDesigns = (catalog = {}) => {
  const normalizedCatalog = normalizeCustomOrderV4Catalog(catalog);
  const activeDesigns = normalizedCatalog.designs.filter((design) => design.isActive !== false);
  const finalDesigns = activeDesigns.length ? activeDesigns : normalizedCatalog.designs;
  return [...finalDesigns].sort((left, right) => (left.sortOrder - right.sortOrder) || left.title.localeCompare(right.title));
};

const getBudgetBandForRatio = (ratio) => {
  if (ratio >= 0.98) return 'original';
  if (ratio >= 0.88) return 'high';
  if (ratio >= 0.76) return 'mid';
  return 'lowest';
};

const buildFallbackPreview = (design, estimate, label, caption) => {
  const fallbackImage = estimate?.referenceImages?.[0] || design?.referenceImages?.[0] || null;
  if (!fallbackImage?.url) return null;

  return {
    id: 'preview-fallback',
    label,
    url: fallbackImage.url,
    alt: fallbackImage.alt || design?.title || label,
    caption: caption || design?.notes || design?.roughDescription || design?.description || '',
  };
};

const resolveDesignPreview = ({
  design,
  estimate,
  strategyId = '',
  originalPrice = 0,
}) => {
  const variants = Array.isArray(design?.visualVariants) ? design.visualVariants.filter((item) => item?.imageUrl) : [];
  if (!variants.length) {
    return buildFallbackPreview(
      design,
      estimate,
      strategyId ? 'Adjusted preview' : 'Original preview',
      strategyId ? 'Budget-fit visual guide for this arrangement.' : 'Original arrangement visual guide.'
    );
  }

  const ratio = originalPrice > 0 ? roundCurrency((estimate?.estimatedPrice || 0) / originalPrice) : 1;
  const budgetBand = strategyId ? getBudgetBandForRatio(ratio) : 'original';

  const rankedVariants = variants
    .map((variant, index) => {
      let score = 0;

      if (strategyId) {
        if (variant.strategyId === strategyId) score += 40;
        else if (variant.strategyId) score -= 8;
      } else if (variant.isOriginal || variant.budgetBand === 'original') {
        score += 40;
      }

      if (variant.packageTierId && variant.packageTierId === estimate?.packageTier?.id) score += 16;
      else if (variant.packageTierId) score -= 4;

      if (variant.wrapperId && variant.wrapperId === estimate?.wrapper?.id) score += 10;
      else if (variant.wrapperId) score -= 3;

      if (variant.budgetBand && variant.budgetBand === budgetBand) score += 8;
      if (variant.budgetRatioMax > 0 && ratio <= variant.budgetRatioMax) score += 6;
      if (variant.isOriginal && !strategyId) score += 6;

      return { variant, score, index };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  const bestVariant = rankedVariants[0]?.variant;
  if (!bestVariant?.imageUrl) {
    return buildFallbackPreview(
      design,
      estimate,
      strategyId ? 'Adjusted preview' : 'Original preview',
      strategyId ? 'Budget-fit visual guide for this arrangement.' : 'Original arrangement visual guide.'
    );
  }

  return {
    id: bestVariant.id,
    label: bestVariant.label || (strategyId ? 'Adjusted preview' : 'Original preview'),
    url: bestVariant.imageUrl,
    alt: bestVariant.alt || design?.title || bestVariant.label || 'Arrangement preview',
    caption: bestVariant.caption || design?.notes || design?.roughDescription || design?.description || '',
  };
};

const buildLineItems = (estimate) => {
  const lineItems = [];

  if (estimate.packageTier) {
    lineItems.push({
      id: `tier-${estimate.packageTier.id}`,
      type: 'package',
      label: estimate.packageTier.name,
      quantity: 1,
      unitPrice: estimate.packageTier.price,
      total: roundCurrency(estimate.packageTier.price),
    });
  }

  if (estimate.wrapper) {
    lineItems.push({
      id: `wrapper-${estimate.wrapper.id}`,
      type: 'wrapper',
      label: estimate.wrapper.name,
      quantity: 1,
      unitPrice: estimate.wrapper.price,
      total: roundCurrency(estimate.wrapper.price),
    });
  }

  estimate.components.forEach((component) => {
    lineItems.push({
      id: component.id,
      type: component.role,
      label: component.label,
      quantity: component.quantity,
      unitPrice: component.unitPrice,
      total: roundCurrency(component.quantity * component.unitPrice),
    });
  });

  estimate.accessories.forEach((accessory) => {
    lineItems.push({
      id: accessory.id,
      type: 'accessory',
      label: accessory.name,
      quantity: 1,
      unitPrice: accessory.price,
      total: roundCurrency(accessory.price),
    });
  });

  estimate.addOns.forEach((addOn) => {
    lineItems.push({
      id: addOn.id,
      type: 'addon',
      label: addOn.name,
      quantity: 1,
      unitPrice: addOn.price,
      total: roundCurrency(addOn.price),
    });
  });

  return lineItems;
};

const calculateEstimate = (estimate) => {
  const lineItems = buildLineItems(estimate);
  return {
    ...estimate,
    lineItems,
    estimatedPrice: roundCurrency(lineItems.reduce((sum, item) => sum + item.total, 0)),
  };
};

const createEstimateSignature = (estimate) => {
  const componentSignature = estimate.components
    .map((component) => `${component.id}:${component.label}:${component.quantity}:${component.unitPrice}`)
    .join('|');
  const accessorySignature = estimate.accessories.map((item) => item.id).sort().join('|');
  const addOnSignature = estimate.addOns.map((item) => item.id).sort().join('|');

  return [
    estimate.packageTier?.id || '',
    estimate.wrapper?.id || '',
    componentSignature,
    accessorySignature,
    addOnSignature,
  ].join('::');
};

const buildChangeList = (original, adjusted) => {
  const changes = [];

  if (original.packageTier?.id !== adjusted.packageTier?.id) {
    changes.push({
      key: 'package',
      explanation: `Switched the package from ${original.packageTier?.name} to ${adjusted.packageTier?.name}.`,
      savings: roundCurrency((original.packageTier?.price || 0) - (adjusted.packageTier?.price || 0)),
    });
  }

  if (original.wrapper?.id !== adjusted.wrapper?.id) {
    changes.push({
      key: 'wrapper',
      explanation: `Changed the wrapper from ${original.wrapper?.name} to ${adjusted.wrapper?.name}.`,
      savings: roundCurrency((original.wrapper?.price || 0) - (adjusted.wrapper?.price || 0)),
    });
  }

  original.accessories.forEach((originalAccessory) => {
    const existsInAdjusted = adjusted.accessories.some((item) => item.id === originalAccessory.id);
    if (!existsInAdjusted) {
      changes.push({
        key: `accessory-${originalAccessory.id}`,
        explanation: `Removed ${originalAccessory.name} to simplify the finishing details.`,
        savings: roundCurrency(originalAccessory.price),
      });
    }
  });

  original.addOns.forEach((originalAddOn) => {
    const existsInAdjusted = adjusted.addOns.some((item) => item.id === originalAddOn.id);
    if (!existsInAdjusted) {
      changes.push({
        key: `addon-${originalAddOn.id}`,
        explanation: `Removed the ${originalAddOn.name} add-on.`,
        savings: roundCurrency(originalAddOn.price),
      });
    }
  });

  original.components.forEach((originalComponent) => {
    const adjustedComponent = adjusted.components.find((component) => component.id === originalComponent.id);
    if (!adjustedComponent) return;

    if (originalComponent.label !== adjustedComponent.label || originalComponent.unitPrice !== adjustedComponent.unitPrice) {
      const savingsPerStem = roundCurrency((originalComponent.unitPrice || 0) - (adjustedComponent.unitPrice || 0));
      changes.push({
        key: `swap-${originalComponent.id}`,
        explanation: `Used ${adjustedComponent.label} instead of ${originalComponent.label} for a budget-friendly substitution.`,
        savings: roundCurrency(savingsPerStem * adjustedComponent.quantity),
      });
    }

    if (originalComponent.quantity !== adjustedComponent.quantity) {
      changes.push({
        key: `qty-${originalComponent.id}`,
        explanation: `Reduced ${adjustedComponent.label} from ${originalComponent.quantity} to ${adjustedComponent.quantity} stems.`,
        savings: roundCurrency((originalComponent.quantity - adjustedComponent.quantity) * adjustedComponent.unitPrice),
      });
    }
  });

  return changes.filter((change) => change.savings > 0 || change.explanation);
};

const createBaseEstimate = ({ design, selectedPackageTierId, selectedWrapperId, selectedAddOnIds = [] }) => {
  const packageTier = design.packageTiers.find((item) => item.id === selectedPackageTierId) || getDefaultItem(design.packageTiers);
  const wrapper = design.wrappers.find((item) => item.id === selectedWrapperId) || getDefaultItem(design.wrappers);
  const selectedAddOnIdSet = new Set(selectedAddOnIds);

  return calculateEstimate({
    designId: design.id,
    title: design.title,
    category: design.category,
    description: design.description,
    roughDescription: design.roughDescription,
    referenceImages: cloneValue(design.referenceImages),
    packageTier: cloneValue(packageTier),
    wrapper: cloneValue(wrapper),
    components: cloneValue(design.components),
    accessories: cloneValue(design.accessories.filter((item) => item.defaultSelected)),
    addOns: cloneValue(design.addOns.filter((item) => selectedAddOnIdSet.has(item.id))),
  });
};

const removeMostExpensive = (items = [], predicate = () => true) => {
  const candidates = items.filter(predicate);
  if (!candidates.length) return { changed: false, items };

  const target = [...candidates].sort((left, right) => right.price - left.price)[0];
  return {
    changed: true,
    items: items.filter((item) => item.id !== target.id),
  };
};

const substituteComponent = (estimate, rolePriority = ['filler', 'accent', 'main']) => {
  for (const role of rolePriority) {
    const candidate = estimate.components
      .filter((component) => component.role === role && component.cheaperLabel && component.cheaperUnitPrice > 0 && component.cheaperUnitPrice < component.unitPrice)
      .sort((left, right) => (right.unitPrice - right.cheaperUnitPrice) - (left.unitPrice - left.cheaperUnitPrice))[0];

    if (candidate) {
      candidate.label = candidate.cheaperLabel;
      candidate.unitPrice = roundCurrency(candidate.cheaperUnitPrice);
      return true;
    }
  }

  return false;
};

const reduceComponentQuantity = (estimate, rolePriority = ['filler', 'accent', 'main']) => {
  for (const role of rolePriority) {
    const candidate = estimate.components
      .filter((component) => component.role === role && component.quantity > component.minQuantity)
      .sort((left, right) => (right.unitPrice - left.unitPrice) || (right.quantity - left.quantity))[0];

    if (candidate) {
      candidate.quantity -= 1;
      return true;
    }
  }

  return false;
};

const applyStrategyActions = (estimate, design, actions = [], budget) => {
  let workingEstimate = cloneValue(estimate);

  for (const action of actions) {
    if (workingEstimate.estimatedPrice <= budget) break;

    let changed = true;
    while (workingEstimate.estimatedPrice > budget && changed) {
      changed = false;

      if (action === 'remove_addons') {
        const result = removeMostExpensive(workingEstimate.addOns);
        workingEstimate.addOns = result.items;
        changed = result.changed;
      }

      if (action === 'remove_accessories') {
        const result = removeMostExpensive(workingEstimate.accessories, (item) => item.removable !== false);
        workingEstimate.accessories = result.items;
        changed = result.changed;
      }

      if (action === 'simplify_wrapper') {
        const nextWrapper = getNextCheaperItem(design.wrappers, workingEstimate.wrapper?.id);
        if (nextWrapper) {
          workingEstimate.wrapper = cloneValue(nextWrapper);
          changed = true;
        }
      }

      if (action === 'downgrade_package') {
        const nextTier = getNextCheaperItem(design.packageTiers, workingEstimate.packageTier?.id);
        if (nextTier) {
          workingEstimate.packageTier = cloneValue(nextTier);
          changed = true;
        }
      }

      if (action === 'substitute_secondary') {
        changed = substituteComponent(workingEstimate, ['filler', 'accent']);
      }

      if (action === 'substitute_all') {
        changed = substituteComponent(workingEstimate, ['filler', 'accent', 'main']);
      }

      if (action === 'reduce_secondary_quantity') {
        changed = reduceComponentQuantity(workingEstimate, ['filler', 'accent']);
      }

      if (action === 'reduce_all_quantity') {
        changed = reduceComponentQuantity(workingEstimate, ['filler', 'accent', 'main']);
      }

      if (changed) {
        workingEstimate = calculateEstimate(workingEstimate);
      }
    }
  }

  return workingEstimate;
};

const STRATEGIES = [
  {
    id: 'closest-match',
    label: 'Closest match',
    summary: 'Keeps the overall look with lighter finishing details first.',
    actions: ['remove_addons', 'remove_accessories', 'simplify_wrapper', 'substitute_secondary', 'reduce_secondary_quantity', 'downgrade_package', 'reduce_all_quantity'],
  },
  {
    id: 'balanced-changes',
    label: 'Balanced changes',
    summary: 'Balances presentation changes and flower adjustments to stay near your budget.',
    actions: ['remove_addons', 'simplify_wrapper', 'downgrade_package', 'substitute_secondary', 'reduce_secondary_quantity', 'substitute_all', 'reduce_all_quantity'],
  },
  {
    id: 'essentials-only',
    label: 'Essentials only',
    summary: 'Focuses on the main concept with simpler finishes and compact sizing.',
    actions: ['downgrade_package', 'simplify_wrapper', 'remove_addons', 'remove_accessories', 'substitute_all', 'reduce_secondary_quantity', 'reduce_all_quantity'],
  },
];

export const generateCustomOrderV4Suggestions = ({
  design,
  selectedPackageTierId,
  selectedWrapperId,
  selectedAddOnIds = [],
  customerBudget,
}) => {
  const originalDesignBase = createBaseEstimate({ design, selectedPackageTierId, selectedWrapperId, selectedAddOnIds });
  const originalDesign = {
    ...originalDesignBase,
    preview: resolveDesignPreview({
      design,
      estimate: originalDesignBase,
      strategyId: '',
      originalPrice: originalDesignBase.estimatedPrice,
    }),
  };
  const parsedBudget = Math.max(0, roundCurrency(customerBudget));

  if (!parsedBudget || parsedBudget >= originalDesign.estimatedPrice) {
    return {
      originalDesign,
      alternatives: [],
      minimumAchievablePrice: originalDesign.estimatedPrice,
      budgetGap: Math.max(0, roundCurrency(originalDesign.estimatedPrice - parsedBudget)),
    };
  }

  const dedupeMap = new Map();

  STRATEGIES.forEach((strategy) => {
    const adjustedEstimateBase = applyStrategyActions(originalDesignBase, design, strategy.actions, parsedBudget);
    const adjustedEstimate = {
      ...adjustedEstimateBase,
      preview: resolveDesignPreview({
        design,
        estimate: adjustedEstimateBase,
        strategyId: strategy.id,
        originalPrice: originalDesignBase.estimatedPrice,
      }),
    };
    const signature = createEstimateSignature(adjustedEstimateBase);
    const changes = buildChangeList(originalDesignBase, adjustedEstimateBase);

    if (signature === createEstimateSignature(originalDesignBase) || !changes.length) {
      return;
    }

    if (!dedupeMap.has(signature)) {
      dedupeMap.set(signature, {
        id: strategy.id,
        label: strategy.label,
        summary: strategy.summary,
        estimatedPrice: adjustedEstimate.estimatedPrice,
        withinBudget: adjustedEstimate.estimatedPrice <= parsedBudget,
        savings: roundCurrency(originalDesign.estimatedPrice - adjustedEstimate.estimatedPrice),
        budgetGap: Math.max(0, roundCurrency(adjustedEstimate.estimatedPrice - parsedBudget)),
        changes,
        selectedEstimate: adjustedEstimate,
        preview: adjustedEstimate.preview,
      });
    }
  });

  const alternatives = [...dedupeMap.values()]
    .sort((left, right) => {
      if (left.withinBudget !== right.withinBudget) return left.withinBudget ? -1 : 1;
      if (left.withinBudget && right.withinBudget) return right.estimatedPrice - left.estimatedPrice;
      if (!left.withinBudget && !right.withinBudget) return left.estimatedPrice - right.estimatedPrice;
      return left.changes.length - right.changes.length;
    })
    .slice(0, 3);

  const minimumAchievablePrice = alternatives.length
    ? Math.min(...alternatives.map((item) => item.estimatedPrice))
    : originalDesign.estimatedPrice;

  if (!alternatives.some((item) => item.withinBudget) && alternatives.length) {
    const cheapestAlternative = alternatives.reduce((lowest, current) => (
      current.estimatedPrice < lowest.estimatedPrice ? current : lowest
    ), alternatives[0]);
    cheapestAlternative.label = 'Lowest available estimate';
    cheapestAlternative.summary = 'This is the lightest version we can suggest while keeping the same concept.';
  }

  return {
    originalDesign,
    alternatives,
    minimumAchievablePrice,
    budgetGap: Math.max(0, roundCurrency(originalDesign.estimatedPrice - parsedBudget)),
  };
};

export const formatCustomOrderV4Currency = (value) => formatChangeCurrency(value);

export const isCustomOrderV4Item = (item = {}) => (
  item?.custom_order_version === 4
  || item?.requestVariant === 'custom_order_v4'
  || item?.flow === 'custom_order_v4'
);

export const getSelectedEstimateFromItem = (item = {}) => {
  if (!isCustomOrderV4Item(item)) return null;

  const selectedId = item.selectedAlternativeId;
  if (!selectedId || selectedId === 'original') {
    return item.originalDesign || item.selectedEstimate || null;
  }

  const alternatives = Array.isArray(item.suggestedAlternatives) ? item.suggestedAlternatives : [];
  return alternatives.find((alternative) => alternative.id === selectedId)?.selectedEstimate
    || item.selectedEstimate
    || item.originalDesign
    || null;
};

export const buildCustomOrderV4CartItem = ({
  formData,
  design,
  originalDesign,
  alternatives,
  selectedAlternativeId,
  requestVariant = 'custom_order_v4',
  customOrderVersion = 4,
  serviceType = 'Custom Order',
  flow = requestVariant,
  reviewNote = DEFAULT_PAGE_COPY_V4_FORM.reviewNote,
}) => {
  const chosenAlternative = (Array.isArray(alternatives) ? alternatives : []).find((alternative) => alternative.id === selectedAlternativeId) || null;
  const selectedEstimate = chosenAlternative?.selectedEstimate || originalDesign;
  const occasion = formData.occasion === 'Other' ? formData.otherOccasion : formData.occasion;
  const originalPreview = originalDesign?.preview || buildFallbackPreview(design, originalDesign, 'Original preview', '');
  const selectedPreview = selectedEstimate?.preview || chosenAlternative?.preview || originalPreview;
  const primaryImageUrl = formData.inspirationImageBase64 || selectedPreview?.url || selectedEstimate.referenceImages?.[0]?.url || design.referenceImages?.[0]?.url || '';
  const selectedFlowers = selectedEstimate.components.map((component) => component.label);
  const flowerQuantities = selectedEstimate.components.reduce((accumulator, component) => {
    accumulator[component.label] = component.quantity;
    return accumulator;
  }, {});
  const totalFlowers = selectedEstimate.components.reduce((sum, component) => sum + component.quantity, 0);
  const comparisonPreviews = [
    originalPreview ? {
      id: 'original',
      optionId: 'original',
      label: 'Original target design',
      price: originalDesign?.estimatedPrice || 0,
      withinBudget: roundCurrency(originalDesign?.estimatedPrice || 0) <= roundCurrency(formData.budget),
      ...originalPreview,
    } : null,
    ...(Array.isArray(alternatives) ? alternatives : []).map((alternative) => {
      const preview = alternative.preview || alternative.selectedEstimate?.preview || null;
      if (!preview?.url) return null;

      return {
        id: alternative.id,
        optionId: alternative.id,
        label: alternative.label,
        price: alternative.estimatedPrice,
        withinBudget: alternative.withinBudget,
        changes: alternative.changes,
        ...preview,
      };
    }),
  ].filter(Boolean);

  return {
    id: Date.now(),
    serviceType,
    name: design.title,
    requestVariant,
    custom_order_version: customOrderVersion,
    flow,
    customerName: formData.customerName,
    email: formData.email,
    contactNumber: formData.contactNumber,
    recipientName: formData.recipientName,
    occasion,
    eventDate: formData.eventDate,
    eventTime: formData.eventTime,
    venue: formData.venue,
    arrangementType: `${design.title} - ${selectedEstimate.packageTier?.name || 'Selected package'}`,
    arrangementSummary: `${design.title} - ${selectedEstimate.packageTier?.name || 'Selected package'}`,
    arrangementQuantity: 1,
    arrangementSelections: [{
      arrangement_label: design.title,
      quantity: 1,
      flowers_per_arrangement: totalFlowers,
      total_flowers: totalFlowers,
    }],
    customerPreferredFlowers: selectedFlowers,
    customer_preferred_flowers: selectedFlowers,
    flowers: selectedFlowers.join(', '),
    selectedFlowers,
    flowerQuantities,
    totalFlowers,
    specialInstructions: formData.specialInstructions,
    inspirationImageBase64: formData.inspirationImageBase64 || null,
    image_url: primaryImageUrl || null,
    originalPreviewImage: originalPreview?.url || null,
    selectedPreviewImage: selectedPreview?.url || null,
    originalPreview,
    selectedPreview,
    comparisonPreviews,
    qty: 1,
    price: selectedEstimate.estimatedPrice,
    estimatedPrice: selectedEstimate.estimatedPrice,
    originalEstimatedPrice: originalDesign.estimatedPrice,
    customerBudget: roundCurrency(formData.budget),
    selectedAlternativeId: chosenAlternative?.id || 'original',
    selectedOptionLabel: chosenAlternative?.label || 'Original target design',
    originalDesign,
    suggestedAlternatives: alternatives,
    selectedEstimate,
    referenceImages: selectedEstimate.referenceImages || design.referenceImages,
    roughDescription: design.roughDescription,
    notes: design.notes || '',
    priceRangeLabel: design.priceRangeLabel || '',
    reviewNote,
  };
};
