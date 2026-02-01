/**
 * Circle Snip License Server
 * Handles Stripe payments and license verification
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// License storage (in production, use a real database)
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

// Load or initialize licenses
function loadLicenses() {
    try {
        if (fs.existsSync(LICENSES_FILE)) {
            return JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading licenses:', e);
    }
    return {};
}

function saveLicenses(licenses) {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2));
}

let licenses = loadLicenses();

// CORS for extension
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
}));

// Stripe webhook needs raw body
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const extensionId = session.client_reference_id;
            const customerEmail = session.customer_email;

            if (!extensionId) {
                console.error('No extension ID in session');
                break;
            }

            // Check if subscription or one-time
            if (session.mode === 'subscription') {
                // Monthly subscription
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                licenses[extensionId] = {
                    type: 'monthly',
                    email: customerEmail,
                    subscriptionId: session.subscription,
                    status: 'active',
                    currentPeriodEnd: subscription.current_period_end,
                    createdAt: new Date().toISOString()
                };
                console.log(`✓ Monthly subscription activated for ${extensionId}`);
            } else {
                // Lifetime purchase
                licenses[extensionId] = {
                    type: 'lifetime',
                    email: customerEmail,
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
                console.log(`✓ Lifetime license activated for ${extensionId}`);
            }

            saveLicenses(licenses);
            break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;

            // Find the license with this subscription
            for (const [extId, license] of Object.entries(licenses)) {
                if (license.subscriptionId === subscription.id) {
                    if (subscription.status === 'active') {
                        license.status = 'active';
                        license.currentPeriodEnd = subscription.current_period_end;
                    } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
                        license.status = 'expired';
                    }
                    saveLicenses(licenses);
                    console.log(`Subscription ${subscription.id} status: ${subscription.status}`);
                    break;
                }
            }
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription;

            // Find and mark as expired
            for (const [extId, license] of Object.entries(licenses)) {
                if (license.subscriptionId === subscriptionId) {
                    license.status = 'payment_failed';
                    saveLicenses(licenses);
                    console.log(`Payment failed for ${extId}`);
                    break;
                }
            }
            break;
        }
    }

    res.json({ received: true });
});

// Parse JSON for other routes
app.use(express.json());

// Verify license endpoint (called by extension)
app.get('/verify/:extensionId', (req, res) => {
    const { extensionId } = req.params;
    const license = licenses[extensionId];

    if (!license) {
        return res.json({ valid: false, reason: 'no_license' });
    }

    if (license.type === 'lifetime') {
        return res.json({
            valid: true,
            type: 'lifetime',
            email: license.email
        });
    }

    if (license.type === 'monthly') {
        // Check if subscription is still active
        const now = Math.floor(Date.now() / 1000);
        if (license.status === 'active' && license.currentPeriodEnd > now) {
            return res.json({
                valid: true,
                type: 'monthly',
                email: license.email,
                expiresAt: license.currentPeriodEnd
            });
        } else {
            return res.json({
                valid: false,
                reason: 'subscription_expired',
                email: license.email
            });
        }
    }

    return res.json({ valid: false, reason: 'unknown' });
});

// Create checkout session (called when user clicks buy)
app.post('/create-checkout', async (req, res) => {
    const { extensionId, priceType, successUrl, cancelUrl } = req.body;

    if (!extensionId) {
        return res.status(400).json({ error: 'Extension ID required' });
    }

    try {
        const priceId = priceType === 'monthly'
            ? process.env.STRIPE_MONTHLY_PRICE_ID
            : process.env.STRIPE_LIFETIME_PRICE_ID;

        const sessionConfig = {
            client_reference_id: extensionId,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: priceType === 'monthly' ? 'subscription' : 'payment',
            success_url: successUrl || 'https://circlesnip.com/success',
            cancel_url: cancelUrl || 'https://circlesnip.com/cancel',
            allow_promotion_codes: true
        };

        const session = await stripe.checkout.sessions.create(sessionConfig);
        res.json({ url: session.url });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', licenses: Object.keys(licenses).length });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║       Circle Snip License Server Running          ║
╠═══════════════════════════════════════════════════╣
║  Port: ${PORT}                                        ║
║  Licenses loaded: ${Object.keys(licenses).length.toString().padEnd(30)}║
╚═══════════════════════════════════════════════════╝
    `);
});
