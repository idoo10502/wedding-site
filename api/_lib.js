// עזרים משותפים לפונקציות ב-api/ (קובץ שמתחיל ב-_ לא נחשף ככתובת)
import crypto from 'node:crypto';

export const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`חסר משתנה סביבה ${k} ב-Vercel`);
  return v;
};

export const json = (o, status = 200) => Response.json(o, { status });

export const isAdmin = (req) => {
  const k = new URL(req.url).searchParams.get('key') || '';
  const a = Buffer.from(k), b = Buffer.from(env('ADMIN_KEY'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// 050-1234567 / 501234567 / +972501234567 -> 972501234567
export const toIntl = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '972' + d.slice(1);
  else if (d.length === 9 && d.startsWith('5')) d = '972' + d;
  return d;
};

export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'אורח/ת יקר/ה';

// ---------- Google Sheets (דרך ה-Apps Script) ----------
export async function sheet(action, payload = {}) {
  const r = await fetch(env('SHEET_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env('SHEET_SECRET'), action, ...payload }),
    redirect: 'follow',
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error('תשובה לא צפויה מהגיליון: ' + t.slice(0, 200)); }
  if (j.error) throw new Error('גיליון: ' + j.error);
  return j;
}

export const updateGuest = (phone, fields, name) => sheet('update', { phone: String(phone), name, fields });

// ---------- WhatsApp Cloud API ----------
export async function wa(to, body) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env('WA_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('WA_TOKEN'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toIntl(to), ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `WhatsApp ${r.status}`);
  return j;
}

export const waText = (to, text) => wa(to, { type: 'text', text: { body: text } });

export const waButtons = (to, text, buttons) => wa(to, {
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text },
    action: { buttons: buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) },
  },
});

// ---------- חלון שעות לשיחות (שעון ישראל) ----------
export function callWindowOpen(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(now).map(x => [x.type, x.value]));
  const h = Number(p.hour);
  if (p.weekday === 'Sat') return false;
  if (p.weekday === 'Fri') return h >= 10 && h < 13;
  return h >= 10 && h < 20;
}

export const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
export const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const ANSWERED = ['מגיעים', 'לא מגיעים'];
