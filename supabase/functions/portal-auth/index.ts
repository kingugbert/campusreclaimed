// supabase/functions/portal-auth/index.ts
// Step 1 of magic-link auth for the consignor portal.
// Accepts POST { email }, creates a one-time token in portal_sessions,
// and emails a sign-in link via Resend.
//
// Deploy: supabase functions deploy portal-auth --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// Generate a cryptographically secure hex token
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let email: string;
  try {
    const body = await req.json();
    email = (body.email || "").trim().toLowerCase();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (!email) return json({ error: "Email is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify a donor exists for this email before sending anything
  const { data: donorRows } = await supabase
    .from("donors")
    .select("id")
    .ilike("donor_email", email)
    .limit(1);

  // Always return the same success message whether donor exists or not
  // (prevents email enumeration). We only skip sending if donor not found.
  const donorExists = donorRows && donorRows.length > 0;

  if (donorExists) {
    // Throttle: at most one token per email per 60 seconds
    const recentCutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentToken } = await supabase
      .from("portal_sessions")
      .select("id")
      .ilike("donor_email", email)
      .gte("created_at", recentCutoff)
      .limit(1)
      .maybeSingle();

    if (!recentToken) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

      await supabase.from("portal_sessions").insert({
        token,
        donor_email: email,
        expires_at: expiresAt,
      });

      // Send magic link email via Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const portalUrl = Deno.env.get("PORTAL_URL") || "https://92mauwn4py.us-east-1.awsapprunner.com";
      const magicLink = `${portalUrl}/donor?token=${token}`;

      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Campus Reclaimed <noreply@campusreclaimed.com>",
            to: [email],
            subject: "Your Campus Reclaimed Sign-In Link",
            html: `
              <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
                <div style="background:#1a3c34;padding:20px 24px;border-radius:8px 8px 0 0">
                  <h1 style="margin:0;color:#fff;font-size:20px;font-weight:400">
                    Campus <em>Reclaimed</em>
                  </h1>
                </div>
                <div style="background:#fff;padding:32px 24px;border:1px solid #e4e0da;border-top:none;border-radius:0 0 8px 8px">
                  <h2 style="margin:0 0 16px;font-size:20px">Sign in to your Consignor Portal</h2>
                  <p style="margin:0 0 24px;color:#374151;line-height:1.6">
                    Click the button below to view your items and request payouts.
                    This link expires in <strong>15 minutes</strong> and can only be used once.
                  </p>
                  <a href="${magicLink}"
                     style="display:inline-block;background:#1a3c34;color:#fff;text-decoration:none;
                            padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500">
                    View My Items →
                  </a>
                  <p style="margin:24px 0 0;color:#6b7280;font-size:13px">
                    If you didn't request this, you can safely ignore this email.<br>
                    This link cannot be forwarded — it's tied to your email address.
                  </p>
                </div>
                <p style="margin:16px 0 0;text-align:center;color:#9ca3af;font-size:12px">
                  Campus Reclaimed · <a href="mailto:info@campusreclaimed.com" style="color:#6b7280">info@campusreclaimed.com</a>
                </p>
              </div>
            `,
          }),
        });
      }
    }
  }

  // Always return success (no enumeration)
  return json({ message: "If an account exists for that email, a sign-in link has been sent." });
});
