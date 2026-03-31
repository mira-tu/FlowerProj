export const RIBBON_SCOPE = Object.freeze({
  CLASSIC_BOUQUET: 'classic_bouquet',
  PALM_HALO_WRAP: 'palm_halo_wrap',
});

const WRAPPER_RIBBON_MODES = Object.freeze({
  'Leaf Arch Wrap': 'none',
  'Leaf Fan Wrap': 'none',
  'Palm Halo Wrap': 'palm-halo',
});

const NATURAL_WRAPPER_NAMES = new Set([
  'Leaf Arch Wrap',
  'Leaf Fan Wrap',
  'Palm Halo Wrap',
]);
const DEFAULT_WRAPPER_PREVIEW_STYLE = Object.freeze({
  width: '84%',
  maxHeight: '86%',
  top: 'auto',
  bottom: '2%',
  transform: 'translateX(-50%)',
});
const WRAPPER_PREVIEW_STYLES = Object.freeze({
  'Palm Halo Wrap': {
    width: 'auto',
    height: '100%',
    maxWidth: '116%',
    maxHeight: '116%',
    top: 'auto',
    bottom: '-4%',
    transform: 'translateX(-50%) scale(1.24)',
  },
});
const DEFAULT_WRAPPER_RIBBON_PREVIEW_CONFIG = Object.freeze({
  mode: 'default',
  fallbackStyle: {},
});
const WRAPPER_RIBBON_PREVIEW_CONFIGS = Object.freeze({
  'Palm Halo Wrap': {
    mode: 'relative',
    leftFactor: 0.5,
    topFactor: 0.47,
    widthFactor: 0.46,
    transform: 'translate(-50%, -50%)',
    fallbackStyle: {
      top: '58%',
      left: '50%',
      width: '30%',
      transform: 'translate(-50%, -50%)',
    },
  },
});
const DEFAULT_FLOWER_ZONE_CONFIG = Object.freeze({
  mode: 'fixed',
  left: '50%',
  top: 0,
  width: 320,
  height: 250,
  transform: 'translateX(-50%)',
  shape: 'rectangle',
});
const WRAPPER_FLOWER_ZONE_CONFIGS = Object.freeze({
  'Classic Wrap': DEFAULT_FLOWER_ZONE_CONFIG,
  'Leaf Arch Wrap': {
    mode: 'relative',
    leftFactor: 0.08,
    topFactor: 0.13,
    widthFactor: 0.82,
    heightFactor: 0.64,
    shape: 'ellipse',
  },
  'Leaf Fan Wrap': {
    mode: 'relative',
    leftFactor: 0.02,
    topFactor: 0.08,
    widthFactor: 0.96,
    heightFactor: 0.68,
    shape: 'ellipse',
  },
  'Palm Halo Wrap': {
    zones: [
      {
        id: 'palm-halo-top',
        mode: 'relative',
        leftFactor: 0.07,
        topFactor: 0.02,
        widthFactor: 0.86,
        heightFactor: 0.54,
        shape: 'ellipse',
        stemShare: 0.72,
      },
      {
        id: 'palm-halo-bottom',
        mode: 'relative',
        leftFactor: 0.05,
        topFactor: 0.73,
        widthFactor: 0.7,
        heightFactor: 0.28,
        shape: 'ellipse',
        stemShare: 0.28,
      },
    ],
  },
});
const WRAPPER_CROP_PADDING = 16;

const DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE = Object.freeze({
  top: '58%',
  left: '50%',
  width: '30%',
  transform: 'translate(-50%, -50%)',
});
const PALM_HALO_VARIANTS = Object.freeze([
  {
    id: 'palm-halo-ribbon-pearl-white',
    label: 'Pearl White',
    tintHex: null,
    swatch: '#f2ede6',
  },
  {
    id: 'palm-halo-ribbon-blush-pink',
    label: 'Blush Pink',
    tintHex: '#d28aa2',
    swatch: '#d28aa2',
  },
  {
    id: 'palm-halo-ribbon-sage-green',
    label: 'Sage Green',
    tintHex: '#7b9b74',
    swatch: '#7b9b74',
  },
]);

const BACKGROUND_TOLERANCE = 34;
const EDGE_PADDING = 10;

