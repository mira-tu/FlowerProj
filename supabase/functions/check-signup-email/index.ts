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

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const findAuthUserByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
) => {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    const matchingUser = users.find((user) => user.email?.toLowerCase() === email);

    if (matchingUser) {
      return matchingUser;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase service role credentials.");
    }

    const body = await req.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return json(400, {
        available: false,
        status: "invalid_email",
        message: "Email is required.",
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const existingAuthUser = await findAuthUserByEmail(adminClient, email);

    if (existingAuthUser) {
      return json(200, {
        available: false,
        status: "duplicate_email",
        message: "An account with this email address already exists. Please use a different email address or log in instead.",
      });
    }

    const { data: existingProfile, error: profileError } = await adminClient
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (existingProfile?.id) {
      return json(200, {
        available: false,
        status: "duplicate_email",
        message: "An account with this email address already exists. Please use a different email address or log in instead.",
      });
    }

    return json(200, {
      available: true,
      status: "available",
    });
  } catch (error) {
    console.error("check-signup-email error:", error);

    return json(500, {
      available: false,
      status: "error",
      message: "Unable to check this email right now. Please try again.",
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
});
