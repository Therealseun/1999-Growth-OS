import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ message: "Authentication required." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json({ message: "The employee invitation function is not configured." }, 500);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ message: "Authentication required." }, 401);

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role,active")
    .eq("id", authData.user.id)
    .single();
  if (profileError) return json({ message: "Could not verify administrator permissions." }, 500);
  if (!profile.active || profile.role !== "ADMIN") return json({ message: "Administrator access required." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: "A valid JSON request body is required." }, 400);
  }
  if (!body || typeof body !== "object") return json({ message: "Invalid invitation request." }, 400);
  const payload = body as { email?: unknown; name?: unknown; role?: unknown };
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const role = payload.role === "MANAGER" ? "MANAGER" : payload.role === "EMPLOYEE" ? "EMPLOYEE" : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || !role) {
    return json({ message: "Provide a valid email, name, and non-admin role." }, 400);
  }

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
  });
  if (inviteError) {
    const status = inviteError.message.toLowerCase().includes("already") ? 409 : 400;
    return json({ message: inviteError.message }, status);
  }
  if (!invited.user) return json({ message: "Supabase did not return the invited user." }, 502);

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ full_name: name, role })
    .eq("id", invited.user.id);
  if (updateError) return json({ message: "The user was invited, but their profile could not be configured." }, 500);

  return json({ id: invited.user.id, email: invited.user.email, name, role }, 201);
});
