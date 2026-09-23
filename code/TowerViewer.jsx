// TowerViewer.jsx — 3D viewport. Only dependency: "three".
// Props:
//   project        Project data object
//   level          'building' | 'mass' | 'segment'
//   selectedMass   'base' | 'body' | 'crown' | null
//   selectedSegment number | null
//   colorMode      'mass' | 'use' | 'white'
//   floorLines     boolean
//   onPick(mass, segment)   called on double-click on a mass
// Ref methods: setView(name), zoom(factor), center(), reset(), snapshot() -> dataURL
// View names: 'axon' | 'front' | 'side' | 'top' | 'eye'

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildTower } from './geometry';

const MASS_COLORS = { base: '#C27A55', body: '#7F93A6', crown: '#CFAE5C', bridge: '#8C7A6B' };
const USE_COLORS = { residential: '#7F93A6', office: '#5E8C7E', hotel: '#9A7BA6', retail: '#C27A55', public: '#6F9BB8', mechanical: '#9AA3AB', other: '#B8B2A7' };
const ACCENT = '#0F6E6E';
const MUTED = '#D3D9DF';

const TowerViewer = forwardRef(function TowerViewer(
  { project, level = 'building', selectedMass = null, selectedSegment = null, colorMode = 'mass', floorLines = true, onPick },
  ref
) {
  const mountRef = useRef(null);
  const s = useRef({}); // three objects live here

  // ---------- setup once ----------
  useEffect(() => {
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.setClearColor('#F4F2EE');
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never below ground
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight('#ffffff', '#d9d3c7', 0.9));
    const sun = new THREE.DirectionalLight('#ffffff', 1.1);
    sun.position.set(-120, 200, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, far: 800 });
    scene.add(sun);

    const group = new THREE.Group();
    const ground = new THREE.Group();
    scene.add(group, ground);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let anim = null;
    const loop = () => {
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.start) / 500);
        const e = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
        controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
        if (t >= 1) anim = null;
      }
      controls.update();
      renderer.render(scene, camera);
      s.current.raf = requestAnimationFrame(loop);
    };
    loop();

    const ray = new THREE.Raycaster();
    const onDbl = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      const hit = ray.intersectObjects(group.children, false).find((h) => h.object.userData.mass);
      if (hit && s.current.onPick) s.current.onPick(hit.object.userData.mass, hit.object.userData.segment);
    };
    renderer.domElement.addEventListener('dblclick', onDbl);

    s.current = { ...s.current, renderer, scene, camera, controls, group, ground,
      animateTo: (toPos, toTarget) => { anim = { start: performance.now(), fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget }; } };

    return () => {
      cancelAnimationFrame(s.current.raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('dblclick', onDbl);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  s.current.onPick = onPick;

  // ---------- rebuild model when inputs change ----------
  useEffect(() => {
    const { group, ground } = s.current;
    if (!group) return;
    const clear = (g) => { while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); c.material?.dispose(); } };
    clear(group); clear(ground);

    // site
    const sw = project.site?.width ?? 70, sd = project.site?.depth ?? 60;
    const site = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), new THREE.MeshLambertMaterial({ color: '#E9E5DD' }));
    site.rotation.x = -Math.PI / 2; site.receiveShadow = true; ground.add(site);
    const grid = new THREE.GridHelper(Math.max(sw, sd) * 3, Math.round(Math.max(sw, sd) * 3 / 10), '#CFC8BC', '#E2DDD3');
    grid.position.y = -0.02; ground.add(grid);

    const { slabs } = buildTower(project);
    let maxZ = 0;
    for (const sl of slabs) {
      maxZ = Math.max(maxZ, sl.z1);
      const shape = new THREE.Shape(sl.points.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: sl.z1 - sl.z0, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // shape y (north) -> world -z, extrusion -> up
      geo.translate(0, sl.z0, 0);

      const inMass = !selectedMass || sl.mass === selectedMass;
      const ghost = level !== 'building' && !inMass;
      const segDim = level === 'segment' && sl.mass === selectedMass && sl.segment !== selectedSegment;
      const picked = level === 'segment' && sl.mass === selectedMass && sl.segment === selectedSegment;

      let color = colorMode === 'use' ? USE_COLORS[sl.use] || USE_COLORS.other : colorMode === 'white' ? '#F7F6F2' : MASS_COLORS[sl.mass];
      if (segDim) color = MUTED;
      const opacity = ghost ? 0.12 : sl.kind === 'open' ? 0.35 : 1;

      if (sl.kind !== 'void') {
        const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = !ghost; mesh.receiveShadow = true;
        mesh.userData = { mass: sl.mass === 'bridge' ? 'body' : sl.mass, segment: sl.segment };
        group.add(mesh);
      }
      if (floorLines || sl.kind === 'void' || picked || ghost) {
        const lineColor = picked ? ACCENT : sl.kind === 'void' || ghost ? '#8A939C' : '#1D2023';
        const lineOpacity = picked ? 1 : ghost ? 0.35 : sl.kind === 'void' ? 0.6 : 0.22;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: lineOpacity }));
        group.add(edges);
      }
      if (sl.kind === 'void') geo.dispose();
    }
    s.current.bounds = { h: Math.max(maxZ, 10), w: Math.max(sw, sd) };
    const { controls } = s.current;
    controls.minDistance = 10;
    controls.maxDistance = Math.max(maxZ, sw, sd) * 6;
    if (!s.current.initialized) { setView('axon', true); s.current.initialized = true; }
  }, [project, level, selectedMass, selectedSegment, colorMode, floorLines]);

  // frame the selected mass when entering it
  useEffect(() => {
    if (level === 'building' || !selectedMass) return;
    const box = new THREE.Box3();
    s.current.group.children.forEach((c) => { if (c.userData.mass === selectedMass) box.expandByObject(c); });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = s.current.camera.position.clone().sub(s.current.controls.target).normalize();
    s.current.animateTo(c.clone().add(dir.multiplyScalar(size * 1.6)), c);
  }, [level, selectedMass]);

  function setView(name, instant = false) {
    const { h, w } = s.current.bounds || { h: 100, w: 70 };
    const d = Math.max(h, w) * 2.2, mid = new THREE.Vector3(0, h / 2, 0);
    const views = {
      axon: [new THREE.Vector3(d * 0.7, h * 0.9, d * 0.7), mid],
      front: [new THREE.Vector3(0, h / 2, d), mid],
      side: [new THREE.Vector3(d, h / 2, 0), mid],
      top: [new THREE.Vector3(0, d * 1.3, 0.01), new THREE.Vector3(0, 0, 0)],
      eye: [new THREE.Vector3(0, 1.6, w / 2 + 25), new THREE.Vector3(0, h * 0.45, 0)],
    };
    const [pos, target] = views[name] || views.axon;
    if (instant) { s.current.camera.position.copy(pos); s.current.controls.target.copy(target); }
    else s.current.animateTo(pos, target);
  }

  useImperativeHandle(ref, () => ({
    setView,
    zoom: (f) => {
      const { camera, controls } = s.current;
      const pos = controls.target.clone().add(camera.position.clone().sub(controls.target).multiplyScalar(f));
      s.current.animateTo(pos, controls.target.clone());
    },
    center: () => {
      const { camera, controls } = s.current;
      const mid = new THREE.Vector3(0, (s.current.bounds?.h || 100) / 2, 0);
      s.current.animateTo(camera.position.clone().add(mid.clone().sub(controls.target)), mid);
    },
    reset: () => setView('axon'),
    snapshot: () => s.current.renderer.domElement.toDataURL('image/png'),
  }));

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
});

export default TowerViewer;
