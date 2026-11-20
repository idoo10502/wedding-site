// שליחת הזמנה בוואטסאפ לכל מי שעוד לא קיבל
// תצוגה מקדימה:  /api/send-whatsapp?key=ADMIN_KEY&dry=1
// שליחה:         /api/send-whatsapp?key=ADMIN_KEY&limit=50
import { env, json, isAdmin, sheet, wa, updateGuest, displayName, ANSWERED } from './_lib.js';

export async function GET(req) {
  try {
    if (!isAdmin(req)) return json({ error: 'unauthorized' }, 401);
    const q = new URL(req.url).searchParams;
    const limit = Math.min(Number(q.get('limit')) || 50, 200);

    const { guests } = await sheet('list');
    const todo = guests.filter(g => !ANSWERED.includes(g['סטטוס']) && !g['וואטסאפ נשלח']).slice(0, limit);

    if (q.get('dry') === '1') return json({ wouldSend: todo.length, guests: todo.map(g => g['שם מלא']) });

    const sent = [], failed = [];
    for (const g of todo) {
      try {
        await wa(g['טלפון'], {
          type: 'template',
          template: {
            name: env('WA_TEMPLATE'),
            language: { code: process.env.WA_LANG || 'he' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: displayName(g['שם מלא']) }] }],
          },
        });
        await updateGuest(g['טלפון'], { 'סטטוס': 'נשלח וואטסאפ', 'וואטסאפ נשלח': new Date().toISOString() });
        sent.push(g['שם מלא']);
      } catch (e) {
        failed.push({ name: g['שם מלא'], error: e.message });
      }
    }
    return json({ sent: sent.length, failed });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
