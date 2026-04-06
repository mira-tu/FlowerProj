import React, { useState, useEffect } from 'react';
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
import { groupDeliveryDestinations } from '../../../utils/deliveryDestinations';
import { filterRequestForAssignedRider, shouldRestrictRequestToAssignedRider } from '../../../utils/riderAssignmentFilter';

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
    formattedSubtotalRange: hasCompleteEstimate ? formatTentativeRange(subtotalMin, subtotalMax) : 'For discussion',
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

const getRemainingRequestItemQuantity = (item = {}) => {
  const fallbackQuantity = toPositiveInt(
    item?.quantity
    ?? item?.qty
    ?? item?.arrangementQuantity
    ?? item?.arrangement_quantity,
    0
  );

  return toPositiveInt(item?.remaining_quantity ?? item?.remainingQuantity, fallbackQuantity);
};

const getCancelledRequestItemQuantity = (item = {}) => (
  toPositiveInt(item?.cancelled_quantity ?? item?.cancelledQuantity, 0)
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

      return {
        arrangementLabel,
        quantity,
        flowersPerArrangement,
        totalFlowers,
        preferredFlowerNames: getArrangementSelectionPreferredFlowerNames(selection),
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
    if (!arrangementLabel) return;

    if (!merged.has(arrangementLabel)) {
      merged.set(arrangementLabel, {
        arrangementLabel,
        quantity: 0,
        flowersPerArrangement: selection?.flowersPerArrangement || getArrangementFlowerCount(arrangementLabel),
        totalFlowers: 0,
        preferredFlowerNames: [],
      });
    }

    const current = merged.get(arrangementLabel);
    current.quantity += toPositiveInt(selection?.quantity, 0);
    current.totalFlowers += toPositiveInt(selection?.totalFlowers, 0);
    current.preferredFlowerNames = Array.from(
      new Set([
        ...(Array.isArray(current.preferredFlowerNames) ? current.preferredFlowerNames : []),
        ...(Array.isArray(selection?.preferredFlowerNames) ? selection.preferredFlowerNames : []),
      ])
    );
  });

  return Array.from(merged.values());
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
  const arrangementSelections = mergeArrangementSelections(
    pricingSources.flatMap((item) => normalizeArrangementSelections(item))
  );

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
    ? arrangementSelections.map((selection) => `${selection.arrangementLabel} x${selection.quantity}`).join(', ')
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

  return {
    arrangementType,
    arrangementQuantity,
    totalFlowers,
    arrangementSelections,
    flowerTypes: normalizedFlowerTypes,
    flowerQuantities,
    itemCount: bookingItems.reduce((sum, item) => sum + getRemainingRequestItemQuantity(item), 0) || bookingItems.length || 1,
  };
};
const formatCurrency = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `PHP ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const createManualQuoteRow = (name = '', price = '', arrangementGroup = null) => ({
  id: `quote-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productName: String(name || ''),
  price: String(price || ''),
  arrangementGroup,
});

