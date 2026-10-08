// supabase/functions/submit-agreement/index.ts
// Handles full server-side processing of a participation agreement submission:
//   1. Validates and uploads the PDF to Supabase Storage (agreements bucket)
//   2. Inserts record into participation_agreements
//   3. Looks up donor by email and updates participation_status
//   4. Inserts into donor_waivers so PDF appears in inventory app
//   5. Sends admin notification + submitter confirmation via Resend
//
// This is a PUBLIC endpoint (anonymous donors submit through the agreement
// page), so hardening is input-side: PDF magic-byte + size validation,
// server-generated file names, HTML-escaped email content, enum-validated
// agreement_type, and a per-email submission throttle.
//
// Expected JSON payload: { form: {...}, pdf_base64: "..." }
// (file_name is accepted for backward compatibility but ignored.)
//
// Deploy: supabase functions deploy submit-agreement --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "annaanstey@icloud.com";
const FROM_EMAIL  = "noreply@campusreclaimed.com"; // must match verified domain in Resend

const MAX_PDF_BYTES = 5_000_000;          // signed agreements are well under this
const THROTTLE_SECONDS = 60;              // min gap between submissions per email
const VALID_AGREEMENT_TYPES = ["donation", "consignment"];

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// HTML-escape user-supplied values before interpolating into email HTML.
// Without this the function is a phishing relay: attacker-controlled markup
// sent from our verified domain to an attacker-chosen recipient.
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendAdminNotification(form: Record<string, unknown>, pdfUrl: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("RESEND_API_KEY not set — skipping admin notification");
    return;
  }

  const agreementType = (form.agreement_type as string).toUpperCase();
  const fullName = esc(`${form.first_name} ${form.last_name}`.trim());

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `New ${agreementType} Agreement — ${`${form.first_name} ${form.last_name}`.trim()}`,
      html: `
        <h2>New Participation Agreement Submitted</h2>
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;color:#666">Name</td><td style="padding:6px 12px"><strong>${fullName}</strong></td></tr>
          <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${esc(form.email)}</td></tr>
          <tr><td style="padding:6px 12px;color:#666">Phone</td><td style="padding:6px 12px">${esc(form.phone) || '—'}</td></tr>
          <tr><td style="padding:6px 12px;color:#666">Type</td><td style="padding:6px 12px">${agreementType}</td></tr>
          ${form.venmo_handle ? `<tr><td style="padding:6px 12px;color:#666">Venmo</td><td style="padding:6px 12px">${esc(form.venmo_handle)}</td></tr>` : ''}
          <tr><td style="padding:6px 12px;color:#666">Submitted</td><td style="padding:6px 12px">${new Date().toLocaleString()}</td></tr>
        </table>
        <p style="margin-top:20px">
          <a href="${pdfUrl}" style="background:#1c3a2a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:3px;font-family:sans-serif">
            View Signed Agreement PDF
          </a>
        </p>
      `,
    }),
  });
}

