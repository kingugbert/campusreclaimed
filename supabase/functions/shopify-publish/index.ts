// supabase/functions/shopify-publish/index.ts
// Publishes a donation_item to Shopify as a new product
// Called from the Campus Reclaimed UI when staff clicks "Publish to Store"
//
// Updated Feb 2026: Uses Shopify's client credentials grant (OAuth 2.0)
// instead of the deprecated static Admin API access token (shpat_).
// Token is requested fresh on each invocation (valid 24h, but Edge Functions are stateless).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Shopify Client Credentials Grant ──────────────────────────────────
// Exchanges client_id + client_secret for a short-lived access token (24h).
// Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
async function getShopifyAccessToken(storeDomain: string): Promise<string> {
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be configured as Supabase secrets");
  }

  const tokenUrl = `https://${storeDomain}/admin/oauth/access_token`;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Shopify token exchange failed:", res.status, errText);
    throw new Error(`Shopify token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // Response shape: { access_token: "hex-string", scope: "write_products,...", expires_in: 86399 }
  console.log("Shopify token acquired, scopes:", data.scope, "expires_in:", data.expires_in);
  return data.access_token;
}

serve(async (req) => {
  // Handle CORS preflight
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

    // ── Connect to Supabase ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Fetch the item with its donation + donor info ──
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

    // ── Get Shopify store domain ──
    const shopifyStore = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    if (!shopifyStore) {
      return new Response(
        JSON.stringify({ error: "SHOPIFY_STORE_DOMAIN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get access token via client credentials grant ──
    let accessToken: string;
    try {
      accessToken = await getShopifyAccessToken(shopifyStore);
    } catch (tokenErr) {
      console.error("Token acquisition failed:", tokenErr);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Shopify", details: tokenErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch all images for this item ──
    const { data: itemImages } = await supabase
      .from("item_images")
      .select("image_url, display_order")
      .eq("item_id", itemId)
      .order("display_order", { ascending: true });

    // Build image list: prefer item_images table, fall back to item_image_url
    const imageUrls: string[] = (itemImages && itemImages.length > 0)
      ? itemImages.map((img: { image_url: string }) => img.image_url)
      : (item.item_image_url ? [item.item_image_url] : []);

    // ── Create product on Shopify ──
    const productTitle = title || item.item_description;
    const productBody = [
      item.item_description,
      `\nDonated: ${item.donation?.date_accepted || "Unknown date"}`,
    ].join("\n");

    const shopifyPayload: Record<string, unknown> = {
      product: {
        title: productTitle,
        body_html: `<p>${productBody.replace(/\n/g, "</p><p>")}</p>`,
        vendor: "Campus Reclaimed",
        product_type: "Donated Item",
        tags: ["campus-reclaimed", "donation"],
        variants: [
          {
            price: price.toString(),
            inventory_quantity: 1,
            inventory_management: "shopify",
            requires_shipping: true,
          },
        ],
        ...(imageUrls.length > 0
          ? { images: imageUrls.map(url => ({ src: url })) }
          : {}),
      },
    };

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

    // ── Update the item in Supabase ──
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
