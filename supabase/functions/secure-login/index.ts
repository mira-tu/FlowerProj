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
const MAX_LOGIN_ATTEMPTS = Number(Deno.env.get("LOGIN_MAX_ATTEMPTS") ?? "5");
const ATTEMPT_WINDOW_MINUTES = Number(Deno.env.get("LOGIN_ATTEMPT_WINDOW_MINUTES") ?? "15");
const BLOCK_DURATION_SECONDS = Number(Deno.env.get("LOGIN_BLOCK_DURATION_SECONDS") ?? "30");

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const RATE_LIMIT_MESSAGE = "Too many login attempts. Please wait a moment before trying again.";

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
const buildAttemptRecordId = (emailHash: string) => hashValue(`login:${emailHash}`);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase environment variables for secure login.");
    }

    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return json(401, {
        status: "invalid_credentials",
        message: INVALID_CREDENTIALS_MESSAGE,
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
    const attemptRecordId = await buildAttemptRecordId(emailHash);
    const { data: attemptRecord, error: attemptRecordError } = await adminClient
      .from("auth_login_attempts")
      .select("failure_count, first_failed_at, last_failed_at, blocked_until")
      .eq("id", attemptRecordId)
      .maybeSingle();

    if (attemptRecordError) {
      throw attemptRecordError;
    }

    const now = new Date();
    const nowTimestamp = now.getTime();
    const attemptWindowMs = ATTEMPT_WINDOW_MINUTES * 60 * 1000;
    const blockDurationMs = BLOCK_DURATION_SECONDS * 1000;
    const blockedUntilTimestamp = attemptRecord?.blocked_until
      ? Date.parse(attemptRecord.blocked_until)
      : Number.NaN;

    if (Number.isFinite(blockedUntilTimestamp) && blockedUntilTimestamp > nowTimestamp) {
      const retryAfterSeconds = getRetryAfterSeconds(blockedUntilTimestamp, nowTimestamp);

      return json(429, {
        status: "rate_limited",
        message: RATE_LIMIT_MESSAGE,
        retry_after_seconds: retryAfterSeconds,
        blocked_until: new Date(blockedUntilTimestamp).toISOString(),
      }, {
        "Retry-After": String(retryAfterSeconds),
      });
    }

    const lastFailedTimestamp = attemptRecord?.last_failed_at
      ? Date.parse(attemptRecord.last_failed_at)
      : Number.NaN;
    const isWindowExpired =
      !Number.isFinite(lastFailedTimestamp)
      || (nowTimestamp - lastFailedTimestamp) > attemptWindowMs;
    const currentFailureCount = isWindowExpired ? 0 : Number(attemptRecord?.failure_count ?? 0);
    const currentFirstFailedAt = isWindowExpired
      ? now.toISOString()
      : attemptRecord?.first_failed_at ?? now.toISOString();

    const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session?.access_token || !signInData?.session?.refresh_token) {
      const nextFailureCount = currentFailureCount + 1;
      const blockedUntilTimestamp = nextFailureCount >= MAX_LOGIN_ATTEMPTS
        ? nowTimestamp + blockDurationMs
        : Number.NaN;
      const blockedUntil = Number.isFinite(blockedUntilTimestamp)
        ? new Date(blockedUntilTimestamp).toISOString()
        : null;

      const { error: upsertAttemptError } = await adminClient
        .from("auth_login_attempts")
        .upsert({
          id: attemptRecordId,
          email_hash: emailHash,
          failure_count: nextFailureCount,
          first_failed_at: currentFirstFailedAt,
          last_failed_at: now.toISOString(),
          blocked_until: blockedUntil,
        }, {
          onConflict: "id",
        });

      if (upsertAttemptError) {
        throw upsertAttemptError;
      }

      if (nextFailureCount >= MAX_LOGIN_ATTEMPTS && Number.isFinite(blockedUntilTimestamp)) {
        const retryAfterSeconds = getRetryAfterSeconds(blockedUntilTimestamp, nowTimestamp);

        return json(429, {
          status: "rate_limited",
          message: RATE_LIMIT_MESSAGE,
          retry_after_seconds: retryAfterSeconds,
          blocked_until: blockedUntil,
        }, {
          "Retry-After": String(retryAfterSeconds),
        });
      }

      return json(401, {
        status: "invalid_credentials",
        message: INVALID_CREDENTIALS_MESSAGE,
      });
    }

    const { error: clearAttemptError } = await adminClient
      .from("auth_login_attempts")
      .delete()
      .eq("id", attemptRecordId);

    if (clearAttemptError) {
      throw clearAttemptError;
    }

    return json(200, {
      status: "signed_in",
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_at: signInData.session.expires_at,
        expires_in: signInData.session.expires_in,
        token_type: signInData.session.token_type,
        user: signInData.session.user,
      },
    });
  } catch (error) {
    console.error("secure-login error:", error);

    return json(500, {
      status: "error",
      message: "Unable to sign in right now. Please try again.",
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
});
