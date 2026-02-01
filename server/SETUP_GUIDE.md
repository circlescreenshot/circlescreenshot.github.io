# Circle Snip Pro - Payment Setup Guide

## Complete Setup Checklist

Follow these steps to enable fully automated payments:

---

## 1. Create Stripe Account

1. Go to [stripe.com](https://stripe.com) and create an account
2. Complete business verification
3. Navigate to [Dashboard > API Keys](https://dashboard.stripe.com/apikeys)
4. Copy your **Secret Key** (starts with `sk_live_` or `sk_test_`)

---

## 2. Create Products in Stripe

### Monthly Subscription ($1.99/month)

1. Go to [Products](https://dashboard.stripe.com/products)
2. Click **+ Add Product**
3. Name: `Circle Snip Pro Monthly`
4. Pricing: **Recurring** > $1.99 USD / month
5. Click **Save product**
6. Copy the **Price ID** (starts with `price_`)

### Lifetime Purchase ($4.99)

1. Click **+ Add Product**
2. Name: `Circle Snip Pro Lifetime`
3. Pricing: **One time** > $4.99 USD
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_`)

---

## 3. Configure Your Server

### Create `.env` file

Copy `.env.example` to `.env` and fill in:

```env
STRIPE_SECRET_KEY=sk_live_your_actual_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxxxxx
STRIPE_LIFETIME_PRICE_ID=price_xxxxxxxxxxxxxxxx
PORT=3000
```

---

## 4. Deploy the Server

### Option A: Railway (Recommended - Free tier available)

1. Go to [railway.app](https://railway.app)
2. Connect your GitHub
3. Create new project from the `server` folder
4. Add environment variables from step 3
5. Deploy - you'll get a URL like `https://circle-snip-server.up.railway.app`

### Option B: Render

1. Go to [render.com](https://render.com)
2. New Web Service > Connect repo
3. Select `server` folder
4. Add environment variables
5. Deploy

### Option C: Local Development (Testing Only)

```bash
cd server
npm install
npm start
```

For local testing, use [ngrok](https://ngrok.com) to expose your server:
```bash
ngrok http 3000
```

---

## 5. Set Up Stripe Webhook

1. Go to [Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **+ Add endpoint**
3. Endpoint URL: `https://your-server-url.com/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add it to your server's `.env` as `STRIPE_WEBHOOK_SECRET`

---

## 6. Update Extension

In `content_script.js`, update the LICENSE_SERVER URL:

```javascript
const LICENSE_SERVER = 'https://your-deployed-server-url.com';
```

---

## 7. Test the Flow

### Test Mode (Recommended First)

1. Use Stripe test keys (`sk_test_...`)
2. Use test card: `4242 4242 4242 4242`
3. Any future expiry, any CVC

### Test Cases

1. **Monthly subscription**: 
   - Purchase → Should unlock
   - Cancel in Stripe dashboard → Should expire after period ends

2. **Lifetime purchase**:
   - Purchase → Should unlock forever

3. **Offline mode**:
   - Purchase → Go offline → Should still work (7-day cache)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                │
└─────────────────────────────────────────────────────────────────┘

1. User uses 3 free captures
         │
         ▼
2. Upgrade modal appears
         │
         ▼
3. User clicks "Monthly" or "Lifetime"
         │
         ▼
4. Extension calls your server `/create-checkout`
         │
         ▼
5. Server creates Stripe Checkout session
         │
         ▼
6. User redirected to Stripe payment page
         │
         ▼
7. User pays → Stripe sends webhook to your server
         │
         ▼
8. Server saves license (extension ID → active)
         │
         ▼
9. Next time extension opens, it calls `/verify/{id}`
         │
         ▼
10. Server returns { valid: true } → User has Pro access!
```

---

## Troubleshooting

### "License check failed"
- Ensure your server is running and accessible
- Check CORS settings allow requests from extensions

### "Webhook not received"
- Verify webhook URL is correct
- Check Stripe webhook logs for errors
- Ensure signing secret matches

### "Payment succeeded but no license"
- Check server logs for webhook events
- Verify webhook is receiving `checkout.session.completed`
- Check that `client_reference_id` (extension ID) is being passed

---

## Security Notes

1. **Never expose your Stripe secret key** in client-side code
2. **Always verify webhooks** using the signing secret
3. **Use HTTPS** for your server in production
4. **License cache** expires after 7 days for security

---

## Support

For issues:
1. Check Stripe Dashboard > Webhooks for errors
2. Check your server logs
3. Verify all environment variables are set

---

## Going Live

1. Switch from test keys to live keys
2. Test with a real payment ($1)
3. Refund yourself in Stripe dashboard
4. You're live! 🎉
