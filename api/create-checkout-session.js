import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verify the signed-in user from their Supabase access token
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sign in required' });

    const interval = (req.body && req.body.interval) === 'yearly' ? 'yearly' : 'monthly';
    const price = interval === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;

    // Reuse or create the Stripe customer for this user
    const { data: prof } = await admin.from('profiles')
      .select('stripe_customer_id').eq('id', user.id).single();
    let customerId = prof && prof.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { user_id: user.id }
      },
      allow_promotion_codes: true,
      success_url: `${process.env.SITE_URL}/app.html#settings`,
      cancel_url: `${process.env.SITE_URL}/app.html#settings`
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: 'Could not start checkout' });
  }
}
