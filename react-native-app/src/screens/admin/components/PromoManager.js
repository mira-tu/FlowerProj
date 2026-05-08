import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../config/supabase';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import {
  fetchDiscountPromos,
  generatePromoCode,
  normalizePromo,
  normalizePromoCode,
} from '../../../utils/promoEngine';

const PLACEHOLDER_TEXT_COLOR = '#9ca3af';

const MODE_OPTIONS = [
  { value: 'coupon_code', label: 'Coupon' },
  { value: 'automatic_event', label: 'Event' },
  { value: 'occasion_based', label: 'Occasion' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: 'percent', label: 'Percent' },
  { value: 'amount', label: 'Fixed amount' },
];

const CHANNEL_LABELS = {
  catalog: 'Catalogue',
  customized: 'Customizer Studio',
  custom_order: 'Custom Order',
};

const blankForm = (channelScope) => ({
  id: null,
  code: generatePromoCode(CHANNEL_LABELS[channelScope] || 'PROMO'),
  name: '',
  description: '',
  discount_type: 'percent',
  discount_percent: '',
  discount_amount: '',
  channel_scope: channelScope,
  discount_mode: channelScope === 'custom_order' ? 'occasion_based' : 'coupon_code',
  target_scope: 'order',
  is_active: true,
  starts_at: '',
  ends_at: '',
  usage_limit_total: '',
  usage_limit_per_user: '',
  minimum_subtotal: '',
  applies_to_sale_items: true,
  targetKind: 'all',
  product_ids: [],
  category_ids: [],
  customized_item_targets: [],
  custom_order_arrangement_targets: [],
  occasion_targets: [],
});

