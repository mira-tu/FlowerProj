import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import nodemailer from "npm:nodemailer@6.9.7";

globalThis.Buffer = Buffer;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const ALLOWED_ROLES = new Set(["admin", "employee"]);
const CUSTOMER_REQUEST_ACTIONS = new Set(["reserve_request_stock"]);
const CUSTOMER_REFUND_ACTIONS = new Set(["create_refund_request", "submit_refund_gcash_details"]);
const MULTI_DELIVERY_NOTES_PREFIX = "[multi_delivery_v1]";
const ACTIVE_REFUND_STATUSES = ["requested", "approved", "gcash_submitted", "processing"];
const DELIVERY_CONFIRMATION_OWNER = {
  CUSTOMER: "customer",
  RIDER: "rider",
} as const;
const DELIVERY_CONFIRMATION_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
} as const;
const DELIVERY_STOP_STATUS = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
} as const;

const transporter = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    })
  : null;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value ?? {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const roundCurrency = (value: unknown) => {
  const numericValue = typeof value === "number"
    ? value
    : Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Math.round(((Number.isFinite(numericValue) ? numericValue : 0) + Number.EPSILON) * 100) / 100;
};

const normalizePromoCode = (value: unknown) =>
  String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();

const collectTextValues = (...values: unknown[]) => {
  const flattened: unknown[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    flattened.push(value);
  };
  values.forEach(visit);
  return flattened
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
};

const normalizeTargetList = (value: unknown) => {
  const parsed = parseMaybeJson(value);
  if (value === null || value === undefined) return null;
  if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof parsed === "string") return parsed.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed && typeof parsed === "object") {
    return Object.values(parsed as Record<string, unknown>).map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  return [] as string[];
};

const normalizeComparable = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "-");

const targetListIsUnset = (targets: string[] | null) => targets === null || !Array.isArray(targets) || targets.length === 0;

const targetListHas = (targets: string[] | null, values: unknown[] = []) => {
  if (targets === null) return true;
  if (!Array.isArray(targets) || targets.length === 0) return false;
  const normalizedTargets = new Set(targets.map(normalizeComparable).filter(Boolean));
  return values.some((value) => normalizedTargets.has(normalizeComparable(value)));
};

const normalizePromoRow = (promo: Record<string, unknown>) => ({
  ...promo,
  id: String(promo.id ?? ""),
  code: normalizePromoCode(promo.code),
  name: String(promo.name ?? promo.code ?? "Discount").trim(),
  discount_percent: Math.max(0, Math.min(100, roundCurrency(promo.discount_percent))),
  channel_scope: String(promo.channel_scope ?? "all").trim(),
  discount_mode: String(promo.discount_mode ?? "coupon_code").trim(),
  target_scope: String(promo.target_scope ?? "order").trim(),
  is_active: promo.is_active !== false,
  starts_at: promo.starts_at,
  ends_at: promo.ends_at,
  usage_limit_total: promo.usage_limit_total === null || promo.usage_limit_total === undefined
    ? null
    : Math.max(0, Number.parseInt(String(promo.usage_limit_total), 10) || 0),
  usage_limit_per_user: promo.usage_limit_per_user === null || promo.usage_limit_per_user === undefined
    ? null
    : Math.max(0, Number.parseInt(String(promo.usage_limit_per_user), 10) || 0),
  minimum_subtotal: Math.max(0, roundCurrency(promo.minimum_subtotal)),
  occasion_targets: normalizeTargetList(promo.occasion_targets) || [],
  custom_order_arrangement_targets: normalizeTargetList(promo.custom_order_arrangement_targets) || [],
  total_redemptions: 0,
  user_redemptions: 0,
});

const getPromoAvailable = (promo: ReturnType<typeof normalizePromoRow>, subtotalBeforeDiscount: number) => {
  if (!promo.is_active) return false;
  const nowTime = Date.now();
  const startsAtTime = promo.starts_at ? new Date(String(promo.starts_at)).getTime() : null;
  const endsAtTime = promo.ends_at ? new Date(String(promo.ends_at)).getTime() : null;
  if (startsAtTime && Number.isFinite(startsAtTime) && nowTime < startsAtTime) return false;
  if (endsAtTime && Number.isFinite(endsAtTime) && nowTime > endsAtTime) return false;
  if (promo.usage_limit_total && promo.total_redemptions >= promo.usage_limit_total) return false;
  if (promo.usage_limit_per_user && promo.user_redemptions >= promo.usage_limit_per_user) return false;
  if (promo.minimum_subtotal > 0 && subtotalBeforeDiscount < promo.minimum_subtotal) return false;
  return true;
};

const getPromoModeEligible = (
  promo: ReturnType<typeof normalizePromoRow>,
  { enteredCode = "", occasions = [] as string[] } = {},
) => {
  if (promo.discount_mode === "coupon_code") return Boolean(enteredCode && promo.code === normalizePromoCode(enteredCode));
  if (promo.discount_mode === "automatic_event") return true;
  if (promo.discount_mode === "occasion_based") {
    if (targetListIsUnset(promo.occasion_targets as string[])) return true;
    return targetListHas(promo.occasion_targets as string[], occasions);
  }
  return false;
};

const normalizeQuoteLine = (line: Record<string, unknown>, index: number) => {
  const quantity = Math.max(1, Number.parseInt(String(line.quantity ?? line.qty ?? 1), 10) || 1);
  const unitPrice = Math.max(0, roundCurrency(line.unitPrice ?? line.price ?? line.amount));
  const originalUnitPrice = Math.max(unitPrice, roundCurrency(line.originalUnitPrice ?? line.original_price ?? unitPrice));
  return {
    key: String(line.key ?? line.id ?? `line-${index}`),
    name: String(line.name ?? line.label ?? `Item ${index + 1}`).trim(),
    quantity,
    originalSubtotal: roundCurrency(originalUnitPrice * quantity),
    targetKeys: collectTextValues(line.key, line.id, line.name, line.label, line.targetKeys),
    occasionTargets: collectTextValues(line.occasionTargets),
    arrangementTargets: collectTextValues(line.arrangementTargets),
  };
};

const normalizeQuoteBreakdownLines = (breakdown: Record<string, unknown> = {}) => {
  const rawLineItems = Array.isArray(breakdown?.line_items) ? breakdown.line_items as Record<string, unknown>[] : [];
  return rawLineItems.map((item, index) => {
    const quantity = Math.max(1, Number.parseInt(String(item.quantity ?? item.qty ?? 1), 10) || 1);
    const explicitAmount = item.amount ?? item.total ?? item.line_total ?? item.lineTotal;
    const unitAmount = item.unit_price ?? item.unitPrice ?? item.price;
    const amount = explicitAmount !== undefined && explicitAmount !== null
      ? roundCurrency(explicitAmount)
      : roundCurrency(roundCurrency(unitAmount) * quantity);
    const label = String(item.label ?? item.product_name ?? item.name ?? `Item ${index + 1}`).trim();
    const type = String(item.type ?? "").trim().toLowerCase();
    const normalizedType = type || (label.toLowerCase().includes("delivery") ? "delivery" : "extra");
    return {
      key: `${label}-${index}`,
      label,
      type: normalizedType,
      arrangementGroup: String(item.arrangement_group ?? item.arrangementGroup ?? "").trim(),
      amount,
    };
  });
};

const collectQuotePromoContext = (requestData: Record<string, unknown>, quoteBreakdown: Record<string, unknown> | null) => {
  const items = Array.isArray(requestData?.items) ? requestData.items as Record<string, unknown>[] : [];
  const quoteLines = normalizeQuoteBreakdownLines(quoteBreakdown || {});
  const occasions = collectTextValues(
    requestData?.occasion,
    requestData?.combined_occasions,
    items.map((item) => item?.occasion),
  );
  const arrangementTargets = collectTextValues(
    requestData?.arrangementSummary,
    requestData?.arrangementType,
    requestData?.arrangementTypes,
    requestData?.arrangementSelections,
    items.map((item) => [
      item?.arrangementSummary,
      item?.arrangementType,
      item?.arrangementTypes,
      item?.arrangementSelections,
    ]),
    quoteLines.map((line) => [line.label, line.type, line.arrangementGroup]),
  );
  return {
    occasions: Array.from(new Set(occasions)),
    arrangementTargets: Array.from(new Set(arrangementTargets)),
    quoteLines,
  };
};

