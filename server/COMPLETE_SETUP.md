# Circle Snip Complete Setup Guide

**Total time: ~20 minutes**  
**You will do this ONCE, then everything runs forever.**

---

## OVERVIEW: What We're Setting Up

```
┌──────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Your Extension  │ ──▶ │   Railway    │ ◀── │     Stripe      │
│  (Chrome Store)  │     │   (Server)   │     │   (Payments)    │
└──────────────────┘     └──────────────┘     └─────────────────┘
```

**Order matters. Follow these steps in order.**

---

# STEP 1: Create a Stripe Account (5 min)

1. Go to **https://stripe.com**
2. Click **"Start now"** (top right)
3. Enter your email and create password
4. Verify your email
5. You're now in the Stripe Dashboard

**Don't close Stripe - we'll come back to it.**

---

# STEP 2: Create Stripe Products (5 min)

### 2A. Create Monthly Subscription Product

1. In Stripe Dashboard, click **"Products"** in left sidebar
2. Click **"+ Add product"** button (top right)
3. Fill in:
   - **Name:** `Circle Snip Pro - Monthly`
   - **Description:** `Monthly subscription to Circle Snip Pro`
4. Under **"Price information"**:
   - **Pricing model:** Standard pricing
   - **Price:** `2.99` (or your chosen price)
   - **Currency:** USD
   - **Billing period:** Monthly
   - **☑️ Check "Recurring"**
5. Click **"Save product"**
6. **IMPORTANT:** On the product page, find the **Price ID** 
   - It looks like: `price_1ABC123def456...`
   - Copy this and save it somewhere (Notepad)
   - Label it: "MONTHLY PRICE ID"

### 2B. Create Lifetime License Product

1. Click **"Products"** → **"+ Add product"** again
2. Fill in:
   - **Name:** `Circle Snip Pro - Lifetime`
   - **Description:** `Lifetime license for Circle Snip Pro`
3. Under **"Price information"**:
   - **Pricing model:** Standard pricing
   - **Price:** `19.99` (or your chosen price)
   - **Currency:** USD
   - **☐ Make sure "Recurring" is NOT checked** (this is one-time)
5. Click **"Save product"**
6. Copy the **Price ID** and save it
   - Label it: "LIFETIME PRICE ID"

**You should now have TWO Price IDs saved in Notepad.**

---

# STEP 3: Get Your Stripe API Keys (1 min)

1. In Stripe Dashboard, click **"Developers"** (bottom left)
2. Click **"API keys"**
3. You'll see two keys:
   - **Publishable key:** starts with `pk_test_...`
   - **Secret key:** click "Reveal" → starts with `sk_test_...`
4. Copy the **Secret key** and save it in Notepad
   - Label it: "STRIPE SECRET KEY"

**Your Notepad should now have:**
```
MONTHLY PRICE ID: price_1ABC...
LIFETIME PRICE ID: price_1XYZ...
STRIPE SECRET KEY: sk_test_...
```

---

# STEP 4: Create GitHub Account (2 min) - Skip if you have one

1. Go to **https://github.com**
2. Click **"Sign up"**
3. Follow the steps to create account
4. Verify your email

---

# STEP 5: Upload Server to GitHub (3 min)

### 5A. Create New Repository

1. Go to **https://github.com/new**
2. Fill in:
   - **Repository name:** `circle-snip-server`
   - **Description:** `Payment server for Circle Snip extension`
   - **☑️ Select "Private"** (keeps your code private)
3. Click **"Create repository"**
4. **Stay on this page** - you'll see instructions

### 5B. Upload Your Server Files

**Option A: Using GitHub's Upload Feature (Easiest)**

1. On your new repo page, click **"uploading an existing file"** link
2. Open File Explorer and go to:
   ```
   C:\Users\codya\.gemini\antigravity\scratch\circle-snip\server
   ```
3. Select ALL files in this folder:
   - `server.js`
   - `package.json`
   - `railway.json`
   - `Procfile`
   - `.gitignore`
   - `.env.example`
4. Drag them into the GitHub upload area
5. Click **"Commit changes"**

**Option B: Using Git Command Line**

Open PowerShell and run:
```powershell
cd C:\Users\codya\.gemini\antigravity\scratch\circle-snip\server
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/circle-snip-server.git
git push -u origin main
```

