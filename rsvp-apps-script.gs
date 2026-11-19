// Google Apps Script: שומר אישורי הגעה מהאתר בגיליון
const SHEET_NAME = 'אישורי הגעה';
const HEADERS = ['תאריך', 'שם', 'טלפון', 'מגיעים', 'כמות', 'הערה', 'צמחוני/טבעוני'];

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.setRightToLeft(true);
    sh.setFrozenRows(1);
  }
  // יוצר/משלים את שורת הכותרות (מוסיף את "צמחוני/טבעוני" גם לגיליון קיים)
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  const p = e.parameter || {};
  const diet = (p.diet === 'צמחוני' || p.diet === 'טבעוני') ? p.diet : 'לא';
  sh.appendRow([new Date(), p.name || '', p.phone ? "'" + p.phone : '', p.attending || '',
                Number(p.guests || 0), p.note || '', diet]);
  return ContentService.createTextOutput('ok');
}