const calculateCustomOrderPromoPricing = async ({
  adminClient,
  userId,
  requestData,
  quoteBreakdown,
  finalItemPrice,
  finalShippingFee,
}: {
  adminClient: ReturnType<typeof createClient>;
  userId: string;
  requestData: Record<string, unknown>;
  quoteBreakdown: Record<string, unknown> | null;
  finalItemPrice: number;
  finalShippingFee: number;
}) => {
  const promoCode = normalizePromoCode(
    requestData?.applied_promo_code
      ?? (requestData?.discount_snapshot as Record<string, unknown> | undefined)?.promo_code
      ?? "",
  );
  const { occasions, arrangementTargets, quoteLines } = collectQuotePromoContext(requestData, quoteBreakdown);
  const nonDeliveryLines = quoteLines.filter((line) => line.type !== "delivery");
  const lines = (nonDeliveryLines.length ? nonDeliveryLines : [{
    key: "quote-total",
    label: String(requestData?.summary_label ?? requestData?.occasion ?? "Custom Order Quote"),
    type: "arrangement",
    arrangementGroup: "",
    amount: finalItemPrice,
  }]).map((line, index) => normalizeQuoteLine({
    key: `quote-${line.key || index}`,
    name: line.label,
    amount: line.amount,
    targetKeys: collectTextValues(line.label, line.type, line.arrangementGroup, arrangementTargets),
    occasionTargets: occasions,
    arrangementTargets: collectTextValues(line.label, line.type, line.arrangementGroup, arrangementTargets),
  }, index));
  const subtotalBeforeDiscount = roundCurrency(lines.reduce((sum, line) => sum + line.originalSubtotal, 0));

  let promos: ReturnType<typeof normalizePromoRow>[] = [];
  try {
    const { data: promoRows, error: promoError } = await adminClient
      .from("discount_promos")
      .select("*")
      .in("channel_scope", ["custom_order", "all"]);
    if (promoError) throw promoError;
    promos = (promoRows || []).map((promo: Record<string, unknown>) => normalizePromoRow(promo));

    const promoIds = promos.map((promo) => promo.id).filter(Boolean);
    if (promoIds.length) {
      const { data: redemptionRows } = await adminClient
        .from("discount_redemptions")
        .select("promo_id, user_id, status")
        .in("promo_id", promoIds)
        .neq("status", "voided");
      const usage = new Map<string, { total: number; user: number }>();
      (redemptionRows || []).forEach((row: Record<string, unknown>) => {
        const promoId = String(row.promo_id ?? "");
        const current = usage.get(promoId) || { total: 0, user: 0 };
        current.total += 1;
        if (String(row.user_id ?? "") === String(userId)) current.user += 1;
        usage.set(promoId, current);
      });
      promos = promos.map((promo) => ({
        ...promo,
        total_redemptions: usage.get(promo.id)?.total || 0,
        user_redemptions: usage.get(promo.id)?.user || 0,
      }));
    }
  } catch (error) {
    console.warn("Unable to load discount promos for quote recompute:", error);
  }

  const candidates = promos.reduce((accumulator, promo) => {
    if (!(promo.channel_scope === "custom_order" || promo.channel_scope === "all")) return accumulator;
    if (!getPromoAvailable(promo, subtotalBeforeDiscount)) return accumulator;
    if (!getPromoModeEligible(promo, { enteredCode: promoCode, occasions })) return accumulator;

    const matchedLines = lines.filter((line) => {
      const hasArrangementTargets = !targetListIsUnset(promo.custom_order_arrangement_targets as string[]);
      const hasOccasionTargets = !targetListIsUnset(promo.occasion_targets as string[]);
      if (!hasArrangementTargets && !hasOccasionTargets) return true;
      return targetListHas(promo.custom_order_arrangement_targets as string[], [
        ...line.targetKeys,
        ...arrangementTargets,
        ...line.arrangementTargets,
      ]) || targetListHas(promo.occasion_targets as string[], [
        ...occasions,
        ...line.occasionTargets,
      ]);
    });
    const lineBreakdown = matchedLines.map((line) => {
      const discountAmount = roundCurrency(line.originalSubtotal * (promo.discount_percent / 100));
      return {
        key: line.key,
        name: line.name,
        quantity: line.quantity,
        original_subtotal: line.originalSubtotal,
        discount_amount: discountAmount,
        final_subtotal: Math.max(0, roundCurrency(line.originalSubtotal - discountAmount)),
        discount_percent: promo.discount_percent,
        source: "promo",
        promo_id: promo.id,
        promo_code: promo.code,
      };
    }).filter((line) => line.discount_amount > 0);
    const discountTotal = roundCurrency(lineBreakdown.reduce((sum, line) => sum + line.discount_amount, 0));
    if (discountTotal > 0) {
      accumulator.push({ promo, discountTotal, lineBreakdown });
    }
    return accumulator;
  }, [] as { promo: ReturnType<typeof normalizePromoRow>; discountTotal: number; lineBreakdown: Record<string, unknown>[] }[]);

  const chosen = candidates.reduce((best, candidate) => {
    if (!best) return candidate;
    return candidate.discountTotal > best.discountTotal ? candidate : best;
  }, null as null | { promo: ReturnType<typeof normalizePromoRow>; discountTotal: number; lineBreakdown: Record<string, unknown>[] });
  const discountTotal = roundCurrency(chosen?.discountTotal || 0);
  const subtotalAfterDiscount = Math.max(0, roundCurrency(subtotalBeforeDiscount - discountTotal));
  const finalTotal = Math.max(0, roundCurrency(subtotalAfterDiscount + finalShippingFee));

  return {
    chosenPromo: chosen?.promo || null,
    appliedPromoCode: chosen?.promo?.code || null,
    discountTotal,
    subtotalBeforeDiscount,
    subtotalAfterDiscount,
    shippingFee: roundCurrency(finalShippingFee),
    finalTotal,
    lineBreakdown: chosen?.lineBreakdown || [],
  };
};

const buildDiscountSnapshot = (pricing: Awaited<ReturnType<typeof calculateCustomOrderPromoPricing>>) => {
  if (!pricing || pricing.discountTotal <= 0) return null;
  return {
    source: "promo",
    promo_id: pricing.chosenPromo?.id || null,
    promo_code: pricing.chosenPromo?.code || null,
    promo_name: pricing.chosenPromo?.name || null,
    discount_percent: pricing.chosenPromo?.discount_percent || null,
    discount_mode: pricing.chosenPromo?.discount_mode || null,
    target_scope: pricing.chosenPromo?.target_scope || null,
    channel_scope: "custom_order",
    discount_total: pricing.discountTotal,
    subtotal_before_discount: pricing.subtotalBeforeDiscount,
    subtotal_after_discount: pricing.subtotalAfterDiscount,
    shipping_fee: pricing.shippingFee,
    final_total: pricing.finalTotal,
    line_breakdown: pricing.lineBreakdown,
    is_estimate: false,
    final_quote_recomputed: true,
    applied_at: new Date().toISOString(),
  };
};

const voidReservedDiscountRedemptions = async (
  adminClient: ReturnType<typeof createClient>,
  requestId: string,
  exceptPromoId: string | null = null,
) => {
  if (!requestId) return;

  let query = adminClient
    .from("discount_redemptions")
    .update({
      status: "voided",
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
    .in("status", ["reserved", "applied"]);

  if (exceptPromoId) {
    query = query.neq("promo_id", exceptPromoId);
  }

  const { error } = await query;
  if (error) {
    console.warn("Unable to void stale discount redemptions:", error);
  }
};

const applyReservedDiscountRedemption = async ({
  adminClient,
  requestId,
  userId,
  pricing,
}: {
  adminClient: ReturnType<typeof createClient>;
  requestId: string;
  userId: string;
  pricing: Awaited<ReturnType<typeof calculateCustomOrderPromoPricing>>;
}) => {
  const promoId = pricing?.chosenPromo?.id;
  if (!requestId || !userId || !promoId || pricing.discountTotal <= 0) return;

  const redemptionPayload = {
    promo_id: promoId,
    user_id: userId,
    request_id: requestId,
    channel_scope: "custom_order",
    discount_amount: pricing.discountTotal,
    subtotal_before_discount: pricing.subtotalBeforeDiscount,
    subtotal_after_discount: pricing.subtotalAfterDiscount,
    status: "applied",
    updated_at: new Date().toISOString(),
  };

  const { data: existingRedemptions, error: fetchError } = await adminClient
    .from("discount_redemptions")
    .select("id")
    .eq("promo_id", promoId)
    .eq("request_id", requestId)
    .in("status", ["reserved", "applied"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (fetchError) {
    console.warn("Unable to inspect discount redemptions:", fetchError);
  }

  const existingId = Array.isArray(existingRedemptions) && existingRedemptions[0]?.id
    ? existingRedemptions[0].id
    : null;

  const { error } = existingId
    ? await adminClient
        .from("discount_redemptions")
        .update(redemptionPayload)
        .eq("id", existingId)
    : await adminClient
        .from("discount_redemptions")
        .insert([redemptionPayload]);

  if (error) {
    console.warn("Unable to apply discount redemption:", error);
  }
};

const parseMultiDeliveryNotes = (notes: unknown) => {
  if (typeof notes !== "string" || !notes.startsWith(MULTI_DELIVERY_NOTES_PREFIX)) {
    return {
      note: typeof notes === "string" ? notes : "",
      destinations: [] as Record<string, unknown>[],
    };
  }

  try {
    const payload = JSON.parse(notes.slice(MULTI_DELIVERY_NOTES_PREFIX.length));
    return {
      note: typeof payload?.note === "string" ? payload.note : "",
      destinations: Array.isArray(payload?.destinations)
        ? payload.destinations as Record<string, unknown>[]
        : [],
    };
  } catch {
    return {
      note: typeof notes === "string" ? notes : "",
      destinations: [] as Record<string, unknown>[],
    };
  }
};

const serializeMultiDeliveryNotes = ({
  destinations = [],
  note = "",
}: {
  destinations?: Record<string, unknown>[];
  note?: string | null;
}) => {
  const cleanDestinations = Array.isArray(destinations) ? destinations.filter(Boolean) : [];
  const cleanNote = String(note ?? "").trim();

  if (!cleanDestinations.length) {
    return cleanNote || null;
  }

  return `${MULTI_DELIVERY_NOTES_PREFIX}${JSON.stringify({
    note: cleanNote,
    destinations: cleanDestinations,
  })}`;
};

const buildStopAssignmentLookup = (stopAssignments: unknown) => {
  const lookup = new Map<string, string | null>();

  if (!Array.isArray(stopAssignments)) {
    return lookup;
  }

  stopAssignments.forEach((assignment) => {
    const riderId = assignment?.riderId ? String(assignment.riderId) : null;
    const unitKeys = Array.isArray(assignment?.unitKeys) ? assignment.unitKeys : [];

    unitKeys.forEach((unitKey) => {
      const normalizedUnitKey = String(unitKey ?? "").trim();
      if (normalizedUnitKey) {
        lookup.set(normalizedUnitKey, riderId);
      }
    });
  });

  return lookup;
};

const applyStopAssignmentsToDestinations = (
  destinations: Record<string, unknown>[],
  stopAssignments: unknown,
) => {
  const assignmentLookup = buildStopAssignmentLookup(stopAssignments);

  return destinations.map((destination) => {
    const unitKey = String(destination?.unit_key ?? "").trim();
    if (!assignmentLookup.has(unitKey)) {
      return destination;
    }

    return {
      ...destination,
      assigned_rider_id: assignmentLookup.get(unitKey) ?? null,
    };
  });
};

const getUniqueAssignedRiderIds = (destinations: Record<string, unknown>[]) =>
  Array.from(
    new Set(
      destinations
        .map((destination) => String(destination?.assigned_rider_id ?? "").trim())
        .filter(Boolean),
    ),
  );

const buildDestinationGroupKey = (destination: Record<string, unknown>) => {
  const snapshot = destination?.address_snapshot && typeof destination.address_snapshot === "object"
    ? destination.address_snapshot as Record<string, unknown>
    : {};
  const addressText = [
    snapshot.street,
    snapshot.barangay,
    snapshot.city,
    snapshot.province,
    snapshot.zip,
  ]
    .filter(Boolean)
    .join("|");

  return [
    destination?.address_id ?? "",
    destination?.recipient_name ?? "",
    destination?.recipient_phone ?? "",
    addressText,
  ].join("|");
};

const withStatusTimestamp = (value: unknown, status: string) => {
  const timestamps = parseMaybeJson(value);
  return {
    ...(timestamps && typeof timestamps === "object" ? timestamps : {}),
    [status]: new Date().toISOString(),
  };
};

const DELIVERY_FAILED_ATTEMPT_STATUS = "delivery_failed_attempt";

const getDeliveryFailureReason = (options: Record<string, unknown>) => (
  typeof options?.deliveryFailureReason === "string"
    ? options.deliveryFailureReason.trim()
    : ""
);

const syncRequestStockAllocationState = async (
  adminClient: ReturnType<typeof createClient>,
  requestId: unknown,
  requestData: unknown,
  mode: "reserve" | "release" = "release",
) => {
  const parsedData = parseMaybeJson(requestData) as Record<string, unknown>;
  const stockAllocations = Array.isArray(parsedData?.stock_allocations)
    ? parsedData.stock_allocations
    : [];
  const allocationStatus = String(parsedData?.stock_allocation_status ?? "").trim().toLowerCase();

  if (!requestId || !stockAllocations.length) {
    return false;
  }

  if (mode === "reserve" && allocationStatus === "reserved") {
    return false;
  }

  if (mode === "release" && allocationStatus === "released") {
    return false;
  }

  const { error } = await adminClient.rpc("apply_request_stock_allocations", {
    p_request_id: requestId,
    p_allocations: stockAllocations,
    p_mode: mode,
  });

  if (error) {
    throw error;
  }

  return true;
};

const insertNotificationSafely = async (
  adminClient: ReturnType<typeof createClient>,
  notification: Record<string, unknown>,
) => {
  const { error } = await adminClient.from("notifications").insert([notification]);

  if (error) {
    console.error("Failed to insert notification:", error);
  }
};

const insertNotificationsSafely = async (
  adminClient: ReturnType<typeof createClient>,
  notifications: Record<string, unknown>[],
) => {
  const payload = notifications.filter(Boolean);
  if (!payload.length) {
    return;
  }

  const { error } = await adminClient.from("notifications").insert(payload);

  if (error) {
    console.error("Failed to insert notifications:", error);
  }
};

const getUsersByRoles = async (
  adminClient: ReturnType<typeof createClient>,
  roles: string[],
) => {
  const { data, error } = await adminClient
    .from("users")
    .select("id, role")
    .in("role", roles);

  if (error) {
    console.error("Failed to load users for refund notifications:", error);
    return [];
  }

  return Array.isArray(data) ? data : [];
};

const parseAmount = (value: unknown, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDeliveryConfirmationOwner = (value: unknown, fallback: string | null = null) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === DELIVERY_CONFIRMATION_OWNER.CUSTOMER
    || normalized === DELIVERY_CONFIRMATION_OWNER.RIDER
  ) {
    return normalized;
  }

  return fallback;
};

const normalizeDeliveryConfirmationStatus = (
  value: unknown,
  fallback: string | null = DELIVERY_CONFIRMATION_STATUS.PENDING,
) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
    return DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
  }

  if (normalized === DELIVERY_CONFIRMATION_STATUS.PENDING) {
    return DELIVERY_CONFIRMATION_STATUS.PENDING;
  }

  return fallback;
};

const normalizeDeliveryStopStatus = (value: unknown, fallback = DELIVERY_STOP_STATUS.ACTIVE) => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === DELIVERY_STOP_STATUS.CANCELLED) {
    return DELIVERY_STOP_STATUS.CANCELLED;
  }

  if (normalized === DELIVERY_STOP_STATUS.ACTIVE) {
    return DELIVERY_STOP_STATUS.ACTIVE;
  }

  return fallback;
};

