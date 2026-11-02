// supabase/functions/request-payout/index.ts
// Public endpoint called from DonorPortalPage.jsx when a consignor requests their payout.
//
// Flow:
//   1. Verify the email matches a donor with sold, unpaid consignment items
//   2. Throttle: one payout request per email per 24 hours
//   3. Email Anna (info@campusreclaimed.com) with the payout details
//   4. Send donor a confirmation email
//   5. Return success
//
// Deploy: supabase functions deploy request-payout --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Campus Reclaimed <info@campusreclaimed.com>", to, subject, html }),
  });
  if (!res.ok) console.error(`Email to ${to} failed:`, await res.text());
  return res.ok;
}

function emailWrap(body: string): string {
  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #faf7f2;">
    <div style="background: #1a3c34; color: #fff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <h1 style="margin:0; font-size: 22px; font-weight: 400;">Campus <em>Reclaimed</em></h1>
    </div>
    <div style="background: #fff; padding: 28px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e4e0da; line-height: 1.6; color: #1a1a1a;">
      ${body}
    </div>
  </div>`;
}

const ADMIN_EMAIL = "info@campusreclaimed.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return json({ error: "email is required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Look up donor ──────────────────────────────────────────
    const { data: donor, error: donorErr } = await supabase
      .from("donors")
      .select("id, donor_name, donor_email")
      .ilike("donor_email", normalizedEmail)
      .maybeSingle();

    if (donorErr) throw new Error(`Donor lookup failed: ${donorErr.message}`);
    if (!donor) {
      return json({ error: "No donor found with that email address" }, 404);
    }

    // ── Find unpaid sold consignment items ─────────────────────
    // (throttle check happens after we know which items are unpaid)
    const { data: donations, error: donationErr } = await supabase
      .from("donations")
      .select("id")
      .eq("donor_id", donor.id);

    if (donationErr) throw new Error(`Donation lookup failed: ${donationErr.message}`);

    const donationIds = (donations || []).map(d => d.id);
    if (donationIds.length === 0) {
      return json({ error: "No donations found for this account" }, 404);
    }

    const { data: unpaidItems, error: itemErr } = await supabase
      .from("donation_items")
      .select("id, item_description, shopify_payout, payout_percentage, payout_override, category")
      .in("donation_id", donationIds)
      .eq("agreement_type", "consignment")
      .eq("status", "sold")
      .eq("payout_paid", false);

    if (itemErr) throw new Error(`Item lookup failed: ${itemErr.message}`);

    if (!unpaidItems || unpaidItems.length === 0) {
      return json({ error: "No unpaid sold items found for this account" }, 404);
    }

    // ── Throttle: block only if all current items were already requested ──
    // A new item sold after the last request should always be requestable.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const currentItemIds = unpaidItems.map(i => i.id);

    const { data: recentRequest } = await supabase
      .from("payout_requests")
      .select("item_ids")
      .ilike("donor_email", normalizedEmail)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRequest) {
      const alreadyRequested: string[] = recentRequest.item_ids ?? [];
      const hasNewItems = currentItemIds.some(id => !alreadyRequested.includes(id));
      if (!hasNewItems) {
        return json({ error: "A payout request was already submitted in the last 24 hours. Please wait before requesting again." }, 429);
      }
    }

    // ── Calculate total owed ──────────────────────────────────
    const totalOwed = unpaidItems.reduce((sum, item) => {
      if (item.payout_override != null) return sum + Number(item.payout_override);
      if (item.shopify_payout != null && item.payout_percentage != null) {
        return sum + (Number(item.shopify_payout) * Number(item.payout_percentage) / 100);
      }
      return sum;
    }, 0);

    // ── Record the payout request ──────────────────────────────
    // Insert into payout_requests table (created by migration, best-effort)
    try {
      await supabase.from("payout_requests").insert({
        donor_id:    donor.id,
        donor_email: normalizedEmail,
        amount_owed: totalOwed.toFixed(2),
        item_count:  unpaidItems.length,
        item_ids:    currentItemIds,
      });
    } catch (e) {
      // Table may not exist yet — don't block the request
      console.warn("payout_requests insert failed (table may not exist):", e);
    }

    // ── Build item list for emails ────────────────────────────
    const itemRows = unpaidItems.map(item => {
      const amount = item.payout_override != null
        ? Number(item.payout_override).toFixed(2)
        : item.shopify_payout != null && item.payout_percentage != null
          ? (Number(item.shopify_payout) * Number(item.payout_percentage) / 100).toFixed(2)
          : '—';
      return `<tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #f0ede8;">${item.item_description || 'Item'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #f0ede8;">${item.category || '—'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #f0ede8; text-align: right;">$${amount}</td>
      </tr>`;
    }).join('');

    const itemTable = `
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
        <thead>
          <tr style="background: #f5f2ee;">
            <th style="padding: 8px; text-align: left; font-weight: 600;">Item</th>
            <th style="padding: 8px; text-align: left; font-weight: 600;">Category</th>
            <th style="padding: 8px; text-align: right; font-weight: 600;">Amount Owed</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 10px 8px; font-weight: 700;">Total</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #1a3c34;">$${totalOwed.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>`;

    // ── Email Anna ────────────────────────────────────────────
    if (resendKey) {
      await sendEmail(resendKey, ADMIN_EMAIL,
        `Payout Request — ${donor.donor_name} ($${totalOwed.toFixed(2)})`,
        `<div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a3c34;">Payout Request</h2>
          <p><strong>${donor.donor_name}</strong> (${donor.donor_email}) has requested their consignment payout.</p>
          <p><strong>Total owed: $${totalOwed.toFixed(2)}</strong> across ${unpaidItems.length} item${unpaidItems.length !== 1 ? 's' : ''}.</p>
          ${itemTable}
          <p style="color: #888; font-size: 12px;">Requested at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
          <p style="color: #555; font-size: 13px;">Log in to the Campus Reclaimed inventory app to mark items as paid once the payout is sent.</p>
        </div>`
      );

      // ── Email donor confirmation ───────────────────────────
      const firstName = donor.donor_name.split(' ')[0];
      await sendEmail(resendKey, donor.donor_email,
        "Payout Request Received — Campus Reclaimed",
        emailWrap(`
          <p>Hi ${firstName},</p>
          <p>We received your payout request for <strong>$${totalOwed.toFixed(2)}</strong> across ${unpaidItems.length} sold item${unpaidItems.length !== 1 ? 's' : ''}. Our team will process your payment shortly.</p>
          ${itemTable}
          <p>If you have any questions, please reply to this email.</p>
          <p>Thank you for choosing Campus Reclaimed!</p>
          <p>Best,<br>The Campus Reclaimed Team</p>
        `)
      );
    }

    return json({
      success: true,
      donor_name:  donor.donor_name,
      item_count:  unpaidItems.length,
      total_owed:  parseFloat(totalOwed.toFixed(2)),
    });

  } catch (err) {
    console.error("request-payout error:", err);
    return json({ error: "Internal server error", details: err.message }, 500);
  }
});
