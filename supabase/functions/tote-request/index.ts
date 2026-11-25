// supabase/functions/tote-request/index.ts
// Multi-action handler for the tote pickup workflow.
//
// Actions:
//   (none)                   → new tote request: create donor, assign ambassador, send Emails 1 + admin + ambassador
//   send_delivery_reminder   → Email 2: tote just delivered; stamps tote_delivered_at for drip tracking
//   send_pickup_schedule     → legacy Email 3: pickup day/time window (ambassador enters)
//   send_pickup_confirmation → Email 4 (donation) or 5 (consignment): tote was picked up
//   send_pickup_reminders    → Email 3 (batch): 2-hour-before-pickup reminder; called by pg_cron every 15 min
//   send_followup_nudges     → Nudge emails at day 3/7/14 for un-scheduled totes; called by pg_cron daily
//
// Deploy: supabase functions deploy tote-request --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

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

// ── Email sender ──────────────────────────────────────────────
async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Campus Reclaimed <info@campusreclaimed.com>", to, subject, html }),
  });
  if (!res.ok) console.error(`Email to ${to} failed:`, await res.text());
  return res.ok;
}

const AGREEMENT_URL = "https://www.campusreclaimed.com/pages/agreement";
const ADMIN_EMAIL   = "info@campusreclaimed.com";