const buildDeliveryDestinationAddressText = (destination: Record<string, unknown> = {}) => {
  const snapshot = destination?.address_snapshot && typeof destination.address_snapshot === "object"
    ? destination.address_snapshot as Record<string, unknown>
    : {};

  return [
    snapshot.street,
    snapshot.barangay,
    snapshot.city,
    snapshot.province,
    snapshot.zip,
  ]
    .filter(Boolean)
    .join(", ");
};

const normalizeDeliveryDestination = (
  destination: Record<string, unknown> = {},
  index = 0,
) => {
  const unitNumberCandidate = Number.parseInt(
    String(destination?.unit_number ?? destination?.unitNumber ?? ""),
    10,
  );
  const unitNumber = Number.isFinite(unitNumberCandidate) && unitNumberCandidate > 0
    ? unitNumberCandidate
    : 1;
  const confirmationOwner = normalizeDeliveryConfirmationOwner(
    destination?.confirmation_owner ?? destination?.confirmationOwner,
    null,
  );
  const confirmationStatus = normalizeDeliveryConfirmationStatus(
    destination?.confirmation_status ?? destination?.confirmationStatus,
    confirmationOwner ? DELIVERY_CONFIRMATION_STATUS.PENDING : null,
  );
  const quantityCandidate = Number.parseInt(String(destination?.quantity ?? ""), 10);
  const quantity = Number.isFinite(quantityCandidate) && quantityCandidate > 0 ? quantityCandidate : 1;
  const assignedRiderId = String(
    destination?.assigned_rider_id ?? destination?.assignedRiderId ?? "",
  ).trim();
  const stopStatus = normalizeDeliveryStopStatus(
    destination?.stop_status ?? destination?.stopStatus,
    DELIVERY_STOP_STATUS.ACTIVE,
  );

  return {
    ...destination,
    unit_key: String(destination?.unit_key ?? destination?.unitKey ?? `stop-${index + 1}`).trim(),
    item_name: destination?.item_name ?? destination?.itemName ?? "Item",
    quantity,
    unit_number: unitNumber,
    unit_label: String(
      destination?.unit_label
      ?? destination?.unitLabel
      ?? `Unit ${unitNumber}`,
    ).trim(),
    stop_status: stopStatus,
    confirmation_owner: confirmationOwner,
    confirmation_status: confirmationStatus,
    confirmed_at: destination?.confirmed_at ?? destination?.confirmedAt ?? null,
    confirmed_by_actor: destination?.confirmed_by_actor ?? destination?.confirmedByActor ?? null,
    confirmed_by_user_id: destination?.confirmed_by_user_id ?? destination?.confirmedByUserId ?? null,
    proof_image_url: destination?.proof_image_url ?? destination?.proofImageUrl ?? null,
    proof_uploaded_at: destination?.proof_uploaded_at ?? destination?.proofUploadedAt ?? null,
    proof_note: String(destination?.proof_note ?? destination?.proofNote ?? "").trim(),
    assigned_rider_id: assignedRiderId || null,
    addressText: buildDeliveryDestinationAddressText(destination),
  };
};

const isDeliveryStopCancelled = (destination: Record<string, unknown> = {}) => (
  normalizeDeliveryDestination(destination).stop_status === DELIVERY_STOP_STATUS.CANCELLED
);

const getDeliveryStopAssignedRiderId = (
  destination: Record<string, unknown> = {},
  fallbackAssignedRiderId: unknown = null,
) => {
  const normalizedDestination = normalizeDeliveryDestination(destination);
  const assignedRiderId = String(
    normalizedDestination?.assigned_rider_id
    ?? normalizedDestination?.assignedRiderId
    ?? fallbackAssignedRiderId
    ?? "",
  ).trim();

  return assignedRiderId || null;
};

const getSharedAssignedRiderIdForActiveStops = (
  destinations: unknown,
  fallbackAssignedRiderId: unknown = null,
) => {
  const normalizedStops = normalizeDeliveryDestinations(destinations);
  const activeStops = normalizedStops.filter((destination) => !isDeliveryStopCancelled(destination));

  if (normalizedStops.length <= 1 || activeStops.length <= 1) {
    return null;
  }

  const assignedRiderIds = Array.from(
    new Set(
      activeStops
        .map((destination) => getDeliveryStopAssignedRiderId(destination, fallbackAssignedRiderId))
        .filter(Boolean),
    ),
  );

  if (assignedRiderIds.length !== 1) {
    return null;
  }

  const [sharedAssignedRiderId] = assignedRiderIds;
  const allActiveStopsAssigned = activeStops.every((destination) => (
    getDeliveryStopAssignedRiderId(destination, fallbackAssignedRiderId) === sharedAssignedRiderId
  ));

  return allActiveStopsAssigned ? sharedAssignedRiderId : null;
};

const canAssignedRiderCompleteStop = (
  destination: Record<string, unknown> = {},
  currentRecordStatus: unknown = "",
  fallbackAssignedRiderId: unknown = null,
  allDestinations: unknown = [],
) => {
  const normalizedDestination = normalizeDeliveryDestination(destination);
  const normalizedRecordStatus = String(currentRecordStatus ?? "").trim().toLowerCase();

  if (isDeliveryStopCancelled(normalizedDestination)) {
    return false;
  }

  if (normalizedDestination.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
    return false;
  }

  if (normalizedRecordStatus !== "out_for_delivery") {
    return false;
  }

  const assignedRiderId = getDeliveryStopAssignedRiderId(normalizedDestination, fallbackAssignedRiderId);
  if (!assignedRiderId) {
    return false;
  }

  if (normalizedDestination.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.RIDER) {
    return true;
  }

  if (normalizedDestination.confirmation_owner !== DELIVERY_CONFIRMATION_OWNER.CUSTOMER) {
    return false;
  }

  const sharedAssignedRiderId = getSharedAssignedRiderIdForActiveStops(
    allDestinations,
    fallbackAssignedRiderId,
  );

  return Boolean(sharedAssignedRiderId && sharedAssignedRiderId === assignedRiderId);
};

