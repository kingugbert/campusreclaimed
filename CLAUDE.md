# Campus Reclaimed — CLAUDE.md

Developer reference for the Campus Reclaimed inventory app. Read this before making any changes.

---

## Project Overview

Campus Reclaimed is a sustainable resale platform for university campuses. Students donate or consign items; staff manage inventory, publish to Shopify, and track consignor payouts through a React admin app.

**Live app:** https://92mauwn4py.us-east-1.awsapprunner.com  
**Supabase project:** `vkfzeojkxfuehgtwysrn` (https://vkfzeojkxfuehgtwysrn.supabase.co)  
**Shopify store:** stored in Supabase secret `SHOPIFY_STORE_DOMAIN`  
**AWS account:** `842675982987` | region `us-east-1` | deploy user `doyler`

---

## Repository Layout

```
campusreclaimed/
├── src/
│   ├── App.jsx                  # Main React SPA — all staff UI
│   ├── App.css                  # Global styles
│   ├── main.jsx                 # Vite entry point
│   ├── supabaseClient.js        # Supabase client singleton
│   └── pages/
│       ├── AgreementPage.jsx    # Public donor agreement form
│       └── ToteRequestPage.jsx  # Public tote-request form
├── supabase/
│   └── functions/
│       ├── analyze-item/        # Claude vision item identification
│       ├── donor-waiver/        # PDF waiver upload (legacy path)
│       ├── email-notifications/ # 30-day donor reminder emails
│       ├── manage-users/        # Ambassador account management
│       ├── shopify-publish/     # Publish item to Shopify store
│       ├── shopify-webhook/     # Receive Shopify order events
│       ├── submit-agreement/    # Public agreement submission
│       ├── suggest-price/       # Claude AI price suggestion
│       └── tote-request/        # Public tote pickup request
├── sql/
│   ├── migration_buyer_payout.sql
│   └── migration_payouts.sql
├── migration.sql                # Base schema (donors/donations/donation_items)
├── migration-shopify.sql        # Shopify integration columns
├── migration-multi-images.sql   # item_images table
├── migration-merge-duplicate-donors.sql
├── Dockerfile                   # Multi-stage: Node build → nginx serve
├── nginx.conf                   # SPA routing + health endpoint on :8080
├── aws-deploy.sh                # Build → ECR push → App Runner update
├── vite.config.js               # Vite + React plugin (minimal)
└── package.json                 # React 18, Supabase JS, jspdf, imgly bg-removal
```

---

## Frontend — `src/App.jsx`

Single-file React SPA. All tabs and logic live here. Key state and sections:

### Authentication
- Supabase email/password auth
- Staff role check on sign-in via `user.user_metadata.role`
- Admin role required for user management features

### Tabs
| Tab | Purpose |
|-----|---------|
| Inventory | View/edit all items by status (in_storage / listed / sold / claimed / removed) |
| Add Item | Intake form with photo upload, Claude AI identification, metadata |
| Payouts | Track consignor payouts for sold consignment items |
| Tote Requests | View and manage incoming tote pickup requests |
| Users | Admin only — manage ambassador accounts |

### Key Data Model (frontend perspective)
```
donation_items
  ├── id, donation_id, item_description, storage_location
  ├── status: 'in_storage' | 'listed' | 'sold' | 'claimed' | 'removed'
  ├── agreement_type: 'donation' | 'consignment'
  ├── price              -- consignor basis price (used for payout calc)
  ├── retail_price       -- Shopify listing price (Stage 2+)
  ├── shopify_product_id, shopify_variant_id, shopify_order_id
  ├── shopify_payout     -- gross amount paid by buyer
  ├── buyer_name, sold_at
  ├── payout_percentage  -- default 20%
  ├── payout_paid, payout_paid_date
  ├── payout_override    -- manual override amount
  ├── category, metadata (JSONB), item_image_url
  └── notification_sent

item_images            -- multiple images per item (up to 4)
  └── item_id, image_url, display_order

donations
  └── id, donor_id, date_accepted

donors
  └── id, donor_name, donor_email, phone_number, address, participation_status

participation_agreements
  └── first_name, last_name, email, agreement_type, venmo_handle, pdf_url, ...

tote_requests
  └── donor_id, student_name/email/phone/address, status, assigned_to (ambassador)

ambassador_profiles
  └── id (= auth.users.id), full_name, email, active
```

### Payout Logic
- Only `agreement_type = 'consignment'` items owe payouts
- Donation items show N/A for all payout fields
- Amount owed = `payout_override` if set, else `shopify_payout * payout_percentage / 100`
- `totalOwed` in the summary excludes donation items and already-paid items
- CSV export: first column is "Agreement Type"; donation rows show N/A for all calculation fields

### Publishing Flow
1. Staff clicks "Publish" on an `in_storage` item
2. Publish form pre-fills price from `retail_price` if set, else from `price`
3. Calls `shopify-publish` edge function
4. On success: item status → `listed`, `shopify_product_id` and `shopify_variant_id` saved

---

## Build & Deploy

### Standard deploy (most common)
```bash
# From project root
rm -rf dist && ./aws-deploy.sh
```
This runs: validate config → ECR login → `docker build` (Node 20 + Vite) → `docker push` → App Runner auto-picks up new image (1-2 min).

### What aws-deploy.sh does
1. Verifies AWS identity is `user/doyler` — will exit if not
2. Builds Docker image for `linux/amd64` with Supabase credentials baked in as build args
3. Pushes to ECR: `842675982987.dkr.ecr.us-east-1.amazonaws.com/campus-reclaimed:latest`
4. App Runner has `AutoDeploymentsEnabled: true` — it polls ECR and redeploys automatically

### Supabase credentials in the build
The Vite env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are hardcoded in `aws-deploy.sh` (lines 23-24). These are baked into the static bundle at build time — **not** runtime environment variables. To rotate them, update `aws-deploy.sh` and redeploy.

### First-time setup (new environment)
```bash
./aws-deploy.sh setup
```
Creates ECR repo, `AppRunnerECRAccessRole` IAM role, and App Runner service. Only needed once.

### Build only (no push)
```bash
./aws-deploy.sh build
```

### Docker image structure
- Stage 1: `node:20-alpine` — runs `npm install && npm run build` (Vite)
- Stage 2: `nginx:alpine` — serves `/usr/share/nginx/html` on port 8080
- nginx config: SPA fallback (`try_files`), `/health` endpoint (App Runner health check), aggressive asset caching

---

## Supabase Edge Functions

All functions deploy with `--no-verify-jwt`. Auth is handled inside each function as needed.

### Deploy a single function
```bash
supabase functions deploy <function-name> --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn
```

### Deploy all functions
```bash
for fn in analyze-item donor-waiver email-notifications manage-users shopify-publish shopify-webhook submit-agreement suggest-price tote-request; do
  supabase functions deploy $fn --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn
done
```

### Function reference

| Function | Auth required | Purpose |
|----------|--------------|---------|
| `analyze-item` | Staff JWT | Claude Haiku vision → item category + metadata JSON |
| `donor-waiver` | None (legacy) | PDF upload to `waivers` storage bucket |
| `email-notifications` | Optional secret header | 30-day reminder emails via Resend; groups by donor |
| `manage-users` | Admin JWT | Create / list / remove / reset-password ambassador accounts |
| `shopify-publish` | Staff JWT | Create Shopify product, publish to ALL channels, update item status |
| `shopify-webhook` | Shopify HMAC | orders/paid → mark sold; orders/cancelled → revert to listed; products/delete → unlist |
| `submit-agreement` | None (public) | Accept participation agreement PDF, store in `agreements` bucket, link to donor |
| `suggest-price` | Staff JWT | Claude Haiku price suggestion with condition-based floor enforcement |
| `tote-request` | None (public) | Accept tote pickup request, assign to least-loaded ambassador, send 3 emails |

### Required Supabase Secrets
Set in Supabase dashboard → Project Settings → Edge Functions → Secrets:

| Secret | Used by | Notes |
|--------|---------|-------|
| `ANTHROPIC_API_KEY` | analyze-item, suggest-price | Claude Haiku calls |
| `SHOPIFY_ACCESS_TOKEN` | shopify-publish | Admin API token |
| `SHOPIFY_STORE_DOMAIN` | shopify-publish | e.g. `yourstore.myshopify.com` |
| `SHOPIFY_WEBHOOK_SECRET` | shopify-webhook | HMAC verification — fail-closed if missing |
| `RESEND_API_KEY` | email-notifications, submit-agreement, tote-request | Email delivery |
| `NOTIFY_SECRET` | email-notifications | Optional — if set, callers must send `x-notify-secret` header |
| `EMAIL_FROM` | email-notifications | Sender address; defaults to `noreply@campusreclaimed.com` |
| `ORG_NAME` | email-notifications | Defaults to `Campus Reclaimed` |
| `SUPABASE_URL` | all functions | Auto-injected by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | Auto-injected by Supabase runtime |
| `SUPABASE_ANON_KEY` | manage-users | Auto-injected by Supabase runtime |

### shopify-publish details
- Creates Shopify product with title, price, and image
- Fetches all publications via `GET /publications.json` and posts to every one
- 422 response = already published = not an error (idempotent)
- Saves `shopify_product_id`, `shopify_variant_id`, `retail_price`, sets `status = 'listed'`
- Body: `{ itemId, price, retail_price?, title? }`

### shopify-webhook details
- Verifies Shopify HMAC signature (constant-time comparison) — returns 503 if secret not configured
- Logs every event to `shopify_webhook_log`
- `orders/paid` or `orders/create`: matches by `shopify_variant_id` (preferred) or `shopify_product_id`, sets `status='sold'`, records `buyer_name` and `shopify_payout`
- `orders/cancelled`: reverts sold items to `listed`, clears buyer/payout fields
- `products/delete`: sets status back to `in_storage`, clears Shopify IDs and price
- Returns 500 on errors so Shopify retries (handlers are idempotent)

### submit-agreement details
- Public endpoint — no auth required
- Validates PDF via magic byte check (`%PDF-`)
- Throttles: one submission per email per 60 seconds
- Uploads to `agreements` storage bucket with server-generated filename
- Updates `donors.participation_status` if donor email matches
- Also inserts into `donor_waivers` so PDF appears in inventory app
- `agreement_type` must be `'donation'` or `'consignment'`

---

## Database Schema

### Migration order (run once each in Supabase SQL Editor)
1. `migration.sql` — base schema: `donors`, `donations`, `donation_items`
2. `migration-shopify.sql` — adds `status`, `shopify_*`, `price`, `sold_at` to `donation_items`; creates `shopify_webhook_log`
3. `migration-multi-images.sql` — creates `item_images` table, migrates `item_image_url` data
4. `migration-merge-duplicate-donors.sql` — deduplicates donors, adds unique index
5. `sql/migration_buyer_payout.sql` — adds `buyer_name`, `shopify_payout` to `donation_items`
6. `sql/migration_payouts.sql` — adds `payout_percentage`, `payout_paid`, `payout_paid_date`; adds partial index on consignment payouts

### Additional columns added post-migration (run manually)
```sql
-- Stage 1
ALTER TABLE donation_items ADD COLUMN IF NOT EXISTS agreement_type TEXT;
ALTER TABLE donation_items ADD COLUMN IF NOT EXISTS payout_override NUMERIC;
ALTER TABLE donation_items ADD COLUMN IF NOT EXISTS venmo_handle TEXT;

-- Stage 2
ALTER TABLE donation_items ADD COLUMN IF NOT EXISTS retail_price NUMERIC;
```

### Other tables (not in migration files)
- `participation_agreements` — created separately; stores donor agreement submissions
- `donor_waivers` — PDF waiver records linked to donors
- `ambassador_profiles` — mirrors `auth.users` for ambassador management
- `totes` — tote bag inventory
- `tote_requests` — pickup request records

### Storage buckets
| Bucket | Contents | Public |
|--------|----------|--------|
| `inventory` | Item photos | Yes |
| `agreements` | Signed agreement PDFs | Yes (URL-guessed) |
| `waivers` | Legacy waiver PDFs | Yes |

---

## Supabase CLI

```bash
# Link to project (run once after clone)
supabase link --project-ref vkfzeojkxfuehgtwysrn

# Check linked project
cat supabase/.temp/project-ref

# View function logs
supabase functions logs <function-name> --project-ref vkfzeojkxfuehgtwysrn

# Run function locally (requires local Supabase stack)
supabase functions serve <function-name>
```

---

## AWS Infrastructure

| Resource | Name / ID |
|----------|-----------|
| ECR repository | `campus-reclaimed` |
| App Runner service | `campus-reclaimed` |
| IAM role | `AppRunnerECRAccessRole` |
| Region | `us-east-1` |
| Container port | `8080` |
| Health check | `GET /health` → `200 ok` |
| Instance size | 0.25 vCPU / 0.5 GB |

App Runner auto-deploys when a new image is pushed to ECR (no manual trigger needed).

---

## External Services

| Service | Purpose | Config location |
|---------|---------|----------------|
| Shopify | Product listings, order webhooks | Supabase secrets |
| Resend | Transactional email | Supabase secret `RESEND_API_KEY` |
| Anthropic (Claude Haiku) | Item identification, price suggestions | Supabase secret `ANTHROPIC_API_KEY` |
| AWS ECR | Container registry | `aws-deploy.sh` |
| AWS App Runner | Container hosting | `aws-deploy.sh` |

**Resend verified domain:** `campusreclaimed.com`  
**From address used in code:** `noreply@campusreclaimed.com`, `info@campusreclaimed.com`  
**Admin notification email:** `info@campusreclaimed.com`

---

## Key Conventions

- **`price` vs `retail_price`:** `price` is the consignor-basis price used in payout calculations. `retail_price` is what gets listed on Shopify. Both can differ. When publishing, the form pre-fills from `retail_price` if set, falls back to `price`.
- **Agreement type:** `donation` items have no payout obligation. `consignment` items owe the consignor a percentage. The payout UI hides all calculation fields for donation items.
- **Item status flow:** `in_storage` → `listed` (on Shopify publish) → `sold` (on Shopify order webhook) → reverts to `listed` on order cancel. Staff can also set `claimed` or `removed` manually.
- **Image storage:** New items use `item_images` table (multi-image). Legacy items may have `item_image_url` on the row directly. Code checks both.
- **Ambassador assignment:** Tote requests go to the active ambassador with the fewest open `pending`/`in_progress` requests (load balancing).
- **No SKUs currently:** Items created before the ambassador intake system have no SKU. SKU assignment will come with the ambassador intake flow (Stage 3+).

---

## Development Workflow

### Make a frontend change
1. Edit `src/App.jsx`
2. Test locally: `npm run dev` (uses env vars from `.env` if present)
3. Deploy: `rm -rf dist && ./aws-deploy.sh`

### Make an edge function change
1. Edit `supabase/functions/<name>/index.ts`
2. Deploy: `supabase functions deploy <name> --no-verify-jwt --project-ref vkfzeojkxfuehgtwysrn`

### Add a DB column
1. Write the `ALTER TABLE` statement
2. Run it in Supabase SQL Editor (Table Editor → SQL Editor)
3. Update this file under "Additional columns added post-migration"

### Check App Runner deploy status
```bash
aws apprunner list-services --region us-east-1
```

### View edge function logs
```bash
supabase functions logs shopify-webhook --project-ref vkfzeojkxfuehgtwysrn --tail
```
