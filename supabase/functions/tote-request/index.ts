// supabase/functions/tote-request/index.ts
// Handles tote bag pickup requests from the campusreclaimed.com website.
// 1. Finds or creates the donor record
// 2. Assigns to the first active ambassador
// 3. Creates a tote_request record
// 4. Sends confirmation email to student (with agreement link)
// 5. Sends notification to admin
// 6. Sends notification to assigned ambassador
//
// Deploy: supabase functions deploy tote-request --no-verify-jwt

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

const AGREEMENT_URL = "https://92mauwn4py.us-east-1.awsapprunner.com/agreement";
const ADMIN_EMAIL   = "info@campusreclaimed.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase   = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey  = Deno.env.get("RESEND_API_KEY");

    // ── Parse and validate ────────────────────────────────────
    const body = await req.json();
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
      console.log(`Found existing donor: ${donorId}`);
    } else {
      const { data: newDonor, error: donorErr } = await supabase
        .from("donors")
        .insert({
          donor_name:  name.trim(),
          donor_email: email.trim().toLowerCase(),
          phone_number: phone.trim(),
          address:     address.trim(),
        })
        .select("id")
        .single();
      if (donorErr) throw new Error(`Failed to create donor: ${donorErr.message}`);
      donorId = newDonor.id;
      console.log(`Created new donor: ${donorId}`);
    }

    // ── Assign to first active ambassador ─────────────────────
    const { data: firstAmb } = await supabase
      .from("ambassador_profiles")
      .select("id, full_name, email")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const assignedTo  = firstAmb?.id   || null;
    const ambName     = firstAmb?.full_name || "an ambassador";
    const ambEmail    = firstAmb?.email || null;

    // ── Create tote request ───────────────────────────────────
    const { data: request, error: reqErr } = await supabase
      .from("tote_requests")
      .insert({
        donor_id:       donorId,
        student_name:   name.trim(),
        student_email:  email.trim().toLowerCase(),
        student_phone:  phone.trim(),
        student_address: address.trim(),
        venmo_handle:   venmo?.trim() || null,
        item_types:     item_types?.trim() || null,
        status:         "pending",
        assigned_to:    assignedTo,
      })
      .select("id, tote_number")
      .single();

    if (reqErr) throw new Error(`Failed to create tote request: ${reqErr.message}`);
    const toteNumber = request.tote_number || request.id.slice(0, 8).toUpperCase();
    console.log(`Created tote request: ${toteNumber} (${request.id}) → assigned to ${ambName}`);

    // ── Send emails ───────────────────────────────────────────
    if (resendKey) {

      // 1. Student confirmation
      await sendEmail(resendKey, email.trim(), "Your Campus Reclaimed Tote is on the way!",
        `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #faf7f2;">
          <div style="background: #1a3c34; color: #fff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin:0; font-size: 22px; font-weight: 400;">Campus <em>Reclaimed</em></h1>
          </div>
          <div style="background: #fff; padding: 28px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e4e0da;">
            <p style="color: #1a1a1a;">Hi ${name.split(' ')[0]},</p>
            <p>Great news — your tote request has been confirmed! A Campus Reclaimed ambassador will drop off your tote within <strong>24–48 hours</strong>.</p>
            <div style="background: #f0f8f4; border-left: 4px solid #2a5a4a; padding: 14px 18px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0 0 8px; font-weight: 600; color: #1a3c34;">Your request details</p>
              <p style="margin: 2px 0; color: #555; font-size: 14px;"><strong>Tote #:</strong> ${toteNumber}</p>
              <p style="margin: 2px 0; color: #555; font-size: 14px;">📍 ${address}</p>
              ${item_types ? `<p style="margin: 2px 0; color: #555; font-size: 14px;">👕 ${item_types}</p>` : ''}
            </div>
            <p>While you wait, please complete your <strong>Participation Agreement</strong> — this is required before we can process and sell your items:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${AGREEMENT_URL}" style="background: #1a3c34; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Complete Participation Agreement →
              </a>
            </div>
            <p style="color: #555;">Once your tote is returned and items are processed, you'll receive a confirmation email from us with details on what was accepted.</p>
            <p style="font-size: 13px; color: #888;">Questions? Reply to this email or reach us at ${ADMIN_EMAIL}.</p>
            <p style="color: #555;">— The Campus Reclaimed Team</p>
          </div>
        </div>`
      );

      // 2. Admin notification
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

      // 3. Ambassador notification
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
            <p style="color: #555; margin-top: 16px;">Please deliver the tote bag to the student's address and confirm delivery in the Campus Reclaimed inventory app.</p>
            <p style="color: #555;">Once the student has filled their tote and you've retrieved it, log in to the inventory app to update the status.</p>
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