const normalizeText = (value) => String(value || '').trim();
const parseCustomizationConfig = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};
const getWrapperCustomizationConfig = (wrapper) => parseCustomizationConfig(
  wrapper?.wrapper_behavior
  || wrapper?.customizer_metadata
  || wrapper?.customization_config
  || wrapper?.customizationConfig
  || null
);
const getItemCustomizationConfig = (item) => parseCustomizationConfig(
  item?.wrapper_behavior
  || item?.customizer_metadata
  || item?.customization_config
  || item?.customizationConfig
  || null
);

export const normalizeRibbonScope = (value) => {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (
    !normalized
    || normalized === 'classic'
    || normalized === 'classic_wrap'
    || normalized === 'classic_bouquet'
  ) {
    return RIBBON_SCOPE.CLASSIC_BOUQUET;
  }

  if (
    normalized === 'palm_halo'
    || normalized === 'palm_halo_wrap'
    || normalized === 'palmhalo'
  ) {
    return RIBBON_SCOPE.PALM_HALO_WRAP;
  }

  return normalized;
};

export const getRibbonScopeLabel = (value) => {
  const scope = normalizeRibbonScope(value);

  if (scope === RIBBON_SCOPE.PALM_HALO_WRAP) {
    return 'Palm Halo Wrap';
  }

  return 'Classic Bouquet';
};

export const getWrapperRibbonMode = (wrapper) => {
  const customizationConfig = getWrapperCustomizationConfig(wrapper);
  if (typeof customizationConfig.ribbonMode === 'string' && customizationConfig.ribbonMode.trim()) {
    return customizationConfig.ribbonMode.trim();
  }

  const groupName = normalizeText(
    wrapper?.groupName || wrapper?.wrapper_group_name || wrapper?.name
  );

  if (!groupName) {
    return 'pending';
  }

  return WRAPPER_RIBBON_MODES[groupName] || 'classic';
};

export const getWrapperPreviewStyle = (wrapper) => {
  const customizationConfig = getWrapperCustomizationConfig(wrapper);
  if (customizationConfig.previewStyle && typeof customizationConfig.previewStyle === 'object') {
    return customizationConfig.previewStyle;
  }

  const groupName = normalizeText(
    wrapper?.groupName || wrapper?.wrapper_group_name || wrapper?.name
  );

  return WRAPPER_PREVIEW_STYLES[groupName] || DEFAULT_WRAPPER_PREVIEW_STYLE;
};

export const getWrapperRibbonPreviewConfig = (wrapper) => {
  const customizationConfig = getWrapperCustomizationConfig(wrapper);
  if (customizationConfig.ribbonPreviewConfig && typeof customizationConfig.ribbonPreviewConfig === 'object') {
    return customizationConfig.ribbonPreviewConfig;
  }

  const groupName = normalizeText(
    wrapper?.groupName || wrapper?.wrapper_group_name || wrapper?.name
  );

  return WRAPPER_RIBBON_PREVIEW_CONFIGS[groupName] || DEFAULT_WRAPPER_RIBBON_PREVIEW_CONFIG;
};

export const getWrapperFlowerZoneConfig = (wrapper) => {
  const customizationConfig = getWrapperCustomizationConfig(wrapper);
  if (customizationConfig.flowerZoneConfig && typeof customizationConfig.flowerZoneConfig === 'object') {
    return customizationConfig.flowerZoneConfig;
  }

  const groupName = normalizeText(
    wrapper?.groupName || wrapper?.wrapper_group_name || wrapper?.name
  );

  return WRAPPER_FLOWER_ZONE_CONFIGS[groupName] || DEFAULT_FLOWER_ZONE_CONFIG;
};

const cropTransparentImage = (sourceUrl) => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !sourceUrl) {
    resolve(sourceUrl);
    return;
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (data[offset + 3] === 0) {
            continue;
          }

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      if (maxX < minX || maxY < minY) {
        resolve(sourceUrl);
        return;
      }

      const cropX = Math.max(minX - WRAPPER_CROP_PADDING, 0);
      const cropY = Math.max(minY - WRAPPER_CROP_PADDING, 0);
      const cropWidth = Math.min((maxX - minX + 1) + WRAPPER_CROP_PADDING * 2, canvas.width - cropX);
      const cropHeight = Math.min((maxY - minY + 1) + WRAPPER_CROP_PADDING * 2, canvas.height - cropY);

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;

      const croppedContext = croppedCanvas.getContext('2d');
      croppedContext.drawImage(
        canvas,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      resolve(croppedCanvas.toDataURL('image/png'));
    } catch (error) {
      resolve(sourceUrl);
    }
  };
  image.onerror = () => resolve(sourceUrl);
  image.src = sourceUrl;
});

