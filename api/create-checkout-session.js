/**
 * Keptly — Create Stripe Checkout Session
 * Vercel env vars needed:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_MONTHLY_ID  (e.g. price_xxx — from Stripe Dashboard → Products)
 *   STRIPE_PRICE_ANNUAL_ID   (e.g. price_yyy)
 *   APP_URL                  (e.g. https://keptly.app)
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { interval, user_id } = req.body;

  const priceId = interval === 'yearly'
    ? (process.env.STRIPE_PRICE_ANNUAL_ID  || 'price_1ThgQ7AEUpuHBUGlp98jO8XG')
    : (process.env.STRIPE_PRICE_MONTHLY_ID || 'price_1ThgQ7AEUpuHBUGlwDuRHNF6');

  if (!priceId) {
    console.error('Missing Stripe price ID for interval:', interval);
    return res.status(500).json({ error: 'Price not configured — add STRIPE_PRICE_MONTHLY_ID / STRIPE_PRICE_ANNUAL_ID to Vercel env' });
  }

  const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user_id,
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 14 },
      success_url: `${baseUrl}/#settings`,
      cancel_url:  `${baseUrl}/#settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
