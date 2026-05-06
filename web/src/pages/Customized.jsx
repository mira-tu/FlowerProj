import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaArrowRotateLeft, FaScroll, FaRibbon, FaSeedling } from 'react-icons/fa6';
import html2canvas from 'html2canvas';
import RequestSuccessModal from '../components/RequestSuccessModal';
import InfoModal from '../components/InfoModal'; // Import InfoModal
import { supabase } from '../config/supabase';
import { stockAPI } from '../config/api'; // Import stockAPI
import {
  applyNaturalWrapperPreviewCropping,
  getWrapperFlowerZoneConfig,
  getWrapperPreviewStyle,
  getWrapperRibbonPreviewConfig,
  getWrapperRibbonMode,
  normalizeRibbonScope,
  RIBBON_SCOPE,
} from '../utils/customizedRibbonOptions';
import '../styles/Customized.css';
import {
  evaluateStandaloneFreeShippingPromo,
  fetchCustomizedStudioPromoSettings,
} from '../utils/freeShipping';

const placeholderStemImg = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodGg9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodGg9IjEwMCIgZmlsbD0iI2UwZTBlMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9ImFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjMzMzIiBhbmNob3ItcGVudD0ibWlkZGxlIiB0ZXh0LWFuY2hvcnM9Im1pZGRsZSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'; // SVG "No Image" placeholder

const MAX_STEM_COUNT = 500; // Maximum number of stems allowed for performance reasons.
const PALM_HALO_RIBBON_NAME_PREFIX = 'Palm Halo Ribbon - ';
const STEM_HANDLE_SIZE = 100;
const CLASSIC_FLOWER_ZONE_WIDTH = 320;
const CLASSIC_FLOWER_ZONE_HEIGHT = 250;
const BASE_STEM_MAX_X = CLASSIC_FLOWER_ZONE_WIDTH - STEM_HANDLE_SIZE;
const BASE_STEM_MAX_Y = CLASSIC_FLOWER_ZONE_HEIGHT - STEM_HANDLE_SIZE;
const bundleOptions = [3, 6, 12];
const DEFAULT_FLOWER_SIZE = 'standard';
const FLOWER_SIZE_OPTIONS = Object.freeze([
  { id: 'small', label: 'Small', multiplier: 0.84 },
  { id: DEFAULT_FLOWER_SIZE, label: 'Standard', multiplier: 1 },
  { id: 'large', label: 'Large', multiplier: 1.16 },
]);
const getFlowerSizeOption = (value) => (
  FLOWER_SIZE_OPTIONS.find((option) => option.id === value) || FLOWER_SIZE_OPTIONS[1]
);
const BASE_STEPS = [
  { id: 1, icon: <FaScroll />, label: 'Wrapper' },
  { id: 2, icon: <FaRibbon />, label: 'Ribbon' },
  { id: 3, icon: <FaSeedling />, label: 'Flowers' }
];
const COLOR_VARIANT_NAMES = new Set([
  'black',
  'blue',
  'dark blue',
  'gold',
  'green',
  'lavender',
  'light blue',
  'maroon',
  'navy blue',
  'orange',
  'pink',
  'purple',
  'red',
  'royal blue',
  'silver',
  'sky blue',
  'white',
  'yellow',
]);
const WRAPPER_COLOR_SWATCH_MAP = {
  'Dark Blue': '#1d4ed8',
  'Sky Blue': '#38bdf8',
  Purple: '#8b5cf6',
};
const normalizeText = (value) => String(value || '').trim();
const DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE = Object.freeze({
  top: '58%',
  left: '50%',
  width: '30%',
  transform: 'translate(-50%, -50%)',
});
const parseItemCustomizationConfig = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};
const stripPalmHaloRibbonNamePrefix = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith(PALM_HALO_RIBBON_NAME_PREFIX.toLowerCase())) {
    return trimmed.slice(PALM_HALO_RIBBON_NAME_PREFIX.length).trim();
  }
  return trimmed;
};
const resolveStoredRibbonScope = (item = {}) => {
  const explicitScope = String(item.ribbon_scope || '').trim();
  if (explicitScope) {
    return normalizeRibbonScope(explicitScope);
  }

  const customizationConfig = parseItemCustomizationConfig(item.customization_config);
  const configScope = String(
    customizationConfig?.ribbon_scope
    || customizationConfig?.ribbonScope
    || customizationConfig?.scope
    || ''
  ).trim();

  if (configScope) {
    return normalizeRibbonScope(configScope);
  }

  const searchableText = [
    item.name,
    customizationConfig?.stockLabel,
    customizationConfig?.scopeLabel,
    customizationConfig?.wrapperMode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (searchableText.includes('palm halo')) {
    return RIBBON_SCOPE.PALM_HALO_WRAP;
  }

  return RIBBON_SCOPE.CLASSIC_BOUQUET;
};
const decorateStoredRibbonOption = (item = {}) => {
  const customizationConfig = parseItemCustomizationConfig(item.customization_config);
  const normalizedScope = resolveStoredRibbonScope(item);
  const colorName = item.colorName || item.wrapper_color || customizationConfig.colorName || null;
  const previewStyle = item.previewStyle
    || customizationConfig.previewStyle
    || (normalizedScope === RIBBON_SCOPE.PALM_HALO_WRAP ? DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE : null);

  return {
    ...item,
    name: stripPalmHaloRibbonNamePrefix(item.name),
    ribbon_scope: normalizedScope,
    colorName,
    swatch: item.swatch || customizationConfig.swatch || null,
    stockLabel: item.stockLabel || customizationConfig.stockLabel || (normalizedScope === RIBBON_SCOPE.PALM_HALO_WRAP ? 'Included with Palm Halo Wrap' : ''),
    previewStyle,
  };
};

const normalizeStockCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'flower' || normalized === 'flowers') return 'Flowers';
  if (normalized === 'wrapper' || normalized === 'wrappers') return 'Wrappers';
  if (normalized === 'ribbon' || normalized === 'ribbons') return 'Ribbons';
  return String(value || '').trim();
};

const getOptionStockLabel = (item) => {
  if (item.stockLabel) return item.stockLabel;
  if (item.is_available === false) return 'Unavailable';
  if ((item.quantity || 0) <= 0) return 'Out of Stock';
  if ((item.quantity || 0) <= 5) return `Only ${item.quantity} left!`;
  return `${item.quantity} pieces available`;
};

const getOptionPriceText = (item, groupKey, formatPrice) => {
  if (groupKey === 'flowers') {
    return `+${formatPrice(item.price)}/pc`;
  }

  if (groupKey === 'ribbons' && (Number(item.price) || 0) <= 0) {
    return 'Included';
  }

  return `+${formatPrice(item.price || 0)}`;
};

const cropCanvasToContent = (sourceCanvas, padding = 24) => {
  if (!sourceCanvas) return sourceCanvas;

  const context = sourceCanvas.getContext('2d');
  if (!context) return sourceCanvas;

  const { width, height } = sourceCanvas;
  if (!width || !height) return sourceCanvas;

  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[((y * width) + x) * 4 + 3];
      if (alpha === 0) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return sourceCanvas;
  }

  const cropLeft = Math.max(0, minX - padding);
  const cropTop = Math.max(0, minY - padding);
  const cropRight = Math.min(width, maxX + padding + 1);
  const cropBottom = Math.min(height, maxY + padding + 1);
  const cropWidth = cropRight - cropLeft;
  const cropHeight = cropBottom - cropTop;

  if (cropWidth <= 0 || cropHeight <= 0) {
    return sourceCanvas;
  }

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;

  const croppedContext = croppedCanvas.getContext('2d');
  if (!croppedContext) return sourceCanvas;

  croppedContext.drawImage(
    sourceCanvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return croppedCanvas;
};

