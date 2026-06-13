# AVENOR — Cloud Setup: Supabase + Stripe (≈45 minutes)

Do these in order. Nothing here requires writing code — everything is already in the package.

## Step 1 — Supabase (10 min)

Create a new project at supabase.com (name it `avenor`, pick the region closest to NY — `us-east-1`). When it's ready, open **SQL Editor → New query**, paste the entire contents of `supabase-schema.sql`, and Run. You should see "Success" — that creates the profiles table, the user_state table, row-level security, and the auto-profile trigger.

Then grab two values from **Project Settings → API**: the **Project URL** and the **anon public key**. Open `config.js` in your repo and paste them in. Commit. That alone enables sign-in.

One auth setting: go to **Authentication → Providers → Email** and confirm Email is enabled (it is by default). The app uses 6-digit email codes, which work out of the box on Supabase's built-in mailer — fine for launch, swap in a custom SMTP later if codes start landing in spam.

## Step 2 — Stripe products (10 min)

In the Stripe Dashboard (start in **Test mode**), go to Product catalog → Add product: name it **AVENOR Premium**, add two recurring prices — **$6.00 monthly** and **$48.00 yearly**. Copy both price IDs (they look like `price_1Abc...`). The 14-day free trial is already coded into the checkout session, so don't configure a trial on the price itself.

## Step 3 — Vercel environment variables (10 min)

In your Vercel project → Settings → Environment Variables, add all of these (Production + Preview):

```
SUPABASE_URL                = https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY   = (Supabase → Project Settings → API → service_role — keep secret)
STRIPE_SECRET_KEY           = sk_test_...  (Stripe → Developers → API keys)
STRIPE_WEBHOOK_SECRET       = whsec_...    (created in Step 4)
STRIPE_PRICE_MONTHLY        = price_...
STRIPE_PRICE_YEARLY         = price_...
SITE_URL                    = https://your-domain.com   (no trailing slash)
```

The service role key bypasses row-level security — it lives only in Vercel env vars, never in the client. Same pattern as your Anthropic key on Wireway.

Push the repo (now containing `package.json` and the `api/` folder) — Vercel will detect the functions and install `stripe` + `@supabase/supabase-js` automatically. Redeploy after saving env vars.

## Step 4 — Stripe webhook (5 min)

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- Endpoint URL: `https://your-domain.com/api/stripe-webhook`
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

After creating it, copy the **Signing secret** (`whsec_...`) into the `STRIPE_WEBHOOK_SECRET` env var in Vercel and redeploy. This webhook is the single source of truth for who's Premium — it writes plan/status into the profiles table, and the app reads it from there.

## Step 5 — Test the full loop (10 min)

1. Open the live site → Settings → **Sign in / Create account** → enter your email → enter the 6-digit code.
2. You'll see the Free plan card. Tap **$6 / month** → Stripe Checkout opens → pay with test card `4242 4242 4242 4242`, any future date, any CVC.
3. You're redirected back to Settings. Within a few seconds the webhook fires; sign out/in or reload — the card should show **Premium · trial** with the trial end date.
4. Add a goal on your phone, open the site on desktop, sign in — the "Two versions found" sheet (or instant restore) proves sync works.
5. Tap **Manage billing** → Stripe portal opens → cancel → reload → back to Free. Loop verified.

When everything passes, flip Stripe to **Live mode**, create the same product/prices there, swap `STRIPE_SECRET_KEY`, the two price IDs, and make a new live webhook + secret. Test keys and live keys are completely separate worlds — every value changes.

## How the pieces fit

Sign-in is passwordless email codes via Supabase Auth. The entire life record syncs as one JSON document per user (`user_state` table) — last write wins, debounced two seconds after any change, gated to Premium. Subscription status lives in `profiles`, written only by the Stripe webhook using the service role, read-only to the user. Free plan keeps everything working offline forever, holds 25 vault documents; Premium unlocks sync and unlimited vault. When the Family Tier comes, the migration path is splitting `user_state` into shared tables with a `household_id` — the schema comment marks the spot.

## Gotchas to expect

If checkout returns "Sign in required," the access token expired — sign out/in. If Premium doesn't activate after a test payment, check Stripe → Webhooks → your endpoint → recent deliveries for the error (usually a wrong `STRIPE_WEBHOOK_SECRET` or you forgot to redeploy after adding it). If sync says "Sync error," open the browser console — the most common cause is the SQL not having been run, so the `user_state` table doesn't exist.
