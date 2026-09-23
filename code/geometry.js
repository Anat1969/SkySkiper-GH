// geometry.js — pure functions, no dependencies.
// Input: a Project object (see entities/Project.json -> data).
// Output: a list of floor slabs + metrics. The viewer extrudes each slab.
//
// Slab = { mass: 'base'|'body'|'crown'|'bridge', tower: 0..3, segment: index|null,
//          floor: index in mass, z0, z1, points: [[x,y],...], kind: 'solid'|'void'|'mechanical'|'open', use }
// Coordinates: meters. x = east, y = north, z = up. Site centered at 0,0.

const DEG = Math.PI / 180;

// ---------- helpers ----------
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  // immutable set: returns a new object
  const keys = path.split('.');
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

// Segment value -> mass value -> building default.
export function resolve(mass, segment, path, project) {
  if (segment && segment.overrides && segment.overrides[path] !== undefined) return segment.overrides[path];
  const v = getPath(mass, path);
  if (v !== undefined && v !== null) return v;
  if (path === 'height.floorHeight') return project.defaults?.floorHeight ?? 3.3;
  return undefined;
}

function rand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function ease(t, curve) {
  if (curve === 'easeIn') return t * t;
  if (curve === 'easeOut') return 1 - (1 - t) * (1 - t);
  return t;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ---------- footprints (centered, counter-clockwise) ----------
export function footprint(fp) {
  const w = fp.width, d = fp.depth, hw = w / 2, hd = d / 2;
  const arm = Math.max(0.2, Math.min(0.8, fp.armRatio ?? 0.4));
  switch (fp.shape) {
    case 'ellipse': {
      const n = 32, out = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; out.push([hw * Math.cos(a), hd * Math.sin(a)]); }
      return out;
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(fp.sides ?? 5)), out = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI + Math.PI / 2; out.push([hw * Math.cos(a), hd * Math.sin(a)]); }
      return out;
    }
    case 'triangle':
      return [[-hw, -hd], [hw, -hd], [0, hd]];
    case 'L': {
      const aw = w * arm, ad = d * arm;
      return [[-hw, -hd], [hw, -hd], [hw, -hd + ad], [-hw + aw, -hd + ad], [-hw + aw, hd], [-hw, hd]];
    }
    case 'U': {
      const aw = w * arm / 2, ad = d * arm;
      return [[-hw, -hd], [hw, -hd], [hw, hd], [hw - aw, hd], [hw - aw, -hd + ad], [-hw + aw, -hd + ad], [-hw + aw, hd], [-hw, hd]];
    }
    case 'T': {
      const aw = w * arm / 2, ad = d * arm;
      return [[-aw, -hd], [aw, -hd], [aw, hd - ad], [hw, hd - ad], [hw, hd], [-hw, hd], [-hw, hd - ad], [-aw, hd - ad]];
    }
    case 'cross': {
      const aw = w * arm / 2, ad = d * arm / 2;
      return [[-aw, -hd], [aw, -hd], [aw, -ad], [hw, -ad], [hw, ad], [aw, ad], [aw, hd], [-aw, hd], [-aw, ad], [-hw, ad], [-hw, -ad], [-aw, -ad]];
    }
    default: { // rect with optional chamfer or rounded corners
      const r = Math.min(fp.cornerRadius || 0, hw, hd);
      const c = Math.min((fp.chamfer || 0) * Math.min(w, d), hw, hd);
      if (r > 0) {
        const out = [], corners = [[hw - r, -hd + r, -90], [hw - r, hd - r, 0], [-hw + r, hd - r, 90], [-hw + r, -hd + r, 180]];
        for (const [cx, cy, start] of corners) for (let k = 0; k <= 4; k++) { const a = (start + k * 22.5) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        return out;
      }
      if (c > 0) return [[-hw + c, -hd], [hw - c, -hd], [hw, -hd + c], [hw, hd - c], [hw - c, hd], [-hw + c, hd], [-hw, hd - c], [-hw, -hd + c]];
      return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    }
  }
}

