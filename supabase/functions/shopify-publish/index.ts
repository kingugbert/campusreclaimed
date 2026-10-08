// supabase/functions/shopify-publish/index.ts
// Publishes a donation_item to Shopify as a new product
// Includes: category, metadata, agreement_type, collection assignment (Option B)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getShopifyAccessToken(shopifyStore: string): Promise<string> {
  const staticToken = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
  if (staticToken) return staticToken;
  const clientId = Deno.env.get("SHOPIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("No Shopify auth credentials configured");
  const res = await fetch(`https://${shopifyStore}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function addToCollection(shopifyStore: string, accessToken: string, productId: string, collectionTitle: string): Promise<void> {
  const headers = { "X-Shopify-Access-Token": accessToken };
  let collectionId: string | undefined;

  const customRes = await fetch(`https://${shopifyStore}/admin/api/2024-10/custom_collections.json?title=${encodeURIComponent(collectionTitle)}&limit=1`, { headers });
  if (customRes.ok) collectionId = (await customRes.json()).custom_collections?.[0]?.id?.toString();

  if (!collectionId) {
    const smartRes = await fetch(`https://${shopifyStore}/admin/api/2024-10/smart_collections.json?title=${encodeURIComponent(collectionTitle)}&limit=1`, { headers });
    if (smartRes.ok) collectionId = (await smartRes.json()).smart_collections?.[0]?.id?.toString();
  }

  if (!collectionId) { console.log(`Collection "${collectionTitle}" not found — skipping`); return; }

  const collectRes = await fetch(`https://${shopifyStore}/admin/api/2024-10/collects.json`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ collect: { product_id: productId, collection_id: collectionId } }),
  });
  if (collectRes.ok) console.log(`Added to collection "${collectionTitle}"`);
  else console.error(`Failed to add to "${collectionTitle}":`, await collectRes.text());
}

function getTargetCollections(item: Record<string, unknown>): string[] {
  const meta = (item.metadata as Record<string, string>) || {};
  const category  = (item.category as string) || '';
  const gender    = (meta.gender || '').toLowerCase();
  const subcat    = (meta.subcategory || '').toLowerCase();
  const condition = (meta.condition || '').toLowerCase();
  const cols: string[] = [];

  if (category === 'Clothing') {
    cols.push('All Clothing');
    if (gender === 'women')  cols.push("Women's Clothing");
    if (gender === 'men')    cols.push("Men's Clothing");
    if (gender === 'girls')  cols.push("Girls' Clothing");
    if (gender === 'boys')   cols.push("Boys' Clothing");
    if (gender === 'unisex') cols.push('Unisex Clothing');
    if (subcat.includes('tops') || subcat.includes('shirts'))                           cols.push('Tops & Shirts');
    if (subcat.includes('bottoms') || subcat.includes('pants') || subcat.includes('jeans')) cols.push('Bottoms');
    if (subcat.includes('dress'))                                                        cols.push('Dresses');
    if (subcat.includes('outerwear') || subcat.includes('coat') || subcat.includes('jacket')) cols.push('Outerwear');
    if (subcat.includes('activewear'))                                                   cols.push('Activewear');
    if (subcat.includes('sweater') || subcat.includes('hoodie'))                         cols.push('Sweaters & Hoodies');
  }
  if (category === 'Furniture') {
    cols.push('Furniture');
    if (subcat.includes('chair'))                                                        cols.push('Chairs');
    if (subcat.includes('sofa') || subcat.includes('loveseat'))                          cols.push('Sofas & Loveseats');
    if (subcat.includes('table'))                                                        cols.push('Tables');
    if (subcat.includes('desk'))                                                         cols.push('Desks');
    if (subcat.includes('storage') || subcat.includes('cabinet') || subcat.includes('dresser')) cols.push('Storage & Organization');
    if (subcat.includes('bookcase') || subcat.includes('shelv'))                         cols.push('Bookcases & Shelving');
  }
  if (category === 'Electronics') cols.push('Electronics');
  if (category === 'Books')       cols.push('Books');
  if (category === 'Kitchen')     cols.push('Kitchen');
  if (category === 'Bedding')     cols.push('Bedding');
  if (category === 'Desk & Study') cols.push('Desk & Study');
  if (condition.includes('new with tags')) cols.push('New With Tags');
  if (condition.startsWith('like new'))   cols.push('Like New');
  if (item.agreement_type === 'consignment') cols.push('Consignment');
  if (item.agreement_type === 'donation')    cols.push('Donations');

  return [...new Set(cols)];
}

function buildBodyHtml(item: Record<string, unknown>): string {
  const meta = (item.metadata as Record<string, string>) || {};
  const lines: string[] = [];
  if (item.item_description) lines.push(`<p>${item.item_description}</p>`);
  const details: string[] = [];
  if (meta.brand)          details.push(`<strong>Brand:</strong> ${meta.brand}`);
  if (meta.color)          details.push(`<strong>Color:</strong> ${meta.color}`);
  if (meta.size)           details.push(`<strong>Size:</strong> ${meta.size}`);
  if (meta.fabric)         details.push(`<strong>Material:</strong> ${meta.fabric}`);
  if (meta.gender)         details.push(`<strong>Gender:</strong> ${meta.gender}`);
  if (meta.age_group)      details.push(`<strong>Age Group:</strong> ${meta.age_group}`);
  if (meta.material)       details.push(`<strong>Material:</strong> ${meta.material}`);
  if (meta.style)          details.push(`<strong>Style:</strong> ${meta.style}`);
  if (meta.dimensions)     details.push(`<strong>Dimensions:</strong> ${meta.dimensions}`);
  if (meta.condition)      details.push(`<strong>Condition:</strong> ${meta.condition}`);
  if (meta.notes)          details.push(`<strong>Notes:</strong> ${meta.notes}`);
  if (item.agreement_type) details.push(`<strong>Type:</strong> ${item.agreement_type === 'consignment' ? 'Consignment' : 'Donation'}`);
  if (details.length > 0) lines.push(`<ul>${details.map(d => `<li>${d}</li>`).join('')}</ul>`);
  const donation = item.donation as Record<string, unknown> | undefined;
  lines.push(`<p><em>Donated: ${donation?.date_accepted || 'Unknown date'} · Campus Reclaimed</em></p>`);
  return lines.join('\n');
}