async function sendSubmitterConfirmation(form: Record<string, unknown>, pdfUrl: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("RESEND_API_KEY not set — skipping submitter confirmation");
    return;
  }

  const agreementType = (form.agreement_type as string).toUpperCase();
  const fullName = esc(`${form.first_name} ${form.last_name}`.trim());

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: form.email as string,
      subject: "Your Campus Reclaimed Participation Agreement",
      html: `
        <div style="font-family:'Georgia',serif;max-width:560px;margin:0 auto">
          <div style="background:#1c3a2a;padding:28px;text-align:center">
            <h1 style="color:#f7f4ee;margin:0;font-size:1.5rem">Campus Reclaimed</h1>
            <p style="color:#b8935a;margin:8px 0 0;font-size:0.8rem;letter-spacing:0.1em;text-transform:uppercase">Participation Agreement Confirmed</p>
          </div>
          <div style="padding:32px;background:#fff">
            <p>Hi <strong>${fullName}</strong>,</p>
            <p>Thank you for submitting your <strong>${agreementType}</strong> participation agreement with Campus Reclaimed. A copy of your signed agreement is saved on file.</p>
            <p style="margin-top:24px">
              <a href="${pdfUrl}" style="background:#1c3a2a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:3px">
                Download Your Agreement PDF
              </a>
            </p>
            ${agreementType === 'CONSIGNMENT' ? `
            <p style="margin-top:24px;color:#555;font-size:0.9rem">
              As a reminder — you'll receive an email when items sell or one week before the 60-day consignment period ends.
              Campus Reclaimed releases funds via Venmo only.
            </p>` : ''}
            <p style="margin-top:24px;color:#999;font-size:0.8rem">
              Questions? Reach out to Campus Reclaimed directly.
            </p>
          </div>
        </div>
      `,
    }),
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { form, pdf_base64 } = await req.json();

    if (!form || !pdf_base64) {
      return jsonResponse({ error: "form and pdf_base64 are required" }, 400);
    }
    if (!form.first_name || !form.last_name || !form.email) {
      return jsonResponse({ error: "first_name, last_name, and email are required" }, 400);
    }
    if (!VALID_AGREEMENT_TYPES.includes(form.agreement_type)) {
      return jsonResponse({ error: "agreement_type must be 'donation' or 'consignment'" }, 400);
    }
    const email = String(form.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Invalid email address" }, 400);
    }

    // ── Connect with service role — bypasses all RLS ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Throttle: one submission per email per THROTTLE_SECONDS ──
    // Kills double-clicks and trivial spam without hurting real donors.
    const throttleCutoff = new Date(Date.now() - THROTTLE_SECONDS * 1000).toISOString();
    const { data: recent } = await supabase
      .from("participation_agreements")
      .select("id")
      .ilike("email", email)
      .gte("submitted_at", throttleCutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return jsonResponse({ error: "An agreement from this email was just submitted. Please wait a minute before trying again." }, 429);
    }

    // ── Decode and validate the PDF ──
    if (pdf_base64.length > MAX_PDF_BYTES * 1.4) {
      return jsonResponse({ error: "PDF too large (max 5MB)" }, 413);
    }
    const binaryString = atob(pdf_base64);
    if (binaryString.length > MAX_PDF_BYTES) {
      return jsonResponse({ error: "PDF too large (max 5MB)" }, 413);
    }
    if (!binaryString.startsWith("%PDF-")) {
      return jsonResponse({ error: "File is not a valid PDF" }, 400);
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // ── Server-generated file name (never trust client paths) ──
    const sanitize = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "donor";
    const fileName = `agreement_${sanitize(form.last_name)}_${sanitize(form.first_name)}_${Date.now()}.pdf`;

    // ── Upload PDF to storage ──
    const { error: uploadError } = await supabase.storage
      .from("agreements")
      .upload(fileName, bytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return jsonResponse({ error: "PDF upload failed", details: uploadError.message }, 500);
    }

    const { data: urlData } = supabase.storage
      .from("agreements")
      .getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    // ── Insert into participation_agreements ──
    const { error: dbErr } = await supabase
      .from("participation_agreements")
      .insert({
        first_name:       form.first_name,
        mi:               form.mi || null,
        last_name:        form.last_name,
        address:          form.address || null,
        city:             form.city || null,
        state_abbr:       form.state_abbr || null,
        zip:              form.zip || null,
        email:            email,
        phone:            form.phone || null,
        agreement_type:   form.agreement_type,
        consignment_acks: form.consignment_acks || null,
        venmo_handle:     form.venmo_handle || null,
        print_name:       form.print_name,
        signature_data:   form.signature_data || null,
        pdf_url:          pdfUrl,
        submitted_at:     new Date().toISOString(),
      });

    if (dbErr) {
      console.error("participation_agreements insert error:", dbErr);
      return jsonResponse({ error: "Database insert failed", details: dbErr.message }, 500);
    }

    console.log(`Agreement saved for ${form.first_name} ${form.last_name}`);

    // ── Link to donor record ──
    // Look up by email (case-insensitive). Non-fatal if not found.
    let donorLinked = false;
    try {
      const { data: donor } = await supabase
        .from("donors")
        .select("id")
        .ilike("donor_email", email)
        .limit(1)
        .maybeSingle();

      if (donor?.id) {
        await supabase
          .from("donors")
          .update({ participation_status: form.agreement_type })
          .eq("id", donor.id);

        await supabase
          .from("donor_waivers")
          .insert({
            donor_id:   donor.id,
            waiver_url: pdfUrl,
            signed_at:  new Date().toISOString(),
            form_data: {
              donor_name:     `${form.first_name} ${form.last_name}`.trim(),
              donor_email:    email,
              donor_phone:    form.phone || null,
              agreement_type: form.agreement_type,
            },
          });

        donorLinked = true;
        console.log(`Donor ${donor.id} linked — participation_status set to ${form.agreement_type}`);
      } else {
        console.log(`No donor found for email ${email} — agreement saved without donor link`);
      }
    } catch (linkErr) {
      console.warn("Donor link failed (non-fatal):", linkErr);
    }

    // ── Send emails (non-fatal if email service not configured) ──
    try {
      await Promise.all([
        sendAdminNotification(form, pdfUrl),
        sendSubmitterConfirmation(form, pdfUrl),
      ]);
    } catch (emailErr) {
      console.warn("Email send failed (non-fatal):", emailErr);
    }

    return jsonResponse({
      success:      true,
      pdf_url:      pdfUrl,
      donor_linked: donorLinked,
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Internal server error", details: err.message }, 500);
  }
});
