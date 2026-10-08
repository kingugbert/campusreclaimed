// supabase/functions/manage-users/index.ts
// Admin-only Edge Function for managing ambassador accounts.
// All actions require a valid admin session JWT.
//
// Actions (POST body):
//   { action: 'create',         name, email, password }
//   { action: 'list' }
//   { action: 'remove',         userId }
//   { action: 'reset_password', email }
//
// Deploy: supabase functions deploy manage-users --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller is an authenticated admin ──────────────
    // The client sends its session JWT in the Authorization header.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    // Only admin role may call this function
    const role = caller.user_metadata?.role;
    if (role && role !== 'admin') return json({ error: "Forbidden — admin only" }, 403);

    // ── Admin client (service role, bypasses RLS) ─────────────
    const admin = createClient(supabaseUrl, serviceKey);

    const body   = await req.json();
    const action = body.action as string;

    // ── CREATE ambassador ─────────────────────────────────────
    if (action === "create") {
      const { name, email, password } = body;
      if (!name || !email || !password) return json({ error: "name, email and password are required" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,          // skip confirmation email
        user_metadata: { role: "ambassador", full_name: name },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // Mirror in ambassador_profiles
      await admin.from("ambassador_profiles").insert({
        id:         newUser.user.id,
        full_name:  name,
        email,
        created_by: caller.id,
      });

      console.log(`Admin ${caller.email} created ambassador: ${email}`);
      return json({ success: true, user_id: newUser.user.id });
    }

    // ── LIST ambassadors ──────────────────────────────────────
    if (action === "list") {
      const { data: profiles, error: listErr } = await admin
        .from("ambassador_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (listErr) return json({ error: listErr.message }, 500);
      return json({ success: true, ambassadors: profiles });
    }

    // ── REMOVE ambassador ─────────────────────────────────────
    if (action === "remove") {
      const { userId } = body;
      if (!userId) return json({ error: "userId is required" }, 400);

      // Mark inactive in profiles first
      await admin.from("ambassador_profiles").update({ active: false }).eq("id", userId);

      // Delete from Supabase Auth
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 500);

      console.log(`Admin ${caller.email} removed ambassador: ${userId}`);
      return json({ success: true });
    }

    // ── RESET PASSWORD ────────────────────────────────────────
    if (action === "reset_password") {
      const { userId, email } = body;
      if (!userId && !email) return json({ error: "userId or email is required" }, 400);

      // Generate a password reset link
      const target = email || (await admin.auth.admin.getUserById(userId)).data.user?.email;
      if (!target) return json({ error: "User not found" }, 404);

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type:  "recovery",
        email: target,
      });
      if (linkErr) return json({ error: linkErr.message }, 500);

      console.log(`Admin ${caller.email} reset password for: ${target}`);
      return json({ success: true, reset_link: link.properties?.action_link });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("manage-users error:", err);
    return json({ error: "Internal server error", details: err.message }, 500);
  }
});