const toText = (value) => String(value ?? '').trim();
const toArray = (value) => (Array.isArray(value) ? value.map((item) => toText(item)).filter(Boolean) : []);
const parseNumberOrNull = (value) => {
  const normalized = toText(value);
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseIntegerOrNull = (value) => {
  const normalized = toText(value);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const sanitizeDateInput = (value) => String(value ?? '').replace(/[^0-9-]/g, '').slice(0, 10);

const parseDateOrNull = (value, label = 'Date') => {
  const normalized = toText(value);
  if (!normalized) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(normalized);
  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));

  if (
    !Number.isFinite(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }

  return parsed.toISOString();
};

const createValidationError = (fieldErrors, fallbackMessage) => {
  const message = fallbackMessage || Object.values(fieldErrors).find(Boolean) || 'Please review the highlighted promo fields.';
  const error = new Error(message);
  error.isValidationError = true;
  error.fieldErrors = fieldErrors;
  return error;
};

const isSchemaCacheMissingColumnError = (error, columns = []) => {
  const code = toText(error?.code).toLowerCase();
  const message = `${toText(error?.message)} ${toText(error?.details)} ${toText(error?.hint)}`.toLowerCase();
  return (code === 'pgrst204' || message.includes('schema cache') || message.includes('could not find'))
    && columns.some((column) => message.includes(column.toLowerCase()));
};

const canRetryWithLegacyPercentPayload = (error, payload = {}) => (
  normalizeDiscountType(payload.discount_type) === 'percent'
  && isSchemaCacheMissingColumnError(error, ['discount_type', 'discount_amount'])
);

const toLegacyPercentPromoPayload = (payload = {}) => {
  const { discount_type: _discountType, discount_amount: _discountAmount, ...legacyPayload } = payload;
  return legacyPayload;
};

const getPromoSaveErrorMessage = (error, payload = {}) => {
  if (isSchemaCacheMissingColumnError(error, ['discount_type', 'discount_amount'])) {
    if (normalizeDiscountType(payload.discount_type) === 'amount') {
      return 'Fixed amount promos need the latest promo database update before they can be saved. Please ask an admin to update the database, then try again.';
    }
    return 'The promo database update is not active yet. This promo could not be saved; please update the database and try again.';
  }
  return error?.message || 'Unable to save this promo.';
};

const getOptionValue = (option) => toText(option?.value ?? option?.id ?? option?.name ?? option?.label);
const getOptionLabel = (option) => toText(option?.label ?? option?.name ?? option?.category_name ?? option?.value ?? option?.id);
const normalizeDiscountType = (value) => (toText(value).toLowerCase() === 'amount' ? 'amount' : 'percent');
const formatPeso = (value) => {
  const amount = parseNumberOrNull(value) || 0;
  return `PHP ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
const getPromoDiscountLabel = (promo = {}) => {
  if (normalizeDiscountType(promo.discount_type) === 'amount') {
    return `${formatPeso(promo.discount_amount)} off`;
  }
  return `${parseNumberOrNull(promo.discount_percent) || 0}%`;
};

const inferTargetKind = (promo, channelScope) => {
  if (channelScope === 'catalog') {
    if (toArray(promo.product_ids).length) return 'products';
    if (toArray(promo.category_ids).length) return 'categories';
  }

  if (channelScope === 'customized' && toArray(promo.customized_item_targets).length) {
    return 'customized_items';
  }

  if (channelScope === 'custom_order') {
    if (toArray(promo.custom_order_arrangement_targets).length) return 'arrangements';
    if (toArray(promo.occasion_targets).length) return 'occasions';
  }

  return 'all';
};

const buildTargetChoices = ({
  channelScope,
  productOptions,
  categoryOptions,
  customizedTargetOptions,
  occasionOptions,
  arrangementOptions,
}) => {
  if (channelScope === 'catalog') {
    return {
      all: { label: 'Whole catalogue', options: [] },
      products: { label: 'Selected products', options: productOptions },
      categories: { label: 'Selected categories', options: categoryOptions },
    };
  }

  if (channelScope === 'customized') {
    return {
      all: { label: 'Whole customizer', options: [] },
      customized_items: { label: 'Selected stock items', options: customizedTargetOptions },
    };
  }

  return {
    all: { label: 'All custom orders', options: [] },
    arrangements: { label: 'Arrangement targets', options: arrangementOptions },
    occasions: { label: 'Occasion targets', options: occasionOptions },
  };
};

const PromoManager = ({
  channelScope,
  title,
  productOptions = [],
  categoryOptions = [],
  customizedTargetOptions = [],
  occasionOptions = [],
  arrangementOptions = [],
}) => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState(null);
  const [deletingPromo, setDeletingPromo] = useState(false);
  const [form, setForm] = useState(() => blankForm(channelScope));
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const targetChoices = useMemo(() => buildTargetChoices({
    channelScope,
    productOptions,
    categoryOptions,
    customizedTargetOptions,
    occasionOptions,
    arrangementOptions,
  }), [arrangementOptions, categoryOptions, channelScope, customizedTargetOptions, occasionOptions, productOptions]);

  const selectedOptions = targetChoices[form.targetKind]?.options || [];
  const selectedValues = (() => {
    if (form.targetKind === 'products') return form.product_ids;
    if (form.targetKind === 'categories') return form.category_ids;
    if (form.targetKind === 'customized_items') return form.customized_item_targets;
    if (form.targetKind === 'arrangements') return form.custom_order_arrangement_targets;
    if (form.targetKind === 'occasions') return form.occasion_targets;
    return [];
  })();

  const loadPromos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDiscountPromos(supabase, { channelScope });
      setPromos(result.promos || []);
    } catch (error) {
      console.error('Error loading discount promos:', error);
      Alert.alert('Error', error.message || 'Failed to load discount promos.');
    } finally {
      setLoading(false);
    }
  }, [channelScope]);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError('');
    setFieldErrors((current) => {
      const nextErrors = { ...current };
      const fieldsToClear = new Set(Object.keys(patch));
      if (Object.prototype.hasOwnProperty.call(patch, 'discount_type')) {
        fieldsToClear.add('discount_percent');
        fieldsToClear.add('discount_amount');
      }
      fieldsToClear.forEach((fieldName) => {
        delete nextErrors[fieldName];
      });
      return nextErrors;
    });
  };

  const resetForm = () => {
    setEditing(false);
    setFormError('');
    setFieldErrors({});
    setForm(blankForm(channelScope));
  };

  const beginEdit = (promo) => {
    const normalized = normalizePromo(promo);
    setEditing(true);
    setFormError('');
    setFieldErrors({});
    setForm({
      ...blankForm(channelScope),
      ...normalized,
      discount_type: normalizeDiscountType(normalized.discount_type),
      discount_percent: toText(normalized.discount_percent),
      discount_amount: normalized.discount_amount ? toText(normalized.discount_amount) : '',
      starts_at: normalized.starts_at ? toText(normalized.starts_at).slice(0, 10) : '',
      ends_at: normalized.ends_at ? toText(normalized.ends_at).slice(0, 10) : '',
      usage_limit_total: normalized.usage_limit_total === null ? '' : toText(normalized.usage_limit_total),
      usage_limit_per_user: normalized.usage_limit_per_user === null ? '' : toText(normalized.usage_limit_per_user),
      minimum_subtotal: normalized.minimum_subtotal ? toText(normalized.minimum_subtotal) : '',
      target_scope: 'order',
      targetKind: inferTargetKind(normalized, channelScope),
      product_ids: toArray(normalized.product_ids),
      category_ids: toArray(normalized.category_ids),
      customized_item_targets: toArray(normalized.customized_item_targets),
      custom_order_arrangement_targets: toArray(normalized.custom_order_arrangement_targets),
      occasion_targets: toArray(normalized.occasion_targets),
    });
  };

  const toggleSelectedTarget = (value) => {
    const fieldByTargetKind = {
      products: 'product_ids',
      categories: 'category_ids',
      customized_items: 'customized_item_targets',
      arrangements: 'custom_order_arrangement_targets',
      occasions: 'occasion_targets',
    };
    const field = fieldByTargetKind[form.targetKind];
    if (!field) return;

    setForm((current) => {
      const currentValues = toArray(current[field]);
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...current, [field]: nextValues };
    });
  };

  const setTargetKind = (targetKind) => {
    updateForm({
      targetKind,
      product_ids: [],
      category_ids: [],
      customized_item_targets: [],
      custom_order_arrangement_targets: [],
      occasion_targets: [],
    });
  };

  const buildPayload = () => {
    const code = normalizePromoCode(form.code || generatePromoCode(form.name || 'PROMO'));
    const discountType = normalizeDiscountType(form.discount_type);
    const discountPercent = parseNumberOrNull(form.discount_percent);
    const discountAmount = parseNumberOrNull(form.discount_amount);
    const minimumSubtotal = parseNumberOrNull(form.minimum_subtotal) || 0;

    if (!code) {
      throw createValidationError({ code: 'Promo code is required.' });
    }
    if (!toText(form.name)) {
      throw createValidationError({ name: 'Promo name is required.' });
    }
    if (discountType === 'percent' && (!discountPercent || discountPercent <= 0 || discountPercent > 100)) {
      throw createValidationError({ discount_percent: 'Discount percent must be between 1 and 100.' });
    }
    if (discountType === 'amount' && (!discountAmount || discountAmount <= 0)) {
      throw createValidationError({ discount_amount: 'Discount amount must be greater than 0.' });
    }

    let startsAt = null;
    let endsAt = null;
    try {
      startsAt = parseDateOrNull(form.starts_at, 'Start date');
      endsAt = parseDateOrNull(form.ends_at, 'End date');
    } catch (error) {
      const fieldName = toText(error.message).toLowerCase().startsWith('end') ? 'ends_at' : 'starts_at';
      throw createValidationError({ [fieldName]: error.message });
    }
    if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      throw createValidationError({ ends_at: 'End date cannot be before start date.' });
    }

    return {
      code,
      name: toText(form.name),
      description: toText(form.description) || null,
      discount_type: discountType,
      discount_percent: discountType === 'percent' ? discountPercent : 0,
      discount_amount: discountType === 'amount' ? discountAmount : 0,
      channel_scope: channelScope,
      discount_mode: form.discount_mode,
      target_scope: 'order',
      is_active: form.is_active !== false,
      starts_at: startsAt,
      ends_at: endsAt,
      usage_limit_total: parseIntegerOrNull(form.usage_limit_total),
      usage_limit_per_user: parseIntegerOrNull(form.usage_limit_per_user),
      minimum_subtotal: minimumSubtotal,
      occasion_targets: form.targetKind === 'occasions' ? toArray(form.occasion_targets) : [],
      product_ids: form.targetKind === 'products' ? toArray(form.product_ids) : [],
      category_ids: form.targetKind === 'categories' ? toArray(form.category_ids) : [],
      custom_order_arrangement_targets: form.targetKind === 'arrangements' ? toArray(form.custom_order_arrangement_targets) : [],
      customized_item_targets: form.targetKind === 'customized_items' ? toArray(form.customized_item_targets) : null,
      applies_to_sale_items: form.applies_to_sale_items !== false,
    };
  };

  const savePromoPayload = async (payload) => {
    const request = form.id
      ? supabase.from('discount_promos').update(payload).eq('id', form.id)
      : supabase.from('discount_promos').insert([payload]);
    return request;
  };

  const savePromo = async () => {
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    let payload = null;
    try {
      payload = buildPayload();
      const { error } = await savePromoPayload(payload);
      if (error) {
        if (canRetryWithLegacyPercentPayload(error, payload)) {
          const { error: retryError } = await savePromoPayload(toLegacyPercentPromoPayload(payload));
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      resetForm();
      await loadPromos();
    } catch (error) {
      console.error('Error saving discount promo:', error);
      const message = error?.isValidationError
        ? error.message
        : getPromoSaveErrorMessage(error, payload || {});
      setFormError(message);
      setFieldErrors(error?.fieldErrors || {});
      Alert.alert('Promo not saved', message);
    } finally {
      setSaving(false);
    }
  };

  const togglePromoActive = async (promo) => {
    try {
      const { error } = await supabase
        .from('discount_promos')
        .update({ is_active: promo.is_active === false })
        .eq('id', promo.id);
      if (error) throw error;
      await loadPromos();
    } catch (error) {
      console.error('Error toggling promo:', error);
      Alert.alert('Error', error.message || 'Unable to update this promo.');
    }
  };

  const deletePromo = (promo) => {
    setPromoToDelete(promo);
  };

  const confirmDeletePromo = async () => {
    if (!promoToDelete) return;
    setDeletingPromo(true);
    try {
      const { error } = await supabase.from('discount_promos').delete().eq('id', promoToDelete.id);
      if (error) throw error;
      if (form.id === promoToDelete.id) resetForm();
      setPromoToDelete(null);
      await loadPromos();
    } catch (error) {
      console.error('Error deleting promo:', error);
      Alert.alert('Error', error.message || 'Unable to delete this promo.');
    } finally {
      setDeletingPromo(false);
    }
  };

  return (
    <View style={localStyles.card}>
      <View style={localStyles.headerRow}>
        <View style={localStyles.headerText}>
          <Text style={localStyles.title}>{title || `${CHANNEL_LABELS[channelScope] || 'Promo'} Promos`}</Text>
          <Text style={localStyles.subtitle}>Percent or fixed-amount coupons, event promos, usage limits, and targeting.</Text>
        </View>
        <TouchableOpacity style={localStyles.iconButton} onPress={loadPromos} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#ec4899" /> : <Ionicons name="refresh" size={18} color="#ec4899" />}
        </TouchableOpacity>
      </View>

      <View style={localStyles.formGrid}>
        {formError ? (
          <View style={localStyles.formErrorBox}>
            <Ionicons name="alert-circle" size={16} color="#be123c" />
            <Text style={localStyles.formErrorText}>{formError}</Text>
          </View>
        ) : null}

        <View style={localStyles.inputGroup}>
          <Text style={localStyles.label}>Code</Text>
          <View style={localStyles.codeRow}>
            <TextInput
              style={[localStyles.input, localStyles.codeInput, fieldErrors.code && localStyles.inputError]}
              value={form.code}
              onChangeText={(text) => updateForm({ code: normalizePromoCode(text) })}
              placeholder="PROMO2026"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={localStyles.generateButton}
              onPress={() => updateForm({ code: generatePromoCode(form.name || CHANNEL_LABELS[channelScope] || 'PROMO') })}
            >
              <Ionicons name="sparkles" size={16} color="#be185d" />
            </TouchableOpacity>
          </View>
          {fieldErrors.code ? <Text style={localStyles.fieldErrorText}>{fieldErrors.code}</Text> : null}
        </View>

        <View style={localStyles.inputGroup}>
          <Text style={localStyles.label}>Name</Text>
          <TextInput
            style={[localStyles.input, fieldErrors.name && localStyles.inputError]}
            value={form.name}
            onChangeText={(text) => updateForm({ name: text })}
            placeholder="Mother's Day 10%"
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          />
          {fieldErrors.name ? <Text style={localStyles.fieldErrorText}>{fieldErrors.name}</Text> : null}
        </View>

        <Text style={localStyles.label}>Discount type</Text>
        <View style={localStyles.chipRow}>
          {DISCOUNT_TYPE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[localStyles.chip, normalizeDiscountType(form.discount_type) === option.value && localStyles.chipActive]}
              onPress={() => updateForm({ discount_type: option.value })}
            >
              <Text style={[localStyles.chipText, normalizeDiscountType(form.discount_type) === option.value && localStyles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={localStyles.row}>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            {normalizeDiscountType(form.discount_type) === 'amount' ? (
              <>
                <Text style={localStyles.label}>Amount (PHP)</Text>
                <TextInput
                  style={[localStyles.input, fieldErrors.discount_amount && localStyles.inputError]}
                  value={form.discount_amount}
                  onChangeText={(text) => updateForm({ discount_amount: text.replace(/[^0-9.]/g, '') })}
                  keyboardType="numeric"
                  placeholder="100"
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                />
                {fieldErrors.discount_amount ? <Text style={localStyles.fieldErrorText}>{fieldErrors.discount_amount}</Text> : null}
              </>
            ) : (
              <>
                <Text style={localStyles.label}>Percent</Text>
                <TextInput
                  style={[localStyles.input, fieldErrors.discount_percent && localStyles.inputError]}
                  value={form.discount_percent}
                  onChangeText={(text) => updateForm({ discount_percent: text.replace(/[^0-9.]/g, '') })}
                  keyboardType="numeric"
                  placeholder="10"
                  placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                />
                {fieldErrors.discount_percent ? <Text style={localStyles.fieldErrorText}>{fieldErrors.discount_percent}</Text> : null}
              </>
            )}
          </View>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Minimum subtotal</Text>
            <TextInput
              style={localStyles.input}
              value={form.minimum_subtotal}
              onChangeText={(text) => updateForm({ minimum_subtotal: text.replace(/[^0-9.]/g, '') })}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            />
          </View>
        </View>

        <Text style={localStyles.label}>Mode</Text>
        <View style={localStyles.chipRow}>
          {MODE_OPTIONS.filter((option) => channelScope === 'custom_order' || option.value !== 'occasion_based').map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[localStyles.chip, form.discount_mode === option.value && localStyles.chipActive]}
              onPress={() => updateForm({ discount_mode: option.value })}
            >
              <Text style={[localStyles.chipText, form.discount_mode === option.value && localStyles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={localStyles.label}>Targets</Text>
        <View style={localStyles.chipRow}>
          {Object.entries(targetChoices).map(([key, config]) => (
            <TouchableOpacity
              key={key}
              style={[localStyles.chip, form.targetKind === key && localStyles.chipActive]}
              onPress={() => setTargetKind(key)}
            >
              <Text style={[localStyles.chipText, form.targetKind === key && localStyles.chipTextActive]}>
                {config.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedOptions.length > 0 ? (
          <View style={localStyles.optionBox}>
            {selectedOptions.slice(0, 40).map((option) => {
              const value = getOptionValue(option);
              const selected = selectedValues.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[localStyles.targetChip, selected && localStyles.targetChipSelected]}
                  onPress={() => toggleSelectedTarget(value)}
                >
                  <Text style={[localStyles.targetChipText, selected && localStyles.targetChipTextSelected]}>
                    {getOptionLabel(option)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={localStyles.row}>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Starts</Text>
            <TextInput
              style={[localStyles.input, fieldErrors.starts_at && localStyles.inputError]}
              value={form.starts_at}
              onChangeText={(text) => updateForm({ starts_at: sanitizeDateInput(text) })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
              keyboardType="numbers-and-punctuation"
            />
            {fieldErrors.starts_at ? <Text style={localStyles.fieldErrorText}>{fieldErrors.starts_at}</Text> : null}
          </View>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Ends</Text>
            <TextInput
              style={[localStyles.input, fieldErrors.ends_at && localStyles.inputError]}
              value={form.ends_at}
              onChangeText={(text) => updateForm({ ends_at: sanitizeDateInput(text) })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
              keyboardType="numbers-and-punctuation"
            />
            {fieldErrors.ends_at ? <Text style={localStyles.fieldErrorText}>{fieldErrors.ends_at}</Text> : null}
          </View>
        </View>

        <View style={localStyles.row}>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Total limit</Text>
            <TextInput
              style={localStyles.input}
              value={form.usage_limit_total}
              onChangeText={(text) => updateForm({ usage_limit_total: text.replace(/[^0-9]/g, '') })}
              keyboardType="numeric"
              placeholder="Unlimited"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            />
          </View>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Per user</Text>
            <TextInput
              style={localStyles.input}
              value={form.usage_limit_per_user}
              onChangeText={(text) => updateForm({ usage_limit_per_user: text.replace(/[^0-9]/g, '') })}
              keyboardType="numeric"
              placeholder="Unlimited"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            />
          </View>
        </View>

        <Text style={localStyles.label}>Admin note</Text>
        <TextInput
          style={[localStyles.input, localStyles.multiline]}
          value={form.description}
          onChangeText={(text) => updateForm({ description: text })}
          placeholder="Optional internal note"
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          multiline
        />

        <View style={localStyles.switchRow}>
          <Text style={localStyles.switchLabel}>Active</Text>
          <Switch value={form.is_active !== false} onValueChange={(value) => updateForm({ is_active: value })} />
        </View>

        {channelScope === 'catalog' ? (
          <View style={localStyles.switchRow}>
            <Text style={localStyles.switchLabel}>Can beat sale items</Text>
            <Switch
              value={form.applies_to_sale_items !== false}
              onValueChange={(value) => updateForm({ applies_to_sale_items: value })}
            />
          </View>
        ) : null}

        {formError ? (
          <View style={[localStyles.formErrorBox, localStyles.actionErrorBox]}>
            <Ionicons name="alert-circle" size={16} color="#be123c" />
            <Text style={localStyles.formErrorText}>{formError}</Text>
          </View>
        ) : null}

        <View style={localStyles.actionsRow}>
          <TouchableOpacity style={[localStyles.actionButton, localStyles.secondaryButton]} onPress={resetForm} disabled={saving}>
            <Text style={localStyles.secondaryButtonText}>{editing ? 'Cancel edit' : 'Clear'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[localStyles.actionButton, localStyles.primaryButton]} onPress={savePromo} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={localStyles.primaryButtonText}>{editing ? 'Update Promo' : 'Save Promo'}</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={localStyles.list}>
        {promos.length ? promos.map((promo) => (
          <View key={promo.id} style={localStyles.promoRow}>
            <View style={localStyles.promoInfo}>
              <Text style={localStyles.promoCode}>{promo.code}</Text>
              <Text style={localStyles.promoName}>{promo.name} - {getPromoDiscountLabel(promo)} - {promo.discount_mode.replace(/_/g, ' ')}</Text>
              <Text style={localStyles.promoMeta}>
                Used {promo.total_redemptions || 0}{promo.usage_limit_total ? `/${promo.usage_limit_total}` : ''} times
              </Text>
            </View>
            <View style={localStyles.promoActions}>
              <TouchableOpacity style={localStyles.smallIconButton} onPress={() => beginEdit(promo)}>
                <Ionicons name="create-outline" size={17} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.smallIconButton} onPress={() => togglePromoActive(promo)}>
                <Ionicons name={promo.is_active === false ? 'play-circle-outline' : 'pause-circle-outline'} size={17} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.smallIconButton} onPress={() => deletePromo(promo)}>
                <Ionicons name="trash-outline" size={17} color="#be123c" />
              </TouchableOpacity>
            </View>
          </View>
        )) : (
          <Text style={localStyles.emptyText}>{loading ? 'Loading promos...' : 'No promos yet.'}</Text>
        )}
      </View>

      <ConfirmDeleteModal
        visible={Boolean(promoToDelete)}
        onClose={() => {
          if (!deletingPromo) setPromoToDelete(null);
        }}
        onConfirm={confirmDeletePromo}
        title="Delete promo?"
        message={`Delete ${promoToDelete?.code || 'this promo'}? Existing order snapshots will stay intact.`}
        confirmText={deletingPromo ? 'Deleting...' : 'Delete'}
        confirmDisabled={deletingPromo}
      />
    </View>
  );
};

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderColor: '#f9a8d4',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: '#fbcfe8',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  formGrid: {
    marginTop: 2,
  },
  formErrorBox: {
    alignItems: 'flex-start',
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 10,
  },
  formErrorText: {
    color: '#9f1239',
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginLeft: 7,
  },
  actionErrorBox: {
    marginBottom: 10,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 10,
  },
  label: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inputError: {
    backgroundColor: '#fff7f7',
    borderColor: '#fb7185',
  },
  fieldErrorText: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  codeRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  codeInput: {
    flex: 1,
    marginRight: 8,
  },
  generateButton: {
    alignItems: 'center',
    backgroundColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  half: {
    flex: 1,
    marginHorizontal: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: '#fdf2f8',
    borderColor: '#ec4899',
  },
  chipText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#be185d',
  },
  optionBox: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    padding: 8,
  },
  targetChip: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    margin: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  targetChipSelected: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  targetChipText: {
    color: '#4b5563',
    fontSize: 12,
  },
  targetChipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  switchLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: '#ec4899',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '700',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  list: {
    borderTopColor: '#f3f4f6',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 10,
  },
  promoRow: {
    alignItems: 'center',
    borderBottomColor: '#f3f4f6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 9,
  },
  promoInfo: {
    flex: 1,
    paddingRight: 8,
  },
  promoCode: {
    color: '#be185d',
    fontSize: 14,
    fontWeight: '800',
  },
  promoName: {
    color: '#374151',
    fontSize: 12,
    marginTop: 2,
  },
  promoMeta: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },
  promoActions: {
    flexDirection: 'row',
  },
  smallIconButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 30,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    paddingVertical: 8,
    textAlign: 'center',
  },
});

export default PromoManager;
