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
const CUSTOMER_REFUND_ACTIONS = new Set(["create_refund_request", "submit_refund_gcash_details"]);
const MULTI_DELIVERY_NOTES_PREFIX = "[multi_delivery_v1]";
const ACTIVE_REFUND_STATUSES = ["requested", "approved", "gcash_submitted", "processing"];

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

    const callerRole = callerProfile?.role ?? caller.user_metadata?.role ?? null;
    const isStaffCaller = Boolean(callerRole && ALLOWED_ROLES.has(callerRole));
    const isCustomerRefundAction = CUSTOMER_REFUND_ACTIONS.has(action);

    if (profileError && !callerRole && !isCustomerRefundAction) {
      return json(403, { error: "Could not verify caller role." });
    }

    if (!isCustomerRefundAction && !isStaffCaller) {
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

      case "update_order_status":
      case "accept_order":
      case "decline_order": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        const options = body?.options && typeof body.options === "object" ? body.options : {};
        const cancellationReason = typeof options?.cancellationReason === "string"
          ? options.cancellationReason.trim()
          : "";
        if (!id || !status) {
          return json(400, { error: "Order id and status are required." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("status_timestamps, cancellation_reason")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const nextStatusTimestamps = withStatusTimestamp(currentOrder?.status_timestamps, status);
        if (status === "cancelled" && cancellationReason) {
          nextStatusTimestamps.cancellation_reason = cancellationReason;
          nextStatusTimestamps.cancel_reason = cancellationReason;
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

        return json(200, { success: true, order });
      }

      case "update_order_payment_status": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        if (!id || !status) {
          return json(400, { error: "Order id and payment status are required." });
        }

        const { data: order, error } = await adminClient
          .from("orders")
          .update({ payment_status: status })
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
          .select("data, user_id, request_number, status_timestamps")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const updatePayload: Record<string, unknown> = {
          final_price: finalItemPrice + finalShippingFee,
          shipping_fee: finalShippingFee,
          status: "quoted",
          status_timestamps: withStatusTimestamp(existingRequest?.status_timestamps, "quoted"),
        };

        if (quoteBreakdown) {
          const currentData = parseMaybeJson(existingRequest?.data);
          updatePayload.data = {
            ...(currentData && typeof currentData === "object" ? currentData : {}),
            quote_breakdown: quoteBreakdown,
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

        if (request?.user_id) {
          const { error: notificationError } = await adminClient.from("notifications").insert([
            {
              user_id: request.user_id,
              title: "You have a new quote!",
              message: `A quote of PHP ${finalItemPrice.toFixed(2)} has been provided for your request #${request.request_number}. Please review and accept it.`,
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
        if (!id || !status) {
          return json(400, { error: "Request id and status are required." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("status_timestamps, data, user_id, request_number, cancellation_reason")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const updatePayload: Record<string, unknown> = {
          status,
          status_timestamps: withStatusTimestamp(currentRequest?.status_timestamps, status),
        };

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

        const notificationConfig = options?.notification;
        if (notificationConfig && request?.user_id) {
          const { error: notificationError } = await adminClient.from("notifications").insert([
            {
              user_id: request.user_id,
              title: notificationConfig.title || "Request status updated",
              message:
                notificationConfig.message ||
                `Your request #${request.request_number || currentRequest?.request_number || id} is now ${status}.`,
              type: notificationConfig.type || "request_update",
              link: notificationConfig.link || "/profile",
            },
          ]);

          if (notificationError) {
            console.error("Failed to send request status notification:", notificationError);
          }
        }

        return json(200, { success: true, request });
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
