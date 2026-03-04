// supabase/functions/shopify-webhook/index.ts
// Receives Shopify webhooks (orders/paid, products/delete) and updates item status in Supabase
// Shopify sends a POST to this URL when order events or product deletions occur
//
// Auth note (Feb 2026): This function only RECEIVES webhooks from Shopify —
// it doesn't make outbound Shopify API calls, so no client credentials grant is needed here.
// HMAC verification uses SHOPIFY_WEBHOOK_SECRET (the webhook signing secret from Dev Dashboard).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

serve(async (req) => {
  // Shopify webhooks are always POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const shopifyWebhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  const supabase = createClient(supabaseUrl, supabaseKey);

  let rawBody: string;

  try {
    rawBody = await req.text();

    // ── Verify webhook signature (CRITICAL for security) ──
    if (shopifyWebhookSecret) {
      const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
      if (!hmacHeader) {
        console.error("Missing HMAC header");
        return new Response("Unauthorized", { status: 401 });
      }

      const hmac = createHmac("sha256", shopifyWebhookSecret);
      hmac.update(rawBody);
      const computedHmac = hmac.digest("base64");

      if (computedHmac !== hmacHeader) {
        console.error("HMAC verification failed");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const topic = req.headers.get("X-Shopify-Topic") || "unknown";
    const payload = JSON.parse(rawBody);

    // ── Log the webhook for audit trail ──
    await supabase.from("shopify_webhook_log").insert([{
      topic,
      shopify_id: payload.id?.toString(),
      payload,
      processed: false,
    }]);

    // ── Handle order events ──
    if (topic === "orders/paid" || topic === "orders/create") {
      const orderId = payload.id?.toString();
      const lineItems = payload.line_items || [];

      let processedCount = 0;

      for (const lineItem of lineItems) {
        const productId = lineItem.product_id?.toString();
        const variantId = lineItem.variant_id?.toString();

        if (!productId && !variantId) continue;

        // Find the matching donation_item by Shopify product or variant ID
        let query = supabase.from("donation_items").select("id, status");

        if (variantId) {
          query = query.eq("shopify_variant_id", variantId);
        } else {
          query = query.eq("shopify_product_id", productId);
        }

        const { data: matchingItems, error: findError } = await query.eq("status", "listed");

        if (findError) {
          console.error(`Error finding item for product ${productId}:`, findError);
          continue;
        }

        if (!matchingItems || matchingItems.length === 0) {
          console.log(`No matching listed item found for product ${productId}`);
          continue;
        }

        // Mark the item as sold
        for (const match of matchingItems) {
          const { error: updateError } = await supabase
            .from("donation_items")
            .update({
              status: "sold",
              sold_at: new Date().toISOString(),
              shopify_order_id: orderId,
            })
            .eq("id", match.id);

          if (updateError) {
            console.error(`Error updating item ${match.id}:`, updateError);
          } else {
            processedCount++;
            console.log(`Marked item ${match.id} as sold (order: ${orderId})`);
          }
        }
      }

      // Update the webhook log entry as processed
      await supabase
        .from("shopify_webhook_log")
        .update({ processed: true })
        .eq("shopify_id", orderId)
        .eq("topic", topic);

      return new Response(
        JSON.stringify({ success: true, items_updated: processedCount }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Handle product deletion (if someone deletes from Shopify admin) ──
    if (topic === "products/delete") {
      const productId = payload.id?.toString();

      const { error } = await supabase
        .from("donation_items")
        .update({
          status: "in_storage",
          shopify_product_id: null,
          shopify_variant_id: null,
          price: null,
        })
        .eq("shopify_product_id", productId);

      if (error) {
        console.error(`Error unlisting product ${productId}:`, error);
      }

      return new Response(
        JSON.stringify({ success: true, action: "unlisted" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // For any other topic, just acknowledge
    return new Response(
      JSON.stringify({ success: true, action: "logged" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Webhook processing error:", err);

    // Log the error
    try {
      await supabase.from("shopify_webhook_log").insert([{
        topic: req.headers.get("X-Shopify-Topic") || "error",
        payload: { raw_body: rawBody! },
        processed: false,
        error: err.message,
      }]);
    } catch (_) { /* best effort logging */ }

    // Always return 200 to Shopify to prevent retries on our errors
    return new Response(
      JSON.stringify({ error: "Processing error", details: err.message }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
