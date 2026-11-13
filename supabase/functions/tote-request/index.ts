// supabase/functions/tote-request/index.ts
// Multi-action handler for the tote pickup workflow.
//
// Actions:
//   (none)                   → new tote request: create donor, assign ambassador, send Emails 1 + admin + ambassador
//   send_delivery_reminder   → Email 2: tote just delivered
//   send_pickup_schedule     → Email 3: pickup day/time window (ambassador enters)
//   send_pickup_confirmation → Email 5 (donation) or 6 (consignment): tote was picked up
//
// Stage 5: Student confirmation email (Email 1) now includes a "Book your pickup time →"
//          button linking to the assigned ambassador's Cal.com URL (if set).
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
        .select('assigned_to')
        .ilike('student_email', email.trim())
        .in('status', ['tote_out', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (toteReq?.assigned_to) {
        const { data: amb } = await supabase
          .from('ambassador_profiles')
          .select('calcom_url')
          .eq('id', toteReq.assigned_to)
          .maybeSingle();

        const rawUrl = amb?.calcom_url || null;
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

      if (resendKey) {
        const firstName = name.split(' ')[0];
        await sendEmail(resendKey, email, "Reclaim Tote Delivery",
          emailWrap(`
            <p>Hi ${firstName},</p>
            <p>Your Reclaim Tote was just delivered to the address you provided. Please fill the tote and complete the agreement, if you haven't already, using this link: <a href="${AGREEMENT_URL}" style="color: #1a3c34;">${AGREEMENT_URL}</a>.</p>
            <p>Once your tote is filled and ready, use the link below to schedule a pickup time with your Campus Reclaimed ambassador.</p>
            ${calcomButton}
            <p>Please let us know if you have any questions. Thank you again for choosing Campus Reclaimed.</p>
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
            <p>Please place your Reclaim Tote outside your door, and our team will pick it up tomorrow, ${pickup_window}.</p>
            <p>Kindly reply to this email to confirm that your tote will be outside during that window.</p>
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
        .select("assigned_to")
        .in("status", ["pending", "in_progress"])
        .in("assigned_to", allAmbs.map(a => a.id));

      const loadMap: Record<string, number> = {};
      allAmbs.forEach(a => { loadMap[a.id] = 0; });
      (openRequests || []).forEach(r => {
        if (r.assigned_to && loadMap[r.assigned_to] !== undefined) loadMap[r.assigned_to]++;
      });

      const leastLoaded = allAmbs.reduce((best, amb) =>
        (loadMap[amb.id] ?? 0) < (loadMap[best.id] ?? 0) ? amb : best
      );

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
          <p>Thank you for your support of Campus Reclaimed and requesting a Reclaim Tote.</p>
          <p>Your Reclaim Tote will be delivered in the next 24-48 hours to the address you provided. Please fill out our agreement: <a href="${AGREEMENT_URL}" style="color: #1a3c34;">${AGREEMENT_URL}</a>. These instructions indicate whether you are selling items on consignment or donating them.</p>
          ${dropoffCalcomButton}
          <p>Once your tote is filled, you will receive a separate email with a link to schedule a convenient pickup time.</p>
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
