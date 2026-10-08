// supabase/functions/shopify-publish/index.ts
// Publishes a donation_item to Shopify as a new product
// Updated: now includes category, metadata (size/color/fabric/material/style etc.)
// mapped to Shopify product_type, tags, body_html, and metafields

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Shopify Client Credentials Grant ──────────────────────────────────
async function getShopifyAccessToken(shopifyStore: string): Promise<string> {
  const clientId     = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");

  // Support both old static token and new client credentials
  const staticToken = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
  if (staticToken) return staticToken;

  if (!clientId || !clientSecret) {
    throw new Error("No Shopify auth credentials configured (need SHOPIFY_ADMIN_API_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)");
  }

  const res = await fetch(`https://${shopifyStore}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── Build enriched body_html from metadata ────────────────────────────
function buildBodyHtml(item: Record<string, unknown>): string {
  const meta = (item.metadata as Record<string, string>) || {};
  const lines: string[] = [];

  if (item.item_description) lines.push(`<p>${item.item_description}</p>`);

  const details: string[] = [];
  if (meta.brand)      details.push(`<strong>Brand:</strong> ${meta.brand}`);
  if (meta.color)      details.push(`<strong>Color:</strong> ${meta.color}`);
  if (meta.size)       details.push(`<strong>Size:</strong> ${meta.size}`);
  if (meta.fabric)     details.push(`<strong>Material:</strong> ${meta.fabric}`);
  if (meta.gender)     details.push(`<strong>Gender:</strong> ${meta.gender}`);
  if (meta.age_group)  details.push(`<strong>Age Group:</strong> ${meta.age_group}`);
  if (meta.material)   details.push(`<strong>Material:</strong> ${meta.material}`);
  if (meta.style)      details.push(`<strong>Style:</strong> ${meta.style}`);
  if (meta.dimensions) details.push(`<strong>Dimensions:</strong> ${meta.dimensions}`);
  if (meta.condition)  details.push(`<strong>Condition:</strong> ${meta.condition}`);
  if (meta.notes)      details.push(`<strong>Notes:</strong> ${meta.notes}`);

  if (details.length > 0) {
    lines.push(`<ul>${details.map(d => `<li>${d}</li>`).join('')}</ul>`);
  }

  const donation = item.donation as Record<string, unknown> | undefined;
  lines.push(`<p><em>Donated: ${donation?.date_accepted || 'Unknown date'} · Campus Reclaimed</em></p>`);

  return lines.join('\n');
}

// ── Build tags array from category + metadata ─────────────────────────
function buildTags(item: Record<string, unknown>): string[] {
  const meta = (item.metadata as Record<string, string>) || {};
  const tags = ['campus-reclaimed', 'donation'];

  if (item.category) tags.push((item.category as string).toLowerCase());
  if (meta.subcategory) tags.push(meta.subcategory.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.gender)      tags.push(meta.gender.toLowerCase());
  if (meta.age_group)   tags.push(meta.age_group.toLowerCase());
  if (meta.size)        tags.push(`size-${meta.size.toLowerCase()}`);
  if (meta.color)       tags.push(meta.color.toLowerCase().replace(/\s+/g, '-'));
  if (meta.brand)       tags.push(meta.brand.toLowerCase().replace(/\s+/g, '-'));
  if (meta.fabric)      tags.push(meta.fabric.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.material)    tags.push(meta.material.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.style)       tags.push(meta.style.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.condition)   tags.push(`condition-${meta.condition.toLowerCase().split(' ')[0]}`);

  return [...new Set(tags)]; // deduplicate
}

// ── Build Shopify metafields from metadata ────────────────────────────
function buildMetafields(item: Record<string, unknown>): unknown[] {
  const meta = (item.metadata as Record<string, string>) || {};
  const fields: unknown[] = [];

  const add = (key: string, value: string, type = 'single_line_text_field') => {
    if (value) fields.push({ namespace: 'campus_reclaimed', key, value, type });
  };

  // Universal
  add('category',  (item.category as string) || '');
  add('condition', meta.condition || '');
  add('color',     meta.color || '');

  // Clothing-specific
  add('subcategory', meta.subcategory || '');
  add('gender',      meta.gender || '');
  add('age_group',   meta.age_group || '');
  add('size',        meta.size || '');
  add('brand',       meta.brand || '');
  add('fabric',      meta.fabric || '');

  // Furniture-specific
  add('material',    meta.material || '');
  add('style',       meta.style || '');
  add('dimensions',  meta.dimensions || '');
  add('notes',       meta.notes || '');

  return fields.filter((f: unknown) => (f as Record<string, string>).value !== '');
}

// ── Main handler ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { itemId, price, title } = await req.json();

    if (!itemId || !price) {
      return new Response(
        JSON.stringify({ error: "itemId and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch item — includes category and metadata now
    const { data: item, error: fetchError } = await supabase
      .from("donation_items")
      .select(`*, donation:donations!inner(date_accepted, donor:donors!inner(donor_name))`)
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return new Response(
        JSON.stringify({ error: "Item not found", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (item.status === "listed" && item.shopify_product_id) {
      return new Response(
        JSON.stringify({ error: "Item is already listed on Shopify" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyStore = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    if (!shopifyStore) {
      return new Response(
        JSON.stringify({ error: "SHOPIFY_STORE_DOMAIN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    try {
      accessToken = await getShopifyAccessToken(shopifyStore);
    } catch (tokenErr) {
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Shopify", details: tokenErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map category to Shopify product_type
    const productType = item.category || "Donated Item";

    // Build enriched payload
    const shopifyPayload = {
      product: {
        title: title || item.item_description,
        body_html: buildBodyHtml(item),
        vendor: "Campus Reclaimed",
        product_type: productType,
        tags: buildTags(item).join(', '),
        metafields: buildMetafields(item),
        variants: [{
          price: price.toString(),
          inventory_quantity: 1,
          inventory_management: "shopify",
          requires_shipping: true,
        }],
        ...(item.item_image_url ? { images: [{ src: item.item_image_url }] } : {}),
      },
    };

    console.log("Publishing to Shopify:", JSON.stringify({
      title: shopifyPayload.product.title,
      product_type: shopifyPayload.product.product_type,
      tags: shopifyPayload.product.tags,
      metafields_count: shopifyPayload.product.metafields.length,
    }));

    const shopifyRes = await fetch(
      `https://${shopifyStore}/admin/api/2024-10/products.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify(shopifyPayload),
      }
    );

    if (!shopifyRes.ok) {
      const errBody = await shopifyRes.text();
      console.error("Shopify API error:", shopifyRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "Shopify API error", details: errBody }),
        { status: shopifyRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyData = await shopifyRes.json();
    const shopifyProductId = shopifyData.product.id.toString();
    const shopifyVariantId = shopifyData.product.variants[0].id.toString();

    const { error: updateError } = await supabase
      .from("donation_items")
      .update({
        status: "listed",
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        price: price,
      })
      .eq("id", itemId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return new Response(
        JSON.stringify({
          warning: "Product created on Shopify but local update failed",
          shopify_product_id: shopifyProductId,
          details: updateError.message,
        }),
        { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        shopify_url: `https://${shopifyStore}/admin/products/${shopifyProductId}`,
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