const resizeCanvasToFit = (sourceCanvas, maxDimension = 420) => {
  if (!sourceCanvas) return sourceCanvas;

  const { width, height } = sourceCanvas;
  if (!width || !height) return sourceCanvas;

  const safeMaxDimension = Number.parseInt(maxDimension, 10);
  if (!Number.isFinite(safeMaxDimension) || safeMaxDimension <= 0) {
    return sourceCanvas;
  }

  if (width <= safeMaxDimension && height <= safeMaxDimension) {
    return sourceCanvas;
  }

  const ratio = Math.min(safeMaxDimension / width, safeMaxDimension / height);
  const nextWidth = Math.max(1, Math.round(width * ratio));
  const nextHeight = Math.max(1, Math.round(height * ratio));
  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = nextWidth;
  resizedCanvas.height = nextHeight;

  const resizedContext = resizedCanvas.getContext('2d');
  if (!resizedContext) return sourceCanvas;

  resizedContext.imageSmoothingEnabled = true;
  resizedContext.imageSmoothingQuality = 'high';
  resizedContext.drawImage(sourceCanvas, 0, 0, width, height, 0, 0, nextWidth, nextHeight);
  return resizedCanvas;
};

const buildStorageFriendlySnapshot = (sourceCanvas) => {
  if (!sourceCanvas) return null;

  const dimensionSteps = [640, 520, 420];

  for (const maxDimension of dimensionSteps) {
    const resizedCanvas = resizeCanvasToFit(sourceCanvas, maxDimension);
    const dataUrl = resizedCanvas.toDataURL('image/png');
    if (dataUrl.length <= 700000 || maxDimension === dimensionSteps[dimensionSteps.length - 1]) {
      return dataUrl;
    }
  }

  return null;
};

const stripSelectionAssetFields = (selectionItem = {}) => {
  if (!selectionItem || typeof selectionItem !== 'object') {
    return selectionItem;
  }

  const {
    img: _img,
    image: _image,
    layerImg: _layerImg,
    layer_img: _layerImgAlt,
    stemImg: _stemImg,
    stem_img: _stemImgAlt,
    ...rest
  } = selectionItem;

  return rest;
};

const buildStorageFriendlyCustomizedBouquet = (bouquet = {}, { includeImage = true } = {}) => ({
  ...bouquet,
  image: includeImage ? (bouquet.image || null) : null,
  flowers: (Array.isArray(bouquet.flowers) ? bouquet.flowers : []).map((flower) => stripSelectionAssetFields(flower)),
  wrapper: bouquet.wrapper ? stripSelectionAssetFields(bouquet.wrapper) : null,
  ribbon: bouquet.ribbon ? stripSelectionAssetFields(bouquet.ribbon) : null,
});

const persistCustomizedCart = (cartKey, items = []) => {
  const safeItems = (Array.isArray(items) ? items : []).map((item) => buildStorageFriendlyCustomizedBouquet(item, { includeImage: true }));

  try {
    localStorage.setItem(cartKey, JSON.stringify(safeItems));
    return { usedImageFallback: false };
  } catch (error) {
    if (error?.name !== 'QuotaExceededError') {
      throw error;
    }

    const imageLightItems = safeItems.map((item) => buildStorageFriendlyCustomizedBouquet(item, { includeImage: false }));
    localStorage.setItem(cartKey, JSON.stringify(imageLightItems));
    return { usedImageFallback: true };
  }
};

const clampPreviewRatio = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const getRelativeElementBounds = (stageRect, element) => {
  if (!stageRect || !element) return null;

  const elementRect = element.getBoundingClientRect();
  if (!elementRect.width || !elementRect.height || !stageRect.width || !stageRect.height) {
    return null;
  }

  return {
    leftRatio: clampPreviewRatio((elementRect.left - stageRect.left) / stageRect.width),
    topRatio: clampPreviewRatio((elementRect.top - stageRect.top) / stageRect.height),
    widthRatio: clampPreviewRatio(elementRect.width / stageRect.width),
    heightRatio: clampPreviewRatio(elementRect.height / stageRect.height),
  };
};

const buildSavedPreviewComposition = ({
  stageElement,
  wrapperElement,
  ribbonElement,
  stemLayouts,
  flowerZoneLayouts,
  selection,
  stemScale,
}) => {
  if (!stageElement) return null;

  const stageRect = stageElement.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) {
    return null;
  }

  const stageWidth = stageRect.width;
  const stageHeight = stageRect.height;
  const stemNodes = Array.from(stageElement.querySelectorAll('[data-stem-id]'));
  const stemNodeMap = new Map(
    stemNodes.map((node) => [String(node.dataset.stemId || ''), node])
  );

  const wrapperSrc = selection?.wrapper?.layerImg || selection?.wrapper?.img || null;
  const ribbonSrc = selection?.ribbon?.layerImg || selection?.ribbon?.img || null;
  const wrapperBounds = getRelativeElementBounds(stageRect, wrapperElement);
  const ribbonBounds = getRelativeElementBounds(stageRect, ribbonElement);

  const stems = (Array.isArray(stemLayouts) ? stemLayouts : []).map((slot, index) => {
    const zoneLayout = resolveZoneLayout(flowerZoneLayouts, slot?.zoneKey, slot?.zoneIndex ?? 0);
    const flowerIndex = selection?.flowers?.length ? index % selection.flowers.length : 0;
    const flower = selection?.flowers?.[flowerIndex];
    const src = flower?.stemImg || flower?.layerImg || flower?.img || null;

    if (!zoneLayout || !src) {
      return null;
    }

    const stemNode = stemNodeMap.get(String(slot?.id || ''));
    const measuredWidth = stemNode?.offsetWidth || STEM_HANDLE_SIZE;
    const measuredHeight = stemNode?.offsetHeight || STEM_HANDLE_SIZE;

    return {
      id: slot?.id || `stem-${index}`,
      src,
      leftRatio: clampPreviewRatio((zoneLayout.left + Number(slot?.x || 0)) / stageWidth),
      topRatio: clampPreviewRatio((zoneLayout.top + Number(slot?.y || 0)) / stageHeight),
      widthRatio: clampPreviewRatio(measuredWidth / stageWidth),
      heightRatio: clampPreviewRatio(measuredHeight / stageHeight),
      rotation: Number(slot?.rotate || 0),
      scale: Number(stemScale || 1),
      zIndex: Number(slot?.zIndex || (2 + index)),
    };
  }).filter(Boolean);

  if (!wrapperBounds && !ribbonBounds && stems.length === 0) {
    return null;
  }

  return {
    version: 1,
    wrapper: wrapperBounds && wrapperSrc
      ? { src: wrapperSrc, zIndex: 1, ...wrapperBounds }
      : null,
    ribbon: ribbonBounds && ribbonSrc
      ? { src: ribbonSrc, zIndex: 3, ...ribbonBounds }
      : null,
    stems,
  };
};