export const applyNaturalWrapperPreviewCropping = async (wrapperGroups = []) => {
  const groups = Array.isArray(wrapperGroups) ? wrapperGroups : [];

  return Promise.all(groups.map(async (group) => {
    const customizationConfig = getWrapperCustomizationConfig(group);
    const shouldCrop = customizationConfig.cropTransparentPreview === true
      || NATURAL_WRAPPER_NAMES.has(normalizeText(group?.name));

    if (!shouldCrop) {
      return group;
    }

    const croppedLayer = await cropTransparentImage(group.layerImg || group.img);

    return {
      ...group,
      layerImg: croppedLayer,
      variants: (group.variants || []).map((variant) => ({
        ...variant,
        layerImg: croppedLayer,
      })),
    };
  }));
};

const sampleBackgroundColor = (data, width, height) => {
  const samplePoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
  ];

  const totals = samplePoints.reduce((accumulator, [x, y]) => {
    const offset = (y * width + x) * 4;
    return {
      r: accumulator.r + data[offset],
      g: accumulator.g + data[offset + 1],
      b: accumulator.b + data[offset + 2],
    };
  }, { r: 0, g: 0, b: 0 });

  return {
    r: totals.r / samplePoints.length,
    g: totals.g / samplePoints.length,
    b: totals.b / samplePoints.length,
  };
};

const colorDistance = (r, g, b, background) => Math.sqrt(
  ((r - background.r) ** 2)
  + ((g - background.g) ** 2)
  + ((b - background.b) ** 2)
);

const removeWhiteBackground = (sourceImage) => {
  const canvas = document.createElement('canvas');
  canvas.width = sourceImage.naturalWidth || sourceImage.width;
  canvas.height = sourceImage.naturalHeight || sourceImage.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceImage, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const background = sampleBackgroundColor(data, width, height);
  const masked = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const shouldMaskPixel = (index) => {
    const offset = index * 4;
    const alpha = data[offset + 3];

    if (alpha === 0) {
      return true;
    }

    return colorDistance(data[offset], data[offset + 1], data[offset + 2], background) <= BACKGROUND_TOLERANCE;
  };

  const enqueue = (index) => {
    if (masked[index] || !shouldMaskPixel(index)) {
      return;
    }

    masked[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;

    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index]) {
      data[index * 4 + 3] = 0;
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  context.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  const cropCanvas = document.createElement('canvas');
  const cropWidth = Math.max((maxX - minX + 1) + EDGE_PADDING * 2, 1);
  const cropHeight = Math.max((maxY - minY + 1) + EDGE_PADDING * 2, 1);
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;

  const cropContext = cropCanvas.getContext('2d');
  cropContext.drawImage(
    canvas,
    minX,
    minY,
    maxX - minX + 1,
    maxY - minY + 1,
    EDGE_PADDING,
    EDGE_PADDING,
    maxX - minX + 1,
    maxY - minY + 1
  );

  return cropCanvas;
};

const hexToRgb = (hex) => {
  const normalized = String(hex || '').replace('#', '').trim();

  if (normalized.length !== 6) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHsl = (r, g, b) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);

    switch (max) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
        break;
    }

    hue /= 6;
  }

  return { h: hue, s: saturation, l: lightness };
};

const hueToRgb = (p, q, t) => {
  let value = t;

  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
};