// ── Shared email wrapper ──────────────────────────────────────
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase  = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const body = await req.json();
    const { action } = body;

    // ════════════════════════════════════════════════════════
    // ACTION: send_delivery_reminder  (Email 2)
    // Called by App.jsx when ambassador marks tote delivered
    // ════════════════════════════════════════════════════════
    if (action === 'send_delivery_reminder') {
      const { email, name } = body;
      if (!email || !name) return json({ error: "email and name required" }, 400);

      // Look up the assigned ambassador's Cal.com URL so we can include the booking link
      let calcomButton = '';
      const { data: toteReq } = await supabase
        .from('tote_requests')
        .select('id, assigned_to')
        .ilike('student_email', email.trim())
        .in('status', ['tote_out', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (toteReq?.assigned_to) {
        const { data: amb } = await supabase
          .from('ambassador_profiles')
          .select('calcom_url, calcom_pickup_url')
          .eq('id', toteReq.assigned_to)
          .maybeSingle();

        const rawUrl = amb?.calcom_pickup_url || amb?.calcom_url || null;
        if (rawUrl) {
          try {
            const bookingUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
            bookingUrl.searchParams.set('name', name.trim());
            bookingUrl.searchParams.set('email', email.trim());
            calcomButton = `<p style="margin-top: 20px;">
              <a href="${bookingUrl.toString()}"
                 style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                        padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                Schedule your tote pickup →
              </a>
            </p>
            <p style="font-size: 13px; color: #888; margin-top: 8px;">
              Use this link to choose a convenient time for our ambassador to come pick up your filled tote.
            </p>`;
          } catch (e) {
            console.error('Failed to build Cal.com URL for delivery reminder:', e);
            calcomButton = `<p style="margin-top: 20px;">
              <a href="${rawUrl}"
                 style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                        padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                Schedule your tote pickup →
              </a>
            </p>`;
          }
        }
      }

      // Stamp tote_delivered_at so the drip nudge jobs can track elapsed time
      if (toteReq?.id) {
        await supabase.from('tote_requests').update({ tote_delivered_at: new Date().toISOString() }).eq('id', toteReq.id);
      }

      if (resendKey) {
        const firstName = name.split(' ')[0];
        await sendEmail(resendKey, email, "Reclaim Tote Delivery",
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>We hope you're enjoying your Reclaim Tote! Once you've gathered the items you'd like to donate or sell on consignment, it's time to schedule your pick-up.</p>
            <p><strong>What goes in your Tote?</strong></p>
            <ul style="margin: 8px 0 16px 0; padding-left: 24px;">
              <li style="margin-bottom: 8px;">Please place smaller items, such as clothing and small decor, inside your Reclaim Tote.</li>
              <li style="margin-bottom: 8px;">Larger items, such as headboards, ottomans, and nightstands, are also accepted! Please bring these items outside your residence hall to meet our team at your scheduled pick-up time.</li>
            </ul>
            <p>For more information about what we accept, please visit our <a href="https://www.campusreclaimed.com/pages/sell" style="color: #1a3c34;">Sell Your Items page</a>.</p>
            <p><strong>Schedule Your Tote Pick-Up:</strong></p>
            ${calcomButton}
            <p>Please use the calendar link above to select a date and time that works best for you. Our team will meet you outside your residence hall to collect your filled Tote and any larger items. The meeting should only take a couple of minutes!</p>
            <p>If you haven't already, please complete our Participation Agreement here: <a href="${AGREEMENT_URL}" style="color: #1a3c34;">${AGREEMENT_URL}</a>. The agreement explains the difference between donating your items and selling them on consignment.</p>
            <p>Thank you again for choosing Campus Reclaimed and helping give college items a second life. It means more when it's reclaimed!</p>
            <p>Best,<br>The Campus Reclaimed Team</p>
          `)
        );
      }
      return json({ success: true });
    }

    // ════════════════════════════════════════════════════════
    // ACTION: send_pickup_schedule  (Email 3)
    // Called by App.jsx when ambassador enters pickup window
    // ════════════════════════════════════════════════════════
    if (action === 'send_pickup_schedule') {
      const { tote_request_id, pickup_window } = body;
      if (!tote_request_id || !pickup_window) return json({ error: "tote_request_id and pickup_window required" }, 400);

      const { data: request, error: reqErr } = await supabase
        .from("tote_requests")
        .select("student_name, student_email")
        .eq("id", tote_request_id)
        .single();
      if (reqErr || !request) return json({ error: "Tote request not found" }, 404);

      if (resendKey) {
        const firstName = request.student_name.split(' ')[0];
        await sendEmail(resendKey, request.student_email, "Reclaim Tote Pick-Up",
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>This is a reminder that your Reclaim Tote pick-up is scheduled for tomorrow, ${pickup_window}. Our team member will meet you outside your residence hall to collect your filled Tote and any larger items you'd like to donate or sell.</p>
            <p>Kindly reply to this email to confirm that you'll be available during that window.</p>
            <p>Thank you for choosing Campus Reclaimed. Let us know if you have any questions.</p>
            <p>Best,<br>The Campus Reclaimed Team</p>
          `)
        );
      }

      // Save pickup window + timestamp
      await supabase.from("tote_requests").update({
        pickup_window,
        pickup_scheduled_at: new Date().toISOString(),
      }).eq("id", tote_request_id);

      return json({ success: true });
    }

    // ════════════════════════════════════════════════════════
    // ACTION: send_pickup_confirmation  (Email 5 or 6)
    // Called by App.jsx when ambassador marks tote picked up
    // ════════════════════════════════════════════════════════
    if (action === 'send_pickup_confirmation') {
      const { tote_request_id } = body;
      if (!tote_request_id) return json({ error: "tote_request_id required" }, 400);

      const { data: request, error: reqErr } = await supabase
        .from("tote_requests")
        .select("student_name, student_email")
        .eq("id", tote_request_id)
        .single();
      if (reqErr || !request) return json({ error: "Tote request not found" }, 404);

      // Determine donation vs consignment by checking participation_agreements
      const { data: agreement } = await supabase
        .from("participation_agreements")
        .select("agreement_type")
        .ilike("email", request.student_email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isConsignment = agreement?.agreement_type === 'consignment';
      const firstName = request.student_name.split(' ')[0];

      if (resendKey) {
        if (isConsignment) {
          // Email 6: Consignment
          await sendEmail(resendKey, request.student_email, "Your Tote Was Received",
            emailWrap(`
              <p>Hi ${firstName},</p>
              <p>Your Reclaim Tote was picked up, and our team is reviewing your items for consignment. If your items sell, we will contact you. If you haven't already, please complete our Participation Agreement to receive funds if your items sell: <a href="${AGREEMENT_URL}" style="color: #1a3c34;">${AGREEMENT_URL}</a></p>
              <p>Thank you for choosing Campus Reclaimed! We look forward to listing your items soon. Your items help reduce waste and make our university more sustainable. We can't wait to work with you again soon.</p>
              <p>Best,<br>The Campus Reclaimed Team</p>
            `)
          );
        } else {
          // Email 5: Donation
          await sendEmail(resendKey, request.student_email, "Your Tote Was Received",
            emailWrap(`
              <p>Hi ${firstName},</p>
              <p>Your Reclaim Tote was picked up, and our team is processing your items now.</p>
              <p>Thank you for choosing Campus Reclaimed! Your donation helps reduce waste and makes our university more sustainable. We can't wait to work with you again soon.</p>
              <p>Best,<br>The Campus Reclaimed Team</p>
            `)
          );
        }
      }

      return json({ success: true, agreement_type: isConsignment ? 'consignment' : 'donation' });
    }

    // ════════════════════════════════════════════════════════
    // ACTION: send_pickup_reminders  (Email 3 — batch)
    // Called by pg_cron every 15 min — sends 2-hour-before reminder
    // ════════════════════════════════════════════════════════
    if (action === 'send_pickup_reminders') {
      const now = new Date();
      const windowStart = new Date(now.getTime() + (2 * 60 - 15) * 60 * 1000).toISOString();
      const windowEnd   = new Date(now.getTime() + (2 * 60 + 15) * 60 * 1000).toISOString();

      const { data: eligible } = await supabase
        .from('tote_requests')
        .select('id, student_name, student_email, scheduled_at, assigned_to')
        .eq('status', 'scheduled')
        .eq('reminder_2hr_sent', false)
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd);

      let sent = 0;
      for (const req of eligible || []) {
        // Get ambassador name
        let ambFirstName = 'your Campus Reclaimed team member';
        if (req.assigned_to) {
          const { data: amb } = await supabase.from('ambassador_profiles').select('full_name').eq('id', req.assigned_to).maybeSingle();
          if (amb?.full_name) ambFirstName = amb.full_name.split(' ')[0];
        }

        if (resendKey) {
          const firstName = req.student_name.split(' ')[0];
          await sendEmail(resendKey, req.student_email, "Reminder: Your Tote Pickup Is Today",
            emailWrap(`
              <p>Hi ${firstName},</p>
              <p>This is a friendly reminder that your Reclaim Tote pick-up is scheduled in approximately 2 hours!</p>
              <p>Your team member, <strong>${ambFirstName}</strong>, will meet you outside your residence hall at your scheduled time to collect your filled Tote and any larger items you'd like to donate or sell.</p>
              <p>Please make sure your Tote is filled and that any additional items are ready to bring outside when you meet our team.</p>
              <p>If you need to reschedule, please reply to this email as soon as possible so we can find another time that works for you.</p>
              <p>Thank you again for choosing Campus Reclaimed!</p>
              <p>Best,<br>The Campus Reclaimed Team</p>
            `)
          );
        }

        await supabase.from('tote_requests').update({ reminder_2hr_sent: true }).eq('id', req.id);
        sent++;
      }

      return json({ success: true, sent });
    }

    // ════════════════════════════════════════════════════════
    // ACTION: send_followup_nudges  (Nudge emails — batch)
    // Called by pg_cron daily — sends nudge at day 3, 7, 14
    // after tote delivery if student hasn't scheduled yet
    // ════════════════════════════════════════════════════════
    if (action === 'send_followup_nudges') {
      const now = new Date();
      const day3  = new Date(now.getTime() - 3  * 24 * 60 * 60 * 1000).toISOString();
      const day7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
      const day14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // All totes delivered but not yet scheduled, with <3 nudges sent
      const { data: eligible } = await supabase
        .from('tote_requests')
        .select('id, student_name, student_email, tote_delivered_at, followup_count, assigned_to')
        .eq('status', 'tote_out')
        .is('scheduled_at', null)
        .not('tote_delivered_at', 'is', null)
        .lt('followup_count', 3);

      // Helper: build a Cal.com pickup button for a given ambassador id + student
      async function buildNudgeButton(assignedTo: string | null, studentName: string, studentEmail: string): Promise<string> {
        if (!assignedTo) return '';
        const { data: amb } = await supabase.from('ambassador_profiles').select('calcom_url, calcom_pickup_url').eq('id', assignedTo).maybeSingle();
        const rawUrl = amb?.calcom_pickup_url || amb?.calcom_url || null;
        if (!rawUrl) return '';
        try {
          const bookingUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
          bookingUrl.searchParams.set('name', studentName.trim());
          bookingUrl.searchParams.set('email', studentEmail.trim());
          return `<p style="margin-top: 20px;">
            <a href="${bookingUrl.toString()}"
               style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                      padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
              Schedule Your Tote Pick-Up →
            </a>
          </p>`;
        } catch { return rawUrl ? `<p style="margin-top:20px;"><a href="${rawUrl}" style="display:inline-block;background:#1a3c34;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">Schedule Your Tote Pick-Up →</a></p>` : ''; }
      }

      let sent = 0;
      for (const req of eligible || []) {
        const deliveredAt = new Date(req.tote_delivered_at);
        const count = req.followup_count ?? 0;

        // Determine which nudge to send based on days elapsed
        let nudgeNum = 0;
        if      (count === 0 && deliveredAt <= new Date(day3))  nudgeNum = 1;
        else if (count === 1 && deliveredAt <= new Date(day7))  nudgeNum = 2;
        else if (count === 2 && deliveredAt <= new Date(day14)) nudgeNum = 3;
        if (nudgeNum === 0) continue;

        const firstName = req.student_name.split(' ')[0];
        const calcomBtn = await buildNudgeButton(req.assigned_to, req.student_name, req.student_email);

        if (resendKey) {
          if (nudgeNum === 1) {
            await sendEmail(resendKey, req.student_email, "Don't forget — Schedule Your Reclaim Tote Pick-Up",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>Just a friendly reminder that your Reclaim Tote is waiting to be picked up! Once you've filled it with the items you'd like to donate or sell, use the link below to schedule a convenient pick-up time.</p>
                ${calcomBtn}
                <p>It only takes a couple of minutes — our ambassador will meet you outside your residence hall.</p>
                <p>Thank you for choosing Campus Reclaimed. It means more when it's reclaimed!</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          } else if (nudgeNum === 2) {
            await sendEmail(resendKey, req.student_email, "Your Reclaim Tote is still waiting for you!",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>We noticed you haven't scheduled your Reclaim Tote pick-up yet — no worries, there's still time!</p>
                <p>Your filled Tote (and any larger items you'd like to donate or sell) are just a quick pick-up away from finding a second life on campus.</p>
                ${calcomBtn}
                <p>Questions? Just reply to this email and we'll help.</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          } else {
            await sendEmail(resendKey, req.student_email, "Last reminder — Your Reclaim Tote Pick-Up",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>This is our final reminder about your Reclaim Tote pick-up. We'd love to collect your items and help give them a second life — but we don't want to keep nudging you if the timing isn't right.</p>
                <p>If you're still interested, please use the link below to schedule a pick-up. If you'd prefer to opt out, simply reply to this email and let us know.</p>
                ${calcomBtn}
                <p>Thank you for supporting Campus Reclaimed!</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          }
        }

        await supabase.from('tote_requests').update({
          followup_count: count + 1,
          last_followup_at: now.toISOString(),
        }).eq('id', req.id);
        sent++;
      }

      return json({ success: true, sent });
    }

    // ════════════════════════════════════════════════════════
    // ACTION: send_dropoff_nudges  (Drop-off nudge emails — batch)
    // Called by pg_cron daily — sends nudge at day 3, 7, 14
    // after tote request if student hasn't booked drop-off yet
    // ════════════════════════════════════════════════════════
    if (action === 'send_dropoff_nudges') {
      const now = new Date();
      const day3  = new Date(now.getTime() - 3  * 24 * 60 * 60 * 1000).toISOString();
      const day7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
      const day14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // All pending totes with no drop-off booked yet, with <3 nudges sent
      const { data: eligible } = await supabase
        .from('tote_requests')
        .select('id, student_name, student_email, created_at, dropoff_followup_count, assigned_to')
        .eq('status', 'pending')
        .is('calcom_booking_uid', null)
        .lt('dropoff_followup_count', 3);

      // Helper: build a Cal.com drop-off button for a given ambassador id + student
      async function buildDropoffButton(assignedTo: string | null, studentName: string, studentEmail: string): Promise<string> {
        if (!assignedTo) return '';
        const { data: amb } = await supabase.from('ambassador_profiles').select('calcom_url').eq('id', assignedTo).maybeSingle();
        const rawUrl = amb?.calcom_url || null;
        if (!rawUrl) return '';
        try {
          const bookingUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
          bookingUrl.searchParams.set('name', studentName.trim());
          bookingUrl.searchParams.set('email', studentEmail.trim());
          return `<p style="margin-top: 20px;">
            <a href="${bookingUrl.toString()}"
               style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                      padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
              Schedule Your Tote Drop-Off →
            </a>
          </p>`;
        } catch { return rawUrl ? `<p style="margin-top:20px;"><a href="${rawUrl}" style="display:inline-block;background:#1a3c34;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;">Schedule Your Tote Drop-Off →</a></p>` : ''; }
      }

      let sent = 0;
      for (const req of eligible || []) {
        const createdAt = new Date(req.created_at);
        const count = req.dropoff_followup_count ?? 0;

        let nudgeNum = 0;
        if      (count === 0 && createdAt <= new Date(day3))  nudgeNum = 1;
        else if (count === 1 && createdAt <= new Date(day7))  nudgeNum = 2;
        else if (count === 2 && createdAt <= new Date(day14)) nudgeNum = 3;
        if (nudgeNum === 0) continue;

        const firstName = req.student_name.split(' ')[0];
        const calcomBtn = await buildDropoffButton(req.assigned_to, req.student_name, req.student_email);

        if (resendKey) {
          if (nudgeNum === 1) {
            await sendEmail(resendKey, req.student_email, "Don't forget — Schedule Your Reclaim Tote Drop-Off",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>Just a friendly reminder that your Reclaim Tote is ready to be delivered! Use the link below to schedule a convenient drop-off time and we'll bring it right to your residence hall.</p>
                ${calcomBtn}
                <p>It only takes a couple of minutes — our ambassador will meet you outside your door.</p>
                <p>Thank you for choosing Campus Reclaimed. It means more when it's reclaimed!</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          } else if (nudgeNum === 2) {
            await sendEmail(resendKey, req.student_email, "Your Reclaim Tote is waiting to be delivered!",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>We noticed you haven't scheduled your Reclaim Tote drop-off yet — no worries, there's still time!</p>
                <p>Use the link below to pick a time and we'll deliver your tote right to your residence hall.</p>
                ${calcomBtn}
                <p>Questions? Just reply to this email and we'll help.</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          } else {
            await sendEmail(resendKey, req.student_email, "Last reminder — Your Reclaim Tote Drop-Off",
              emailWrap(`
                <p>Hi ${firstName},</p>
                <p>This is our final reminder about your Reclaim Tote drop-off. We'd love to get your tote to you — but we don't want to keep nudging you if the timing isn't right.</p>
                <p>If you're still interested, please use the link below to schedule a drop-off. If you'd prefer to cancel, simply reply to this email and let us know.</p>
                ${calcomBtn}
                <p>Thank you for supporting Campus Reclaimed!</p>
                <p>Best,<br>The Campus Reclaimed Team</p>
              `)
            );
          }
        }

        await supabase.from('tote_requests').update({
          dropoff_followup_count: count + 1,
          last_followup_at: now.toISOString(),
        }).eq('id', req.id);
        sent++;
      }

      return json({ success: true, sent });
    }

    // ════════════════════════════════════════════════════════
    // DEFAULT: new tote request  (Email 1 + admin + ambassador)
    // ════════════════════════════════════════════════════════
    const { name, email, phone, address, venmo, item_types } = body;

    if (!name || !email || !phone || !address) {
      return json({ error: "Name, email, phone and address are required" }, 400);
    }

    // ── Find or create donor ──────────────────────────────────
    let donorId: string | null = null;
    const { data: existing } = await supabase
      .from("donors")
      .select("id")
      .ilike("donor_email", email.trim())
      .maybeSingle();

    if (existing) {
      donorId = existing.id;
    } else {
      const { data: newDonor, error: donorErr } = await supabase
        .from("donors")
        .insert({
          donor_name:   name.trim(),
          donor_email:  email.trim().toLowerCase(),
          phone_number: phone.trim(),
          address:      address.trim(),
        })
        .select("id")
        .single();
      if (donorErr) throw new Error(`Failed to create donor: ${donorErr.message}`);
      donorId = newDonor.id;
    }

    // ── Assign to least-loaded active ambassador ──────────────
    const { data: allAmbs } = await supabase
      .from("ambassador_profiles")
      .select("id, full_name, email, calcom_url")
      .eq("active", true);

    let assignedTo:  string | null = null;
    let ambName    = "an ambassador";
    let ambEmail:  string | null = null;
    let ambCalcomUrl: string | null = null;

    if (allAmbs && allAmbs.length > 0) {
      const { data: openRequests } = await supabase
        .from("tote_requests")
        .select("assigned_to, requested_at")
        .in("status", ["pending", "in_progress"])
        .in("assigned_to", allAmbs.map(a => a.id));

      const loadMap: Record<string, number> = {};
      const lastRequestMap: Record<string, string> = {};
      allAmbs.forEach(a => { loadMap[a.id] = 0; });
      (openRequests || []).forEach(r => {
        if (r.assigned_to && loadMap[r.assigned_to] !== undefined) {
          loadMap[r.assigned_to]++;
          // Track the most recent open-request timestamp per ambassador
          if (!lastRequestMap[r.assigned_to] || r.requested_at > lastRequestMap[r.assigned_to]) {
            lastRequestMap[r.assigned_to] = r.requested_at;
          }
        }
      });

      // On a load tie, prefer the ambassador whose most recent open request is oldest
      // (i.e., who has been waiting longest for a new assignment)
      const leastLoaded = allAmbs.reduce((best, amb) => {
        const ambLoad = loadMap[amb.id] ?? 0;
        const bestLoad = loadMap[best.id] ?? 0;
        if (ambLoad < bestLoad) return amb;
        if (ambLoad > bestLoad) return best;
        // Tie-break: oldest most-recent-request timestamp wins (no request at all beats any timestamp)
        const ambLast = lastRequestMap[amb.id] ?? '';
        const bestLast = lastRequestMap[best.id] ?? '';
        return ambLast < bestLast ? amb : best;
      });

      assignedTo    = leastLoaded.id;
      ambName       = leastLoaded.full_name;
      ambEmail      = leastLoaded.email || null;
      ambCalcomUrl  = leastLoaded.calcom_url || null;
    }

    // ── Create tote request ───────────────────────────────────
    const { data: request, error: reqErr } = await supabase
      .from("tote_requests")
      .insert({
        donor_id:        donorId,
        student_name:    name.trim(),
        student_email:   email.trim().toLowerCase(),
        student_phone:   phone.trim(),
        student_address: address.trim(),
        venmo_handle:    venmo?.trim() || null,
        item_types:      item_types?.trim() || null,
        status:          "pending",
        assigned_to:     assignedTo,
      })
      .select("id")
      .single();

    if (reqErr) throw new Error(`Failed to create tote request: ${reqErr.message}`);
    const toteNumber = request.id.slice(0, 8).toUpperCase();
    console.log(`Created tote request: ${toteNumber} → assigned to ${ambName}`);

    // ── Send emails ───────────────────────────────────────────
    if (resendKey) {
      const firstName = name.split(' ')[0];

      // Email 1: Student confirmation — Cal.com drop-off scheduling button
      let dropoffCalcomButton = '';
      if (ambCalcomUrl) {
        try {
          const bookingUrl = new URL(ambCalcomUrl.startsWith('http') ? ambCalcomUrl : `https://${ambCalcomUrl}`);
          bookingUrl.searchParams.set('name', name.trim());
          bookingUrl.searchParams.set('email', email.trim());
          dropoffCalcomButton = `<p style="margin-top: 20px;">
            <a href="${bookingUrl.toString()}"
               style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                      padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
              Schedule your tote drop-off →
            </a>
          </p>
          <p style="font-size: 13px; color: #888; margin-top: 8px;">
            Use this link to schedule a convenient time for your ambassador to drop off your tote.
          </p>`;
        } catch (e) {
          console.error('Failed to build Cal.com drop-off URL:', e);
          dropoffCalcomButton = `<p style="margin-top: 20px;">
            <a href="${ambCalcomUrl}"
               style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                      padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
              Schedule your tote drop-off →
            </a>
          </p>`;
        }
      }

      await sendEmail(resendKey, email.trim(), "Campus Reclaimed – Reclaim Tote Request",
        emailWrap(`
          <p>Hi ${firstName},</p>
          <p>Thank you for your support of Campus Reclaimed and requesting a Reclaim Tote. We're excited to help give your college items a second life. The next step is to schedule your Tote drop-off!</p>
          <p>Please use the calendar link below to select a date and time that works best for you. We will meet you outside your residence hall to drop off your Tote. The meeting should only take a couple of minutes!</p>
          ${dropoffCalcomButton}
          <p>A few days after your Tote is delivered, you will receive another email with instructions for filling it and scheduling your Tote pick-up. We will also meet you outside your residence hall for pick-up.</p>
          <p>Please don't forget to complete our Participation Agreement here: <a href="${AGREEMENT_URL}" style="color: #1a3c34;">${AGREEMENT_URL}</a>. These instructions indicate whether you are selling items on consignment or donating them.</p>
          <p>Thank you again for choosing Campus Reclaimed. It means more when it is reclaimed!</p>
          <p>Best,<br>The Campus Reclaimed Team</p>
        `)
      );

      // Admin notification (info@campusreclaimed.com only)
      await sendEmail(resendKey, ADMIN_EMAIL, `New Tote Request — ${name} (${toteNumber})`,
        `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a3c34;">New Tote Request</h2>
          <table style="width:100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #888; width: 140px;">Tote #</td><td style="padding: 6px 0;"><strong>${toteNumber}</strong></td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Name</td><td style="padding: 6px 0;"><strong>${name}</strong></td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Email</td><td style="padding: 6px 0;">${email}</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Phone</td><td style="padding: 6px 0;">${phone}</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Address</td><td style="padding: 6px 0;">${address}</td></tr>
            ${venmo ? `<tr><td style="padding: 6px 0; color: #888;">Venmo</td><td style="padding: 6px 0;">${venmo}</td></tr>` : ''}
            ${item_types ? `<tr><td style="padding: 6px 0; color: #888;">Items</td><td style="padding: 6px 0;">${item_types}</td></tr>` : ''}
            <tr><td style="padding: 6px 0; color: #888;">Assigned to</td><td style="padding: 6px 0;">${ambName}</td></tr>
          </table>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">Requested at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
        </div>`
      );

      // Ambassador notification
      if (ambEmail) {
        await sendEmail(resendKey, ambEmail, `New Tote to Deliver — ${name} (${toteNumber})`,
          `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a3c34;">New Tote Delivery Task</h2>
            <p>Hi ${ambName.split(' ')[0]}, you have a new tote to deliver within <strong>24–48 hours</strong>.</p>
            <table style="width:100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #888; width: 140px;">Tote #</td><td style="padding: 6px 0;"><strong>${toteNumber}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Student</td><td style="padding: 6px 0;"><strong>${name}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Phone</td><td style="padding: 6px 0;">${phone}</td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Deliver to</td><td style="padding: 6px 0;">${address}</td></tr>
              ${item_types ? `<tr><td style="padding: 6px 0; color: #888;">Items</td><td style="padding: 6px 0;">${item_types}</td></tr>` : ''}
            </table>
            <p style="color: #555; margin-top: 16px;">Please deliver the tote bag to the student's address and mark it delivered in the Campus Reclaimed inventory app.</p>
          </div>`
        );
      }
    }

    return json({ success: true, request_id: request.id, tote_number: toteNumber, assigned_to: ambName });

  } catch (err) {
    console.error("tote-request error:", err);
    return json({ error: "Internal server error", details: err.message }, 500);
  }
});
