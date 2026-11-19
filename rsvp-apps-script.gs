// Google Apps Script: שומר אישורי הגעה מהאתר בגיליון
// חייב להיווצר מתוך הגיליון עצמו: תוספים > Apps Script
const SHEET_NAME = 'אישורי הגעה';
const HEADERS = ['תאריך', 'שם', 'טלפון', 'מגיעים', 'כמות', 'הערה', 'צמחוני/טבעוני'];

function doPost(e) { return handle_(e); }

// בדיקה מהדפדפן: <כתובת ה-exec>?name=בדיקה&attending=מגיע/ה&guests=1&diet=טבעוני
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.name) return ContentService.createTextOutput('ok: הסקריפט פעיל');
  return handle_(e);
}

function handle_(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('הסקריפט לא מחובר לגיליון. צרו אותו מתוך הגיליון: תוספים > Apps Script');
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.setRightToLeft(true);
      sh.setFrozenRows(1);
    }
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

    const p = (e && e.parameter) || {};
    const diet = (p.diet === 'צמחוני' || p.diet === 'טבעוני') ? p.diet : 'לא';
    sh.appendRow([new Date(), p.name || '', p.phone ? "'" + p.phone : '', p.attending || '',
                  Number(p.guests || 0), p.note || '', diet]);
    return ContentService.createTextOutput('ok: נשמר');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err.message);
  }
}
