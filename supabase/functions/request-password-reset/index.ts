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
const PASSWORD_RESET_COOLDOWN_SECONDS = Number(Deno.env.get("PASSWORD_RESET_COOLDOWN_SECONDS") ?? "60");
const PASSWORD_RESET_MAX_DAILY_ATTEMPTS = Number(Deno.env.get("PASSWORD_RESET_MAX_DAILY_ATTEMPTS") ?? "5");
const PASSWORD_RESET_DAILY_WINDOW_HOURS = Number(Deno.env.get("PASSWORD_RESET_DAILY_WINDOW_HOURS") ?? "24");

const DEFAULT_REDIRECT_ORIGINS = [
  "https://joccery-flower.shop",
  "https://flowerproj-production.up.railway.app",
];

const genericSuccessMessage =
  "If an account exists for that email, a password reset link has been sent.";
const PASSWORD_RESET_COOLDOWN_MESSAGE =
  "Please wait before requesting another reset email.";
const PASSWORD_RESET_DAILY_LIMIT_MESSAGE =
  "Daily reset limit reached. Please try again tomorrow.";

const json = (
  status: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const getRetryAfterSeconds = (blockedUntilTimestamp: number, nowTimestamp: number) =>
  Math.max(1, Math.ceil((blockedUntilTimestamp - nowTimestamp) / 1000));

const hashValue = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const buildEmailHash = (email: string) => hashValue(`email:${email}`);
const buildPasswordResetAttemptRecordId = (emailHash: string) => hashValue(`reset:${emailHash}`);

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
        status: "accepted",
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
    const emailHash = await buildEmailHash(email);
    const attemptRecordId = await buildPasswordResetAttemptRecordId(emailHash);
    const { data: attemptRecord, error: attemptRecordError } = await adminClient
      .from("password_reset_attempts")
      .select("attempt_count, window_started_at, last_attempt_at, cooldown_until")
      .eq("id", attemptRecordId)
      .maybeSingle();

    if (attemptRecordError) {
      throw attemptRecordError;
    }

    const now = new Date();
    const nowTimestamp = now.getTime();
    const cooldownMs = PASSWORD_RESET_COOLDOWN_SECONDS * 1000;
    const dailyWindowMs = PASSWORD_RESET_DAILY_WINDOW_HOURS * 60 * 60 * 1000;
    const cooldownUntilTimestamp = attemptRecord?.cooldown_until
      ? Date.parse(attemptRecord.cooldown_until)
      : Number.NaN;

    if (Number.isFinite(cooldownUntilTimestamp) && cooldownUntilTimestamp > nowTimestamp) {
      const retryAfterSeconds = getRetryAfterSeconds(cooldownUntilTimestamp, nowTimestamp);

      return json(429, {
        sent: false,
        status: "cooldown",
        message: PASSWORD_RESET_COOLDOWN_MESSAGE,
        retry_after_seconds: retryAfterSeconds,
        blocked_until: new Date(cooldownUntilTimestamp).toISOString(),
      }, {
        "Retry-After": String(retryAfterSeconds),
      });
    }

    const windowStartedAtTimestamp = attemptRecord?.window_started_at
      ? Date.parse(attemptRecord.window_started_at)
      : Number.NaN;
    const isDailyWindowExpired =
      !Number.isFinite(windowStartedAtTimestamp)
      || (nowTimestamp - windowStartedAtTimestamp) >= dailyWindowMs;
    const currentAttemptCount = isDailyWindowExpired ? 0 : Number(attemptRecord?.attempt_count ?? 0);
    const currentWindowStartedAt = isDailyWindowExpired
      ? now.toISOString()
      : attemptRecord?.window_started_at ?? now.toISOString();
    const currentWindowEndsTimestamp = Date.parse(currentWindowStartedAt) + dailyWindowMs;

    if (
      currentAttemptCount >= PASSWORD_RESET_MAX_DAILY_ATTEMPTS
      && Number.isFinite(currentWindowEndsTimestamp)
      && currentWindowEndsTimestamp > nowTimestamp
    ) {
      const retryAfterSeconds = getRetryAfterSeconds(currentWindowEndsTimestamp, nowTimestamp);

      return json(429, {
        sent: false,
        status: "daily_limit",
        message: PASSWORD_RESET_DAILY_LIMIT_MESSAGE,
        retry_after_seconds: retryAfterSeconds,
        blocked_until: new Date(currentWindowEndsTimestamp).toISOString(),
      }, {
        "Retry-After": String(retryAfterSeconds),
      });
    }

    const { data: userProfile, error: userProfileError } = await adminClient
      .from("users")
      .select("id, email_verified")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (userProfileError) {
      throw userProfileError;
    }

    if (userProfile?.id && userProfile.email_verified) {
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
            message: PASSWORD_RESET_COOLDOWN_MESSAGE,
            retry_after_seconds: PASSWORD_RESET_COOLDOWN_SECONDS,
          }, {
            "Retry-After": String(PASSWORD_RESET_COOLDOWN_SECONDS),
          });
        }

        throw resetPasswordError;
      }
    }

    const { error: upsertAttemptError } = await adminClient
      .from("password_reset_attempts")
      .upsert({
        id: attemptRecordId,
        email_hash: emailHash,
        attempt_count: currentAttemptCount + 1,
        window_started_at: currentWindowStartedAt,
        last_attempt_at: now.toISOString(),
        cooldown_until: new Date(nowTimestamp + cooldownMs).toISOString(),
      }, {
        onConflict: "id",
      });

    if (upsertAttemptError) {
      throw upsertAttemptError;
    }

    return json(200, {
      sent: true,
      status: "accepted",
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
