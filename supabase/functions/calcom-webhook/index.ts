// supabase/functions/calcom-webhook/index.ts
// Receives Cal.com webhook events and updates tote_request scheduling status.
//
// Triggers handled:
//   BOOKING_CREATED   → set tote_request.status = 'scheduled', save scheduled_at +
//                       calcom_booking_uid + calcom_event_uri, email student confirmation
//   BOOKING_CANCELLED → revert tote_request.status = 'pending', clear scheduling fields,
//                       email student that pickup needs to be rescheduled
//
// Cal.com free tier has no HMAC signing (secret: null), so we use a shared token
// in the subscriber URL query string as basic authentication:
//   ?token=<CALCOM_WEBHOOK_TOKEN>
//
// The webhook was registered pointing to:
//   https://vkfzeojkxfuehgtwysrn.supabase.co/functions/v1/calcom-webhook?token=<token>
//
// Deploy: supabase functions deploy calcom-webhook --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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

// Format a Cal.com UTC timestamp for display in Eastern time
function formatPickupTime(isoString: string): string {
  try {
    const dt = new Date(isoString);
    return dt.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month:   'long',
      day:     'numeric',
      year:    'numeric',
      hour:    'numeric',
      minute:  '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Token-based auth (Cal.com free has no HMAC) ──
  const url           = new URL(req.url);
  const calcomToken   = Deno.env.get("CALCOM_WEBHOOK_TOKEN");
  const requestToken  = url.searchParams.get("token");

  if (calcomToken && requestToken !== calcomToken) {
    console.error("Cal.com webhook token mismatch");
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");

  try {
    const payload = await req.json();
    const { triggerEvent, payload: booking } = payload;

    console.log(`Cal.com webhook: ${triggerEvent} | booking uid: ${booking?.uid}`);

    // ── BOOKING_CREATED: a student booked a drop-off or pick-up time ──
    if (triggerEvent === "BOOKING_CREATED") {
      const bookingUid  = booking?.uid;
      const eventUri    = booking?.eventTypeId?.toString() || booking?.eventType?.id?.toString() || null;
      const startTime   = booking?.startTime;           // ISO string UTC
      const attendeeEmail = booking?.responses?.email?.value ||
                            booking?.attendees?.[0]?.email || null;
      const attendeeName  = booking?.responses?.name?.value ||
                            booking?.attendees?.[0]?.name  || null;

      if (!bookingUid || !attendeeEmail) {
        console.error("Missing bookingUid or attendeeEmail in BOOKING_CREATED payload");
        return json({ error: "Missing required booking fields" }, 400);
      }

      // Find the tote request by student email (most recent pending or tote_out)
      const { data: toteRequest, error: findErr } = await supabase
        .from("tote_requests")
        .select("id, student_name, student_email, assigned_to, status")
        .ilike("student_email", attendeeEmail)
        .in("status", ["pending", "tote_out"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findErr) {
        console.error("DB lookup error:", findErr.message);
        return json({ error: "DB error" }, 500);
      }

      if (!toteRequest) {
        console.log(`No open tote request found for ${attendeeEmail} — ignoring BOOKING_CREATED`);
        return json({ success: true, action: "no_match" });
      }

      // Update tote request to scheduled
      const { error: updateErr } = await supabase
        .from("tote_requests")
        .update({
          status:               "scheduled",
          scheduled_at:         startTime || new Date().toISOString(),
          pickup_scheduled_at:  startTime || new Date().toISOString(),
          calcom_booking_uid:   bookingUid,
          calcom_event_uri:     eventUri,
        })
        .eq("id", toteRequest.id);

      if (updateErr) {
        console.error("Update error:", updateErr.message);
        return json({ error: "Update failed" }, 500);
      }

      console.log(`Tote request ${toteRequest.id} → scheduled (booking: ${bookingUid})`);

      // Email student drop-off confirmation
      if (resendKey && toteRequest.student_email) {
        const firstName      = (attendeeName || toteRequest.student_name || 'there').split(' ')[0];
        const dropoffDisplay = startTime ? formatPickupTime(startTime) : 'your scheduled time';

        await sendEmail(
          resendKey,
          toteRequest.student_email,
          "Tote Drop-off Confirmed — Campus Reclaimed",
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>Your Reclaim Tote drop-off has been confirmed for <strong>${dropoffDisplay}</strong>.</p>
            <p>Our ambassador will meet you outside your residence hall at that time to deliver your tote.</p>
            <p>After this, you'll receive another email with instructions for filling it and scheduling your pick-up.</p>
            <p>If you need to cancel or reschedule, please reply to this email or contact us directly at <a href="mailto:info@campusreclaimed.com">info@campusreclaimed.com</a> and we'll take care of it for you.</p>
            <p>Thank you for choosing Campus Reclaimed!</p>
            <p>Best,<br>The Campus Reclaimed Team</p>
          `)
        );
      }

      return json({ success: true, action: "scheduled", tote_request_id: toteRequest.id });
    }

    // ── BOOKING_CANCELLED: student cancelled their booking ──
    if (triggerEvent === "BOOKING_CANCELLED") {
      const bookingUid    = booking?.uid;
      const attendeeEmail = booking?.responses?.email?.value ||
                            booking?.attendees?.[0]?.email || null;
      const attendeeName  = booking?.responses?.name?.value ||
                            booking?.attendees?.[0]?.name  || null;

      if (!bookingUid) {
        console.error("Missing bookingUid in BOOKING_CANCELLED payload");
        return json({ error: "Missing bookingUid" }, 400);
      }

      // Find by booking UID first, then fall back to email
      let toteRequest: { id: string; student_name: string; student_email: string; assigned_to: string | null; tote_delivered_at: string | null } | null = null;

      const { data: byUid } = await supabase
        .from("tote_requests")
        .select("id, student_name, student_email, assigned_to, tote_delivered_at")
        .eq("calcom_booking_uid", bookingUid)
        .maybeSingle();

      if (byUid) {
        toteRequest = byUid;
      } else if (attendeeEmail) {
        const { data: byEmail } = await supabase
          .from("tote_requests")
          .select("id, student_name, student_email, assigned_to, tote_delivered_at")
          .ilike("student_email", attendeeEmail)
          .eq("status", "scheduled")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        toteRequest = byEmail || null;
      }

      if (!toteRequest) {
        console.log(`No scheduled tote request found for booking ${bookingUid} — ignoring`);
        return json({ success: true, action: "no_match" });
      }

      // Determine if this was a drop-off or pick-up cancellation
      // tote_delivered_at is set once the tote has been physically delivered → pick-up booking
      // tote_delivered_at is null → drop-off booking
      const isPickupCancellation = !!toteRequest.tote_delivered_at;
      const revertStatus = isPickupCancellation ? "tote_out" : "pending";

      // Revert to correct prior status, clear scheduling fields
      const { error: revertErr } = await supabase
        .from("tote_requests")
        .update({
          status:             revertStatus,
          scheduled_at:       null,
          calcom_booking_uid: null,
          calcom_event_uri:   null,
        })
        .eq("id", toteRequest.id);

      if (revertErr) {
        console.error("Revert error:", revertErr.message);
        return json({ error: "Revert failed" }, 500);
      }

      console.log(`Tote request ${toteRequest.id} → reverted to ${revertStatus} (booking ${bookingUid} cancelled; isPickup: ${isPickupCancellation})`);

      // Build reschedule button using ambassador's Cal.com URL
      const rescheduleLabel = isPickupCancellation ? "Reschedule Your Tote Pick-Up" : "Reschedule Your Tote Drop-Off";
      let rescheduleBtn = '';
      if (toteRequest.assigned_to) {
        const { data: amb } = await supabase
          .from('ambassador_profiles')
          .select('calcom_url')
          .eq('id', toteRequest.assigned_to)
          .maybeSingle();
        const rawUrl = amb?.calcom_url || null;
        if (rawUrl) {
          try {
            const bookingUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
            const studentName  = attendeeName || toteRequest.student_name || '';
            const studentEmail = attendeeEmail || toteRequest.student_email || '';
            if (studentName)  bookingUrl.searchParams.set('name', studentName.trim());
            if (studentEmail) bookingUrl.searchParams.set('email', studentEmail.trim());
            rescheduleBtn = `<p style="margin-top: 20px;">
              <a href="${bookingUrl.toString()}"
                 style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                        padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                ${rescheduleLabel} →
              </a>
            </p>`;
          } catch {
            rescheduleBtn = rawUrl
              ? `<p style="margin-top:20px;"><a href="${rawUrl}" style="display:inline-block;background:#1a3c34;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">${rescheduleLabel} →</a></p>`
              : '';
          }
        }
      }

      // Email subject and body vary by cancellation type
      const cancelSubject = isPickupCancellation
        ? "Tote Pick-Up Cancelled — Please Reschedule"
        : "Tote Drop-off Cancelled — Please Reschedule";
      const cancelledWhat = isPickupCancellation ? "pick-up" : "drop-off";

      // Email student that they need to reschedule
      if (resendKey && toteRequest.student_email) {
        const firstName = (attendeeName || toteRequest.student_name || 'there').split(' ')[0];

        await sendEmail(
          resendKey,
          toteRequest.student_email,
          cancelSubject,
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>Your Reclaim Tote ${cancelledWhat} has been cancelled. No worries — you can reschedule at any time using the button below.</p>
            ${rescheduleBtn}
            <p>If you have any questions, please reply to this email and we'll be happy to help.</p>
            <p>Thank you for choosing Campus Reclaimed!</p>
            <p>Best,<br>The Campus Reclaimed Team</p>
          `)
        );
      }

      return json({ success: true, action: `reverted_to_${revertStatus}`, tote_request_id: toteRequest.id });
    }

    // Any other trigger — acknowledge and ignore
    console.log(`Unhandled Cal.com trigger: ${triggerEvent}`);
    return json({ success: true, action: "ignored" });

  } catch (err) {
    console.error("calcom-webhook error:", err);
    return json({ error: "Internal server error", details: err.message }, 500);
  }
});
