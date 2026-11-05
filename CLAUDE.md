# CLAUDE.md

## A&I logo button
The top bar holds only the app name (links home), content navigation, and ONE logo button "אד' ענת שטיבלמן A&I" (`<ai-menu>` from https://appofapp-gh.vercel.app/ai-menu.js). Every editing and development action (העתקת קישור, שיחת הפיתוח, פרויקט המחקר, התקנת האפליקציה, edit mode, add, delete) lives only inside it, never as loose buttons. Standard: https://github.com/Anat1969/AppOfApp-GH/blob/main/docs/ai-menu-standard.md

## העיר מסביב (03.11.2026, בקשת ענת)

דפוס "מהמפה למודל" מבנק ההשראה של Claude-GH, בגרסה של סטודיו המסות: המגדל עומד על מגרש אמיתי בין
הבניינים של רחוב רוגוזין באשדוד, ולא על רשת ריקה. כפתור "העיר מסביב" (דלוק כברירת מחדל) ושורת תובנה "גבוה פי N
מהבניינים סביבו".
- `data/context-ashdod-rogozin.json`: בניינים ורחובות מ-OpenStreetMap במטרים, יחסית למרכז המגרש. בניינים שעל
  המגרש עצמו (70 על 60 מ') הוסרו. גובה משוער: 4 קומות, 12 מ', כי ב-OSM אין מספר קומות לבניינים כאן.
- `code/TowerViewer.jsx`: prop `context`, מצויר בקבוצת הקרקע באותה מערכת צירים כמו המגדל.

## הליכה ברחוב (03.11.2026, בבקשת ענת להרחיב את ההליכה בגובה העיניים)
- כפתור "הליכה ברחוב" בשורת התצוגות: המגדל בין הבניינים של רוגוזין, בגובה **160** או **95** ס"מ, עם מפת תוכנית. "הרחוב היום" מול "עם המגדל".
- `src/StreetWalk.jsx`: אותן קואורדינטות כמו `TowerViewer` (z = -y). קומה אחר קומה מ-`buildTower`, עם רווח דק בין הקומות. הבניינים סביב: 12 מ', ההנחה של ההקשר העירוני, כתובה במסך.
- הרכיב המשותף `<space-walk>` מ-https://appofapp-gh.vercel.app/walk.js, ואם Vercel לא עונה, מ-Pages של AppOfApp-GH.
- בדיקה: `npx vite preview --port 4175 & node tests/walk.e2e.mjs`.
- ענפי `claude/*` לא נפרסים ב-Vercel (`vercel.json`).

## פתיחה מקישור (05.11.2026, בקשת ענת)
- `#patch=<JSON>&name=<שם>`: המגדל נפתח מתוך הכתובת. ה-JSON הוא מפה של נתיבים מנוקדים לערכים, באותו פורמט כמו `patch` ב-`data/presets.json`, מעל `default`.
- הצרכן הראשון: איזה תמהיל עדיף (https://tamhil-gh.vercel.app), כפתור "פתיחה בגורד שחקים" על כל תמהיל.
- כתובת בלי `patch` נפתחת כמו קודם: הפרויקט השמור האחרון, או הטיפולוגיה הראשונה.
