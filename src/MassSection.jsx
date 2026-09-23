// MassSection.jsx — the schematic vertical section. This is the primary navigation,
// drawn from the same buildTower() slabs the 3D viewport uses.
import React from 'react';

const MASS_VAR = { base: 'var(--mass-base)', body: 'var(--mass-body)', crown: 'var(--mass-crown)' };
const MASS_LABEL = { base: 'בסיס', body: 'גוף', crown: 'כותרת' };

function bboxWidth(points) {
  const xs = points.map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
}

export default function MassSection({ slabs, level, selectedMass, selectedSegment, onSelectMass, onSelectSegment }) {
  const tower0 = slabs.filter((s) => (s.tower ?? 0) === 0 && s.mass !== 'bridge');
  if (!tower0.length) return <div className="column" />;

  // one block per base / body segment / crown
  const groups = [];
  for (const s of tower0) {
    const key = `${s.mass}:${s.segment ?? ''}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, mass: s.mass, segment: s.segment, z0: s.z0, z1: s.z1, width: 0 };
      groups.push(g);
    }
    g.z0 = Math.min(g.z0, s.z0);
    g.z1 = Math.max(g.z1, s.z1);
    g.width = Math.max(g.width, bboxWidth(s.points));
  }

  const total = Math.max(...groups.map((g) => g.z1)) || 1;
  const maxW = Math.max(...groups.map((g) => g.width)) || 1;
  const ordered = [...groups].sort((a, b) => b.z1 - a.z1); // top of the building first

  return (
    <nav className="column" aria-label="חתך הגושים">
      <div className="caption">חתך הגושים</div>
      {ordered.map((g) => {
        const isSel =
          g.mass === selectedMass &&
          (level === 'segment' ? g.segment === selectedSegment : level === 'mass');
        const h = Math.max(14, ((g.z1 - g.z0) / total) * 460);
        return (
          <button
            type="button"
            key={g.key}
            className={`seg-block ${isSel ? 'sel' : ''}`}
            style={{ height: h, background: MASS_VAR[g.mass], width: `${Math.max(34, (g.width / maxW) * 100)}%`, marginInline: 'auto' }}
            title={g.mass === 'body' && g.segment !== null ? `מקטע ${g.segment + 1}` : MASS_LABEL[g.mass]}
            onClick={() => (g.mass === 'body' && g.segment !== null ? onSelectSegment(g.segment) : onSelectMass(g.mass))}
          >
            {h > 22 ? (g.mass === 'body' && g.segment !== null ? g.segment + 1 : MASS_LABEL[g.mass]) : ''}
          </button>
        );
      })}
    </nav>
  );
}