function transform(pts, { sx = 1, sy = 1, rot = 0, dx = 0, dy = 0 }) {
  const c = Math.cos(rot * DEG), s = Math.sin(rot * DEG);
  return pts.map(([x, y]) => { const X = x * sx, Y = y * sy; return [X * c - Y * s + dx, X * s + Y * c + dy]; });
}

// ---------- tower positions ----------
function towerOffsets(t) {
  const n = t?.count ?? 1, g = t?.spacing ?? 24;
  if (n <= 1) return [[0, 0]];
  const lay = t.layout || 'row';
  if (lay === 'diagonal') return Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * g, (i - (n - 1) / 2) * g]);
  if (lay === 'triangle' && n === 3) return [[-g / 2, -g * 0.29], [g / 2, -g * 0.29], [0, g * 0.58]];
  if (lay === 'square' || (lay === 'triangle' && n === 4)) return [[-g / 2, -g / 2], [g / 2, -g / 2], [g / 2, g / 2], [-g / 2, g / 2]].slice(0, n);
  return Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * g, 0]);
}

// ---------- one mass -> slabs ----------
function buildMass(project, massKey, mass, ctx, tower) {
  const slabs = [];
  const segCount = massKey === 'body' ? Math.max(1, mass.division?.segments ?? 1) : 1;
  const segs = massKey === 'body' ? (mass.segmentsList || []) : [];
  const totalFloors = Math.max(1, mass.height?.floors ?? 1);
  const baseFloorsPerSeg = Math.floor(totalFloors / segCount);
  const rnd = rand((mass.division?.seed ?? 7) * 97 + 13);

  // anchor relative to the mass below
  const fpW = mass.footprint?.width ?? 20, fpD = mass.footprint?.depth ?? 20;
  const [ax, ay] = mass.position?.anchor ?? [0, 0];
  const anchorX = ctx.belowW ? ax * (ctx.belowW - fpW) / 2 : 0;
  const anchorY = ctx.belowD ? ay * (ctx.belowD - fpD) / 2 : 0;
  const baseDX = ctx.cx + anchorX + (mass.position?.offsetX ?? 0);
  const baseDY = ctx.cy + anchorY + (mass.position?.offsetY ?? 0);
  let z = ctx.z + (mass.position?.gapBelow ?? 0);
  const massZ0 = z;

  const p = mass.profile || {}, dv = mass.division || {};
  let floorInMass = 0;
  let lastW = fpW, lastD = fpD, lastDX = baseDX, lastDY = baseDY;

  for (let si = 0; si < segCount; si++) {
    const seg = segs[si] || { kind: 'solid', overrides: {} };
    const extra = si < totalFloors - baseFloorsPerSeg * segCount ? 1 : 0; // spread remainder
    const segFloors = Math.max(1, seg.overrides?.['height.floors'] ?? (baseFloorsPerSeg + extra));
    const fh = resolve(mass, seg, 'height.floorHeight', project);
    const shape = resolve(mass, seg, 'footprint.shape', project);
    const segW = resolve(mass, seg, 'footprint.width', project) - 2 * (dv.setback || 0) * si;
    const segD = resolve(mass, seg, 'footprint.depth', project) - 2 * (dv.setback || 0) * si;
    const rotSeg = resolve(mass, seg, 'position.rotation', project) ?? 0;
    const use = resolve(mass, seg, 'language.use', project);

    // stagger per segment
    let k = si;
    if (dv.pattern === 'zigzag') k = si % 2;
    let stX = (dv.staggerX || 0) * k, stY = (dv.staggerY || 0) * k;
    if (dv.pattern === 'seeded') { stX = (dv.staggerX || 0) * (rnd() * 2 - 1); stY = (dv.staggerY || 0) * (rnd() * 2 - 1); }
    const oX = (seg.overrides?.['position.offsetX'] ?? 0) + stX;
    const oY = (seg.overrides?.['position.offsetY'] ?? 0) + stY;
    let cantX = 0, cantY = 0;
    if (si === segCount - 1 && segCount > 1 && dv.cantilever) {
      cantX = Math.cos((dv.cantileverDir || 0) * DEG) * dv.cantilever;
      cantY = Math.sin((dv.cantileverDir || 0) * DEG) * dv.cantilever;
    }
    const isVoidSeg = dv.voidEvery > 0 && (si + 1) % dv.voidEvery === 0 && si < segCount - 1;
    const fpSeg = footprint({ ...mass.footprint, shape, width: Math.max(2, segW), depth: Math.max(2, segD) });

    for (let f = 0; f < segFloors; f++) {
      let floorH = fh;
      if (massKey === 'base' && f === 0 && mass.height?.doubleGround) floorH = fh * 2;
      const t = totalFloors > 1 ? ease(floorInMass / (totalFloors - 1), p.curve) : 0;
      const sx = (1 - (p.taperX || 0) * t) * (1 + (p.bulge || 0) * Math.sin(Math.PI * t));
      const sy = (1 - (p.taperY || 0) * t) * (1 + (p.bulge || 0) * Math.sin(Math.PI * t));
      const twist = p.twistMode === 'stepped'
        ? (p.twist || 0) * (segCount > 1 ? si / (segCount - 1) : 0)
        : (p.twist || 0) * t;
      const leanOff = Math.tan((p.lean || 0) * DEG) * (z - massZ0);
      const dx = baseDX + oX + cantX + Math.cos((p.leanDir || 0) * DEG) * leanOff;
      const dy = baseDY + oY + cantY + Math.sin((p.leanDir || 0) * DEG) * leanOff;
      let kind = seg.kind || 'solid';
      if (isVoidSeg && f < (dv.voidFloors || 1)) kind = 'void';
      if (massKey === 'base' && f === 0 && (mass.baseType === 'pilotis')) kind = 'void';
      let fsx = sx, fsy = sy;
      if (massKey === 'base' && f === 0 && (mass.baseType === 'recessed' || mass.baseType === 'colonnade')) { fsx *= 0.86; fsy *= 0.86; }
      const pts = transform(fpSeg, { sx: fsx, sy: fsy, rot: rotSeg + twist, dx, dy });
      slabs.push({ mass: massKey, tower, segment: massKey === 'body' ? si : null, floor: floorInMass, z0: z, z1: z + floorH, points: pts, kind, use });
      z += floorH;
      floorInMass++;
      lastW = segW * fsx; lastD = segD * fsy; lastDX = dx; lastDY = dy;
    }
  }
  return { slabs, top: { z, cx: lastDX, cy: lastDY, belowW: lastW, belowD: lastD } };
}

