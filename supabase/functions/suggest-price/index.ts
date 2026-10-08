// supabase/functions/suggest-price/index.ts
// Suggests a resale price for a donation item using Claude AI
// with a condition-based floor as a safety guardrail.
//
// Auth: requires a signed-in staff user (validated via auth.getUser) since
// this deploys --no-verify-jwt and every call costs Anthropic API credits.
//
// Expected JSON payload: { "itemId": "uuid" }
// Returns: { suggested_price, price_range: {low, high}, rationale, floor_price }
//
// Deploy: supabase functions deploy suggest-price --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_BYTES = 5_000_000; // Anthropic image ceiling

/* ─── Condition-based floor prices ─── */
const FLOORS: Record<string, Record<string, number>> = {
  Clothing: {
    "new with tags": 10,
    "like new":       7,
    "good":           5,
    "fair":           3,
    "worn":           1,
  },
  Furniture: {
    "like new":               50,
    "good — minor wear":      30,
    "fair — visible wear":    15,
    "poor — needs repair":     5,
  },
  Headboards: {
    "like new":               25,
    "good — minor wear":      15,
    "fair — visible wear":     8,
    "poor — needs repair":     3,
  },
  Electronics: { default: 10 },
  Books:       { default:  2 },
  Kitchen:     { default:  3 },
  Bedding:     { default:  5 },
  "Desk & Study": { default: 5 },
};
const DEFAULT_FLOOR = 3;

function getFloor(category: string, condition: string): number {
  const catFloors = FLOORS[category];
  if (!catFloors) return DEFAULT_FLOOR;
  if (catFloors.default !== undefined) return catFloors.default;
  const condKey = (condition || '').toLowerCase().trim();
  for (const [key, val] of Object.entries(catFloors)) {
    if (condKey.startsWith(key)) return val;
  }
  // Fallback: lowest floor in that category
  return Math.min(...Object.values(catFloors).filter(v => typeof v === 'number') as number[]);
}

/* ─── Chunked base64 encode — a spread (`String.fromCharCode(...bytes)`)
       overflows the call stack on multi-MB photos ─── */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* ─── Build the Claude prompt ─── */
function buildPrompt(item: Record<string, unknown>): string {
  const meta = (item.metadata as Record<string, string>) || {};
  const parts: string[] = [];

  parts.push(`Item: ${item.item_description || 'Unknown item'}`);
  parts.push(`Category: ${item.category || 'Unknown'}`);
  if (meta.subcategory)    parts.push(`Type: ${meta.subcategory}`);
  if (meta.brand)          parts.push(`Brand: ${meta.brand}`);
  if (meta.condition)      parts.push(`Condition: ${meta.condition}`);
  if (meta.size)           parts.push(`Size: ${meta.size}`);
  if (meta.gender)         parts.push(`Gender: ${meta.gender}`);
  if (meta.age_group)      parts.push(`Age Group: ${meta.age_group}`);
  if (meta.fabric)         parts.push(`Fabric: ${meta.fabric}`);
  if (meta.material)       parts.push(`Material: ${meta.material}`);
  if (meta.style)          parts.push(`Style: ${meta.style}`);
  if (meta.dimensions)     parts.push(`Dimensions: ${meta.dimensions}`);
  if (meta.weight_lbs)     parts.push(`Weight: ${meta.weight_lbs} lbs`);
  if (meta.color)          parts.push(`Color: ${meta.color}`);
  if (meta.notes)          parts.push(`Notes: ${meta.notes}`);
  if (item.agreement_type) parts.push(`Agreement: ${item.agreement_type}`);

  return `You are a pricing expert for a university campus resale program called Campus Reclaimed. 
Items are donated or consigned by students and staff and sold to other students at fair resale prices.
Prices should be realistic for a college campus resale context — not retail, not rock-bottom thrift store.

Here is the item to price:
${parts.join('\n')}

Respond with ONLY a JSON object, no markdown, no explanation outside the JSON:
{
  "suggested_price": <number — your best single price recommendation>,
  "price_range": { "low": <number>, "high": <number> },
  "rationale": "<one sentence explaining the price, referencing specific item attributes>"
}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Require a signed-in staff user (this endpoint spends API credits) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized — staff sign-in required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { itemId } = await req.json();
    if (!itemId) {
      return new Response(JSON.stringify({ error: "itemId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch full item from Supabase ──
    const { data: item, error: fetchError } = await supabase
      .from("donation_items")
      .select(`*, item_images(image_url, display_order), donation:donations!inner(date_accepted)`)
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return new Response(JSON.stringify({ error: "Item not found", details: fetchError?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = (item.metadata as Record<string, string>) || {};

    // ── Compute floor ──
    const floorPrice = getFloor(item.category || '', meta.condition || '');

    // ── Build Claude message — include image if available ──
    const images = (item.item_images || [])
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (a.display_order as number) - (b.display_order as number));
    const firstImageUrl = images.length > 0
      ? (images[0] as Record<string, string>).image_url
      : item.item_image_url;

    const userContent: unknown[] = [];

    // Attach image if present — Claude can factor in visible condition/wear
    if (firstImageUrl) {
      try {
        const imgRes = await fetch(firstImageUrl);
        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          if (imgBuffer.byteLength <= MAX_IMAGE_BYTES) {
            const imgBase64 = bytesToBase64(new Uint8Array(imgBuffer));
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            userContent.push({
              type: "image",
              source: { type: "base64", media_type: contentType, data: imgBase64 },
            });
          } else {
            console.warn(`Image too large for pricing (${imgBuffer.byteLength} bytes) — pricing text-only`);
          }
        }
      } catch (imgErr) {
        console.warn("Could not fetch item image for pricing:", imgErr);
      }
    }

    userContent.push({ type: "text", text: buildPrompt(item) });

    // ── Call Claude ──
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        temperature: 0,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude API error:", err);
      return new Response(JSON.stringify({ error: "Claude API error", details: err }), {
        status: claudeRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      console.error("Failed to parse Claude response:", rawText);
      return new Response(JSON.stringify({ error: "Failed to parse price suggestion", raw: rawText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Enforce floor on suggested price ──
    let suggestedPrice = parseFloat(parsed.suggested_price as string) || floorPrice;
    suggestedPrice = Math.max(suggestedPrice, floorPrice);
    // Round to nearest 0.50 for clean pricing
    suggestedPrice = Math.round(suggestedPrice * 2) / 2;

    const range = parsed.price_range as { low: number; high: number } | undefined;
    const priceLow  = range ? Math.max(parseFloat(range.low as unknown as string) || floorPrice, floorPrice) : suggestedPrice * 0.8;
    const priceHigh = range ? parseFloat(range.high as unknown as string) || suggestedPrice * 1.2 : suggestedPrice * 1.2;

    console.log(`Price suggestion for ${item.item_description}: $${suggestedPrice} (floor: $${floorPrice}) — by ${userData.user.email}`);

    return new Response(JSON.stringify({
      suggested_price: suggestedPrice,
      price_range: {
        low:  Math.round(priceLow  * 2) / 2,
        high: Math.round(priceHigh * 2) / 2,
      },
      rationale:   parsed.rationale   || "Based on category and condition.",
      floor_price: floorPrice,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
