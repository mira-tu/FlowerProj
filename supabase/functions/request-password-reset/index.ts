import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";
const ALLOWED_REDIRECT_ORIGINS = Deno.env.get("ALLOWED_AUTH_REDIRECT_ORIGINS") ?? "";
const PASSWORD_RESET_PATH = "/reset-password";

const DEFAULT_REDIRECT_ORIGINS = [
  "https://jocerrys-flowershop.up.railway.app",
];

const genericSuccessMessage =
  "If an account exists for that email, a password reset link has been sent.";

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeBaseUrl = (value: string) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const getAllowedBaseUrls = () => {
  const configuredOrigins = ALLOWED_REDIRECT_ORIGINS
    .split(",")
    .map((origin) => normalizeBaseUrl(origin.trim()))
    .filter((origin): origin is string => Boolean(origin));

  const fallbackOrigin = normalizeBaseUrl(APP_BASE_URL);

  return [...new Set([...configuredOrigins, ...DEFAULT_REDIRECT_ORIGINS, ...(fallbackOrigin ? [fallbackOrigin] : [])])];
};

const resolveBaseUrl = (requestedBaseUrl: string) => {
  const normalizedRequestedBaseUrl = normalizeBaseUrl(requestedBaseUrl);
  const allowedBaseUrls = getAllowedBaseUrls();

  if (normalizedRequestedBaseUrl && allowedBaseUrls.includes(normalizedRequestedBaseUrl)) {
    return normalizedRequestedBaseUrl;
  }

  return normalizeBaseUrl(APP_BASE_URL) ?? allowedBaseUrls[0];
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
      throw new Error("Missing Supabase environment variables for password reset.");
    }

    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const baseUrl = resolveBaseUrl(String(body?.redirectTo ?? req.headers.get("origin") ?? ""));

    if (!email || !baseUrl) {
      return json(200, {
        sent: true,
        status: "queued",
        message: genericSuccessMessage,
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userProfile, error: userProfileError } = await adminClient
      .from("users")
      .select("id, email_verified")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (userProfileError) {
      throw userProfileError;
    }

    if (!userProfile?.id) {
      return json(200, {
        sent: true,
        status: "queued",
        message: genericSuccessMessage,
      });
    }

    if (!userProfile.email_verified) {
      return json(403, {
        sent: false,
        status: "verification_required",
        message: "Please verify your email before requesting a password reset link.",
      });
    }

    const { error: resetPasswordError } = await publicClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}${PASSWORD_RESET_PATH}`,
    });

    if (resetPasswordError) {
      const errorMessage = String(resetPasswordError.message ?? "").toLowerCase();

      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("email rate limit")
      ) {
        return json(429, {
          sent: false,
          status: "cooldown",
          message: "Please wait a moment before requesting another reset email.",
        });
      }

      throw resetPasswordError;
    }

    return json(200, {
      sent: true,
      status: "sent",
      message: genericSuccessMessage,
    });
  } catch (error) {
    console.error("request-password-reset error:", error);

    return json(500, {
      sent: false,
      status: "error",
      message: "Unable to send a reset link right now. Please try again.",
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
});
