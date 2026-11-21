// Google Apps Script: אישורי הגעה מהאתר + רשימת המוזמנים לוואטסאפ ולשיחות
// נמצא בגיליון "רשימת מוזמנים - חתונה עידו ותאיר": תוספים > Apps Script
// הגדרה חד-פעמית: Project Settings > Script Properties > SECRET (מחרוזת אקראית ארוכה)

// גיליון "רשימת מוזמנים - חתונה עידו ותאיר"
const GUESTS_SPREADSHEET_ID = '1OtdGZ6wTjv9Fa05SEVq1VLtnA1SY5IKLwUVpilTufV0';
// לשונית נפרדת בתוכו לכל האישורים (אתר, וואטסאפ, שיחה). לשוניות האורחים לא משתנות.
const STATUS_TAB = 'סיכום אישורים';
const STATUS_HEADERS = ['סטטוס', 'כמות מאושרת', 'מנה', 'ערוץ', 'וואטסאפ נשלח', 'ניסיונות שיחה', 'עודכן', 'הערות'];
const STATUS_TAB_HEADERS = ['שם מלא', 'טלפון', 'קירבה', 'מוזמנים'].concat(STATUS_HEADERS);

// יומן גולמי של הטופס באתר (בגיליון "מוזמנים לחתונה")
const RSVP_SHEET = 'אישורי הגעה';
const RSVP_HEADERS = ['תאריך', 'שם', 'טלפון', 'מגיעים', 'כמות', 'הערה', 'צמחוני/טבעוני'];

function doPost(e) {
  if (e && e.postData && e.postData.type === 'application/json') return api_(JSON.parse(e.postData.contents));
  return handle_(e);
}

// בדיקה מהדפדפן: <כתובת ה-exec>?name=בדיקה&phone=05...&attending=מגיע/ה&guests=1&diet=טבעוני
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
    try { synced = syncFromSite_(p, diet); } catch (err) { synced = ' (סנכרון לסיכום נכשל: ' + err.message + ')'; }
    return ContentService.createTextOutput('ok: נשמר' + synced);
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.message);
  }
}

// אישור מהאתר עם טלפון שנמצא ברשימה: נרשם גם ב"סיכום אישורים", כדי שלא יקבל וואטסאפ ושיחה
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
  return r.updated ? ' + עודכן בסיכום האישורים' : ' (הטלפון לא נמצא ברשימת המוזמנים)';
}

// ---------- API לשרת (Vercel / wedding-call) ----------
function api_(b) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) throw new Error('unauthorized');

    if (b.action === 'list') return json_({ guests: mergedGuests_() });
    if (b.action === 'get') {
      const key = norm_(b.phone);
      return json_({ guest: mergedGuests_().find(g => norm_(g['טלפון']) === key) || null });
    }
    if (b.action === 'update') return json_(updateGuest_(b.phone, b.fields, b.name, true));
    throw new Error('unknown action');
  } catch (err) {
    return json_({ error: err.message });
  }
}

/** האורחים מלשוניות הרשימה, יחד עם הסטטוס שלהם מ"סיכום אישורים" */
function mergedGuests_() {
  const status = statusIndex_(statusSheet_());
  return guestRows_().map(g => {
    const o = { 'לשונית': g.tab, 'שם מלא': g.name, 'טלפון': g.phone, 'קירבה': g.rel, 'מוזמנים': String(g.invited) };
    const s = status.byPhone[norm_(g.phone)];
    STATUS_HEADERS.forEach(h => { o[h] = s ? s.values[h] : ''; });
    return o;
  });
}

/** מעדכן (או יוצר) את השורה של הטלפון ב"סיכום אישורים" */
function updateGuest_(phone, fieldsIn, name, createIfMissing) {
  const key = norm_(phone);
  const sh = statusSheet_();
  const idx = statusIndex_(sh);
  let row = idx.byPhone[key] ? idx.byPhone[key].row : 0;

  if (!row) {
    const g = guestRows_().find(x => norm_(x.phone) === key);
    if (!g && !createIfMissing) return { ok: true, updated: 0 };
    const sameName = g && idx.noPhoneByName[nameKey_(g.name)];
    if (sameName) { // יש כבר שורה לאורח בלי טלפון: משלימים בה את הטלפון במקום שורה כפולה
      sh.getRange(sameName, 2).setValue("'" + g.phone);
      row = sameName;
    } else {
      const local = key.startsWith('972') ? '0' + key.slice(3) : key;
      sh.appendRow([g ? g.name : (name || ''), "'" + (g ? g.phone : local), g ? g.rel : 'לא ברשימה', g ? g.invited : 1]);
      row = sh.getLastRow();
    }
  }

  const fields = Object.assign({}, fieldsIn, { 'עודכן': new Date() });
  Object.keys(fields).forEach(h => {
    const c = STATUS_TAB_HEADERS.indexOf(h);
    if (c >= 0 && STATUS_HEADERS.includes(h)) sh.getRange(row, c + 1).setValue(fields[h]);
  });
  return { ok: true, updated: 1 };
}

// ---------- עזרים ----------
function guestsSpreadsheet_() { return SpreadsheetApp.openById(GUESTS_SPREADSHEET_ID); }

