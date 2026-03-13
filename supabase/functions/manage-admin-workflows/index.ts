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

    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", caller.id)
      .single();

    const callerRole = callerProfile?.role ?? caller.user_metadata?.role ?? null;
    if (profileError && !callerRole) {
      return json(403, { error: "Could not verify caller role." });
    }

    if (!callerRole || !ALLOWED_ROLES.has(callerRole)) {
      return json(403, { error: "Only admin and employee accounts can perform this action." });
    }

    const body = await req.json();
    const action = String(body?.action ?? "").trim();

    switch (action) {
      case "update_order_status":
      case "accept_order":
      case "decline_order": {
        const id = body?.id;
        const status = String(body?.status ?? "").trim();
        if (!id || !status) {
          return json(400, { error: "Order id and status are required." });
        }

        const { data: currentOrder, error: fetchError } = await adminClient
          .from("orders")
          .select("status_timestamps")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const { data: order, error: updateError } = await adminClient
          .from("orders")
          .update({
            status,
            status_timestamps: withStatusTimestamp(currentOrder?.status_timestamps, status),
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
        if (!id || !status) {
          return json(400, { error: "Request id and status are required." });
        }

        const { data: currentRequest, error: fetchError } = await adminClient
          .from("requests")
          .select("status_timestamps, data, user_id, request_number")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        const updatePayload: Record<string, unknown> = {
          status,
          status_timestamps: withStatusTimestamp(currentRequest?.status_timestamps, status),
        };

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
