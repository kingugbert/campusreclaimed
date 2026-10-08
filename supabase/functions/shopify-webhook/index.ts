// supabase/functions/shopify-webhook/index.ts
// Receives Shopify webhooks (orders/paid, orders/create, orders/cancelled,
// products/delete) and updates item status in Supabase.
// Now captures buyer_name and shopify_payout on sale.
//
// Deploy: supabase functions deploy shopify-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "https://deno.land/std@0.168.0/node/crypto.ts";
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";

function verifyHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const computed = Buffer.from(hmac.digest("base64"), "utf8");
  const received = Buffer.from(hmacHeader, "utf8");
  if (computed.length !== received.length) return false;
  return timingSafeEqual(computed, received);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const shopifyWebhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Fail closed: no secret configured means no webhook processing ──
  if (!shopifyWebhookSecret) {
    console.error("SHOPIFY_WEBHOOK_SECRET is not configured — rejecting request");
    return new Response("Webhook secret not configured", { status: 503 });
  }

  let rawBody: string | undefined;

  try {
    rawBody = await req.text();

    // ── Verify webhook signature (constant-time) ──
    const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
    if (!hmacHeader || !verifyHmac(rawBody, hmacHeader, shopifyWebhookSecret)) {
      console.error("HMAC verification failed");
      return new Response("Unauthorized", { status: 401 });
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

    // ── Order placed / paid → mark matching items sold ──
    if (topic === "orders/paid" || topic === "orders/create") {
      const orderId   = payload.id?.toString();
      const lineItems = payload.line_items || [];

      // ── Extract buyer name ──
      // Prefer billing address name, fall back to customer name, then email
      const billing  = payload.billing_address;
      const customer = payload.customer;
      const buyerName =
        billing?.name?.trim() ||
        [customer?.first_name, customer?.last_name].filter(Boolean).join(' ').trim() ||
        customer?.email ||
        payload.email ||
        null;

      // ── Extract gross payout (what the buyer paid, before any Shopify fees) ──
      const shopifyPayout = payload.total_price ? parseFloat(payload.total_price) : null;

      console.log(`Order ${orderId} | Buyer: ${buyerName} | Total: $${shopifyPayout}`);

      let processedCount = 0;

      for (const lineItem of lineItems) {
        const productId = lineItem.product_id?.toString();
        const variantId = lineItem.variant_id?.toString();
        if (!productId && !variantId) continue;

        let query = supabase.from("donation_items").select("id, status");
        if (variantId) query = query.eq("shopify_variant_id", variantId);
        else query = query.eq("shopify_product_id", productId);

        const { data: matchingItems, error: findError } = await query.eq("status", "listed");

        if (findError) {
          throw new Error(`Lookup failed for product ${productId}: ${findError.message}`);
        }

        if (!matchingItems || matchingItems.length === 0) {
          console.log(`No matching listed item for product ${productId} (already sold or not ours)`);
          continue;
        }

        for (const match of matchingItems) {
          const { error: updateError } = await supabase
            .from("donation_items")
            .update({
              status:           "sold",
              sold_at:          new Date().toISOString(),
              shopify_order_id: orderId,
              buyer_name:       buyerName,
              shopify_payout:   shopifyPayout,
            })
            .eq("id", match.id);

          if (updateError) {
            throw new Error(`Update failed for item ${match.id}: ${updateError.message}`);
          }
          processedCount++;
          console.log(`Marked item ${match.id} as sold | buyer: ${buyerName} | payout: $${shopifyPayout}`);
        }
      }

      await supabase
        .from("shopify_webhook_log")
        .update({ processed: true })
        .eq("shopify_id", orderId)
        .eq("topic", topic);

      return new Response(
        JSON.stringify({ success: true, items_updated: processedCount, buyer_name: buyerName, payout: shopifyPayout }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Order cancelled → return its items to 'listed' ──
    if (topic === "orders/cancelled") {
      const orderId = payload.id?.toString();

      const { data: revertedItems, error } = await supabase
        .from("donation_items")
        .update({
          status:           "listed",
          sold_at:          null,
          shopify_order_id: null,
          buyer_name:       null,
          shopify_payout:   null,
        })
        .eq("shopify_order_id", orderId)
        .eq("status", "sold")
        .select("id");

      if (error) {
        throw new Error(`Cancel revert failed for order ${orderId}: ${error.message}`);
      }

      await supabase
        .from("shopify_webhook_log")
        .update({ processed: true })
        .eq("shopify_id", orderId)
        .eq("topic", topic);

      console.log(`Order ${orderId} cancelled — reverted ${revertedItems?.length || 0} item(s) to listed`);
      return new Response(
        JSON.stringify({ success: true, items_reverted: revertedItems?.length || 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Product deleted in Shopify admin → unlist locally ──
    if (topic === "products/delete") {
      const productId = payload.id?.toString();

      const { error } = await supabase
        .from("donation_items")
        .update({
          status:             "in_storage",
          shopify_product_id: null,
          shopify_variant_id: null,
          price:              null,
        })
        .eq("shopify_product_id", productId);

      if (error) {
        throw new Error(`Unlist failed for product ${productId}: ${error.message}`);
      }

      await supabase
        .from("shopify_webhook_log")
        .update({ processed: true })
        .eq("shopify_id", productId)
        .eq("topic", topic);

      return new Response(
        JSON.stringify({ success: true, action: "unlisted" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Any other topic: acknowledge and keep the log entry
    return new Response(
      JSON.stringify({ success: true, action: "logged" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Webhook processing error:", err);

    try {
      await supabase.from("shopify_webhook_log").insert([{
        topic: req.headers.get("X-Shopify-Topic") || "error",
        payload: { raw_body: rawBody ?? null },
        processed: false,
        error: err.message,
      }]);
    } catch (_) { /* best effort logging */ }

    // Return 500 so Shopify retries (up to ~48h). Order handlers are
    // idempotent (status='listed' guard), so retries are safe.
    return new Response(
      JSON.stringify({ error: "Processing error", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
