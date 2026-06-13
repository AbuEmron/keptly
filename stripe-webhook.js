import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Sign in required' });

    const { data: prof } = await admin.from('profiles')
      .select('stripe_customer_id').eq('id', user.id).single();
    if (!prof || !prof.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet' });

    const session = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${process.env.SITE_URL}/app.html#settings`
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('portal error', e);
    return res.status(500).json({ error: 'Could not open billing portal' });
  }
}
