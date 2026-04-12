import React, { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { formatTimestamp, getPaymentStatusDisplay, getStatusColor, getStatusLabel } from '../adminHelpers';
import PaymentDetailsSection from '../components/PaymentDetailsSection';
import { generateAndShareReceipt } from '../../../utils/receiptGenerator';
import {
  DELIVERY_CONFIRMATION_OWNER,
  DELIVERY_CONFIRMATION_STATUS,
  getDeliveryStopDisplayLabel,
  groupDeliveryDestinations,
  hasStopConfirmationFlow,
  normalizeDeliveryDestinations,
} from '../../../utils/deliveryDestinations';
import { filterRequestForAssignedRider, shouldRestrictRequestToAssignedRider } from '../../../utils/riderAssignmentFilter';
import {
  getCustomOrderQuoteTypeLabel,
  normalizeCustomOrderQuoteLineItems,
  normalizeCustomOrderQuoteType,
} from '../../../utils/customOrderQuoteBreakdown';

const DetailSection = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
};

const parseCurrencyNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTentativePeso = (value) => `PHP ${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

const formatTentativeRange = (min, max, note = '') => {
  const safeMin = parseCurrencyNumber(min);
  const safeMaxCandidate = parseCurrencyNumber(max);
  const safeMax = safeMaxCandidate < safeMin ? safeMin : safeMaxCandidate;
  const trimmedNote = String(note || '').trim();

  if (safeMin <= 0 && safeMax <= 0) {
    return '';
  }

  const rangeText = safeMax > safeMin
    ? `${formatTentativePeso(safeMin)}-${formatTentativePeso(safeMax)}`
    : formatTentativePeso(Math.max(safeMin, safeMax));

  return trimmedNote ? `${rangeText} ${trimmedNote}` : rangeText;
};

const getTentativeBreakdown = (item = {}) => {
  const storedBreakdown = item?.tentativeBreakdown || item?.tentative_breakdown || {};
  const sourceLineItems = Array.isArray(storedBreakdown?.lineItems)
    ? storedBreakdown.lineItems
    : Array.isArray(storedBreakdown?.line_items)
      ? storedBreakdown.line_items
      : Array.isArray(item?.arrangementSelections)
        ? item.arrangementSelections
        : [];

  const lineItems = sourceLineItems
    .map((entry, index) => {
      const label = String(
        entry?.label
        || entry?.arrangementLabel
        || entry?.arrangement_label
        || entry?.arrangementType
        || entry?.arrangement_type
        || ''
      ).trim();

      if (!label) return null;

      const quantity = toPositiveInt(entry?.quantity || entry?.arrangement_quantity, 1);
      const unitMin = parseCurrencyNumber(entry?.unitMin ?? entry?.estimatedPriceMin ?? entry?.estimated_price_min);
      const unitMaxCandidate = parseCurrencyNumber(entry?.unitMax ?? entry?.estimatedPriceMax ?? entry?.estimated_price_max);
      const unitMax = unitMaxCandidate < unitMin ? unitMin : unitMaxCandidate;
      const lineMin = parseCurrencyNumber(entry?.lineMin ?? entry?.tentativeSubtotalMin ?? entry?.tentative_subtotal_min);
      const lineMaxCandidate = parseCurrencyNumber(entry?.lineMax ?? entry?.tentativeSubtotalMax ?? entry?.tentative_subtotal_max);
      const lineMax = lineMaxCandidate < lineMin ? lineMin : lineMaxCandidate;
      const note = String(entry?.note ?? entry?.estimatedPriceNote ?? entry?.estimated_price_note ?? '').trim();
      const hasEstimate = unitMin > 0 || unitMax > 0 || lineMin > 0 || lineMax > 0;

      return {
        key: `${label}-${index}`,
        label,
        quantity,
        hasEstimate,
        unitMin,
        unitMax,
        note,
        formattedUnitRange: hasEstimate ? formatTentativeRange(unitMin, unitMax, note) : 'For discussion',
        formattedLineRange: hasEstimate ? formatTentativeRange(lineMin || (unitMin * quantity), lineMax || (unitMax * quantity)) : 'For discussion',
        lineMin: lineMin || (unitMin * quantity),
        lineMax: lineMax || (unitMax * quantity),
      };
    })
    .filter(Boolean);

  const estimatedLineItems = lineItems.filter((lineItem) => lineItem.hasEstimate);
  const hasAnyEstimate = estimatedLineItems.length > 0;
  const hasCompleteEstimate = hasAnyEstimate && estimatedLineItems.length === lineItems.length;
  const subtotalMin = estimatedLineItems.reduce((sum, lineItem) => sum + lineItem.lineMin, 0);
  const subtotalMax = estimatedLineItems.reduce((sum, lineItem) => sum + lineItem.lineMax, 0);

  return {
    lineItems,
    hasAnyEstimate,
    hasCompleteEstimate,
    subtotalMin,
    subtotalMax,
    formattedSubtotalRange: hasCompleteEstimate ? formatTentativeRange(subtotalMin, subtotalMax) : 'For discussion',
  };
};

const getArrangementLookupKey = (value = '') => String(value || '').trim().toLowerCase();

const getRangeWarningState = (amount, min, max) => {
  const safeAmount = parseCurrencyNumber(amount);
  const safeMin = parseCurrencyNumber(min);
  const safeMaxCandidate = parseCurrencyNumber(max);
  const safeMax = safeMaxCandidate < safeMin ? safeMin : safeMaxCandidate;

  if (safeMin <= 0 && safeMax <= 0) {
    return {
      isBelowRange: false,
      isAboveRange: false,
      rangeWarningText: '',
    };
  }

  if (safeAmount < safeMin) {
    return {
      isBelowRange: true,
      isAboveRange: false,
      rangeWarningText: `Below minimum catalogue range by ${formatTentativePeso(safeMin - safeAmount)}`,
    };
  }

  if (safeMax > 0 && safeAmount > safeMax) {
    return {
      isBelowRange: false,
      isAboveRange: true,
      rangeWarningText: `Above maximum catalogue range by ${formatTentativePeso(safeAmount - safeMax)}`,
    };
  }

  return {
    isBelowRange: false,
    isAboveRange: false,
    rangeWarningText: '',
  };
};

const getArrangementFlowerCount = (arrangementType = '') => {
  if (!arrangementType) return 0;
  const match = arrangementType.match(/(\d+)\s*flowers?/i);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getRemainingRequestItemQuantity = (item = {}) => {
  const fallbackQuantity = toPositiveInt(
    item?.quantity
    ?? item?.qty
    ?? item?.arrangementQuantity
    ?? item?.arrangement_quantity,
    0
  );

  const explicitRemainingQuantity = toNonNegativeInt(
    item?.remaining_quantity ?? item?.remainingQuantity,
    -1
  );

  return explicitRemainingQuantity >= 0 ? explicitRemainingQuantity : fallbackQuantity;
};

const getCancelledRequestItemQuantity = (item = {}) => (
  toNonNegativeInt(item?.cancelled_quantity ?? item?.cancelledQuantity, 0)
);

const normalizeFreeTextList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeFlowerNames = (value, otherFlowersText = '') => {
  if (!value) return [];

  const otherFlowerNames = normalizeFreeTextList(otherFlowersText);
  const finalNames = [];

  const pushName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    if (/^others?$/i.test(trimmed) && otherFlowerNames.length > 0) {
      otherFlowerNames.forEach((entry) => {
        if (!finalNames.includes(entry)) finalNames.push(entry);
      });
      return;
    }

    const cleanedName = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (cleanedName && !finalNames.includes(cleanedName)) {
      finalNames.push(cleanedName);
    }
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        pushName(entry);
      } else {
        pushName(entry.label || entry.name || entry.value || '');
      }
    });
    return finalNames;
  }

  if (typeof value === 'string') {
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach(pushName);
    return finalNames;
  }

  return finalNames;
};

const getBookingPreferredFlowerNames = (item = {}) => {
  const preferredFlowersSource =
    item?.customerPreferredFlowers ??
    item?.customer_preferred_flowers ??
    item?.preferredFlowers ??
    item?.preferred_flowers ??
    item?.requestedFlowers ??
    item?.requested_flowers ??
    item?.selectedFlowers ??
    item?.flowers ??
    null;

  return normalizeFlowerNames(
    preferredFlowersSource,
    firstNonEmpty(item?.otherFlowersText, item?.other_flowers_text) || ''
  );
};

const getArrangementSelectionPreferredFlowerNames = (selection = {}, fallbackOtherFlowersText = '') => normalizeFlowerNames(
  selection?.preferredFlowerNames ??
  selection?.preferredFlowers ??
  selection?.preferred_flowers ??
  selection?.customerPreferredFlowers ??
  selection?.customer_preferred_flowers ??
  selection?.selectedFlowers ??
  selection?.flowers ??
  null,
  firstNonEmpty(selection?.otherFlowersText, selection?.other_flowers_text, fallbackOtherFlowersText) || ''
);

const FLOWER_PREVIEW_IMAGE_MAP = {
  roses: 'https://images.pexels.com/photos/56866/garden-rose-red-pink-56866.jpeg?auto=compress&cs=tinysrgb&w=800',
  tulips: 'https://images.pexels.com/photos/36753/flower-purple-lical-blosso.jpg?auto=compress&cs=tinysrgb&w=800',
  sunflowers: 'https://images.pexels.com/photos/1002703/pexels-photo-1002703.jpeg?auto=compress&cs=tinysrgb&w=800',
  lilies: 'https://images.pexels.com/photos/6629632/pexels-photo-6629632.jpeg?auto=compress&cs=tinysrgb&w=800',
  orchids: 'https://images.pexels.com/photos/132474/pexels-photo-132474.jpeg?auto=compress&cs=tinysrgb&w=800',
  carnations: 'https://images.pexels.com/photos/14532594/pexels-photo-14532594.jpeg?auto=compress&cs=tinysrgb&w=800',
  'mixed flowers': 'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=800',
};

const normalizeFlowerPreviewKey = (flowerName = '') => String(flowerName || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getFlowerPreviewImageUri = (flowerName = '') => {
  const normalizedName = normalizeFlowerPreviewKey(flowerName);
  if (!normalizedName) return null;
  if (FLOWER_PREVIEW_IMAGE_MAP[normalizedName]) return FLOWER_PREVIEW_IMAGE_MAP[normalizedName];

  const partialMatchKey = Object.keys(FLOWER_PREVIEW_IMAGE_MAP).find((key) => (
    normalizedName.includes(key) || key.includes(normalizedName)
  ));

  return partialMatchKey ? FLOWER_PREVIEW_IMAGE_MAP[partialMatchKey] : null;
};

const normalizeArrangementSelections = (requestData = {}) => {
  const source = Array.isArray(requestData.arrangementSelections)
    ? requestData.arrangementSelections
    : [];
  const tentativeLineItems = getTentativeBreakdown(requestData).lineItems;
  const tentativeLineItemMap = new Map(
    tentativeLineItems.map((lineItem) => [getArrangementLookupKey(lineItem.label), lineItem])
  );

  return source
    .map((selection) => {
      const arrangementLabel =
        (selection?.arrangement_label || selection?.arrangementLabel || selection?.label || selection?.arrangement_type || selection?.arrangementType || '').trim();

      if (!arrangementLabel) return null;

      const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
      const flowersPerArrangement = toPositiveInt(
        selection?.flowers_per_arrangement || selection?.flowersPerArrangement,
        getArrangementFlowerCount(arrangementLabel)
      );

      let totalFlowers = toPositiveInt(selection?.total_flowers || selection?.totalFlowers, 0);
      if (!totalFlowers && flowersPerArrangement) {
        totalFlowers = flowersPerArrangement * quantity;
      }

      const matchedTentativeLineItem = tentativeLineItemMap.get(getArrangementLookupKey(arrangementLabel));
      const rawUnitMin = parseCurrencyNumber(
        selection?.unitMin
        ?? selection?.estimatedPriceMin
        ?? selection?.estimated_price_min
        ?? matchedTentativeLineItem?.unitMin
      );
      const rawUnitMaxCandidate = parseCurrencyNumber(
        selection?.unitMax
        ?? selection?.estimatedPriceMax
        ?? selection?.estimated_price_max
        ?? matchedTentativeLineItem?.unitMax
      );
      const rawLineMin = parseCurrencyNumber(
        selection?.lineMin
        ?? selection?.tentativeSubtotalMin
        ?? selection?.tentative_subtotal_min
        ?? matchedTentativeLineItem?.lineMin
      );
      const rawLineMaxCandidate = parseCurrencyNumber(
        selection?.lineMax
        ?? selection?.tentativeSubtotalMax
        ?? selection?.tentative_subtotal_max
        ?? matchedTentativeLineItem?.lineMax
      );
      const lineMin = rawLineMin || (rawUnitMin * quantity);
      const lineMaxBase = rawLineMaxCandidate || (Math.max(rawUnitMaxCandidate, rawUnitMin) * quantity);
      const lineMax = lineMaxBase < lineMin ? lineMin : lineMaxBase;
      const unitMin = rawUnitMin || (lineMin > 0 && quantity > 0 ? lineMin / quantity : 0);
      const unitMaxBase = rawUnitMaxCandidate || (lineMax > 0 && quantity > 0 ? lineMax / quantity : 0);
      const unitMax = unitMaxBase < unitMin ? unitMin : unitMaxBase;
      const note = String(
        selection?.note
        ?? selection?.estimatedPriceNote
        ?? selection?.estimated_price_note
        ?? matchedTentativeLineItem?.note
        ?? ''
      ).trim();
      const hasEstimate = unitMin > 0 || unitMax > 0 || lineMin > 0 || lineMax > 0;

      return {
        arrangementLabel,
        quantity,
        flowersPerArrangement,
        totalFlowers,
        preferredFlowerNames: getArrangementSelectionPreferredFlowerNames(selection),
        unitMin,
        unitMax,
        lineMin,
        lineMax,
        note,
        hasEstimate,
        formattedUnitRange: hasEstimate ? formatTentativeRange(unitMin, unitMax, note) : 'For discussion',
        formattedLineRange: hasEstimate ? formatTentativeRange(lineMin, lineMax) : 'For discussion',
      };
    })
    .filter(Boolean);
};

const getBookingItemsFromData = (requestData = {}) => {
  if (!requestData || typeof requestData !== 'object') {
    return [];
  }

  const items = Array.isArray(requestData.items) && requestData.items.length
    ? requestData.items
    : [requestData];

  return items.filter((item) => item && typeof item === 'object' && Object.keys(item).length);
};

const mergeArrangementSelections = (selections = []) => {
  const merged = new Map();

  (Array.isArray(selections) ? selections : []).forEach((selection) => {
    const arrangementLabel = String(selection?.arrangementLabel || '').trim();
    const arrangementGroupKey = String(selection?.arrangementGroupKey || arrangementLabel).trim();
    if (!arrangementLabel || !arrangementGroupKey) return;

    if (!merged.has(arrangementGroupKey)) {
      merged.set(arrangementGroupKey, {
        arrangementGroupKey,
        arrangementLabel,
        quantity: 0,
        flowersPerArrangement: selection?.flowersPerArrangement || getArrangementFlowerCount(arrangementLabel),
        totalFlowers: 0,
        preferredFlowerNames: [],
        unitMin: parseCurrencyNumber(selection?.unitMin),
        unitMax: parseCurrencyNumber(selection?.unitMax),
        lineMin: 0,
        lineMax: 0,
        note: String(selection?.note || '').trim(),
        hasEstimate: false,
      });
    }

    const current = merged.get(arrangementGroupKey);
    current.quantity += toPositiveInt(selection?.quantity, 0);
    current.totalFlowers += toPositiveInt(selection?.totalFlowers, 0);
    current.lineMin += parseCurrencyNumber(selection?.lineMin);
    current.lineMax += parseCurrencyNumber(selection?.lineMax);
    if (!current.unitMin && parseCurrencyNumber(selection?.unitMin) > 0) {
      current.unitMin = parseCurrencyNumber(selection?.unitMin);
    }
    if (!current.unitMax && parseCurrencyNumber(selection?.unitMax) > 0) {
      current.unitMax = parseCurrencyNumber(selection?.unitMax);
    }
    if (!current.note && String(selection?.note || '').trim()) {
      current.note = String(selection?.note || '').trim();
    }
    current.hasEstimate = current.hasEstimate || Boolean(
      selection?.hasEstimate
      || parseCurrencyNumber(selection?.lineMin) > 0
      || parseCurrencyNumber(selection?.lineMax) > 0
      || parseCurrencyNumber(selection?.unitMin) > 0
      || parseCurrencyNumber(selection?.unitMax) > 0
    );
    current.preferredFlowerNames = Array.from(
      new Set([
        ...(Array.isArray(current.preferredFlowerNames) ? current.preferredFlowerNames : []),
        ...(Array.isArray(selection?.preferredFlowerNames) ? selection.preferredFlowerNames : []),
      ])
    );
  });

  return Array.from(merged.values()).map((selection) => {
    const lineMin = parseCurrencyNumber(selection?.lineMin);
    const lineMaxCandidate = parseCurrencyNumber(selection?.lineMax);
    const lineMax = lineMaxCandidate < lineMin ? lineMin : lineMaxCandidate;
    const unitMin = parseCurrencyNumber(selection?.unitMin) || (lineMin > 0 && selection.quantity > 0 ? lineMin / selection.quantity : 0);
    const unitMaxBase = parseCurrencyNumber(selection?.unitMax) || (lineMax > 0 && selection.quantity > 0 ? lineMax / selection.quantity : 0);
    const unitMax = unitMaxBase < unitMin ? unitMin : unitMaxBase;
    const note = String(selection?.note || '').trim();
    const hasEstimate = Boolean(selection?.hasEstimate || lineMin > 0 || lineMax > 0 || unitMin > 0 || unitMax > 0);

    return {
      ...selection,
      unitMin,
      unitMax,
      lineMin,
      lineMax,
      note,
      hasEstimate,
      formattedUnitRange: hasEstimate ? formatTentativeRange(unitMin, unitMax, note) : 'For discussion',
      formattedLineRange: hasEstimate ? formatTentativeRange(lineMin, lineMax) : 'For discussion',
    };
  });
};

const isUnitizedBookingItem = (item = {}) => Boolean(
  String(item?.parent_arrangement_key || item?.parentArrangementKey || '').trim()
  || String(item?.unit_label || item?.unitLabel || '').trim()
  || toPositiveInt(item?.unit_index ?? item?.unitIndex, 0) > 0
);

const buildBookingUnitSelectionMetadata = (item = {}, itemIndex = 0, selectionIndex = 0) => {
  const parentArrangementKey = String(
    item?.parent_arrangement_key
    || item?.parentArrangementKey
    || item?.arrangementType
    || item?.arrangementSummary
    || item?.name
    || `booking-${itemIndex + 1}`
  ).trim();
  const unitIndex = toPositiveInt(item?.unit_index ?? item?.unitIndex, 0);
  const unitCount = toPositiveInt(item?.unit_count ?? item?.unitCount, 0);
  const unitLabel = String(item?.unit_label || item?.unitLabel || (unitIndex > 0 ? `Unit ${unitIndex}` : '')).trim();

  return {
    unitIndex,
    unitCount,
    unitLabel,
    arrangementGroupKey: [parentArrangementKey || `booking-${itemIndex + 1}`, unitIndex || itemIndex + 1, selectionIndex + 1].join('::'),
  };
};

const buildFlowerPricingContext = (request) => {
  let requestData = request?.data || {};
  if (typeof requestData === 'string') {
    try {
      requestData = JSON.parse(requestData);
    } catch (error) {
      requestData = {};
    }
  }

  const bookingItems = getBookingItemsFromData(requestData);
  const pricingSources = bookingItems.length ? bookingItems : [requestData];
  const rawArrangementSelections = pricingSources.flatMap((item, itemIndex) => (
    normalizeArrangementSelections(item).map((selection, selectionIndex) => {
      if (!isUnitizedBookingItem(item)) {
        return selection;
      }

      const unitMetadata = buildBookingUnitSelectionMetadata(item, itemIndex, selectionIndex);
      return {
        ...selection,
        arrangementLabel: unitMetadata.unitLabel
          ? `${selection.arrangementLabel} - ${unitMetadata.unitLabel}`
          : selection.arrangementLabel,
        arrangementGroupKey: unitMetadata.arrangementGroupKey,
        baseArrangementLabel: selection.arrangementLabel,
        unitIndex: unitMetadata.unitIndex,
        unitCount: unitMetadata.unitCount,
        unitLabel: unitMetadata.unitLabel,
      };
    })
  ));
  const arrangementSelections = mergeArrangementSelections(rawArrangementSelections);

  const fallbackArrangementType = Array.from(
    new Set(
      pricingSources
        .map((item) => (
          item.arrangementSummary ||
          item.arrangementType ||
          item.arrangement_type ||
          item.arrangement ||
          (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : null)
        ))
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).join(' | ') || 'N/A';

  const arrangementType = arrangementSelections.length
    ? arrangementSelections.map((selection) => (
      selection.quantity > 1
        ? `${selection.arrangementLabel} x${selection.quantity}`
        : selection.arrangementLabel
    )).join(', ')
    : fallbackArrangementType;

  const arrangementQuantity = arrangementSelections.length
    ? arrangementSelections.reduce((sum, selection) => sum + selection.quantity, 0)
    : pricingSources.reduce(
      (sum, item) => sum + toPositiveInt(item.arrangementQuantity || item.arrangement_quantity, 1),
      0
    );

  let totalFlowers = pricingSources.reduce((sum, item) => (
    sum + toPositiveInt(
      item.totalFlowers ||
      item.total_flower_count ||
      item.flowerQuantity ||
      item.flower_quantity,
      0
    )
  ), 0);

  if (!totalFlowers && arrangementSelections.length) {
    totalFlowers = arrangementSelections.reduce((sum, selection) => sum + (selection.totalFlowers || 0), 0);
  }

  if (!totalFlowers) {
    const flowersPerArrangement = getArrangementFlowerCount(fallbackArrangementType);
    if (flowersPerArrangement) {
      totalFlowers = flowersPerArrangement * arrangementQuantity;
    }
  }

  const flowerTypes = Array.from(new Set(pricingSources.flatMap((item) => getBookingPreferredFlowerNames(item))));

  const explicitFlowerQuantities = {};
  pricingSources.forEach((item) => {
    const quantitySources = [item.flowerQuantities, item.flower_quantities, item.flowerBreakdown];

    quantitySources.forEach((source) => {
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        Object.entries(source).forEach(([name, qty]) => {
          const trimmedName = String(name || '').trim();
          if (!trimmedName) return;
          explicitFlowerQuantities[trimmedName] = (explicitFlowerQuantities[trimmedName] || 0) + toPositiveInt(qty, 0);
        });
      }
    });
  });

  const normalizedFlowerTypes = flowerTypes.length
    ? flowerTypes
    : Object.keys(explicitFlowerQuantities);

  pricingSources.forEach((item) => {
    if (!normalizedFlowerTypes.length && item.flower?.name) {
      normalizedFlowerTypes.push(item.flower.name);
    }
  });

  const flowerQuantities = {};
  normalizedFlowerTypes.forEach((flowerName) => {
    flowerQuantities[flowerName] = explicitFlowerQuantities[flowerName] || 0;
  });

  const explicitQuantityTotal = normalizedFlowerTypes.reduce(
    (sum, flowerName) => sum + (flowerQuantities[flowerName] || 0),
    0
  );

  if (!totalFlowers && explicitQuantityTotal > 0) {
    totalFlowers = explicitQuantityTotal;
  }

  if (totalFlowers === 0 && explicitQuantityTotal === 0 && normalizedFlowerTypes.length > 0) {
    normalizedFlowerTypes.forEach((flowerName) => {
      flowerQuantities[flowerName] = 1;
    });
    totalFlowers = normalizedFlowerTypes.length;
  }

  if (totalFlowers > 0 && explicitQuantityTotal === 0 && normalizedFlowerTypes.length > 0) {
    const base = Math.floor(totalFlowers / normalizedFlowerTypes.length);
    let remainder = totalFlowers % normalizedFlowerTypes.length;

    normalizedFlowerTypes.forEach((flowerName) => {
      flowerQuantities[flowerName] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    });
  }

  const estimatedArrangementSelections = arrangementSelections.filter((selection) => (
    Boolean(
      selection?.hasEstimate
      || parseCurrencyNumber(selection?.lineMin) > 0
      || parseCurrencyNumber(selection?.lineMax) > 0
    )
  ));
  const hasAnyEstimate = estimatedArrangementSelections.length > 0;
  const hasCompleteEstimate = hasAnyEstimate && estimatedArrangementSelections.length === arrangementSelections.length;
  const subtotalMin = estimatedArrangementSelections.reduce(
    (sum, selection) => sum + parseCurrencyNumber(selection?.lineMin),
    0
  );
  const subtotalMax = estimatedArrangementSelections.reduce(
    (sum, selection) => sum + parseCurrencyNumber(selection?.lineMax),
    0
  );

  return {
    arrangementType,
    arrangementQuantity,
    totalFlowers,
    arrangementSelections,
    flowerTypes: normalizedFlowerTypes,
    flowerQuantities,
    itemCount: bookingItems.reduce((sum, item) => sum + getRemainingRequestItemQuantity(item), 0) || bookingItems.length || 1,
    subtotalMin,
    subtotalMax,
    hasAnyEstimate,
    hasCompleteEstimate,
    formattedSubtotalRange: hasCompleteEstimate ? formatTentativeRange(subtotalMin, subtotalMax) : 'For discussion',
  };
};
const formatCurrency = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `PHP ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const createQuoteChargeRow = ({
  type = 'extra',
  label = '',
  amount = '',
  reason = '',
  arrangementGroup = '',
} = {}) => ({
  id: `quote-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: normalizeCustomOrderQuoteType(type, label),
  label: String(label || ''),
  amount: String(amount || ''),
  reason: String(reason || ''),
  arrangementGroup: String(arrangementGroup || '').trim(),
});

const getQuoteSeedGroups = (arrangementBreakdownItems = [], bookingItems = []) => {
  if (Array.isArray(arrangementBreakdownItems) && arrangementBreakdownItems.length) {
    return arrangementBreakdownItems.map((selection, index) => {
      const arrangementLabel = String(selection?.arrangementLabel || '').trim();
      const arrangementGroupKey = String(selection?.arrangementGroupKey || arrangementLabel || `arrangement-${index + 1}`).trim();
      return {
        key: arrangementGroupKey,
        title: arrangementLabel || `Arrangement ${index + 1}`,
        preferredFlowerNames: Array.isArray(selection?.preferredFlowerNames)
          ? selection.preferredFlowerNames.filter(Boolean)
          : [],
        preferredFlowersText: Array.isArray(selection?.preferredFlowerNames) && selection.preferredFlowerNames.length
          ? selection.preferredFlowerNames.filter(Boolean).join(', ')
          : '',
        quantity: toPositiveInt(selection?.quantity, 1),
        flowersPerArrangement: toPositiveInt(selection?.flowersPerArrangement, 0),
        unitMin: parseCurrencyNumber(selection?.unitMin),
        unitMax: parseCurrencyNumber(selection?.unitMax),
        lineMin: parseCurrencyNumber(selection?.lineMin),
        lineMax: parseCurrencyNumber(selection?.lineMax),
        formattedUnitRange: String(selection?.formattedUnitRange || '').trim(),
        formattedLineRange: String(selection?.formattedLineRange || '').trim(),
        hasEstimate: Boolean(selection?.hasEstimate),
      };
    });
  }

  const normalizedBookingItems = Array.isArray(bookingItems) ? bookingItems : [];
  if (normalizedBookingItems.length) {
    return normalizedBookingItems.map((item, index) => {
      const arrangementLabel = String(
        item?.name
        || item?.title
        || item?.arrangementText
        || item?.label
        || item?.occasion
        || ''
      ).trim();
      const unitMetadata = buildBookingUnitSelectionMetadata(item, index, 0);

      return {
        key: unitMetadata.arrangementGroupKey,
        title: arrangementLabel || `Custom Order ${index + 1}`,
        preferredFlowerNames: normalizeFlowerNames(
          item?.preferredFlowers
          || item?.selectedFlowers
          || item?.customerPreferredFlowers
          || item?.flowers
        ),
        preferredFlowersText: normalizeFlowerNames(
          item?.preferredFlowers
          || item?.selectedFlowers
          || item?.customerPreferredFlowers
          || item?.flowers
        ).join(', '),
        quantity: 1,
        flowersPerArrangement: 0,
        unitMin: 0,
        unitMax: 0,
        lineMin: 0,
        lineMax: 0,
        formattedUnitRange: '',
        formattedLineRange: '',
        hasEstimate: false,
      };
    });
  }

  return [{
    key: '',
    title: 'General Charges',
    preferredFlowerNames: [],
    preferredFlowersText: '',
    quantity: 1,
    flowersPerArrangement: 0,
    unitMin: 0,
    unitMax: 0,
    lineMin: 0,
    lineMax: 0,
    formattedUnitRange: '',
    formattedLineRange: '',
    hasEstimate: false,
  }];
};

const buildQuoteArrangementBreakdownItems = ({
  arrangementSelections = [],
  customOrderItems = [],
  flowerTypes = [],
}) => (
  (Array.isArray(arrangementSelections) ? arrangementSelections : []).map((selection) => {
    const selectionPreferredFlowers = getArrangementSelectionPreferredFlowerNames(selection);
    const matchedPreferredFlowers = Array.from(
      new Set(
        (Array.isArray(customOrderItems) ? customOrderItems : []).flatMap((item) => {
          const arrangementText = String(item?.arrangementText || '').trim();
          const arrangementLabel = String(selection?.arrangementLabel || '').trim();
          const doesMatchArrangement = arrangementLabel && arrangementText
            ? arrangementText.toLowerCase().includes(arrangementLabel.toLowerCase())
            : false;

          if (!doesMatchArrangement && (Array.isArray(customOrderItems) ? customOrderItems.length : 0) > 1) {
            return [];
          }

          return normalizeFlowerNames(item?.preferredFlowers);
        })
      )
    );

    const fallbackFlowers = selectionPreferredFlowers.length
      ? selectionPreferredFlowers
      : (matchedPreferredFlowers.length ? matchedPreferredFlowers : flowerTypes);

    return {
      ...selection,
      preferredFlowerNames: fallbackFlowers,
      preferredFlowersText: fallbackFlowers.length ? fallbackFlowers.join(', ') : null,
    };
  })
);

const buildQuoteChargeRows = ({
  bookingItems = [],
  arrangementBreakdownItems = [],
  storedQuoteBreakdown = null,
}) => {
  const storedLineItems = normalizeCustomOrderQuoteLineItems(storedQuoteBreakdown)
    .filter((item) => item.type !== 'delivery');

  if (storedLineItems.length) {
    return storedLineItems.map((item) => createQuoteChargeRow({
      type: item.type,
      label: item.label,
      amount: item.amount > 0 ? String(item.amount) : '',
      reason: item.reason,
      arrangementGroup: item.arrangementGroup,
    }));
  }

  const seedGroups = getQuoteSeedGroups(arrangementBreakdownItems, bookingItems);
  const seededRows = seedGroups.flatMap((group, index) => {
    const arrangementGroup = group.key;
    const arrangementLabel = group.title || `Arrangement ${index + 1}`;
    const flowerRows = (Array.isArray(group.preferredFlowerNames) && group.preferredFlowerNames.length
      ? group.preferredFlowerNames
      : ['']).map((flowerName) => createQuoteChargeRow({
        type: 'flower',
        label: flowerName,
        amount: '',
        reason: '',
        arrangementGroup,
      }));

    return [
      createQuoteChargeRow({
        type: 'arrangement',
        label: arrangementLabel,
        amount: '',
        reason: '',
        arrangementGroup,
      }),
      ...flowerRows,
      createQuoteChargeRow({
        type: 'labor',
        label: 'Labor / Materials',
        amount: '',
        reason: '',
        arrangementGroup,
      }),
    ];
  });

  if (seededRows.length) {
    return seededRows;
  }

  return [createQuoteChargeRow({ type: 'flower' })];
};

const rowHasQuoteContent = (row = {}) => Boolean(
  String(row?.label || '').trim()
  || String(row?.amount || '').trim()
  || String(row?.reason || '').trim()
);

const getQuoteChargeLabelPlaceholder = (type = 'extra') => {
  switch (normalizeCustomOrderQuoteType(type)) {
    case 'arrangement':
      return 'Arrangement base price';
    case 'flower':
      return 'Flower name';
    case 'labor':
      return 'Labor charge';
    case 'material':
      return 'Material or supply';
    default:
      return 'Extra charge';
  }
};

const getQuoteChargeReasonPlaceholder = (type = 'extra') => {
  switch (normalizeCustomOrderQuoteType(type)) {
    case 'arrangement':
      return 'Base stand styling or arrangement design';
    case 'flower':
      return 'Currently seasonal, imported, premium bloom';
    case 'labor':
      return 'Assembly and finishing';
    case 'material':
      return 'Foam, stand, wrapping, or support materials';
    default:
      return 'Add a short reason for this charge';
  }
};

const groupQuoteChargeRows = (rows = [], arrangementBreakdownItems = [], bookingItems = []) => {
  const groups = [];
  const groupMap = new Map();

  const ensureGroup = (groupKey = '', title = '', metadata = {}) => {
    const normalizedGroupKey = String(groupKey || '').trim();
    const lookupKey = normalizedGroupKey || '__ungrouped__';
    if (!groupMap.has(lookupKey)) {
      const lineMin = parseCurrencyNumber(metadata?.lineMin);
      const lineMaxCandidate = parseCurrencyNumber(metadata?.lineMax);
      const lineMax = lineMaxCandidate < lineMin ? lineMin : lineMaxCandidate;
      const group = {
        key: lookupKey,
        arrangementGroup: normalizedGroupKey,
        title: String(title || normalizedGroupKey || 'General Charges').trim(),
        items: [],
        subtotal: 0,
        preferredFlowersText: String(metadata?.preferredFlowersText || '').trim(),
        formattedUnitRange: String(metadata?.formattedUnitRange || '').trim(),
        formattedLineRange: String(metadata?.formattedLineRange || '').trim(),
        lineMin,
        lineMax,
        hasEstimate: Boolean(metadata?.hasEstimate || lineMin > 0 || lineMax > 0),
      };
      groupMap.set(lookupKey, group);
      groups.push(group);
    } else if (metadata && Object.keys(metadata).length) {
      const group = groupMap.get(lookupKey);
      if (!group.preferredFlowersText && metadata?.preferredFlowersText) {
        group.preferredFlowersText = String(metadata.preferredFlowersText).trim();
      }
      if (!group.formattedUnitRange && metadata?.formattedUnitRange) {
        group.formattedUnitRange = String(metadata.formattedUnitRange).trim();
      }
      if (!group.formattedLineRange && metadata?.formattedLineRange) {
        group.formattedLineRange = String(metadata.formattedLineRange).trim();
      }
      if (!group.lineMin && parseCurrencyNumber(metadata?.lineMin) > 0) {
        group.lineMin = parseCurrencyNumber(metadata.lineMin);
      }
      if (!group.lineMax && parseCurrencyNumber(metadata?.lineMax) > 0) {
        group.lineMax = parseCurrencyNumber(metadata.lineMax);
      }
      group.hasEstimate = group.hasEstimate || Boolean(
        metadata?.hasEstimate
        || parseCurrencyNumber(metadata?.lineMin) > 0
        || parseCurrencyNumber(metadata?.lineMax) > 0
      );
    }

    return groupMap.get(lookupKey);
  };

  getQuoteSeedGroups(arrangementBreakdownItems, bookingItems).forEach((group) => {
    ensureGroup(group.key, group.title, group);
  });

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const normalizedGroupKey = String(row?.arrangementGroup || '').trim();
    const group = ensureGroup(normalizedGroupKey, normalizedGroupKey || `Charge Group ${index + 1}`);
    group.items.push(row);
    group.subtotal += parseCurrencyNumber(row?.amount);
  });

  const finalizedGroups = groups.length ? groups : [ensureGroup('', 'General Charges')];

  return finalizedGroups.map((group) => ({
    ...group,
    ...getRangeWarningState(group.subtotal, group.lineMin, group.lineMax),
  }));
};

const quoteStyles = StyleSheet.create({
  quoteScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  quoteHeroCard: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quoteBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  quoteBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteHeroTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: '#7c2d12',
    marginBottom: 14,
  },
  quoteHeroSubtitle: {
    marginTop: -4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#9a3412',
  },
  quoteMetricsRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  quoteMetricCard: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  quoteMetricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9a3412',
  },
  quoteMetricLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteBreakdownSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#fdba74',
  },
  quoteSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quoteBreakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  quoteBreakdownIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fb923c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  quoteBreakdownIndexText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  quoteBreakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c2d12',
    lineHeight: 20,
    flexShrink: 1,
  },
  quoteBreakdownMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#c2410c',
    lineHeight: 16,
    flexShrink: 1,
  },
  quoteBreakdownFlowerRail: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  quoteBreakdownFlowerTile: {
    width: 52,
    marginRight: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  quoteBreakdownFlowerThumb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.35)',
    backgroundColor: '#fff7ed',
  },
  quoteBreakdownFlowerFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.35)',
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteBreakdownFlowerFallbackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9a3412',
  },
  quoteBreakdownFlowerLabel: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 12,
    color: '#9a3412',
    textAlign: 'center',
  },
  quoteSectionHeader: {
    marginTop: 18,
    marginBottom: 12,
  },
  quoteSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  quoteSectionHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  quoteInputCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    marginBottom: 12,
  },
  quoteInputHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  quoteInputTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  quoteInputHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: '#6b7280',
  },
  quoteInputLineTotal: {
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteFieldLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#9f1239',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  quoteCurrencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fbcfe8',
    backgroundColor: '#fff7fb',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  quoteCurrencyPrefix: {
    backgroundColor: '#fce7f3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
  },
  quoteCurrencyPrefixText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteCurrencyInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  quoteCurrencySuffix: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  quoteAlertText: {
    color: '#7f1d1d',
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  quoteInfoCard: {
    backgroundColor: '#fffaf8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 12,
  },
  quoteInfoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteInfoValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#7c2d12',
  },
  quoteInfoHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: '#9a3412',
  },
  quoteTotalCard: {
    marginTop: 6,
    padding: 16,
    backgroundColor: '#fdf2f8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  quoteTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  quoteLiveItemRow: {
    marginBottom: 10,
  },
  quoteLiveItemName: {
    fontSize: 14,
    color: '#831843',
    fontWeight: '600',
    lineHeight: 19,
  },
  quoteLiveItemPrice: {
    marginTop: 4,
    fontSize: 14,
    color: '#831843',
    fontWeight: '700',
    textAlign: 'right',
  },
  quoteTotalLabel: {
    flex: 1,
    fontSize: 14,
    color: '#831843',
    fontWeight: '600',
  },
  quoteTotalMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#9d174d',
  },
  quoteTotalValue: {
    marginLeft: 12,
    fontSize: 14,
    color: '#831843',
    fontWeight: '700',
    textAlign: 'right',
  },
  quoteTotalDivider: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f9a8d4',
  },
  quoteGrandTotalLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteGrandTotalValue: {
    marginLeft: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
    textAlign: 'right',
  },
  quoteSummaryCard: {
    marginTop: 10,
    backgroundColor: '#fffafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    padding: 16,
  },
  quoteSummaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  quoteSummaryMeta: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7280',
  },
  quoteSummaryTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quoteSummaryTag: {
    backgroundColor: '#fdf2f8',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f9a8d4',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quoteSummaryTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9d174d',
  },
  quoteRangeCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f9a8d4',
    backgroundColor: '#fff7fb',
    padding: 12,
  },
  quoteRangeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: '#9d174d',
  },
  quoteRangeValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#831843',
  },
  quoteRangeHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#9d174d',
  },
  quoteWarningBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quoteWarningText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#be123c',
  },
  quoteGroupCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    padding: 16,
    marginBottom: 14,
  },
  quoteGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  quoteGroupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  quoteGroupMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
  },
  quoteGroupSubtotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteChargeCard: {
    backgroundColor: '#fffafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    padding: 12,
    marginBottom: 12,
  },
  quoteChargeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  quoteChargeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  quoteChargeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteChargeTypeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fce7f3',
    marginBottom: 10,
  },
  quoteChargeTypeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9d174d',
  },
  quoteTextField: {
    borderWidth: 1,
    borderColor: '#fbcfe8',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
  },
  quoteReasonInput: {
    borderWidth: 1,
    borderColor: '#fbcfe8',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: '#111827',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  quoteChargeFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  quoteChargeFooterHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: '#6b7280',
  },
  quoteRemoveChip: {
    backgroundColor: '#fff1f2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quoteRemoveChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be123c',
  },
  quoteAddChargeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedf5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  quoteAddChargeText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteAddActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  quoteFooterSummaryCard: {
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#fdf2f8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
});
const normalizeRequestData = (request) => {
  const rawData = request?.data;
  if (!rawData) return {};
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return typeof rawData === 'object' ? rawData : {};
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return null;
};

const getNamedValue = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'object') {
    return firstNonEmpty(value.name, value.label, value.value);
  }

  const text = String(value).trim();
  return text || null;
};

const toAbsoluteImageUrl = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^(https?:\/\/|data:)/i.test(text)) return text;
  return `${BASE_URL}${text.startsWith('/') ? text : `/${text}`}`;
};

const clampPreviewRatio = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
};

const toPreviewPercent = (value) => `${clampPreviewRatio(value) * 100}%`;

const getNormalizedCustomizedPreviewComposition = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const stems = Array.isArray(value?.stems)
    ? value.stems
      .map((stem, index) => ({
        ...stem,
        id: stem?.id || `stem-${index}`,
        src: toAbsoluteImageUrl(stem?.src),
      }))
      .filter((stem) => stem.src)
    : [];

  const wrapper = value?.wrapper?.src
    ? { ...value.wrapper, src: toAbsoluteImageUrl(value.wrapper.src) }
    : null;
  const ribbon = value?.ribbon?.src
    ? { ...value.ribbon, src: toAbsoluteImageUrl(value.ribbon.src) }
    : null;

  if (!wrapper && !ribbon && stems.length === 0) {
    return null;
  }

  return { wrapper, ribbon, stems };
};

const buildLayeredPreviewFlowers = (flowers = [], bundleSize = 0) => {
  const safeFlowers = (Array.isArray(flowers) ? flowers : []).filter(Boolean);
  if (!safeFlowers.length) {
    return [];
  }

  const targetCount = Math.max(
    safeFlowers.length,
    Math.min(4, Math.max(1, Number.parseInt(bundleSize, 10) || safeFlowers.length))
  );

  return Array.from({ length: targetCount }, (_, index) => safeFlowers[index % safeFlowers.length]);
};

const getLayeredPreviewPlacements = (count) => {
  if (count <= 1) {
    return [
      { left: '35%', top: '12%', width: '30%', height: '34%', rotate: '-3deg' },
    ];
  }

  if (count === 2) {
    return [
      { left: '22%', top: '16%', width: '28%', height: '32%', rotate: '-10deg' },
      { left: '50%', top: '12%', width: '28%', height: '32%', rotate: '9deg' },
    ];
  }

  if (count === 3) {
    return [
      { left: '36%', top: '6%', width: '28%', height: '32%', rotate: '-1deg' },
      { left: '16%', top: '20%', width: '24%', height: '28%', rotate: '-11deg' },
      { left: '58%', top: '18%', width: '24%', height: '28%', rotate: '11deg' },
    ];
  }

  return [
    { left: '37%', top: '5%', width: '26%', height: '30%', rotate: '-1deg' },
    { left: '12%', top: '16%', width: '23%', height: '27%', rotate: '-13deg' },
    { left: '64%', top: '16%', width: '23%', height: '27%', rotate: '13deg' },
    { left: '38%', top: '24%', width: '22%', height: '25%', rotate: '2deg' },
  ];
};

const CustomizedBouquetPreview = ({ item, style, fallbackResizeMode = 'cover' }) => {
  const snapshotUri = toAbsoluteImageUrl(
    item?.imageUri || item?.image_url || item?.image || item?.photo
  );
  const composition = getNormalizedCustomizedPreviewComposition(
    item?.previewComposition || item?.preview_composition
  );
  const wrapperUri = toAbsoluteImageUrl(item?.wrapper?.layerImg || item?.wrapper?.img);
  const ribbonUri = toAbsoluteImageUrl(item?.ribbon?.layerImg || item?.ribbon?.img);
  const previewFlowers = buildLayeredPreviewFlowers(item?.flowers, item?.bundleSize);
  const flowerPlacements = getLayeredPreviewPlacements(previewFlowers.length);

  if (snapshotUri) {
    return (
      <Image
        source={{ uri: snapshotUri }}
        style={style}
        resizeMode={fallbackResizeMode}
      />
    );
  }

  if (composition) {
    return (
      <View style={[{ position: 'relative', overflow: 'hidden', backgroundColor: '#fff' }, style]}>
        {composition.wrapper ? (
          <Image
            source={{ uri: composition.wrapper.src }}
            style={{
              position: 'absolute',
              left: toPreviewPercent(composition.wrapper.leftRatio),
              top: toPreviewPercent(composition.wrapper.topRatio),
              width: toPreviewPercent(composition.wrapper.widthRatio),
              height: toPreviewPercent(composition.wrapper.heightRatio),
              zIndex: composition.wrapper.zIndex || 1,
            }}
            resizeMode="contain"
          />
        ) : null}

        {composition.stems.map((stem) => (
          <View
            key={stem.id}
            style={{
              position: 'absolute',
              left: toPreviewPercent(stem.leftRatio),
              top: toPreviewPercent(stem.topRatio),
              width: toPreviewPercent(stem.widthRatio),
              height: toPreviewPercent(stem.heightRatio),
              zIndex: stem.zIndex || 2,
              transform: [{ scale: Number(stem.scale || 1) }],
            }}
          >
            <Image
              source={{ uri: stem.src }}
              style={{
                width: '100%',
                height: '100%',
                transform: [{ rotate: `${Number(stem.rotation || 0)}deg` }],
              }}
              resizeMode="contain"
            />
          </View>
        ))}

        {composition.ribbon ? (
          <Image
            source={{ uri: composition.ribbon.src }}
            style={{
              position: 'absolute',
              left: toPreviewPercent(composition.ribbon.leftRatio),
              top: toPreviewPercent(composition.ribbon.topRatio),
              width: toPreviewPercent(composition.ribbon.widthRatio),
              height: toPreviewPercent(composition.ribbon.heightRatio),
              zIndex: composition.ribbon.zIndex || 8,
            }}
            resizeMode="contain"
          />
        ) : null}
      </View>
    );
  }

  if (wrapperUri || ribbonUri || previewFlowers.length) {
    return (
      <View style={[{ position: 'relative', overflow: 'hidden', backgroundColor: '#fff' }, style]}>
        {wrapperUri ? (
          <Image
            source={{ uri: wrapperUri }}
            style={{
              position: 'absolute',
              left: '5%',
              bottom: '-2%',
              width: '90%',
              height: '94%',
            }}
            resizeMode="contain"
          />
        ) : null}

        {previewFlowers.map((flower, index) => {
          const sourceUri = toAbsoluteImageUrl(flower?.stemImg || flower?.layerImg || flower?.img);
          const placement = flowerPlacements[index] || flowerPlacements[flowerPlacements.length - 1];

          if (!sourceUri || !placement) {
            return null;
          }

          return (
            <Image
              key={`${flower?.id || flower?.name || index}-${index}`}
              source={{ uri: sourceUri }}
              style={{
                position: 'absolute',
                left: placement.left,
                top: placement.top,
                width: placement.width,
                height: placement.height,
                zIndex: 2 + index,
                transform: [{ rotate: placement.rotate }],
              }}
              resizeMode="contain"
            />
          );
        })}

        {ribbonUri ? (
          <Image
            source={{ uri: ribbonUri }}
            style={{
              position: 'absolute',
              left: '36%',
              top: '54%',
              width: '28%',
              height: '24%',
              zIndex: 8,
            }}
            resizeMode="contain"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[{ justifyContent: 'center', alignItems: 'center' }, style]}>
      <Ionicons name="image-outline" size={24} color="#666" />
    </View>
  );
};

const getGroupedDestinationsForRequest = (request) => (
  groupDeliveryDestinations(normalizeRequestData(request)?.multi_delivery_destinations || [])
);

const formatRequestAmountBadge = (value) => {
  const amount = parseCurrencyNumber(value);
  if (amount <= 0) return 'Price pending';
  return `PHP ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const getCompactRequestPreviewUri = (item) => {
  if (!item) return null;

  if (item.type === 'customized') {
    const firstCustomizedItem = getCustomizedRequestItems(item)[0];
    return toAbsoluteImageUrl(
      firstCustomizedItem?.imageUri
      || firstCustomizedItem?.image_url
      || item?.image_url
    );
  }

  if (item.type === 'booking') {
    const firstBookingItem = getBookingRequestItems(item)[0];
    return toAbsoluteImageUrl(
      firstBookingItem?.imageUri
      || firstBookingItem?.image_url
      || item?.image_url
    );
  }

  return toAbsoluteImageUrl(item?.image_url);
};

const getCompactRequestSummary = (item) => {
  const groupedDestinations = item?.delivery_method === 'delivery'
    ? getGroupedDestinationsForRequest(item)
    : [];

  if (item?.type === 'customized') {
    const customizedItems = getCustomizedRequestItems(item);
    const firstItem = customizedItems[0] || {};
    const bouquetCount = customizedItems.reduce(
      (sum, customizedItem) => sum + getRemainingRequestItemQuantity(customizedItem),
      0
    ) || customizedItems.length || 1;
    const lines = [
      firstItem?.bundleSizeText ? `Bundle: ${firstItem.bundleSizeText}` : null,
      firstItem?.flowersText ? `Flowers: ${firstItem.flowersText}` : null,
      firstItem?.destinationSummary
        ? `Deliver to: ${firstItem.destinationSummary}`
        : (groupedDestinations.length > 1 ? `Delivery stops: ${groupedDestinations.length}` : null),
    ].filter(Boolean);

    return {
      title: `${bouquetCount} customizer bouquet${bouquetCount === 1 ? '' : 's'}`,
      lines,
      badge: bouquetCount > 1 ? `${bouquetCount} bouquets` : 'Customizer Studio',
    };
  }

  if (item?.type === 'booking') {
    const bookingItems = getBookingRequestItems(item);
    const firstItem = bookingItems[0] || {};
    const requestItemCount = bookingItems.reduce(
      (sum, bookingItem) => sum + getRemainingRequestItemQuantity(bookingItem),
      0
    ) || bookingItems.length || 1;
    const lines = [
      firstItem?.arrangementText ? `Arrangement: ${firstItem.arrangementText}` : null,
      firstItem?.preferredFlowers ? `Flowers: ${firstItem.preferredFlowers}` : null,
      firstItem?.eventDateText
        ? `Date: ${firstItem.eventDateText}${firstItem?.eventTimeText ? ` at ${firstItem.eventTimeText}` : ''}`
        : null,
      firstItem?.venueText ? `Venue: ${firstItem.venueText}` : null,
      firstItem?.destinationSummary
        ? `Delivery: ${firstItem.destinationSummary}`
        : (groupedDestinations.length > 1 ? `Delivery stops: ${groupedDestinations.length}` : null),
    ].filter(Boolean);

    return {
      title: `${requestItemCount} custom order item${requestItemCount === 1 ? '' : 's'}`,
      lines,
      badge: requestItemCount > 1 ? `${requestItemCount} items` : 'Custom Order',
    };
  }

  const requestData = normalizeRequestData(item);
  const occasionText = firstNonEmpty(requestData?.occasion, requestData?.otherOccasion);
  const lines = [
    occasionText ? `Occasion: ${occasionText}` : null,
    requestData?.flowerType ? `Flowers: ${requestData.flowerType}` : null,
    item?.delivery_method === 'delivery' && groupedDestinations.length > 1
      ? `Delivery stops: ${groupedDestinations.length}`
      : null,
    requestData?.notes || item?.notes || null,
  ].filter(Boolean);

  return {
    title: getStatusLabel(item?.type) || 'Request',
    lines,
    badge: item?.delivery_method === 'delivery' ? 'Delivery' : 'Pick-up',
  };
};

const RequestSummaryCard = React.memo(({
  item,
  activeActionKey,
  onMessageCustomer,
  onPhoneCall,
  onPrintReceipt,
  onOpenDetails,
  onProvidePrice,
  onDecline,
  onOpenStatus,
  onAssignRider,
  onAcceptPendingCustomized,
}) => {
  const isCustomizedRequest = item.type === 'customized';
  const groupedDestinations = item.delivery_method === 'delivery'
    ? getGroupedDestinationsForRequest(item)
    : [];
  const previewUri = getCompactRequestPreviewUri(item);
  const summary = getCompactRequestSummary(item);
  const customerContact = item.user_email || item.contact_number || item.user_phone || 'No contact on file';
  const paymentBadgeText = item.payment_status
    ? getPaymentStatusDisplay(item.payment_status, item.payment_method)
    : null;
  const isActionBusy = Boolean(activeActionKey);
  const canChangeStatus = !['pending', 'completed', 'cancelled', 'declined'].includes(item.status);
  const isAwaitingPayment = (item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method)
    && item.payment_status !== 'paid';

  return (
    <View style={styles.eoCard}>
      <View style={styles.eoCardHeader}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.eoLabel}>Request #{item.request_number}</Text>
          <Text style={styles.eoOrderId}>{getStatusLabel(item.type)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={[styles.eoDeliveryTypeBadge, { backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981' }]}>
              <Ionicons name={item.delivery_method === 'delivery' ? 'rocket-outline' : 'storefront-outline'} size={12} color="#fff" />
              <Text style={styles.eoDeliveryTypeBadgeText}>
                {item.delivery_method === 'delivery' ? 'Delivery' : 'Pick-up'}
              </Text>
            </View>
            <View style={[styles.eoPaymentStatus, { backgroundColor: '#111827' }]}>
              <Text style={styles.eoPaymentStatusText}>{formatRequestAmountBadge(item.final_price)}</Text>
            </View>
            {paymentBadgeText ? (
              <View style={[styles.eoPaymentStatus, { backgroundColor: '#EC4899' }]}>
                <Text style={styles.eoPaymentStatusText}>{paymentBadgeText}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={styles.eoDateBadge}>
            <Text style={styles.eoDateText}>{formatTimestamp(item.created_at)}</Text>
          </View>
          <View style={[styles.eoStatusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Ionicons name="time-outline" size={14} color="#fff" />
            <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.eoSection}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={[styles.eoItemImage, { width: 64, height: 64, borderRadius: 12, backgroundColor: '#F3F4F6' }]}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name={isCustomizedRequest ? 'flower-outline' : (item.type === 'booking' ? 'images-outline' : 'document-text-outline')}
                size={24}
                color="#6B7280"
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.customizedRequestItemMeta}>{summary.badge}</Text>
            <Text style={styles.eoItemName}>{summary.title}</Text>
            {summary.lines.slice(0, 3).map((line, index) => (
              <Text key={`${item.id}-summary-${index}`} style={styles.eoItemQuantity} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.eoSection, { paddingTop: 14, paddingBottom: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eoCustomerName} numberOfLines={1}>{item.user_name || 'Unknown customer'}</Text>
            <Text style={styles.eoItemQuantity} numberOfLines={1}>{customerContact}</Text>
            {groupedDestinations.length > 1 ? (
              <Text style={[styles.eoItemQuantity, { marginTop: 4 }]}>
                Multi-stop delivery: {groupedDestinations.length} destinations
              </Text>
            ) : null}
          </View>
          <View style={styles.eoActionButtons}>
            <TouchableOpacity
              style={{ backgroundColor: '#6B7280', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => onPrintReceipt(item)}
            >
              <Ionicons name="print" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.eoIconBtnGreen} onPress={() => onPhoneCall(item.contact_number || item.user_phone)}>
              <Ionicons name="call" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eoIconBtnBlue}
              onPress={() => onMessageCustomer(item.users, item.user_name, item.user_email)}
            >
              <Ionicons name="chatbubble" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.eoFooter}>
        <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => onOpenDetails(item)}>
          <Ionicons name="eye" size={18} color="#fff" />
          <Text style={styles.eoMainBtnText}>View Details</Text>
        </TouchableOpacity>

        {item.status === 'pending' && item.type === 'customized' ? (
          <View style={[styles.customizedRequestActionRow, { marginTop: 10 }]}>
            <TouchableOpacity
              style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: isActionBusy ? '#9CA3AF' : '#10B981' }]}
              disabled={isActionBusy}
              onPress={() => onAcceptPendingCustomized(item)}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444' }]}
              disabled={isActionBusy}
              onPress={() => onDecline(item)}
            >
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {item.type === 'booking' && !['completed', 'cancelled', 'declined', 'out_for_delivery', 'ready_for_pickup', 'ready_for_pick_up', 'claimed'].includes(item.status) ? (
          <>
            <TouchableOpacity
              style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#F59E0B', marginTop: 10 }]}
              disabled={isActionBusy}
              onPress={() => onProvidePrice(item)}
            >
              <Text style={styles.eoMainBtnText}>{item.status === 'pending' ? 'Provide Price' : 'Edit Breakdown'}</Text>
            </TouchableOpacity>
            {item.status === 'pending' ? (
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444', marginTop: 10 }]}
                disabled={isActionBusy}
                onPress={() => onDecline(item)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {item.status === 'pending' && item.type === 'special_order' ? (
          <>
            <TouchableOpacity
              style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#F59E0B', marginTop: 10 }]}
              disabled={isActionBusy}
              onPress={() => onProvidePrice(item)}
            >
              <Text style={styles.eoMainBtnText}>Provide Price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444', marginTop: 10 }]}
              disabled={isActionBusy}
              onPress={() => onDecline(item)}
            >
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Decline</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {canChangeStatus ? (
          <TouchableOpacity
            style={[
              styles.eoMainBtn,
              {
                marginTop: 10,
                backgroundColor: isActionBusy || isAwaitingPayment ? '#9CA3AF' : '#3B82F6',
              },
            ]}
            disabled={isActionBusy || isAwaitingPayment}
            onPress={() => onOpenStatus(item)}
          >
            <Ionicons name="git-network-outline" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>Change Status</Text>
          </TouchableOpacity>
        ) : null}

        {item.delivery_method === 'delivery' && item.status === 'processing' ? (
          <TouchableOpacity
            style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#10B981', marginTop: 10 }]}
            disabled={isActionBusy}
            onPress={() => onAssignRider(item)}
          >
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>{groupedDestinations.length > 0 ? 'Assign Stop Riders' : 'Assign Rider'}</Text>
          </TouchableOpacity>
        ) : null}

        {isAwaitingPayment && canChangeStatus ? (
          <Text style={styles.eoActionHint}>
            Wait for payment confirmation before changing the request status.
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const getCustomizedItemTotalPrice = (item = {}) => {
  const priceCandidates = [
    item?.price,
    item?.total_price,
    item?.line_total,
    item?.lineTotal,
    item?.total,
    item?.final_price,
  ];

  for (const candidate of priceCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') {
      continue;
    }

    return parseCurrencyNumber(candidate);
  }

  return null;
};

const formatAddressParts = (address = {}) => (
  [address?.street, address?.barangay, address?.city, address?.province, address?.zip]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
);

const getBookingRecipientText = (item = {}, fallbackValue = null) => firstNonEmpty(
  item?.recipientName,
  item?.recipient_name,
  fallbackValue
);

const getBookingEventDateText = (item = {}, fallbackValue = null) => firstNonEmpty(
  item?.eventDate,
  item?.event_date,
  fallbackValue
);

const getBookingEventTimeText = (item = {}, fallbackValue = null) => firstNonEmpty(
  item?.eventTime,
  item?.event_time,
  fallbackValue
);

const getBookingVenueText = (item = {}, fallbackValue = null) => firstNonEmpty(
  item?.venue,
  typeof item?.deliveryAddress === 'string' ? item.deliveryAddress : null,
  item?.delivery_address,
  fallbackValue
);

const getBookingSpecialInstructionsText = (item = {}, requestData = {}, request = {}) => firstNonEmpty(
  item?.specialInstructions,
  item?.special_instructions,
  item?.notes,
  requestData?.specialInstructions,
  requestData?.special_instructions,
  request?.notes
);

const getBookingArrangementText = (item = {}) => {
  const unitLabel = String(item?.unit_label || item?.unitLabel || '').trim();
  if (unitLabel && String(item?.name || '').trim()) {
    return String(item.name).trim();
  }

  const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];

  if (arrangementSelections.length) {
    return arrangementSelections
      .map((selection) => {
        const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
        const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
        if (!label) return null;
        return quantity > 1 ? `${label} x${quantity}` : label;
      })
      .filter(Boolean)
      .join(', ');
  }

  if (item?.arrangementType === 'Other') {
    return item?.otherArrangementType || null;
  }

  return firstNonEmpty(
    item?.arrangementSummary,
    item?.arrangementType,
    item?.arrangement_type,
    Array.isArray(item?.arrangementTypes) ? item.arrangementTypes.join(', ') : null
  );
};

const getBookingFlowerText = (item = {}) => {
  const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];
  if (arrangementSelections.length) {
    const preferredFlowers = Array.from(
      new Set(
        arrangementSelections.flatMap((selection) => getArrangementSelectionPreferredFlowerNames(
          selection,
          firstNonEmpty(item?.otherFlowersText, item?.other_flowers_text) || ''
        ))
      )
    );

    if (preferredFlowers.length) {
      return preferredFlowers.join(', ');
    }
  }

  const preferredFlowers = getBookingPreferredFlowerNames(item);
  return preferredFlowers.length ? preferredFlowers.join(', ') : null;
};

const getBookingColorText = (item = {}) => {
  const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];
  if (arrangementSelections.length) {
    const arrangementColorEntries = arrangementSelections.map((selection) => {
      const arrangementLabel = firstNonEmpty(
        selection?.arrangement_label,
        selection?.arrangementLabel,
        selection?.arrangement_type,
        selection?.arrangementType
      );
      const colorValue = firstNonEmpty(
        selection?.colorPreference,
        selection?.color_preference,
        selection?.rawColorPreference,
        selection?.raw_color_preference
      );

      if (!arrangementLabel || !colorValue) return null;
      return `${arrangementLabel}: ${colorValue}`;
    }).filter(Boolean);

    if (arrangementColorEntries.length) {
      return arrangementColorEntries.join(' | ');
    }
  }

  return firstNonEmpty(item?.colorPreference, item?.color_preference);
};

const getBookingRequestItems = (request) => {
  const requestData = normalizeRequestData(request);
  const sourceItems = getBookingItemsFromData(requestData);
  const multiDeliveryDestinations = Array.isArray(requestData.multi_delivery_destinations)
    ? requestData.multi_delivery_destinations
    : [];
  const sharedRecipientText = getBookingRecipientText(requestData);
  const sharedAddressText = formatAddressParts(requestData.address || {});
  const sharedEventDateText = getBookingEventDateText(requestData);
  const sharedEventTimeText = getBookingEventTimeText(requestData);

  return sourceItems.map((item, index) => {
    const itemDestinations = multiDeliveryDestinations.filter(
      (destination) => String(destination?.item_index ?? '') === String(index)
    );
    const primaryDestination = itemDestinations[0] || null;
    const assignedRiderIds = Array.from(
      new Set(
        itemDestinations
          .map((destination) => String(destination?.assigned_rider_id || '').trim())
          .filter(Boolean)
      )
    );

    const destinationSummary = primaryDestination
      ? [
        firstNonEmpty(primaryDestination.recipient_name, primaryDestination.address_label),
        formatAddressParts(primaryDestination.address_snapshot || {}),
      ].filter(Boolean).join(' - ')
      : sharedAddressText;

    return {
      ...item,
      key: String(item?.id || `${request?.id || 'booking'}-${index}`),
      itemIndex: index,
      label: String(item?.unit_label || item?.unitLabel || '').trim()
        ? (firstNonEmpty(item?.name, item?.title) || `Custom Order ${index + 1}`)
        : `Custom Order ${index + 1}`,
      title: firstNonEmpty(item?.name, getBookingArrangementText(item), item?.occasion) || `Custom Order ${index + 1}`,
      imageUri: toAbsoluteImageUrl(item?.image_url || item?.image || request?.image_url),
      arrangementText: getBookingArrangementText(item),
      preferredFlowers: getBookingFlowerText(item),
      recipientText: getBookingRecipientText(item, primaryDestination?.recipient_name || sharedRecipientText),
      eventDateText: getBookingEventDateText(item, sharedEventDateText),
      eventTimeText: getBookingEventTimeText(item, sharedEventTimeText),
      venueText: getBookingVenueText(item, sharedAddressText),
      destinationSummary,
      assignedRiderIds,
    };
  });
};

const getCustomizedRequestItems = (request) => {
  const requestData = normalizeRequestData(request);
  const hasLegacyCustomizedItem =
    requestData.bundleSize ||
    requestData.flower ||
    requestData.wrapper ||
    requestData.ribbon ||
    requestData.image_url ||
    request?.image_url;

  const sourceItems = Array.isArray(requestData.items) && requestData.items.length
    ? requestData.items
    : hasLegacyCustomizedItem
      ? [{
        name: requestData.bundleSize ? `Customized Bouquet (${requestData.bundleSize} stems)` : 'Customized Bouquet',
        flowers: requestData.flower ? [requestData.flower] : [],
        bundleSize: requestData.bundleSize ?? null,
        wrapper: requestData.wrapper ?? null,
        ribbon: requestData.ribbon ?? null,
        image_url: requestData.image_url || request?.image_url || null,
        price: requestData.price ?? null,
        message: requestData.message ?? '',
      }]
      : [];

  const multiDeliveryDestinations = Array.isArray(requestData.multi_delivery_destinations)
    ? requestData.multi_delivery_destinations
    : [];
  const sharedRecipientName = firstNonEmpty(
    requestData.address?.name,
    requestData.recipient_name,
    requestData.recipientName
  );
  const sharedAddressText = formatAddressParts(requestData.address || {});

  return sourceItems.map((item, index) => {
    const rawFlowers = Array.isArray(item?.flowers)
      ? item.flowers
      : item?.flower
        ? [item.flower]
        : [];
    const flowersText = normalizeFlowerNames(rawFlowers, requestData.otherFlowersText).join(', ');
    const wrapperName = getNamedValue(item?.wrapper) || getNamedValue(requestData.wrapper);
    const ribbonName = getNamedValue(item?.ribbon) || getNamedValue(requestData.ribbon);
    const bundleSize = toPositiveInt(item?.bundleSize, 0) || toPositiveInt(requestData.bundleSize, 0);
    const itemDestinations = multiDeliveryDestinations.filter(
      (destination) => String(destination?.item_index ?? '') === String(index)
    );
    const primaryDestination = itemDestinations[0] || null;
    const assignedRiderIds = Array.from(
      new Set(
        itemDestinations
          .map((destination) => String(destination?.assigned_rider_id || '').trim())
          .filter(Boolean)
      )
    );
    const recipientName = primaryDestination
      ? firstNonEmpty(primaryDestination.recipient_name, primaryDestination.address_label)
      : sharedRecipientName;
    const addressText = primaryDestination
      ? formatAddressParts(primaryDestination.address_snapshot || {})
      : sharedAddressText;
    const destinationSummary = [recipientName, addressText].filter(Boolean).join(' - ');
    const originalQuantity = toPositiveInt(
      item?.original_quantity ?? item?.quantity ?? item?.qty,
      1
    );
    const remainingQuantity = getRemainingRequestItemQuantity(item);
    const totalPrice = getCustomizedItemTotalPrice(item);
    const remainingPrice = totalPrice !== null && originalQuantity > 0
      ? totalPrice * (remainingQuantity / originalQuantity)
      : null;
    const title = String(item?.name || '').trim() || (
      bundleSize ? `Customized Bouquet (${bundleSize} stems)` : `Customized Bouquet ${index + 1}`
    );
    const materialsSummary = [
      flowersText ? `Flowers: ${flowersText}` : null,
      wrapperName ? `Wrapper: ${wrapperName}` : null,
      ribbonName ? `Ribbon: ${ribbonName}` : null,
    ].filter(Boolean).join(' | ');

    return {
      ...item,
      key: String(item?.id || item?.listId || `${request?.id || 'customized'}-${index}`),
      itemIndex: index,
      label: `Bouquet ${index + 1}`,
      title,
      imageUri: toAbsoluteImageUrl(item?.image_url || item?.image || item?.photo || request?.image_url),
      previewComposition: item?.previewComposition || item?.preview_composition || null,
      flowersText,
      wrapperName,
      ribbonName,
      bundleSize,
      bundleSizeText: bundleSize ? `${bundleSize} stems` : null,
      priceText: remainingPrice !== null ? `PHP ${remainingPrice.toFixed(2)}` : null,
      recipientName,
      addressText,
      destinationSummary,
      assignedRiderIds,
      cardMessage: firstNonEmpty(item?.card_message, item?.cardMessage, item?.message, requestData.message),
      materialsSummary,
    };
    });
};

const getRefundStatusLabel = (status) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'requested':
      return 'Pending Admin Review';
    case 'approved':
      return 'Approved';
    case 'gcash_submitted':
      return 'GCash Details Submitted';
    case 'processing':
      return 'Processing';
    case 'refunded':
      return 'Refunded';
    case 'rejected':
      return 'Rejected';
    default:
      return 'No Refund';
  }
};

const maskGcashNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return 'Not submitted';
  }

  return digits.length <= 4
    ? digits
    : `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const getNormalizedRequestPaymentMethod = (request) => {
  const paymentMethod = request?.payment_method || request?.data?.payment_method || '';
  return String(paymentMethod).trim().toLowerCase();
};

const getRequestActionKey = (action, requestId) => `${action}:${requestId || 'unknown'}`;

const resolveAcceptedRequestStatus = (request) => {
  if (!request) return 'accepted';

  const paymentMethod = getNormalizedRequestPaymentMethod(request);
  const paymentStatus = String(request.payment_status || '').trim().toLowerCase();
  const isCustomized = request.type === 'customized';

  if (isCustomized && (paymentMethod === 'cod' || paymentStatus === 'paid')) {
    return 'processing';
  }

  return 'accepted';
};

const RequestsTab = ({ currentUser, handleSelectCustomerForMessage, focusedEntityTarget, clearFocusedEntityTarget }) => {
  const { height: screenHeight } = useWindowDimensions();

  const handlePhoneCall = React.useCallback((phoneNumber) => {
    if (phoneNumber && phoneNumber !== 'N/A' && phoneNumber.trim() !== '') {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'This customer does not have a valid phone number on file.');
    }
  }, []);

  const handleMessageCustomer = React.useCallback((user, customerName, customerEmail) => {
    if (!user || !user.id) {
      Alert.alert('Cannot message user', 'User information is incomplete.');
      return;
    }
    handleSelectCustomerForMessage({ id: user.id, name: customerName, email: customerEmail });
  }, [handleSelectCustomerForMessage]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listErrorMessage, setListErrorMessage] = useState('');
  const [hasMoreRequests, setHasMoreRequests] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeActionKey, setActiveActionKey] = useState(null);
  const actionLockRef = useRef(null);
  const requestsLoadInProgressRef = useRef(false);
  const loadRequestsRef = useRef(null);
  const pendingRefreshTimeoutRef = useRef(null);
  const queuedRequestsRefreshRef = useRef(false);
  const initialRequestsLoadRef = useRef(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedRequestLoading, setSelectedRequestLoading] = useState(false);
  const [selectedCustomizedItem, setSelectedCustomizedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [customizedItemModalVisible, setCustomizedItemModalVisible] = useState(false);
  const [requestStatusModalVisible, setRequestStatusModalVisible] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState(null);
  const [selectedRequestStatus, setSelectedRequestStatus] = useState(null);
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [requestToQuote, setRequestToQuote] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteShippingFee, setQuoteShippingFee] = useState('');
  const [quoteFlowerContext, setQuoteFlowerContext] = useState(null);
  const [quoteManualRows, setQuoteManualRows] = useState([]);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [requestToDecline, setRequestToDecline] = useState(null);
  const [declineFeedback, setDeclineFeedback] = useState('');
  const [declineAction, setDeclineAction] = useState('decline');
  const [isDeclining, setIsDeclining] = useState(false);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [requestToRecordPayment, setRequestToRecordPayment] = useState(null);
  const [isEditPaymentMode, setIsEditPaymentMode] = useState(false);

  const [riders, setRiders] = useState([]);
  const ridersLoadInProgressRef = useRef(false);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [requestToAssignRider, setRequestToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const [selectedStopGroupKey, setSelectedStopGroupKey] = useState(null);
  const [stopRiderAssignments, setStopRiderAssignments] = useState({});
  const [deliveryStopModalVisible, setDeliveryStopModalVisible] = useState(false);
  const [requestToCompleteStops, setRequestToCompleteStops] = useState(null);
  const [selectedDeliveryStopKey, setSelectedDeliveryStopKey] = useState(null);
  const [selectedDeliveryProof, setSelectedDeliveryProof] = useState(null);
  const [deliveryProofNote, setDeliveryProofNote] = useState('');
  const [isCompletingDeliveryStop, setIsCompletingDeliveryStop] = useState(false);

  const filteredAndSortedRiders = React.useMemo(() => {
    let result = [...riders];
    if (riderSearchQuery) {
      result = result.filter(rider =>
        rider.name.toLowerCase().includes(riderSearchQuery.toLowerCase()) ||
        (rider.email && rider.email.toLowerCase().includes(riderSearchQuery.toLowerCase()))
      );
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [riders, riderSearchQuery]);

  const riderLookup = React.useMemo(
    () => Object.fromEntries(riders.map((rider) => [String(rider.id), rider])),
    [riders]
  );

  const runRequestAction = React.useCallback(async (actionKey, action) => {
    if (actionLockRef.current) {
      return;
    }

    actionLockRef.current = actionKey;
    setActiveActionKey(actionKey);

    try {
      await action();
    } finally {
      actionLockRef.current = null;
      setActiveActionKey(null);
    }
  }, []);

  const loadRiders = React.useCallback(async ({ force = false } = {}) => {
    if (ridersLoadInProgressRef.current || (riders.length && !force)) {
      return riders;
    }

    ridersLoadInProgressRef.current = true;

    const buildRidersQuery = (options = {}) => supabase
      .from('users')
      .select([
        'id',
        'name',
        ...(options.includeEmail !== false ? ['email'] : []),
        ...(options.includePhone !== false ? ['phone'] : []),
      ].join(', '))
      .eq('role', 'employee')
      .order('name', { ascending: true });

    let queryOptions = {
      includeEmail: true,
      includePhone: true,
    };

    try {
      let { data, error } = await buildRidersQuery(queryOptions);

      let shouldRetry = true;
      while (error && shouldRetry) {
        shouldRetry = false;

        if (queryOptions.includeEmail !== false && /email/i.test(String(error?.message || '')) && /users/i.test(String(error?.message || ''))) {
          queryOptions = { ...queryOptions, includeEmail: false };
          ({ data, error } = await buildRidersQuery(queryOptions));
          shouldRetry = Boolean(error);
          continue;
        }

        if (queryOptions.includePhone !== false && /phone/i.test(String(error?.message || '')) && /users/i.test(String(error?.message || ''))) {
          queryOptions = { ...queryOptions, includePhone: false };
          ({ data, error } = await buildRidersQuery(queryOptions));
          shouldRetry = Boolean(error);
        }
      }

      if (error) throw error;

      const nextRiders = Array.isArray(data) ? data : [];
      setRiders(nextRiders);
      return nextRiders;
    } catch (error) {
      console.error('Error loading riders:', error);
      Toast.show({ type: 'error', text1: 'Failed to load riders' });
      return [];
    } finally {
      ridersLoadInProgressRef.current = false;
    }
  }, [riders]);

  const getGroupedDestinations = React.useCallback(
    (request) => getGroupedDestinationsForRequest(request),
    []
  );

  const getNormalizedStopDestinations = React.useCallback((request) => {
    const requestData = normalizeRequestData(request);
    return normalizeDeliveryDestinations(requestData?.multi_delivery_destinations || []);
  }, []);

  const getInitialStopRiderAssignments = React.useCallback((request) => {
    const groupedDestinations = getGroupedDestinations(request);
    const fallbackRiderId = request?.assigned_rider ? String(request.assigned_rider) : '';

    return Object.fromEntries(
      groupedDestinations.map((group) => [
        group.groupKey,
        group.assignedRiderIds?.[0] || fallbackRiderId || '',
      ])
    );
  }, [getGroupedDestinations]);

  const getAssignedRiderNamesForGroup = React.useCallback((group, request) => {
    const explicitRiderIds = Array.isArray(group?.assignedRiderIds) ? group.assignedRiderIds : [];
    const fallbackRiderId = explicitRiderIds.length
      ? null
      : (request?.assigned_rider ? String(request.assigned_rider) : null);
    const riderIds = explicitRiderIds.length ? explicitRiderIds : (fallbackRiderId ? [fallbackRiderId] : []);

    return riderIds
      .map((riderId) => riderLookup[String(riderId)]?.name)
      .filter(Boolean);
  }, [riderLookup]);

  const hasRequiredRiderAssignments = React.useCallback((request) => {
    const groupedDestinations = getGroupedDestinations(request);

    if (!groupedDestinations.length) {
      return Boolean(request?.rider || request?.assigned_rider);
    }

    return groupedDestinations.every((group) => {
      const explicitRiderIds = Array.isArray(group?.assignedRiderIds)
        ? group.assignedRiderIds.filter(Boolean)
        : [];
      return explicitRiderIds.length > 0 || Boolean(request?.assigned_rider);
    });
  }, [getGroupedDestinations]);

  const requestsWithRiderDetails = React.useMemo(() => {
    if (!requests.length || !riders.length) return requests;
    return requests.map(request => {
      if (request.assigned_rider) {
        const riderDetails = riders.find(r => r.id === request.assigned_rider);
        return { ...request, rider: riderDetails || null };
      }
      return request;
    });
  }, [requests, riders]);

  const riderScopedRequests = React.useMemo(() => {
    if (currentUser?.role !== 'employee') {
      return requestsWithRiderDetails;
    }

    return requestsWithRiderDetails
      .map((request) => (
        shouldRestrictRequestToAssignedRider(request, normalizeRequestData)
          ? filterRequestForAssignedRider(request, currentUser?.id, normalizeRequestData)
          : request
      ))
      .filter(Boolean);
  }, [currentUser?.id, currentUser?.role, requestsWithRiderDetails]);

  const assignableStopGroups = React.useMemo(
    () => requestToAssignRider ? getGroupedDestinations(requestToAssignRider) : [],
    [requestToAssignRider, getGroupedDestinations]
  );
  const deliveryStopModalStops = React.useMemo(
    () => (
      requestToCompleteStops
        ? getNormalizedStopDestinations(requestToCompleteStops).filter((stop) => stop.confirmation_owner)
        : []
    ),
    [getNormalizedStopDestinations, requestToCompleteStops]
  );
  const selectedDeliveryStop = React.useMemo(
    () => deliveryStopModalStops.find((stop) => stop.unit_key === selectedDeliveryStopKey) || null,
    [deliveryStopModalStops, selectedDeliveryStopKey]
  );

  const selectedStopGroup = React.useMemo(
    () => assignableStopGroups.find((group) => group.groupKey === selectedStopGroupKey) || null,
    [assignableStopGroups, selectedStopGroupKey]
  );

  const isStopAssignmentMode = assignableStopGroups.length > 0;
  const assignRiderModalMaxHeight = Math.max(420, Math.min(screenHeight - 36, 760));
  const assignRiderStopListMaxHeight = Math.max(120, Math.min(screenHeight * 0.22, 220));
  const assignRiderListMaxHeight = Math.max(180, Math.min(screenHeight * 0.34, 320));
  const deliveryStopModalMaxHeight = Math.max(460, Math.min(screenHeight - 36, 780));
  const deliveryStopListMaxHeight = Math.max(180, Math.min(screenHeight * 0.32, 280));

  const filteredRequests = React.useMemo(() => {
    let result = riderScopedRequests;
    if (statusFilter !== 'All') {
      result = result.filter(req => {
        const status = req.status;
        switch (statusFilter) {
          case 'Pending': return status === 'pending';
          case 'Quoted / Acc': return status === 'quoted' || status === 'accepted';
          case 'Processing': return status === 'processing' || status === 'partial';
          case 'Delivery/Pickup': return status === 'out_for_delivery' || status === 'ready_for_pickup';
          case 'Completed': return status === 'completed' || status === 'claimed';
          case 'Cancelled': return status === 'cancelled' || status === 'declined';
          default: return true;
        }
      });
    }
    return result;
  }, [riderScopedRequests, statusFilter]);

  const focusedRequest = React.useMemo(() => {
    if (focusedEntityTarget?.entityType !== 'request' || !focusedEntityTarget?.entityId) {
      return null;
    }

    return riderScopedRequests.find(
      (request) => String(request.id) === String(focusedEntityTarget.entityId)
    ) || null;
  }, [focusedEntityTarget, riderScopedRequests]);

  const displayedRequests = focusedRequest ? [focusedRequest] : filteredRequests;

  const requestStatusFilters = ['All', 'Pending', 'Quoted / Acc', 'Processing', 'Delivery/Pickup', 'Completed', 'Cancelled'];

  const requestDeliveryStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Request received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'out_for_delivery', label: 'Out for Delivery', description: 'On the way' },
    { id: 'completed', label: 'Completed', description: 'Delivered successfully' }
  ];

  const requestPickupStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Request received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'ready_for_pickup', label: 'Ready for Pick Up', description: 'Ready for customer' },
    { id: 'completed', label: 'Completed', description: 'Request has been picked up' }
  ];

  const queueRequestsRefresh = React.useCallback(() => {
    if (pendingRefreshTimeoutRef.current) {
      return;
    }

    pendingRefreshTimeoutRef.current = setTimeout(() => {
      pendingRefreshTimeoutRef.current = null;
      if (requestsLoadInProgressRef.current) {
        queuedRequestsRefreshRef.current = true;
      } else if (typeof loadRequestsRef.current === 'function') {
        loadRequestsRef.current({ showLoader: false });
      }
    }, 800);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (typeof loadRequestsRef.current === 'function') {
        loadRequestsRef.current();
      }

      const channel = supabase
        .channel('public:requests')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'requests' },
          queueRequestsRefresh
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current);
          pendingRefreshTimeoutRef.current = null;
        }
      };
    }, [queueRequestsRefresh])
  );

  const openReceiptModal = React.useCallback((url) => {
    const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setSelectedReceiptUrl(finalUrl);
    setReceiptModalVisible(true);
  }, []);

  const handlePrintReceipt = React.useCallback((requestItem) => {
    generateAndShareReceipt(requestItem, true);
  }, []);


  const renderPickupTimeSection = (request) => {
    if (request.delivery_method !== 'pickup') return null;
    return (
      <>
        <DetailSection label="Pickup Location:" value="Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City" />
        {request.pickup_time && <DetailSection label="Pickup Time:" value={request.pickup_time} />}
      </>
    );
  };

  const renderBookingDetails = (request) => {
    const requestData = normalizeRequestData(request);
    const bookingItems = getBookingItemsFromData(requestData);
    const normalizedItems = bookingItems.length ? bookingItems : [requestData];
    const uniqueValues = (values = []) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    const declineFeedback = firstNonEmpty(requestData.decline_feedback, requestData.declineFeedback);
    const multiDeliveryCount = Array.isArray(requestData.multi_delivery_destinations) ? requestData.multi_delivery_destinations.length : 0;
    const combinedOccasion = uniqueValues(normalizedItems.map((item) => item.occasion || item.otherOccasion)).join(', ');
    const sharedAddressText = formatAddressParts(requestData.address || {});
    const combinedVenue = uniqueValues(normalizedItems.map((item) => getBookingVenueText(item, sharedAddressText))).join(', ');
    const combinedEventDate = uniqueValues(normalizedItems.map((item) => getBookingEventDateText(item, getBookingEventDateText(requestData)))).join(', ');
    const combinedRecipients = uniqueValues(normalizedItems.map((item) => getBookingRecipientText(item, getBookingRecipientText(requestData)))).join(', ');

    return (
      <>
        <DetailSection label="Type:" value={getStatusLabel(request.type)} />
        <DetailSection label="Submitted:" value={formatTimestamp(request.created_at)} />
        <DetailSection label="Request Number:" value={request.request_number} />
        <DetailSection label="Customer Name:" value={request.user_name} />
        <DetailSection label="Customer Email:" value={request.user_email} />
        <DetailSection label="Contact Number:" value={firstNonEmpty(request.contact_number, request.user_phone, requestData.contactNumber, requestData.contact_number)} />
        {normalizedItems.length <= 1 && <DetailSection label="Occasion:" value={combinedOccasion} />}
        {normalizedItems.length <= 1 && <DetailSection label="Venue:" value={combinedVenue} />}
        {normalizedItems.length <= 1 && <DetailSection label="Recipient:" value={combinedRecipients} />}
        {normalizedItems.length <= 1 && <DetailSection label="Event Date:" value={combinedEventDate} />}
        <DetailSection label="Custom Order Items:" value={normalizedItems.length > 1 ? String(normalizedItems.length) : null} />
        <DetailSection label="Delivery Stops:" value={multiDeliveryCount ? String(multiDeliveryCount) : null} />
        <DetailSection label="Decline Feedback:" value={declineFeedback} />
        {normalizedItems.map((item, index) => {
          const arrangementSelections = Array.isArray(item.arrangementSelections) ? item.arrangementSelections : [];
          const arrangementType = firstNonEmpty(
            item.arrangementSummary,
            arrangementSelections.length
              ? arrangementSelections.map((selection) => {
                const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
                const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
                return label ? `${label} x${quantity}` : null;
              }).filter(Boolean).join(', ')
              : null,
            item.arrangementType,
            item.arrangement_type,
            (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : null)
          );
          const arrangementQuantity = firstNonEmpty(
            item.arrangementQuantity,
            arrangementSelections.length ? arrangementSelections.reduce((sum, selection) => sum + toPositiveInt(selection?.quantity, 1), 0) : null,
            item.arrangement_quantity
          );
          const remainingQuantity = getRemainingRequestItemQuantity(item);
          const cancelledQuantity = getCancelledRequestItemQuantity(item);
          const colorTheme = getBookingColorText(item);
          const preferredFlowers = getBookingFlowerText(item);
          const tentativeBreakdown = getTentativeBreakdown(item);
          const customOrderVersion = item.custom_order_version || requestData.custom_order_version;
          const isBudgetAwareCustomOrder = customOrderVersion === 2 || customOrderVersion === 4;
          const hasBudgetAwareDetails = Boolean(
            item.originalEstimatedPrice != null
            || item.customerBudget != null
            || item.estimatedPrice != null
            || item.selectedOptionLabel
            || item.selectedAlternativeId
            || item.originalPreviewImage
            || item.selectedPreviewImage
            || (Array.isArray(item.suggestedAlternatives) && item.suggestedAlternatives.length)
          );
          const showBudgetAwareDetails = isBudgetAwareCustomOrder && hasBudgetAwareDetails;
          const selectedAlternative = Array.isArray(item.suggestedAlternatives)
            ? item.suggestedAlternatives.find((alternative) => alternative.id === item.selectedAlternativeId)
            : null;

          return (
            <View key={item.id || `booking-item-${index}`} style={styles.customizedRequestDetailCard}>
              <Text style={styles.customizedRequestItemMeta}>
                {normalizedItems.length > 1 ? `Custom Order Item ${index + 1}` : 'Custom Order Details'}
              </Text>
              {toAbsoluteImageUrl(item.image_url || item.image || request.image_url) ? (
                <View style={styles.imageSection}>
                  <Image
                    source={{ uri: toAbsoluteImageUrl(item.image_url || item.image || request.image_url) }}
                    style={styles.fullImage}
                    resizeMode="contain"
                  />
                </View>
              ) : null}
              {showBudgetAwareDetails && (toAbsoluteImageUrl(item.originalPreviewImage) || toAbsoluteImageUrl(item.selectedPreviewImage)) ? (
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  {toAbsoluteImageUrl(item.originalPreviewImage) ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailLabel}>Original Preview</Text>
                      <Image
                        source={{ uri: toAbsoluteImageUrl(item.originalPreviewImage) }}
                        style={[styles.fullImage, { height: 120, marginTop: 4 }]}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                  {toAbsoluteImageUrl(item.selectedPreviewImage) ? (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailLabel}>Selected Preview</Text>
                      <Image
                        source={{ uri: toAbsoluteImageUrl(item.selectedPreviewImage) }}
                        style={[styles.fullImage, { height: 120, marginTop: 4 }]}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.customizedRequestDetailTitle}>
                {item.name || item.arrangementSummary || item.arrangementType || item.occasion || 'Custom Order'}
              </Text>
              <DetailSection label="Recipient:" value={getBookingRecipientText(item, getBookingRecipientText(requestData))} />
              <DetailSection label="Occasion:" value={firstNonEmpty(item.occasion, item.otherOccasion)} />
              <DetailSection label="Event Date:" value={getBookingEventDateText(item, getBookingEventDateText(requestData))} />
              <DetailSection label="Event Time:" value={getBookingEventTimeText(item, getBookingEventTimeText(requestData))} />
              <DetailSection label="Venue:" value={getBookingVenueText(item, sharedAddressText)} />
              <DetailSection label="Arrangement:" value={arrangementType} />
              <DetailSection label="Quantity:" value={String(remainingQuantity)} />
              <DetailSection label="Cancelled Quantity:" value={cancelledQuantity ? String(cancelledQuantity) : null} />
              {tentativeBreakdown.lineItems.length ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Tentative Breakdown</Text>
                  <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 12, marginTop: 6 }}>
                    {tentativeBreakdown.lineItems.map((lineItem) => (
                      <View key={lineItem.key} style={{ marginBottom: 10 }}>
                        <View>
                          <Text style={styles.detailValue}>{`${lineItem.label} x${lineItem.quantity}`}</Text>
                          <Text style={[styles.detailValue, { marginTop: 2 }]}>{lineItem.formattedLineRange}</Text>
                        </View>
                        <Text style={[styles.detailLabel, { marginTop: 2, textTransform: 'none', letterSpacing: 0 }]}>Each: {lineItem.formattedUnitRange}</Text>
                      </View>
                    ))}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#f3d7e3', paddingTop: 10, marginTop: 2 }}>
                      <Text style={styles.detailLabel}>Tentative Subtotal</Text>
                      <Text style={styles.detailValue}>{tentativeBreakdown.formattedSubtotalRange}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
              <DetailSection label="Preferred Flowers:" value={preferredFlowers} />
              <DetailSection label="Original Target Price:" value={showBudgetAwareDetails ? `PHP ${parseCurrencyNumber(item.originalEstimatedPrice).toFixed(2)}` : null} />
              <DetailSection label="Customer Budget:" value={showBudgetAwareDetails ? `PHP ${parseCurrencyNumber(item.customerBudget).toFixed(2)}` : null} />
              <DetailSection label="Preferred Version:" value={showBudgetAwareDetails ? firstNonEmpty(item.selectedOptionLabel, selectedAlternative?.label, 'Original target design') : null} />
              <DetailSection label="Rough Estimate:" value={showBudgetAwareDetails ? `PHP ${parseCurrencyNumber(item.estimatedPrice || selectedAlternative?.estimatedPrice).toFixed(2)}` : null} />
              <DetailSection label="Color Theme:" value={colorTheme} />
              <DetailSection label="Special Instructions:" value={getBookingSpecialInstructionsText(item, requestData, request)} />
              {showBudgetAwareDetails && selectedAlternative?.changes?.length ? (
                <DetailSection
                  label="What Changed:"
                  value={selectedAlternative.changes.map((change) => change.explanation).join('\n')}
                />
              ) : null}
            </View>
          );
        })}
        {renderPickupTimeSection(request)}
      </>
    );
  };

  const renderSpecialOrderDetails = (request) => (
    <>
      <DetailSection label="Request Number:" value={request.request_number} />
      <DetailSection label="Customer Name:" value={request.user_name} />
      <DetailSection label="Customer Email:" value={request.user_email} />
      <DetailSection label="Contact Number:" value={request.contact_number} />
      <DetailSection label="Recipient Name:" value={request.data?.recipient_name} />
      <DetailSection label="Occasion:" value={request.data?.occasion} />
      <DetailSection label="Event Date:" value={request.data?.event_date} />
      <DetailSection label="Delivery Address:" value={request.data?.deliveryAddress} />
      <DetailSection label="Preferences:" value={request.notes} />
      <DetailSection label="Message for Card:" value={request.data?.message} />
      <DetailSection
        label="Add-ons:"
        value={
          request.data?.addons && request.data.addons.length
            ? request.data.addons.join(', ')
            : 'None'
        }
      />
      {renderPickupTimeSection(request)}
    </>
  );

  const renderCustomizedDetails = (request) => {
    const customizedItems = getCustomizedRequestItems(request);
    const customizedQuantityTotal = customizedItems.reduce((sum, item) => sum + getRemainingRequestItemQuantity(item), 0);

    return (
      <>
        <DetailSection label="Customer Email:" value={request.user_email} />
        <DetailSection label="Contact Number:" value={request.contact_number || request.user_phone} />
        <DetailSection
          label="Delivery Method:"
          value={request.delivery_method === 'delivery' ? 'Delivery' : 'Pick-up'}
        />
        <DetailSection
                  label="Customizer Studio:"
          value={customizedQuantityTotal ? String(customizedQuantityTotal) : (customizedItems.length ? String(customizedItems.length) : null)}
        />

        {customizedItems.map((item) => {
          const remainingQuantity = getRemainingRequestItemQuantity(item);
          const cancelledQuantity = getCancelledRequestItemQuantity(item);

          return (
          <View key={item.key} style={styles.customizedRequestDetailCard}>
            <Text style={styles.customizedRequestItemMeta}>{item.label}</Text>
            <Text style={styles.customizedRequestDetailTitle}>{item.title}</Text>
            <DetailSection label="Quantity:" value={String(remainingQuantity)} />
            <DetailSection label="Cancelled Quantity:" value={cancelledQuantity ? String(cancelledQuantity) : null} />
            <DetailSection label="Bundle Size:" value={item.bundleSizeText} />
            <DetailSection label="Flowers:" value={item.flowersText} />
            <DetailSection label="Wrapper:" value={item.wrapperName} />
            <DetailSection label="Ribbon:" value={item.ribbonName} />
            <DetailSection label="Card Message:" value={item.cardMessage} />
            <DetailSection label="Recipient:" value={item.recipientName} />
            <DetailSection label="Delivery Address:" value={item.addressText} />
            {item.imageUri ? (
              <View style={styles.imageSection}>
                <Text style={styles.detailLabel}>Customized Bouquet Image:</Text>
                <Image
                  source={{ uri: item.imageUri }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        );
        })}

        {request.final_price && (
          <DetailSection
            label="Final Price:"
            value={`PHP ${parseCurrencyNumber(request.final_price).toFixed(2)}`}
          />
        )}
        {renderPickupTimeSection(request)}
      </>
    );
  };

  const REQUESTS_PAGE_SIZE = 20;

  const flushQueuedRequestsRefresh = React.useCallback(() => {
    if (!queuedRequestsRefreshRef.current || typeof loadRequestsRef.current !== 'function') {
      return;
    }

    queuedRequestsRefreshRef.current = false;
    loadRequestsRef.current({ showLoader: false });
  }, []);

  const loadRequests = React.useCallback(async ({ showLoader = true } = {}) => {
    if (requestsLoadInProgressRef.current) {
      queuedRequestsRefreshRef.current = true;
      return;
    }

    requestsLoadInProgressRef.current = true;

    if (showLoader && requests.length === 0) {
      setLoading(true);
    }

    try {
      const response = await adminAPI.getAllRequests({
        limit: REQUESTS_PAGE_SIZE,
        offset: 0,
        includeUsers: true,
        includeRefunds: false,
      });
      const nextRequests = response.data.requests || [];
      setRequests(nextRequests);
      setHasMoreRequests(nextRequests.length === REQUESTS_PAGE_SIZE);
      setListErrorMessage('');
    } catch (error) {
      console.error('Error loading requests:', error);
      setListErrorMessage(error?.message || 'Failed to refresh requests. Showing the last loaded list.');
      if (showLoader && requests.length === 0) {
        Toast.show({ type: 'error', text1: 'Failed to load requests' });
      }
    } finally {
      requestsLoadInProgressRef.current = false;
      if (showLoader && requests.length === 0) {
        setLoading(false);
      }
      flushQueuedRequestsRefresh();
    }
  }, [flushQueuedRequestsRefresh, requests.length]);

  const loadMoreRequests = React.useCallback(async () => {
    if (requestsLoadInProgressRef.current || isLoadingMore || !hasMoreRequests) {
      return;
    }

    requestsLoadInProgressRef.current = true;
    setIsLoadingMore(true);

    try {
      const response = await adminAPI.getAllRequests({
        limit: REQUESTS_PAGE_SIZE,
        offset: requests.length,
        includeUsers: true,
        includeRefunds: false,
      });
      const nextRequests = response.data.requests || [];
      if (nextRequests.length) {
        setRequests((previous) => [...previous, ...nextRequests]);
      }
      setHasMoreRequests(nextRequests.length === REQUESTS_PAGE_SIZE);
      setListErrorMessage('');
    } catch (error) {
      console.error('Error loading more requests:', error);
      setListErrorMessage(error?.message || 'Failed to load more requests.');
    } finally {
      requestsLoadInProgressRef.current = false;
      setIsLoadingMore(false);
      flushQueuedRequestsRefresh();
    }
  }, [flushQueuedRequestsRefresh, hasMoreRequests, isLoadingMore, requests.length]);

  React.useEffect(() => {
    loadRequestsRef.current = loadRequests;
  }, [loadRequests]);

  React.useEffect(() => {
    if (!initialRequestsLoadRef.current && typeof loadRequestsRef.current === 'function') {
      initialRequestsLoadRef.current = true;
      loadRequestsRef.current();
    }
  }, []);


  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadRequests({ showLoader: false });
    setRefreshing(false);
  }, [loadRequests]);

  const getNextRequestStatus = (currentStatus, deliveryMethod, type) => {
    const status = currentStatus;

    switch (status) {
      case 'pending':
        if (type === 'customized') return 'processing';
        return null; // booking/special need quote
      case 'accepted':
        return 'processing';
      case 'processing':
        return deliveryMethod === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
      case 'out_for_delivery':
      case 'ready_for_pickup':
        return 'completed';
      default:
        return null;
    }
  };

  const closeDetailsModal = React.useCallback(() => {
    setModalVisible(false);
    setSelectedRequest(null);
    setSelectedRequestLoading(false);
  }, []);

  const openRequestDeclineModal = React.useCallback((request, action = 'decline') => {
    if (actionLockRef.current || declineModalVisible) {
      return;
    }

    setRequestToDecline(request);
    setDeclineAction(action);
    setDeclineFeedback('');
    setDeclineModalVisible(true);
  }, [declineModalVisible]);

  const closeRequestDeclineModal = () => {
    setDeclineModalVisible(false);
    setRequestToDecline(null);
    setDeclineAction('decline');
    setDeclineFeedback('');
  };

  const handleDeclineRequest = React.useCallback((request) => {
    openRequestDeclineModal(request, 'decline');
  }, [openRequestDeclineModal]);

  const submitDeclineRequest = async () => {
    if (!requestToDecline) return;

    const feedback = declineFeedback.trim();
    if (!feedback) {
      Alert.alert('Reason Required', 'Please provide a short reason before cancelling this request.');
      return;
    }

    await runRequestAction(getRequestActionKey(declineAction, requestToDecline.id), async () => {
      setIsDeclining(true);

      try {
        const status = declineAction === 'cancel' ? 'cancelled' : 'declined';
        await adminAPI.updateRequestStatus(requestToDecline.id, status, {
          cancellationReason: feedback,
          dataPatch: {
            ...(declineAction === 'decline'
              ? {
                decline_feedback: feedback,
                declined_at: new Date().toISOString(),
              }
              : {
                cancellation_reason: feedback,
                cancelled_at: new Date().toISOString(),
              }),
          },
          notification: {
            title: declineAction === 'cancel' ? 'Request cancelled' : 'Custom order declined',
            message: `Your request #${requestToDecline.request_number} was ${declineAction === 'cancel' ? 'cancelled' : 'declined'}. Reason: ${feedback}`,
            link: '/profile',
            type: 'request_update',
          },
        });

        Toast.show({ type: 'success', text1: declineAction === 'cancel' ? 'Request Cancelled' : 'Request Declined' });
        closeRequestDeclineModal();
        closeDetailsModal();
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Decline request error:', error);
        Toast.show({ type: 'error', text1: 'Decline Failed' });
      } finally {
        setIsDeclining(false);
      }
    });
  };

  const closeRequestStatusModal = () => {
    setRequestStatusModalVisible(false);
    setRequestToUpdate(null);
    setSelectedRequestStatus(null);
  };

  const closeDeliveryStopModal = React.useCallback(() => {
    setDeliveryStopModalVisible(false);
    setRequestToCompleteStops(null);
    setSelectedDeliveryStopKey(null);
    setSelectedDeliveryProof(null);
    setDeliveryProofNote('');
    setIsCompletingDeliveryStop(false);
  }, []);

  const pickDeliveryProofImage = React.useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      setSelectedDeliveryProof(result.assets[0]);
    }
  }, []);

  const openDeliveryStopModal = React.useCallback((request) => {
    const stops = getNormalizedStopDestinations(request).filter((stop) => stop.confirmation_owner);
    const firstActionableStop = stops.find((stop) => (
      stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.RIDER
      && stop.confirmation_status !== DELIVERY_CONFIRMATION_STATUS.CONFIRMED
    ));

    setRequestToCompleteStops(request);
    setSelectedDeliveryStopKey(firstActionableStop?.unit_key || stops[0]?.unit_key || null);
    setSelectedDeliveryProof(null);
    setDeliveryProofNote('');
    setDeliveryStopModalVisible(true);
  }, [getNormalizedStopDestinations]);

  const handleConfirmDeliveryStop = React.useCallback(async () => {
    if (!requestToCompleteStops || !selectedDeliveryStopKey || isCompletingDeliveryStop) {
      return;
    }

    const stops = getNormalizedStopDestinations(requestToCompleteStops);
    const selectedStop = stops.find((stop) => stop.unit_key === selectedDeliveryStopKey);

    if (!selectedStop) {
      Alert.alert('Stop Not Found', 'Please choose a valid delivery stop.');
      return;
    }

    if (selectedStop.confirmation_owner !== DELIVERY_CONFIRMATION_OWNER.RIDER) {
      Alert.alert('Customer Confirmation Needed', 'This stop must be confirmed by the ordering customer.');
      return;
    }

    if (selectedStop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
      Alert.alert('Already Confirmed', 'This delivery stop already has a proof record.');
      return;
    }

    if (!selectedDeliveryProof?.base64) {
      Alert.alert('Proof Required', 'Please upload a delivery proof photo before completing this stop.');
      return;
    }

    setIsCompletingDeliveryStop(true);

    try {
      const actorType = currentUser?.role === 'employee' ? 'rider' : 'staff';
      const response = await adminAPI.completeRequestDeliveryStop(requestToCompleteStops.id, selectedDeliveryStopKey, {
        actorId: currentUser?.id || null,
        actorType,
        proofFile: selectedDeliveryProof,
        proofNote: deliveryProofNote,
      });
      const updatedRequest = response?.data?.request || null;

      Toast.show({
        type: 'success',
        text1: updatedRequest?.status === 'completed' ? 'Request Completed' : 'Delivery Stop Completed',
        text2: updatedRequest?.status === 'completed'
          ? 'All delivery stops are now confirmed.'
          : `${getDeliveryStopDisplayLabel(selectedStop)} now includes proof of delivery.`,
      });

      closeDetailsModal();
      closeDeliveryStopModal();
      await loadRequests({ showLoader: false });
    } catch (error) {
      const errorMessage = error?.message || 'Failed to complete this delivery stop.';
      Toast.show({ type: 'error', text1: 'Completion Failed', text2: errorMessage });
      Alert.alert('Completion Failed', errorMessage);
    } finally {
      setIsCompletingDeliveryStop(false);
    }
  }, [
    closeDeliveryStopModal,
    closeDetailsModal,
    currentUser?.id,
    currentUser?.role,
    deliveryProofNote,
    getNormalizedStopDestinations,
    isCompletingDeliveryStop,
    requestToCompleteStops,
    selectedDeliveryProof,
    selectedDeliveryStopKey,
  ]);

  const openRequestStatusModal = React.useCallback((request) => {
    if (actionLockRef.current || requestStatusModalVisible || deliveryStopModalVisible) {
      return;
    }

    if (
      request?.delivery_method === 'delivery'
      && request?.status === 'out_for_delivery'
      && hasStopConfirmationFlow(normalizeRequestData(request)?.multi_delivery_destinations || [])
    ) {
      openDeliveryStopModal(request);
      return;
    }

    setRequestToUpdate(request);
    const nextStatus = getNextRequestStatus(request.status, request.delivery_method, request.type);
    if (nextStatus) {
      setSelectedRequestStatus(nextStatus);
    } else {
      setSelectedRequestStatus(request.status);
    }
    setRequestStatusModalVisible(true);
  }, [deliveryStopModalVisible, openDeliveryStopModal, requestStatusModalVisible]);

  const handleAcceptPendingRequest = React.useCallback(async (request) => {
    if (!request) return;

    const nextStatus = resolveAcceptedRequestStatus(request);
    const acceptedMessage = nextStatus === 'processing'
      ? 'Your request #' + request.request_number + ' has been accepted and is now being prepared.'
      : 'Your request #' + request.request_number + " has been accepted. We'll confirm the payment details and begin processing shortly.";

    await runRequestAction(getRequestActionKey('accept', request.id), async () => {
      try {
        await adminAPI.updateRequestStatus(request.id, nextStatus, {
          notification: {
            title: 'Request accepted',
            message: acceptedMessage,
            link: '/profile',
            type: 'request_update',
          },
        });

        Toast.show({
          type: 'success',
          text1: nextStatus === 'processing' ? 'Request Accepted and Processing' : 'Request Accepted',
        });

        closeDetailsModal();
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error accepting request:', error);
        Toast.show({ type: 'error', text1: 'Failed to accept request' });
      }
    });
  }, [closeDetailsModal, loadRequests, runRequestAction]);

  const confirmRequestStatusChange = async () => {
    if (!requestToUpdate || !selectedRequestStatus || actionLockRef.current) return;
    const requestId = requestToUpdate.id;

    if (selectedRequestStatus === 'cancelled') {
      const requestToCancel = requestToUpdate;
      closeRequestStatusModal();
      openRequestDeclineModal(requestToCancel, 'cancel');
      return;
    }

    const actionKey = getRequestActionKey('status', requestId);
    actionLockRef.current = actionKey;
    setActiveActionKey(actionKey);
    const releaseStatusAction = () => {
      if (actionLockRef.current === actionKey) {
        actionLockRef.current = null;
        setActiveActionKey(null);
      }
    };
    let shouldCloseAfterStatusChange = true;

    try {
      if (selectedRequestStatus === 'out_for_delivery') {
        const hasRider = hasRequiredRiderAssignments(requestToUpdate);
        if (!hasRider) {
          Alert.alert(
            "Rider Required",
            "Please assign a rider before moving this request to Out for Delivery."
          );
          shouldCloseAfterStatusChange = false;
          releaseStatusAction();
          return;
        }
      }

      const isMovingToDelivery = ['out_for_delivery', 'ready_for_pickup', 'ready_for_pick_up', 'completed'].includes(selectedRequestStatus);
      const isNotPaid = requestToUpdate.payment_status !== 'paid';
      const isNotCOD = requestToUpdate.payment_method?.toLowerCase() !== 'cod';

      if (isMovingToDelivery && isNotPaid && isNotCOD) {
        Alert.alert(
          "Payment Required",
          "You cannot move this request to delivery/pickup until the payment is confirmed (except for COD)."
        );
        shouldCloseAfterStatusChange = false;
        releaseStatusAction();
        return;
      }

      await adminAPI.updateRequestStatus(requestId, selectedRequestStatus);

      if (selectedRequestStatus === 'completed' && requestToUpdate.payment_method?.toLowerCase() === 'cod' && requestToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateRequestPaymentStatus(requestToUpdate, 'paid');
        Toast.show({ type: 'success', text1: 'Request Completed and Payment Marked as Paid' });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Status Updated',
          text2: `Request #${requestToUpdate.request_number} is now ${selectedRequestStatus.replace(/_/g, ' ')}.`
        });
      }
      closeDetailsModal();
    } catch (error) {
      console.error('Update request status error:', error);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: error.response?.data?.message || 'Failed to update request status'
      });
    } finally {
      if (shouldCloseAfterStatusChange) {
        closeRequestStatusModal();
        try {
          await loadRequests({ showLoader: false });
        } finally {
          releaseStatusAction();
        }
      } else {
        releaseStatusAction();
      }
    }
  };

  const isCustomOrderQuote = requestToQuote?.type === 'booking';
  const isEditingCustomOrderQuote = isCustomOrderQuote && requestToQuote?.status && requestToQuote.status !== 'pending';
  const quoteArrangementSelections = quoteFlowerContext?.arrangementSelections || [];
  const quoteFlowerTypes = quoteFlowerContext?.flowerTypes || [];
  const quoteCustomOrderItems = React.useMemo(
    () => requestToQuote?.type === 'booking' ? getBookingRequestItems(requestToQuote) : [],
    [requestToQuote]
  );
  const quoteArrangementBreakdownItems = React.useMemo(
    () => buildQuoteArrangementBreakdownItems({
      arrangementSelections: quoteArrangementSelections,
      customOrderItems: quoteCustomOrderItems,
      flowerTypes: quoteFlowerTypes,
    }),
    [quoteArrangementSelections, quoteCustomOrderItems, quoteFlowerTypes]
  );

  const quoteBreakdownRows = React.useMemo(() => {
    if (!quoteManualRows.length) return [];

    return quoteManualRows
      .filter(rowHasQuoteContent)
      .map((row, index) => {
        const label = String(row.label || '').trim();
        const amount = parseCurrencyNumber(row.amount);

        return {
          key: row.id || `quote-breakdown-${index}`,
          type: normalizeCustomOrderQuoteType(row.type, label),
          label: label || 'Untitled charge',
          amount,
          reason: String(row.reason || '').trim(),
          arrangementGroup: String(row.arrangementGroup || '').trim(),
        };
      });
  }, [quoteManualRows]);

  const quoteFlowerSubtotal = React.useMemo(
    () => quoteBreakdownRows.reduce((sum, row) => sum + row.amount, 0),
    [quoteBreakdownRows]
  );

  const quoteShippingValue = parseCurrencyNumber(quoteShippingFee);
  const quoteTotalToPay = quoteFlowerSubtotal + quoteShippingValue;
  const quoteSubtotalMin = parseCurrencyNumber(quoteFlowerContext?.subtotalMin);
  const quoteSubtotalMax = parseCurrencyNumber(quoteFlowerContext?.subtotalMax);
  const quoteSubtotalRangeText = String(quoteFlowerContext?.formattedSubtotalRange || '').trim();
  const quoteHasSubtotalEstimate = Boolean(
    quoteFlowerContext?.hasAnyEstimate
    || quoteSubtotalMin > 0
    || quoteSubtotalMax > 0
  );
  const quoteSubtotalRangeWarning = React.useMemo(
    () => getRangeWarningState(quoteFlowerSubtotal, quoteSubtotalMin, quoteSubtotalMax),
    [quoteFlowerSubtotal, quoteSubtotalMin, quoteSubtotalMax]
  );
  const quoteChargeGroups = React.useMemo(
    () => groupQuoteChargeRows(quoteManualRows, quoteArrangementBreakdownItems, quoteCustomOrderItems),
    [quoteArrangementBreakdownItems, quoteCustomOrderItems, quoteManualRows]
  );
  const renderCustomOrderLiveQuoteSummary = (cardStyle = quoteStyles.quoteTotalCard) => (
    <View style={cardStyle}>
      <Text style={quoteStyles.quoteSectionLabel}>Live Quote Summary</Text>

      {quoteHasSubtotalEstimate && quoteSubtotalRangeText ? (
        <View style={quoteStyles.quoteRangeCard}>
          <Text style={quoteStyles.quoteRangeLabel}>Catalogue Subtotal Guide</Text>
          <Text style={quoteStyles.quoteRangeValue}>{quoteSubtotalRangeText}</Text>
          <Text style={quoteStyles.quoteRangeHint}>This compares arrangement, flower, labor, material, and extra charges only. Delivery fee stays separate.</Text>
        </View>
      ) : null}

      {quoteSubtotalRangeWarning.rangeWarningText ? (
        <View style={quoteStyles.quoteWarningBox}>
          <Text style={quoteStyles.quoteWarningText}>{quoteSubtotalRangeWarning.rangeWarningText}</Text>
        </View>
      ) : null}

      {quoteBreakdownRows.map((row) => (
        <View key={row.key} style={quoteStyles.quoteTotalRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={quoteStyles.quoteLiveItemName}>{row.label}</Text>
            <Text style={quoteStyles.quoteTotalMeta}>
              {[getCustomOrderQuoteTypeLabel(row.type), row.arrangementGroup || null, row.reason || null]
                .filter(Boolean)
                .join(' | ')}
            </Text>
          </View>
          <Text style={quoteStyles.quoteLiveItemPrice}>{formatCurrency(row.amount)}</Text>
        </View>
      ))}

      <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
        <Text style={quoteStyles.quoteTotalLabel}>Charges Subtotal</Text>
        <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteFlowerSubtotal)}</Text>
      </View>

      <View style={quoteStyles.quoteTotalRow}>
        <Text style={quoteStyles.quoteTotalLabel}>Delivery Fee</Text>
        <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteShippingValue)}</Text>
      </View>

      <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
        <Text style={quoteStyles.quoteGrandTotalLabel}>Total Price to Pay</Text>
        <Text style={quoteStyles.quoteGrandTotalValue}>{formatCurrency(quoteTotalToPay)}</Text>
      </View>
    </View>
  );

  const closeQuoteModal = () => {
    setQuoteModalVisible(false);
    setRequestToQuote(null);
    setQuoteAmount('');
    setQuoteShippingFee('');
    setQuoteFlowerContext(null);
    setQuoteManualRows([]);
  };

  const sanitizeQuoteCurrencyInput = (value) => String(value || '').replace(/[^0-9.]/g, '');

  const updateQuoteManualRow = (rowId, field, value) => {
    setQuoteManualRows((previousRows) => previousRows.map((row) => {
      if (row.id !== rowId) return row;
      if (field === 'amount') return { ...row, amount: sanitizeQuoteCurrencyInput(value) };
      if (field === 'reason') return { ...row, reason: value };
      if (field === 'label') return { ...row, label: value };
      return { ...row, [field]: value };
    }));
  };

  const addQuoteManualRow = (type = 'extra', arrangementGroup = '') => {
    setQuoteManualRows((previousRows) => [
      ...previousRows,
      createQuoteChargeRow({ type, arrangementGroup }),
    ]);
  };

  const removeQuoteManualRow = (rowId) => {
    setQuoteManualRows((previousRows) => (
      previousRows.length <= 1
        ? previousRows
        : previousRows.filter((row) => row.id !== rowId)
    ));
  };

  const openQuoteModal = React.useCallback((request) => {
    if (actionLockRef.current || quoteModalVisible) {
      return;
    }

    setRequestToQuote(request);

    const requestData = normalizeRequestData(request);
    const bookingItems = getBookingItemsFromData(requestData);
    const storedQuoteBreakdown = requestData?.quote_breakdown;
    const nextFlowerContext = buildFlowerPricingContext(request);
    const nextBookingItems = getBookingRequestItems(request);
    const nextArrangementBreakdownItems = buildQuoteArrangementBreakdownItems({
      arrangementSelections: nextFlowerContext?.arrangementSelections || [],
      customOrderItems: nextBookingItems,
      flowerTypes: nextFlowerContext?.flowerTypes || [],
    });

    const hasStoredQuoteShipping = storedQuoteBreakdown?.shipping_fee !== null && storedQuoteBreakdown?.shipping_fee !== undefined;
    const isPendingCustomOrderQuote = request?.type === 'booking' && String(request?.status || '').toLowerCase() === 'pending';
    const initialShipping = hasStoredQuoteShipping
      ? parseCurrencyNumber(storedQuoteBreakdown.shipping_fee)
      : (isPendingCustomOrderQuote
        ? 0
        : (request.shipping_fee !== null && request.shipping_fee !== undefined
          ? parseCurrencyNumber(request.shipping_fee)
          : 0));

    const initialPrice = request.final_price !== null && request.final_price !== undefined
      ? String(Math.max(parseCurrencyNumber(request.final_price) - initialShipping, 0))
      : '';

    setQuoteAmount(initialPrice);
    setQuoteShippingFee(initialShipping > 0 ? String(initialShipping) : '');
    setQuoteFlowerContext(nextFlowerContext);
    setQuoteManualRows(buildQuoteChargeRows({
      bookingItems: nextBookingItems.length ? nextBookingItems : bookingItems,
      arrangementBreakdownItems: nextArrangementBreakdownItems,
      storedQuoteBreakdown,
    }));
    setQuoteModalVisible(true);
  }, [quoteModalVisible]);

  const handleProvideQuote = async () => {
    if (!requestToQuote) return;

    const parsedShippingFee = parseCurrencyNumber(quoteShippingFee);

    let parsedItemPrice = 0;
    let quoteBreakdownPayload = null;

    if (isCustomOrderQuote) {
      const filledQuoteRows = quoteManualRows.filter(rowHasQuoteContent);

      if (!filledQuoteRows.length) {
        Alert.alert('Missing Details', 'Please add at least one charge in the custom order breakdown.');
        return;
      }

      const normalizedBreakdownRows = filledQuoteRows.map((row) => {
        const label = String(row.label || '').trim();
        const amountInput = String(row.amount || '').trim();
        const amount = parseCurrencyNumber(row.amount);
        const arrangementGroup = String(row.arrangementGroup || '').trim();
        const reason = String(row.reason || '').trim();
        const type = normalizeCustomOrderQuoteType(row.type, label);

        return {
          type,
          label,
          amount_input: amountInput,
          amount,
          ...(reason ? { reason } : {}),
          ...(arrangementGroup ? {
            arrangement_group: arrangementGroup,
            arrangementGroup,
          } : {}),
          product_name: label,
          price: amount,
        };
      });

      const hasInvalidBreakdownRow = normalizedBreakdownRows.some((row) => (
        !row.label
        || row.amount_input === ''
        || !Number.isFinite(row.amount)
        || row.amount < 0
      ));

      if (hasInvalidBreakdownRow) {
        Alert.alert('Invalid Input', 'Please complete each charge with a label and a valid amount.');
        return;
      }

      parsedItemPrice = quoteFlowerSubtotal;
      quoteBreakdownPayload = {
        line_items: normalizedBreakdownRows.map(({ amount_input, ...row }) => row),
        computed_subtotal: quoteFlowerSubtotal,
        shipping_fee: parsedShippingFee,
        computed_total: quoteFlowerSubtotal + parsedShippingFee,
      };
    } else {
      if (!quoteAmount || isNaN(parseFloat(quoteAmount))) {
        Alert.alert('Invalid Input', 'Please enter a valid item price.');
        return;
      }
      parsedItemPrice = parseFloat(quoteAmount);
    }

    await runRequestAction(getRequestActionKey('quote', requestToQuote.id), async () => {
      try {
        const { data: { request: updatedRequest } } = await adminAPI.provideQuote(
          requestToQuote.id,
          parsedItemPrice,
          parsedShippingFee,
          quoteBreakdownPayload
        );

        if (updatedRequest) {
          const notificationData = {
            user_id: updatedRequest.user_id,
            type: 'quote',
            title: `Price Quote for Your Request`,
            message: `We've provided a quote of PHP ${updatedRequest.final_price.toFixed(2)} for your request #${updatedRequest.request_number}. Please review and take action.`,
            link: `/profile`
          };
          await supabase.from('notifications').insert([notificationData]);
        }

        Toast.show({
          type: 'success',
          text1: 'Quote Provided',
          text2: `A quote of PHP ${(parsedItemPrice + parsedShippingFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been sent for request #${requestToQuote.request_number}.`
        });
        closeQuoteModal();
        closeDetailsModal();
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error providing quote:', error);
        Alert.alert('Error', 'Failed to provide quote.');
      }
    });
  };

  const handleConfirmPayment = async () => {
    if (!requestToRecordPayment || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    await runRequestAction(getRequestActionKey('payment', requestToRecordPayment.id), async () => {
      try {
        const total = requestToRecordPayment.final_price || 0;
        const newTotalReceived = isEditPaymentMode
          ? amount
          : (requestToRecordPayment.amount_received || 0) + amount;
        const newStatus = newTotalReceived >= total ? 'paid' : 'partial';
        const shouldAdvanceToProcessing = newStatus === 'paid' && requestToRecordPayment.status === 'accepted';

        const { error } = await supabase
          .from('requests')
          .update({
            amount_received: newTotalReceived,
            payment_status: newStatus,
          })
          .eq('id', requestToRecordPayment.id);

        if (error) throw error;

        await adminAPI.updateRequestPaymentStatus(requestToRecordPayment, newStatus);

        Toast.show({ type: 'success', text1: isEditPaymentMode ? 'Amount Updated' : 'Payment Recorded' });
        closePaymentModal();

        if (selectedRequest && selectedRequest.id === requestToRecordPayment.id) {
          setSelectedRequest({
            ...selectedRequest,
            amount_received: newTotalReceived,
            payment_status: newStatus,
            status: shouldAdvanceToProcessing ? 'processing' : selectedRequest.status,
          });
        }

        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to record payment' });
      }
    });
  };

  const openDetailsModal = React.useCallback(async (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
    setSelectedRequestLoading(true);

    try {
      const response = await adminAPI.getAllRequests({
        requestId: item.id,
        limit: 1,
        includeUsers: true,
        includeRefunds: true,
      });
      const fullRequest = response?.data?.requests?.[0] || null;

      if (fullRequest) {
        setSelectedRequest(fullRequest);
      }
    } catch (error) {
      console.error('Error refreshing request details:', error);
    } finally {
      setSelectedRequestLoading(false);
    }
  }, []);

  const openPaymentModal = (request, editMode = false) => {
    if (actionLockRef.current || paymentModalVisible) {
      return;
    }

    setRequestToRecordPayment(request);
    setPaymentAmount(editMode ? String(request.amount_received || '') : '');
    setIsEditPaymentMode(editMode);
    setPaymentModalVisible(true);
  };

  const closePaymentModal = () => {
    setPaymentModalVisible(false);
    setRequestToRecordPayment(null);
    setPaymentAmount('');
    setIsEditPaymentMode(false);
  };

  const openCustomizedItemModal = React.useCallback((request, customizedItem) => {
    setSelectedCustomizedItem({ request, item: customizedItem });
    setCustomizedItemModalVisible(true);
  }, []);

  const closeCustomizedItemModal = () => {
    setCustomizedItemModalVisible(false);
    setSelectedCustomizedItem(null);
  };

  const closeAssignRiderModal = () => {
    setAssignRiderModalVisible(false);
    setRequestToAssignRider(null);
    setSelectedRider(null);
    setSelectedStopGroupKey(null);
    setStopRiderAssignments({});
    setRiderSearchQuery('');
  };

  const handleAssignRider = React.useCallback(async (request) => {
    if (actionLockRef.current || assignRiderModalVisible) {
      return;
    }

    const availableRiders = await loadRiders();
    const availableRiderLookup = Array.isArray(availableRiders) && availableRiders.length
      ? Object.fromEntries(availableRiders.map((rider) => [String(rider.id), rider]))
      : riderLookup;

    const groupedDestinations = getGroupedDestinations(request);
    setRequestToAssignRider(request);
    setRiderSearchQuery('');
    if (groupedDestinations.length > 0) {
      const initialAssignments = getInitialStopRiderAssignments(request);
      const firstGroup = groupedDestinations[0] || null;
      const initialRiderId = firstGroup ? initialAssignments[firstGroup.groupKey] : '';

      setStopRiderAssignments(initialAssignments);
      setSelectedStopGroupKey(firstGroup?.groupKey || null);
      setSelectedRider(initialRiderId ? availableRiderLookup[String(initialRiderId)] || null : null);
    } else {
      setStopRiderAssignments({});
      setSelectedStopGroupKey(null);
      setSelectedRider(
        request.rider
        || (request.assigned_rider ? availableRiderLookup[String(request.assigned_rider)] || null : null)
      );
    }
    setAssignRiderModalVisible(true);
  }, [assignRiderModalVisible, getGroupedDestinations, getInitialStopRiderAssignments, loadRiders, riderLookup]);

  const handleSelectStopGroup = (group) => {
    const riderId = stopRiderAssignments[group.groupKey] || '';
    setSelectedStopGroupKey(group.groupKey);
    setSelectedRider(riderId ? riderLookup[String(riderId)] || null : null);
  };

  const handleSelectRider = (rider) => {
    if (isStopAssignmentMode) {
      if (!selectedStopGroupKey) {
        return;
      }

      setStopRiderAssignments((currentAssignments) => ({
        ...currentAssignments,
        [selectedStopGroupKey]: rider.id,
      }));
    }

    setSelectedRider(rider);
  };

  const handleClearStopRider = () => {
    if (!selectedStopGroupKey) {
      return;
    }

    setStopRiderAssignments((currentAssignments) => ({
      ...currentAssignments,
      [selectedStopGroupKey]: '',
    }));
    setSelectedRider(null);
  };

  const handleConfirmAssignRider = async () => {
    if (!requestToAssignRider) return;

    await runRequestAction(getRequestActionKey('assign-rider', requestToAssignRider.id), async () => {
      try {
        if (isStopAssignmentMode) {
          const stopAssignments = assignableStopGroups.map((group) => ({
            unitKeys: group.unitKeys,
            riderId: stopRiderAssignments[group.groupKey] || null,
          }));

          await adminAPI.assignRequestStopRiders(requestToAssignRider.id, stopAssignments);
          Toast.show({ type: 'success', text1: 'Delivery stop riders updated' });
        } else {
          if (!selectedRider) {
            Alert.alert('Error', 'Please select an employee rider.');
            return;
          }

          await adminAPI.assignRiderToRequest(requestToAssignRider.id, selectedRider.id);
          Toast.show({ type: 'success', text1: 'Rider Assigned' });
        }

        closeAssignRiderModal();
        await loadRequests({ showLoader: false });
      } catch (err) {
        console.error('Error assigning rider to request:', err);
        const errorMessage = err?.message || 'Failed to assign rider.';
        Toast.show({ type: 'error', text1: 'Assignment Failed', text2: errorMessage });
        Alert.alert('Assignment Failed', errorMessage);
      }
    });
  };

  const handleApproveRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    await runRequestAction(getRequestActionKey('approve-refund', requestItem.id), async () => {
      try {
        await adminAPI.approveRefundRequest(requestItem.refund_request.id, {
          actorId: currentUser?.id,
          refundAmount: requestItem.amount_received || requestItem.final_price || requestItem.refund_request.refund_amount,
        });
        Toast.show({ type: 'success', text1: 'Refund Approved' });
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error approving refund:', error);
        const errorMessage = error?.message || 'Failed to approve refund.';
        Toast.show({ type: 'error', text1: 'Approval Failed', text2: errorMessage });
        Alert.alert('Approval Failed', errorMessage);
      }
    });
  };

  const handleRejectRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    await runRequestAction(getRequestActionKey('reject-refund', requestItem.id), async () => {
      try {
        await adminAPI.rejectRefundRequest(requestItem.refund_request.id, {
          actorId: currentUser?.id,
          rejectionReason: 'Refund request was not approved by admin.',
        });
        Toast.show({ type: 'success', text1: 'Refund Rejected' });
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error rejecting refund:', error);
        const errorMessage = error?.message || 'Failed to reject refund.';
        Toast.show({ type: 'error', text1: 'Rejection Failed', text2: errorMessage });
        Alert.alert('Rejection Failed', errorMessage);
      }
    });
  };

  const handleStartRefundProcessing = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    await runRequestAction(getRequestActionKey('start-refund', requestItem.id), async () => {
      try {
        await adminAPI.startRefundProcessing(requestItem.refund_request.id, {
          actorId: currentUser?.id,
        });
        Toast.show({ type: 'success', text1: 'Refund Processing Started' });
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error starting refund processing:', error);
        const errorMessage = error?.message || 'Failed to start refund processing.';
        Toast.show({ type: 'error', text1: 'Processing Failed', text2: errorMessage });
        Alert.alert('Processing Failed', errorMessage);
      }
    });
  };

  const handleCompleteRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    await runRequestAction(getRequestActionKey('complete-refund', requestItem.id), async () => {
      try {
        await adminAPI.completeRefundRequest(requestItem.refund_request.id, {
          actorId: currentUser?.id,
        });
        Toast.show({ type: 'success', text1: 'Refund Completed' });
        await loadRequests({ showLoader: false });
      } catch (error) {
        console.error('Error completing refund:', error);
        const errorMessage = error?.message || 'Failed to complete refund.';
        Toast.show({ type: 'error', text1: 'Completion Failed', text2: errorMessage });
        Alert.alert('Completion Failed', errorMessage);
      }
    });
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, onAssignRider, onUpdateStatus, onProvidePrice, onDecline, onPrintReceipt, onOpenCustomizedItem }) => {
    const isCustomizedRequest = item.type === 'customized';
    const isBookingRequest = item.type === 'booking';
    const customizedItems = isCustomizedRequest ? getCustomizedRequestItems(item) : [];
    const bookingItems = isBookingRequest ? getBookingRequestItems(item) : [];
    const groupedDestinations = item.delivery_method === 'delivery' ? getGroupedDestinations(item) : [];
    const isActionBusy = Boolean(activeActionKey);

    return (
      <View style={styles.eoCard}>
        {/* Header */}
        <View style={styles.eoCardHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.eoLabel}>Request Type</Text>
            <Text style={styles.eoOrderId}>{getStatusLabel(item.type)}</Text>
            <View style={[styles.eoDeliveryTypeBadge, { backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981' }]}>
              <Ionicons name={item.delivery_method === 'delivery' ? 'rocket-outline' : 'storefront-outline'} size={12} color="#fff" />
              <Text style={styles.eoDeliveryTypeBadgeText}>
                {item.delivery_method === 'delivery' ? 'Delivery' : 'Pick-up'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={styles.eoDateBadge}>
              <Text style={styles.eoDateText}>{formatTimestamp(item.created_at)}</Text>
            </View>
            <View style={[styles.eoStatusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.eoSection}>
          <View style={styles.eoCustomerHeader}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.eoLabel}>Customer</Text>
              <Text style={styles.eoCustomerName} numberOfLines={1}>{item.user_name}</Text>
            </View>
            <View style={styles.eoActionButtons}>
              <TouchableOpacity
                style={{ backgroundColor: '#6B7280', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                onPress={(e) => { e.stopPropagation(); onPrintReceipt(item); }}
              >
                <Ionicons name="print" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.eoIconBtnGreen} onPress={(e) => { e.stopPropagation(); onPhoneCall(item.contact_number || item.user_phone); }}>
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.eoIconBtnBlue}
                onPress={(e) => { e.stopPropagation(); onMessageCustomer(item.users, item.user_name, item.user_email); }}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.eoContactInfo}>
            {item.user_email && (<View style={styles.eoInfoRow}>
              <Ionicons name="mail" size={16} color="#9CA3AF" />
              <Text style={styles.eoInfoLabel}>Email:</Text>
              <Text style={styles.eoInfoTextBold}>{item.user_email}</Text>
            </View>)}
            {item.contact_number && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="call" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Phone:</Text>
                <Text style={styles.eoInfoTextBold} numberOfLines={1}>{item.contact_number}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Request Number / Other details */}
        <View style={styles.eoSection}>
          <View style={styles.eoFlexBetween}>
            <Text style={styles.eoDetailText}>Request Number:</Text>
            <Text style={styles.eoInfoTextBold}>#{item.request_number}</Text>
          </View>
          {false && (
            <View style={styles.eoInstructions}>
              <Text style={styles.eoInstructionsTitle}>Notes:</Text>
              <Text style={styles.eoInstructionsText}>{item.notes}</Text>
            </View>
          )}
        </View>

        {groupedDestinations.length > 0 && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="navigate-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Delivery Stops ({groupedDestinations.length})</Text>
            </View>
            {groupedDestinations.map((destination, index) => {
              const assignedRiderNames = getAssignedRiderNamesForGroup(destination, item);

              return (
                <View key={destination.groupKey || `${destination.recipientName}-${index}`} style={[styles.eoItemCard, index > 0 && { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eoItemName}>{destination.recipientName || `Stop ${index + 1}`}</Text>
                    {destination.recipientPhone ? (
                      <Text style={styles.eoItemQuantity}>Phone: {destination.recipientPhone}</Text>
                    ) : null}
                    {destination.addressText ? (
                      <Text style={styles.eoInfoTextBold}>{destination.addressText}</Text>
                    ) : null}
                    <Text style={[styles.eoItemQuantity, { marginTop: 6 }]}>
                      {destination.items.map((stopItem) => `${stopItem.itemName} #${stopItem.unitNumber}`).join(', ')}
                    </Text>
                    <View style={styles.eoStopAssignmentRow}>
                      <Ionicons name="bicycle-outline" size={14} color={assignedRiderNames.length ? '#2563EB' : '#F97316'} />
                      <Text style={[styles.eoStopAssignmentText, !assignedRiderNames.length && styles.eoStopAssignmentTextPending]}>
                        {assignedRiderNames.length ? assignedRiderNames.join(', ') : 'Rider not assigned yet'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {isCustomizedRequest && customizedItems.length > 0 && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="image-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>
                {`Customizer Studio (${customizedItems.reduce((sum, customizedItem) => sum + getRemainingRequestItemQuantity(customizedItem), 0) || customizedItems.length})`}
              </Text>
            </View>
            {customizedItems.map((customizedItem, index) => (
              <TouchableOpacity
                key={customizedItem.key}
                activeOpacity={0.85}
                style={[styles.eoItemCard, index > 0 && { marginTop: 8 }]}
                onPress={() => onOpenCustomizedItem(item, customizedItem)}
              >
                <View style={styles.eoItemImage}>
                  <CustomizedBouquetPreview
                    item={customizedItem}
                    style={StyleSheet.absoluteFillObject}
                    fallbackResizeMode="cover"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customizedRequestItemMeta}>{customizedItem.label}</Text>
                  {(() => {
                    const assignedRiderNames = customizedItem.assignedRiderIds
                      .map((riderId) => riderLookup[String(riderId)]?.name)
                      .filter(Boolean);

                    return customizedItem.destinationSummary ? (
                      <Text
                        style={[
                          styles.customizedRequestAssignedRider,
                          !assignedRiderNames.length && styles.customizedRequestAssignedRiderPending,
                        ]}
                        numberOfLines={1}
                      >
                        Rider: {assignedRiderNames.length ? assignedRiderNames.join(', ') : 'Not assigned'}
                      </Text>
                    ) : null;
                  })()}
                  <Text style={styles.eoItemName}>{customizedItem.title}</Text>
                  <Text style={styles.eoItemQuantity}>
                    Quantity: {getRemainingRequestItemQuantity(customizedItem)}
                  </Text>
                  {getCancelledRequestItemQuantity(customizedItem) > 0 ? (
                    <Text style={styles.eoItemQuantity}>
                      Cancelled: {getCancelledRequestItemQuantity(customizedItem)}
                    </Text>
                  ) : null}
                  {customizedItem.bundleSizeText ? (
                    <Text style={styles.eoItemQuantity}>Bundle Size: {customizedItem.bundleSizeText}</Text>
                  ) : null}
                  {customizedItem.materialsSummary ? (
                    <Text style={styles.eoItemQuantity} numberOfLines={2}>
                      {customizedItem.materialsSummary}
                    </Text>
                  ) : null}
                  {customizedItem.destinationSummary ? (
                    <Text style={styles.customizedRequestDestination} numberOfLines={2}>
                      Deliver to: {customizedItem.destinationSummary}
                    </Text>
                  ) : null}
                  {customizedItem.priceText ? (
                    <Text style={styles.eoItemPrice}>{customizedItem.priceText}</Text>
                  ) : null}
                  <Text style={styles.customizedRequestTapHint}>Tap to view bouquet details</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isBookingRequest && bookingItems.length > 0 && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="images-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>
                {`Custom Order Items (${bookingItems.reduce((sum, bookingItem) => sum + getRemainingRequestItemQuantity(bookingItem), 0) || bookingItems.length})`}
              </Text>
            </View>
            {bookingItems.map((bookingItem, index) => {
              const assignedRiderNames = bookingItem.assignedRiderIds
                .map((riderId) => riderLookup[String(riderId)]?.name)
                .filter(Boolean);

              return (
                <TouchableOpacity
                  key={bookingItem.key}
                  activeOpacity={0.9}
                  style={[styles.eoItemCard, index > 0 && { marginTop: 8 }]}
                  onPress={() => openDetailsModal(item)}
                >
                  <View style={styles.eoItemImage}>
                    {bookingItem.imageUri ? (
                      <Image
                        source={{ uri: bookingItem.imageUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="image-outline" size={24} color="#666" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customizedRequestItemMeta}>{bookingItem.label}</Text>
                    <Text style={styles.eoItemName}>{bookingItem.title}</Text>
                    <Text style={styles.eoItemQuantity}>
                      Quantity: {getRemainingRequestItemQuantity(bookingItem)}
                    </Text>
                    {getCancelledRequestItemQuantity(bookingItem) > 0 ? (
                      <Text style={styles.eoItemQuantity}>
                        Cancelled: {getCancelledRequestItemQuantity(bookingItem)}
                      </Text>
                    ) : null}
                    {bookingItem.arrangementText ? (
                      <Text style={styles.eoItemQuantity} numberOfLines={2}>
                        Arrangement: {bookingItem.arrangementText}
                      </Text>
                    ) : null}
                    {bookingItem.preferredFlowers ? (
                      <Text style={styles.eoItemQuantity} numberOfLines={2}>
                        Flowers: {bookingItem.preferredFlowers}
                      </Text>
                    ) : null}
                    {bookingItem.eventDateText ? (
                      <Text style={styles.eoItemQuantity}>
                        Date: {bookingItem.eventDateText}{bookingItem.eventTimeText ? ` at ${bookingItem.eventTimeText}` : ''}
                      </Text>
                    ) : null}
                    {bookingItem.venueText ? (
                      <Text style={styles.eoItemQuantity} numberOfLines={2}>
                        Venue: {bookingItem.venueText}
                      </Text>
                    ) : null}
                    {bookingItem.destinationSummary ? (
                      <Text style={styles.customizedRequestDestination} numberOfLines={2}>
                        Delivery: {bookingItem.destinationSummary}
                      </Text>
                    ) : null}
                    {assignedRiderNames.length ? (
                      <Text style={styles.customizedRequestAssignedRider} numberOfLines={1}>
                        Rider: {assignedRiderNames.join(', ')}
                      </Text>
                    ) : null}
                    <Text style={styles.customizedRequestTapHint}>Tap to view full custom order details</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Request Image Preview */}
        {item.image_url && !isCustomizedRequest && !isBookingRequest && (
          <View style={styles.eoSection}>
            <Text style={styles.eoSectionTitle}>Attachment</Text>
            <Image
              source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url} ` }}
              style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 10 }}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Assigned Rider Info */}
        {item.rider && groupedDestinations.length === 0 ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={styles.eoFlexBetween}>
              <Text style={styles.eoDetailText}>Name:</Text>
              <Text style={styles.eoInfoTextBold}>{item.rider.name}</Text>
            </View>
          </View>
        ) : null}

        {['cancelled', 'declined'].includes(item.status) && (item.cancellation_reason || item.data?.decline_feedback || item.data?.declineFeedback) ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={styles.eoSectionTitle}>Cancellation Reason</Text>
            </View>
            <Text style={styles.eoInstructionsText}>
              {item.cancellation_reason || item.data?.decline_feedback || item.data?.declineFeedback}
            </Text>
          </View>
        ) : null}

        {/* Payment Details - Only shown after customer accepted (i.e. status != pending) */}
        {item.status !== 'pending' && (item.payment_status || item.final_price) && (
          <PaymentDetailsSection
            item={item}
            styles={styles}
            onRecordPay={() => openPaymentModal(item)}
            onEditAmount={() => openPaymentModal(item, true)}
            onViewReceipt={(url) => openReceiptModal(url)}
            requireReceipt={true}
          />
        )}

        {item.refund_request ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="refresh-circle-outline" size={16} color="#DB2777" />
              <Text style={styles.eoSectionTitle}>Refund Request</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <View style={[styles.eoPaymentStatus, { backgroundColor: '#FCE7F3' }]}>
                <Text style={[styles.eoPaymentStatusText, { color: '#BE185D' }]}>
                  {getRefundStatusLabel(item.refund_request.status)}
                </Text>
              </View>
              <Text style={[styles.eoInfoText, { color: '#6B7280' }]}>
                PHP {Number(item.refund_request.refund_amount || 0).toLocaleString()}
              </Text>
            </View>
            <Text style={styles.eoInstructionsText}>{item.refund_request.customer_reason}</Text>

            {item.refund_request.admin_note ? (
              <Text style={[styles.eoInfoText, { marginTop: 8 }]}>Admin note: {item.refund_request.admin_note}</Text>
            ) : null}

            {item.refund_request.rejection_reason ? (
              <Text style={[styles.eoInfoText, { marginTop: 8, color: '#DC2626' }]}>
                Decision: {item.refund_request.rejection_reason}
              </Text>
            ) : null}

            {(item.refund_request.gcash_name || item.refund_request.gcash_number) ? (
              <View style={{ marginTop: 10, gap: 4 }}>
                <Text style={styles.eoInfoTextBold}>GCash Details</Text>
                <Text style={styles.eoInfoText}>Name: {item.refund_request.gcash_name || 'Not submitted'}</Text>
                <Text style={styles.eoInfoText}>
                  Number: {['processing', 'refunded'].includes(item.refund_request.status)
                    ? (item.refund_request.gcash_number || 'Not submitted')
                    : maskGcashNumber(item.refund_request.gcash_number)}
                </Text>
              </View>
            ) : null}

            {item.refund_request.refund_reference ? (
              <Text style={[styles.eoInfoText, { marginTop: 8 }]}>
                Refund reference: {item.refund_request.refund_reference}
              </Text>
            ) : null}

            <View style={{ marginTop: 12, gap: 10 }}>
              {currentUser?.role === 'admin' && item.refund_request.status === 'requested' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#10B981', flex: 1 }]}
                    disabled={isActionBusy}
                    onPress={() => handleApproveRefund(item)}
                  >
                    <Text style={styles.eoMainBtnText}>Approve Refund</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444', flex: 1 }]}
                    disabled={isActionBusy}
                    onPress={() => handleRejectRefund(item)}
                  >
                    <Text style={styles.eoMainBtnText}>Reject Refund</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {item.refund_request.status === 'approved' ? (
                <Text style={[styles.eoInfoText, { color: '#92400E' }]}>
                  Waiting for the customer to submit their GCash details.
                </Text>
              ) : null}

              {['admin', 'employee'].includes(currentUser?.role) && item.refund_request.status === 'gcash_submitted' ? (
                <TouchableOpacity
                  style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#2563EB' }]}
                  disabled={isActionBusy}
                  onPress={() => handleStartRefundProcessing(item)}
                >
                  <Text style={styles.eoMainBtnText}>Start Refund Processing</Text>
                </TouchableOpacity>
              ) : null}

              {['admin', 'employee'].includes(currentUser?.role) && item.refund_request.status === 'processing' ? (
                <TouchableOpacity
                  style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#7C3AED' }]}
                  disabled={isActionBusy}
                  onPress={() => handleCompleteRefund(item)}
                >
                  <Text style={styles.eoMainBtnText}>Mark Refunded</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}


        {/* Action to open full details */}
        <View style={styles.eoFooter}>
          {!isCustomizedRequest && (
            <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => openDetailsModal(item)}>
              <Ionicons name="eye" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>View Details</Text>
            </TouchableOpacity>
          )}

          {item.status === 'pending' && item.type === 'customized' && (
            <View style={styles.customizedRequestActionRow}>
              <TouchableOpacity
                style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: isActionBusy ? '#9CA3AF' : '#10B981' }]}
                disabled={isActionBusy}
                onPress={() => handleAcceptPendingRequest(item)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444' }]}
                disabled={isActionBusy}
                onPress={() => onDecline(item)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          {item.type === 'booking' && !['completed', 'cancelled', 'declined', 'out_for_delivery', 'ready_for_pickup', 'ready_for_pick_up', 'claimed'].includes(item.status) && (
            <>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#F59E0B', marginTop: 10 }]}
                disabled={isActionBusy}
                onPress={() => onProvidePrice(item)}
              >
                <Text style={styles.eoMainBtnText}>{item.status === 'pending' ? 'Provide Price' : 'Edit Breakdown'}</Text>
              </TouchableOpacity>
              {item.status === 'pending' && (
                <TouchableOpacity
                  style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444', marginTop: 10 }]}
                  disabled={isActionBusy}
                  onPress={() => onDecline(item)}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#fff" />
                  <Text style={styles.eoMainBtnText}>Decline</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Phase 1: Pending - admin is yet to provide price */}
          {item.status === 'pending' && item.type === 'special_order' && (
            <>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#F59E0B', marginTop: 10 }]}
                disabled={isActionBusy}
                onPress={() => onProvidePrice(item)}
              >
                <Text style={styles.eoMainBtnText}>Provide Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#EF4444', marginTop: 10 }]}
                disabled={isActionBusy}
                onPress={() => onDecline(item)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Phase 2+: Accepted or beyond - customer has agreed to price */}
          {!['pending', 'completed', 'cancelled', 'declined'].includes(item.status) && (
            <TouchableOpacity
              style={[
                styles.eoMainBtn,
                { marginTop: 10, backgroundColor: isActionBusy ? '#9CA3AF' : ((item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid' ? '#9CA3AF' : '#3B82F6') }
              ]}
              disabled={isActionBusy || ((item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid')}
              onPress={() => onUpdateStatus(item)}
            >
              <Ionicons name="git-network-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
          )}

          {/* Assign Rider: only when processing + delivery */}
          {item.delivery_method === 'delivery' && item.status === 'processing' && (
            <TouchableOpacity
              style={[styles.eoMainBtn, { backgroundColor: isActionBusy ? '#9CA3AF' : '#10B981', marginTop: 10 }]}
              disabled={isActionBusy}
              onPress={() => onAssignRider(item)}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>{groupedDestinations.length > 0 ? 'Assign Stop Riders' : 'Assign Rider'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderRequestCard = React.useCallback(({ item }) => (
    <EnhancedRequestCard
      item={item}
      onMessageCustomer={handleMessageCustomer}
      onPhoneCall={handlePhoneCall}
      openDetailsModal={openDetailsModal}
      openReceiptModal={openReceiptModal}
      onAssignRider={handleAssignRider}
      onUpdateStatus={openRequestStatusModal}
      onProvidePrice={(requestItem) => {
        closeDetailsModal();
        openQuoteModal(requestItem);
      }}
      onDecline={handleDeclineRequest}
      onPrintReceipt={handlePrintReceipt}
      onOpenCustomizedItem={openCustomizedItemModal}
    />
  ), [
    closeDetailsModal,
    handleAssignRider,
    handleDeclineRequest,
    handleMessageCustomer,
    handlePhoneCall,
    handlePrintReceipt,
    openDetailsModal,
    openQuoteModal,
    openReceiptModal,
    openRequestStatusModal,
    openCustomizedItemModal,
  ]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Requests & Bookings</Text>

      {/* Scrollable Status Filters */}
      <View style={{ marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
          {requestStatusFilters.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setStatusFilter(filter)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 20,
                backgroundColor: statusFilter === filter ? '#ec4899' : '#f9a8d4',
                borderWidth: statusFilter === filter ? 0 : 1,
                borderColor: '#ec4899',
              }}
            >
              <Text style={{
                color: statusFilter === filter ? '#fff' : '#be185d',
                fontWeight: '600',
                fontSize: 14,
              }}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {listErrorMessage ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 14,
            padding: 12,
            borderRadius: 14,
            backgroundColor: '#FFF7ED',
            borderWidth: 1,
            borderColor: '#FDBA74',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#C2410C', marginBottom: 4 }}>
            Requests list needs attention
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: '#9A3412' }}>
            {listErrorMessage}
          </Text>
        </View>
      ) : null}

      {focusedEntityTarget?.entityType === 'request' ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 14,
            padding: 14,
            borderRadius: 16,
            backgroundColor: '#FFF1F6',
            borderWidth: 1,
            borderColor: '#F9A8D4',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="locate-outline" size={18} color="#DB2777" />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#9D174D' }}>
              Showing the refund target request only
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: '#6B7280' }}>
            {focusedRequest
              ? `Request #${focusedRequest.request_number} is ready for review below.`
              : 'That request was not found in the current list.'}
          </Text>
          <TouchableOpacity
            onPress={clearFocusedEntityTarget}
            style={{
              alignSelf: 'flex-start',
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: '#DB2777',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Back to all requests</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={displayedRequests}
        renderItem={renderRequestCard}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        onEndReached={loadMoreRequests}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />}
        ListFooterComponent={isLoadingMore ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator size="small" color="#ec4899" />
            <Text style={[styles.emptyText, { marginTop: 6 }]}>Loading more requests...</Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {focusedEntityTarget?.entityType === 'request' ? 'That request could not be found' : 'No requests found'}
          </Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeDetailsModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={closeDetailsModal} disabled={Boolean(activeActionKey)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {selectedRequest && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedRequestLoading ? (
                  <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
                    <ActivityIndicator size="small" color="#ec4899" />
                    <Text style={{ textAlign: 'center', marginTop: 8, color: '#6B7280', fontSize: 12 }}>
                      Refreshing request details...
                    </Text>
                  </View>
                ) : null}
                {selectedRequest.type !== 'booking' && (
                  <>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Type:</Text>
                      <Text style={styles.detailValue}>{getStatusLabel(selectedRequest.type)}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Submitted:</Text>
                      <Text style={styles.detailValue}>{formatTimestamp(selectedRequest.created_at)}</Text>
                    </View>
                  </>
                )}

                {/* Use helper functions to render details based on type */}
                {selectedRequest.type === 'booking' && renderBookingDetails(selectedRequest)}
                {selectedRequest.type === 'special_order' && renderSpecialOrderDetails(selectedRequest)}
                {selectedRequest.type === 'customized' && renderCustomizedDetails(selectedRequest)}


                {selectedRequest.image_url && selectedRequest.type !== 'booking' && (
                  <View style={styles.imageSection}>
                    <Text style={styles.detailLabel}>Inspiration Photo:</Text>
                    <Image
                      source={{ uri: toAbsoluteImageUrl(selectedRequest.image_url) }}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                  </View >
                )}



                <View style={styles.actionButtons}>


                  {/* Accept and Decline for Pending Customized Requests */}
                  {selectedRequest.status === 'pending' && selectedRequest.type === 'customized' && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.acceptButton, activeActionKey && { opacity: 0.6 }]}
                        disabled={Boolean(activeActionKey)}
                        onPress={() => handleAcceptPendingRequest(selectedRequest)}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton, activeActionKey && { opacity: 0.6 }]}
                        disabled={Boolean(activeActionKey)}
                        onPress={() => handleDeclineRequest(selectedRequest)}
                      >
                        <Text style={styles.buttonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
                  )}


                </View>
              </ScrollView >
            )}
          </View >
        </View >
      </Modal >

      <Modal
        visible={customizedItemModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeCustomizedItemModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.modalTitle}>Customized Bouquet Details</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedCustomizedItem?.item?.label} - Request #{selectedCustomizedItem?.request?.request_number}
                </Text>
              </View>
              <TouchableOpacity onPress={closeCustomizedItemModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedCustomizedItem?.item ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.imageSection}>
                  <View style={styles.fullImage}>
                    <CustomizedBouquetPreview
                      item={selectedCustomizedItem.item}
                      style={StyleSheet.absoluteFillObject}
                      fallbackResizeMode="contain"
                    />
                  </View>
                </View>

                <View style={styles.customizedRequestDetailCard}>
                  <Text style={styles.customizedRequestItemMeta}>{selectedCustomizedItem.item.label}</Text>
                  <Text style={styles.customizedRequestDetailTitle}>{selectedCustomizedItem.item.title}</Text>
                  {selectedCustomizedItem.item.assignedRiderIds?.length ? (
                    <DetailSection
                      label="Assigned Rider:"
                      value={selectedCustomizedItem.item.assignedRiderIds
                        .map((riderId) => riderLookup[String(riderId)]?.name)
                        .filter(Boolean)
                        .join(', ')}
                    />
                  ) : null}
                  <DetailSection
                    label="Remaining Quantity:"
                    value={String(getRemainingRequestItemQuantity(selectedCustomizedItem.item))}
                  />
                  <DetailSection
                    label="Cancelled Quantity:"
                    value={getCancelledRequestItemQuantity(selectedCustomizedItem.item)
                      ? String(getCancelledRequestItemQuantity(selectedCustomizedItem.item))
                      : null}
                  />
                  <DetailSection label="Bundle Size:" value={selectedCustomizedItem.item.bundleSizeText} />
                  <DetailSection label="Flowers:" value={selectedCustomizedItem.item.flowersText} />
                  <DetailSection label="Wrapper:" value={selectedCustomizedItem.item.wrapperName} />
                  <DetailSection label="Ribbon:" value={selectedCustomizedItem.item.ribbonName} />
                  <DetailSection label="Card Message:" value={selectedCustomizedItem.item.cardMessage} />
                  <DetailSection label="Recipient:" value={selectedCustomizedItem.item.recipientName} />
                  <DetailSection label="Delivery Address:" value={selectedCustomizedItem.item.addressText} />
                  <DetailSection label="Bouquet Price:" value={selectedCustomizedItem.item.priceText} />
                </View>

                {renderPickupTimeSection(selectedCustomizedItem.request)}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Request Change Status Modal (Timeline UI) */}
      <Modal
        visible={deliveryStopModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeDeliveryStopModal}
      >
        <View style={styles.statusModalBackdrop}>
          <View style={[styles.timelineModalContainer, { maxHeight: deliveryStopModalMaxHeight }]}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Complete Delivery Stop</Text>
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              {requestToCompleteStops ? (
                <Text style={styles.timelineOrderNumber}>Request #{requestToCompleteStops.request_number}</Text>
              ) : null}

              <ScrollView
                style={{ maxHeight: deliveryStopListMaxHeight }}
                contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                showsVerticalScrollIndicator={false}
              >
                {deliveryStopModalStops.map((stop, index) => {
                  const isSelected = selectedDeliveryStopKey === stop.unit_key;
                  const isConfirmed = stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
                  const isCustomerOwned = stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER;

                  return (
                    <TouchableOpacity
                      key={stop.unit_key || `request-stop-${index + 1}`}
                      activeOpacity={0.88}
                      disabled={isCustomerOwned || isConfirmed}
                      onPress={() => {
                        setSelectedDeliveryStopKey(stop.unit_key);
                        setSelectedDeliveryProof(null);
                        setDeliveryProofNote('');
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: isSelected ? '#EC4899' : '#E5E7EB',
                        backgroundColor: isSelected ? '#FFF1F7' : '#FFFFFF',
                        borderRadius: 16,
                        padding: 14,
                        opacity: isCustomerOwned ? 0.9 : 1,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                            {getDeliveryStopDisplayLabel(stop, index)}
                          </Text>
                          <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
                            {stop.recipient_name || `Stop ${index + 1}`}
                            {stop.recipient_phone ? ` • ${stop.recipient_phone}` : ''}
                          </Text>
                          {stop.addressText ? (
                            <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
                              {stop.addressText}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <View style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: isCustomerOwned ? '#FCE7F3' : '#EDE9FE',
                          }}>
                            <Text style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: isCustomerOwned ? '#BE185D' : '#6D28D9',
                            }}>
                              {isCustomerOwned ? 'Customer confirms' : 'Rider proof'}
                            </Text>
                          </View>
                          <View style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: isConfirmed ? '#DCFCE7' : '#FEF3C7',
                          }}>
                            <Text style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: isConfirmed ? '#166534' : '#92400E',
                            }}>
                              {isConfirmed ? 'Confirmed' : (isCustomerOwned ? 'Awaiting customer' : 'Pending proof')}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {stop.proof_image_url ? (
                        <Text style={{ marginTop: 10, fontSize: 12, color: '#059669', fontWeight: '600' }}>
                          Proof uploaded
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedDeliveryStop && selectedDeliveryStop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.RIDER && selectedDeliveryStop.confirmation_status !== DELIVERY_CONFIRMATION_STATUS.CONFIRMED ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>
                    Proof for {getDeliveryStopDisplayLabel(selectedDeliveryStop)}
                  </Text>
                  <TouchableOpacity
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#F9A8D4',
                      borderStyle: 'dashed',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      backgroundColor: '#FFF7FB',
                    }}
                    onPress={pickDeliveryProofImage}
                    disabled={isCompletingDeliveryStop}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#BE185D' }}>
                      {selectedDeliveryProof ? 'Change Proof Photo' : 'Upload Proof Photo'}
                    </Text>
                  </TouchableOpacity>

                  {selectedDeliveryProof?.uri ? (
                    <Image
                      source={{ uri: selectedDeliveryProof.uri }}
                      style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: '#F3F4F6' }}
                      resizeMode="cover"
                    />
                  ) : null}

                  <TextInput
                    value={deliveryProofNote}
                    onChangeText={setDeliveryProofNote}
                    placeholder="Optional note about the delivery proof"
                    multiline
                    style={[
                      styles.input,
                      {
                        minHeight: 92,
                        textAlignVertical: 'top',
                      },
                    ]}
                  />
                </View>
              ) : selectedDeliveryStop ? (
                <View style={{
                  borderRadius: 14,
                  backgroundColor: '#F9FAFB',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  padding: 14,
                }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: '#6B7280' }}>
                    {selectedDeliveryStop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER
                      ? 'This stop will stay open until the ordering customer confirms it on tracking.'
                      : 'This stop is already confirmed.'}
                  </Text>
                </View>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={closeDeliveryStopModal}
                  disabled={isCompletingDeliveryStop}
                >
                  <Text style={styles.buttonText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleConfirmDeliveryStop}
                  disabled={
                    isCompletingDeliveryStop
                    || !selectedDeliveryStop
                    || selectedDeliveryStop.confirmation_owner !== DELIVERY_CONFIRMATION_OWNER.RIDER
                    || selectedDeliveryStop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED
                    || !selectedDeliveryProof?.base64
                  }
                >
                  <Text style={styles.buttonText}>
                    {isCompletingDeliveryStop ? 'Saving...' : 'Complete Stop'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      < Modal visible={requestStatusModalVisible} transparent animationType="fade" onRequestClose={closeRequestStatusModal}>
        <View style={styles.statusModalBackdrop}>
          <View style={styles.timelineModalContainer}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Change Request Status</Text>
            </View>

            <ScrollView contentContainerStyle={styles.timelineScrollView}>

              {(() => {
                if (!requestToUpdate) return null;
                const stepperStatuses = requestToUpdate.delivery_method === 'pickup' ? requestPickupStepperStatuses : requestDeliveryStepperStatuses;
                const getStepperIndex = (status) => stepperStatuses.findIndex(s => s.id === status);
                const selectedIndex = getStepperIndex(selectedRequestStatus);

                return (
                  <>
                    {stepperStatuses.map((status, index) => {
                      const isSelected = selectedIndex === index;
                      const isPast = selectedIndex > index;
                      const isLast = index === stepperStatuses.length - 1;

                      return (
                        <View key={status.id} style={styles.timelineStepContainer}>
                          {!isLast && (
                            <View style={[
                              styles.timelineLine,
                              (isPast || isSelected) && styles.timelineLineActive
                            ]} />
                          )}
                          <TouchableOpacity
                            style={styles.timelineStep}
                            disabled={true}
                          >
                            <View style={styles.timelineIconContainer}>
                              <View style={[
                                styles.timelineCircle,
                                isPast && styles.timelineCirclePast,
                                isSelected && styles.timelineCircleSelected
                              ]}>
                                {isPast ? (
                                  <Ionicons name="checkmark" size={18} color="#fff" />
                                ) : (
                                  <Text style={[styles.timelineCircleText, isSelected && { color: '#fff' }]}>{index + 1}</Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.timelineTextContainer}>
                              <Text style={[
                                styles.timelineLabel,
                                isPast && styles.timelineLabelPast,
                                isSelected && styles.timelineLabelSelected
                              ]}>
                                {status.label}
                              </Text>
                              <Text style={[
                                styles.timelineDescription,
                                isSelected && styles.timelineDescriptionSelected
                              ]}>
                                {status.description}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    <View style={styles.timelineActions}>
                      <TouchableOpacity
                        onPress={() => setSelectedRequestStatus('cancelled')}
                        style={[
                          styles.timelineCancelButton,
                          selectedRequestStatus === 'cancelled' && styles.timelineCancelButtonSelected
                        ]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={selectedRequestStatus === 'cancelled' ? '#fff' : '#EF4444'} />
                        <Text style={[
                          styles.timelineCancelButtonText,
                          selectedRequestStatus === 'cancelled' && { color: '#fff' }
                        ]}>
                          Cancel Request
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </ScrollView>

            <View style={styles.statusModalFooter}>
              <TouchableOpacity
                onPress={confirmRequestStatusChange}
                style={[styles.statusConfirmButton, activeActionKey && { opacity: 0.6 }]}
                disabled={Boolean(activeActionKey)}
              >
                <Text style={styles.statusConfirmButtonText}>Proceed</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={closeRequestStatusModal} style={styles.statusCloseButton} disabled={Boolean(activeActionKey)}>
                <Text style={styles.statusCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Provide Quote Modal */}
      < Modal visible={quoteModalVisible} animationType="fade" transparent onRequestClose={closeQuoteModal}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditingCustomOrderQuote ? 'Edit Breakdown' : 'Provide Price'}</Text>
              <TouchableOpacity onPress={closeQuoteModal} disabled={Boolean(activeActionKey)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToQuote?.request_number}</Text>

            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[quoteStyles.quoteScrollContent, { paddingBottom: 20 }]}
            >
              {isCustomOrderQuote ? (
                <>
                  <View style={quoteStyles.quoteSummaryCard}>
                    <Text style={quoteStyles.quoteSummaryTitle}>{quoteFlowerContext?.arrangementType || 'Custom order quote'}</Text>
                    <Text style={quoteStyles.quoteSummaryMeta}>
                      Build a clear explanation for the customer by listing the arrangement, flowers, labor, materials, extras, and delivery separately.
                    </Text>

                    {quoteHasSubtotalEstimate && quoteSubtotalRangeText ? (
                      <View style={quoteStyles.quoteRangeCard}>
                        <Text style={quoteStyles.quoteRangeLabel}>Catalogue Subtotal Range</Text>
                        <Text style={quoteStyles.quoteRangeValue}>{quoteSubtotalRangeText}</Text>
                        <Text style={quoteStyles.quoteRangeHint}>Use this as the guide for arrangement-related charges. Delivery fee is checked separately.</Text>
                      </View>
                    ) : null}

                    {quoteSubtotalRangeWarning.rangeWarningText ? (
                      <View style={quoteStyles.quoteWarningBox}>
                        <Text style={quoteStyles.quoteWarningText}>{quoteSubtotalRangeWarning.rangeWarningText}</Text>
                      </View>
                    ) : null}

                    <View style={quoteStyles.quoteSummaryTagRow}>
                      <View style={quoteStyles.quoteSummaryTag}>
                        <Text style={quoteStyles.quoteSummaryTagText}>
                          {quoteCustomOrderItems.length || quoteFlowerContext?.itemCount || 1} item{(quoteCustomOrderItems.length || quoteFlowerContext?.itemCount || 1) > 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={quoteStyles.quoteSummaryTag}>
                        <Text style={quoteStyles.quoteSummaryTagText}>
                          {quoteArrangementBreakdownItems.length || 1} arrangement{(quoteArrangementBreakdownItems.length || 1) > 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={quoteStyles.quoteSummaryTag}>
                        <Text style={quoteStyles.quoteSummaryTagText}>
                          {quoteFlowerTypes.length || 0} flower type{quoteFlowerTypes.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>

                    {quoteFlowerTypes.length ? (
                      <Text style={quoteStyles.quoteSummaryMeta}>
                        Preferred flowers: {quoteFlowerTypes.join(', ')}
                      </Text>
                    ) : null}

                    {quoteCustomOrderItems.slice(0, 3).map((customOrderItem) => (
                      <Text key={customOrderItem.key} style={quoteStyles.quoteSummaryMeta}>
                        - {customOrderItem.title}
                        {customOrderItem.arrangementText ? ` | ${customOrderItem.arrangementText}` : ''}
                        {customOrderItem.venueText ? ` | ${customOrderItem.venueText}` : ''}
                      </Text>
                    ))}
                  </View>

                  <View style={quoteStyles.quoteSectionHeader}>
                    <Text style={quoteStyles.quoteSectionTitle}>Charge Breakdown</Text>
                    <Text style={quoteStyles.quoteSectionHint}>Keep the quote simple: add a label, amount, and short reason for each charge so the customer understands the price.</Text>
                  </View>

                  {quoteChargeGroups.map((group, groupIndex) => {
                    return (
                      <View key={group.key} style={quoteStyles.quoteGroupCard}>
                        <View style={quoteStyles.quoteGroupHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={quoteStyles.quoteGroupTitle}>{group.title}</Text>
                            <Text style={quoteStyles.quoteGroupMeta}>
                              {group.preferredFlowersText
                                ? `Preferred flowers: ${group.preferredFlowersText}`
                                : 'Add the charges that explain this arrangement price.'}
                            </Text>
                            {group.hasEstimate && group.formattedLineRange ? (
                              <Text style={quoteStyles.quoteGroupMeta}>
                                Catalogue range: {group.formattedLineRange}
                              </Text>
                            ) : null}
                            {group.hasEstimate && group.rangeWarningText ? (
                              <Text style={quoteStyles.quoteAlertText}>{group.rangeWarningText}</Text>
                            ) : group.hasEstimate && group.formattedLineRange ? (
                              <Text style={quoteStyles.quoteInfoHint}>Delivery fee is excluded from this range check.</Text>
                            ) : null}
                          </View>
                          <Text style={quoteStyles.quoteGroupSubtotal}>{formatCurrency(group.subtotal)}</Text>
                        </View>

                        {group.items.length ? group.items.map((manualRow, chargeIndex) => {
                          const parsedAmount = parseCurrencyNumber(manualRow.amount);
                          return (
                            <View key={manualRow.id} style={quoteStyles.quoteChargeCard}>
                              <View style={quoteStyles.quoteChargeHeader}>
                                <View style={{ flex: 1 }}>
                                  <Text style={quoteStyles.quoteChargeTitle}>
                                    Charge {groupIndex + 1}.{chargeIndex + 1}
                                  </Text>
                                  <View style={quoteStyles.quoteChargeTypeBadge}>
                                    <Text style={quoteStyles.quoteChargeTypeBadgeText}>
                                      {getCustomOrderQuoteTypeLabel(manualRow.type)}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={quoteStyles.quoteChargeAmount}>{formatCurrency(parsedAmount)}</Text>
                              </View>

                              <Text style={quoteStyles.quoteFieldLabel}>Label</Text>
                              <TextInput
                                style={quoteStyles.quoteTextField}
                                placeholder={getQuoteChargeLabelPlaceholder(manualRow.type)}
                                value={manualRow.label}
                                onChangeText={(value) => updateQuoteManualRow(manualRow.id, 'label', value)}
                              />

                              <Text style={quoteStyles.quoteFieldLabel}>Amount</Text>
                              <View style={quoteStyles.quoteCurrencyInputRow}>
                                <View style={quoteStyles.quoteCurrencyPrefix}>
                                  <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                                </View>
                                <TextInput
                                  style={quoteStyles.quoteCurrencyInput}
                                  placeholder="0.00"
                                  keyboardType="decimal-pad"
                                  value={manualRow.amount}
                                  onChangeText={(value) => updateQuoteManualRow(manualRow.id, 'amount', value)}
                                />
                              </View>

                              <Text style={[quoteStyles.quoteFieldLabel, { marginTop: 12 }]}>Reason</Text>
                              <TextInput
                                style={quoteStyles.quoteReasonInput}
                                placeholder={getQuoteChargeReasonPlaceholder(manualRow.type)}
                                multiline
                                value={manualRow.reason}
                                onChangeText={(value) => updateQuoteManualRow(manualRow.id, 'reason', value)}
                              />

                              <View style={quoteStyles.quoteChargeFooter}>
                                <Text style={quoteStyles.quoteChargeFooterHint}>
                                  {getCustomOrderQuoteTypeLabel(manualRow.type)} charge{manualRow.reason ? ' ready for customer view.' : ' can include a short explanation.'}
                                </Text>
                                <TouchableOpacity
                                  style={[quoteStyles.quoteRemoveChip, { opacity: quoteManualRows.length <= 1 ? 0.5 : 1 }]}
                                  onPress={() => removeQuoteManualRow(manualRow.id)}
                                  disabled={quoteManualRows.length <= 1}
                                >
                                  <Text style={quoteStyles.quoteRemoveChipText}>Remove</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        }) : (
                          <Text style={quoteStyles.quoteAlertText}>No charges in this section yet.</Text>
                        )}

                        <View style={quoteStyles.quoteAddActionsRow}>
                          <TouchableOpacity
                            style={quoteStyles.quoteAddChargeButton}
                            onPress={() => addQuoteManualRow('flower', group.arrangementGroup)}
                          >
                            <Ionicons name="add" size={16} color="#be185d" />
                            <Text style={quoteStyles.quoteAddChargeText}>Add Flower</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={quoteStyles.quoteAddChargeButton}
                            onPress={() => addQuoteManualRow('extra', group.arrangementGroup)}
                          >
                            <Ionicons name="add" size={16} color="#be185d" />
                            <Text style={quoteStyles.quoteAddChargeText}>Add Charge</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  <View style={quoteStyles.quoteInputCard}>
                    <View style={quoteStyles.quoteInputHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={quoteStyles.quoteInputTitle}>Delivery Fee</Text>
                        <Text style={quoteStyles.quoteInputHint}>Keep delivery separate from arrangement charges. Use 0.00 for pickup or free delivery.</Text>
                      </View>
                      <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(quoteShippingValue)}</Text>
                    </View>

                    <View style={quoteStyles.quoteCurrencyInputRow}>
                      <View style={quoteStyles.quoteCurrencyPrefix}>
                        <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                      </View>
                      <TextInput
                        style={quoteStyles.quoteCurrencyInput}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={quoteShippingFee}
                        onChangeText={(value) => setQuoteShippingFee(sanitizeQuoteCurrencyInput(value))}
                      />
                      <Text style={quoteStyles.quoteCurrencySuffix}>/ venue</Text>
                    </View>

                    <Text style={quoteStyles.quoteInfoHint}>
                      Saved request fee: {formatCurrency(
                        requestToQuote?.shipping_fee !== null && requestToQuote?.shipping_fee !== undefined
                          ? parseCurrencyNumber(requestToQuote.shipping_fee)
                          : 0
                      )}. Update it here if the final rider or venue cost changed.
                    </Text>
                  </View>

                  {renderCustomOrderLiveQuoteSummary()}
                </>
              ) : (
                <>
                  <View style={quoteStyles.quoteSectionHeader}>
                    <Text style={quoteStyles.quoteSectionTitle}>Quote Details</Text>
                    <Text style={quoteStyles.quoteSectionHint}>Enter the item price and set the delivery fee for this request.</Text>
                  </View>

                  <View style={quoteStyles.quoteInputCard}>
                    <View style={quoteStyles.quoteInputHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={quoteStyles.quoteInputTitle}>Item Price</Text>
                        <Text style={quoteStyles.quoteInputHint}>Base price for the requested item or service.</Text>
                      </View>
                      <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(parseCurrencyNumber(quoteAmount))}</Text>
                    </View>

                    <View style={quoteStyles.quoteCurrencyInputRow}>
                      <View style={quoteStyles.quoteCurrencyPrefix}>
                        <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                      </View>
                      <TextInput
                        style={quoteStyles.quoteCurrencyInput}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={quoteAmount}
                        onChangeText={(value) => setQuoteAmount(value.replace(/[^0-9.]/g, ''))}
                      />
                      <Text style={quoteStyles.quoteCurrencySuffix}>/ order</Text>
                    </View>
                  </View>

                  <View style={quoteStyles.quoteInputCard}>
                    <View style={quoteStyles.quoteInputHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={quoteStyles.quoteInputTitle}>Delivery Fee</Text>
                        <Text style={quoteStyles.quoteInputHint}>Enter the delivery fee manually for the customer venue. Use 0.00 for pickup or free delivery.</Text>
                      </View>
                      <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(quoteShippingValue)}</Text>
                    </View>

                    <View style={quoteStyles.quoteCurrencyInputRow}>
                      <View style={quoteStyles.quoteCurrencyPrefix}>
                        <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                      </View>
                      <TextInput
                        style={quoteStyles.quoteCurrencyInput}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={quoteShippingFee}
                        onChangeText={(value) => setQuoteShippingFee(sanitizeQuoteCurrencyInput(value))}
                      />
                      <Text style={quoteStyles.quoteCurrencySuffix}>/ venue</Text>
                    </View>

                    <Text style={quoteStyles.quoteInfoHint}>
                      Saved request fee: {formatCurrency(
                        requestToQuote?.shipping_fee !== null && requestToQuote?.shipping_fee !== undefined
                          ? parseCurrencyNumber(requestToQuote.shipping_fee)
                          : 0
                      )}. You can update it here before sending the quote.
                    </Text>
                  </View>

                  <View style={quoteStyles.quoteTotalCard}>
                    <Text style={quoteStyles.quoteSectionLabel}>Quote Summary</Text>

                    <View style={quoteStyles.quoteTotalRow}>
                      <Text style={quoteStyles.quoteTotalLabel}>Item Price</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(parseCurrencyNumber(quoteAmount))}</Text>
                    </View>

                    <View style={quoteStyles.quoteTotalRow}>
                    <Text style={quoteStyles.quoteTotalLabel}>Delivery Fee</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteShippingValue)}</Text>
                    </View>

                    <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
                      <Text style={quoteStyles.quoteGrandTotalLabel}>Total Price to Pay</Text>
                      <Text style={quoteStyles.quoteGrandTotalValue}>{formatCurrency(parseCurrencyNumber(quoteAmount) + quoteShippingValue)}</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeQuoteModal}
                disabled={Boolean(activeActionKey)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleProvideQuote}
                disabled={Boolean(activeActionKey)}
              >
                <Text style={styles.buttonText}>Submit Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Decline Request Modal */}
      <Modal visible={declineModalVisible} animationType="fade" transparent onRequestClose={closeRequestDeclineModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{declineAction === 'cancel' ? 'Cancel Request' : 'Decline Request'}</Text>
              <TouchableOpacity disabled={isDeclining || Boolean(activeActionKey)} onPress={closeRequestDeclineModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToDecline?.request_number}</Text>
            <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
              <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Reason for customer</Text>
              <TextInput
                style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                placeholder={declineAction === 'cancel'
                  ? 'Explain why this request is being cancelled'
                  : 'Explain why this request is being declined'}
                multiline
                value={declineFeedback}
                onChangeText={setDeclineFeedback}
                editable={!isDeclining}
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeRequestDeclineModal}
                disabled={isDeclining || Boolean(activeActionKey)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#EF4444' }]}
                onPress={submitDeclineRequest}
                disabled={isDeclining || Boolean(activeActionKey)}
              >
                <Text style={styles.buttonText}>
                  {isDeclining
                    ? (declineAction === 'cancel' ? 'Cancelling...' : 'Declining...')
                    : (declineAction === 'cancel' ? 'Send Cancellation' : 'Decline Request')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt View Modal */}
      < Modal visible={receiptModalVisible} animationType="fade" transparent onRequestClose={() => setReceiptModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Receipt</Text>
              <TouchableOpacity onPress={() => setReceiptModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: selectedReceiptUrl }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal >

      {/* Assign Rider Modal */}
      < Modal visible={assignRiderModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={closeAssignRiderModal}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.assignRiderModalContent, { height: assignRiderModalMaxHeight }]}>
            <Text style={styles.modalTitle}>{isStopAssignmentMode ? 'Assign Delivery Stop Riders' : 'Assign Rider'}</Text>
            <View style={styles.assignRiderModalBody}>
              {isStopAssignmentMode && (
                <>
                  <Text style={styles.stopAssignmentHelpText}>
                    Choose a delivery stop first, then select the employee rider for that stop.
                  </Text>

                  <ScrollView
                    style={[styles.stopAssignmentList, { maxHeight: assignRiderStopListMaxHeight }]}
                    contentContainerStyle={styles.stopAssignmentListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={assignableStopGroups.length > 3}
                  >
                    {assignableStopGroups.map((group, index) => {
                      const assignedNames = getAssignedRiderNamesForGroup({
                        ...group,
                        assignedRiderIds: stopRiderAssignments[group.groupKey]
                          ? [String(stopRiderAssignments[group.groupKey])]
                          : group.assignedRiderIds,
                      }, requestToAssignRider);
                      const isActive = selectedStopGroup?.groupKey === group.groupKey;

                      return (
                        <TouchableOpacity
                          key={group.groupKey || `${group.recipientName}-${index}`}
                          style={[styles.stopAssignmentRow, isActive && styles.stopAssignmentRowActive]}
                          onPress={() => handleSelectStopGroup(group)}
                          activeOpacity={0.9}
                        >
                          <View style={[styles.stopAssignmentIndicator, isActive && styles.stopAssignmentIndicatorActive]}>
                            {isActive ? <View style={styles.stopAssignmentIndicatorInner} /> : null}
                          </View>
                          <View style={styles.stopAssignmentRowContent}>
                            <Text style={styles.stopAssignmentRowTitle} numberOfLines={2}>
                              {`Stop ${index + 1} - ${group.recipientName || `Delivery stop ${index + 1}`}`}
                            </Text>
                            {group.addressText ? (
                              <Text style={styles.stopAssignmentRowSubtitle} numberOfLines={2}>
                                {group.addressText}
                              </Text>
                            ) : null}
                            <Text style={[styles.stopAssignmentRowMeta, !assignedNames.length && styles.stopAssignmentRowMetaPending]}>
                              {assignedNames.length ? `Rider: ${assignedNames.join(', ')}` : 'Rider: Not assigned'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <View style={styles.riderSearchContainer}>
                <Ionicons name="search" size={20} color="#999" style={styles.riderSearchIcon} />
                <TextInput
                  style={styles.riderSearchInput}
                  placeholder="Search riders..."
                  placeholderTextColor="#999"
                  value={riderSearchQuery}
                  onChangeText={setRiderSearchQuery}
                />
              </View>

              {isStopAssignmentMode && selectedStopGroup ? (
                <View style={styles.stopAssignmentSummary}>
                  <View style={styles.stopAssignmentSummaryHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stopAssignmentSelectionLabel}>Selected stop</Text>
                      <Text style={styles.stopAssignmentSelectionTitle} numberOfLines={2}>
                        {selectedStopGroup.recipientName || 'Delivery stop'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleClearStopRider}>
                      <Text style={styles.stopAssignmentClearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {selectedStopGroup.addressText ? (
                    <Text style={styles.stopAssignmentSelectionAddress} numberOfLines={2}>
                      {selectedStopGroup.addressText}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.stopAssignmentSummaryStatus,
                      !selectedRider && styles.stopAssignmentSummaryStatusPending,
                    ]}
                  >
                    {selectedRider
                      ? `Selected rider: ${selectedRider.name}`
                      : 'No rider selected'}
                  </Text>
                </View>
              ) : null}

              <FlatList
                data={filteredAndSortedRiders}
                renderItem={({ item: rider }) => (
                  <TouchableOpacity
                    style={styles.radioButtonContainer}
                    onPress={() => handleSelectRider(rider)}
                  >
                    <View style={[styles.radioButton, selectedRider?.id === rider.id && styles.radioButtonSelected]}>
                      {selectedRider?.id === rider.id && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.riderName}>{rider.name}</Text>
                      <Text style={styles.riderEmail}>{rider.phone}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id.toString()}
                ListEmptyComponent={<Text style={styles.assignRiderEmptyText}>No riders found.</Text>}
                style={[styles.assignRiderList, { maxHeight: assignRiderListMaxHeight }]}
                contentContainerStyle={styles.assignRiderListContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                removeClippedSubviews={false}
                initialNumToRender={12}
              />
            </View>
            <View style={[styles.modalButtons, styles.assignRiderFooter]}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeAssignRiderModal} disabled={Boolean(activeActionKey)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleConfirmAssignRider}
                disabled={Boolean(activeActionKey) || (!selectedRider && !isStopAssignmentMode)}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Payment Recording Modal */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent onRequestClose={closePaymentModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isEditPaymentMode ? 'Edit Amount Received' : 'Record GCash Payment'}</Text>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ marginBottom: 5 }}>Currently Received: PHP {requestToRecordPayment?.amount_received || 0}</Text>
              <Text style={{ marginBottom: 5 }}>Total Amount: PHP {requestToRecordPayment?.final_price || 0}</Text>
              <Text style={{ marginBottom: 10, fontWeight: 'bold', color: '#EF4444' }}>
                Balance: PHP {(requestToRecordPayment?.final_price || 0) - (requestToRecordPayment?.amount_received || 0)}
              </Text>
            </View>
            <Text style={{ marginBottom: 5, fontWeight: '500' }}>
              {isEditPaymentMode ? 'Correct Amount Received' : 'Enter Amount Received (New)'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closePaymentModal} disabled={Boolean(activeActionKey)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmPayment} disabled={Boolean(activeActionKey)}>
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View >
  );
};

export default RequestsTab;










