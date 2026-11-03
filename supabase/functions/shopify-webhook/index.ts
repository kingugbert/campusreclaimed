// supabase/functions/shopify-webhook/index.ts
// Receives Shopify webhooks (orders/paid, orders/create, orders/cancelled,
// products/delete) and updates item status in Supabase.
// Captures buyer_name and shopify_payout on sale.
// Stage 4: also calculates and stores ambassador_commission on sale.
// Stage 5: emails consignor when their consignment item sells.
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

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Campus Reclaimed <info@campusreclaimed.com>", to, subject, html }),
  });
  if (!res.ok) console.error(`Email to ${to} failed:`, await res.text());
  return res.ok;
}

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

const DONOR_PORTAL_URL = "https://92mauwn4py.us-east-1.awsapprunner.com/donor";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const shopifyWebhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  const resendKey = Deno.env.get("RESEND_API_KEY");
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

      console.log(`Order ${orderId} | Buyer: ${buyerName} | Total: $${payload.total_price}`);

      let processedCount = 0;

      for (const lineItem of lineItems) {
        const productId = lineItem.product_id?.toString();
        const variantId = lineItem.variant_id?.toString();
        if (!productId && !variantId) continue;

        // ── Use only the line item price (excludes shipping) ──
        const shopifyPayout = lineItem.price ? parseFloat(lineItem.price) : null;

        let query = supabase
          .from("donation_items")
          .select("id, status, uploaded_by, payout_percentage, agreement_type, item_description, donation_id");
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
          // ── Stage 4: Look up ambassador commission rate ──
          let ambassadorId: string | null = null;
          let ambassadorCommission: number | null = null;

          if (match.uploaded_by && match.agreement_type === 'consignment' && shopifyPayout !== null) {
            const { data: ambProfile } = await supabase
              .from("ambassador_profiles")
              .select("id, commission_rate")
              .eq("id", match.uploaded_by)
              .maybeSingle();

            if (ambProfile) {
              ambassadorId = ambProfile.id;
              const payoutPct    = match.payout_percentage ?? 20;
              const commissionPct = ambProfile.commission_rate ?? 10;
              // Commission = what the consignor earns × ambassador's commission rate
              // consignor_payout = shopify_payout * payout_percentage / 100
              // ambassador_commission = consignor_payout * commission_rate / 100
              ambassadorCommission = parseFloat(
                (shopifyPayout * (payoutPct / 100) * (commissionPct / 100)).toFixed(2)
              );
              console.log(
                `Ambassador ${ambassadorId} commission: $${ambassadorCommission} ` +
                `(${payoutPct}% consignor × ${commissionPct}% commission rate)`
              );
            }
          }

          const { error: updateError } = await supabase
            .from("donation_items")
            .update({
              status:                "sold",
              sold_at:               new Date().toISOString(),
              shopify_order_id:      orderId,
              buyer_name:            buyerName,
              shopify_payout:        shopifyPayout,
              ambassador_id:         ambassadorId,
              ambassador_commission: ambassadorCommission,
            })
            .eq("id", match.id);

          if (updateError) {
            throw new Error(`Update failed for item ${match.id}: ${updateError.message}`);
          }
          processedCount++;
          console.log(`Marked item ${match.id} as sold | buyer: ${buyerName} | payout: $${shopifyPayout} | amb commission: $${ambassadorCommission}`);

          // ── Stage 5: Email consignor when their item sells ──
          if (match.agreement_type === 'consignment' && resendKey && shopifyPayout !== null) {
            try {
              // Look up the donor's email via donations → donors
              const { data: donationRow } = await supabase
                .from("donations")
                .select("donor_id")
                .eq("id", match.donation_id)
                .maybeSingle();

              if (donationRow?.donor_id) {
                const { data: donorRows } = await supabase
                  .from("donors")
                  .select("donor_name, donor_email")
                  .eq("id", donationRow.donor_id)
                  .limit(1);
                const donorRow = donorRows?.[0] ?? null;

                if (donorRow?.donor_email) {
                  const payoutPct = match.payout_percentage ?? 20;
                  const consignorPayout = (shopifyPayout * payoutPct / 100).toFixed(2);
                  const firstName = donorRow.donor_name?.split(' ')[0] || 'there';

                  await sendEmail(
                    resendKey,
                    donorRow.donor_email,
                    "Your Item Sold on Campus Reclaimed! 🎉",
                    emailWrap(`
                      <p>Hi ${firstName},</p>
                      <p>Great news — your item <strong>${match.item_description || 'Item'}</strong> just sold on Campus Reclaimed!</p>
                      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0; background: #f9fafb; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 10px 16px; color: #6b7280; width: 50%;">Your Payout</td>
                          <td style="padding: 10px 16px; font-weight: 700; color: #16a34a;">$${consignorPayout}</td>
                        </tr>
                      </table>
                      <p>When you're ready to collect your payout, visit your Consignor Portal:</p>
                      <p>
                        <a href="${DONOR_PORTAL_URL}"
                           style="display: inline-block; background: #1a3c34; color: #fff; text-decoration: none;
                                  padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                          Request Your Payout →
                        </a>
                      </p>
                      <p>Thank you for choosing Campus Reclaimed. Your items are making a difference!</p>
                      <p>Best,<br>The Campus Reclaimed Team</p>
                    `)
                  );
                  console.log(`Sold notification sent to consignor ${donorRow.donor_email} for item ${match.id}`);
                }
              }
            } catch (emailErr) {
              // Don't fail the webhook if the email fails
              console.error(`Failed to send consignor sold notification for item ${match.id}:`, emailErr);
            }
          }
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
          status:                "listed",
          sold_at:               null,
          shopify_order_id:      null,
          buyer_name:            null,
          shopify_payout:        null,
          ambassador_commission: null,
          ambassador_id:         null,
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