// crown types adjust a copy of the crown mass before building
function crownVariant(crown) {
  const c = JSON.parse(JSON.stringify(crown));
  c.profile = c.profile || {}; c.division = c.division || {};
  switch (c.crownType) {
    case 'stepped': c.division.segments = Math.max(2, c.division.segments || 3); c.division.setback = c.division.setback || 2; break;
    case 'spire': c.profile.taperX = 0.9; c.profile.taperY = 0.9; break;
    case 'slope': c.profile.taperX = 0.8; c.division.staggerX = -(c.footprint.width * 0.2); c.division.segments = Math.max(2, c.division.segments || 3); break;
    case 'mast': c.footprint.width = Math.min(c.footprint.width, 3); c.footprint.depth = Math.min(c.footprint.depth, 3); break;
    default: break;
  }
  return c;
}

// ---------- building ----------
export function buildTower(project) {
  const slabs = [];
  const en = project.enabled || { base: true, crown: true };
  let ctx = { z: 0, cx: 0, cy: 0, belowW: 0, belowD: 0 };

  if (en.base !== false && project.base && project.baseType !== 'plaza' && project.base.baseType !== 'plaza') {
    const r = buildMass(project, 'base', project.base, ctx, 0);
    slabs.push(...r.slabs);
    ctx = { ...ctx, z: r.top.z, belowW: project.base.footprint.width, belowD: project.base.footprint.depth };
  }
  const offsets = towerOffsets(project.towers);
  const towerTops = [];
  offsets.forEach(([ox, oy], ti) => {
    const r = buildMass(project, 'body', project.body, { ...ctx, cx: ox, cy: oy }, ti);
    slabs.push(...r.slabs);
    towerTops.push(r.top);
    if (en.crown !== false && project.crown) {
      const cv = crownVariant(project.crown);
      if (cv.crownType === 'terminus') {
        cv.footprint = { ...project.body.footprint, width: r.top.belowW, depth: r.top.belowD };
        cv.profile = { ...project.body.profile, taperX: 0.6, taperY: 0.6 };
      }
      const rc = buildMass(project, 'crown', cv, { z: r.top.z, cx: r.top.cx, cy: r.top.cy, belowW: r.top.belowW, belowD: r.top.belowD }, ti);
      rc.slabs.forEach((s) => { if (cv.crownType === 'frame' || cv.crownType === 'screen') s.kind = 'open'; });
      slabs.push(...rc.slabs);
    }
  });

  // bridge between tower 0 and 1
  const b = project.towers?.bridge;
  if (b?.enabled && offsets.length > 1) {
    const [a0, a1] = offsets;
    const fh = project.body.height?.floorHeight ?? project.defaults?.floorHeight ?? 3.3;
    const z0 = ctx.z + (b.floor - 1) * fh;
    const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) / DEG;
    const pts = transform(footprint({ shape: 'rect', width: len, depth: 8 }), { rot: ang, dx: (a0[0] + a1[0]) / 2, dy: (a0[1] + a1[1]) / 2 });
    for (let i = 0; i < (b.floors || 1); i++) slabs.push({ mass: 'bridge', tower: null, segment: null, floor: i, z0: z0 + i * fh, z1: z0 + (i + 1) * fh, points: pts, kind: 'solid', use: 'public' });
  }
  return { slabs, metrics: metrics(project, slabs) };
}

