// "הליכה ברחוב": the tower among Rogozin's real buildings, walked at eye height (shared <space-walk>, appofapp-gh/walk.js).
// Same coordinates as TowerViewer: plan (x, y) in metres, y north. walk.js takes [x, z] with z south, so z = -y.
import { useEffect, useMemo, useRef } from 'react';
import { buildTower } from '../code/geometry.js';

const CONTEXT_H = 12; // the context note's own assumption: 4 floors, 12 m
const n1 = (v) => v.toLocaleString('he-IL', { maximumFractionDigits: 1 });
const toWalk = (pts) => pts.map(([x, y]) => [+x.toFixed(2), +(-y).toFixed(2)]);
const MASS_COLOR = { base: '#c9c1b3', body: '#ece8df', crown: '#d8d2c4' };

function inPoly(x, z, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

export function streetPlan(project, context) {
  const { slabs, metrics } = buildTower(project);
  const W = project.site?.width ?? 70, D = project.site?.depth ?? 60;
  const city = (context?.buildings || []).map((b, i) => ({ id: `b${i}`, type: 'prism', points: toWalk(b.points), h: b.h || CONTEXT_H, color: '#c3c7cc' }));
  const roads = (context?.roads || []).flatMap((line, i) => line.slice(1).map((p, j) => {
    const a = line[j], [ax, az] = [a[0], -a[1]], [bx, bz] = [p[0], -p[1]];
    const L = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / L) * 4, nz = ((bx - ax) / L) * 4;
    return { id: `r${i}-${j}`, type: 'prism', h: 0.02, color: '#6a6a64', layer: 1, points: [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]] };
  }));
  const plot = { id: 'plot', type: 'prism', h: 0.02, color: '#d7dccd', points: [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]] };
  // one prism per floor, with a hairline gap so the floors read from the street
  const tower = slabs.map((s, i) => ({ id: `s${i}`, type: 'prism', points: toWalk(s.points), y0: s.z0, h: Math.max(0.3, s.z1 - s.z0 - 0.12), color: MASS_COLOR[s.mass] || '#ece8df' }));

  const pts = city.flatMap((b) => b.points).concat(plot.points);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  // start on a street 45 to 110 m from the site, outside every building, facing the tower
  const cand = roads.flatMap((r) => r.points.slice(0, 1)).map(([x, z]) => ({ x, z, d: Math.hypot(x, z) }))
    .filter((c) => c.d > 45 && c.d < 110 && !city.some((b) => inPoly(c.x, c.z, b.points)))
    .sort((a, b) => Math.abs(a.d - 70) - Math.abs(b.d - 70));
  const s0 = cand[0] || { x: 0, z: D / 2 + 30 };
  const ratio = metrics.height / CONTEXT_H;

  return {
    id: 'skyskiper-street',
    title: context?.name ? `${context.name} · מגרש ${W} × ${D} מ'` : `מגרש ${W} × ${D} מ'`,
    bounds: [Math.min(...xs) - 20, Math.min(...zs) - 20, Math.max(...xs) + 20, Math.max(...zs) + 20],
    ground: '#dcd8ce',
    speed: 5,
    spawn: { x: s0.x, z: s0.z, yaw: (Math.atan2(s0.x, s0.z) * 180) / Math.PI },
    heights: [{ cm: 160, label: 'מבוגר עומד' }, { cm: 95, label: 'ילד בן 3' }],
    rule: 'בניינים מ-OpenStreetMap. גובה הבניינים סביב **12 מ\'** הוא **הנחה** (4 קומות), כי ב-OSM אין מספר קומות. המגדל מחושב מהמודל, קומה אחר קומה.',
    source: context?.source || '',
    items: [plot, ...roads, ...city],
    variants: [
      { id: 'today', label: 'הרחוב היום', note: 'הבניינים של השכונה, בלי המגדל.',
        summary: { insight: 'הרחוב היום: עד **12 מ\'**', explain: `**${city.length}** בניינים סביב המגרש, בגובה משוער של **4 קומות**.` }, items: [] },
      { id: 'tower', label: 'עם המגדל', tone: 'solution', note: `**${metrics.floors} קומות**, בסיס, גוף וכותרת ביחס **${metrics.split.join(':')}**.`,
        summary: { insight: `המגדל: **${n1(metrics.height)} מ'**`, explain: `גבוה פי **${n1(ratio)}** מהבניינים סביבו. מהמדרכה רואים בעיקר את **הבסיס**.` }, items: tower },
    ],
  };
}

export default function StreetWalk({ project, context }) {
  const ref = useRef(null);
  const plan = useMemo(() => streetPlan(project, context), [project, context]);
  useEffect(() => { if (ref.current) ref.current.plan = plan; }, [plan]);
  return <space-walk ref={ref} class="street-walk" variant="tower" data-testid="street-walk" />;
}
