import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });

const hashToken = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase service role credentials.");
    }

    const body = await req.json();
    const token = String(body?.token ?? "").trim();

    if (!token) {
      return json(400, {
        status: "invalid",
        message: "This verification link is invalid. Please request a new one.",
      });
    }

    const tokenHash = await hashToken(token);
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userProfile, error: userProfileError } = await adminClient
      .from("users")
      .select("id, email, email_verified, email_verified_at, email_verification_expires_at")
      .eq("email_verification_token_hash", tokenHash)
      .maybeSingle();

    if (userProfileError) {
      throw userProfileError;
    }

    if (!userProfile) {
      return json(400, {
        status: "invalid",
        message: "This verification link is invalid. Please request a new one.",
      });
    }

    if (userProfile.email_verified) {
      return json(200, {
        status: "already_verified",
        message: "Your email is already verified. You may now go back to the login page.",
      });
    }

    const expiresAtTimestamp = userProfile.email_verification_expires_at
      ? Date.parse(userProfile.email_verification_expires_at)
      : Number.NaN;

    if (Number.isFinite(expiresAtTimestamp) && Date.now() > expiresAtTimestamp) {
      return json(400, {
        status: "expired",
        message: "This verification link has expired. Please request a new one.",
      });
    }

    const { data: updatedAuthUser, error: updateAuthUserError } = await adminClient.auth.admin.updateUserById(
      userProfile.id,
      {
        email_confirm: true,
      },
    );

    if (updateAuthUserError) {
      throw updateAuthUserError;
    }

    const confirmedAt =
      updatedAuthUser.user?.email_confirmed_at ??
      updatedAuthUser.user?.confirmed_at ??
      new Date().toISOString();

    const { error: updateProfileError } = await adminClient
      .from("users")
      .update({
        email_verified: true,
        email_verified_at: confirmedAt,
      })
      .eq("id", userProfile.id);

    if (updateProfileError) {
      throw updateProfileError;
    }

    return json(200, {
      status: "verified",
      message: "Your email has been verified. You may now go back to the login page.",
    });
  } catch (error) {
    console.error("confirm-email-verification error:", error);

    return json(500, {
      status: "error",
      message: "We could not verify this email right now. Please try again.",
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
});