const normalizeDeliveryDestinations = (destinations: unknown) => (
  (Array.isArray(destinations) ? destinations : [])
    .filter(Boolean)
    .map((destination, index) => normalizeDeliveryDestination(
      destination && typeof destination === "object" ? destination as Record<string, unknown> : {},
      index,
    ))
);

const hasStopConfirmationFlow = (destinations: unknown) => (
  normalizeDeliveryDestinations(destinations).some((destination) => Boolean(destination.confirmation_owner))
);

const areAllDeliveryStopsConfirmed = (destinations: unknown) => {
  const normalizedStops = normalizeDeliveryDestinations(destinations)
    .filter((destination) => destination.confirmation_owner);

  return normalizedStops.length > 0
    && normalizedStops.every((destination) => (
      destination.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED
    ));
};

const confirmDeliveryStop = (
  destinations: unknown,
  unitKey: unknown,
  {
    actorType = "customer",
    actorUserId = null,
    proofImageUrl = null,
    proofNote = "",
    confirmedAt = new Date().toISOString(),
  }: {
    actorType?: string;
    actorUserId?: unknown;
    proofImageUrl?: string | null;
    proofNote?: string | null;
    confirmedAt?: string;
  } = {},
) => normalizeDeliveryDestinations(destinations).map((destination) => {
  if (destination.unit_key !== String(unitKey ?? "").trim()) {
    return destination;
  }

  return {
    ...destination,
    confirmation_status: DELIVERY_CONFIRMATION_STATUS.CONFIRMED,
    confirmed_at: confirmedAt,
    confirmed_by_actor: actorType,
    confirmed_by_user_id: actorUserId || null,
    proof_image_url: proofImageUrl || destination.proof_image_url || null,
    proof_uploaded_at: proofImageUrl ? confirmedAt : (destination.proof_uploaded_at || null),
    proof_note: String(proofNote || destination.proof_note || "").trim(),
  };
});

const getDeliveryStopDisplayLabel = (destination: Record<string, unknown> = {}, index = 0) => {
  const normalizedDestination = normalizeDeliveryDestination(destination, index);
  const itemName = String(normalizedDestination.item_name || "Item").trim();
  const unitLabel = String(normalizedDestination.unit_label || "").trim();

  if (itemName && unitLabel) {
    return `${itemName} - ${unitLabel}`;
  }

  return unitLabel || itemName || `Stop ${index + 1}`;
};

const getMissingAssignedStopLabels = (
  destinations: unknown,
  fallbackAssignedRiderId: unknown = null,
) => {
  const normalizedStops = normalizeDeliveryDestinations(destinations);
  const normalizedFallbackAssignedRiderId = normalizedStops.length <= 1
    ? String(fallbackAssignedRiderId ?? "").trim()
    : "";

  return normalizedStops
    .map((destination, index) => {
      const assignedRiderId = String(
        destination?.assigned_rider_id ?? normalizedFallbackAssignedRiderId ?? "",
      ).trim();
      return assignedRiderId ? null : getDeliveryStopDisplayLabel(destination, index);
    })
    .filter(Boolean);
};

const getOutForDeliveryAssignmentError = (
  recordType: "order" | "request",
  destinations: unknown,
  fallbackAssignedRiderId: unknown = null,
) => {
  const missingStopLabels = getMissingAssignedStopLabels(destinations, fallbackAssignedRiderId);
  if (!missingStopLabels.length) {
    return "";
  }

  return `Please assign an employee rider to every delivery stop before moving this ${recordType} to Out for Delivery. Missing riders: ${missingStopLabels.join(", ")}.`;
};

const getImageFileExtension = (file: Record<string, unknown> = {}) => {
  const mimeType = String(file?.mimeType ?? "").trim().toLowerCase();

  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  if (mimeType.includes("heif")) return "heif";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";

  const fileName = String(file?.fileName ?? file?.name ?? "").trim();
  const uri = String(file?.uri ?? "").trim();
  const source = fileName || uri;
  const sourceMatch = source.match(/\.([a-z0-9]+)(?:\?|$)/i);

  return sourceMatch?.[1]?.toLowerCase?.() || "jpg";
};

const uploadDeliveryProofImage = async (
  adminClient: ReturnType<typeof createClient>,
  file: Record<string, unknown> = {},
  {
    entityType,
    entityId,
    unitKey,
  }: {
    entityType: string;
    entityId: unknown;
    unitKey: unknown;
  },
) => {
  const base64 = String(file?.base64 ?? "").trim();
  if (!base64) {
    throw new Error("Proof photo is required.");
  }

  const safeEntityType = String(entityType || "delivery").trim().toLowerCase();
  const safeUnitKey = String(unitKey || "stop").trim().replace(/[^a-z0-9_-]+/gi, "-");
  const extension = getImageFileExtension(file);
  const contentType = String(file?.mimeType || `image/${extension === "jpg" ? "jpeg" : extension}`);
  const fileName = `delivery-proofs/${safeEntityType}-${entityId || "record"}-${safeUnitKey}-${Date.now()}.${extension}`;
  const fileBuffer = Buffer.from(base64, "base64");

  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("receipts")
    .upload(fileName, fileBuffer, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = adminClient.storage.from("receipts").getPublicUrl(uploadData.path);
  return publicUrlData?.publicUrl || null;
};

const normalizeDeliveryProofNote = (value: unknown) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || "";
};

const buildDeliveryStopNotificationPayload = ({
  entityType,
  record,
  stop,
}: {
  entityType: "order" | "request";
  record: Record<string, unknown> | null | undefined;
  stop: Record<string, unknown>;
}) => {
  const referenceNumber = entityType === "request"
    ? record?.request_number || record?.id
    : record?.order_number || record?.id;
  const stopLabel = getDeliveryStopDisplayLabel(stop);
  const link = entityType === "request"
    ? (
        String(record?.type || "").trim().toLowerCase() === "customized"
          ? `/customized-request-tracking/${record?.request_number}`
          : `/request-tracking/${record?.request_number}`
      )
    : `/order-tracking/${record?.order_number}`;

  return {
    user_id: record?.user_id,
    title: "Delivery proof uploaded",
    message: stopLabel
      ? `Proof of delivery for ${stopLabel} in ${entityType === "request" ? "request" : "order"} #${referenceNumber} is now available.`
      : `Proof of delivery for ${entityType === "request" ? "request" : "order"} #${referenceNumber} is now available.`,
    type: "delivery_update",
    link,
  };
};

const getEntityRefundDetails = async (
  adminClient: ReturnType<typeof createClient>,
  entityType: "order" | "request",
  entityId: unknown,
) => {
  if (entityType === "order") {
    const { data: order, error } = await adminClient
      .from("orders")
      .select("id, order_number, user_id, payment_method, payment_status, amount_received, total, status")
      .eq("id", entityId)
      .single();

    if (error) {
      throw error;
    }

    const amountReceived = parseAmount(order?.amount_received);
    const defaultRefundAmount = amountReceived > 0 ? amountReceived : parseAmount(order?.total);

    return {
      entityType,
      entityId: order.id,
      referenceNumber: String(order.order_number ?? order.id),
      customerId: order.user_id,
      paymentMethod: String(order.payment_method ?? "").trim().toLowerCase(),
      paymentStatus: String(order.payment_status ?? "").trim().toLowerCase(),
      amountReceived,
      defaultRefundAmount,
      sourceStatus: String(order.status ?? "").trim().toLowerCase(),
    };
  }

  const { data: request, error } = await adminClient
    .from("requests")
    .select("id, request_number, user_id, payment_status, amount_received, final_price, status, data")
    .eq("id", entityId)
    .single();

  if (error) {
    throw error;
  }

  const requestData = parseMaybeJson(request?.data);
  const paymentMethod = String(
    requestData?.payment_method
      ?? "gcash"
  ).trim().toLowerCase();
  const amountReceived = parseAmount(request?.amount_received);
  const defaultRefundAmount = amountReceived > 0 ? amountReceived : parseAmount(request?.final_price);

  return {
    entityType,
    entityId: request.id,
    referenceNumber: String(request.request_number ?? request.id),
    customerId: request.user_id,
    paymentMethod,
    paymentStatus: String(request.payment_status ?? "").trim().toLowerCase(),
    amountReceived,
    defaultRefundAmount,
    sourceStatus: String(request.status ?? "").trim().toLowerCase(),
  };
};

const validateRefundEligibility = (entity: Record<string, unknown>) => {
  const paymentStatus = String(entity.paymentStatus ?? "").trim().toLowerCase();
  const amountReceived = parseAmount(entity.amountReceived);
  const defaultRefundAmount = parseAmount(entity.defaultRefundAmount);

  if (paymentStatus !== "paid" && amountReceived <= 0) {
    throw new Error("Refunds can only be requested for orders or requests with a recorded payment.");
  }

  if (defaultRefundAmount <= 0) {
    throw new Error("There is no refundable amount available for this transaction.");
  }
};

const findActiveRefund = async (
  adminClient: ReturnType<typeof createClient>,
  entityType: "order" | "request",
  entityId: unknown,
) => {
  const query = adminClient
    .from("refund_requests")
    .select("*")
    .in("status", ACTIVE_REFUND_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data, error } = await (entityType === "order"
    ? query.eq("order_id", entityId)
    : query.eq("request_id", entityId));

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length ? data[0] : null;
};