/** כל האורחים עם טלפון, מכל הלשוניות שיש בהן "שם מלא" ו"טלפון" (חוץ מ"סיכום אישורים") */
function guestRows_() {
  const out = [];
  guestsSpreadsheet_().getSheets().forEach(sh => {
    if (sh.getName() === STATUS_TAB || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getValues();
    const head = values[0].map(h => String(h).trim());
    const iName = head.indexOf('שם מלא'), iPhone = head.indexOf('טלפון');
    const iRel = head.indexOf('קירבה'), iInv = head.indexOf('מוזמנים');
    if (iName < 0 || iPhone < 0) return;
    values.slice(1).forEach(r => {
      const phone = String(r[iPhone]).trim();
      if (!phone) return;
      out.push({
        tab: sh.getName(),
        name: String(r[iName]).trim(),
        phone: phone,
        rel: iRel >= 0 ? String(r[iRel]).trim() : '',
        invited: iInv >= 0 ? (Number(r[iInv]) || 1) : 1,
      });
    });
  });
  return out;
}

function statusSheet_() {
  const ss = guestsSpreadsheet_();
  let sh = ss.getSheetByName(STATUS_TAB);
  if (!sh) {
    sh = ss.insertSheet(STATUS_TAB, 0);
    sh.setRightToLeft(true);
    sh.setFrozenRows(1);
  }
  sh.getRange(1, 1, 1, STATUS_TAB_HEADERS.length).setValues([STATUS_TAB_HEADERS]).setFontWeight('bold');
  return sh;
}

function statusIndex_(sh) {
  const byPhone = {}, noPhoneByName = {};
  if (sh.getLastRow() < 2) return { byPhone, noPhoneByName };
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, STATUS_TAB_HEADERS.length).getValues();
  values.forEach((r, i) => {
    const key = norm_(r[1]);
    const name = nameKey_(r[0]);
    if (!key && name && !noPhoneByName[name]) noPhoneByName[name] = i + 2; // שורה שהוספתם ידנית בלי טלפון
    if (!key || byPhone[key]) return;
    const v = {};
    STATUS_TAB_HEADERS.forEach((h, j) => { v[h] = r[j] instanceof Date ? r[j].toISOString() : String(r[j]).trim(); });
    byPhone[key] = { row: i + 2, values: v };
  });
  return { byPhone, noPhoneByName };
}

function nameKey_(n) { return String(n || '').replace(/\s+/g, ' ').trim(); }

function norm_(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '972' + d.slice(1);
  else if (d.length === 9 && d.startsWith('5')) d = '972' + d; // גוגל שיטס מוחק את ה-0 בהתחלה
  return d;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- להרצה ידנית מהעורך (Run) ----------

// בודק הרשאות ומוסיף ל"סיכום אישורים" שורה לכל אורח שעוד אין לו (כדי לראות גם מי לא ענה)
function testGuests() {
  const guests = guestRows_();
  const sh = statusSheet_();
  const idx = statusIndex_(sh);
  const seen = {};
  const rows = [];
  guests.forEach(g => {
    const k = norm_(g.phone);
    if (idx.byPhone[k] || seen[k]) return;
    seen[k] = true;
    const sameName = idx.noPhoneByName[nameKey_(g.name)];
    if (sameName) { sh.getRange(sameName, 2).setValue("'" + g.phone); delete idx.noPhoneByName[nameKey_(g.name)]; return; }
    rows.push([g.name, "'" + g.phone, g.rel, g.invited].concat(STATUS_HEADERS.map(() => '')));
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, STATUS_TAB_HEADERS.length).setValues(rows);
  Logger.log('אורחים עם טלפון: ' + guests.length + ' | נוספו לסיכום: ' + rows.length);
}

// חד-פעמי: מעביר נתונים מעמודות הסטטוס שהגרסה הקודמת הוסיפה ללשוניות האורחים, ומוחק את העמודות האלה
function moveStatusColumnsToSummary() {
  let moved = 0, removed = 0;
  statusSheet_(); // יוצר את "סיכום אישורים" לפני המעבר על הלשוניות
  guestsSpreadsheet_().getSheets().slice().forEach(sh => {
    if (sh.getName() === STATUS_TAB || sh.getLastColumn() < 1) return;
    const values = sh.getDataRange().getValues();
    const head = values[0].map(h => String(h).trim());
    const cols = STATUS_HEADERS.map(h => head.indexOf(h)).filter(c => c >= 0);
    if (!cols.length) return;
    const iPhone = head.indexOf('טלפון'), iName = head.indexOf('שם מלא');
    values.slice(1).forEach(r => {
      const fields = {};
      STATUS_HEADERS.forEach(h => { const c = head.indexOf(h); if (c >= 0 && r[c] !== '' && h !== 'עודכן') fields[h] = r[c]; });
      if (iPhone >= 0 && r[iPhone] && Object.keys(fields).length) {
        updateGuest_(r[iPhone], fields, iName >= 0 ? r[iName] : '', true);
        moved++;
      }
    });
    cols.sort((a, b) => b - a).forEach(c => { sh.deleteColumn(c + 1); removed++; });
  });
  Logger.log('הועברו ' + moved + ' שורות, נמחקו ' + removed + ' עמודות');
}