// ---------- metrics ----------
export function metrics(project, slabs) {
  const solid = slabs.filter((s) => s.kind !== 'void');
  const gfa = solid.reduce((a, s) => a + polygonArea(s.points), 0);
  const height = slabs.reduce((m, s) => Math.max(m, s.z1), 0);
  const floorsOf = (m) => new Set(slabs.filter((s) => s.mass === m && s.tower !== 1 && s.tower !== 2 && s.tower !== 3).map((s) => s.floor)).size;
  const hOf = (m) => { const xs = slabs.filter((s) => s.mass === m && (s.tower ?? 0) === 0); return xs.length ? Math.max(...xs.map((s) => s.z1)) - Math.min(...xs.map((s) => s.z0)) : 0; };
  const bodyAreas = solid.filter((s) => s.mass === 'body').map((s) => polygonArea(s.points)).sort((a, b) => a - b);
  const typical = bodyAreas.length ? bodyAreas[Math.floor(bodyAreas.length / 2)] : 0;
  const ground = solid.filter((s) => s.z0 === 0).reduce((a, s) => a + polygonArea(s.points), 0);
  const siteArea = (project.site?.width ?? 1) * (project.site?.depth ?? 1);
  const byUse = {};
  solid.forEach((s) => { byUse[s.use || 'other'] = (byUse[s.use || 'other'] || 0) + polygonArea(s.points); });
  const hb = hOf('base'), hy = hOf('body'), hc = hOf('crown'), ht = hb + hy + hc || 1;
  return {
    height: +height.toFixed(1),
    floors: floorsOf('base') + floorsOf('body') + floorsOf('crown'),
    gfa: Math.round(gfa),
    typicalFloor: Math.round(typical),
    coverage: +(ground / siteArea).toFixed(3),
    split: [hb, hy, hc].map((h) => Math.round((h / ht) * 100)),
    byUse: Object.fromEntries(Object.entries(byUse).map(([k, v]) => [k, Math.round(v)])),
  };
}

// Keep segmentsList length equal to division.segments (call after every change).
export function syncSegments(body) {
  const n = Math.max(1, body.division?.segments ?? 1);
  const list = [...(body.segmentsList || [])];
  while (list.length < n) list.push({ kind: 'solid', overrides: {} });
  list.length = n;
  return { ...body, segmentsList: list };
}