function buildTags(item: Record<string, unknown>): string[] {
  const meta = (item.metadata as Record<string, string>) || {};
  const tags = ['campus-reclaimed', 'donation'];
  if (item.category)       tags.push((item.category as string).toLowerCase().replace(/\s+/g, '-'));
  if (meta.subcategory)    tags.push(meta.subcategory.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.gender)         tags.push(meta.gender.toLowerCase());
  if (meta.age_group)      tags.push(meta.age_group.toLowerCase());
  if (meta.size)           tags.push(`size-${meta.size.toLowerCase()}`);
  if (meta.color)          tags.push(meta.color.toLowerCase().replace(/\s+/g, '-'));
  if (meta.brand)          tags.push(meta.brand.toLowerCase().replace(/\s+/g, '-'));
  if (meta.fabric)         tags.push(meta.fabric.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.material)       tags.push(meta.material.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.style)          tags.push(meta.style.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  if (meta.condition)      tags.push(`condition-${meta.condition.toLowerCase().split(' ')[0]}`);
  if (item.agreement_type) tags.push(item.agreement_type as string);
  return [...new Set(tags)];
}

function buildMetafields(item: Record<string, unknown>): unknown[] {
  const meta = (item.metadata as Record<string, string>) || {};
  const add = (key: string, value: string) =>
    value ? { namespace: 'campus_reclaimed', key, value, type: 'single_line_text_field' } : null;
  return [
    add('category',       (item.category as string) || ''),
    add('agreement_type', (item.agreement_type as string) || ''),
    add('condition',      meta.condition || ''),
    add('color',          meta.color || ''),
    add('subcategory',    meta.subcategory || ''),
    add('gender',         meta.gender || ''),
    add('age_group',      meta.age_group || ''),
    add('size',           meta.size || ''),
    add('brand',          meta.brand || ''),
    add('fabric',         meta.fabric || ''),
    add('material',       meta.material || ''),
    add('style',          meta.style || ''),
    add('dimensions',     meta.dimensions || ''),
    add('notes',          meta.notes || ''),
  ].filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { itemId, price, title } = await req.json();
    if (!itemId || !price) return new Response(JSON.stringify({ error: "itemId and price are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: item, error: fetchError } = await supabase.from("donation_items").select(`*, donation:donations!inner(date_accepted, donor:donors!inner(donor_name))`).eq("id", itemId).single();

    if (fetchError || !item) return new Response(JSON.stringify({ error: "Item not found", details: fetchError?.message }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (item.status === "listed" && item.shopify_product_id) return new Response(JSON.stringify({ error: "Item is already listed on Shopify" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const shopifyStore = Deno.env.get("SHOPIFY_STORE_DOMAIN");
    if (!shopifyStore) return new Response(JSON.stringify({ error: "SHOPIFY_STORE_DOMAIN not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = await getShopifyAccessToken(shopifyStore);

    const shopifyPayload = {
      product: {
        title: title || item.item_description,
        body_html: buildBodyHtml(item),
        vendor: "Campus Reclaimed",
        product_type: item.category || "Donated Item",
        tags: buildTags(item).join(', '),
        metafields: buildMetafields(item),
        variants: [{ price: price.toString(), inventory_quantity: 1, inventory_management: "shopify", requires_shipping: true }],
        ...(item.item_image_url ? { images: [{ src: item.item_image_url }] } : {}),
      },
    };

    console.log("Publishing:", shopifyPayload.product.title, "| agreement:", item.agreement_type);

    const shopifyRes = await fetch(`https://${shopifyStore}/admin/api/2024-10/products.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify(shopifyPayload),
    });

    if (!shopifyRes.ok) {
      const errBody = await shopifyRes.text();
      console.error("Shopify API error:", shopifyRes.status, errBody);
      return new Response(JSON.stringify({ error: "Shopify API error", details: errBody }), { status: shopifyRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const shopifyData = await shopifyRes.json();
    const shopifyProductId = shopifyData.product.id.toString();
    const shopifyVariantId = shopifyData.product.variants[0].id.toString();

    // Add to collections (Option B)
    const targetCollections = getTargetCollections(item);
    console.log("Target collections:", targetCollections);
    await Promise.allSettled(targetCollections.map(col => addToCollection(shopifyStore, accessToken, shopifyProductId, col)));

    const { error: updateError } = await supabase.from("donation_items").update({ status: "listed", shopify_product_id: shopifyProductId, shopify_variant_id: shopifyVariantId, price: price }).eq("id", itemId);

    if (updateError) {
      return new Response(JSON.stringify({ warning: "Product created on Shopify but local update failed", shopify_product_id: shopifyProductId, details: updateError.message }), { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, shopify_product_id: shopifyProductId, shopify_variant_id: shopifyVariantId, collections_added: targetCollections, shopify_url: `https://${shopifyStore}/admin/products/${shopifyProductId}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", details: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
