# פרומפטים ל-BASE44 — לפי סדר

שולחים את הפרומפטים אחד אחרי השני, ובודקים כל שלב לפני שממשיכים. הקוד והנתונים מודבקים כמו שהם, כדי ש-BASE44 לא יכתוב אותם מחדש ויבזבז קרדיטים.

**כלל חיסכון:** אם משהו לא עובד, לא שולחים פרומפט כללי. שולחים את שם הקובץ, מה ציפית לראות, ומה רואים בפועל.

---

## פרומפט 1 — שלד, ישויות ועיצוב

זה יוצר את האפליקציה, את שתי הישויות, את לוחות הצבע ואת חלוקת המסך הריקה.

```
Build "סטודיו מסות — בנייה גבוהה", a Hebrew RTL app for studying tall-building massing (base / body / crown).

Rules for the whole app: Hebrew UI, full RTL, no icons or emojis (every button is a word), large clear type hierarchy, breadcrumbs + bold page name on every screen, every action has a one-line explanation, autosave with visible "נשמר אוטומטית", toasts for feedback, touch targets ≥44px.

1. Install the npm package "three".
2. Create entities exactly as the attached JSON schemas: Project and SavedTypology. [paste entities/Project.json and entities/SavedTypology.json]
3. Add global CSS from design/tokens.css. [paste design/tokens.css]
4. Create 3 pages with routing:
   - "פרויקטים" (home): dual dashboard — 60% table of projects (name, typology, height, floors, GFA, updated) with filter; 40% quick actions: "פרויקט חדש" (→ טיפולוגיות), "פתיחת הפרויקט האחרון", "ייבוא JSON". Explained empty state.
   - "טיפולוגיות": card grid (will be filled in step 4).
   - "סטודיו" (?id=): layout only for now — top bar 56px; right column 96px ("חתך הגושים"); parameter panel 340px; 3D viewport fills the rest; bottom metrics bar 44px. Mobile <900px: viewport on top, column becomes a horizontal strip, panel becomes a bottom sheet.
Do not build 3D or parameters yet. Stop and list what was created.
```

---

## פרומפט 2 — קוד הליבה (הדבקה כמו שהוא)

זה מוסיף את מנוע הגאומטריה ואת המציג התלת-ממדי, בלי ש-BASE44 ימציא אותם.

```
Create two files with EXACTLY this content, do not rewrite or "improve" them:
- src/lib/geometry.js  [paste code/geometry.js]
- src/components/TowerViewer.jsx  [paste code/TowerViewer.jsx]  (fix only the import path of geometry if needed)

In the "סטודיו" page, mount <TowerViewer> in the viewport with a temporary project = presets.default (next step). Confirm it renders a tower you can rotate (drag), zoom (wheel) and pan (right-drag / Shift+drag).
```

---

## פרומפט 3 — פרמטרים מתוך קובץ נתונים

הפאנל נבנה אוטומטית מתוך הנתונים ולא שדה-שדה, וזה החיסכון הגדול.

```
Create src/data/parameters.json and src/data/presets.json with EXACTLY this content. [paste data/parameters.json] [paste data/presets.json]

Build a generic <ParamPanel> that renders from parameters.json:
- Heading hierarchy: H2 level name + one-line summary; H3 numbered group title ("4. פרופיל אנכי"); H4 group subtitle; field label 14px; control; hint 12px under the field.
- Controls: slider = range + number input + unit; segmented = joined buttons; select; toggle; anchor = 3×3 grid of buttons; respect "showIf" and "masses".
- Only one group open at a time; a closed group shows a one-line summary of its values.
- Reads/writes values with getPath/setPath from geometry.js. After any change to body.division.segments call syncSegments(project.body).
- Every change updates the model live (debounce 50ms) and autosaves the Project entity (debounce 800ms), storing data + metrics().
```

---

## פרומפט 4 — ניווט בשלושה מפלסים

זה יוצר את חוויית הכניסה לגוש ולמקטע.

```
In "סטודיו" add 3 levels. State: level ('building'|'mass'|'segment'), selectedMass, selectedSegment.
- Building level: panel shows parameters.building groups + three buttons "כניסה לבסיס / לגוף / לכותרת".
- Mass level: enter by double-click on a mass in the viewport (TowerViewer onPick) or by clicking it in the right column. Panel: breadcrumb "בניין › גוף", H2 with mass color swatch, the type selector (typeByMass) for base/crown, then the six mass groups for project[selectedMass]. Body also shows a row of segment buttons 1..N + "הוספה".
- Segment level: click a segment in the column or the segment row. Panel: breadcrumb "בניין › גוף › מקטע 3", kind selector, and the fields listed in parameters.segment.overridable. Each shows badge "יורש" (value from the mass) or "מקומי" (value in segmentsList[i].overrides) with "החזר לירושה". Actions: שכפול, הזזה למעלה, הזזה למטה, מחיקה.
- Esc or breadcrumb goes up one level.
- Right column "חתך הגושים": schematic vertical section drawn from buildTower() slabs of tower 0 — crown top, body segments middle, base bottom; heights proportional; widths proportional to footprint; same mass colors; selected item outlined in --primary. Clicking an item enters it.
- Pass level/selectedMass/selectedSegment to TowerViewer.
```

---

## פרומפט 5 — בקרות מבט, נתונים, טיפולוגיות, ייצוא

זה משלים את ה-MVP.

```
1. View controls floating at the viewport's bottom-left, three small bars:
   views "אקסונומטרי, חזית, צד, מבט-על, גובה עין" (ref.setView: axon, front, side, top, eye);
   "הגדלה, הקטנה, מרכז, איפוס" (ref.zoom(0.8), ref.zoom(1.25), ref.center(), ref.reset());
   display "צבע לפי גוש / לפי שימוש / לבן" (colorMode) and "קווי קומות" toggle. A north marker "צפון" in the viewport corner.
2. Bottom bar from metrics(): גובה (מ׳), קומות, שטח ברוטו (מ״ר), קומה טיפוסית (מ״ר), יחס בסיס:גוף:כותרת, כיסוי מגרש (%). Add the note "ערכים מחושבים מהמודל".
3. "טיפולוגיות" page: cards from presets.json (name, subtitle) + "הטיפולוגיות שלי" from SavedTypology. Click → create Project = default + patch (setPath each key, then syncSegments) → open סטודיו.
4. Top bar actions: "שמירה" (primary), "שמירה כטיפולוגיה" (creates SavedTypology), "ייצוא תמונה" (ref.snapshot() → download PNG and save as project thumbnail), "ייצוא JSON", undo/redo (keep a history of the last 50 data states; Ctrl+Z / Ctrl+Shift+Z).
```

---

## פרומפט 6 — בדיקה לפני סיום

```
Check and fix only what fails:
- RTL on every screen; breadcrumbs correct on every level.
- Every parameter moves the model live; values persist after reload.
- Each of the 8 typologies opens and renders.
- Double-click enters a mass; Esc exits; camera never goes below ground.
- Mobile layout works at 390px width.
Report the list of checks with pass/fail.
```