const sendAssignmentEmailSafely = async ({
  recipientEmail,
  recipientName,
  entityType,
  referenceNumber,
}: {
  recipientEmail?: string | null;
  recipientName?: string | null;
  entityType: "order" | "request";
  referenceNumber: string;
}) => {
  if (!recipientEmail || !transporter || !GMAIL_USER) {
    return;
  }

  const label = entityType === "request" ? "request" : "order";
  const subject =
    entityType === "request"
      ? `New delivery assignment: Request #${referenceNumber}`
      : `New delivery assignment: Order #${referenceNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #ec4899;">New Delivery Assignment</h2>
      <p>Hi ${recipientName || "Team Member"},</p>
      <p>You have been assigned to handle ${label} <strong>#${referenceNumber}</strong>.</p>
      <p>Please open the employee app and check your notifications to view the full ${label} details.</p>
      <p>Thank you.</p>
      <p>Joccery's Flower Shop</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Joccery's Flower Shop" <${GMAIL_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send rider assignment email:", error);
  }
};

const notifyAssignedRider = async (
  adminClient: ReturnType<typeof createClient>,
  entityType: "order" | "request",
  record: Record<string, unknown> | null | undefined,
) => {
  if (!record?.assigned_rider) {
    return;
  }

  const referenceNumber =
    entityType === "request"
      ? record.request_number || record.id
      : record.order_number || record.id;

  const { data: assignedUser, error: assignedUserError } = await adminClient
    .from("users")
    .select("email, name")
    .eq("id", record.assigned_rider)
    .maybeSingle();

  if (assignedUserError) {
    console.error("Failed to load assigned rider details:", assignedUserError);
  }

  await insertNotificationSafely(adminClient, {
    user_id: record.assigned_rider,
    title: "New rider assignment",
    message:
      entityType === "request"
        ? `You were assigned to handle request #${referenceNumber}.`
        : `You were assigned to handle order #${referenceNumber}.`,
    type: "rider_assignment",
    link: entityType === "request" ? `requests/${record.id}` : `orders/${record.id}`,
  });

  await sendAssignmentEmailSafely({
    recipientEmail: assignedUser?.email,
    recipientName: assignedUser?.name,
    entityType,
    referenceNumber: String(referenceNumber),
  });
};

const notifyAssignedOrderStopRiders = async (
  adminClient: ReturnType<typeof createClient>,
  order: Record<string, unknown> | null | undefined,
  destinations: Record<string, unknown>[],
) => {
  if (!order?.id || !order?.order_number) {
    return;
  }

  const riderIds = getUniqueAssignedRiderIds(destinations);

  for (const riderId of riderIds) {
    const stopCount = new Set(
      destinations
        .filter((destination) => String(destination?.assigned_rider_id ?? "") === riderId)
        .map((destination) => buildDestinationGroupKey(destination)),
    ).size || 1;

    const { data: assignedUser, error: assignedUserError } = await adminClient
      .from("users")
      .select("email, name")
      .eq("id", riderId)
      .maybeSingle();

    if (assignedUserError) {
      console.error("Failed to load stop rider details:", assignedUserError);
    }

    await insertNotificationSafely(adminClient, {
      user_id: riderId,
      title: "New rider assignment",
      message: stopCount > 1
        ? `You were assigned to ${stopCount} delivery stops for order #${order.order_number}.`
        : `You were assigned to a delivery stop for order #${order.order_number}.`,
      type: "rider_assignment",
      link: `orders/${order.id}`,
    });

    await sendAssignmentEmailSafely({
      recipientEmail: assignedUser?.email,
      recipientName: assignedUser?.name,
      entityType: "order",
      referenceNumber: String(order.order_number),
    });
  }
};