const isOptionSelectable = (item) => item.is_available !== false && (item.quantity || 0) > 0;
const isLikelyColorVariant = (value) => COLOR_VARIANT_NAMES.has(String(value || '').trim().toLowerCase());
const getWrapperSwatch = (value) => WRAPPER_COLOR_SWATCH_MAP[String(value || '').trim()] || '#94a3b8';
const createWrapperGroupId = (value) => normalizeText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || 'wrapper-group';
const getWrapperGroupName = (item) => {
  const explicitGroupName = normalizeText(item.wrapper_group_name);
  if (explicitGroupName) return explicitGroupName;
  return isLikelyColorVariant(item.name) ? 'Classic Wrap' : normalizeText(item.name);
};
const getWrapperColorName = (item) => {
  const explicitColor = normalizeText(item.wrapper_color);
  if (explicitColor) return explicitColor;
  return isLikelyColorVariant(item.name) ? normalizeText(item.name) : '';
};
const buildWrapperVariant = ({
  groupId,
  groupName,
  colorName = '',
  stockLabel = '',
  ...item
}) => ({
  ...item,
  groupId,
  groupName,
  colorName,
  stockLabel,
  swatch: colorName ? getWrapperSwatch(colorName) : getWrapperSwatch(groupName),
  name: colorName ? `${groupName} (${colorName})` : groupName,
});
const buildWrapperGroups = (stockWrappers) => {
  const groups = new Map();

  stockWrappers.forEach((item) => {
    const groupName = getWrapperGroupName(item);
    if (!groupName) return;

    const groupId = createWrapperGroupId(groupName);
    const colorName = getWrapperColorName(item);
    const variant = buildWrapperVariant({
      ...item,
      groupId,
      groupName,
      colorName,
    });

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: groupName,
        img: item.img || placeholderImg,
        layerImg: item.layerImg || item.img || placeholderImg,
        customization_config: item.customization_config || null,
        variants: [],
      });
    }

    const group = groups.get(groupId);
    if (!group.img && variant.img) group.img = variant.img;
    if (!group.layerImg && (variant.layerImg || variant.img)) group.layerImg = variant.layerImg || variant.img;
    if (!group.customization_config && variant.customization_config) group.customization_config = variant.customization_config;
    group.variants.push(variant);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      variants: [...group.variants].sort((a, b) => {
        const labelA = normalizeText(a.colorName || a.groupName || a.name);
        const labelB = normalizeText(b.colorName || b.groupName || b.name);
        return labelA.localeCompare(labelB);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const BASE_PRESET_POSITIONS = {
  3: [
    { x: 40, y: 20, rotate: -15, zIndex: 1 },
    { x: 80, y: 10, rotate: 0, zIndex: 2 },
    { x: 120, y: 20, rotate: 15, zIndex: 1 },
  ],
  6: [
    { x: 30, y: 30, rotate: -20, zIndex: 1 },
    { x: 70, y: 20, rotate: -5, zIndex: 2 },
    { x: 110, y: 30, rotate: 10, zIndex: 1 },
    { x: 50, y: 50, rotate: -10, zIndex: 3 },
    { x: 90, y: 50, rotate: 10, zIndex: 3 },
    { x: 70, y: 70, rotate: 0, zIndex: 4 },
  ],
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const constrainStemToBounds = ({
  x,
  y,
  maxX,
  maxY,
  zoneWidth,
  zoneHeight,
  shape = 'rectangle',
  handleWidth = STEM_HANDLE_SIZE,
  handleHeight = STEM_HANDLE_SIZE,
}) => {
  const clampedX = clamp(x, 0, maxX);
  const clampedY = clamp(y, 0, maxY);

  if (shape !== 'ellipse') {
    return { x: clampedX, y: clampedY };
  }

  const radiusX = Math.max((zoneWidth - handleWidth) / 2, 0);
  const radiusY = Math.max((zoneHeight - handleHeight) / 2, 0);

  if (!radiusX || !radiusY) {
    return { x: clampedX, y: clampedY };
  }

  const centerX = clampedX + handleWidth / 2;
  const centerY = clampedY + handleHeight / 2;
  const ellipseCenterX = zoneWidth / 2;
  const ellipseCenterY = zoneHeight / 2;
  const normalizedX = (centerX - ellipseCenterX) / radiusX;
  const normalizedY = (centerY - ellipseCenterY) / radiusY;
  const distance = (normalizedX ** 2) + (normalizedY ** 2);

  if (distance <= 1) {
    return { x: clampedX, y: clampedY };
  }

  const scale = 1 / Math.sqrt(distance);
  const adjustedCenterX = ellipseCenterX + (centerX - ellipseCenterX) * scale;
  const adjustedCenterY = ellipseCenterY + (centerY - ellipseCenterY) * scale;

  return {
    x: clamp(adjustedCenterX - handleWidth / 2, 0, maxX),
    y: clamp(adjustedCenterY - handleHeight / 2, 0, maxY),
  };
};

const getStemPosition = (index, count, maxX = BASE_STEM_MAX_X, maxY = BASE_STEM_MAX_Y) => {
  const preset = BASE_PRESET_POSITIONS[count];
  if (preset?.[index]) {
    return {
      ...preset[index],
      x: clamp((preset[index].x / BASE_STEM_MAX_X) * maxX, 0, maxX),
      y: clamp((preset[index].y / BASE_STEM_MAX_Y) * maxY, 0, maxY),
    };
  }

  const angle = index * 0.82;
  const radius = 18 + Math.sqrt(index + 1) * 18;
  const baseX = clamp(70 + Math.cos(angle) * radius, 0, BASE_STEM_MAX_X);
  const baseY = clamp(45 + Math.sin(angle) * radius * 0.62, 0, BASE_STEM_MAX_Y);

  return {
    x: clamp((baseX / BASE_STEM_MAX_X) * maxX, 0, maxX),
    y: clamp((baseY / BASE_STEM_MAX_Y) * maxY, 0, maxY),
    rotate: Math.sin(index * 1.35) * 18,
    zIndex: index + 1,
  };
};

const resolveZoneLayout = (zoneLayouts, zoneKey, fallbackIndex = 0) => (
  zoneLayouts.find((zone) => zone.id === zoneKey) || zoneLayouts[fallbackIndex] || null
);

const buildStemZonePlan = (count, zoneLayouts) => {
  if (!count || zoneLayouts.length === 0) {
    return [];
  }

  if (zoneLayouts.length === 1) {
    return Array.from({ length: count }, (_, zoneStemIndex) => ({
      zoneIndex: 0,
      zoneKey: zoneLayouts[0].id,
      zoneStemIndex,
      zoneStemCount: count,
    }));
  }

  const weights = zoneLayouts.map((zone) => (
    Number.isFinite(zone.stemShare) && zone.stemShare > 0 ? zone.stemShare : 1
  ));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || zoneLayouts.length;
  const exactCounts = weights.map((weight) => (count * weight) / totalWeight);
  const allocations = exactCounts.map((value) => Math.floor(value));
  let assignedCount = allocations.reduce((sum, value) => sum + value, 0);
  const remainders = exactCounts
    .map((value, zoneIndex) => ({
      zoneIndex,
      fraction: value - allocations[zoneIndex],
    }))
    .sort((a, b) => b.fraction - a.fraction);

  let remainderIndex = 0;
  while (assignedCount < count && remainders.length > 0) {
    const nextZone = remainders[remainderIndex % remainders.length];
    allocations[nextZone.zoneIndex] += 1;
    assignedCount += 1;
    remainderIndex += 1;
  }

  const plan = [];
  allocations.forEach((zoneStemCount, zoneIndex) => {
    for (let zoneStemIndex = 0; zoneStemIndex < zoneStemCount; zoneStemIndex += 1) {
      plan.push({
        zoneIndex,
        zoneKey: zoneLayouts[zoneIndex].id,
        zoneStemIndex,
        zoneStemCount,
      });
    }
  });

  return plan;
};

const Customized = ({ addToCart }) => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);
  const [selection, setSelection] = useState({
    flowers: [],
    bundleSize: 0,
    wrapper: null,
    ribbon: null,
    flowerSize: DEFAULT_FLOWER_SIZE
  });
  const [customBundleSizeInput, setCustomBundleSizeInput] = useState('');
  const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null }); // State for InfoModal
  const previewRef = useRef(null);
  const wrapperLayerRef = useRef(null);
  const ribbonLayerRef = useRef(null);
  const isCustomizationMountedRef = useRef(false);
  const dragStateRef = useRef(null);
  const stemIdRef = useRef(0);

  // New state for dynamic customization data
  const [flowers, setFlowers] = useState([]);
  const [wrappers, setWrappers] = useState([]);
  const [ribbons, setRibbons] = useState([]);
  const [loadingCustomizationData, setLoadingCustomizationData] = useState(true);
  const [stemLayouts, setStemLayouts] = useState([]);
  const [draggingStemId, setDraggingStemId] = useState(null);
  const [wrapperColorModal, setWrapperColorModal] = useState({ open: false, groupId: null });
  const [wrapperLayerBox, setWrapperLayerBox] = useState(null);
  const [customizedStudioPromoSettings, setCustomizedStudioPromoSettings] = useState({
    enabled: false,
    minimumOrderAmount: 0,
    isConfigured: false,
  });

  useEffect(() => {
    let isMounted = true;

    const loadCustomizedStudioPromo = async () => {
      try {
        const promoSettings = await fetchCustomizedStudioPromoSettings(supabase);
        if (isMounted) {
          setCustomizedStudioPromoSettings(promoSettings);
        }
      } catch (error) {
        console.error('Error loading Customizer Studio free shipping promo:', error);
      }
    };

    loadCustomizedStudioPromo();

    const channel = supabase
      .channel('public:app_content:customized-studio-promo-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_content' },
        () => {
          loadCustomizedStudioPromo();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCustomizationData = useCallback(async ({ suppressModal = false, showLoading = false } = {}) => {
      if (showLoading && isCustomizationMountedRef.current) {
        setLoadingCustomizationData(true);
      }

      try {
        const response = await stockAPI.getAll();
        const allStockItems = response.data || [];

        const processedFlowers = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Flowers')
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            stemImg: item.stemImg,
            customization_config: item.customization_config || null,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
          }));

        const processedWrappers = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Wrappers')
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            customization_config: item.customization_config || null,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
            wrapper_group_name: item.wrapper_group_name || '',
            wrapper_color: item.wrapper_color || '',
          }));

        const processedRibbons = allStockItems
          .filter(item => normalizeStockCategory(item.category) === 'Ribbons')
          .map(item => decorateStoredRibbonOption({
            id: item.id,
            name: item.name,
            price: item.price,
            img: item.img,
            layerImg: item.layerImg,
            customization_config: item.customization_config || null,
            quantity: item.quantity || 0,
            is_available: item.is_available !== false,
            ribbon_scope: item.ribbon_scope || '',
          }));

        const preparedWrapperGroups = await applyNaturalWrapperPreviewCropping(
          buildWrapperGroups(processedWrappers)
        );

        if (!isCustomizationMountedRef.current) {
          return;
        }

        setFlowers(processedFlowers);
        setWrappers(preparedWrapperGroups);
        setRibbons(processedRibbons);

      } catch (error) {
        console.error('Error fetching customization data:', error.message || error);
        if (isCustomizationMountedRef.current && !suppressModal) {
          setInfoModal({ show: true, title: 'Error', message: 'Failed to load customization options. Please try again.' });
        }
      } finally {
        if (isCustomizationMountedRef.current) {
          setLoadingCustomizationData(false);
        }
      }
    }, []);

  useEffect(() => {
    isCustomizationMountedRef.current = true;

    fetchCustomizationData({ showLoading: true });

    const channel = supabase
      .channel('public:stock_products:customizer-studio')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_products' },
        () => {
          fetchCustomizationData({ suppressModal: true });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_reservations' },
        () => {
          fetchCustomizationData({ suppressModal: true });
        }
      )
      .subscribe();

    const refreshCustomizationData = () => {
      fetchCustomizationData({ suppressModal: true });
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshCustomizationData();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refreshCustomizationData);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isCustomizationMountedRef.current = false;
      supabase.removeChannel(channel);

      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refreshCustomizationData);
      }

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchCustomizationData]);

  const ribbonMode = useMemo(() => getWrapperRibbonMode(selection.wrapper), [selection.wrapper]);
  const classicRibbonOptions = useMemo(() => (
    ribbons.filter((item) => resolveStoredRibbonScope(item) === RIBBON_SCOPE.CLASSIC_BOUQUET)
  ), [ribbons]);
  const palmHaloStockRibbonOptions = useMemo(() => (
    ribbons.filter((item) => resolveStoredRibbonScope(item) === RIBBON_SCOPE.PALM_HALO_WRAP)
  ), [ribbons]);
  const palmHaloRibbonOptions = useMemo(() => palmHaloStockRibbonOptions, [palmHaloStockRibbonOptions]);
  const availableRibbonOptions = useMemo(() => {
    if (ribbonMode === 'classic') {
      return classicRibbonOptions;
    }

    if (ribbonMode === 'palm-halo') {
      return palmHaloRibbonOptions;
    }

    return [];
  }, [classicRibbonOptions, palmHaloRibbonOptions, ribbonMode]);
  const visibleSteps = useMemo(() => (
    ribbonMode === 'none'
      ? BASE_STEPS.filter((step) => step.id !== 2)
      : BASE_STEPS
  ), [ribbonMode]);

  useEffect(() => {
    if (ribbonMode === 'none' && activeStep === 2) {
      setActiveStep(3);
    }
  }, [activeStep, ribbonMode]);

  useEffect(() => {
    setSelection((previous) => {
      if (ribbonMode === 'pending') {
        return previous;
      }

      if (ribbonMode === 'none') {
        if (!previous.ribbon) return previous;
        return { ...previous, ribbon: null };
      }

      const nextRibbon = availableRibbonOptions.find((item) => String(item.id) === String(previous.ribbon?.id));

      if (nextRibbon) {
        return previous.ribbon === nextRibbon
          ? previous
          : { ...previous, ribbon: nextRibbon };
      }

      if (ribbonMode === 'palm-halo') {
        const defaultPalmHaloRibbon = availableRibbonOptions.find(isOptionSelectable) || availableRibbonOptions[0] || null;
        if (!defaultPalmHaloRibbon && !previous.ribbon) return previous;
        return { ...previous, ribbon: defaultPalmHaloRibbon };
      }

      if (!previous.ribbon) {
        return previous;
      }

      return { ...previous, ribbon: null };
    });
  }, [availableRibbonOptions, ribbonMode]);

  useEffect(() => {
    setSelection((previous) => {
      if (!Array.isArray(previous.flowers) || previous.flowers.length === 0) {
        return previous;
      }

      let changed = false;
      const nextFlowers = previous.flowers
        .map((selectedFlower) => {
          const latestFlower = flowers.find((item) => String(item.id) === String(selectedFlower.id));
          if (!latestFlower) {
            changed = true;
            return null;
          }

          if (latestFlower !== selectedFlower) {
            changed = true;
          }

          return latestFlower;
        })
        .filter(Boolean);

      if (!changed) {
        return previous;
      }

      const nextBundleSize = nextFlowers.length === 0 ? 0 : previous.bundleSize;

      return {
        ...previous,
        flowers: nextFlowers,
        bundleSize: nextBundleSize,
      };
    });
  }, [flowers]);

  useEffect(() => {
    setSelection((previous) => {
      if (!previous.wrapper) {
        return previous;
      }

      const latestWrapperGroup = wrappers.find((entry) => entry.id === previous.wrapper.groupId);
      if (!latestWrapperGroup) {
        return {
          ...previous,
          wrapper: null,
        };
      }

      const latestWrapper = latestWrapperGroup.variants.find((entry) => String(entry.id) === String(previous.wrapper.id))
        || latestWrapperGroup.variants.find(isOptionSelectable)
        || latestWrapperGroup.variants[0]
        || null;

      if (!latestWrapper) {
        return {
          ...previous,
          wrapper: null,
        };
      }

      return latestWrapper === previous.wrapper
        ? previous
        : { ...previous, wrapper: latestWrapper };
    });
  }, [wrappers]);

  const getMaxAllowedBundleSize = (selectedFlowers) => {
    if (!selectedFlowers || selectedFlowers.length === 0) return MAX_STEM_COUNT;
    const tempCounts = selectedFlowers.map(() => 0);
    let size = 0;
    while (size < MAX_STEM_COUNT) {
      const turn = size % selectedFlowers.length;
      if (tempCounts[turn] + 1 > selectedFlowers[turn].quantity) {
        break; // Ran out of stock for this flower
      }
      tempCounts[turn]++;
      size++;
    }
    return size;
  };
  const buildFlowerAllocations = (selectedFlowers, bundleSize) => {
    if (!Array.isArray(selectedFlowers) || selectedFlowers.length === 0 || !bundleSize) {
      return [];
    }

    const allocations = selectedFlowers.map((flower) => ({
      id: flower.id,
      name: flower.name,
      price: flower.price,
      quantity: 0,
    }));

    for (let index = 0; index < bundleSize; index += 1) {
      allocations[index % allocations.length].quantity += 1;
    }

    return allocations.filter((allocation) => allocation.quantity > 0);
  };

  const handleBundleSelect = (size) => {
    const maxAllowed = getMaxAllowedBundleSize(selection.flowers);
    if (size > maxAllowed) {
      setInfoModal({ show: true, title: 'Stock Limit Reached', message: `Based on your selected flowers, the maximum mathematically possible bundle size is ${maxAllowed} stems.` });
      setSelection((prev) => ({ ...prev, bundleSize: maxAllowed }));
      return;
    }
    setSelection((prev) => ({ ...prev, bundleSize: size }));
    setCustomBundleSizeInput(''); // Clear custom input when a predefined bundle is selected
  };

  const handleFlowerSizeSelect = (sizeId) => {
    const nextSize = getFlowerSizeOption(sizeId);
    setSelection((prev) => ({ ...prev, flowerSize: nextSize.id }));
  };

  const handleCustomBundleChange = (e) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return; // Only allow digits

    let numValue = value === '' ? 0 : parseInt(value, 10);
    let capped = false;

    const maxAllowed = Math.min(MAX_STEM_COUNT, getMaxAllowedBundleSize(selection.flowers));

    if (numValue > maxAllowed) {
      numValue = maxAllowed;
      capped = true;
    }

    setCustomBundleSizeInput(capped ? String(numValue) : value);

    if (numValue >= 2) {
      setSelection((prev) => ({ ...prev, bundleSize: numValue }));
    } else {
      setSelection((prev) => ({ ...prev, bundleSize: 0 }));
    }

    if (capped) {
      setInfoModal({
        show: true,
        title: 'Stem Limit Reached',
        message: `Your input has been adjusted to ${numValue} stems due to stock limits or maximum limits (${MAX_STEM_COUNT}).`,
      });
    }
  };

  const handleOptionSelect = (type, id) => {
    if (type === 'flowers') {
      const item = flowers.find((entry) => entry.id === id);
      if (!item) return;
      if (!isOptionSelectable(item)) {
        setInfoModal({ show: true, title: 'Unavailable', message: `${item.name} is currently unavailable for customized orders.` });
        return;
      }

      setSelection(prev => {
        const alreadySelected = prev.flowers.find(f => f.id === id);
        let newFlowers;
        if (alreadySelected) {
          newFlowers = prev.flowers.filter(f => f.id !== id);
        } else {
          if (prev.flowers.length >= 2) {
            setInfoModal({
              show: true,
              title: 'Flower Limit Reached',
              message: 'You can select up to 2 types of flowers.'
            });
            return prev;
          }
          newFlowers = [...prev.flowers, item];
        }

        const next = { ...prev, flowers: newFlowers };
        if (newFlowers.length > 0 && prev.bundleSize === 0) {
          next.bundleSize = 3;
        }
        if (newFlowers.length === 0) {
          next.bundleSize = 0;
        }

        if (newFlowers.length > 0 && next.bundleSize > 0) {
          const maxAllowed = getMaxAllowedBundleSize(newFlowers);
          if (next.bundleSize > maxAllowed) {
            setInfoModal({ show: true, title: 'Stock Adjusted', message: `Your bundle size was automatically reduced to ${maxAllowed} because your new flower selection has limited stock.` });
            next.bundleSize = maxAllowed;
            setCustomBundleSizeInput(maxAllowed < 2 ? '' : String(maxAllowed));
          }
        }

        return next;
      });
      return;
    }

    let item = null;
    if (type === 'ribbons') {
      item = availableRibbonOptions.find((entry) => String(entry.id) === String(id));
    }
    if (!item) return;
    if (!isOptionSelectable(item)) {
      setInfoModal({ show: true, title: 'Unavailable', message: `${item.name} is currently unavailable for customized orders.` });
      return;
    }
    setSelection((prev) => ({ ...prev, ribbon: item }));
  };

  const handleWrapperSelect = (groupId, variantId = null) => {
    const wrapperGroup = wrappers.find((entry) => entry.id === groupId);
    if (!wrapperGroup) return;

    const selectedVariant = variantId != null
      ? wrapperGroup.variants.find((entry) => String(entry.id) === String(variantId))
      : null;
    const activeVariant = selectedVariant
      || (selection.wrapper?.groupId === groupId
        ? wrapperGroup.variants.find((entry) => String(entry.id) === String(selection.wrapper.id))
        : null)
      || wrapperGroup.variants.find(isOptionSelectable)
      || wrapperGroup.variants[0];

    if (!activeVariant) return;
    if (!isOptionSelectable(activeVariant)) {
      setInfoModal({ show: true, title: 'Unavailable', message: `${activeVariant.name} is currently unavailable for customized orders.` });
      return;
    }

    setSelection((prev) => ({ ...prev, wrapper: activeVariant }));
    setActiveStep(getWrapperRibbonMode(activeVariant) === 'none' ? 3 : 2);
  };
  const openWrapperColorModal = (groupId) => {
    setWrapperColorModal({ open: true, groupId });
  };
  const closeWrapperColorModal = () => {
    setWrapperColorModal({ open: false, groupId: null });
  };
  const handleWrapperColorSelect = (groupId, variantId) => {
    handleWrapperSelect(groupId, variantId);
    closeWrapperColorModal();
  };
  const handleReset = () => {
    setSelection({ flowers: [], bundleSize: 0, wrapper: null, ribbon: null, flowerSize: DEFAULT_FLOWER_SIZE });
    closeWrapperColorModal();
    setActiveStep(1);
  };

  const totalPrice = useMemo(() => {
    let total = 0;
    if (selection.flowers.length > 0 && selection.bundleSize) {
      const avgFlowerPrice = selection.flowers.reduce((sum, f) => sum + f.price, 0) / selection.flowers.length;
      total += avgFlowerPrice * selection.bundleSize;
    }
    if (selection.wrapper) total += selection.wrapper.price;
    if (selection.ribbon) total += selection.ribbon.price;
    return total;
  }, [selection]);

  const selectedFlowerSize = useMemo(
    () => getFlowerSizeOption(selection.flowerSize),
    [selection.flowerSize]
  );
  const stemScale = useMemo(() => {
    const densityScale = selection.bundleSize <= 1
      ? 1
      : Math.max(0.52, 1 - Math.min(selection.bundleSize - 1, 24) * 0.02);
    return densityScale * selectedFlowerSize.multiplier;
  }, [selection.bundleSize, selectedFlowerSize.multiplier]);
  const flowerZoneConfig = useMemo(() => (
    getWrapperFlowerZoneConfig(selection.wrapper)
  ), [selection.wrapper]);
  const wrapperPreviewStyle = useMemo(() => (
    selection.wrapper
      ? getWrapperPreviewStyle(selection.wrapper)
      : getWrapperPreviewStyle(null)
  ), [selection.wrapper]);
  const ribbonPreviewConfig = useMemo(() => (
    getWrapperRibbonPreviewConfig(selection.wrapper)
  ), [selection.wrapper]);
  const flowerZoneLayouts = useMemo(() => {
    const zoneConfigs = Array.isArray(flowerZoneConfig.zones) && flowerZoneConfig.zones.length > 0
      ? flowerZoneConfig.zones
      : [flowerZoneConfig];
    const scaledStemHandleSize = STEM_HANDLE_SIZE * stemScale;

    return zoneConfigs.map((zoneConfig, zoneIndex) => {
      if (zoneConfig.mode === 'relative' && wrapperLayerBox) {
        const width = Math.max(wrapperLayerBox.width * zoneConfig.widthFactor, scaledStemHandleSize + 40);
        const height = Math.max(wrapperLayerBox.height * zoneConfig.heightFactor, scaledStemHandleSize + 40);

        return {
          id: zoneConfig.id || `flower-zone-${zoneIndex}`,
          left: wrapperLayerBox.left + (wrapperLayerBox.width * zoneConfig.leftFactor),
          top: wrapperLayerBox.top + (wrapperLayerBox.height * zoneConfig.topFactor),
          width,
          height,
          transform: 'none',
          shape: zoneConfig.shape || 'rectangle',
          stemShare: zoneConfig.stemShare,
          maxX: Math.max(width - scaledStemHandleSize, 0),
          maxY: Math.max(height - scaledStemHandleSize, 0),
        };
      }

      const width = zoneConfig.width ?? CLASSIC_FLOWER_ZONE_WIDTH;
      const height = zoneConfig.height ?? CLASSIC_FLOWER_ZONE_HEIGHT;

      return {
        id: zoneConfig.id || `flower-zone-${zoneIndex}`,
        left: zoneConfig.left ?? '50%',
        top: zoneConfig.top ?? 0,
        width,
        height,
        transform: zoneConfig.transform ?? 'translateX(-50%)',
        shape: zoneConfig.shape || 'rectangle',
        stemShare: zoneConfig.stemShare,
        maxX: Math.max(width - scaledStemHandleSize, 0),
        maxY: Math.max(height - scaledStemHandleSize, 0),
      };
    });
  }, [flowerZoneConfig, stemScale, wrapperLayerBox]);
  const stemZonePlan = useMemo(() => (
    buildStemZonePlan(selection.bundleSize, flowerZoneLayouts)
  ), [flowerZoneLayouts, selection.bundleSize]);
  const ribbonPreviewStyle = useMemo(() => {
    if (!selection.ribbon) {
      return null;
    }

    const baseStyle = selection.ribbon.previewStyle || {};

    if (ribbonPreviewConfig.mode === 'relative') {
      if (!wrapperLayerBox) {
        return {
          ...ribbonPreviewConfig.fallbackStyle,
          ...baseStyle,
        };
      }

      return {
        ...baseStyle,
        left: wrapperLayerBox.left + (wrapperLayerBox.width * ribbonPreviewConfig.leftFactor),
        top: wrapperLayerBox.top + (wrapperLayerBox.height * ribbonPreviewConfig.topFactor),
        width: wrapperLayerBox.width * ribbonPreviewConfig.widthFactor,
        transform: ribbonPreviewConfig.transform || baseStyle.transform || 'translate(-50%, -50%)',
      };
    }

    return baseStyle;
  }, [ribbonPreviewConfig, selection.ribbon, wrapperLayerBox]);
  const syncWrapperLayerBox = () => {
    if (!selection.wrapper || !previewRef.current || !wrapperLayerRef.current) {
      setWrapperLayerBox(null);
      return;
    }

    const stageRect = previewRef.current.getBoundingClientRect();
    const wrapperRect = wrapperLayerRef.current.getBoundingClientRect();

    setWrapperLayerBox({
      left: wrapperRect.left - stageRect.left,
      top: wrapperRect.top - stageRect.top,
      width: wrapperRect.width,
      height: wrapperRect.height,
    });
  };

  useEffect(() => {
    if (!selection.wrapper) {
      setWrapperLayerBox(null);
      return undefined;
    }

    const measure = () => {
      window.requestAnimationFrame(() => {
        syncWrapperLayerBox();
      });
    };

    measure();
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [selection.wrapper, wrapperPreviewStyle]);

  const handleAddToCart = async () => {
    if (selection.flowers.length < 1 || selection.flowers.length > 2 || !selection.bundleSize) {
      setInfoModal({
        show: true,
        title: 'Selection Needed',
        message: 'Please select 1 to 2 flower types and a bundle size.',
      });
      return;
    }

    if (selection.wrapper && selection.wrapper.quantity < 1) {
      setInfoModal({ show: true, title: 'Out of Stock', message: `The ${selection.wrapper.name} wrapper is out of stock.` });
      return;
    }

    if (selection.ribbon && selection.ribbon.quantity < 1) {
      setInfoModal({ show: true, title: 'Out of Stock', message: `The ${selection.ribbon.name} ribbon is out of stock.` });
      return;
    }

    if (ribbonMode !== 'none' && !selection.ribbon) {
      setInfoModal({
        show: true,
        title: 'Ribbon Needed',
        message: 'Please select a ribbon before adding this bouquet to your cart.',
      });
      return;
    }

    const maxAllowed = getMaxAllowedBundleSize(selection.flowers);
    if (selection.bundleSize > maxAllowed) {
      setInfoModal({ show: true, title: 'Check Stock', message: `Not enough flowers for a bundle of ${selection.bundleSize}. Max allowed stems based on current stock is ${maxAllowed}.` });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setInfoModal({
          show: true,
          title: 'Login Required',
          message: 'You need to be logged in to add Customizer Studio items to your cart.',
          linkTo: '/login',
          linkText: 'Log In'
        });
        return;
      }

      let photoBase64 = null;
      const previewComposition = buildSavedPreviewComposition({
        stageElement: previewRef.current,
        wrapperElement: wrapperLayerRef.current,
        ribbonElement: ribbonLayerRef.current,
        stemLayouts,
        flowerZoneLayouts,
        selection,
        stemScale,
      });
      if (previewRef.current) {
        try {
          const captureScale = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2.5);
          const canvas = await html2canvas(previewRef.current, {
            backgroundColor: null, scale: captureScale, logging: false, useCORS: true,
          });
          const croppedCanvas = cropCanvasToContent(canvas);
          photoBase64 = buildStorageFriendlySnapshot(croppedCanvas);
        } catch (canvasError) {
          console.error('Error capturing screenshot:', canvasError);
        }
      }

      const customizedBouquet = {
        id: `custom-${Date.now()}`,
        name: 'Customizer Studio',
        image: photoBase64,
        flowers: selection.flowers.map((flower) => ({
          id: flower.id,
          name: flower.name,
          price: flower.price,
          img: flower.img || null,
          layerImg: flower.layerImg || null,
          stemImg: flower.stemImg || null,
          quantity: flower.quantity || 0,
          is_available: flower.is_available !== false,
        })),
        flowerAllocations: buildFlowerAllocations(selection.flowers, selection.bundleSize),
        bundleSize: selection.bundleSize,
        wrapper: selection.wrapper ? {
          id: selection.wrapper.id,
          name: selection.wrapper.name,
          price: selection.wrapper.price,
          img: selection.wrapper.img || null,
          layerImg: selection.wrapper.layerImg || null,
          groupName: selection.wrapper.groupName,
          wrapper_group_name: selection.wrapper.wrapper_group_name || selection.wrapper.groupName || null,
          colorName: selection.wrapper.colorName || null,
          wrapper_color: selection.wrapper.wrapper_color || selection.wrapper.colorName || null,
          customization_config: selection.wrapper.customization_config || null,
          quantity: selection.wrapper.quantity || 0,
          is_available: selection.wrapper.is_available !== false,
        } : null,
        ribbon: selection.ribbon ? {
          id: selection.ribbon.id,
          name: selection.ribbon.name,
          price: selection.ribbon.price,
          img: selection.ribbon.img || null,
          layerImg: selection.ribbon.layerImg || null,
          previewStyle: selection.ribbon.previewStyle || null,
          ribbon_scope: selection.ribbon.ribbon_scope || null,
          colorName: selection.ribbon.colorName || null,
          stockLabel: selection.ribbon.stockLabel || null,
          quantity: selection.ribbon.quantity || 0,
          is_available: selection.ribbon.is_available !== false,
        } : null,
        previewComposition,
        flowerSize: selectedFlowerSize.id,
        flowerSizeLabel: selectedFlowerSize.label,
        price: totalPrice,
        qty: 1
      };

      const cartKey = `customizedCart_${session?.user?.id || 'guest'}`;
      const existingCart = JSON.parse(localStorage.getItem(cartKey) || '[]');
      const updatedCart = [...existingCart, customizedBouquet];
      persistCustomizedCart(cartKey, updatedCart);

      navigate('/cart', { state: { justAdded: 'customized' } });

    } catch (error) {
      console.error('Error adding to cart:', error);
      setInfoModal({
        show: true,
        title: 'Storage Full',
        message: error?.name === 'QuotaExceededError'
          ? 'Your browser storage is full for saved custom bouquets. Please remove older Customizer Studio drafts from the cart and try again.'
          : 'Error adding to cart. Please try again.',
      });
    }
  };

  useEffect(() => {
    if (selection.flowers.length === 0 || !selection.bundleSize || flowerZoneLayouts.length === 0) {
      setStemLayouts([]);
      setDraggingStemId(null);
      dragStateRef.current = null;
      return;
    }

    setStemLayouts((previousLayouts) => stemZonePlan.map((stemPlan, index) => {
      const zoneLayout = resolveZoneLayout(flowerZoneLayouts, stemPlan.zoneKey, stemPlan.zoneIndex);
      const previousLayout = previousLayouts[index];
      const shouldReusePosition = previousLayout?.zoneKey === stemPlan.zoneKey;
      const fallbackPosition = getStemPosition(
        stemPlan.zoneStemIndex,
        stemPlan.zoneStemCount,
        zoneLayout?.maxX ?? BASE_STEM_MAX_X,
        zoneLayout?.maxY ?? BASE_STEM_MAX_Y
      );
      const basePosition = shouldReusePosition
        ? previousLayout
        : fallbackPosition;
      const constrainedPosition = constrainStemToBounds({
        x: basePosition.x,
        y: basePosition.y,
        maxX: zoneLayout?.maxX ?? BASE_STEM_MAX_X,
        maxY: zoneLayout?.maxY ?? BASE_STEM_MAX_Y,
        zoneWidth: zoneLayout?.width ?? CLASSIC_FLOWER_ZONE_WIDTH,
        zoneHeight: zoneLayout?.height ?? CLASSIC_FLOWER_ZONE_HEIGHT,
        shape: zoneLayout?.shape || 'rectangle',
        handleWidth: STEM_HANDLE_SIZE * stemScale,
        handleHeight: STEM_HANDLE_SIZE * stemScale,
      });

      return {
        id: previousLayout?.id || `stem-${stemIdRef.current += 1}`,
        rotate: shouldReusePosition ? previousLayout.rotate : fallbackPosition.rotate,
        zIndex: previousLayout?.zIndex ?? (index + 1),
        zoneIndex: stemPlan.zoneIndex,
        zoneKey: stemPlan.zoneKey,
        x: constrainedPosition.x,
        y: constrainedPosition.y,
      };
    }));
  }, [flowerZoneLayouts, selection.bundleSize, selection.flowers.length, stemScale, stemZonePlan]);

  const isEmpty = selection.flowers.length === 0 && !selection.wrapper && !selection.ribbon;

  const formatPrice = (value) => `PHP ${value.toLocaleString('en-PH')}`;

  const releaseDraggedStem = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragStateRef.current = null;
      setDraggingStemId(null);
    }
  };

  const handleStemPointerDown = (stemId, index) => (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const layout = stemLayouts[index];
    const zoneLayout = resolveZoneLayout(flowerZoneLayouts, layout?.zoneKey, layout?.zoneIndex ?? 0);
    const targetRect = event.currentTarget.getBoundingClientRect();

    if (!layout || !zoneLayout) return;

    dragStateRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.x,
      originY: layout.y,
      zoneKey: zoneLayout.id,
      maxX: Math.max(zoneLayout.width - targetRect.width, 0),
      maxY: Math.max(zoneLayout.height - targetRect.height, 0),
      zoneWidth: zoneLayout.width,
      zoneHeight: zoneLayout.height,
      shape: zoneLayout.shape,
      handleWidth: targetRect.width,
      handleHeight: targetRect.height,
    };

    setDraggingStemId(stemId);
    setStemLayouts((previousLayouts) => previousLayouts.map((stemLayout, layoutIndex) => (
      layoutIndex === index
        ? { ...stemLayout, zIndex: previousLayouts.length + 1 }
        : stemLayout
    )));

    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handleStemPointerMove = (index) => (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.index !== index) return;

    const constrainedPosition = constrainStemToBounds({
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
      maxX: dragState.maxX,
      maxY: dragState.maxY,
      zoneWidth: dragState.zoneWidth,
      zoneHeight: dragState.zoneHeight,
      shape: dragState.shape,
      handleWidth: dragState.handleWidth,
      handleHeight: dragState.handleHeight,
    });

    setStemLayouts((previousLayouts) => previousLayouts.map((layout, layoutIndex) => (
      layoutIndex === index
        ? { ...layout, x: constrainedPosition.x, y: constrainedPosition.y }
        : layout
    )));

    event.preventDefault();
  };

  const renderOptions = (groupKey, selectedIds) => {
    let options = [];
    if (groupKey === 'flowers') {
      options = flowers;
    } else if (groupKey === 'ribbons') {
      if (ribbonMode === 'pending') {
        return <div className="no-options ribbon-helper">Select a wrapper first to see matching ribbon options.</div>;
      }
      options = availableRibbonOptions;
    }

    if (loadingCustomizationData) {
      return <div className="loading-indicator">Loading options...</div>;
    }
    if (options.length === 0) {
      if (groupKey === 'ribbons' && ribbonMode === 'palm-halo') {
        return <div className="no-options ribbon-helper">No Palm Halo ribbon colors are ready yet.</div>;
      }
      return <div className="no-options">No {groupKey} available.</div>;
    }

    const isMultiSelect = Array.isArray(selectedIds);

    return (
      <div className="grid-options" id={`${groupKey}Options`}>
        {options.map((item) => {
          const isSelected = isMultiSelect ? selectedIds.includes(item.id) : selectedIds === item.id;
          const isSelectable = isOptionSelectable(item);
          const stockLabel = getOptionStockLabel(item);

          return (
            <button
              key={item.id}
              type="button"
              className={`option-card ${isSelected ? "selected" : ""} ${!isSelectable ? "disabled" : ""}`}
              onClick={() => handleOptionSelect(groupKey, item.id)}
              disabled={!isSelectable}
              aria-disabled={!isSelectable}
            >
              <img src={item.img || placeholderImg} alt={item.name} className="option-img" />
              <div className="option-name">{item.name}</div>
              <div className="option-price">{getOptionPriceText(item, groupKey, formatPrice)}</div>
              <div className={`option-stock ${!isSelectable ? "danger" : (item.quantity <= 5 ? "warning" : "")}`}>{stockLabel}</div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderWrapperOptions = () => {
    if (loadingCustomizationData) {
      return <div className="loading-indicator">Loading options...</div>;
    }
    if (wrappers.length === 0) {
      return <div className="no-options">No wrappers available.</div>;
    }

    return (
      <div className="grid-options" id="wrappersOptions">
        {wrappers.map((group) => {
          const selectedVariant = selection.wrapper?.groupId === group.id
            ? group.variants.find((entry) => String(entry.id) === String(selection.wrapper.id)) || selection.wrapper
            : null;
          const previewVariant = selectedVariant || group.variants.find(isOptionSelectable) || group.variants[0];
          const isSelected = Boolean(selectedVariant);
          const isSelectable = group.variants.some(isOptionSelectable);
          const hasColorOptions = group.variants.length > 1;

          return (
            <div
              key={group.id}
              className={`option-card wrapper-card ${hasColorOptions ? 'has-colors' : ''} ${isSelected ? 'selected' : ''} ${!isSelectable ? 'disabled' : ''}`}
              role="button"
              tabIndex={isSelectable ? 0 : -1}
              aria-disabled={!isSelectable}
              onClick={() => {
                if (isSelectable) handleWrapperSelect(group.id);
              }}
              onKeyDown={(event) => {
                if (!isSelectable) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleWrapperSelect(group.id);
                }
              }}
            >
              <img src={previewVariant?.img || group.img || placeholderImg} alt={group.name} className="option-img" />
              <div className="option-name">{group.name}</div>
              {group.variants.length > 1 && (
                <div className="option-variant">
                  {selectedVariant?.colorName ? `Color: ${selectedVariant.colorName}` : `${group.variants.length} colors available`}
                </div>
              )}
              <div className="option-price">+{formatPrice(previewVariant?.price || 0)}</div>
              <div className={`option-stock ${!isSelectable ? 'danger' : ((previewVariant?.quantity || 0) <= 5 && !previewVariant?.stockLabel ? 'warning' : '')}`}>
                {previewVariant ? getOptionStockLabel(previewVariant) : 'Unavailable'}
              </div>

              {hasColorOptions && (
                <button
                  type="button"
                  className="wrapper-color-trigger"
                  onClick={(event) => {
                    event.stopPropagation();
                    openWrapperColorModal(group.id);
                  }}
                >
                  Select Color
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  const activeWrapperColorGroup = wrapperColorModal.groupId
    ? wrappers.find((entry) => entry.id === wrapperColorModal.groupId) || null
    : null;
  const customizedStudioPromo = evaluateStandaloneFreeShippingPromo(totalPrice, customizedStudioPromoSettings);
  const ribbonPanelTitle = ribbonMode === 'palm-halo' ? 'Palm Halo Ribbon' : 'Pick Ribbon';
  const ribbonPanelSubtitle = ribbonMode === 'palm-halo'
    ? 'Palm Halo uses its own bow colors.'
    : 'Add the finishing touch';
  const ribbonPanelLabel = ribbonMode === 'palm-halo' ? 'Palm Halo Bow Color' : 'Ribbon Color';

  return (
    <div className="customize-page">
      <header className="app-header">
        <div className="header-left">
          <Link to="/" className="back-link">
            <FaChevronLeft /> Back
          </Link>
          <span className="divider" />
          <h3>Customizer Studio</h3>
        </div>
        <div className="header-right">
          <button type="button" className="back-link border-0 bg-transparent" onClick={handleReset}>
            <FaArrowRotateLeft /> Reset
          </button>
          <div className="price-display">
            <span className="label">Total</span>
            <span className="amount">{formatPrice(totalPrice)}</span>
          </div>
          <button type="button" className="btn-action header-cart-btn" onClick={handleAddToCart}>Add to Cart</button>
        </div>
      </header>


      {/* Mobile floating Add to Cart button */}
      <div className="mobile-add-to-cart-bar">
        <div className="mobile-cart-price">
          <span className="mobile-cart-label">Total</span>
          <span className="mobile-cart-amount">{formatPrice(totalPrice)}</span>
        </div>
        <button type="button" className="mobile-cart-btn" onClick={handleAddToCart}>
          <i className="fas fa-shopping-cart" style={{ marginRight: '0.5rem' }}></i>
          Add to Cart
        </button>
      </div>

      <InfoModal
        show={infoModal.show}
        onClose={() => setInfoModal({ show: false, title: '', message: '' })}
        title={infoModal.title}
        message={infoModal.message}
        linkTo={infoModal.linkTo}
        linkText={infoModal.linkText}
        linkState={infoModal.linkState}
      />

      {customizedStudioPromo.isConfigured && (
        <div className="customized-promo-banner">
          <div className="customized-promo-banner-copy">
            <p className="mb-1">
              {customizedStudioPromo.qualifies
                ? 'Your current bouquet already qualifies for free delivery'
                : `Free delivery from ${formatPrice(customizedStudioPromo.minimumOrderAmount)}`}
            </p>
          </div>
          {!customizedStudioPromo.qualifies && customizedStudioPromo.amountRemaining > 0 ? (
            <strong>Need {formatPrice(customizedStudioPromo.amountRemaining)} more</strong>
          ) : (
            <strong>Promo Ready</strong>
          )}
        </div>
      )}

      {wrapperColorModal.open && activeWrapperColorGroup && (
        <div className="wrapper-color-modal-backdrop" onClick={closeWrapperColorModal}>
          <div className="wrapper-color-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wrapper-color-modal-header">
              <div>
                <h4>{activeWrapperColorGroup.name}</h4>
                <p>Choose a color variation for this wrapper.</p>
              </div>
              <button type="button" className="wrapper-color-modal-close" onClick={closeWrapperColorModal}>
                ×
              </button>
            </div>

            <div className="wrapper-color-modal-grid">
              {activeWrapperColorGroup.variants.map((variant) => {
                const isVariantSelected = selection.wrapper?.id === variant.id;
                const isVariantSelectable = isOptionSelectable(variant);

                return (
                  <button
                    key={variant.id}
                    type="button"
                    className={`wrapper-color-pill modal-pill ${isVariantSelected ? 'selected' : ''}`}
                    onClick={() => handleWrapperColorSelect(activeWrapperColorGroup.id, variant.id)}
                    disabled={!isVariantSelectable}
                  >
                    <span className="wrapper-color-swatch" style={{ backgroundColor: variant.swatch }} />
                    <span className="wrapper-color-pill-text">
                      <strong>{variant.colorName}</strong>
                      <small>{getOptionStockLabel(variant)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="editor-layout">
        <section className="preview-canvas">
          <div className="canvas-container">
            <div className="bouquet-stage" ref={previewRef}>
              {selection.wrapper && (
                <img
                  ref={wrapperLayerRef}
                  src={selection.wrapper.layerImg || selection.wrapper.img || placeholderImg}
                  alt="Wrapper"
                  className="layer"
                  onLoad={() => syncWrapperLayerBox()}
                  style={{ zIndex: 1, ...wrapperPreviewStyle }}
                />
              )}

              {flowerZoneLayouts.map((zoneLayout) => (
                <div
                  key={zoneLayout.id}
                  className="flower-zone"
                  data-zone-id={zoneLayout.id}
                  style={{
                    position: 'absolute',
                    top: zoneLayout.top,
                    left: zoneLayout.left,
                    width: zoneLayout.width,
                    height: zoneLayout.height,
                    transform: zoneLayout.transform,
                    zIndex: 2,
                    touchAction: 'none'
                  }}
                >
                  {stemLayouts.map((slot, index) => {
                    if (slot.zoneKey !== zoneLayout.id) {
                      return null;
                    }

                    const flowerIndex = index % selection.flowers.length;
                    const flower = selection.flowers[flowerIndex];
                    const stemImage = flower?.stemImg || flower?.layerImg || placeholderStemImg;

                    return (
                      <div
                        key={slot.id}
                        className={`drag-handle ${draggingStemId === slot.id ? 'is-dragging' : ''}`}
                        data-stem-id={slot.id}
                        style={{
                          position: 'absolute',
                          left: slot.x,
                          top: slot.y,
                          zIndex: slot.zIndex,
                          transform: `scale(${stemScale})`,
                          transformOrigin: 'center center'
                        }}
                        onPointerDown={handleStemPointerDown(slot.id, index)}
                        onPointerMove={handleStemPointerMove(index)}
                        onPointerUp={releaseDraggedStem}
                        onPointerCancel={releaseDraggedStem}
                        onLostPointerCapture={releaseDraggedStem}
                      >
                        <div style={{ transform: `rotate(${slot.rotate}deg)`, width: '100%', height: '100%' }}>
                          <img src={stemImage} alt="Selected stem" className="stem-slot" draggable="false" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {selection.ribbon && (
                <img
                  ref={ribbonLayerRef}
                  src={selection.ribbon.layerImg || selection.ribbon.img || placeholderImg}
                  alt="Ribbon"
                  className="layer"
                  style={{ zIndex: 3, top: '65%', ...(ribbonPreviewStyle || {}) }}
                />
              )}

              {isEmpty && (
                <div className="empty-state">
                  <FaSeedling size={48} />
                  <p>Select a flower to start</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="tools-interface">
          <nav className="vertical-toolbar">
            {visibleSteps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`tool-btn ${activeStep === step.id ? 'active' : ''}`}
                onClick={() => setActiveStep(step.id)}
              >
                <div className="icon-wrapper">{step.icon}</div>
                <span>{step.label}</span>
              </button>
            ))}
          </nav>

          <div className="options-panel">
            <div className={`panel-content ${activeStep === 1 ? 'active' : ''}`} id="step1">
              <div className="panel-header">
                <h4>Select Wrapper</h4>
                <p>Wrap it with style</p>
              </div>
              <div className="control-group">
                <label>Wrapper Style</label>
                {renderWrapperOptions()}
              </div>
            </div>

            {ribbonMode !== 'none' && (
              <div className={`panel-content ${activeStep === 2 ? 'active' : ''}`} id="step2">
                <div className="panel-header">
                  <h4>{ribbonPanelTitle}</h4>
                  <p>{ribbonPanelSubtitle}</p>
                </div>
                <div className="control-group">
                  <label>{ribbonPanelLabel}</label>
                  {renderOptions('ribbons', selection.ribbon?.id || null)}
                </div>
              </div>
            )}

            <div className={`panel-content ${activeStep === 3 ? 'active' : ''}`} id="step3">
              <div className="panel-header">
                <h4>Choose Flowers</h4>
                <p>Select your base blooms</p>
              </div>

              <div className="control-group">
                <label>Bundle Size</label>
                <div className="bundle-selector-group">
                  {bundleOptions.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`bundle-pill ${selection.bundleSize === size && customBundleSizeInput === '' ? 'active' : ''}`}
                      onClick={() => handleBundleSelect(size)}
                    >
                      {size} Stems
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <label>Flower Size</label>
                <div className="flower-size-selector-group">
                  {FLOWER_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`flower-size-pill ${selectedFlowerSize.id === option.id ? 'active' : ''}`}
                      onClick={() => handleFlowerSizeSelect(option.id)}
                      aria-pressed={selectedFlowerSize.id === option.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* New Custom Stems Input */}
              <div className="control-group">
                <label>Custom Stems</label>
                <div className="custom-bundle-input-card">
                  <input
                    type="number"
                    min="2"
                    step="1"
                    value={customBundleSizeInput}
                    onChange={handleCustomBundleChange}
                    placeholder="e.g. 2"
                    className="custom-stem-input"
                  />

                </div>
              </div>

              <div className="control-group">
                <label>Flower Type</label>
                {renderOptions('flowers', selection.flowers.map(f => f.id))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Customized;
