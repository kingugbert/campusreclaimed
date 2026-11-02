// supabase/functions/monthly-payout-recap/index.ts
// Sends each active ambassador a monthly email listing their unpaid commissions.
//
// Idempotent: if called multiple times in the same calendar month, only sends once.
// (Tracks sends via a "last_recap_sent_at" column on ambassador_profiles — see below.)
//
// Intended schedule: pg_cron  0 9 1 * *  (9 AM UTC on the 1st of every month)
// To schedule in Supabase SQL Editor:
//   SELECT cron.schedule(
//     'monthly-payout-recap',
//     '0 9 1 * *',
//     $$SELECT net.http_post(
//       url := 'https://vkfzeojkxfuehgtwysrn.supabase.co/functions/v1/monthly-payout-recap',
//       headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
//       body := '{}'::jsonb
//     )$$
//   );
//
// Deploy: supabase functions deploy monthly-payout-recap --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FROM_EMAIL = Deno.env.get("EMAIL_FROM") || "info@campusreclaimed.com";
const ORG_NAME   = Deno.env.get("ORG_NAME")   || "Campus Reclaimed";

serve(async (req) => {
  // Accept POST and GET (for manual triggers / pg_cron net.http_post)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey   = Deno.env.get("RESEND_API_KEY");

  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Determine current month window ──
  const now           = new Date();
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const monthLabel    = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  // ── Fetch all active ambassadors ──
  const { data: ambassadors, error: ambErr } = await supabase
    .from("ambassador_profiles")
    .select("id, full_name, email, commission_rate, last_recap_sent_at")
    .eq("active", true);

  if (ambErr) {
    console.error("Failed to fetch ambassadors:", ambErr.message);
    return new Response(JSON.stringify({ error: ambErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  if (!ambassadors || ambassadors.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No active ambassadors" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  let sentCount   = 0;
  let skippedCount = 0;

  for (const amb of ambassadors) {
    // ── Idempotency: skip if recap already sent this calendar month ──
    if (amb.last_recap_sent_at) {
      const lastSent = new Date(amb.last_recap_sent_at);
      if (
        lastSent.getFullYear() === now.getFullYear() &&
        lastSent.getMonth()    === now.getMonth()
      ) {
        console.log(`Skipping ${amb.email} — recap already sent this month`);
        skippedCount++;
        continue;
      }
    }

    // ── Fetch unpaid commissions for this ambassador ──
    const { data: items, error: itemErr } = await supabase
      .from("donation_items")
      .select("id, sku, item_description, shopify_payout, payout_percentage, ambassador_commission, sold_at, agreement_type")
      .eq("ambassador_id", amb.id)
      .eq("ambassador_commission_paid", false)
      .not("ambassador_commission", "is", null)
      .order("sold_at", { ascending: false });

    if (itemErr) {
      console.error(`Failed to fetch items for ${amb.email}:`, itemErr.message);
      continue;
    }

    if (!items || items.length === 0) {
      console.log(`No unpaid commissions for ${amb.email} — skipping email`);
      // Still mark as "sent" so we don't re-check every day if cron runs more often
      await supabase
        .from("ambassador_profiles")
        .update({ last_recap_sent_at: now.toISOString() })
        .eq("id", amb.id);
      skippedCount++;
      continue;
    }

    const totalCommission = items.reduce((sum, i) => sum + (i.ambassador_commission ?? 0), 0);

    // ── Build email HTML ──
    const itemRows = items.map(item => {
      const soldDate = item.sold_at
        ? new Date(item.sold_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "—";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.sku || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${item.item_description || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">$${(item.shopify_payout ?? 0).toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#16a34a;">$${(item.ambassador_commission ?? 0).toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${soldDate}</td>
        </tr>`;
    }).join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${ORG_NAME} Commission Recap</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <div style="background:#4f7942;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.4rem;">${ORG_NAME}</h1>
      <p style="color:#c8e6c0;margin:6px 0 0;font-size:.95rem;">Ambassador Commission Recap — ${monthLabel}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:1rem;color:#374151;">Hi ${amb.full_name.split(' ')[0]},</p>
      <p style="color:#6b7280;">Here's a summary of your unpaid commissions. We'll reach out shortly to arrange payment.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:.9rem;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">SKU</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Item</th>
            <th style="padding:10px 12px;text-align:right;color:#374151;font-weight:600;">Sale Price</th>
            <th style="padding:10px 12px;text-align:right;color:#374151;font-weight:600;">Your Commission</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Sold</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr style="background:#f0fdf4;">
            <td colspan="3" style="padding:12px;font-weight:700;color:#374151;">Total Unpaid Commission</td>
            <td style="padding:12px;font-weight:700;color:#16a34a;text-align:right;">$${totalCommission.toFixed(2)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <p style="color:#6b7280;font-size:.875rem;margin-top:24px;">
        Your commission rate is <strong>${amb.commission_rate ?? 10}%</strong> of each consignor's earned payout.
        Questions? Reply to this email or contact the team.
      </p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:.8rem;margin:0;">${ORG_NAME} · Reduce, Reuse, Reclaim</p>
    </div>
  </div>
</body>
</html>`;

    // ── Send via Resend ──
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    `${ORG_NAME} <${FROM_EMAIL}>`,
        to:      [amb.email],
        subject: `Your ${ORG_NAME} Commission Recap — ${monthLabel}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error(`Failed to send recap to ${amb.email}: ${errText}`);
      continue;
    }

    // ── Mark recap sent ──
    await supabase
      .from("ambassador_profiles")
      .update({ last_recap_sent_at: now.toISOString() })
      .eq("id", amb.id);

    sentCount++;
    console.log(`Sent commission recap to ${amb.email} — ${items.length} items, $${totalCommission.toFixed(2)} total`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent:    sentCount,
      skipped: skippedCount,
      month:   monthLabel,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
