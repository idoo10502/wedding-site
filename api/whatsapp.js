// Webhook של וואטסאפ: מקבל את תשובות האורחים ומעדכן את רשימת המוזמנים
import { env, hmacHex, safeEq, updateGuest, getGuest, invitedOf, waButtons, waList, waText } from './_lib.js';

// הכפתורים בתבנית (חייבים להיות זהים לטקסט בתבנית ב-Meta)
const YES = 'מגיעים';
const NO = 'לא נוכל להגיע';
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

const askDiet = (to, n) => waButtons(to,
  n > 1 ? 'מעולה, נתראה בשמחה. צריך מנה מיוחדת?' : 'מעולה, נתראה בשמחה. איזו מנה תרצו?',
  [['diet:regular', 'רגילה'], ['diet:veg', 'צמחונית'], ['diet:vegan', 'טבעונית']]);

async function handle(m, profileName) {
  const from = m.from;
  const reply = String(
    m.type === 'button' ? m.button?.text :
    m.type === 'interactive' ? (m.interactive?.button_reply?.id || m.interactive?.list_reply?.id) :
    m.type === 'text' ? m.text?.body : ''
  ).trim();
  if (!reply) return;

  if (reply === YES) {
    const invited = invitedOf(await getGuest(from));
    if (invited === 1) {
      await updateGuest(from, { 'סטטוס': 'מגיעים', 'כמות מאושרת': 1, 'ערוץ': 'וואטסאפ' }, profileName);
      return askDiet(from, 1);
    }
    await updateGuest(from, { 'סטטוס': 'מגיעים', 'כמות מאושרת': invited, 'ערוץ': 'וואטסאפ' }, profileName);
    const n = Math.min(invited, 10);
    const rows = Array.from({ length: n }, (_, i) => [`count:${i + 1}`, i === 0 ? 'אחד/ת' : `${i + 1}`]);
    return waList(from, `כמה תהיו? (הוזמנתם ${invited})`, 'בחירת כמות', rows);
  }

  if (reply === NO) {
    await updateGuest(from, { 'סטטוס': 'לא מגיעים', 'כמות מאושרת': 0, 'ערוץ': 'וואטסאפ' }, profileName);
    return waText(from, 'תודה שעדכנתם, נתגעגע.');
  }

  if (reply.startsWith('count:')) {
    const n = Math.max(1, Number(reply.slice(6)) || 1);
    await updateGuest(from, { 'כמות מאושרת': n });
    return askDiet(from, n);
  }

  if (DIETS[reply]) {
    await updateGuest(from, { 'מנה': DIETS[reply] });
    return waText(from, 'רשמנו. תודה ונתראה ב-28.06 בסופיה, באר שבע. אם יש עוד משהו (למשל כמה מנות טבעוניות), כתבו כאן.');
  }

  // טקסט חופשי: נשמר בהערות, בלי מענה אוטומטי
  await updateGuest(from, { 'הערות': reply.slice(0, 500) }, profileName);
}
