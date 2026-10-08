// Supabase Edge Function: email-notifications
// Finds donation items 30+ days old whose donor has an email and hasn't
// been notified, and sends a reminder via Resend.
//
// Can be invoked from the inventory app (Send Notifications button) or on a
// schedule. If a NOTIFY_SECRET env var is set, requests must include a
// matching `x-notify-secret` header (recommended since this deploys with
// --no-verify-jwt).
//
// Deploy: supabase functions deploy email-notifications --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
};

const FROM_EMAIL = Deno.env.get("EMAIL_FROM") || "noreply@campusreclaimed.com";
const ORG_NAME   = Deno.env.get("ORG_NAME")   || "Campus Reclaimed";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Optional shared-secret gate (set NOTIFY_SECRET to enable)
    const secret = Deno.env.get("NOTIFY_SECRET");
    if (secret && req.headers.get("x-notify-secret") !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

    // Current schema: donation_items -> donations (date_accepted) -> donors (name/email).
    // Pull un-notified items with the join, then filter date/email/status in JS
    // (dataset is small; avoids PostgREST nested-filter edge cases).
    const { data: rows, error } = await supabase
      .from("donation_items")
      .select(`id, item_description, storage_location, status, notification_sent,
               donation:donations!inner(date_accepted, donor:donors!inner(id, donor_name, donor_email))`)
      .is("notification_sent", null);

    if (error) throw error;

    const items = (rows || []).filter((item) => {
      const status = item.status || "in_storage";
      if (status !== "in_storage") return false;                      // skip listed / sold / claimed / removed
      const dateAccepted = item.donation?.date_accepted;
      const email = item.donation?.donor?.donor_email;
      return !!email && !!dateAccepted && dateAccepted <= cutoff;
    });

    if (items.length === 0) {
      return new Response(JSON.stringify({ message: "No items to notify", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    // Group items by donor so each donor gets ONE email listing all their items,
    // rather than one email per item.
    const byDonor = new Map<string, { name: string; email: string; items: typeof items }>();
    for (const item of items) {
      const donor = item.donation.donor;
      const entry = byDonor.get(donor.id) || { name: donor.donor_name, email: donor.donor_email, items: [] };
      entry.items.push(item);
      byDonor.set(donor.id, entry);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const [donorId, donor] of byDonor) {
      const itemRowsHtml = donor.items.map((item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #fde68a;"><strong>${item.item_description}</strong></td>
          <td style="padding:8px 12px;border-bottom:1px solid #fde68a;">${item.donation.date_accepted}</td>
        </tr>`).join("");

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: donor.email,
            subject: `${ORG_NAME} — 30-Day Update on Your Donated Item${donor.items.length > 1 ? "s" : ""}`,
            html: `
              <div style="font-family:'Georgia',serif;max-width:560px;margin:0 auto">
                <div style="background:#1c3a2a;padding:24px;text-align:center">
                  <h1 style="color:#f7f4ee;margin:0;font-size:1.4rem">${ORG_NAME}</h1>
                </div>
                <div style="padding:28px;background:#fff">
                  <p>Hi ${donor.name},</p>
                  <p>It has been 30 days since the following item${donor.items.length > 1 ? "s were" : " was"} accepted into our inventory:</p>
                  <table style="border-collapse:collapse;width:100%;background:#fffbeb;border-radius:8px;margin:16px 0">
                    <tr>
                      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #f5c48a;font-size:.8rem;color:#7a4800">Item</th>
                      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #f5c48a;font-size:.8rem;color:#7a4800">Date Accepted</th>
                    </tr>
                    ${itemRowsHtml}
                  </table>
                  <p>If you have any questions about your item${donor.items.length > 1 ? "s" : ""}, just reply to this email.</p>
                  <p>Thank you for supporting campus sustainability!</p>
                  <p style="color:#999;font-size:.85rem">— The ${ORG_NAME} Team</p>
                </div>
              </div>
            `,
          }),
        });

        if (emailResponse.ok) {
          const ids = donor.items.map((i) => i.id);
          await supabase
            .from("donation_items")
            .update({ notification_sent: new Date().toISOString() })
            .in("id", ids);
          results.push({ donor_id: donorId, donor: donor.name, items: ids.length, status: "sent" });
        } else {
          const errText = await emailResponse.text();
          console.error(`Email failed for donor ${donorId}:`, errText);
          results.push({ donor_id: donorId, donor: donor.name, status: "failed", error: errText });
        }
      } catch (emailError) {
        console.error("Email error for donor", donorId, emailError);
        results.push({ donor_id: donorId, donor: donor.name, status: "failed", error: emailError.message });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    return new Response(
      JSON.stringify({ message: `Notified ${sent} of ${byDonor.size} donors`, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
