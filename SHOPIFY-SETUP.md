# Shopify Integration Setup Guide

This guide walks you through connecting your Campus Reclaimed inventory app to a Shopify store so you can publish donated items for sale and automatically track when they're purchased.

---

## How It Works

```
┌─────────────────────┐         ┌──────────────────┐
│  Campus Reclaimed   │         │   Shopify Store   │
│  (Supabase + React) │         │                   │
│                     │         │                   │
│  Staff clicks       │──POST──▶│  Product created  │
│  "Publish to Store" │         │  on storefront    │
│                     │         │                   │
│  Item marked SOLD   │◀─POST──│  Customer buys    │
│  automatically      │webhook │  item online       │
└─────────────────────┘         └──────────────────┘
```

- **Supabase** is your source of truth for all inventory (including items not yet listed)
- **Shopify** only knows about items you've chosen to publish
- Two Supabase Edge Functions handle the bridge:
  - `shopify-publish` — sends an item to Shopify when you click "Publish to Store"
  - `shopify-webhook` — receives Shopify's order notifications and marks items as sold

---

## Prerequisites

- A working Campus Reclaimed app with Supabase (from the earlier setup)
- A Shopify account (free trial works for setup and testing)
- Supabase CLI installed (for deploying Edge Functions)

---

## Step 1: Run the Schema Migration

Open the **Supabase SQL Editor** and paste the contents of `migration-shopify.sql`, then click **Run**.

This adds the following columns to `donation_items`:
- `status` — tracks the item lifecycle: `in_storage` → `listed` → `sold`
- `shopify_product_id` — links to the Shopify product
- `shopify_variant_id` — links to the specific variant (needed for order matching)
- `price` — the listing price set by staff
- `sold_at` — when the item was purchased
- `shopify_order_id` — reference to the Shopify order

It also creates a `shopify_webhook_log` table for debugging and audit trails.

---

## Step 2: Set Up Your Shopify Store

### 2a. Create the Store

1. Go to **https://www.shopify.com** and start a free trial
2. Set up your store basics (name, address, currency)
3. You don't need to choose a paid plan until you're ready to accept real payments

### 2b. Create a Custom App (for API access)

1. In Shopify Admin, go to **Settings → Apps and sales channels**
2. Click **Develop apps** (you may need to enable this first by clicking "Allow custom app development")
3. Click **Create an app** → name it `Campus Reclaimed Sync`
4. Go to the **Configuration** tab and set these **Admin API scopes**:
   - `read_products` — to verify products exist
   - `write_products` — to create product listings
   - `read_orders` — to process order webhooks
   - `read_inventory` — to track stock levels
   - `write_inventory` — to manage stock counts
