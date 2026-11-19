// Post-call webhook של ElevenLabs: שומר את תוצאת השיחה בגיליון
import { json, hmacHex, safeEq, updateGuest } from './_lib.js';

const ATTENDING = { 'מגיעים': 'מגיעים', 'לא מגיעים': 'לא מגיעים' };
const DIETS = ['רגילה', 'צמחונית', 'טבעונית'];

export async function POST(req) {
  const raw = await req.text();

  // אימות חתימה: header "ElevenLabs-Signature: t=<ts>,v0=<hmac(ts.body)>"
  const secret = process.env.ELEVEN_WEBHOOK_SECRET;
  if (secret) {
    const parts = Object.fromEntries((req.headers.get('elevenlabs-signature') || '').split(',').map(s => s.split('=')));
    const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 30 * 60;
    if (!fresh || !safeEq(parts.v0 || '', hmacHex(secret, `${parts.t}.${raw}`))) {
      return json({ error: 'bad signature' }, 401);
    }
  }

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  if (body.type !== 'post_call_transcription') return json({ ok: true });

  const d = body.data || {};
  const vars = d.conversation_initiation_client_data?.dynamic_variables || {};
  const phone = vars.guest_phone;
  if (!phone) return json({ ok: true, skipped: 'no guest_phone' });

  const r = d.analysis?.data_collection_results || {};
  const val = (k) => r[k]?.value;
  const status = ATTENDING[String(val('attending') || '').trim()];
  const summary = d.analysis?.transcript_summary || '';

  try {
    if (status) {
      const fields = { 'סטטוס': status, 'ערוץ': 'שיחה', 'הערות': summary.slice(0, 500) };
      fields['כמות'] = status === 'מגיעים' ? Math.max(1, Number(val('guests')) || 1) : 0;
      if (status === 'מגיעים' && DIETS.includes(val('diet'))) fields['מנה'] = val('diet');
      await updateGuest(phone, fields);
    } else {
      await updateGuest(phone, { 'הערות': ('שיחה בלי תשובה ברורה. ' + summary).slice(0, 500) });
    }
  } catch (e) {
    console.error('call-webhook', phone, e.message);
    return json({ error: e.message }, 500); // ElevenLabs ינסה שוב
  }
  return json({ ok: true });
}
