// Google Apps Script: אישורי הגעה מהאתר + רשימת אורחים לוואטסאפ ולשיחות
// חייב להיווצר מתוך הגיליון עצמו: תוספים > Apps Script
// הגדרה חד-פעמית: Project Settings > Script Properties > הוסיפו SECRET עם מחרוזת אקראית ארוכה
const RSVP_SHEET = 'אישורי הגעה';
const RSVP_HEADERS = ['תאריך', 'שם', 'טלפון', 'מגיעים', 'כמות', 'הערה', 'צמחוני/טבעוני'];
const GUESTS_SHEET = 'אורחים';
const GUEST_HEADERS = ['שם', 'טלפון', 'סטטוס', 'כמות', 'מנה', 'ערוץ', 'וואטסאפ נשלח', 'ניסיונות שיחה', 'עודכן', 'הערות'];

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
    const sh = sheet_(RSVP_SHEET, RSVP_HEADERS);
    const p = (e && e.parameter) || {};
    const diet = (p.diet === 'צמחוני' || p.diet === 'טבעוני') ? p.diet : 'לא';
    sh.appendRow([new Date(), p.name || '', p.phone ? "'" + p.phone : '', p.attending || '',
                  Number(p.guests || 0), p.note || '', diet]);
    return ContentService.createTextOutput('ok: נשמר');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.message);
  }
}

// ---------- API לשרת (Vercel): וואטסאפ ושיחות ----------
function api_(b) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) throw new Error('unauthorized');
    const sh = sheet_(GUESTS_SHEET, GUEST_HEADERS);
    const values = sh.getDataRange().getValues();
    const head = values[0];

    if (b.action === 'list') {
      const guests = values.slice(1).map((r, i) => {
        const o = { row: i + 2 };
        head.forEach((h, j) => o[h] = r[j] instanceof Date ? r[j].toISOString() : String(r[j]));
        return o;
      }).filter(g => g['טלפון']);
      return json_({ guests });
    }

    if (b.action === 'update') {
      const key = norm_(b.phone);
      let row = values.findIndex((r, i) => i > 0 && norm_(r[head.indexOf('טלפון')]) === key) + 1;
      if (row === 0) { // מספר שלא ברשימה: מוסיפים שורה
        sh.appendRow(head.map(h => h === 'טלפון' ? "'" + b.phone : (h === 'שם' ? (b.name || '') : '')));
        row = sh.getLastRow();
      }
      const fields = Object.assign({}, b.fields, { 'עודכן': new Date() });
      Object.keys(fields).forEach(h => {
        const c = head.indexOf(h);
        if (c >= 0) sh.getRange(row, c + 1).setValue(fields[h]);
      });
      return json_({ ok: true, row });
    }
    throw new Error('unknown action');
  } catch (err) {
    return json_({ error: err.message });
  }
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. צרו אותו מתוך הגיליון: תוספים > Apps Script');
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setRightToLeft(true);
    sh.setFrozenRows(1);
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
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