5. Click **Save** then go to the **API credentials** tab
6. Click **Install app** → then **Install**
7. Copy the **Admin API access token** (you'll only see it once — save it!)

The access token looks like: `shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2c. Note Your Store Domain

Your Shopify store domain is the `*.myshopify.com` URL, e.g.:
```
campus-reclaimed-store.myshopify.com
```
You can find this in Settings → Domains.

---

## Step 3: Install the Supabase CLI

If you don't already have it:

```bash
# macOS with Homebrew
brew install supabase/tap/supabase

# or via npm
npm install -g supabase
```

Then log in:
```bash
supabase login
```

---

## Step 4: Initialize Supabase in Your Project

From your project root:

```bash
cd ~/Desktop/campus-reclaimed
supabase init
```

This creates a `supabase/` directory. The Edge Functions we need are already in:
```
supabase/functions/shopify-publish/index.ts
supabase/functions/shopify-webhook/index.ts
```

Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Your project ref is the random string in your Supabase URL (the part before `.supabase.co`).

---

## Step 5: Set the Secrets (Environment Variables)

These secrets are stored securely in Supabase and available to your Edge Functions:

```bash
supabase secrets set SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
supabase secrets set SHOPIFY_ADMIN_API_TOKEN=shpat_your_token_here
supabase secrets set SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_here
```

The `SHOPIFY_WEBHOOK_SECRET` comes from Step 6 below. You can set it after creating the webhook, or set a placeholder now and update it later.

---

## Step 6: Deploy the Edge Functions

```bash
supabase functions deploy shopify-publish --no-verify-jwt
supabase functions deploy shopify-webhook --no-verify-jwt
```

The `--no-verify-jwt` flag is important for the webhook function since Shopify calls it directly (not through your app's auth).

After deploying, note the webhook URL. It will be:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/shopify-webhook
```

---

## Step 7: Create Shopify Webhooks

This is where you tell Shopify to notify your app when orders happen.

### Option A: Via Shopify Admin UI

1. In Shopify Admin, go to **Settings → Notifications**
2. Scroll to the bottom and click **Webhooks**
3. Click **Create webhook**:

   **Webhook 1 — Order Paid (primary):**
   - Event: `Order payment`
   - Format: `JSON`
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/shopify-webhook`
   - API version: `2024-01` (or latest)

   **Webhook 2 — Product Deleted (cleanup):**
   - Event: `Product deletion`
   - Format: `JSON`
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/shopify-webhook`
   - API version: `2024-01`

4. After creating the first webhook, Shopify shows a **Signing secret** at the top of the webhooks section. Copy this — it's your `SHOPIFY_WEBHOOK_SECRET`.

5. Go back to your terminal and set it:
   ```bash
   supabase secrets set SHOPIFY_WEBHOOK_SECRET=the_secret_from_shopify
   ```

### Option B: Via Shopify Admin API (programmatic)

```bash
# Create order webhook
curl -X POST \
  "https://your-store.myshopify.com/admin/api/2024-01/webhooks.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: shpat_your_token" \
  -d '{
    "webhook": {
      "topic": "orders/paid",
      "address": "https://YOUR_PROJECT_REF.supabase.co/functions/v1/shopify-webhook",
      "format": "json"
    }
  }'

# Create product deletion webhook
curl -X POST \
  "https://your-store.myshopify.com/admin/api/2024-01/webhooks.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: shpat_your_token" \
  -d '{
    "webhook": {
      "topic": "products/delete",
      "address": "https://YOUR_PROJECT_REF.supabase.co/functions/v1/shopify-webhook",
      "format": "json"
    }
  }'
```

---

## Step 8: Test the Integration

### Test publishing:
1. Open the Campus Reclaimed app
2. Go to the **Inventory** tab
3. Expand any item that shows "In Storage" status
4. Click **Publish to Store**
5. Enter a price and click **Publish**
6. The item's status should change to **Listed**
7. Check your Shopify admin — the product should appear under Products

### Test the webhook (sold flow):
1. In Shopify, enable test mode for payments (Settings → Payments → Use Bogus Gateway)
2. Visit your Shopify storefront and purchase the item you just published
3. Use the Bogus Gateway test credit card: `1` for card number, any future date, any CVV
4. Complete the checkout
5. Go back to Campus Reclaimed — the item should now show as **Sold**

### Debug if something isn't working:
Check the webhook log in Supabase:
```sql
SELECT * FROM shopify_webhook_log ORDER BY created_at DESC LIMIT 10;
```

Check Edge Function logs:
```bash
supabase functions logs shopify-webhook
supabase functions logs shopify-publish
```

---

## Step 9: Update Your App Files

Copy the updated files into your project:

- **`App.jsx`** → `src/App.jsx` (replaces existing)
- **`App.css`** → `src/App.css` (replaces existing)
- **`migration-shopify.sql`** → project root (for reference)
- **`supabase/functions/`** → already in place from Step 4

---

## Architecture Reference

### Data Flow

```
INTAKE:       Donor brings items → Staff enters in app → Supabase (status: in_storage)
                                                              │
PUBLISH:      Staff clicks "Publish" → Edge Function → Shopify API creates product
              Price + Shopify IDs saved ← ─ ─ ─ ─ ─ ─ ─┘    │
              Status: in_storage → listed                     │
                                                              │
SOLD:         Customer buys on Shopify → Shopify sends webhook → Edge Function
              Status: listed → sold  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
              sold_at + order_id recorded
```

### Database Columns Added

| Column | Type | Purpose |
|--------|------|---------|
| `status` | TEXT | `in_storage` → `listed` → `sold` / `claimed` / `removed` |
| `shopify_product_id` | TEXT | Links to Shopify product |
| `shopify_variant_id` | TEXT | Links to specific variant (for order matching) |
| `price` | DECIMAL | Sale price set by staff |
| `sold_at` | TIMESTAMPTZ | When the Shopify order was paid |
| `shopify_order_id` | TEXT | Reference to the Shopify order |

### Edge Functions

| Function | Trigger | Direction |
|----------|---------|-----------|
| `shopify-publish` | "Publish to Store" button in UI | Supabase → Shopify |
| `shopify-webhook` | Shopify order/delete events | Shopify → Supabase |

---

## Security Notes

- The **webhook secret** ensures only Shopify (not random attackers) can call your webhook endpoint. The `shopify-webhook` function verifies the HMAC signature on every request.
- The **Admin API token** is stored as a Supabase secret, never exposed to the browser.
- The `shopify-publish` function runs server-side (Edge Function), so your Shopify credentials are never sent to the client.
- The webhook function always returns HTTP 200 (even on errors) to prevent Shopify from retrying and causing duplicate updates. Errors are logged to `shopify_webhook_log` for debugging.

---

## Optional Enhancements

Once the basic flow is working, you might want to add:

- **Bulk publish** — select multiple items and publish them all at once
- **Auto-pricing rules** — suggest prices based on item category or condition
- **Inventory sync** — periodically reconcile Supabase and Shopify product lists
- **Email notifications** — notify staff when items sell
- **Revenue dashboard** — track sales totals and donation-to-sale conversion rates
