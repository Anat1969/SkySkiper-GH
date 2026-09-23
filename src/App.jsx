import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TowerViewer from '../code/TowerViewer.jsx';
import { buildTower, setPath, syncSegments } from '../code/geometry.js';
import presetsFile from '../data/presets.json';
import ParamPanel from './ParamPanel.jsx';
import MassSection from './MassSection.jsx';
import { listProjects, listTypologies, saveProject, deleteProject, saveTypology, newId } from './store.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (n) => new Intl.NumberFormat('he-IL').format(n);
const USE_LABEL = { residential: 'מגורים', office: 'משרדים', hotel: 'מלון', retail: 'מסחר', public: 'ציבורי', mechanical: 'מערכות' };

function projectFromPreset(preset) {
  let data = clone(presetsFile.default);
  for (const [key, value] of Object.entries(preset.patch || {})) data = setPath(data, key, value);
  data.body = syncSegments(data.body);
  data.typology = preset.id;
  return { id: newId(), name: preset.name, typology: preset.id, data };
}

export default function App() {
  const [view, setView] = useState('projects');
  const [project, setProject] = useState(null);
  const [level, setLevel] = useState('building');
  const [selectedMass, setSelectedMass] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [colorMode, setColorMode] = useState('mass');
  const [floorLines, setFloorLines] = useState(true);
  const [activeView, setActiveView] = useState('axon');
  const [toast, setToast] = useState('');
  const [rows, setRows] = useState(() => listProjects());
  const [saved, setSaved] = useState(true);
  const [filter, setFilter] = useState('');

  const viewerRef = useRef(null);
  const history = useRef({ past: [], future: [] });
  const saveTimer = useRef(null);

  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  // ---------- autosave ----------
  useEffect(() => {
    if (!project) return;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { metrics } = buildTower(project.data);
      saveProject({ ...project, metrics });
      setRows(listProjects());
      setSaved(true);
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [project]);

  // ---------- editing ----------
  const commit = useCallback((nextData) => {
    setProject((p) => {
      history.current.past.push(p.data);
      if (history.current.past.length > 50) history.current.past.shift();
      history.current.future = [];
      return { ...p, data: nextData };
    });
  }, []);

  const onChange = useCallback((path, value) => {
    setProject((p) => {
      let data = setPath(p.data, path, value);
      if (path === 'body.division.segments') data = { ...data, body: syncSegments(data.body) };
      history.current.past.push(p.data);
      if (history.current.past.length > 50) history.current.past.shift();
      history.current.future = [];
      return { ...p, data };
    });
  }, []);

  const onRevert = useCallback((mass, segIndex, key) => {
    setProject((p) => {
      const list = [...p.data[mass].segmentsList];
      const overrides = { ...list[segIndex].overrides };
      delete overrides[key];
      list[segIndex] = { ...list[segIndex], overrides };
      history.current.past.push(p.data);
      return { ...p, data: { ...p.data, [mass]: { ...p.data[mass], segmentsList: list } } };
    });
  }, []);

  const onSegmentAction = useCallback((action) => {
    const list = [...project.data.body.segmentsList];
    const i = selectedSegment;
    if (action === 'duplicate') list.splice(i + 1, 0, clone(list[i]));
    else if (action === 'delete' && list.length > 1) list.splice(i, 1);
    else if (action === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (action === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    else return;

    const body = { ...project.data.body, segmentsList: list, division: { ...project.data.body.division, segments: list.length } };
    commit({ ...project.data, body });
    if (action === 'delete') setSelectedSegment(Math.max(0, i - 1));
    else if (action === 'up') setSelectedSegment(Math.max(0, i - 1));
    else if (action === 'down') setSelectedSegment(Math.min(list.length - 1, i + 1));
    else setSelectedSegment(i + 1);
  }, [project, selectedSegment, commit]);

  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    setProject((p) => {
      h.future.push(p.data);
      return { ...p, data: h.past.pop() };
    });
    say('בוטל');
  }, [say]);

  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    setProject((p) => {
      h.past.push(p.data);
      return { ...p, data: h.future.pop() };
    });
  }, []);

  // ---------- navigation ----------
  const enterMass = (m) => { setSelectedMass(m); setSelectedSegment(null); setLevel('mass'); };
  const enterSegment = (i) => { setSelectedMass('body'); setSelectedSegment(i); setLevel('segment'); };
  const goUp = (to) => {
    if (to === 'building') { setLevel('building'); setSelectedMass(null); setSelectedSegment(null); }
    else { setLevel('mass'); setSelectedSegment(null); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (view !== 'studio') return;
      if (e.key === 'Escape') goUp(level === 'segment' ? 'mass' : 'building');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, level, undo, redo]);

  // ---------- derived ----------
  const built = useMemo(() => (project ? buildTower(project.data) : null), [project]);

  // ---------- actions ----------
  const openPreset = (preset) => {
    const p = projectFromPreset(preset);
    setProject(p);
    saveProject(p);
    setRows(listProjects());
    history.current = { past: [], future: [] };
    setLevel('building'); setSelectedMass(null); setSelectedSegment(null);
    setView('studio');
  };

  const openProject = (row) => {
    setProject(row);
    history.current = { past: [], future: [] };
    setLevel('building'); setSelectedMass(null); setSelectedSegment(null);
    setView('studio');
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    say('קובץ JSON יוצא');
  };

  const exportPNG = () => {
    const url = viewerRef.current?.snapshot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.png`;
    a.click();
    say('תמונה יוצאה');
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const p = { id: newId(), name: parsed.name || 'פרויקט מיובא', typology: parsed.typology, data: parsed.data || parsed };
        saveProject(p);
        setRows(listProjects());
        openProject(p);
      } catch {
        say('הקובץ אינו JSON תקין של פרויקט. נסי לייצא מחדש מהסטודיו.');
      }
    };
    reader.readAsText(file);
  };

  // ================= screens =================
  if (view === 'projects') {
    const shown = rows.filter((r) => r.name.includes(filter));
    return (
      <div className="app">
        <header className="topbar">
          <h1>סטודיו מסות</h1>
          <span className="saved">בנייה גבוהה — בסיס, גוף וכותרת</span>
          <span className="grow" />
        </header>
        <main className="page">
          <div className="page-head">
            <div className="crumbs">פרויקטים</div>
            <h1>פרויקטים</h1>
          </div>
          <div className="dash">
            <div className="panelbox">
              <input placeholder="סינון לפי שם" value={filter} onChange={(e) => setFilter(e.target.value)}
                style={{ width: '100%', minHeight: 'var(--touch)', padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-s)', fontFamily: 'var(--font-ui)', marginBottom: 16 }} />
              {shown.length === 0 ? (
                <div className="empty">עדיין אין פרויקטים. פרויקט חדש מתחיל מטיפולוגיה, ואפשר לשנות בו הכול.</div>
              ) : (
                <table>
                  <thead>
                    <tr><th>שם</th><th>טיפולוגיה</th><th>גובה</th><th>קומות</th><th>שטח ברוטו</th><th /></tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} onClick={() => openProject(r)}>
                        <td>{r.name}</td>
                        <td>{presetsFile.presets.find((p) => p.id === r.typology)?.name || '—'}</td>
                        <td>{r.metrics ? `${r.metrics.height} מ׳` : '—'}</td>
                        <td>{r.metrics?.floors ?? '—'}</td>
                        <td>{r.metrics ? `${fmt(r.metrics.gfa)} מ״ר` : '—'}</td>
                        <td>
                          <button className="btn small danger" onClick={(e) => { e.stopPropagation(); deleteProject(r.id); setRows(listProjects()); say('הפרויקט נמחק'); }}>מחיקה</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panelbox">
              <h3>פעולות</h3>
              <div style={{ height: 12 }} />
              <button className="btn primary" style={{ width: '100%' }} onClick={() => setView('typologies')}>פרויקט חדש</button>
              <div className="hint" style={{ margin: '6px 0 16px' }}>נפתח במסך הטיפולוגיות</div>
              <button className="btn" style={{ width: '100%' }} disabled={!rows.length} onClick={() => rows.length && openProject(rows[0])}>פתיחת הפרויקט האחרון</button>
              <div className="hint" style={{ margin: '6px 0 16px' }}>{rows.length ? rows[0].name : 'אין עדיין פרויקט שמור'}</div>
              <label className="btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ייבוא JSON
                <input type="file" accept="application/json" style={{ display: 'none' }}
                  onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])} />
              </label>
              <div className="hint" style={{ marginTop: 6 }}>קובץ שיוצא מהסטודיו</div>
            </div>
          </div>
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (view === 'typologies') {
    const mine = listTypologies();
    return (
      <div className="app">
        <header className="topbar">
          <h1>סטודיו מסות</h1>
          <span className="grow" />
          <button className="btn" onClick={() => setView('projects')}>חזרה לפרויקטים</button>
        </header>
        <main className="page">
          <div className="page-head">
            <div className="crumbs"><button onClick={() => setView('projects')}>פרויקטים</button>› טיפולוגיות</div>
            <h1>טיפולוגיות</h1>
            <div className="hint" style={{ marginTop: 6 }}>בחירת טיפולוגיה יוצרת פרויקט חדש. אפשר לשנות בו כל פרמטר.</div>
          </div>
          <div className="cards">
            {presetsFile.presets.map((p) => (
              <button className="card" key={p.id} onClick={() => openPreset(p)}>
                <div className="name">{p.name}</div>
                <div className="sub">{p.subtitle}</div>
              </button>
            ))}
          </div>
          {mine.length > 0 && (
            <>
              <h2 style={{ margin: '32px 0 16px' }}>הטיפולוגיות שלי</h2>
              <div className="cards">
                {mine.map((t) => (
                  <button className="card" key={t.id} onClick={() => openProject({ id: newId(), name: t.name, typology: t.id, data: clone(t.data) })}>
                    <div className="name">{t.name}</div>
                    <div className="sub">{t.subtitle}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ---------- studio ----------
  const m = built.metrics;
  return (
    <div className="app">
      <header className="topbar">
        <button className="btn small" onClick={() => setView('projects')}>פרויקטים</button>
        <h2 style={{ fontSize: 18 }}>{project.name}</h2>
        <span className="saved">{saved ? 'נשמר אוטומטית' : 'שומר…'}</span>
        <span className="grow" />
        <button className="btn small" onClick={undo}>ביטול</button>
        <button className="btn small" onClick={redo}>חזרה</button>
        <button className="btn small" onClick={exportPNG}>ייצוא תמונה</button>
        <button className="btn small" onClick={exportJSON}>ייצוא JSON</button>
        <button className="btn small" onClick={() => { saveTypology({ name: project.name, subtitle: `${m.floors} קומות · ${m.height} מ׳`, data: clone(project.data) }); say('נשמר כטיפולוגיה'); }}>שמירה כטיפולוגיה</button>
        <button className="btn primary" onClick={() => { saveProject({ ...project, metrics: m }); setRows(listProjects()); setSaved(true); say('נשמר'); }}>שמירה</button>
      </header>

      <div className="studio">
        <MassSection slabs={built.slabs} level={level} selectedMass={selectedMass} selectedSegment={selectedSegment}
          onSelectMass={enterMass} onSelectSegment={enterSegment} />

        <aside className="panel">
          <ParamPanel project={project.data} level={level} selectedMass={selectedMass} selectedSegment={selectedSegment}
            onChange={onChange} onEnterMass={enterMass} onEnterSegment={enterSegment} onUp={goUp}
            onSegmentAction={onSegmentAction} onRevert={onRevert} />
        </aside>

        <div className="viewport">
          <TowerViewer ref={viewerRef} project={project.data} level={level} selectedMass={selectedMass}
            selectedSegment={selectedSegment} colorMode={colorMode} floorLines={floorLines}
            onPick={(mass, seg) => (level === 'mass' && mass === selectedMass && seg !== null ? enterSegment(seg) : enterMass(mass))} />
          <div className="north">צפון ↑</div>
          <div className="overlay">
            <div className="bar">
              {[['axon', 'אקסונומטרי'], ['front', 'חזית'], ['side', 'צד'], ['top', 'מבט-על'], ['eye', 'גובה עין']].map(([v, l]) => (
                <button key={v} className={activeView === v ? 'on' : ''} onClick={() => { viewerRef.current.setView(v); setActiveView(v); }}>{l}</button>
              ))}
            </div>
            <div className="bar">
              <button onClick={() => viewerRef.current.zoom(0.8)}>הגדלה</button>
              <button onClick={() => viewerRef.current.zoom(1.25)}>הקטנה</button>
              <button onClick={() => viewerRef.current.center()}>מרכז</button>
              <button onClick={() => { viewerRef.current.reset(); setActiveView('axon'); }}>איפוס</button>
            </div>
            <div className="bar">
              {[['mass', 'לפי גוש'], ['use', 'לפי שימוש'], ['white', 'לבן']].map(([v, l]) => (
                <button key={v} className={colorMode === v ? 'on' : ''} onClick={() => setColorMode(v)}>{l}</button>
              ))}
              <button className={floorLines ? 'on' : ''} onClick={() => setFloorLines((f) => !f)}>קווי קומות</button>
            </div>
          </div>
        </div>
      </div>

      <footer className="metrics">
        <span><b>{m.height}</b>מ׳ גובה</span>
        <span><b>{m.floors}</b>קומות</span>
        <span><b>{fmt(m.gfa)}</b>מ״ר ברוטו</span>
        <span><b>{fmt(m.typicalFloor)}</b>מ״ר קומה טיפוסית</span>
        <span><b>{m.split.join(':')}</b>בסיס:גוף:כותרת</span>
        <span><b>{Math.round(m.coverage * 100)}%</b>כיסוי מגרש</span>
        {colorMode === 'use' && (
          <span className="hint">{Object.entries(m.byUse).map(([k, v]) => `${USE_LABEL[k] || k} ${fmt(v)}`).join(' · ')}</span>
        )}
        <span className="note">ערכים מחושבים מהמודל</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
