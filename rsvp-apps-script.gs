// Google Apps Script: אישורי הגעה מהאתר + רשימת המוזמנים לוואטסאפ ולשיחות
// חייב להיווצר מתוך גיליון אישורי ההגעה: תוספים > Apps Script
// הגדרה חד-פעמית: Project Settings > Script Properties > הוסיפו SECRET עם מחרוזת אקראית ארוכה

// גיליון "רשימת מוזמנים - חתונה עידו ותאיר" (כל הלשוניות בו נסרקות)
const GUESTS_SPREADSHEET_ID = '1OtdGZ6wTjv9Fa05SEVq1VLtnA1SY5IKLwUVpilTufV0';
// עמודות שהמערכת מוסיפה בסוף כל לשונית (אחרי העמודות הקיימות, לא נוגעת בהן)
const STATUS_HEADERS = ['סטטוס', 'כמות מאושרת', 'מנה', 'ערוץ', 'וואטסאפ נשלח', 'ניסיונות שיחה', 'עודכן', 'הערות'];
const UNKNOWN_TAB = 'לא ברשימה';

const RSVP_SHEET = 'אישורי הגעה';
const RSVP_HEADERS = ['תאריך', 'שם', 'טלפון', 'מגיעים', 'כמות', 'הערה', 'צמחוני/טבעוני'];

function doPost(e) {
  if (e && e.postData && e.postData.type === 'application/json') return api_(JSON.parse(e.postData.contents));
  return handle_(e);
}

// בדיקה מהדפדפן: <כתובת ה-exec>?name=בדיקה&attending=מגיע/ה&guests=1&diet=טבעוני
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.name) return ContentService.createTextOutput('ok: הסקריפט פעיל');
  return handle_(e);
}

// ---------- טופס האתר ----------
function handle_(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. צרו אותו מתוך הגיליון: תוספים > Apps Script');
    let sh = ss.getSheetByName(RSVP_SHEET);
    if (!sh) { sh = ss.insertSheet(RSVP_SHEET); sh.setRightToLeft(true); sh.setFrozenRows(1); }
    sh.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
    const p = (e && e.parameter) || {};
    const diet = (p.diet === 'צמחוני' || p.diet === 'טבעוני') ? p.diet : 'לא';
    sh.appendRow([new Date(), p.name || '', p.phone ? "'" + p.phone : '', p.attending || '',
                  Number(p.guests || 0), p.note || '', diet]);
    let synced = '';
    try { synced = syncFromSite_(p, diet); } catch (err) { synced = ' (סנכרון לרשימה נכשל: ' + err.message + ')'; }
    return ContentService.createTextOutput('ok: נשמר' + synced);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.message);
  }
}

// ---------- API לשרת (Vercel): וואטסאפ ושיחות ----------
function api_(b) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) throw new Error('unauthorized');

    if (b.action === 'list') return json_({ guests: allGuests_().map(x => x.guest) });

    if (b.action === 'get') {
      const hit = allGuests_().find(x => norm_(x.guest['טלפון']) === norm_(b.phone));
      return json_({ guest: hit ? hit.guest : null });
    }

    if (b.action === 'update') return json_(updateGuest_(b.phone, b.fields, b.name, true));
    throw new Error('unknown action');
  } catch (err) {
    return json_({ error: err.message });
  }
}

// אישור מהאתר עם טלפון: מסמן גם ברשימת המוזמנים, כדי שלא יקבל וואטסאפ ושיחה
function syncFromSite_(p, diet) {
  if (!p.phone || norm_(p.phone).length < 11) return '';
  const coming = p.attending === 'מגיע/ה';
  const fields = {
    'סטטוס': coming ? 'מגיעים' : 'לא מגיעים',
    'כמות מאושרת': coming ? Math.max(1, Number(p.guests) || 1) : 0,
    'ערוץ': 'אתר',
  };
  if (coming) fields['מנה'] = diet === 'צמחוני' ? 'צמחונית' : diet === 'טבעוני' ? 'טבעונית' : 'רגילה';
  if (p.note) fields['הערות'] = String(p.note).slice(0, 500);
  const r = updateGuest_(p.phone, fields, p.name, false);
  return r.updated ? ' + עודכן ברשימת המוזמנים' : ' (הטלפון לא נמצא ברשימת המוזמנים)';
}

function updateGuest_(phone, fieldsIn, name, createIfMissing) {
    const key = norm_(phone);
    const hits = allGuests_().filter(x => norm_(x.guest['טלפון']) === key);
    if (!hits.length && !createIfMissing) return { ok: true, updated: 0 };
    if (!hits.length) { // מספר שלא ברשימה: נכנס ללשונית "לא ברשימה"
      const ss = SpreadsheetApp.openById(GUESTS_SPREADSHEET_ID);
      let sh = ss.getSheetByName(UNKNOWN_TAB);
      if (!sh) {
        sh = ss.insertSheet(UNKNOWN_TAB);
        sh.setRightToLeft(true);
        sh.getRange(1, 1, 1, 4).setValues([['שם מלא', 'טלפון', 'קירבה', 'מוזמנים']]);
      }
      const local = key.startsWith('972') ? '0' + key.slice(3) : key;
    sh.appendRow([name || '', "'" + local, 'לא ברשימה', 1]);
      const head = ensureHeaders_(sh);
      hits.push({ sh, row: sh.getLastRow(), head });
    }
    const fields = Object.assign({}, fieldsIn, { 'עודכן': new Date() });
    hits.forEach(({ sh, row, head }) => {
      Object.keys(fields).forEach(h => {
        const c = head.indexOf(h);
        if (c >= 0 && STATUS_HEADERS.includes(h)) sh.getRange(row, c + 1).setValue(fields[h]);
      });
    });
    return { ok: true, updated: hits.length };
}

// כל השורות עם טלפון, מכל הלשוניות שיש בהן "שם מלא" ו"טלפון"
function allGuests_() {
  const out = [];
  SpreadsheetApp.openById(GUESTS_SPREADSHEET_ID).getSheets().forEach(sh => {
    if (sh.getLastRow() < 2) return;
    const firstRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    if (!firstRow.includes('שם מלא') || !firstRow.includes('טלפון')) return;
    const head = ensureHeaders_(sh);
    const values = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
    values.forEach((r, i) => {
      const guest = { 'לשונית': sh.getName(), row: i + 2 };
      head.forEach((h, j) => { if (h) guest[h] = r[j] instanceof Date ? r[j].toISOString() : String(r[j]).trim(); });
      if (guest['טלפון']) out.push({ sh, row: i + 2, head, guest });
    });
  });
  return out;
}

// מוסיף את עמודות הסטטוס שחסרות, אחרי העמודה האחרונה
function ensureHeaders_(sh) {
  let head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const missing = STATUS_HEADERS.filter(h => !head.includes(h));
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    head = head.concat(missing);
  }
  return head;
}

function norm_(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '972' + d.slice(1);
  else if (d.length === 9 && d.startsWith('5')) d = '972' + d; // גוגל שיטס מוחק את ה-0 בהתחלה
  return d;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// להרצה ידנית מהעורך (Run): מאשר הרשאות ובודק שרשימת המוזמנים נקראת
function testGuests() {
  const g = allGuests_().map(x => x.guest);
  Logger.log('אורחים עם טלפון: ' + g.length + ' | לדוגמה: ' + (g[0] ? g[0]['שם מלא'] + ' ' + g[0]['טלפון'] : '-'));
}
