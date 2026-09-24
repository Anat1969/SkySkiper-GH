// ParamPanel.jsx — one generic panel for all three levels.
// Every field is rendered from data/parameters.json. Nothing here is hand-coded per field.
import React, { useState } from 'react';
import params from '../data/parameters.json';
import { getPath, resolve } from '../code/geometry.js';

const MASS_LABEL = { base: 'בסיס', body: 'גוף', crown: 'כותרת' };
const MASS_VAR = { base: 'var(--mass-base)', body: 'var(--mass-body)', crown: 'var(--mass-crown)' };

// showIf grammar used in parameters.json: "a.b", "a.b>1", "a.b==x", "a.b in x,y,z"
function visible(showIf, scope) {
  if (!showIf) return true;
  const inMatch = showIf.match(/^(.+?)\s+in\s+(.+)$/);
  if (inMatch) return inMatch[2].split(',').includes(String(getPath(scope, inMatch[1].trim())));
  const opMatch = showIf.match(/^(.+?)(==|>=|<=|>|<)(.+)$/);
  if (opMatch) {
    const [, key, op, raw] = opMatch;
    const a = getPath(scope, key.trim());
    const b = raw.trim();
    const n = Number(b);
    if (op === '==') return String(a) === b;
    if (op === '>') return Number(a) > n;
    if (op === '<') return Number(a) < n;
    if (op === '>=') return Number(a) >= n;
    return Number(a) <= n;
  }
  return !!getPath(scope, showIf.trim());
}

// What a segment actually inherits. For height.floors that is the mass's share
// for this segment, not the mass total — the same split buildMass() performs.
function inheritedValue(mass, project, key, segIndex) {
  if (key === 'height.floors') {
    const total = Math.max(1, mass.height?.floors ?? 1);
    const count = Math.max(1, mass.division?.segments ?? 1);
    const per = Math.floor(total / count);
    return per + (segIndex < total - per * count ? 1 : 0);
  }
  return resolve(mass, null, key, project);
}

const labelOf = (options, value) => {
  const hit = (options || []).find((o) => (Array.isArray(o) ? o[0] : o) === value);
  return hit ? (Array.isArray(hit) ? hit[1] : String(hit)) : String(value ?? '');
};