const notifyAssignedRequestStopRiders = async (
  adminClient: ReturnType<typeof createClient>,
  request: Record<string, unknown> | null | undefined,
  destinations: Record<string, unknown>[],
) => {
  if (!request?.id || !request?.request_number) {
    return;
  }

  const riderIds = getUniqueAssignedRiderIds(destinations);

  for (const riderId of riderIds) {
    const stopCount = new Set(
      destinations
        .filter((destination) => String(destination?.assigned_rider_id ?? "") === riderId)
        .map((destination) => buildDestinationGroupKey(destination)),
    ).size || 1;

    const { data: assignedUser, error: assignedUserError } = await adminClient
      .from("users")
      .select("email, name")
      .eq("id", riderId)
      .maybeSingle();

    if (assignedUserError) {
      console.error("Failed to load request stop rider details:", assignedUserError);
    }

    await insertNotificationSafely(adminClient, {
      user_id: riderId,
      title: "New rider assignment",
      message: stopCount > 1
        ? `You were assigned to ${stopCount} delivery stops for request #${request.request_number}.`
        : `You were assigned to a delivery stop for request #${request.request_number}.`,
      type: "rider_assignment",
      link: `requests/${request.id}`,
    });

    await sendAssignmentEmailSafely({
      recipientEmail: assignedUser?.email,
      recipientName: assignedUser?.name,
      entityType: "request",
      referenceNumber: String(request.request_number),
    });
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase environment variables for admin workflow actions.");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace("Bearer ", "").trim();
    if (!accessToken) {
      return json(401, { error: "Missing authorization token." });
    }

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return json(401, { error: "Unauthorized request." });
    }

    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", caller.id)
      .single();

    const callerRole = callerProfile?.role ?? null;
    const isStaffCaller = Boolean(callerRole && ALLOWED_ROLES.has(callerRole));
    const isCustomerRequestAction = CUSTOMER_REQUEST_ACTIONS.has(action);
    const isCustomerRefundAction = CUSTOMER_REFUND_ACTIONS.has(action);

    if (profileError && !callerRole && !isCustomerRefundAction && !isCustomerRequestAction) {
      return json(403, { error: "Could not verify caller role." });
    }

    if (!isCustomerRefundAction && !isCustomerRequestAction && !isStaffCaller) {
      return json(403, { error: "Only admin and employee accounts can perform this action." });
    }

    switch (action) {
      case "create_refund_request": {
        const entityType = body?.entityType === "request" ? "request" : "order";
        const entityId = body?.entityId ?? body?.orderId ?? body?.requestId;
        const customerReason = String(body?.reason ?? "").trim();

        if (!entityId || !customerReason) {
          return json(400, { error: "A refund target and reason are required." });
        }

        const entity = await getEntityRefundDetails(adminClient, entityType, entityId);
        if (String(entity.customerId) !== String(caller.id)) {
          return json(403, { error: "You can only request refunds for your own transactions." });
        }

        validateRefundEligibility(entity);

        const existingRefund = await findActiveRefund(adminClient, entityType, entity.entityId);
        if (existingRefund) {
          return json(409, { error: "A refund request is already in progress for this transaction." });
        }

        const requestedRefundAmount = parseAmount(body?.refundAmount, parseAmount(entity.defaultRefundAmount));
        const cappedRefundAmount = Math.min(requestedRefundAmount, parseAmount(entity.defaultRefundAmount));

        const insertPayload = {
          entity_type: entityType,
          order_id: entityType === "order" ? entity.entityId : null,
          request_id: entityType === "request" ? entity.entityId : null,
          customer_id: caller.id,
          status: "requested",
          refund_amount: cappedRefundAmount,
          customer_reason: customerReason,
          updated_at: new Date().toISOString(),
        };

        const { data: refundRequest, error: insertError } = await adminClient
          .from("refund_requests")
          .insert([insertPayload])
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        const adminUsers = await getUsersByRoles(adminClient, ["admin"]);
        await insertNotificationsSafely(
          adminClient,
          adminUsers.map((adminUser) => ({
            user_id: adminUser.id,
            title: "Refund request submitted",
            message: `A customer requested a refund for ${entityType} #${entity.referenceNumber}.`,
            type: "refund_request",
            link: entityType === "order" ? `orders/${entity.entityId}` : `requests/${entity.entityId}`,
          })),
        );

        return json(200, { success: true, refundRequest });
      }

      case "submit_refund_gcash_details": {
        const refundId = body?.refundId;
        const gcashName = String(body?.gcashName ?? "").trim();
        const normalizedGcashNumber = String(body?.gcashNumber ?? "").replace(/\D/g, "");

        if (!refundId || !gcashName || normalizedGcashNumber.length < 10) {
          return json(400, { error: "Please provide the GCash account name and a valid GCash number." });
        }

        const { data: existingRefund, error: fetchError } = await adminClient
          .from("refund_requests")
          .select("*")
          .eq("id", refundId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(existingRefund.customer_id) !== String(caller.id)) {
          return json(403, { error: "You can only update your own refund request." });
        }

        if (!["approved", "gcash_submitted"].includes(String(existingRefund.status ?? ""))) {
          return json(400, { error: "GCash details can only be submitted after admin approval." });
        }

        const { data: refundRequest, error: updateError } = await adminClient
          .from("refund_requests")
          .update({
            gcash_name: gcashName,
            gcash_number: normalizedGcashNumber,
            status: "gcash_submitted",
            gcash_submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        const staffUsers = await getUsersByRoles(adminClient, ["admin", "employee"]);
        const referenceNumber = refundRequest.entity_type === "request"
          ? refundRequest.request_id
          : refundRequest.order_id;
        await insertNotificationsSafely(
          adminClient,
          staffUsers.map((staffUser) => ({
            user_id: staffUser.id,
            title: "Refund details submitted",
            message: `Customer GCash details are ready for refund request #${refundRequest.id}.`,
            type: "refund_request",
            link: refundRequest.entity_type === "order"
              ? `orders/${refundRequest.order_id ?? referenceNumber}`
              : `requests/${refundRequest.request_id ?? referenceNumber}`,
          })),
        );

        return json(200, { success: true, refundRequest });
      }

      case "reserve_request_stock": {
        const requestId = body?.requestId;
        const allocations = Array.isArray(body?.allocations) ? body.allocations : [];

        if (!requestId || !allocations.length) {
          return json(400, { error: "A request id and stock allocations are required." });
        }

        const { data: requestRecord, error: fetchError } = await adminClient
          .from("requests")
          .select("id, user_id, data, request_number")
          .eq("id", requestId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(requestRecord?.user_id ?? "") !== String(caller.id)) {
          return json(403, { error: "You can only reserve stock for your own request." });
        }

        const currentData = parseMaybeJson(requestRecord?.data);
        await syncRequestStockAllocationState(
          adminClient,
          requestId,
          {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            stock_allocations: allocations,
            stock_allocation_status: "pending",
          },
          "reserve",
        );

        const { data: updatedRequest, error: updateError } = await adminClient
          .from("requests")
          .update({
            data: {
              ...(currentData && typeof currentData === "object" ? currentData : {}),
              stock_allocations: allocations,
              stock_allocation_status: "reserved",
              stock_allocation_reserved_at: new Date().toISOString(),
            },
          })
          .eq("id", requestId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        return json(200, { success: true, request: updatedRequest });
      }

      case "update_order_status":
      case "accept_order":
      case "decline_order": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        const options = body?.options && typeof body.options === "object" ? body.options : {};
        const cancellationReason = typeof options?.cancellationReason === "string"
          ? options.cancellationReason.trim()
          : "";
        const deliveryFailureReason = getDeliveryFailureReason(options);
        if (!id || !status) {
          return json(400, { error: "Order id and status are required." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("status_timestamps, cancellation_reason, notes, assigned_rider, user_id, order_number")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (status.toLowerCase() === "out_for_delivery") {
          const parsedNotes = parseMultiDeliveryNotes(currentOrder?.notes);
          const assignmentError = getOutForDeliveryAssignmentError(
            "order",
            parsedNotes.destinations,
            currentOrder?.assigned_rider,
          );

          if (assignmentError) {
            return json(409, { error: assignmentError });
          }
        }

        const nextStatusTimestamps = withStatusTimestamp(currentOrder?.status_timestamps, status);
        if (status === "cancelled" && cancellationReason) {
          nextStatusTimestamps.cancellation_reason = cancellationReason;
          nextStatusTimestamps.cancel_reason = cancellationReason;
        }

        if (status === DELIVERY_FAILED_ATTEMPT_STATUS) {
          if (!deliveryFailureReason) {
            return json(400, { error: "A failed delivery attempt reason is required." });
          }
          nextStatusTimestamps.delivery_failed_attempt_reason = deliveryFailureReason;
        }

        const { data: order, error: updateError } = await adminClient
          .from("orders")
          .update({
            status,
            status_timestamps: nextStatusTimestamps,
            cancellation_reason: status === "cancelled"
              ? (cancellationReason || currentOrder?.cancellation_reason || null)
              : currentOrder?.cancellation_reason ?? null,
          })
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        if (status === DELIVERY_FAILED_ATTEMPT_STATUS && currentOrder?.user_id) {
          await insertNotificationSafely(adminClient, {
            user_id: currentOrder.user_id,
            title: "Delivery attempt failed",
            message: `Delivery attempt for order #${currentOrder.order_number || id} failed. Reason: ${deliveryFailureReason}`,
            type: "order_update",
            link: "/profile",
          });
        }

        return json(200, { success: true, order });
      }

      case "update_order_payment_status": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        if (!id || !status) {
          return json(400, { error: "Order id and payment status are required." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("id, total, amount_received")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const normalizedStatus = status.toLowerCase();
        const hasExplicitAmountReceived = body?.amountReceived !== undefined
          && body?.amountReceived !== null
          && body?.amountReceived !== "";
        const explicitAmountReceived = hasExplicitAmountReceived
          ? Math.max(0, parseAmount(body?.amountReceived))
          : null;
        const updatePayload: Record<string, unknown> = {
          payment_status: status,
        };

        if (hasExplicitAmountReceived) {
          updatePayload.amount_received = explicitAmountReceived;
        } else if (normalizedStatus === "paid") {
          updatePayload.amount_received = Math.max(
            parseAmount(currentOrder?.amount_received),
            parseAmount(currentOrder?.total),
          );
        }

        const { data: order, error } = await adminClient
          .from("orders")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return json(200, { success: true, order });
      }

      case "assign_order_rider": {
        const orderId = body?.orderId;
        if (!orderId) {
          return json(400, { error: "Order id is required." });
        }

        const riderId = body?.riderId ?? null;
        const thirdPartyName = body?.thirdPartyName ?? null;
        const thirdPartyInfo = body?.thirdPartyInfo ?? null;
        const updateData = riderId
          ? {
              assigned_rider: riderId,
              third_party_rider_name: null,
              third_party_rider_info: null,
            }
          : {
              assigned_rider: null,
              third_party_rider_name: thirdPartyName,
              third_party_rider_info: thirdPartyInfo,
            };

        const { data: order, error } = await adminClient
          .from("orders")
          .update(updateData)
          .eq("id", orderId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        await notifyAssignedRider(adminClient, "order", order);

        return json(200, { success: true, order });
      }

      case "assign_order_stop_riders": {
        const orderId = body?.orderId;
        const stopAssignments = body?.stopAssignments;

        if (!orderId) {
          return json(400, { error: "Order id is required." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("id, order_number, notes")
          .eq("id", orderId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const parsedNotes = parseMultiDeliveryNotes(currentOrder?.notes);
        if (!parsedNotes.destinations.length) {
          return json(400, { error: "This order does not have multiple delivery stops to assign." });
        }

        const updatedDestinations = applyStopAssignmentsToDestinations(parsedNotes.destinations, stopAssignments);
        const assignedRiderIds = getUniqueAssignedRiderIds(updatedDestinations);

        const { data: order, error } = await adminClient
          .from("orders")
          .update({
            notes: serializeMultiDeliveryNotes({
              destinations: updatedDestinations,
              note: parsedNotes.note,
            }),
            assigned_rider: assignedRiderIds.length === 1 ? assignedRiderIds[0] : null,
            third_party_rider_name: null,
            third_party_rider_info: null,
          })
          .eq("id", orderId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        await notifyAssignedOrderStopRiders(adminClient, order, updatedDestinations);

        return json(200, { success: true, order });
      }

      case "complete_order_delivery_stop": {
        if (callerRole !== "employee") {
          return json(403, { error: "Only the assigned employee rider can complete this delivery stop." });
        }

        const orderId = body?.orderId;
        const normalizedUnitKey = String(body?.unitKey ?? "").trim();
        const proofFile = body?.proofFile && typeof body.proofFile === "object"
          ? body.proofFile as Record<string, unknown>
          : null;
        const proofNote = normalizeDeliveryProofNote(body?.proofNote);

        if (!orderId || !normalizedUnitKey) {
          return json(400, { error: "Order id and delivery stop key are required." });
        }

        if (!proofFile?.base64) {
          return json(400, { error: "Proof photo is required before completing this delivery stop." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("id, order_number, user_id, status, status_timestamps, payment_method, amount_received, total, assigned_rider, notes")
          .eq("id", orderId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(currentOrder?.status ?? "").trim().toLowerCase() !== "out_for_delivery") {
          return json(409, { error: "Delivery proof can only be submitted once the order is out for delivery." });
        }

        const parsedNotes = parseMultiDeliveryNotes(currentOrder?.notes);
        const normalizedStops = normalizeDeliveryDestinations(parsedNotes.destinations);

        if (!hasStopConfirmationFlow(normalizedStops)) {
          return json(400, { error: "This order still uses the legacy delivery confirmation flow." });
        }

        const stopToComplete = normalizedStops.find((stop) => stop.unit_key === normalizedUnitKey);

        if (!stopToComplete) {
          return json(404, { error: "Delivery stop not found." });
        }

        const fallbackAssignedRiderId = normalizedStops.length <= 1
          ? String(currentOrder?.assigned_rider ?? "").trim()
          : "";
        const riderCanCompleteStop = canAssignedRiderCompleteStop(
          stopToComplete,
          currentOrder?.status,
          fallbackAssignedRiderId,
          normalizedStops,
        );

        if (!riderCanCompleteStop) {
          return json(400, { error: "This delivery stop is waiting for customer confirmation." });
        }

        if (stopToComplete.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
          return json(409, { error: "This delivery stop is already confirmed." });
        }

        const assignedRiderId = String(
          stopToComplete.assigned_rider_id
          ?? fallbackAssignedRiderId
          ?? "",
        ).trim();

        if (!assignedRiderId) {
          return json(409, { error: "This delivery stop does not have an assigned rider yet." });
        }

        if (assignedRiderId !== String(caller.id)) {
          return json(403, { error: "Only the assigned rider can upload proof for this delivery stop." });
        }

        const confirmedAt = new Date().toISOString();
        const proofImageUrl = await uploadDeliveryProofImage(adminClient, proofFile, {
          entityType: "order",
          entityId: orderId,
          unitKey: normalizedUnitKey,
        });
        const updatedDestinations = confirmDeliveryStop(normalizedStops, normalizedUnitKey, {
          actorType: "rider",
          actorUserId: caller.id,
          proofImageUrl,
          proofNote,
          confirmedAt,
        });
        const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
        const updatePayload: Record<string, unknown> = {
          notes: serializeMultiDeliveryNotes({
            destinations: updatedDestinations,
            note: parsedNotes.note,
          }),
        };

        if (allConfirmed) {
          updatePayload.status = "completed";
          updatePayload.status_timestamps = withStatusTimestamp(currentOrder?.status_timestamps, "completed");

          if (String(currentOrder?.payment_method ?? "").trim().toLowerCase() === "cod") {
            updatePayload.payment_status = "paid";
            updatePayload.amount_received = Math.max(
              parseAmount(currentOrder?.amount_received),
              parseAmount(currentOrder?.total),
            );
          }
        }

        const { data: order, error: updateError } = await adminClient
          .from("orders")
          .update(updatePayload)
          .eq("id", orderId)
          .select("*")
          .single();

        if (updateError) {
          throw updateError;
        }

        const persistedStops = normalizeDeliveryDestinations(parseMultiDeliveryNotes(order?.notes).destinations);
        const persistedStop = persistedStops.find((stop) => stop.unit_key === normalizedUnitKey);

        if (!persistedStop || persistedStop.confirmation_status !== DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
          throw new Error("The delivery stop confirmation was not saved.");
        }

        if (allConfirmed && String(order?.status ?? "").trim().toLowerCase() !== "completed") {
          throw new Error("The order was not marked as completed after the final stop confirmation.");
        }

        if (currentOrder?.user_id) {
          await insertNotificationSafely(adminClient, buildDeliveryStopNotificationPayload({
            entityType: "order",
            record: currentOrder,
            stop: {
              ...stopToComplete,
              confirmed_by_user_id: caller.id,
              proof_image_url: proofImageUrl,
              proof_note: proofNote,
            },
          }));
        }

        return json(200, {
          success: true,
          order: {
            ...order,
            multi_delivery_destinations: updatedDestinations,
          },
        });
      }

      case "provide_request_quote": {
        const id = body?.id;
        if (!id) {
          return json(400, { error: "Request id is required." });
        }

        const finalItemPrice = Number.parseFloat(String(body?.price ?? 0)) || 0;
        const finalShippingFee = Number.parseFloat(String(body?.shippingFee ?? 0)) || 0;
        const quoteBreakdown = body?.quoteBreakdown ?? null;

        const { data: existingRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("data, user_id, request_number, status, status_timestamps, applied_promo_code")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const existingStatus = String(existingRequest?.status || "").trim().toLowerCase();
        const shouldSetQuotedStatus = !existingStatus || existingStatus === "pending";
        const currentData = parseMaybeJson(existingRequest?.data) as Record<string, unknown>;
        const quoteBreakdownForPricing = quoteBreakdown && typeof quoteBreakdown === "object"
          ? quoteBreakdown as Record<string, unknown>
          : null;
        const promoPricing = await calculateCustomOrderPromoPricing({
          adminClient,
          userId: String(existingRequest?.user_id ?? ""),
          requestData: {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            applied_promo_code: existingRequest?.applied_promo_code ?? currentData?.applied_promo_code,
          },
          quoteBreakdown: quoteBreakdownForPricing,
          finalItemPrice,
          finalShippingFee,
        });
        const discountSnapshot = buildDiscountSnapshot(promoPricing);
        const nextQuoteBreakdown = quoteBreakdownForPricing
          ? {
              ...quoteBreakdownForPricing,
              computed_subtotal: promoPricing.subtotalBeforeDiscount,
              discount_total: promoPricing.discountTotal,
              subtotal_after_discount: promoPricing.subtotalAfterDiscount,
              applied_promo_code: promoPricing.appliedPromoCode,
              shipping_fee: promoPricing.shippingFee,
              computed_total: promoPricing.finalTotal,
            }
          : currentData?.quote_breakdown;

        const updatePayload: Record<string, unknown> = {
          final_price: promoPricing.finalTotal,
          shipping_fee: promoPricing.shippingFee,
          discount_total: promoPricing.discountTotal,
          discount_snapshot: discountSnapshot,
          applied_promo_code: promoPricing.appliedPromoCode,
          data: {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            ...(nextQuoteBreakdown ? { quote_breakdown: nextQuoteBreakdown } : {}),
            subtotal_before_discount: promoPricing.subtotalBeforeDiscount,
            subtotal_after_discount: promoPricing.subtotalAfterDiscount,
            discount_total: promoPricing.discountTotal,
            discount_snapshot: discountSnapshot,
            applied_promo_code: promoPricing.appliedPromoCode,
            shipping_fee: promoPricing.shippingFee,
            final_price: promoPricing.finalTotal,
          },
        };

        if (shouldSetQuotedStatus) {
          updatePayload.status = "quoted";
          updatePayload.status_timestamps = withStatusTimestamp(existingRequest?.status_timestamps, "quoted");
        }

        const { data: request, error: updateError } = await adminClient
          .from("requests")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        if (promoPricing.chosenPromo && promoPricing.discountTotal > 0) {
          await voidReservedDiscountRedemptions(adminClient, id, promoPricing.chosenPromo.id);
          await applyReservedDiscountRedemption({
            adminClient,
            requestId: id,
            userId: String(existingRequest?.user_id ?? request?.user_id ?? ""),
            pricing: promoPricing,
          });
        } else {
          await voidReservedDiscountRedemptions(adminClient, id);
        }

        if (request?.user_id) {
          const { error: notificationError } = await adminClient.from("notifications").insert([
            {
              user_id: request.user_id,
              title: "You have a new quote!",
              message: `A quote of PHP ${promoPricing.finalTotal.toFixed(2)} has been provided for your request #${request.request_number}. Please review and accept it.`,
              type: "request_update",
              link: "/profile",
            },
          ]);

          if (notificationError) {
            console.error("Failed to send quote notification:", notificationError);
          }
        }

        return json(200, { success: true, request });
      }

      case "update_request_status": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        const options = body?.options && typeof body.options === "object" ? body.options : {};
        const cancellationReason = typeof options?.cancellationReason === "string"
          ? options.cancellationReason.trim()
          : "";
        const deliveryFailureReason = getDeliveryFailureReason(options);
        if (!id || !status) {
          return json(400, { error: "Request id and status are required." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("status_timestamps, data, user_id, request_number, cancellation_reason, assigned_rider")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (status.toLowerCase() === "out_for_delivery") {
          const currentData = parseMaybeJson(currentRequest?.data);
          const assignmentError = getOutForDeliveryAssignmentError(
            "request",
            currentData?.multi_delivery_destinations,
            currentRequest?.assigned_rider,
          );

          if (assignmentError) {
            return json(409, { error: assignmentError });
          }
        }

        const updatePayload: Record<string, unknown> = {
          status,
          status_timestamps: withStatusTimestamp(currentRequest?.status_timestamps, status),
        };

        if (status === DELIVERY_FAILED_ATTEMPT_STATUS) {
          if (!deliveryFailureReason) {
            return json(400, { error: "A failed delivery attempt reason is required." });
          }
          (updatePayload.status_timestamps as Record<string, unknown>).delivery_failed_attempt_reason = deliveryFailureReason;
        }

        if (status === "cancelled" || status === "declined") {
          updatePayload.cancellation_reason = cancellationReason || currentRequest?.cancellation_reason || null;
        }

        if (options?.dataPatch && typeof options.dataPatch === "object") {
          const currentData = parseMaybeJson(currentRequest?.data);
          updatePayload.data = {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            ...options.dataPatch,
          };
        }

        const { data: request, error: updateError } = await adminClient
          .from("requests")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        const shouldReleaseStock = status === "cancelled" || status === "declined";
        let requestRecord = request;

        if (shouldReleaseStock) {
          const released = await syncRequestStockAllocationState(
            adminClient,
            id,
            currentRequest?.data,
            "release",
          );

          if (released) {
            const { data: refreshedRequest, error: refreshError } = await adminClient
              .from("requests")
              .select("*")
              .eq("id", id)
              .single();

            if (refreshError) {
              throw refreshError;
            }

            requestRecord = refreshedRequest;
          }

          await voidReservedDiscountRedemptions(adminClient, id);
        }

        const notificationConfig = options?.notification;
        if (notificationConfig && requestRecord?.user_id) {
          const { error: notificationError } = await adminClient.from("notifications").insert([
            {
              user_id: requestRecord.user_id,
              title: notificationConfig.title || "Request status updated",
              message:
                notificationConfig.message ||
                `Your request #${requestRecord.request_number || currentRequest?.request_number || id} is now ${status}.`,
              type: notificationConfig.type || "request_update",
              link: notificationConfig.link || "/profile",
            },
          ]);

          if (notificationError) {
            console.error("Failed to send request status notification:", notificationError);
          }
        }

        if (status === DELIVERY_FAILED_ATTEMPT_STATUS && requestRecord?.user_id) {
          await insertNotificationSafely(adminClient, {
            user_id: requestRecord.user_id,
            title: "Delivery attempt failed",
            message: `Delivery attempt for request #${requestRecord.request_number || currentRequest?.request_number || id} failed. Reason: ${deliveryFailureReason}`,
            type: "request_update",
            link: "/profile",
          });
        }

        return json(200, { success: true, request: requestRecord });
      }

      case "update_request_payment_status": {
        const requestId = body?.requestId;
        const providedRequestType = body?.requestType ? String(body.requestType) : null;
        const status = String(body?.status ?? "").trim();
        if (!requestId || !status) {
          return json(400, { error: "Request id and payment status are required." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("status, status_timestamps, type, data")
          .eq("id", requestId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const requestType = providedRequestType || currentRequest?.type || null;
        const updatePayload: Record<string, unknown> = {
          payment_status: status,
        };

        if (requestType === "customized") {
          const currentData = parseMaybeJson(currentRequest?.data);
          updatePayload.data = {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            payment_status: status,
          };
        }

        if (status === "paid" && currentRequest?.status === "accepted") {
          updatePayload.status = "processing";
          updatePayload.status_timestamps = withStatusTimestamp(currentRequest?.status_timestamps, "processing");
        }

        const { data: request, error: updateError } = await adminClient
          .from("requests")
          .update(updatePayload)
          .eq("id", requestId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        return json(200, { success: true, request });
      }

      case "assign_request_rider": {
        const requestId = body?.requestId;
        if (!requestId) {
          return json(400, { error: "Request id is required." });
        }

        const riderId = body?.riderId ?? null;
        const thirdPartyName = body?.thirdPartyName ?? null;
        const thirdPartyInfo = body?.thirdPartyInfo ?? null;
        const updateData = riderId
          ? {
              assigned_rider: riderId,
              third_party_rider_name: null,
              third_party_rider_info: null,
            }
          : {
              assigned_rider: null,
              third_party_rider_name: thirdPartyName,
              third_party_rider_info: thirdPartyInfo,
            };

        const { data: request, error } = await adminClient
          .from("requests")
          .update(updateData)
          .eq("id", requestId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        await notifyAssignedRider(adminClient, "request", request);

        return json(200, { success: true, request });
      }

      case "assign_request_stop_riders": {
        const requestId = body?.requestId;
        const stopAssignments = body?.stopAssignments;

        if (!requestId) {
          return json(400, { error: "Request id is required." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("id, request_number, data")
          .eq("id", requestId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const currentData = parseMaybeJson(currentRequest?.data);
        const currentDestinations = Array.isArray(currentData?.multi_delivery_destinations)
          ? currentData.multi_delivery_destinations
          : [];

        if (!currentDestinations.length) {
          return json(400, { error: "This request does not have multiple delivery stops to assign." });
        }

        const updatedDestinations = applyStopAssignmentsToDestinations(currentDestinations, stopAssignments);
        const assignedRiderIds = getUniqueAssignedRiderIds(updatedDestinations);

        const { data: request, error } = await adminClient
          .from("requests")
          .update({
            data: {
              ...(currentData && typeof currentData === "object" ? currentData : {}),
              multi_delivery_destinations: updatedDestinations,
            },
            assigned_rider: assignedRiderIds.length === 1 ? assignedRiderIds[0] : null,
            third_party_rider_name: null,
            third_party_rider_info: null,
          })
          .eq("id", requestId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        await notifyAssignedRequestStopRiders(adminClient, request, updatedDestinations);

        return json(200, { success: true, request });
      }

      case "complete_request_delivery_stop": {
        if (callerRole !== "employee") {
          return json(403, { error: "Only the assigned employee rider can complete this delivery stop." });
        }

        const requestId = body?.requestId;
        const normalizedUnitKey = String(body?.unitKey ?? "").trim();
        const proofFile = body?.proofFile && typeof body.proofFile === "object"
          ? body.proofFile as Record<string, unknown>
          : null;
        const proofNote = normalizeDeliveryProofNote(body?.proofNote);

        if (!requestId || !normalizedUnitKey) {
          return json(400, { error: "Request id and delivery stop key are required." });
        }

        if (!proofFile?.base64) {
          return json(400, { error: "Proof photo is required before completing this delivery stop." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("id, request_number, type, user_id, status, status_timestamps, payment_method, payment_status, amount_received, final_price, assigned_rider, data")
          .eq("id", requestId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(currentRequest?.status ?? "").trim().toLowerCase() !== "out_for_delivery") {
          return json(409, { error: "Delivery proof can only be submitted once the request is out for delivery." });
        }

        const currentData = parseMaybeJson(currentRequest?.data) as Record<string, unknown>;
        const normalizedStops = normalizeDeliveryDestinations(currentData?.multi_delivery_destinations);

        if (!hasStopConfirmationFlow(normalizedStops)) {
          return json(400, { error: "This request still uses the legacy delivery confirmation flow." });
        }

        const stopToComplete = normalizedStops.find((stop) => stop.unit_key === normalizedUnitKey);

        if (!stopToComplete) {
          return json(404, { error: "Delivery stop not found." });
        }

        const fallbackAssignedRiderId = normalizedStops.length <= 1
          ? String(currentRequest?.assigned_rider ?? "").trim()
          : "";
        const riderCanCompleteStop = canAssignedRiderCompleteStop(
          stopToComplete,
          currentRequest?.status,
          fallbackAssignedRiderId,
          normalizedStops,
        );

        if (!riderCanCompleteStop) {
          return json(400, { error: "This delivery stop is waiting for customer confirmation." });
        }

        if (stopToComplete.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
          return json(409, { error: "This delivery stop is already confirmed." });
        }

        const assignedRiderId = String(
          stopToComplete.assigned_rider_id
          ?? fallbackAssignedRiderId
          ?? "",
        ).trim();

        if (!assignedRiderId) {
          return json(409, { error: "This delivery stop does not have an assigned rider yet." });
        }

        if (assignedRiderId !== String(caller.id)) {
          return json(403, { error: "Only the assigned rider can upload proof for this delivery stop." });
        }

        const confirmedAt = new Date().toISOString();
        const proofImageUrl = await uploadDeliveryProofImage(adminClient, proofFile, {
          entityType: String(currentRequest?.type || "request").trim().toLowerCase() || "request",
          entityId: requestId,
          unitKey: normalizedUnitKey,
        });
        const updatedDestinations = confirmDeliveryStop(normalizedStops, normalizedUnitKey, {
          actorType: "rider",
          actorUserId: caller.id,
          proofImageUrl,
          proofNote,
          confirmedAt,
        });
        const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
        const nextData: Record<string, unknown> = {
          ...(currentData && typeof currentData === "object" ? currentData : {}),
          multi_delivery_destinations: updatedDestinations,
        };
        const updatePayload: Record<string, unknown> = {
          data: nextData,
        };

        if (allConfirmed) {
          updatePayload.status = "completed";
          updatePayload.status_timestamps = withStatusTimestamp(currentRequest?.status_timestamps, "completed");

          if (
            String(currentRequest?.payment_method ?? currentData?.payment_method ?? "")
              .trim()
              .toLowerCase() === "cod"
          ) {
            updatePayload.payment_status = "paid";
            updatePayload.amount_received = Math.max(
              parseAmount(currentRequest?.amount_received),
              parseAmount(currentRequest?.final_price ?? currentData?.final_price),
            );

            if (String(currentRequest?.type ?? "").trim().toLowerCase() === "customized") {
              updatePayload.data = {
                ...nextData,
                payment_status: "paid",
              };
            }
          }
        }

        const { data: request, error: updateError } = await adminClient
          .from("requests")
          .update(updatePayload)
          .eq("id", requestId)
          .select("*")
          .single();

        if (updateError) {
          throw updateError;
        }

        const persistedRequestData = parseMaybeJson(request?.data) as Record<string, unknown>;
        const persistedStops = normalizeDeliveryDestinations(persistedRequestData?.multi_delivery_destinations);
        const persistedStop = persistedStops.find((stop) => stop.unit_key === normalizedUnitKey);

        if (!persistedStop || persistedStop.confirmation_status !== DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
          throw new Error("The delivery stop confirmation was not saved.");
        }

        if (allConfirmed && String(request?.status ?? "").trim().toLowerCase() !== "completed") {
          throw new Error("The request was not marked as completed after the final stop confirmation.");
        }

        if (currentRequest?.user_id) {
          await insertNotificationSafely(adminClient, buildDeliveryStopNotificationPayload({
            entityType: "request",
            record: currentRequest,
            stop: {
              ...stopToComplete,
              confirmed_by_user_id: caller.id,
              proof_image_url: proofImageUrl,
              proof_note: proofNote,
            },
          }));
        }

        return json(200, {
          success: true,
          request: {
            ...request,
            data: {
              ...persistedRequestData,
              multi_delivery_destinations: updatedDestinations,
            },
          },
        });
      }

      case "approve_refund_request": {
        if (callerRole !== "admin") {
          return json(403, { error: "Only admin accounts can approve refund requests." });
        }

        const refundId = body?.refundId;
        const adminNote = String(body?.adminNote ?? "").trim() || null;
        if (!refundId) {
          return json(400, { error: "Refund request id is required." });
        }

        const { data: existingRefund, error: fetchError } = await adminClient
          .from("refund_requests")
          .select("*")
          .eq("id", refundId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(existingRefund.status ?? "") !== "requested") {
          return json(400, { error: "Only newly requested refunds can be approved." });
        }

        const approvedAmount = parseAmount(body?.refundAmount, parseAmount(existingRefund.refund_amount));
        const { data: refundRequest, error: updateError } = await adminClient
          .from("refund_requests")
          .update({
            status: "approved",
            refund_amount: approvedAmount,
            admin_note: adminNote,
            rejection_reason: null,
            approved_by: caller.id,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        await insertNotificationSafely(adminClient, {
          user_id: refundRequest.customer_id,
          title: "Refund approved",
          message: "Your refund request was approved. Please submit your GCash account details so our staff can process it.",
          type: "refund_request",
          link: "/profile",
        });

        return json(200, { success: true, refundRequest });
      }

      case "reject_refund_request": {
        if (callerRole !== "admin") {
          return json(403, { error: "Only admin accounts can reject refund requests." });
        }

        const refundId = body?.refundId;
        const rejectionReason = String(body?.rejectionReason ?? "").trim() || "Refund request was not approved.";
        if (!refundId) {
          return json(400, { error: "Refund request id is required." });
        }

        const { data: existingRefund, error: fetchError } = await adminClient
          .from("refund_requests")
          .select("*")
          .eq("id", refundId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(existingRefund.status ?? "") !== "requested") {
          return json(400, { error: "Only newly requested refunds can be rejected." });
        }

        const { data: refundRequest, error: updateError } = await adminClient
          .from("refund_requests")
          .update({
            status: "rejected",
            rejection_reason: rejectionReason,
            admin_note: String(body?.adminNote ?? "").trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        await insertNotificationSafely(adminClient, {
          user_id: refundRequest.customer_id,
          title: "Refund request rejected",
          message: rejectionReason,
          type: "refund_request",
          link: "/profile",
        });

        return json(200, { success: true, refundRequest });
      }

      case "start_refund_processing": {
        if (callerRole !== "admin") {
          return json(403, { error: "Only admin accounts can start refund processing." });
        }

        const refundId = body?.refundId;
        if (!refundId) {
          return json(400, { error: "Refund request id is required." });
        }

        const { data: existingRefund, error: fetchError } = await adminClient
          .from("refund_requests")
          .select("*")
          .eq("id", refundId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (String(existingRefund.status ?? "") !== "gcash_submitted") {
          return json(400, { error: "Customer GCash details must be submitted before processing a refund." });
        }

        const { data: refundRequest, error: updateError } = await adminClient
          .from("refund_requests")
          .update({
            status: "processing",
            processing_started_by: caller.id,
            processing_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        return json(200, { success: true, refundRequest });
      }

      case "complete_refund_request": {
        if (callerRole !== "admin") {
          return json(403, { error: "Only admin accounts can complete refund requests." });
        }

        const refundId = body?.refundId;
        const refundReference = String(body?.refundReference ?? "").trim() || null;
        if (!refundId) {
          return json(400, { error: "Refund request id is required." });
        }

        const { data: existingRefund, error: fetchError } = await adminClient
          .from("refund_requests")
          .select("*")
          .eq("id", refundId)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (!["gcash_submitted", "processing"].includes(String(existingRefund.status ?? ""))) {
          return json(400, { error: "This refund request is not ready to be marked as refunded." });
        }

        const { data: refundRequest, error: updateError } = await adminClient
          .from("refund_requests")
          .update({
            status: "refunded",
            refund_reference: refundReference,
            processed_by: caller.id,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", refundId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        await insertNotificationSafely(adminClient, {
          user_id: refundRequest.customer_id,
          title: "Refund completed",
          message: refundReference
            ? `Your refund has been completed. Reference: ${refundReference}.`
            : "Your refund has been completed.",
          type: "refund_request",
          link: "/profile",
        });

        return json(200, { success: true, refundRequest });
      }

      default:
        return json(400, { error: "Unsupported admin workflow action." });
    }
  } catch (error) {
    console.error("manage-admin-workflows error:", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Failed to complete admin workflow action.",
    });
  }
});
