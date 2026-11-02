// supabase/functions/lookup-donor/index.ts
// Step 2 of magic-link auth for the consignor portal.
// Accepts POST { token } — validates a one-time portal_sessions token and returns
// the donor's profile + items.
// Also still accepts POST { email } as a legacy / admin bypass path.
//
// Deploy: supabase functions deploy lookup-donor --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let token: string | undefined;
  let email: string | undefined;

  try {
    const body = await req.json();
    token = body.token?.trim();
    email = body.email?.trim().toLowerCase();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (!token && !email) {
    return json({ error: "token or email is required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Token path (magic link) ──────────────────────────────────────────────
  if (token) {
    const now = new Date().toISOString();

    // Look up session
    const { data: session, error: sessionErr } = await supabase
      .from("portal_sessions")
      .select("id, donor_email, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (sessionErr) {
      console.error("Session lookup error:", sessionErr.message);
      return json({ error: "Database error" }, 500);
    }

    if (!session) {
      return json({ error: "This sign-in link is invalid. Please request a new one." }, 401);
    }

    if (session.used_at) {
      return json({ error: "This sign-in link has already been used. Please request a new one." }, 401);
    }

    if (session.expires_at < now) {
      return json({ error: "This sign-in link has expired. Please request a new one." }, 401);
    }

    // Mark token as used immediately (one-time use)
    await supabase
      .from("portal_sessions")
      .update({ used_at: now })
      .eq("id", session.id);

    email = session.donor_email;
  }

  // ── Shared donor + items lookup ──────────────────────────────────────────
  // Look up ALL donors with this email and use the one with donations
  const { data: donorRows, error: donorErr } = await supabase
    .from("donors")
    .select("id, donor_name, donor_email")
    .ilike("donor_email", email!);

  if (donorErr) {
    console.error("Donor lookup error:", donorErr.message);
    return json({ error: "Database error" }, 500);
  }

  if (!donorRows || donorRows.length === 0) {
    return json({ error: "No account found for that email address." }, 404);
  }

  // Find the donor row that actually has donations (handles duplicate rows)
  let donor = donorRows[0];
  let donationIds: string[] = [];

  for (const row of donorRows) {
    const { data: donations } = await supabase
      .from("donations")
      .select("id")
      .eq("donor_id", row.id);

    if (donations && donations.length > 0) {
      donor = row;
      donationIds = donations.map((d: { id: string }) => d.id);
      break;
    }
  }

  if (donationIds.length === 0) {
    // Fall through with first donor row — will return empty items list
    const { data: donations } = await supabase
      .from("donations")
      .select("id")
      .eq("donor_id", donor.id);
    donationIds = (donations || []).map((d: { id: string }) => d.id);
  }

  if (donationIds.length === 0) {
    return json({ donor, items: [] });
  }

  // Get consignment items
  const { data: itemRows, error: itemErr } = await supabase
    .from("donation_items")
    .select(`
      id, item_description, category, status, agreement_type,
      shopify_payout, payout_percentage, payout_override, payout_paid, payout_paid_date,
      retail_price, sold_at, item_image_url
    `)
    .in("donation_id", donationIds)
    .eq("agreement_type", "consignment")
    .order("created_at", { ascending: false });

  if (itemErr) {
    console.error("Items lookup error:", itemErr.message);
    return json({ error: "Database error" }, 500);
  }

  // Fetch primary images from item_images table
  const itemIds = (itemRows || []).map((i: { id: string }) => i.id);
  let imageMap: Record<string, string> = {};
  if (itemIds.length > 0) {
    const { data: imgRows } = await supabase
      .from("item_images")
      .select("item_id, image_url")
      .in("item_id", itemIds)
      .eq("display_order", 1);
    (imgRows || []).forEach((r: { item_id: string; image_url: string }) => {
      imageMap[r.item_id] = r.image_url;
    });
  }

  const items = (itemRows || []).map((i: Record<string, unknown>) => ({
    ...i,
    primary_image: (imageMap[i.id as string] || i.item_image_url || null),
  }));

  return json({ donor, items });
});
