// supabase/functions/tote-pickup-reminder/index.ts
// Email 4 — Day-of pickup reminder.
//
// Runs once daily (schedule set in Supabase Dashboard or via pg_cron).
// Finds every tote_request where:
//   • status = 'tote_out'  (tote delivered, waiting for pickup)
//   • pickup date = today  (pickup_scheduled_at + 1 day, since Email 3 says "tomorrow")
//   • pickup_reminder_sent IS NOT TRUE  (idempotency guard)
//
// Then sends Email 4 and flips pickup_reminder_sent = true.
//
// Deploy: supabase functions deploy tote-pickup-reminder --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");

    // Find all requests whose pickup day is today (ET).
    // Email 3 says "tomorrow", so pickup_date = pickup_scheduled_at + 1 day.
    // We compare dates in America/New_York so the reminder fires on the right calendar day.
    const { data: requests, error } = await supabase
      .from("tote_requests")
      .select("id, student_name, student_email, pickup_window")
      .eq("status", "tote_out")
      .not("pickup_scheduled_at", "is", null)
      .neq("pickup_reminder_sent", true)
      // PostgreSQL: cast to ET date and compare to today in ET
      .filter(
        "(pickup_scheduled_at AT TIME ZONE 'America/New_York')::date + interval '1 day'",
        "eq",
        new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) // YYYY-MM-DD
      );

    if (error) {
      // Supabase JS doesn't support arbitrary PostgREST filter expressions well —
      // fall back to fetching candidates and filtering in JS.
      console.warn("Filter shortcut failed, falling back to JS filter:", error.message);
    }

    // ── JS-side date filter (reliable fallback) ──────────────────────────────
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // "2026-05-07"

    // Fetch a broader set and filter in JS
    const { data: candidates, error: fetchErr } = await supabase
      .from("tote_requests")
      .select("id, student_name, student_email, pickup_window, pickup_scheduled_at")
      .eq("status", "tote_out")
      .not("pickup_scheduled_at", "is", null)
      .neq("pickup_reminder_sent", true);

    if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);

    const toRemind = (candidates || []).filter(req => {
      if (!req.pickup_scheduled_at) return false;
      const scheduledDate = new Date(req.pickup_scheduled_at);
      // Add 1 day to get pickup day
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      const pickupDayET = scheduledDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      return pickupDayET === todayET;
    });

    console.log(`Day-of reminder check — today ET: ${todayET}, candidates: ${candidates?.length ?? 0}, to remind: ${toRemind.length}`);

    if (toRemind.length === 0) {
      return json({ success: true, sent: 0, message: "No reminders to send today." });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const req of toRemind) {
      const firstName  = req.student_name.split(" ")[0];
      const pickupNote = req.pickup_window
        ? `during your scheduled window: <strong>${req.pickup_window}</strong>`
        : "during the scheduled window";

      if (resendKey) {
        const ok = await sendEmail(
          resendKey,
          req.student_email,
          "Reminder: Reclaim Tote Pickup Today",
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>Just a quick follow-up to confirm that your Reclaim Tote is placed outside your door for today's pickup ${pickupNote}.</p>
            <p>If it's already out, you're all set—thank you! If not, please place it outside as soon as possible so our team can collect it during the scheduled window.</p>
            <p>Feel free to reply if anything has changed or if you have any questions.</p>
            <p>Best,<br>The Campus Reclaimed Team</p>
          `)
        );

        if (ok) {
          // Mark reminder sent so a re-run doesn't duplicate
          const { error: updateErr } = await supabase
            .from("tote_requests")
            .update({ pickup_reminder_sent: true })
            .eq("id", req.id);
          if (updateErr) {
            console.error(`Failed to mark reminder sent for ${req.id}:`, updateErr.message);
            errors.push(req.id);
          } else {
            sent++;
          }
        } else {
          errors.push(req.id);
        }
      } else {
        console.warn("RESEND_API_KEY not set — skipping email send (dry run)");
        sent++;
      }
    }

    console.log(`Reminders sent: ${sent}, errors: ${errors.length}`);
    return json({ success: true, sent, errors: errors.length > 0 ? errors : undefined });

  } catch (err) {
    console.error("tote-pickup-reminder error:", err);
    return json({ error: "Internal server error", details: err.message }, 500);
  }
});
