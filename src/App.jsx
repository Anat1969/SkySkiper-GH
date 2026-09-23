import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TowerViewer from '../code/TowerViewer.jsx';
import { buildTower, setPath, syncSegments, towerProject } from '../code/geometry.js';
import presetsFile from '../data/presets.json';
import ParamPanel from './ParamPanel.jsx';
import MassSection from './MassSection.jsx';
import Menu from './Menu.jsx';
import { listProjects, listTypologies, saveProject, deleteProject, saveTypology, newId } from './store.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (n) => new Intl.NumberFormat('he-IL').format(n);
const USE_LABEL = { residential: 'מגורים', office: 'משרדים', hotel: 'מלון', retail: 'מסחר', public: 'ציבורי', mechanical: 'מערכות' };

function projectFromPreset(preset) {
  let data = clone(presetsFile.default);
  for (const [key, value] of Object.entries(preset.patch || {})) data = setPath(data, key, value);
  data.body = syncSegments(data.body);
  return { id: newId(), name: preset.name, typology: preset.id, data };
}

// The page always opens on a model: the last saved project, or the first typology.
function initialProject() {
  const saved = listProjects();
  return saved.length ? saved[0] : projectFromPreset(presetsFile.presets[0]);
}

export default function App() {
  const [project, setProject] = useState(initialProject);
  const [level, setLevel] = useState('building');
  const [selectedMass, setSelectedMass] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [activeTower, setActiveTower] = useState(0);
  const [colorMode, setColorMode] = useState('mass');
  const [floorLines, setFloorLines] = useState(true);
  const [activeView, setActiveView] = useState('axon');
  const [toast, setToast] = useState('');
  const [rows, setRows] = useState(() => listProjects());
  const [typologies, setTypologies] = useState(() => listTypologies());
  const [saved, setSaved] = useState(true);
  const [dirty, setDirty] = useState(false);

  const viewerRef = useRef(null);
  const history = useRef({ past: [], future: [] });
  const saveTimer = useRef(null);

  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  // ---------- autosave (only once the model has actually been touched) ----------
  useEffect(() => {
    if (!dirty) return;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { metrics } = buildTower(project.data);
      saveProject({ ...project, metrics });
      setRows(listProjects());
      setSaved(true);
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [project, dirty]);

  // ---------- editing ----------
  const pushHistory = (data) => {
    history.current.past.push(data);
    if (history.current.past.length > 50) history.current.past.shift();
    history.current.future = [];
  };

  // A change to body/crown while a tower other than the first is active is stored
  // as that tower's override, so the towers stop being copies of each other.
  const routesToTower = useCallback((path) =>
    activeTower > 0 && (path.startsWith('body.') || path.startsWith('crown.')),
  [activeTower]);

  const onChange = useCallback((path, value) => {
    setProject((p) => {
      let data;
      if (routesToTower(path)) {
        const list = [...(p.data.towers?.overrides || [])];
        list[activeTower] = { ...(list[activeTower] || {}), [path]: value };
        data = setPath(p.data, 'towers.overrides', list);
      } else {
        data = setPath(p.data, path, value);
        if (path === 'body.division.segments') data = { ...data, body: syncSegments(data.body) };
      }
      pushHistory(p.data);
      return { ...p, data };
    });
    setDirty(true);
  }, [activeTower, routesToTower]);

  const isTowerOverride = useCallback((path) =>
    project.data.towers?.overrides?.[activeTower]?.[path] !== undefined,
  [project, activeTower]);

  const onRevertTower = useCallback((path) => {
    setProject((p) => {
      const list = [...(p.data.towers?.overrides || [])];
      const ov = { ...(list[activeTower] || {}) };
      delete ov[path];
      list[activeTower] = ov;
      pushHistory(p.data);
      return { ...p, data: setPath(p.data, 'towers.overrides', list) };
    });
    setDirty(true);
  }, [activeTower]);

  const onRevert = useCallback((mass, segIndex, key) => {
    if (activeTower > 0 && mass !== 'base') {
      onRevertTower(`${mass}.segmentsList.${segIndex}.overrides.${key}`);
      return;
    }
    setProject((p) => {
      const list = [...p.data[mass].segmentsList];
      const overrides = { ...list[segIndex].overrides };
      delete overrides[key];
      list[segIndex] = { ...list[segIndex], overrides };
      pushHistory(p.data);
      return { ...p, data: { ...p.data, [mass]: { ...p.data[mass], segmentsList: list } } };
    });
    setDirty(true);
  }, [activeTower, onRevertTower]);

  const onSegmentAction = useCallback((action) => {
    const list = [...project.data.body.segmentsList];
    const i = selectedSegment;
    if (action === 'duplicate') list.splice(i + 1, 0, clone(list[i]));
    else if (action === 'delete' && list.length > 1) list.splice(i, 1);
    else if (action === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (action === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    else return;

    const body = { ...project.data.body, segmentsList: list, division: { ...project.data.body.division, segments: list.length } };
    pushHistory(project.data);
    setProject({ ...project, data: { ...project.data, body } });
    setDirty(true);
    if (action === 'delete' || action === 'up') setSelectedSegment(Math.max(0, i - 1));
    else if (action === 'down') setSelectedSegment(Math.min(list.length - 1, i + 1));
    else setSelectedSegment(i + 1);
  }, [project, selectedSegment]);

  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return say('אין מה לבטל');
    setProject((p) => { h.future.push(p.data); return { ...p, data: h.past.pop() }; });
    setDirty(true);
    say('בוטל');
  }, [say]);

  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    setProject((p) => { h.past.push(p.data); return { ...p, data: h.future.pop() }; });
    setDirty(true);
  }, []);

  // ---------- navigation between the three levels ----------
  const enterMass = (m) => { setSelectedMass(m); setSelectedSegment(null); setLevel('mass'); };
  const enterSegment = (i) => { setSelectedMass('body'); setSelectedSegment(i); setLevel('segment'); };
  const goUp = useCallback((to) => {
    if (to === 'building') { setLevel('building'); setSelectedMass(null); setSelectedSegment(null); }
    else { setLevel('mass'); setSelectedSegment(null); }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') goUp(level === 'segment' ? 'mass' : 'building');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [level, goUp, undo, redo]);

  const built = useMemo(() => buildTower(project.data), [project]);
  const m = built.metrics;
  const towerCount = project.data.towers?.count ?? 1;
  // the project as the active tower sees it — its own overrides applied on top of tower 1
  const effective = useMemo(() => towerProject(project.data, activeTower), [project, activeTower]);

  // keep the active tower valid when the count drops
  useEffect(() => {
    if (activeTower > towerCount - 1) setActiveTower(0);
  }, [towerCount, activeTower]);

  // ---------- loading a model into the page ----------
  const load = (p, persist) => {
    if (persist) {
      saveProject({ ...p, metrics: buildTower(p.data).metrics });
      setRows(listProjects());
    }
    setProject(p);
    setDirty(false);
    setSaved(true);
    history.current = { past: [], future: [] };
    setLevel('building'); setSelectedMass(null); setSelectedSegment(null);
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
        load({ id: newId(), name: parsed.name || 'פרויקט מיובא', typology: parsed.typology, data: parsed.data || parsed }, true);
        say('הפרויקט יובא');
      } catch {
        say('הקובץ אינו JSON תקין של פרויקט. נסי לייצא מחדש מהסטודיו.');
      }
    };
    reader.readAsText(file);
  };

  const rename = () => {
    const name = window.prompt('שם הפרויקט', project.name);
    if (!name) return;
    setProject((p) => ({ ...p, name }));
    setDirty(true);
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">סטודיו מסות</strong>

        <Menu label="פרויקטים">
          <div className="menu-head">הפרויקטים שלי</div>
          <div className="menu-list">
            {rows.length === 0 && <div className="menu-empty">עדיין אין פרויקטים שמורים. כל שינוי במודל נשמר אוטומטית.</div>}
            {rows.map((r) => (
              <div className={`menu-row ${r.id === project.id ? 'on' : ''}`} key={r.id}>
                <button type="button" data-close onClick={() => load(r, false)}>
                  <span>{r.name}</span>
                  <span className="menu-meta">{r.metrics ? `${r.metrics.floors} קומות · ${r.metrics.height} מ׳` : 'טרם חושב'}</span>
                </button>
                <button type="button" className="btn small danger"
                  onClick={() => { deleteProject(r.id); setRows(listProjects()); say('הפרויקט נמחק'); }}>מחיקה</button>
              </div>
            ))}
          </div>
          <div className="menu-sep" />
          <label className="menu-item" data-close>
            ייבוא JSON
            <input type="file" accept="application/json" style={{ display: 'none' }}
              onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])} />
          </label>
        </Menu>

        <Menu label="טיפולוגיות">
          <div className="menu-head">נקודת פתיחה. אפשר לשנות בה כל פרמטר</div>
          <div className="menu-list">
            {presetsFile.presets.map((p) => (
              <button type="button" className="menu-row-btn" key={p.id} data-close
                onClick={() => { load(projectFromPreset(p), true); say(`נפתח: ${p.name}`); }}>
                <span>{p.name}</span>
                <span className="menu-meta">{p.subtitle}</span>
              </button>
            ))}
            {typologies.length > 0 && <div className="menu-head">הטיפולוגיות שלי</div>}
            {typologies.map((t) => (
              <button type="button" className="menu-row-btn" key={t.id} data-close
                onClick={() => load({ id: newId(), name: t.name, typology: t.id, data: clone(t.data) }, true)}>
                <span>{t.name}</span>
                <span className="menu-meta">{t.subtitle}</span>
              </button>
            ))}
          </div>
        </Menu>

        <Menu label="ייצוא">
          <button type="button" className="menu-item" data-close onClick={exportPNG}>ייצוא תמונה</button>
          <button type="button" className="menu-item" data-close onClick={exportJSON}>ייצוא JSON</button>
          <div className="menu-sep" />
          <button type="button" className="menu-item" data-close
            onClick={() => {
              saveTypology({ name: project.name, subtitle: `${m.floors} קומות · ${m.height} מ׳`, data: clone(project.data) });
              setTypologies(listTypologies());
              say('נשמר כטיפולוגיה');
            }}>שמירה כטיפולוגיה</button>
        </Menu>

        <span className="divider" />
        <button type="button" className="projname" onClick={rename} title="שינוי שם">{project.name}</button>
        <span className="saved">{saved ? 'נשמר אוטומטית' : 'שומר…'}</span>
        <span className="grow" />
        <button className="btn small ghost" onClick={undo}>ביטול</button>
        <button className="btn small ghost" onClick={redo}>חזרה</button>
        <span className="divider" />
        <button className="btn primary" onClick={() => {
          saveProject({ ...project, metrics: m });
          setRows(listProjects()); setSaved(true); setDirty(true); say('נשמר');
        }}>שמירה</button>
      </header>

      <div className="studio">
        <MassSection slabs={built.slabs} level={level} selectedMass={selectedMass} selectedSegment={selectedSegment}
          activeTower={activeTower} onSelectMass={enterMass} onSelectSegment={enterSegment} />

        <aside className="panel">
          <ParamPanel key={level} project={project.data} effective={effective} level={level}
            selectedMass={selectedMass} selectedSegment={selectedSegment}
            activeTower={activeTower} towerCount={towerCount} onSelectTower={setActiveTower}
            isTowerOverride={isTowerOverride} onRevertTower={onRevertTower}
            onChange={onChange} onEnterMass={enterMass} onEnterSegment={enterSegment} onUp={goUp}
            onSegmentAction={onSegmentAction} onRevert={onRevert} />
        </aside>

        <div className="viewport">
          <TowerViewer ref={viewerRef} project={project.data} level={level} selectedMass={selectedMass}
            selectedSegment={selectedSegment} selectedTower={level === 'building' ? null : activeTower}
            colorMode={colorMode} floorLines={floorLines}
            onPick={(mass, seg, tower) => {
              if (tower != null && mass !== 'base') setActiveTower(tower);
              if (level === 'mass' && mass === selectedMass && seg !== null) enterSegment(seg);
              else enterMass(mass);
            }} />
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
