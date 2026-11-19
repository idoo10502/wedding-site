// Webhook של וואטסאפ: מקבל את תשובות האורחים ומעדכן את הגיליון
import { env, json, hmacHex, safeEq, updateGuest, waButtons, waText } from './_lib.js';

// הכפתורים בתבנית (חייבים להיות זהים לטקסט בתבנית ב-Meta)
const TEMPLATE_REPLIES = {
  'מגיע/ה לבד': { 'סטטוס': 'מגיעים', 'כמות': 1 },
  'מגיעים זוג': { 'סטטוס': 'מגיעים', 'כמות': 2 },
  'לא נוכל להגיע': { 'סטטוס': 'לא מגיעים', 'כמות': 0 },
};
const DIETS = { 'diet:regular': 'רגילה', 'diet:veg': 'צמחונית', 'diet:vegan': 'טבעונית' };

// אימות ה-Webhook מול Meta
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === env('WA_VERIFY_TOKEN')) {
    return new Response(q.get('hub.challenge'));
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req) {
  const raw = await req.text();
  if (process.env.WA_APP_SECRET) {
    const sig = (req.headers.get('x-hub-signature-256') || '').replace('sha256=', '');
    if (!safeEq(sig, hmacHex(process.env.WA_APP_SECRET, raw))) return new Response('bad signature', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }

  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        try { await handle(m, names[m.from]); } catch (e) { console.error('whatsapp', m.from, e.message); }
      }
    }
  }
  return new Response('ok'); // תמיד 200, אחרת Meta שולח שוב
}

async function handle(m, profileName) {
  const from = m.from;
  const reply =
    m.type === 'button' ? m.button?.text :
    m.type === 'interactive' ? m.interactive?.button_reply?.id :
    m.type === 'text' ? m.text?.body : '';
  if (!reply) return;

  const t = TEMPLATE_REPLIES[reply.trim()];
  if (t) {
    await updateGuest(from, { ...t, 'ערוץ': 'וואטסאפ' }, profileName);
    if (t['סטטוס'] === 'מגיעים') {
      await waButtons(from, 'איזה כיף, נתראה בשמחה. איזו מנה תרצו?', [
        ['diet:regular', 'רגילה'], ['diet:veg', 'צמחונית'], ['diet:vegan', 'טבעונית'],
      ]);
    } else {
      await waText(from, 'תודה שעדכנתם, נתגעגע.');
    }
    return;
  }
  if (DIETS[reply]) {
    await updateGuest(from, { 'מנה': DIETS[reply] });
    await waText(from, 'רשמנו. תודה ונתראה ב-28.06 בסופיה, באר שבע.');
    return;
  }
  // טקסט חופשי: נשמר בהערות, בלי מענה אוטומטי
  await updateGuest(from, { 'הערות': String(reply).slice(0, 500) }, profileName);
}
