// שיחת AI (ElevenLabs) לאורחים שלא ענו בוואטסאפ
// תצוגה מקדימה:  /api/call-pending?key=ADMIN_KEY&dry=1
// התקשרות:       /api/call-pending?key=ADMIN_KEY&limit=10
// פרמטרים: hours=48 (כמה זמן לחכות אחרי הוואטסאפ), max=3 (ניסיונות לאורח),
//          all=1 (גם למי שלא קיבל וואטסאפ), force=1 (התעלמות מחלון השעות)
import { env, json, isAdmin, sheet, updateGuest, toIntl, firstName, callWindowOpen, ANSWERED } from './_lib.js';

export async function GET(req) {
  try {
    if (!isAdmin(req)) return json({ error: 'unauthorized' }, 401);
    const q = new URL(req.url).searchParams;
    const dry = q.get('dry') === '1';
    const limit = Math.min(Number(q.get('limit')) || 10, 50);
    const hours = Number(q.get('hours') ?? 48);
    const max = Number(q.get('max')) || 3;

    if (!dry && q.get('force') !== '1' && !callWindowOpen()) {
      return json({ error: 'מחוץ לשעות השיחה: א-ה 10:00-20:00, ו 10:00-13:00, לא בשבת' }, 400);
    }

    const cutoff = Date.now() - hours * 3600e3;
    const { guests } = await sheet('list');
    const todo = guests.filter(g => {
      if (ANSWERED.includes(g['סטטוס'])) return false;
      if ((Number(g['ניסיונות שיחה']) || 0) >= max) return false;
      const sentAt = Date.parse(g['וואטסאפ נשלח']);
      if (!sentAt) return q.get('all') === '1';
      return sentAt <= cutoff;
    }).slice(0, limit);

    if (dry) return json({ wouldCall: todo.length, guests: todo.map(g => g['שם']) });

    const called = [], failed = [];
    for (const g of todo) {
      const intl = toIntl(g['טלפון']);
      try {
        const r = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
          method: 'POST',
          headers: { 'xi-api-key': env('ELEVEN_API_KEY'), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: env('ELEVEN_AGENT_ID'),
            agent_phone_number_id: env('ELEVEN_PHONE_ID'),
            to_number: '+' + intl,
            conversation_initiation_client_data: {
              dynamic_variables: { guest_name: firstName(g['שם']), guest_phone: intl },
            },
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success === false) throw new Error(j.message || j.detail?.message || JSON.stringify(j.detail || r.status));
        await updateGuest(g['טלפון'], { 'ניסיונות שיחה': (Number(g['ניסיונות שיחה']) || 0) + 1 });
        called.push(g['שם']);
      } catch (e) {
        failed.push({ name: g['שם'], error: e.message });
      }
    }
    return json({ called: called.length, failed });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