function Field({ field, value, onChange, inherited, onRevert }) {
  const c = field.control;
  const set = (v) => onChange(field.key, v);

  let control = null;
  if (c === 'slider') {
    const shown = value ?? field.default ?? field.min ?? 0;
    control = (
      <div className="row">
        <input type="range" min={field.min} max={field.max} step={field.step}
          value={shown} onChange={(e) => set(Number(e.target.value))} />
        <input type="number" min={field.min} max={field.max} step={field.step}
          value={shown} onChange={(e) => set(Number(e.target.value))} />
        <span className="unit">{field.unit || ''}</span>
      </div>
    );
  } else if (c === 'toggle') {
    control = (
      <div className="segmented">
        <button type="button" className={value ? 'on' : ''} onClick={() => set(true)}>פעיל</button>
        <button type="button" className={!value ? 'on' : ''} onClick={() => set(false)}>כבוי</button>
      </div>
    );
  } else if (c === 'segmented') {
    control = (
      <div className="segmented">
        {field.options.map((o) => {
          const val = Array.isArray(o) ? o[0] : o;
          return (
            <button type="button" key={String(val)} className={value === val ? 'on' : ''} onClick={() => set(val)}>
              {Array.isArray(o) ? o[1] : String(o)}
            </button>
          );
        })}
      </div>
    );
  } else if (c === 'select') {
    control = (
      <select value={value ?? field.default} onChange={(e) => set(e.target.value)}>
        {field.options.map((o) => (
          <option key={o[0]} value={o[0]}>{o[1]}</option>
        ))}
      </select>
    );
  } else if (c === 'anchor') {
    const [ax, ay] = value || [0, 0];
    control = (
      <div className="anchor">
        {[1, 0, -1].map((y) =>
          [-1, 0, 1].map((x) => (
            <button type="button" key={`${x}${y}`} className={ax === x && ay === y ? 'on' : ''}
              onClick={() => set([x, y])} aria-label={`עיגון ${x},${y}`} />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="field">
      <label>
        {field.label}
        {inherited !== undefined && (
          <>
            <span className={`badge ${inherited ? '' : 'local'}`}>{inherited ? 'יורש' : 'מקומי'}</span>
            {!inherited && (
              <button type="button" className="btn small" onClick={() => onRevert(field.key)}>החזר לירושה</button>
            )}
          </>
        )}
      </label>
      {control}
      {field.hint && <div className="hint" style={{ marginTop: 4 }}>{field.hint}</div>}
    </div>
  );
}

function Group({ group, scope, open, onToggle, valueOf, onChange, badgeFor, onRevert }) {
  const fields = group.fields.filter((f) => visible(f.showIf, scope) && (!f.masses || f.masses.includes(scope._massKey)));
  if (!fields.length) return null;
  const summarize = (f) => {
    const v = valueOf(f);
    if (f.control === 'toggle') return `${f.label}: ${v ? 'פעיל' : 'כבוי'}`;
    if (f.options) return labelOf(f.options, v);
    if (f.control === 'anchor') return 'עיגון';
    return `${v ?? f.default ?? ''}${f.unit || ''}`;
  };
  const summary = fields.slice(0, 2).map(summarize).join(' · ');

  return (
    <section className={`group ${open ? 'open' : ''}`}>
      <button type="button" className="head" onClick={onToggle}>
        <h3>{group.num ? `${group.num}. ${group.title}` : group.title}</h3>
        <h4>{group.subtitle}</h4>
        {!open && <div className="summary">{summary}</div>}
      </button>
      {open && (
        <div className="body">
          {fields.map((f) => (
            <Field key={f.key} field={f} value={valueOf(f)} onChange={onChange}
              inherited={badgeFor ? badgeFor(f) : undefined} onRevert={onRevert} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ParamPanel({
  project, effective, level, selectedMass, selectedSegment,
  activeTower, towerCount, onSelectTower, onCopyFromTower,
  onChange, onEnterMass, onEnterSegment, onUp, onSegmentAction, onRevert,
}) {
  // open the group that matters for this level, so nothing important starts hidden
  const [open, setOpen] = useState(level === 'building' ? 'towers' : 'footprint');
  const toggle = (id) => setOpen((o) => (o === id ? null : id));

  // ---------- building level ----------
  if (level === 'building') {
    const b = params.building;
    return (
      <>
        <div className="crumbs">בניין</div>
        <h2>{b.title}</h2>
        <h4>{b.subtitle}</h4>
        <div style={{ height: 16 }} />
        {b.groups.map((g) => (
          <Group key={g.id} group={g} scope={project} open={open === g.id} onToggle={() => toggle(g.id)}
            valueOf={(f) => getPath(project, f.key)} onChange={onChange} />
        ))}
        <div style={{ height: 16 }} />
        <h3>מגדל לעבודה</h3>
        {towerCount > 1 ? (
          <>
            <h4>כל מגדל עומד בפני עצמו. שינוי באחד אינו נוגע באחרים</h4>
            <div className="segmented" style={{ marginTop: 8 }}>
              {Array.from({ length: towerCount }, (_, i) => (
                <button type="button" key={i} className={activeTower === i ? 'on' : ''}
                  onClick={() => onSelectTower(i)}>{i + 1}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h4>מגדל אחד בלבד בפרויקט</h4>
            <div className="hint" style={{ marginTop: 6 }}>
              העלאת <strong>מספר מגדלים</strong> מעל 1 פותחת כאן בורר. כל מגדל עומד בפני עצמו, כדי שאפשר יהיה לבנות בו וריאציה שונה.
            </div>
            <button type="button" className="btn small" style={{ marginTop: 8 }}
              onClick={() => onChange('towers.count', 2)}>הוספת מגדל שני</button>
          </>
        )}
        <div style={{ height: 16 }} />
        <div className="hint" style={{ marginBottom: 8 }}>כניסה לגוש כדי לערוך את הפרמטרים שלו</div>
        <div className="segmented">
          {['base', 'body', 'crown'].map((m) => (
            <button type="button" key={m} onClick={() => onEnterMass(m)}
              disabled={m !== 'body' && project.enabled?.[m] === false}>
              {MASS_LABEL[m]}
            </button>
          ))}
        </div>
      </>
    );
  }

  // `effective` is the project as this tower sees it: tower 0 values plus its own overrides.
  const mass = effective[selectedMass];
  const perTower = towerCount > 1 && activeTower > 0 && selectedMass !== 'base';
  const massScope = { ...mass, _massKey: selectedMass };
  const abs = (key) => `${selectedMass}.${key}`;

  // ---------- segment level ----------
  if (level === 'segment') {
    const seg = mass.segmentsList?.[selectedSegment] || { kind: 'solid', overrides: {} };
    const sp = params.segment;
    const fieldFor = (key) => {
      for (const g of params.mass.groups) {
        const f = g.fields.find((x) => x.key === key);
        if (f) return f;
      }
      return null;
    };
    return (
      <>
        <div className="crumbs">
          <button onClick={() => onUp('building')}>בניין</button>›
          <button onClick={() => onUp('mass')}>{MASS_LABEL[selectedMass]}</button>›
          מקטע {selectedSegment + 1}
        </div>
        <h2>מקטע {selectedSegment + 1}</h2>
        <h4>{sp.subtitle}</h4>
        <div style={{ height: 16 }} />
        <div className="field">
          <label>{sp.kind.label}</label>
          <div className="segmented">
            {sp.kind.options.map(([v, l]) => (
              <button type="button" key={v} className={(seg.kind || 'solid') === v ? 'on' : ''}
                onClick={() => onChange(`${selectedMass}.segmentsList.${selectedSegment}.kind`, v)}>{l}</button>
            ))}
          </div>
        </div>
        {sp.overridable.map((key) => {
          const f = fieldFor(key);
          if (!f) return null;
          const isOverridden = seg.overrides?.[key] !== undefined;
          return (
            <Field key={key} field={f}
              value={isOverridden ? seg.overrides[key] : inheritedValue(mass, project, key, selectedSegment)}
              inherited={!isOverridden}
              onRevert={() => onRevert(selectedMass, selectedSegment, key)}
              onChange={(k, v) => onChange(`${selectedMass}.segmentsList.${selectedSegment}.overrides.${k}`, v)} />
          );
        })}
        <div style={{ height: 16 }} />
        <h4 style={{ marginBottom: 6 }}>פעולות על המקטע</h4>
        <div className="actions">
          <button type="button" className="btn small ghost" onClick={() => onSegmentAction('duplicate')}>שכפול</button>
          <button type="button" className="btn small ghost" onClick={() => onSegmentAction('up')}>למעלה</button>
          <button type="button" className="btn small ghost" onClick={() => onSegmentAction('down')}>למטה</button>
          <button type="button" className="btn small ghost danger" onClick={() => onSegmentAction('delete')}>מחיקה</button>
        </div>
      </>
    );
  }

  // ---------- mass level ----------
  const typeSel = params.mass.typeByMass[selectedMass];
  const segs = selectedMass === 'body' ? mass.segmentsList || [] : [];
  return (
    <>
      <div className="crumbs">
        <button onClick={() => onUp('building')}>בניין</button>› {MASS_LABEL[selectedMass]}
      </div>
      <h2>
        <span className="swatch" style={{ background: MASS_VAR[selectedMass] }} />
        {MASS_LABEL[selectedMass]}{towerCount > 1 && selectedMass !== 'base' ? ` · מגדל ${activeTower + 1}` : ''}
      </h2>
      <h4>{mass.height?.floors} קומות{segs.length > 1 ? ` · ${segs.length} מקטעים` : ''}</h4>
      {towerCount > 1 && selectedMass === 'base' && (
        <div className="hint" style={{ marginTop: 6 }}>הבסיס משותף לכל המגדלים</div>
      )}
      {perTower && (
        <>
          <div className="hint" style={{ marginTop: 6 }}>שינוי כאן חל על מגדל {activeTower + 1} בלבד</div>
          <div className="actions" style={{ marginTop: 8 }}>
            {Array.from({ length: towerCount }, (_, i) => i).filter((i) => i !== activeTower).map((i) => (
              <button type="button" key={i} className="btn small ghost" onClick={() => onCopyFromTower(i)}>
                העתקה ממגדל {i + 1}
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>העתקה חד-פעמית. אחריה המגדלים ממשיכים להיות נפרדים</div>
        </>
      )}
      <div style={{ height: 16 }} />
      {typeSel && (
        <div className="field">
          <label>{typeSel.label}</label>
          <select value={mass[typeSel.key] ?? typeSel.default}
            onChange={(e) => onChange(abs(typeSel.key), e.target.value)}>
            {typeSel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
      {params.mass.groups.map((g) => (
        <Group key={g.id} group={g} scope={massScope} open={open === g.id} onToggle={() => toggle(g.id)}
          valueOf={(f) => getPath(mass, f.key)}
          onChange={(k, v) => onChange(abs(k), v)} />
      ))}
      {selectedMass === 'body' && (
        <>
          <div style={{ height: 16 }} />
          <div className="hint" style={{ marginBottom: 8 }}>כניסה למקטע כדי לדרוס ערכים מקומית</div>
          <div className="segmented">
            {segs.map((_, i) => (
              <button type="button" key={i} onClick={() => onEnterSegment(i)}>{i + 1}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
