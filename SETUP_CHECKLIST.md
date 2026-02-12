# Quick Setup Checklist

Follow this checklist to get your inventory system running:

## ☑️ Step 1: Supabase Account & Project

- [ ] Sign up at https://supabase.com (free)
- [ ] Create a new project
- [ ] Wait for project to finish provisioning (~2 minutes)

## ☑️ Step 2: Database Setup

- [ ] Open Supabase dashboard
- [ ] Go to **SQL Editor** tab
- [ ] Copy contents of `supabase/schema.sql`
- [ ] Paste and click "Run"
- [ ] Verify the `inventory_items` table was created (check **Database** → **Tables**)

## ☑️ Step 3: Get API Credentials

- [ ] In Supabase dashboard, go to **Settings** → **API**
- [ ] Copy your **Project URL** (looks like: `https://xxxxx.supabase.co`)
- [ ] Copy your **anon/public** key (long string starting with `eyJ...`)

## ☑️ Step 4: Local Setup

- [ ] Open terminal in the `inventory-app` folder
- [ ] Run: `npm install`
- [ ] Copy `.env.example` to `.env`: `cp .env.example .env`
- [ ] Edit `.env` file and paste your Supabase URL and key
- [ ] Run: `npm run dev`
- [ ] Open http://localhost:5173 in your browser

## ☑️ Step 5: Test the App

- [ ] Fill out the form with test data
- [ ] Upload a test image
- [ ] Click "Add to Inventory"
- [ ] Check Supabase dashboard → **Database** → **Table Editor** → `inventory_items`
- [ ] Verify your test record appears
- [ ] Check **Storage** → `inventory` bucket for your image

## ☑️ Step 6: Deploy (Choose One)

### Option A: Vercel (Recommended)
- [ ] Push code to GitHub
- [ ] Sign up at https://vercel.com
- [ ] Click "New Project" → Import your repo
- [ ] Add environment variables (Supabase URL and key)
- [ ] Click "Deploy"
- [ ] Visit your live URL!

### Option B: Netlify
- [ ] Push code to GitHub  
- [ ] Sign up at https://netlify.com
- [ ] Click "New Site from Git"
- [ ] Select your repo
- [ ] Add environment variables in **Site Settings** → **Build & Deploy** → **Environment**
- [ ] Click "Deploy"

### Option C: Cloudflare Pages
- [ ] Push code to GitHub
- [ ] Sign up at https://pages.cloudflare.com
- [ ] Click "Create a project" → Connect to Git
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Add environment variables
- [ ] Click "Save and Deploy"

## ☑️ Step 7: Email Notifications (Optional)

### Prerequisites:
- [ ] Sign up at https://resend.com (100 free emails/day)
- [ ] Verify your domain OR use their test domain
- [ ] Copy your API key

### Setup:
- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref YOUR_PROJECT_REF`
  - Find your project ref in Supabase dashboard URL
- [ ] Set secret: `supabase secrets set RESEND_API_KEY=your_api_key`
- [ ] Deploy function: `supabase functions deploy email-notifications`

### Create Cron Job:
- [ ] In Supabase dashboard, go to **Database** → **Cron Jobs**
- [ ] Click "New Cron Job"
- [ ] Name: `Send donor notifications`
- [ ] Schedule: `0 9 * * *` (9 AM daily)
- [ ] SQL:
```sql
SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-notifications',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
) as request_id;
```
- [ ] Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY`
- [ ] Click "Create"

## 🎉 You're Done!

Your inventory system is now live and ready to use!

### What You Have:
✅ Beautiful web app for entering inventory  
✅ Database storing all donor and item information  
✅ Image upload and storage  
✅ Automated email notifications (if set up)  
✅ Free hosting with HTTPS  

### Next Steps:
- Share the URL with your team
- Start entering real inventory
- Customize the color scheme (see README)
- Set up a custom domain (optional)

### Need Help?
Check the main README.md file for:
- Troubleshooting
- Customization options
- Security best practices
- Future enhancement ideas

---

**Estimated Setup Time**: 30-45 minutes (including account creation)  
**Cost**: $0 to start, with generous free tiers
