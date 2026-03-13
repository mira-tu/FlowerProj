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

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? "");

const isDuplicateUserError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
};

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
    return json(405, { error: "Method not allowed" });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase environment variables for employee creation.");
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

    if (profileError || callerProfile?.role !== "admin") {
      return json(403, { error: "Only admins can create employee accounts." });
    }

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const phone = String(body?.phone ?? "").trim() || null;

    if (!name || !email || password.length < 6) {
      return json(400, { error: "Name, email, and a password of at least 6 characters are required." });
    }

    const { data: existingProfile, error: existingProfileError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    if (existingProfile?.role && existingProfile.role !== "employee") {
      return json(409, {
        error: "An account with this email already exists and is not an employee account.",
      });
    }

    const { data: createdAuthUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        phone,
        role: "employee",
      },
    });

    let employeeUser = createdAuthUser?.user ?? null;
    let createdNewAuthUser = false;

    if (createUserError || !employeeUser) {
      if (!isDuplicateUserError(createUserError)) {
        throw createUserError ?? new Error("Failed to create auth user.");
      }

      const existingAuthUser = await findAuthUserByEmail(adminClient, email);
      if (!existingAuthUser) {
        return json(409, {
          error: "This email is already registered. Please use a different email address.",
        });
      }

      const existingRole = existingProfile?.role ?? existingAuthUser.user_metadata?.role ?? null;
      if (existingRole && existingRole !== "employee") {
        return json(409, {
          error: "This email already belongs to a non-employee account. Please use a different email address.",
        });
      }

      const { data: updatedAuthUser, error: updateUserError } = await adminClient.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata ?? {}),
            name,
            phone,
            role: "employee",
          },
        },
      );

      if (updateUserError || !updatedAuthUser.user) {
        throw updateUserError ?? new Error("Failed to restore the existing employee account.");
      }

      employeeUser = updatedAuthUser.user;
    } else {
      createdNewAuthUser = true;
    }

    const employeeId = employeeUser.id;

    if (existingProfile?.id && existingProfile.id !== employeeId) {
      if (createdNewAuthUser) {
        await adminClient.auth.admin.deleteUser(employeeId);
      }

      return json(409, {
        error: "This email is already linked to another user profile. Please use a different email address.",
      });
    }

    const { error: upsertProfileError } = await adminClient
      .from("users")
      .upsert({
        id: employeeId,
        name,
        email,
        phone,
        role: "employee",
      }, { onConflict: "id" });

    if (upsertProfileError) {
      if (createdNewAuthUser) {
        await adminClient.auth.admin.deleteUser(employeeId);
      }
      throw upsertProfileError;
    }

    return json(200, {
      success: true,
      restoredExistingUser: !createdNewAuthUser,
      employee: {
        id: employeeId,
        name,
        email,
        phone,
        role: "employee",
      },
    });
  } catch (error) {
    console.error("create-employee error:", error);
    return json(500, {
      error: error instanceof Error ? error.message : "Failed to create employee.",
    });
  }
});