const hslToRgb = (h, s, l) => {
  if (s === 0) {
    const channel = Math.round(l * 255);
    return { r: channel, g: channel, b: channel };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
};

const tintRibbonCanvas = (sourceCanvas, tintHex) => {
  const tint = hexToRgb(tintHex);

  if (!tint) {
    return sourceCanvas.toDataURL('image/png');
  }

  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const tintHue = rgbToHsl(tint.r, tint.g, tint.b).h;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) {
      continue;
    }

    const current = rgbToHsl(data[offset], data[offset + 1], data[offset + 2]);
    const isRibbonFabric = current.s < 0.2 && current.l > 0.22 && current.l < 0.96;

    if (!isRibbonFabric) {
      continue;
    }

    const recolored = hslToRgb(
      tintHue,
      Math.max(0.24, current.s + 0.36),
      current.l
    );

    data[offset] = Math.round(recolored.r * 0.92 + data[offset] * 0.08);
    data[offset + 1] = Math.round(recolored.g * 0.92 + data[offset + 1] * 0.08);
    data[offset + 2] = Math.round(recolored.b * 0.92 + data[offset + 2] * 0.08);
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const buildPalmHaloRibbonFallbackItem = (item, sourceUrl) => {
  const customizationConfig = getItemCustomizationConfig(item);

  return {
    ...item,
    img: sourceUrl || item?.img || item?.layerImg || null,
    layerImg: sourceUrl || item?.layerImg || item?.img || null,
    colorName: item?.colorName || customizationConfig.colorName || null,
    swatch: item?.swatch || customizationConfig.swatch || null,
    stockLabel: item?.stockLabel || customizationConfig.stockLabel || 'Included with Palm Halo Wrap',
    previewStyle: item?.previewStyle || customizationConfig.previewStyle || DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE,
  };
};

export const buildPalmHaloRibbonOptions = (sourceUrl) => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !sourceUrl) {
    resolve([]);
    return;
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const cutoutCanvas = removeWhiteBackground(image);
      const options = PALM_HALO_VARIANTS.map((variant) => {
        const renderedUrl = variant.tintHex
          ? tintRibbonCanvas(cutoutCanvas, variant.tintHex)
          : cutoutCanvas.toDataURL('image/png');

        return {
          id: variant.id,
          name: `Palm Halo Ribbon (${variant.label})`,
          colorName: variant.label,
          price: 0,
          img: renderedUrl,
          layerImg: renderedUrl,
          quantity: 999,
          is_available: true,
          ribbon_scope: RIBBON_SCOPE.PALM_HALO_WRAP,
          stockLabel: 'Included with Palm Halo Wrap',
          swatch: variant.swatch,
          previewStyle: DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE,
        };
      });

      resolve(options);
    } catch (error) {
      resolve(
        PALM_HALO_VARIANTS.map((variant) => ({
          id: variant.id,
          name: `Palm Halo Ribbon (${variant.label})`,
          colorName: variant.label,
          price: 0,
          img: sourceUrl,
          layerImg: sourceUrl,
          quantity: 999,
          is_available: true,
          ribbon_scope: RIBBON_SCOPE.PALM_HALO_WRAP,
          stockLabel: 'Included with Palm Halo Wrap',
          swatch: variant.swatch,
          previewStyle: DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE,
        }))
      );
    }
  };
  image.onerror = () => resolve([]);
  image.src = sourceUrl;
});

export const buildPalmHaloRibbonStockOptions = (stockOptions = [], sourceUrl) => new Promise((resolve) => {
  const normalizedOptions = Array.isArray(stockOptions) ? stockOptions.filter(Boolean) : [];
  if (!normalizedOptions.length) {
    resolve([]);
    return;
  }

  const primarySourceUrl = normalizedOptions.find((item) => item?.img || item?.layerImg)?.img
    || normalizedOptions.find((item) => item?.layerImg || item?.img)?.layerImg
    || sourceUrl;

  if (typeof window === 'undefined' || typeof document === 'undefined' || !primarySourceUrl) {
    resolve(normalizedOptions.map((item) => buildPalmHaloRibbonFallbackItem(item, primarySourceUrl || sourceUrl)));
    return;
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    try {
      const cutoutCanvas = removeWhiteBackground(image);
      const options = normalizedOptions.map((item) => {
        const customizationConfig = getItemCustomizationConfig(item);
        const tintHex = typeof customizationConfig.tintHex === 'string' && customizationConfig.tintHex.trim()
          ? customizationConfig.tintHex.trim()
          : null;
        const renderedUrl = tintHex
          ? tintRibbonCanvas(cutoutCanvas, tintHex)
          : cutoutCanvas.toDataURL('image/png');

        return {
          ...item,
          img: renderedUrl,
          layerImg: renderedUrl,
          colorName: item?.colorName || customizationConfig.colorName || null,
          swatch: item?.swatch || customizationConfig.swatch || null,
          stockLabel: item?.stockLabel || customizationConfig.stockLabel || 'Included with Palm Halo Wrap',
          previewStyle: item?.previewStyle || customizationConfig.previewStyle || DEFAULT_PALM_HALO_RIBBON_PREVIEW_STYLE,
        };
      });

      resolve(options);
    } catch (error) {
      resolve(normalizedOptions.map((item) => buildPalmHaloRibbonFallbackItem(item, primarySourceUrl)));
    }
  };
  image.onerror = () => resolve(normalizedOptions.map((item) => buildPalmHaloRibbonFallbackItem(item, sourceUrl)));
  image.src = primarySourceUrl;
});
