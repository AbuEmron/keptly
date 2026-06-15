import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/* Extracts structured document fields from OCR text (and optionally the image).
   Gated to signed-in Premium users so it can't be abused to burn API credits. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Verify the user
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Sign in required' });

    // 2) Verify Premium (extraction is a paid feature)
    const { data: prof } = await admin.from('profiles').select('plan,status').eq('id', user.id).single();
    const premium = prof && (prof.status === 'active' || prof.status === 'trialing');
    if (!premium) return res.status(402).json({ error: 'Premium required' });

    const { text = '', image = null } = req.body || {};
    if (!text && !image) return res.status(400).json({ error: 'Nothing to read' });

    // 3) Build the message — prefer text (cheap, fast); fall back to the image if no usable text
    const sys = `You extract structured data from a single personal/household document (passport, insurance card, registration, warranty, lease, receipt, medical card, etc.).
Return ONLY a JSON object, no markdown, no prose, with exactly these keys:
{"title": string, "category": one of ["Identity","Insurance","Contracts","Receipts","Warranties","Medical","Property","Other"], "ref": string, "expires": "YYYY-MM-DD" or "", "provider": string, "confidence": 0-1}
Rules: title is a short human label (e.g. "Passport — A. Doe", "Auto Insurance — Northstar"). ref is the most important policy/account/ID number, digits and dashes only. expires is the single most relevant future expiry/renewal date, else "". provider is the issuing company/agency if present, else "". If unsure, use "" and lower confidence. Never invent values.`;

    const content = [];
    if (image && image.data && image.media_type) {
      content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
    }
    content.push({ type: 'text', text: text ? `Document text:\n${text.slice(0, 6000)}` : 'Read the attached document image.' });

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',   // fast + cheap for extraction
      max_tokens: 400,
      system: sys,
      messages: [{ role: 'user', content }]
    });

    // 4) Parse the model's JSON safely
    const raw = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) { return res.status(200).json({ ok: false, error: 'Could not parse document', raw: clean.slice(0, 200) }); }

    // 5) Whitelist the fields we return
    const cats = ['Identity','Insurance','Contracts','Receipts','Warranties','Medical','Property','Other'];
    return res.status(200).json({
      ok: true,
      title: String(parsed.title || '').slice(0, 80),
      category: cats.includes(parsed.category) ? parsed.category : 'Other',
      ref: String(parsed.ref || '').slice(0, 40),
      expires: /^\d{4}-\d{2}-\d{2}$/.test(parsed.expires) ? parsed.expires : '',
      provider: String(parsed.provider || '').slice(0, 60),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
    });
  } catch (e) {
    console.error('extract error', e);
    return res.status(500).json({ error: 'Extraction unavailable' });
  }
}
