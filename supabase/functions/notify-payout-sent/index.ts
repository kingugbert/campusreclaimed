// supabase/functions/notify-payout-sent/index.ts
// Called by the admin app when a consignor payout is marked as paid.
// Sends Email 6: "Your payout of $X has been sent to your Venmo."
//
// Deploy: supabase functions deploy notify-payout-sent --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Campus Reclaimed <info@campusreclaimed.com>", to, subject, html }),
  });
  if (!res.ok) console.error(`Email to ${to} failed:`, await res.text());
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { itemId } = await req.json();
    if (!itemId) return new Response(JSON.stringify({ error: "itemId required" }), { status: 400, headers: CORS });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email not configured" }), { status: 503, headers: CORS });
    }

    // ── Fetch item + donor info ──
    const { data: item, error: itemErr } = await supabase
      .from("donation_items")
      .select(`
        id, item_description, shopify_payout, payout_percentage, payout_override,
        payout_paid_date, agreement_type,
        donation:donations(
          donor:donors(donor_name, donor_email)
        )
      `)
      .eq("id", itemId)
      .maybeSingle();

    if (itemErr || !item) {
      console.error("Item lookup failed:", itemErr);
      return new Response(JSON.stringify({ error: "Item not found" }), { status: 404, headers: CORS });
    }

    if (item.agreement_type !== "consignment") {
      console.log(`Item ${itemId} is not consignment — skipping email`);
      return new Response(JSON.stringify({ skipped: true, reason: "not consignment" }), { headers: CORS });
    }

    const donor = (item.donation as any)?.donor;
    if (!donor?.donor_email) {
      console.log(`No donor email for item ${itemId} — skipping`);
      return new Response(JSON.stringify({ skipped: true, reason: "no donor email" }), { headers: CORS });
    }

    // ── Look up Venmo handle from participation_agreements ──
    const { data: agreementRow } = await supabase
      .from("participation_agreements")
      .select("venmo_handle")
      .eq("email", donor.donor_email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const venmoHandle = agreementRow?.venmo_handle || null;

    // ── Calculate effective payout ──
    const salePrice   = parseFloat(item.shopify_payout || "0");
    const payoutPct   = parseFloat(item.payout_percentage || "20");
    const calculated  = salePrice * payoutPct / 100;
    const effectivePayout = item.payout_override != null
      ? parseFloat(item.payout_override)
      : calculated;
    const payoutStr = effectivePayout.toFixed(2);

    const firstName   = donor.donor_name?.split(" ")[0] || "there";
    const paidDate    = item.payout_paid_date
      ? new Date(item.payout_paid_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "today";

    const venmoLine = venmoHandle
      ? `<p>We've sent <strong>$${payoutStr}</strong> to your Venmo (<strong>${venmoHandle}</strong>).</p>`
      : `<p>We've processed your payout of <strong>$${payoutStr}</strong>. Please reach out to us if you have any questions about how to receive your funds.</p>`;

    const html = emailWrap(`
      <p>Hi ${firstName},</p>
      <p>Great news — your payout is on its way!</p>
      ${venmoLine}
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0; background: #f9fafb; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="padding: 10px 16px; color: #6b7280; width: 50%;">Item</td>
          <td style="padding: 10px 16px;">${item.item_description || "Your item"}</td>
        </tr>
        <tr>
          <td style="padding: 10px 16px; color: #6b7280;">Sale Price</td>
          <td style="padding: 10px 16px;">$${salePrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 16px; color: #6b7280;">Your Payout</td>
          <td style="padding: 10px 16px; font-weight: 700; color: #16a34a;">$${payoutStr}</td>
        </tr>
        <tr>
          <td style="padding: 10px 16px; color: #6b7280;">Date Paid</td>
          <td style="padding: 10px 16px;">${paidDate}</td>
        </tr>
      </table>
      <p>Thank you for choosing Campus Reclaimed. Your items are making a difference on campus!</p>
      <p>Best,<br>The Campus Reclaimed Team</p>
    `);

    const sent = await sendEmail(resendKey, donor.donor_email, "Your Campus Reclaimed Payout Has Been Sent!", html);
    console.log(`Payout email ${sent ? "sent" : "failed"} to ${donor.donor_email} for item ${itemId} ($${payoutStr})`);

    return new Response(JSON.stringify({ success: sent, to: donor.donor_email, amount: payoutStr }), { headers: CORS });

  } catch (err) {
    console.error("notify-payout-sent error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
