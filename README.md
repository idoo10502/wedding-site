# אתר החתונה של עידו ותאיר

אתר סטטי: `index.html` + `assets/`. אין build.

## חיבור אישורי הגעה לגוגל שיטס (3 דקות)
1. פתחו גיליון חדש ב-Google Sheets.
2. תוספים > Apps Script. מחקו את הקוד והדביקו את התוכן של `rsvp-apps-script.gs`. שמרו.
3. Deploy > New deployment > סוג: Web app.
   - Execute as: Me
   - Who has access: Anyone
4. אשרו הרשאות (Advanced > Go to project) והעתיקו את ה-URL שמסתיים ב-`/exec`.
5. ב-`index.html` הדביקו אותו ב-`rsvpUrl: ""` (בתוך `CONFIG`).

האישורים יופיעו בלשונית "אישורי הגעה". הורדה לאקסל: קובץ > הורדה > Microsoft Excel.

## העלאה
- Netlify Drop: app.netlify.com/drop, גוררים את התיקייה `wedding-site`.
- Vercel: Add New > Project > גרירת התיקייה, Framework: Other.

אחרי שיש כתובת, החליפו ב-`og:image` את `assets/og.jpg` בכתובת מלאה (`https://.../assets/og.jpg`) כדי שתמונה תופיע בוואטסאפ.