const buildManualQuoteRows = (bookingItems, storedQuoteBreakdown) => {
  const lineItems = Array.isArray(storedQuoteBreakdown?.line_items) ? storedQuoteBreakdown.line_items : [];

  if (lineItems.length) {
    return lineItems.map((item) => createManualQuoteRow(
      item?.product_name || item?.flowerName || item?.name || '',
      item?.price != null ? String(item.price) : (item?.unitPrice != null ? String(item.unitPrice) : (item?.unit_price != null ? String(item.unit_price) : '')),
      item?.arrangement_group || null
    ));
  }

  const items = Array.isArray(bookingItems) ? bookingItems : [];
  const seededRows = items
    .map((item, index) => {
      const arrangementLabel = firstNonEmpty(
        item?.arrangementSummary,
        getBookingArrangementText(item),
        item?.arrangementType,
        item?.arrangement_type
      );
      const productName = firstNonEmpty(
        item?.name,
        arrangementLabel,
        item?.occasion
      ) || `Custom Order ${index + 1}`;

      return createManualQuoteRow(productName, '', arrangementLabel || productName);
    })
    .filter((row) => row.productName);

  if (seededRows.length) {
    return seededRows;
  }

  return [createManualQuoteRow('', '')];
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
  },
  quoteBreakdownMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#c2410c',
    lineHeight: 16,
  },
  quoteBreakdownFlowerRail: {
    marginLeft: 12,
    width: 124,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  quoteBreakdownFlowerTile: {
    width: 52,
    marginLeft: 6,
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
    marginBottom: 8,
  },
  quoteTotalLabel: {
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
  },
  quoteTotalDivider: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f9a8d4',
  },
  quoteGrandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteGrandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
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
  const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];

  if (arrangementSelections.length) {
    return arrangementSelections
      .map((selection) => {
        const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
        const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
        return label ? `${label} x${quantity}` : null;
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
      label: `Custom Order ${index + 1}`,
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
    const price = parseCurrencyNumber(item?.price);
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
      flowersText,
      wrapperName,
      ribbonName,
      bundleSize,
      bundleSizeText: bundleSize ? `${bundleSize} stems` : null,
      priceText: price > 0 ? `PHP ${price.toFixed(2)}` : null,
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

const RequestsTab = ({ currentUser, setActiveTab, handleSelectCustomerForMessage, focusedEntityTarget, clearFocusedEntityTarget }) => {
  const { height: screenHeight } = useWindowDimensions();
  const getCustomerInitials = (name) => {
    if (!name) return '??';
    const names = name.trim().split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handlePhoneCall = (phoneNumber) => {
    if (phoneNumber && phoneNumber !== 'N/A' && phoneNumber.trim() !== '') {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'This customer does not have a valid phone number on file.');
    }
  };

  const handleMessageCustomer = (user, customerName, customerEmail) => {
    if (!user || !user.id) {
      Alert.alert('Cannot message user', 'User information is incomplete.');
      return;
    }
    handleSelectCustomerForMessage({ id: user.id, name: customerName, email: customerEmail });
  };
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedCustomizedItem, setSelectedCustomizedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [customizedItemModalVisible, setCustomizedItemModalVisible] = useState(false);
  const [requestStatusModalVisible, setRequestStatusModalVisible] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState(null);
  const [selectedRequestStatus, setSelectedRequestStatus] = useState(null);
  const [deliveryOrPickup, setDeliveryOrPickup] = useState('delivery');
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

  // Payment Recording State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [requestToRecordPayment, setRequestToRecordPayment] = useState(null);
  const [isEditPaymentMode, setIsEditPaymentMode] = useState(false);

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [requestToAssignRider, setRequestToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const [selectedStopGroupKey, setSelectedStopGroupKey] = useState(null);
  const [stopRiderAssignments, setStopRiderAssignments] = useState({});

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

  const loadRiders = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('role', 'employee');
      if (error) throw error;
      setRiders(data || []);
    } catch (error) {
      console.error('Error loading riders:', error);
    }
  };

  const getGroupedDestinations = React.useCallback(
    (request) => groupDeliveryDestinations(request?.data?.multi_delivery_destinations || []),
    []
  );

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

  const selectedStopGroup = React.useMemo(
    () => assignableStopGroups.find((group) => group.groupKey === selectedStopGroupKey) || null,
    [assignableStopGroups, selectedStopGroupKey]
  );

  const isStopAssignmentMode = assignableStopGroups.length > 0;
  const assignRiderModalMaxHeight = Math.max(420, Math.min(screenHeight - 36, 760));
  const assignRiderStopListMaxHeight = Math.max(120, Math.min(screenHeight * 0.22, 220));
  const assignRiderListMaxHeight = Math.max(180, Math.min(screenHeight * 0.34, 320));

  // Filter wrapper
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

  useFocusEffect(
    React.useCallback(() => {
      loadRequests();
      loadRiders();

      const channel = supabase
        .channel('public:requests')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'requests' },
          (payload) => {
            loadRequests();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [])
  );

  const openReceiptModal = (url) => {
    const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setSelectedReceiptUrl(finalUrl);
    setReceiptModalVisible(true);
  };


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
              <DetailSection label="Quantity:" value={remainingQuantity ? String(remainingQuantity) : (arrangementQuantity ? String(arrangementQuantity) : null)} />
              <DetailSection label="Cancelled Quantity:" value={cancelledQuantity ? String(cancelledQuantity) : null} />
              {tentativeBreakdown.lineItems.length ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Tentative Breakdown</Text>
                  <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 12, marginTop: 6 }}>
                    {tentativeBreakdown.lineItems.map((lineItem) => (
                      <View key={lineItem.key} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                          <Text style={[styles.detailValue, { flex: 1 }]}>{`${lineItem.label} x${lineItem.quantity}`}</Text>
                          <Text style={[styles.detailValue, { textAlign: 'right' }]}>{lineItem.formattedLineRange}</Text>
                        </View>
                        <Text style={[styles.detailLabel, { marginTop: 2, textTransform: 'none', letterSpacing: 0 }]}>Each: {lineItem.formattedUnitRange}</Text>
                      </View>
                    ))}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#f3d7e3', paddingTop: 10, marginTop: 2, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={styles.detailLabel}>Tentative Subtotal</Text>
                      <Text style={[styles.detailValue, { textAlign: 'right' }]}>{tentativeBreakdown.formattedSubtotalRange}</Text>
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
            <DetailSection label="Quantity:" value={remainingQuantity ? String(remainingQuantity) : null} />
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

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAllRequests();
      setRequests(response.data.requests || []);
    } catch (error) {
      console.error('Error loading requests:', error);
      setRequests([]);
      Alert.alert('Error', 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

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

  const handleProceedRequestStatus = async (request) => {
    const nextStatus = getNextRequestStatus(request.status, request.delivery_method, request.type);
    if (!nextStatus) return;

    // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
    if (nextStatus === 'out_for_delivery') {
      const hasRider = hasRequiredRiderAssignments(request);
      if (!hasRider) {
        Alert.alert(
          "Rider Required",
          "Please assign a rider before moving this request to Out for Delivery."
        );
        return;
      }
    }

    try {
      await adminAPI.updateRequestStatus(request.id, nextStatus);

      // New logic: If request is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (nextStatus === 'completed' && request.payment_method?.toLowerCase() === 'cod' && request.payment_status === 'to_pay') {
        await adminAPI.updateRequestPaymentStatus(request, 'paid');
        Toast.show({ type: 'success', text1: 'Request Completed & Paid' });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Status Updated',
          text2: `Request #${request.request_number} is now ${getStatusLabel(nextStatus)}.`
        });
      }

      loadRequests();
    } catch (error) {
      console.error('Error proceeding request status:', error);
      Toast.show({ type: 'error', text1: 'Update Failed' });
    }
  };

  const openRequestDeclineModal = (request, action = 'decline') => {
    setRequestToDecline(request);
    setDeclineAction(action);
    setDeclineFeedback('');
    setDeclineModalVisible(true);
  };

  const closeRequestDeclineModal = () => {
    setDeclineModalVisible(false);
    setRequestToDecline(null);
    setDeclineAction('decline');
    setDeclineFeedback('');
  };

  const handleDeclineRequest = (request) => {
    openRequestDeclineModal(request, 'decline');
  };

  const submitDeclineRequest = async () => {
    if (!requestToDecline) return;

    const feedback = declineFeedback.trim();
    if (!feedback) {
      Alert.alert('Reason Required', 'Please provide a short reason before cancelling this request.');
      return;
    }

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
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      console.error('Decline request error:', error);
      Toast.show({ type: 'error', text1: 'Decline Failed' });
    } finally {
      setIsDeclining(false);
    }
  };

  const openRequestStatusModal = (request) => {
    setRequestToUpdate(request);
    const nextStatus = getNextRequestStatus(request.status, request.delivery_method, request.type);
    if (nextStatus) {
      setSelectedRequestStatus(nextStatus);
    } else {
      setSelectedRequestStatus(request.status);
    }
    setDeliveryOrPickup(request.delivery_method || 'delivery');
    setRequestStatusModalVisible(true);
  };

  const handleAcceptPendingRequest = async (request) => {
    if (!request) return;

    const nextStatus = resolveAcceptedRequestStatus(request);
    const acceptedMessage = nextStatus === 'processing'
      ? 'Your request #' + request.request_number + ' has been accepted and is now being prepared.'
      : 'Your request #' + request.request_number + " has been accepted. We'll confirm the payment details and begin processing shortly.";

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

      setModalVisible(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error) {
      console.error('Error accepting request:', error);
      Toast.show({ type: 'error', text1: 'Failed to accept request' });
    }
  };

  const confirmRequestStatusChange = async () => {
    if (!requestToUpdate || !selectedRequestStatus) return;
    const requestId = requestToUpdate.id;

    if (selectedRequestStatus === 'cancelled') {
      setRequestStatusModalVisible(false);
      openRequestDeclineModal(requestToUpdate, 'cancel');
      setRequestToUpdate(null);
      setSelectedRequestStatus(null);
      return;
    }

    try {
      // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
      if (selectedRequestStatus === 'out_for_delivery') {
        const hasRider = hasRequiredRiderAssignments(requestToUpdate);
        if (!hasRider) {
          Alert.alert(
            "Rider Required",
            "Please assign a rider before moving this request to Out for Delivery."
          );
          return;
        }
      }

      // Payment enforcement: If moving to Out for Delivery or Ready for Pickup/Completed, status must be paid if not COD
      const isMovingToDelivery = ['out_for_delivery', 'ready_for_pickup', 'ready_for_pick_up', 'completed'].includes(selectedRequestStatus);
      const isNotPaid = requestToUpdate.payment_status !== 'paid';
      const isNotCOD = requestToUpdate.payment_method?.toLowerCase() !== 'cod';

      if (isMovingToDelivery && isNotPaid && isNotCOD) {
        Alert.alert(
          "Payment Required",
          "You cannot move this request to delivery/pickup until the payment is confirmed (except for COD)."
        );
        return;
      }

      setRequestStatusModalVisible(false); // Close modal after validation passes

      await adminAPI.updateRequestStatus(requestId, selectedRequestStatus);

      // New logic: If request is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
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
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      console.error('Update request status error:', error);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: error.response?.data?.message || 'Failed to update request status'
      });
    } finally {
      setRequestToUpdate(null);
      setSelectedRequestStatus(null);
    }
  };

  const isCustomOrderQuote = requestToQuote?.type === 'booking';
  const isEditingCustomOrderQuote = isCustomOrderQuote && requestToQuote?.status && requestToQuote.status !== 'pending';

  const quoteBreakdownRows = React.useMemo(() => {
    if (!quoteManualRows.length) return [];

    return quoteManualRows.map((row) => {
      const productName = String(row.productName || '').trim();
      const price = parseCurrencyNumber(row.price);
      return {
        productName: productName || 'Untitled product',
        price,
        hasName: Boolean(productName),
      };
    });
  }, [quoteManualRows]);

  const quoteFlowerSubtotal = React.useMemo(
    () => quoteManualRows.reduce((sum, row) => sum + parseCurrencyNumber(row.price), 0),
    [quoteManualRows]
  );

  const quoteShippingValue = parseCurrencyNumber(quoteShippingFee);
  const quoteTotalToPay = quoteFlowerSubtotal + quoteShippingValue;
  const quoteArrangementSelections = quoteFlowerContext?.arrangementSelections || [];
  const quoteFlowerTypes = quoteFlowerContext?.flowerTypes || [];
  const quoteCustomOrderItems = React.useMemo(
    () => requestToQuote?.type === 'booking' ? getBookingRequestItems(requestToQuote) : [],
    [requestToQuote]
  );
  const quoteArrangementBreakdownItems = React.useMemo(
    () => quoteArrangementSelections.map((selection) => {
      const selectionPreferredFlowers = getArrangementSelectionPreferredFlowerNames(selection);
      const matchedPreferredFlowers = Array.from(
        new Set(
          quoteCustomOrderItems.flatMap((item) => {
            const arrangementText = String(item?.arrangementText || '').trim();
            const arrangementLabel = String(selection?.arrangementLabel || '').trim();
            const doesMatchArrangement = arrangementLabel && arrangementText
              ? arrangementText.toLowerCase().includes(arrangementLabel.toLowerCase())
              : false;

            if (!doesMatchArrangement && quoteCustomOrderItems.length > 1) {
              return [];
            }

            return normalizeFlowerNames(item?.preferredFlowers);
          })
        )
      );

      const fallbackFlowers = selectionPreferredFlowers.length
        ? selectionPreferredFlowers
        : (matchedPreferredFlowers.length ? matchedPreferredFlowers : quoteFlowerTypes);

      return {
        ...selection,
        preferredFlowerNames: fallbackFlowers,
        preferredFlowersText: fallbackFlowers.length ? fallbackFlowers.join(', ') : null,
      };
    }),
    [quoteArrangementSelections, quoteCustomOrderItems, quoteFlowerTypes]
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
      if (field === 'price') return { ...row, price: sanitizeQuoteCurrencyInput(value) };
      return { ...row, productName: value };
    }));
  };

  const addQuoteManualRow = () => {
    setQuoteManualRows((previousRows) => [...previousRows, createManualQuoteRow('', '')]);
  };

  const removeQuoteManualRow = (rowId) => {
    setQuoteManualRows((previousRows) => (
      previousRows.length <= 1
        ? previousRows
        : previousRows.filter((row) => row.id !== rowId)
    ));
  };

  const openQuoteModal = (request) => {
    setRequestToQuote(request);

    const requestData = normalizeRequestData(request);
    const bookingItems = getBookingItemsFromData(requestData);
    const storedQuoteBreakdown = requestData?.quote_breakdown;

    const initialShipping = request.shipping_fee !== null && request.shipping_fee !== undefined
      ? parseCurrencyNumber(request.shipping_fee)
      : (storedQuoteBreakdown?.shipping_fee !== null && storedQuoteBreakdown?.shipping_fee !== undefined
        ? parseCurrencyNumber(storedQuoteBreakdown.shipping_fee)
        : 0);

    const initialPrice = request.final_price !== null && request.final_price !== undefined
      ? String(Math.max(parseCurrencyNumber(request.final_price) - initialShipping, 0))
      : '';

    setQuoteAmount(initialPrice);
    setQuoteShippingFee(initialShipping > 0 ? String(initialShipping) : '');
    setQuoteFlowerContext(buildFlowerPricingContext(request));
    setQuoteManualRows(buildManualQuoteRows(bookingItems, storedQuoteBreakdown));
    setQuoteModalVisible(true);
  };

  const handleProvideQuote = async () => {
    if (!requestToQuote) return;

    const parsedShippingFee = parseCurrencyNumber(quoteShippingFee);

    let parsedItemPrice = 0;
    let quoteBreakdownPayload = null;

    if (isCustomOrderQuote) {
      if (!quoteManualRows.length) {
        Alert.alert('Missing Details', 'Please add at least one product in the custom order breakdown.');
        return;
      }

      const normalizedBreakdownRows = quoteManualRows.map((row) => ({
        product_name: String(row.productName || '').trim(),
        price: parseCurrencyNumber(row.price),
        ...(row.arrangementGroup ? { arrangement_group: row.arrangementGroup } : {}),
      }));

      const hasInvalidBreakdownRow = normalizedBreakdownRows.some((row) => (
        !row.product_name
        || !Number.isFinite(row.price)
        || row.price < 0
      ));

      if (hasInvalidBreakdownRow) {
        Alert.alert('Invalid Input', 'Please complete each product with a name and a valid price.');
        return;
      }

      parsedItemPrice = quoteFlowerSubtotal;
      quoteBreakdownPayload = {
        line_items: normalizedBreakdownRows,
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

    try {
      const { data: { request: updatedRequest } } = await adminAPI.provideQuote(
        requestToQuote.id,
        parsedItemPrice,
        parsedShippingFee,
        quoteBreakdownPayload
      );

      // Create notification for the user
      if (updatedRequest) {
        const notificationData = {
          user_id: updatedRequest.user_id,
          type: 'quote',
          title: `Price Quote for Your Request`,
          message: `We've provided a quote of PHP ${updatedRequest.final_price.toFixed(2)} for your request #${updatedRequest.request_number}. Please review and take action.`,
          link: `/profile` // Link to profile where they can see the request
        };
        await supabase.from('notifications').insert([notificationData]);
      }

      Toast.show({
        type: 'success',
        text1: 'Quote Provided',
        text2: `A quote of PHP ${(parsedItemPrice + parsedShippingFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been sent for request #${requestToQuote.request_number}.`
      });
      closeQuoteModal();
      setModalVisible(false); // Close the main details modal too
      loadRequests(); // Refresh the list
    } catch (error) {
      console.error('Error providing quote:', error);
      Alert.alert('Error', 'Failed to provide quote.');
    }
  };

  const handleUpdatePaymentStatus = async (requestId, status) => {
    try {
      await adminAPI.updateRequestPaymentStatus(requestId, status);
      Toast.show({ type: 'success', text1: `Payment marked as ${status}` });
      loadRequests();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Payment status update failed' });
    }
  };

  const handleConfirmPayment = async () => {
    if (!requestToRecordPayment || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    try {
      const total = requestToRecordPayment.final_price || 0;
      // In edit mode: replace the existing amount. In add mode: accumulate.
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
      setPaymentModalVisible(false);

      if (selectedRequest && selectedRequest.id === requestToRecordPayment.id) {
        setSelectedRequest({
          ...selectedRequest,
          amount_received: newTotalReceived,
          payment_status: newStatus,
          status: shouldAdvanceToProcessing ? 'processing' : selectedRequest.status,
        });
      }

      setRequestToRecordPayment(null);
      setIsEditPaymentMode(false);
      loadRequests();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to record payment' });
    }
  };

  const openDetailsModal = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  const openCustomizedItemModal = (request, customizedItem) => {
    setSelectedCustomizedItem({ request, item: customizedItem });
    setCustomizedItemModalVisible(true);
  };

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

  const handleAssignRider = (request) => {
    const groupedDestinations = getGroupedDestinations(request);
    setRequestToAssignRider(request);
    setRiderSearchQuery('');
    if (groupedDestinations.length > 0) {
      const initialAssignments = getInitialStopRiderAssignments(request);
      const firstGroup = groupedDestinations[0] || null;
      const initialRiderId = firstGroup ? initialAssignments[firstGroup.groupKey] : '';

      setStopRiderAssignments(initialAssignments);
      setSelectedStopGroupKey(firstGroup?.groupKey || null);
      setSelectedRider(initialRiderId ? riderLookup[String(initialRiderId)] || null : null);
    } else {
      setStopRiderAssignments({});
      setSelectedStopGroupKey(null);
      setSelectedRider(request.rider || null);
    }
    setAssignRiderModalVisible(true);
  };

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
      loadRequests(); // Refresh the list
    } catch (err) {
      console.error('Error assigning rider to request:', err);
      const errorMessage = err?.message || 'Failed to assign rider.';
      Toast.show({ type: 'error', text1: 'Assignment Failed', text2: errorMessage });
      Alert.alert('Assignment Failed', errorMessage);
    }
  };

  const handleApproveRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    try {
      await adminAPI.approveRefundRequest(requestItem.refund_request.id, {
        actorId: currentUser?.id,
        refundAmount: requestItem.amount_received || requestItem.final_price || requestItem.refund_request.refund_amount,
      });
      Toast.show({ type: 'success', text1: 'Refund Approved' });
      loadRequests();
    } catch (error) {
      console.error('Error approving refund:', error);
      const errorMessage = error?.message || 'Failed to approve refund.';
      Toast.show({ type: 'error', text1: 'Approval Failed', text2: errorMessage });
      Alert.alert('Approval Failed', errorMessage);
    }
  };

  const handleRejectRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    try {
      await adminAPI.rejectRefundRequest(requestItem.refund_request.id, {
        actorId: currentUser?.id,
        rejectionReason: 'Refund request was not approved by admin.',
      });
      Toast.show({ type: 'success', text1: 'Refund Rejected' });
      loadRequests();
    } catch (error) {
      console.error('Error rejecting refund:', error);
      const errorMessage = error?.message || 'Failed to reject refund.';
      Toast.show({ type: 'error', text1: 'Rejection Failed', text2: errorMessage });
      Alert.alert('Rejection Failed', errorMessage);
    }
  };

  const handleStartRefundProcessing = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    try {
      await adminAPI.startRefundProcessing(requestItem.refund_request.id, {
        actorId: currentUser?.id,
      });
      Toast.show({ type: 'success', text1: 'Refund Processing Started' });
      loadRequests();
    } catch (error) {
      console.error('Error starting refund processing:', error);
      const errorMessage = error?.message || 'Failed to start refund processing.';
      Toast.show({ type: 'error', text1: 'Processing Failed', text2: errorMessage });
      Alert.alert('Processing Failed', errorMessage);
    }
  };

  const handleCompleteRefund = async (requestItem) => {
    if (!requestItem?.refund_request) return;

    try {
      await adminAPI.completeRefundRequest(requestItem.refund_request.id, {
        actorId: currentUser?.id,
      });
      Toast.show({ type: 'success', text1: 'Refund Completed' });
      loadRequests();
    } catch (error) {
      console.error('Error completing refund:', error);
      const errorMessage = error?.message || 'Failed to complete refund.';
      Toast.show({ type: 'error', text1: 'Completion Failed', text2: errorMessage });
      Alert.alert('Completion Failed', errorMessage);
    }
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, handleUpdatePaymentStatus, onAssignRider, onUpdateStatus, onProvidePrice, onDecline, onPrintReceipt, onOpenCustomizedItem }) => {
    const isCustomizedRequest = item.type === 'customized';
    const isBookingRequest = item.type === 'booking';
    const customizedItems = isCustomizedRequest ? getCustomizedRequestItems(item) : [];
    const bookingItems = isBookingRequest ? getBookingRequestItems(item) : [];
    const groupedDestinations = item.delivery_method === 'delivery' ? getGroupedDestinations(item) : [];

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
                  {customizedItem.imageUri ? (
                    <Image
                      source={{ uri: customizedItem.imageUri }}
                      style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                    />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#666" />
                  )}
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
                        style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
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
            onRecordPay={() => {
              setRequestToRecordPayment(item);
              setPaymentAmount('');
              setIsEditPaymentMode(false);
              setPaymentModalVisible(true);
            }}
            onEditAmount={() => {
              setRequestToRecordPayment(item);
              setPaymentAmount(String(item.amount_received || ''));
              setIsEditPaymentMode(true);
              setPaymentModalVisible(true);
            }}
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
                    style={[styles.eoMainBtn, { backgroundColor: '#10B981', flex: 1 }]}
                    onPress={() => handleApproveRefund(item)}
                  >
                    <Text style={styles.eoMainBtnText}>Approve Refund</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.eoMainBtn, { backgroundColor: '#EF4444', flex: 1 }]}
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
                  style={[styles.eoMainBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => handleStartRefundProcessing(item)}
                >
                  <Text style={styles.eoMainBtnText}>Start Refund Processing</Text>
                </TouchableOpacity>
              ) : null}

              {['admin', 'employee'].includes(currentUser?.role) && item.refund_request.status === 'processing' ? (
                <TouchableOpacity
                  style={[styles.eoMainBtn, { backgroundColor: '#7C3AED' }]}
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
                style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: '#10B981' }]}
                onPress={() => handleAcceptPendingRequest(item)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, styles.customizedRequestActionButton, { backgroundColor: '#EF4444' }]}
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
                style={[styles.eoMainBtn, { backgroundColor: '#F59E0B', marginTop: 10 }]}
                onPress={() => onProvidePrice(item)}
              >
                <Text style={styles.eoMainBtnText}>{item.status === 'pending' ? 'Provide Price' : 'Edit Breakdown'}</Text>
              </TouchableOpacity>
              {item.status === 'pending' && (
                <TouchableOpacity
                  style={[styles.eoMainBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
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
                style={[styles.eoMainBtn, { backgroundColor: '#F59E0B', marginTop: 10 }]}
                onPress={() => onProvidePrice(item)}
              >
                <Text style={styles.eoMainBtnText}>Provide Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
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
                { marginTop: 10, backgroundColor: (item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid' ? '#9CA3AF' : '#3B82F6' }
              ]}
              disabled={(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid'}
              onPress={() => onUpdateStatus(item)}
            >
              <Ionicons name="git-network-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
          )}

          {/* Assign Rider: only when processing + delivery */}
          {item.delivery_method === 'delivery' && item.status === 'processing' && (
            <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#10B981', marginTop: 10 }]} onPress={() => onAssignRider(item)}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>{groupedDestinations.length > 0 ? 'Assign Stop Riders' : 'Assign Rider'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

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
      <Text style={styles.tabTitle}>Custom Order Requests</Text>

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
        renderItem={({ item }) => <EnhancedRequestCard
          item={item}
          onMessageCustomer={handleMessageCustomer}
          onPhoneCall={handlePhoneCall}
          openDetailsModal={openDetailsModal}
          openReceiptModal={openReceiptModal}
          handleUpdatePaymentStatus={handleUpdatePaymentStatus}
          onAssignRider={handleAssignRider}
          onUpdateStatus={openRequestStatusModal}
          onProvidePrice={(req) => { setModalVisible(false); openQuoteModal(req); }}
          onDecline={handleDeclineRequest}
          onPrintReceipt={(item) => generateAndShareReceipt(item, true)}
          onOpenCustomizedItem={openCustomizedItemModal}
        />}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {focusedEntityTarget?.entityType === 'request' ? 'That request could not be found' : 'No requests found'}
          </Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {selectedRequest && (
              <ScrollView showsVerticalScrollIndicator={false}>
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
                      source={{ uri: selectedRequest.image_url.startsWith('http') ? selectedRequest.image_url : `http://192.168.111.94:5000${selectedRequest.image_url}` }}
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
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => handleAcceptPendingRequest(selectedRequest)}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
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
                {selectedCustomizedItem.item.imageUri ? (
                  <View style={styles.imageSection}>
                    <Image
                      source={{ uri: selectedCustomizedItem.item.imageUri }}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}

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
      < Modal visible={requestStatusModalVisible} transparent animationType="fade" onRequestClose={() => setRequestStatusModalVisible(false)}>
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
                const currentStatusIndex = getStepperIndex(requestToUpdate.status);

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
              <TouchableOpacity onPress={confirmRequestStatusChange} style={styles.statusConfirmButton}>
                <Text style={styles.statusConfirmButtonText}>Proceed</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRequestStatusModalVisible(false)} style={styles.statusCloseButton}>
                <Text style={styles.statusCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Provide Quote Modal */}
      < Modal visible={quoteModalVisible} animationType="fade" transparent >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditingCustomOrderQuote ? 'Edit Breakdown' : 'Provide Price'}</Text>
              <TouchableOpacity onPress={closeQuoteModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToQuote?.request_number}</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={quoteStyles.quoteScrollContent}>
              {isCustomOrderQuote ? (
                <>
                  <View style={quoteStyles.quoteHeroCard}>
                    <Text style={quoteStyles.quoteHeroTitle}>{quoteFlowerContext?.arrangementType || 'Arrangement details unavailable'}</Text>
                    <Text style={quoteStyles.quoteHeroSubtitle}>
                      {(quoteFlowerContext?.itemCount || quoteCustomOrderItems.length || 1)} custom order item{(quoteFlowerContext?.itemCount || quoteCustomOrderItems.length || 1) > 1 ? 's are' : ' is'} included in this request.
                    </Text>

                    {quoteCustomOrderItems.length ? (
                      <View style={quoteStyles.quoteBreakdownSection}>
                        <Text style={quoteStyles.quoteSectionLabel}>Included Custom Orders</Text>
                        {quoteCustomOrderItems.map((customOrderItem, index) => (
                          <View key={customOrderItem.key} style={quoteStyles.quoteBreakdownRow}>
                            <View style={quoteStyles.quoteBreakdownIndex}>
                              <Text style={quoteStyles.quoteBreakdownIndexText}>{index + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={quoteStyles.quoteBreakdownTitle}>{customOrderItem.title}</Text>
                              <Text style={quoteStyles.quoteBreakdownMeta}>
                                {[
                                  customOrderItem.arrangementText ? `Arrangement: ${customOrderItem.arrangementText}` : null,
                                  customOrderItem.eventDateText ? `Date: ${customOrderItem.eventDateText}${customOrderItem.eventTimeText ? ` at ${customOrderItem.eventTimeText}` : ''}` : null,
                                  customOrderItem.venueText ? `Venue: ${customOrderItem.venueText}` : null,
                                ].filter(Boolean).join('\n')}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {quoteArrangementBreakdownItems.length ? (
                      <View style={quoteStyles.quoteBreakdownSection}>
                        <Text style={quoteStyles.quoteSectionLabel}>Arrangement Breakdown</Text>
                        {quoteArrangementBreakdownItems.map((selection, index) => (
                          <View key={`${selection.arrangementLabel}-${index}`} style={quoteStyles.quoteBreakdownRow}>
                            <View style={quoteStyles.quoteBreakdownIndex}>
                              <Text style={quoteStyles.quoteBreakdownIndexText}>{index + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={quoteStyles.quoteBreakdownTitle}>{selection.arrangementLabel}</Text>
                              <Text style={quoteStyles.quoteBreakdownMeta}>
                                {selection.quantity} arrangement{selection.quantity > 1 ? 's' : ''}
                                {selection.flowersPerArrangement > 0 ? ' ? ' + selection.flowersPerArrangement + ' flowers each' : ''}
                              </Text>
                              {selection.preferredFlowersText ? (
                                <Text style={quoteStyles.quoteBreakdownMeta}>
                                  Preferred flowers: {selection.preferredFlowersText}
                                </Text>
                              ) : null}
                            </View>
                            {Array.isArray(selection.preferredFlowerNames) && selection.preferredFlowerNames.length ? (
                              <View style={quoteStyles.quoteBreakdownFlowerRail}>
                                {selection.preferredFlowerNames.map((flowerName) => {
                                  const imageUri = getFlowerPreviewImageUri(flowerName);
                                  const shortLabel = String(flowerName || '').trim();
                                  return (
                                    <View key={`${selection.arrangementLabel}-${flowerName}`} style={quoteStyles.quoteBreakdownFlowerTile}>
                                      {imageUri ? (
                                        <Image
                                          source={{ uri: imageUri }}
                                          style={quoteStyles.quoteBreakdownFlowerThumb}
                                        />
                                      ) : (
                                        <View style={quoteStyles.quoteBreakdownFlowerFallback}>
                                          <Text style={quoteStyles.quoteBreakdownFlowerFallbackText}>
                                            {shortLabel ? shortLabel.charAt(0).toUpperCase() : '?'}
                                          </Text>
                                        </View>
                                      )}
                                      <Text numberOfLines={2} style={quoteStyles.quoteBreakdownFlowerLabel}>{shortLabel}</Text>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={quoteStyles.quoteSectionHeader}>
                    <Text style={quoteStyles.quoteSectionTitle}>Custom Order Breakdown</Text>
                    <Text style={quoteStyles.quoteSectionHint}>Enter the price for each product, then set the delivery fee for the exact venue.</Text>
                  </View>

                  {quoteManualRows.length ? (() => {
                    const groups = [];
                    const groupMap = new Map();
                    quoteManualRows.forEach((row) => {
                      const key = row.arrangementGroup || '';
                      if (!groupMap.has(key)) {
                        groupMap.set(key, []);
                        groups.push(key);
                      }
                      groupMap.get(key).push(row);
                    });

                    return groups.map((groupKey) => {
                      const groupRows = groupMap.get(groupKey);
                      const groupSubtotal = groupRows.reduce((sum, row) => sum + parseCurrencyNumber(row.price), 0);
                      const globalOffset = quoteManualRows.indexOf(groupRows[0]);

                      return (
                        <View key={groupKey || 'ungrouped'}>
                          {groupKey ? (
                            <View style={{ marginTop: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[quoteStyles.quoteSectionLabel, { marginBottom: 0, flex: 1 }]}>{groupKey}</Text>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#be185d' }}>{formatCurrency(groupSubtotal)}</Text>
                            </View>
                          ) : null}

                          {groupRows.map((manualRow, localIndex) => {
                            const previewName = String(manualRow.productName || '').trim();
                            const parsedPrice = parseCurrencyNumber(manualRow.price);

                            return (
                              <View key={manualRow.id} style={quoteStyles.quoteInputCard}>
                                <View style={quoteStyles.quoteInputHeader}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={quoteStyles.quoteInputTitle}>Product {globalOffset + localIndex + 1}</Text>
                                    <Text style={quoteStyles.quoteInputHint}>{previewName || 'Set product name and price'}</Text>
                                  </View>
                                  <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(parsedPrice)}</Text>
                                </View>

                                <Text style={quoteStyles.quoteFieldLabel}>Product Name</Text>
                                <TextInput
                                  style={[quoteStyles.quoteCurrencyInput, { marginBottom: 10, borderWidth: 1, borderColor: '#fdba74', borderRadius: 10, paddingHorizontal: 12 }]}
                                  placeholder="Product name (e.g. Signature Bouquet)"
                                  value={manualRow.productName}
                                  onChangeText={(value) => updateQuoteManualRow(manualRow.id, 'productName', value)}
                                />

                                <Text style={quoteStyles.quoteFieldLabel}>Product Price</Text>
                                <View style={quoteStyles.quoteCurrencyInputRow}>
                                  <View style={quoteStyles.quoteCurrencyPrefix}>
                                    <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                                  </View>
                                  <TextInput
                                    style={quoteStyles.quoteCurrencyInput}
                                    placeholder="0.00"
                                    keyboardType="decimal-pad"
                                    value={manualRow.price}
                                    onChangeText={(value) => updateQuoteManualRow(manualRow.id, 'price', value)}
                                  />
                                </View>

                                <TouchableOpacity
                                  style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, opacity: quoteManualRows.length <= 1 ? 0.5 : 1 }}
                                  onPress={() => removeQuoteManualRow(manualRow.id)}
                                  disabled={quoteManualRows.length <= 1}
                                >
                                  <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      );
                    });
                  })() : (
                    <Text style={quoteStyles.quoteAlertText}>No products added yet.</Text>
                  )}

                  <TouchableOpacity
                    style={{ marginTop: 6, marginBottom: 8, alignSelf: 'flex-start', backgroundColor: '#ffedd5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}
                    onPress={addQuoteManualRow}
                  >
                    <Text style={{ color: '#9a3412', fontWeight: '700' }}>+ Add Product</Text>
                  </TouchableOpacity>

                  <View style={quoteStyles.quoteInputCard}>
                    <View style={quoteStyles.quoteInputHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={quoteStyles.quoteInputTitle}>Delivery Fee</Text>
                        <Text style={quoteStyles.quoteInputHint}>Enter the delivery fee manually for this venue. Use 0.00 for pickup or free delivery.</Text>
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
                      )}. You can change it here before sending the quote.
                    </Text>
                  </View>

                  <View style={quoteStyles.quoteTotalCard}>
                    <Text style={quoteStyles.quoteSectionLabel}>Live Quote</Text>

                    {(() => {
                      const groups = [];
                      const groupMap = new Map();
                      quoteBreakdownRows.forEach((row) => {
                        const key = quoteManualRows.find((manualRow) => manualRow.productName === row.productName)?.arrangementGroup || '';
                        if (!groupMap.has(key)) {
                          groupMap.set(key, []);
                          groups.push(key);
                        }
                        groupMap.get(key).push(row);
                      });

                      return groups.map((groupKey) => {
                        const groupRows = groupMap.get(groupKey);
                        return (
                          <View key={groupKey || 'ungrouped'}>
                            {groupKey ? (
                              <Text style={[quoteStyles.quoteTotalMeta, { marginBottom: 4, marginTop: 4, fontWeight: '700', color: '#9a3412' }]}>{groupKey}</Text>
                            ) : null}
                            {groupRows.map((row, index) => (
                              <View key={`${row.productName}-${index}`} style={quoteStyles.quoteTotalRow}>
                                <Text style={[quoteStyles.quoteTotalLabel, { flex: 1, paddingRight: 12 }]}>{row.productName}</Text>
                                <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(row.price)}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      });
                    })()}

                    <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
                      <Text style={quoteStyles.quoteTotalLabel}>Product Subtotal</Text>
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
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleProvideQuote}
              >
                <Text style={styles.buttonText}>Submit Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Decline Request Modal */}
      <Modal visible={declineModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{declineAction === 'cancel' ? 'Cancel Request' : 'Decline Request'}</Text>
              <TouchableOpacity disabled={isDeclining} onPress={closeRequestDeclineModal}>
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
                disabled={isDeclining}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#EF4444' }]}
                onPress={submitDeclineRequest}
                disabled={isDeclining}
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
      < Modal visible={receiptModalVisible} animationType="fade" transparent >
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
      < Modal visible={assignRiderModalVisible} animationType="fade" transparent statusBarTranslucent >
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
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeAssignRiderModal}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleConfirmAssignRider}
                disabled={!selectedRider && !isStopAssignmentMode}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Payment Recording Modal */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent>
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
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmPayment}>
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