---

# STEP 6: Create Railway Account & Deploy (5 min)

### 6A. Sign Up for Railway

1. Go to **https://railway.app**
2. Click **"Login"** (top right)
3. Click **"Login with GitHub"**
4. Authorize Railway to access your GitHub
5. You're now in Railway Dashboard

### 6B. Deploy Your Server

1. Click **"New Project"** (or the + button)
2. Select **"Deploy from GitHub repo"**
3. Find and select **`circle-snip-server`**
4. Railway will start deploying (you'll see progress)

### 6C. Add Environment Variables (CRITICAL)

1. In your Railway project, click on your service (the purple box)
2. Click **"Variables"** tab
3. Click **"+ New Variable"** and add these ONE BY ONE:

| Variable Name | Value (paste from your Notepad) |
|--------------|-----------------------------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` (your secret key) |
| `STRIPE_MONTHLY_PRICE_ID` | `price_...` (monthly price ID) |
| `STRIPE_LIFETIME_PRICE_ID` | `price_...` (lifetime price ID) |
| `STRIPE_WEBHOOK_SECRET` | (we'll add this in Step 7) |

4. Railway will automatically redeploy after adding variables

### 6D. Get Your Server URL

1. In Railway, click **"Settings"** tab
2. Scroll to **"Domains"**
3. Click **"Generate Domain"**
4. You'll get a URL like: `https://circle-snip-server-production-abc123.up.railway.app`
5. **COPY THIS URL** and save it in Notepad
   - Label it: "SERVER URL"

---

# STEP 7: Connect Stripe Webhook (3 min)

This tells Stripe to notify your server when someone pays.

1. Go to Stripe Dashboard → **"Developers"** → **"Webhooks"**
2. Click **"+ Add endpoint"**
3. Fill in:
   - **Endpoint URL:** `YOUR_SERVER_URL/webhook`
     - Example: `https://circle-snip-server-production-abc123.up.railway.app/webhook`
   - Click **"+ Select events"**
   - Check these events:
     - ☑️ `checkout.session.completed`
     - ☑️ `customer.subscription.updated`
     - ☑️ `customer.subscription.deleted`
     - ☑️ `invoice.payment_failed`
4. Click **"Add endpoint"**
5. On the webhook page, click **"Reveal"** under Signing secret
6. Copy the secret (starts with `whsec_...`)
7. Go back to Railway → Variables tab
8. Add new variable:
   - Name: `STRIPE_WEBHOOK_SECRET`
   - Value: `whsec_...` (the secret you just copied)

---

# STEP 8: Test Your Server (1 min)

1. Open your browser
2. Go to: `YOUR_SERVER_URL/health`
   - Example: `https://circle-snip-server-production-abc123.up.railway.app/health`
3. You should see:
   ```json
   {"status":"ok","licenses":0}
   ```

**If you see this, YOUR SERVER IS WORKING! 🎉**

---

# STEP 9: Update Extension with Server URL (1 min)

Now we need to tell your Chrome extension where your server is.

I will update the extension code with your server URL.

**Tell me your Railway server URL** (the one from Step 6D) and I will update the extension for you.

---

# STEP 10: Submit to Chrome Web Store

1. Go to **https://chrome.google.com/webstore/devconsole**
2. Pay $5 one-time developer fee
3. Click **"New Item"**
4. Upload your extension's ZIP file
5. Fill in store listing details
6. Submit for review

---

# ✅ DONE!

After completing these steps:
- Your server runs 24/7 on Railway
- Stripe handles all payments
- Extension verifies licenses automatically
- Users can purchase and use Circle Snip Pro

**Total ongoing cost: ~$5/month** (Railway)

---

# Quick Reference

| Item | Value | 
|------|-------|
| Server URL | `https://...up.railway.app` |
| Monthly Price | $2.99/month |
| Lifetime Price | $19.99 one-time |
| Railway Cost | ~$5/month |
| Stripe Fee | 2.9% + 30¢ per transaction |

---

# Need Help?

If something doesn't work, check:
1. Railway logs: Click your service → "Logs" tab
2. Stripe webhook logs: Developers → Webhooks → click your endpoint
3. Browser console: Right-click → Inspect → Console

