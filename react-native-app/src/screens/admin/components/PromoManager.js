import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../config/supabase';
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
  discount_percent: '',
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
  customerTargetKind: 'all',
  eligible_user_ids: [],
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

const parseDateOrNull = (value) => {
  const normalized = toText(value);
  if (!normalized) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Dates must use YYYY-MM-DD format.');
  }

  const parsed = new Date(normalized);
  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));

  if (
    !Number.isFinite(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
  ) {
    throw new Error('Enter a valid calendar date.');
  }

  return parsed.toISOString();
};

const getOptionValue = (option) => toText(option?.value ?? option?.id ?? option?.name ?? option?.label);
const getOptionLabel = (option) => toText(option?.label ?? option?.name ?? option?.category_name ?? option?.value ?? option?.id);
const getCustomerLabel = (customer = {}) => {
  const name = toText(customer.name);
  const email = toText(customer.email);
  if (name && email) return `${name} (${email})`;
  return name || email || `Customer ${toText(customer.id).slice(0, 8)}`;
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
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [form, setForm] = useState(() => blankForm(channelScope));

  const targetChoices = useMemo(() => buildTargetChoices({
    channelScope,
    productOptions,
    categoryOptions,
    customizedTargetOptions,
    occasionOptions,
    arrangementOptions,
  }), [arrangementOptions, categoryOptions, channelScope, customizedTargetOptions, occasionOptions, productOptions]);

  const selectedOptions = targetChoices[form.targetKind]?.options || [];
  const selectedCustomerIds = toArray(form.eligible_user_ids);
  const filteredCustomers = useMemo(() => {
    const query = customerSearchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => (
      getCustomerLabel(customer).toLowerCase().includes(query)
      || toText(customer.phone).toLowerCase().includes(query)
    ));
  }, [customerSearchQuery, customers]);
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

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone')
        .eq('role', 'customer')
        .order('name', { ascending: true });
      if (error) throw error;
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading promo customer targets:', error);
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const resetForm = () => {
    setEditing(false);
    setCustomerSearchQuery('');
    setForm(blankForm(channelScope));
  };

  const beginEdit = (promo) => {
    const normalized = normalizePromo(promo);
    setEditing(true);
    setCustomerSearchQuery('');
    setForm({
      ...blankForm(channelScope),
      ...normalized,
      discount_percent: toText(normalized.discount_percent),
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
      customerTargetKind: toArray(normalized.eligible_user_ids).length ? 'selected' : 'all',
      eligible_user_ids: toArray(normalized.eligible_user_ids),
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

  const setCustomerTargetKind = (customerTargetKind) => {
    updateForm({
      customerTargetKind,
      eligible_user_ids: customerTargetKind === 'selected' ? selectedCustomerIds : [],
    });
  };

  const toggleEligibleCustomer = (customerId) => {
    const value = toText(customerId);
    if (!value) return;
    setForm((current) => {
      const currentValues = toArray(current.eligible_user_ids);
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...current, eligible_user_ids: nextValues };
    });
  };

  const buildPayload = () => {
    const code = normalizePromoCode(form.code || generatePromoCode(form.name || 'PROMO'));
    const discountPercent = parseNumberOrNull(form.discount_percent);
    const minimumSubtotal = parseNumberOrNull(form.minimum_subtotal) || 0;
    const startsAt = parseDateOrNull(form.starts_at);
    const endsAt = parseDateOrNull(form.ends_at);

    if (!code) throw new Error('Promo code is required.');
    if (!toText(form.name)) throw new Error('Promo name is required.');
    if (!discountPercent || discountPercent <= 0 || discountPercent > 100) {
      throw new Error('Discount percent must be between 1 and 100.');
    }
    if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      throw new Error('End date cannot be before start date.');
    }
    if (form.customerTargetKind === 'selected' && !toArray(form.eligible_user_ids).length) {
      throw new Error('Select at least one eligible customer or switch back to All customers.');
    }

    return {
      code,
      name: toText(form.name),
      description: toText(form.description) || null,
      discount_percent: discountPercent,
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
      eligible_user_ids: form.customerTargetKind === 'selected' ? toArray(form.eligible_user_ids) : [],
      applies_to_sale_items: form.applies_to_sale_items !== false,
    };
  };

  const savePromo = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const request = form.id
        ? supabase.from('discount_promos').update(payload).eq('id', form.id)
        : supabase.from('discount_promos').insert([payload]);
      const { error } = await request;
      if (error) throw error;
      resetForm();
      await loadPromos();
    } catch (error) {
      console.error('Error saving discount promo:', error);
      Alert.alert('Promo not saved', error.message || 'Unable to save this promo.');
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
    const runDelete = async () => {
      try {
        const { error } = await supabase.from('discount_promos').delete().eq('id', promo.id);
        if (error) throw error;
        if (form.id === promo.id) resetForm();
        await loadPromos();
      } catch (error) {
        console.error('Error deleting promo:', error);
        Alert.alert('Error', error.message || 'Unable to delete this promo.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`Delete ${promo.code}? Existing order snapshots will stay intact.`);
      if (confirmed) {
        runDelete();
      }
      return;
    }

    Alert.alert('Delete promo?', `Delete ${promo.code}? Existing order snapshots will stay intact.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: runDelete,
      },
    ]);
  };

  return (
    <View style={localStyles.card}>
      <View style={localStyles.headerRow}>
        <View style={localStyles.headerText}>
          <Text style={localStyles.title}>{title || `${CHANNEL_LABELS[channelScope] || 'Promo'} Promos`}</Text>
          <Text style={localStyles.subtitle}>Percent coupons, event promos, usage limits, and targeting.</Text>
        </View>
        <TouchableOpacity style={localStyles.iconButton} onPress={loadPromos} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#ec4899" /> : <Ionicons name="refresh" size={18} color="#ec4899" />}
        </TouchableOpacity>
      </View>

      <View style={localStyles.formGrid}>
        <View style={localStyles.inputGroup}>
          <Text style={localStyles.label}>Code</Text>
          <View style={localStyles.codeRow}>
            <TextInput
              style={[localStyles.input, localStyles.codeInput]}
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
        </View>

        <View style={localStyles.inputGroup}>
          <Text style={localStyles.label}>Name</Text>
          <TextInput
            style={localStyles.input}
            value={form.name}
            onChangeText={(text) => updateForm({ name: text })}
            placeholder="Mother's Day 10%"
            placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          />
        </View>

        <View style={localStyles.row}>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Percent</Text>
            <TextInput
              style={localStyles.input}
              value={form.discount_percent}
              onChangeText={(text) => updateForm({ discount_percent: text.replace(/[^0-9.]/g, '') })}
              keyboardType="numeric"
              placeholder="10"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            />
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

        <Text style={localStyles.label}>Eligible customers</Text>
        <View style={localStyles.chipRow}>
          <TouchableOpacity
            style={[localStyles.chip, form.customerTargetKind !== 'selected' && localStyles.chipActive]}
            onPress={() => setCustomerTargetKind('all')}
          >
            <Text style={[localStyles.chipText, form.customerTargetKind !== 'selected' && localStyles.chipTextActive]}>
              All customers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[localStyles.chip, form.customerTargetKind === 'selected' && localStyles.chipActive]}
            onPress={() => setCustomerTargetKind('selected')}
          >
            <Text style={[localStyles.chipText, form.customerTargetKind === 'selected' && localStyles.chipTextActive]}>
              Selected customers
            </Text>
          </TouchableOpacity>
        </View>

        {form.customerTargetKind === 'selected' ? (
          <View style={localStyles.customerTargetBox}>
            <TextInput
              style={[localStyles.input, localStyles.customerSearchInput]}
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
              placeholder="Search customers by name, email, or phone"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
            />
            <Text style={localStyles.customerTargetSummary}>
              {selectedCustomerIds.length ? `${selectedCustomerIds.length} selected` : 'Select at least one customer'}
            </Text>
            {customersLoading ? (
              <Text style={localStyles.emptyText}>Loading customers...</Text>
            ) : (
              <View style={localStyles.customerChipWrap}>
                {filteredCustomers.slice(0, 50).map((customer) => {
                  const value = toText(customer.id);
                  const selected = selectedCustomerIds.includes(value);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[localStyles.targetChip, selected && localStyles.targetChipSelected]}
                      onPress={() => toggleEligibleCustomer(value)}
                    >
                      <Text style={[localStyles.targetChipText, selected && localStyles.targetChipTextSelected]}>
                        {getCustomerLabel(customer)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {!filteredCustomers.length ? (
                  <Text style={localStyles.emptyText}>No customers found.</Text>
                ) : null}
              </View>
            )}
          </View>
        ) : null}

        <View style={localStyles.row}>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Starts</Text>
            <TextInput
              style={localStyles.input}
              value={form.starts_at}
              onChangeText={(text) => updateForm({ starts_at: sanitizeDateInput(text) })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={[localStyles.inputGroup, localStyles.half]}>
            <Text style={localStyles.label}>Ends</Text>
            <TextInput
              style={localStyles.input}
              value={form.ends_at}
              onChangeText={(text) => updateForm({ ends_at: sanitizeDateInput(text) })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
              keyboardType="numbers-and-punctuation"
            />
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

        <Text style={localStyles.label}>Description</Text>
        <TextInput
          style={[localStyles.input, localStyles.multiline]}
          value={form.description}
          onChangeText={(text) => updateForm({ description: text })}
          placeholder="Optional admin note or customer-facing label"
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
              <Text style={localStyles.promoName}>{promo.name} - {promo.discount_percent}% - {promo.discount_mode.replace(/_/g, ' ')}</Text>
              <Text style={localStyles.promoMeta}>
                Used {promo.total_redemptions || 0}{promo.usage_limit_total ? `/${promo.usage_limit_total}` : ''} times
              </Text>
              <Text style={localStyles.promoMeta}>
                {toArray(promo.eligible_user_ids).length ? `${toArray(promo.eligible_user_ids).length} selected customers` : 'All customers'}
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
  customerTargetBox: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 8,
  },
  customerSearchInput: {
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  customerTargetSummary: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 6,
  },
  customerChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
