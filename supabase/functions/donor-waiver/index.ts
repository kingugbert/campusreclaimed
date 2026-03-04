// supabase/functions/donor-waiver/index.ts
// Receives a waiver PDF + donor info from Shopify, stores the PDF
// in Supabase Storage, and links it to the matching donor record.
//
// Expected JSON payload:
// {
//   "donor_name": "Jane Smith",
//   "donor_email": "jane@example.com",
//   "donor_phone": "555-123-4567",
//   "pdf_base64": "JVBERi0xLjQg..."
// }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { donor_name, donor_email, donor_phone, pdf_base64 } = await req.json();

    // ── Validate required fields ──
    if (!donor_name || !pdf_base64) {
      return new Response(
        JSON.stringify({ error: "donor_name and pdf_base64 are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Connect to Supabase ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Look up the donor by name + email + phone ──
    const trimName = donor_name.trim();
    const trimEmail = donor_email?.trim() || null;
    const trimPhone = donor_phone?.trim() || null;

    let donorQuery = supabase
      .from("donors")
      .select("id, donor_name")
      .ilike("donor_name", trimName);

    if (trimEmail) {
      donorQuery = donorQuery.eq("donor_email", trimEmail);
    } else {
      donorQuery = donorQuery.is("donor_email", null);
    }

    if (trimPhone) {
      donorQuery = donorQuery.eq("phone_number", trimPhone);
    } else {
      donorQuery = donorQuery.is("phone_number", null);
    }

    const { data: existingDonors, error: lookupError } = await donorQuery.limit(1);

    if (lookupError) {
      console.error("Donor lookup error:", lookupError);
      return new Response(
        JSON.stringify({ error: "Donor lookup failed", details: lookupError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let donorId: string;

    if (existingDonors && existingDonors.length > 0) {
      donorId = existingDonors[0].id;
      console.log(`Matched existing donor: ${existingDonors[0].donor_name} (${donorId})`);
    } else {
      // Create new donor record
      const { data: newDonor, error: createError } = await supabase
        .from("donors")
        .insert([{
          donor_name: trimName,
          donor_email: trimEmail,
          phone_number: trimPhone,
        }])
        .select()
        .single();

      if (createError) {
        console.error("Donor creation error:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create donor", details: createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      donorId = newDonor.id;
      console.log(`Created new donor: ${trimName} (${donorId})`);
    }

    // ── Decode the base64 PDF ──
    const binaryString = atob(pdf_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // ── Upload PDF to Supabase Storage ──
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedName = trimName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filePath = `${donorId}/${sanitizedName}-waiver-${timestamp}.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("waivers")
      .upload(filePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload PDF", details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from("waivers")
      .getPublicUrl(filePath);

    const waiverUrl = urlData.publicUrl;

    // ── Insert waiver record ──
    const { data: waiver, error: waiverError } = await supabase
      .from("donor_waivers")
      .insert([{
        donor_id: donorId,
        waiver_url: waiverUrl,
        signed_at: new Date().toISOString(),
        form_data: {
          donor_name: trimName,
          donor_email: trimEmail,
          donor_phone: trimPhone,
        },
      }])
      .select()
      .single();

    if (waiverError) {
      console.error("Waiver record error:", waiverError);
      return new Response(
        JSON.stringify({
          warning: "PDF uploaded but waiver record failed",
          waiver_url: waiverUrl,
          details: waiverError.message,
        }),
        { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Waiver stored for donor ${donorId}: ${waiverUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        donor_id: donorId,
        waiver_id: waiver.id,
        waiver_url: waiverUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
