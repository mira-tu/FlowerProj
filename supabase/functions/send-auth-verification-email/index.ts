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

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";
const ALLOWED_REDIRECT_ORIGINS = Deno.env.get("ALLOWED_AUTH_REDIRECT_ORIGINS") ?? "";
const VERIFICATION_TTL_HOURS = Number(Deno.env.get("EMAIL_VERIFICATION_TTL_HOURS") ?? "24");
const RESEND_COOLDOWN_SECONDS = Number(Deno.env.get("EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS") ?? "60");

const DEFAULT_REDIRECT_ORIGINS = [
  "https://jocerrys-flowershop.up.railway.app",
];

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });

const genericSuccessMessage =
  "If an account exists for that email, a verification link has been sent.";

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const sanitizeName = (value: unknown) => String(value ?? "").trim().slice(0, 120);

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
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error("Missing Gmail credentials. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase service role credentials.");
    }

    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const userId = String(body?.userId ?? "").trim();
    const requestedName = sanitizeName(body?.name);
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

    let query = adminClient
      .from("users")
      .select("id, name, email, email_verified, email_verification_sent_at")
      .eq("email", email)
      .limit(1);

    if (userId) {
      query = query.eq("id", userId);
    }

    const { data: userProfile, error: userProfileError } = await query.maybeSingle();

    if (userProfileError) {
      throw userProfileError;
    }

    if (!userProfile) {
      return json(200, {
        sent: true,
        status: "queued",
        message: genericSuccessMessage,
      });
    }

    if (userProfile.email_verified) {
      return json(200, {
        sent: false,
        status: "already_verified",
        message: "Your email is already verified. You may now go back to the login page.",
      });
    }

    const lastSentTimestamp = userProfile.email_verification_sent_at
      ? Date.parse(userProfile.email_verification_sent_at)
      : Number.NaN;

    if (
      Number.isFinite(lastSentTimestamp) &&
      Date.now() - lastSentTimestamp < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return json(429, {
        sent: false,
        status: "cooldown",
        message: "Please wait a moment before requesting another verification email.",
      });
    }

    const rawToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const tokenHash = await hashToken(rawToken);
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const verificationUrl = `${baseUrl}/email-verification?token=${encodeURIComponent(rawToken)}`;

    const { error: updateVerificationError } = await adminClient
      .from("users")
      .update({
        email_verification_token_hash: tokenHash,
        email_verification_sent_at: sentAt,
        email_verification_expires_at: expiresAt,
      })
      .eq("id", userProfile.id);

    if (updateVerificationError) {
      throw updateVerificationError;
    }

    const recipientName = sanitizeName(userProfile.name) || requestedName || "there";

    await transporter.sendMail({
      from: `"Jocerry's Flower Shop" <${GMAIL_USER}>`,
      to: email,
      subject: "Verify your email address",
      text: [
        `Hi ${recipientName},`,
        "",
        "Thanks for creating your account.",
        "Please verify your email address by opening the link below:",
        verificationUrl,
        "",
        `This link will expire in ${VERIFICATION_TTL_HOURS} hours.`,
        "",
        "If you did not create this account, you can safely ignore this email.",
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2 style="margin-bottom: 12px; color: #111827;">Verify your email address</h2>
          <p>Hi ${recipientName},</p>
          <p>Thanks for creating your account with Jocerry's Flower Shop.</p>
          <p>Please confirm your email address to finish setting up your account.</p>
          <p style="margin: 24px 0;">
            <a
              href="${verificationUrl}"
              style="display: inline-block; background: #dc3545; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600;"
            >
              Verify email
            </a>
          </p>
          <p style="margin-bottom: 8px;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #374151;">${verificationUrl}</p>
          <p>This link will expire in ${VERIFICATION_TTL_HOURS} hours.</p>
          <p>If you did not create this account, you can safely ignore this email.</p>
        </div>
      `,
    });

    return json(200, {
      sent: true,
      status: "sent",
      message: "We sent a verification link to your email address.",
    });
  } catch (error) {
    console.error("send-auth-verification-email error:", error);

    return json(500, {
      sent: false,
      status: "error",
      message: "Unable to send the verification email right now. Please try again.",
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
});
