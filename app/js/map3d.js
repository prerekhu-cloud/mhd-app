/* ===== mhdGO – 3D mapa (Mapbox GL Standard + three.js vozidla) ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const T = MG.m3d = {map: null, ready: false, objs: new Map(), ride: null, follow: null, light: null};
 const waitLibs = async () => { for (let i = 0; i < 100 && !(window.mapboxgl && window.THREE); i++) await MG.sleep(100); return !!(window.mapboxgl && window.THREE); };
 const presetNow = () => { const p = MG.pragueParts(MG.now()), h = p.h + p.mi / 60, mo = p.mo; const rise = 7.5 - 1.6 * Math.cos((mo - 0.5) / 12 * 2 * Math.PI) * 1.0, set = 16.5 + 2.2 * (1 - Math.cos((mo - 0.5) / 12 * 2 * Math.PI)) / 2 * 2; if (h < rise - .7 || h > set + 1) return 'night'; if (h < rise + .8) return 'dawn'; if (h > set - .5) return 'dusk'; return 'day'; };
 /* střed 3D pohledu: centrum obce, kde uživatel je; bez polohy centrum (náhodně vybraného) okresního města */
 T.homeCenter = async () => {
  const me = MG.app.me;
  if (me) {
   const oi = D.okresAt(me.lat, me.lon);
   if (oi >= 0) { try { await D.loadOkres(oi); } catch (_) {} const ob = D.obecAt(oi, me.lat, me.lon); if (ob) return {lat: ob.lat, lon: ob.lon, name: ob.name}; }
   return {lat: me.lat, lon: me.lon, name: 'Moje poloha'};
  }
  const o = D.okresy[MG.app.rndSeat >= 0 ? MG.app.rndSeat : MG.app.cur];
  return {lat: o.seatll[0], lon: o.seatll[1], name: o.seat};
 };
 T.open = async (opt) => {
  opt = opt || {};
  if (!MG.cfg.MAPBOX) { MG.toast('3D mapa potřebuje Mapbox token – zadej ho v Nastavení', 4200); MG.ui.settings(); return; }
  if (!(await waitLibs())) { MG.toast('3D knihovny se nepodařilo načíst'); return; }
  MG.ui.closeSheets();
  document.body.classList.add('m3d'); MG.mode3d = true;
  $('m-3d').classList.add('on'); $('m-2d').classList.remove('on');
  MG.qs('#tabs button[data-t=ride]').classList.toggle('on', !!opt.ride);
  let c;
  if (opt.follow) { const it = MG.veh.byKey.get(opt.follow) || MG.veh.findSel(); if (it) c = {lat: it.lat, lon: it.lon}; }
  if (!c) c = await T.homeCenter();
  if (!T.map) init(c); else { T.map.resize(); T.map.jumpTo({center: [c.lon, c.lat], zoom: 15.6, pitch: 62, bearing: -18}); }
  if (c.name && !opt.follow) MG.toast('3D · ' + c.name);
  T.loadAround(c);
  if (opt.follow) { T.follow = opt.follow; }
  if (opt.ride) setTimeout(() => T.startRide(opt.follow), 900);
  MG.veh.tick();
 };
 T.close = () => {
  if (!MG.mode3d) return;
  T.endRide();
  document.body.classList.remove('m3d'); MG.mode3d = false; T.follow = null;
  $('m-2d').classList.add('on'); $('m-3d').classList.remove('on');
  MG.qs('#tabs button[data-t=ride]').classList.remove('on');
  T.closePopup();
  setTimeout(() => { MG.map.m.invalidateSize(); MG.veh.tick(); }, 50);
 };
 T.loadAround = (c) => { const oi = D.okresAt(c.lat, c.lon); if (oi >= 0 && !D.loaded.has(oi)) D.loadOkres(oi).then(() => { T.updData(); MG.map.drawNet(); }).catch(() => {}); };
 T.recenter = async () => { T.endRide(); T.follow = null; const c = await T.homeCenter(); T.map.flyTo({center: [c.lon, c.lat], zoom: 15.6, pitch: 62, bearing: -18, duration: 1400}); MG.toast('Centrum: ' + c.name); };
 T.zoom = d => T.map && T.map.easeTo({zoom: T.map.getZoom() + d, duration: 300});
 T.north = () => T.map && T.map.easeTo({bearing: 0, pitch: T.map.getPitch(), duration: 500});
 T.bounds = () => { if (!T.map) return [0, 0, 0, 0]; const c = T.map.getCenter(), z = T.map.getZoom(), r = Math.min(.06, .9 / Math.pow(2, z - 10)); return [c.lat - r, c.lng - r * 1.5, c.lat + r, c.lng + r * 1.5]; };
 function init(c) {
  mapboxgl.accessToken = MG.cfg.MAPBOX;
  T.light = presetNow();
  const map = T.map = new mapboxgl.Map({container: 'map3d', style: 'mapbox://styles/mapbox/standard', config: {basemap: {lightPreset: T.light, show3dObjects: true, showPointOfInterestLabels: true, showTransitLabels: false}},
   center: [c.lon, c.lat], zoom: 15.6, pitch: 62, bearing: -18, antialias: true, maxPitch: 82, attributionControl: false, language: 'cs'});
  map.on('error', e => { const m = String((e && e.error && e.error.message) || ''); if (/token|401|403|access/i.test(m)) MG.toast('Mapbox odmítl přístup – zkontroluj token'); });
  map.on('style.load', () => {
   addLayers(); T.ready = true; T.updData(); setFx(); MG.veh.tick();
   markSeg('fx-time', T.light);
  });
  map.on('rotate', () => { const i = MG.qs('#compass i'); if (i) i.style.transform = 'rotate(' + (-45 - map.getBearing()) + 'deg)'; });
  map.on('moveend', () => { if (!T.ride) { const c2 = map.getCenter(); T.loadAround({lat: c2.lat, lon: c2.lng}); } MG.veh.tick(); });
  map.on('dragstart', () => { if (T.follow && !T.ride) T.follow = null; });
  new ResizeObserver(() => map.resize()).observe($('map3d'));
  MG.qsa('#fx-time button').forEach(b => b.onclick = () => { T.light = b.dataset.v; try { map.setConfigProperty('basemap', 'lightPreset', T.light); } catch (_) {} markSeg('fx-time', T.light); lightModels(); });
  MG.qsa('#fx-wx button').forEach(b => b.onclick = () => { T.wx = b.dataset.v; setFx(); markSeg('fx-wx', T.wx); });
 }
 function markSeg(id, v) { MG.qsa('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
 function setFx() {
  const map = T.map; if (!map) return;
  if (T.wx == null) { const w = MG.app.wx; T.wx = w && w.code >= 51 && w.code <= 67 || (w && w.code >= 80 && w.code <= 82) ? 'rain' : (w && (w.code >= 71 && w.code <= 77 || w.code === 85 || w.code === 86) ? 'snow' : 'none'); }
  markSeg('fx-wx', T.wx);
  try {
   if (map.setRain) map.setRain(T.wx === 'rain' ? {density: .55, intensity: 1, color: '#a8adbc', opacity: .7, vignette: .9, 'vignette-color': '#464646', direction: [0, 80], 'droplet-size': [2.6, 18], 'distortion-strength': .6, 'center-thinning': 0} : null);
   if (map.setSnow) map.setSnow(T.wx === 'snow' ? {density: .85, intensity: 1, 'center-thinning': .1, direction: [0, 50], opacity: 1, color: '#ffffff', 'flake-size': .7, vignette: .3, 'vignette-color': '#ffffff'} : null);
   if (map.setFog) map.setFog(T.wx === 'none' ? {} : {range: [0.8, 7], color: T.wx === 'snow' ? '#e9edf2' : '#b9bec8', 'horizon-blend': .15});
  } catch (_) {}
 }
 T.retheme = () => {};
 /* ---------- vrstvy ---------- */
 const fc = f => ({type: 'FeatureCollection', features: f});
 function addLayers() {
  const map = T.map, dark = () => T.light === 'night' || T.light === 'dusk';
  map.addSource('net3', {type: 'geojson', data: fc([])});
  map.addLayer({id: 'net3', type: 'line', source: 'net3', slot: 'middle', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 3.5, 18, 9], 'line-opacity': .8}});
  map.addSource('sel3', {type: 'geojson', data: fc([])});
  map.addLayer({id: 'sel3-case', type: 'line', source: 'sel3', slot: 'middle', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 16, 11, 19, 26]}});
  map.addLayer({id: 'sel3', type: 'line', source: 'sel3', slot: 'middle', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7, 19, 18]}});
  map.addSource('st3', {type: 'geojson', data: fc([])});
  map.addLayer({id: 'st3', type: 'circle', source: 'st3', slot: 'middle', minzoom: 13, paint: {'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6, 18, 9], 'circle-color': '#ffffff', 'circle-stroke-color': ['case', ['get', 't'], '#2f3b52', '#C1784F'], 'circle-stroke-width': 2.5, 'circle-pitch-alignment': 'map'}});
  map.addLayer({id: 'st3-l', type: 'symbol', source: 'st3', slot: 'top', minzoom: 15.5, layout: {'text-field': ['get', 'n'], 'text-size': 11.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular']}, paint: {'text-color': '#3d342d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5}});
  map.addSource('veh3', {type: 'geojson', data: fc([])});
  map.addLayer({id: 'veh3-hit', type: 'circle', source: 'veh3', slot: 'top', paint: {'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 8, 17, 22], 'circle-opacity': 0, 'circle-stroke-width': 0}});
  map.addLayer({id: 'veh3-l', type: 'symbol', source: 'veh3', slot: 'top', minzoom: 12.5, layout: {'text-field': ['get', 'l'], 'text-size': 11, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, -2.1], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-padding': 2}, paint: {'text-color': '#ffffff', 'text-halo-color': ['get', 'c'], 'text-halo-width': 3.2}});
  map.on('click', 'veh3-hit', e => { const f = e.features && e.features[0]; if (!f) return; const k = f.properties.k; if (k) { MG.veh.byKey.get(k) ? MG.veh.select(k, {noPan: true}) : null; } });
  map.on('click', 'st3', e => { const f = e.features && e.features[0]; if (f) MG.dep.stopPopup(f.properties.g); });
  ['veh3-hit', 'st3'].forEach(id => { map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer'); map.on('mouseleave', id, () => map.getCanvas().style.cursor = ''); });
  map.addLayer(threeLayer(), 'veh3-hit');
 }
 T.updData = () => {
  if (!T.ready) return;
  const lines = [], stops = [];
  const seen = new Set();
  for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) {
   if (seen.has(li)) continue; seen.add(li); const L_ = D.ln.get(li); if (!L_ || L_.k === 'vlak' && MG.veh.hideTrains) continue;
   const col = L_.k === 'vlak' ? '#4a4f5a' : L_.k === 'regio' ? '#d7a17d' : L_.k === 'mezi' ? '#5aa5ad' : (MG.map.colorNet || L_.k === 'metro' ? L_.c : '#C1784F');
   for (const p of D.mainPats(L_).filter(Boolean)) lines.push({type: 'Feature', properties: {c: col}, geometry: {type: 'LineString', coordinates: D.geo3(p).pts.map(q => [q[1], q[0]])}});
  }
  for (const oi of D.loaded) for (const g of (D.okSt.get(oi) || [])) { const s = D.st.get(g); if (!s) continue; const t = [...s.lines].some(l => (D.ln.get(l) || {}).k === 'vlak'); stops.push({type: 'Feature', properties: {g, n: D.shortName(s.name, ''), t}, geometry: {type: 'Point', coordinates: [s.lon, s.lat]}}); }
  T.map.getSource('net3').setData(fc(lines)); T.map.getSource('st3').setData(fc(stops));
 };
 MG.on('pack', () => T.updData());
 T.setSel = (pts, color) => { if (!T.ready) return; T.map.getSource('sel3').setData(fc(pts && pts.length > 1 ? [{type: 'Feature', properties: {c: color}, geometry: {type: 'LineString', coordinates: pts.map(q => [q[1], q[0]])}}] : [])); };
 /* zrcadlení výběru z 2D */
 const sp = MG.map.showPattern, cs = MG.map.clearSel;
 MG.map.showPattern = function(p, opt) { const r = sp.apply(this, arguments); try { const g = D.geo3(p); let pts = g.pts; if (opt && opt.fromD != null) { const q = D.pointAt(g, opt.fromD); pts = [[q[0], q[1]], ...g.pts.slice(q[3] + 1)]; } T.setSel(pts, D.ln.get(p.l).c); } catch (_) {} return r; };
 MG.map.clearSel = function() { const r = cs.apply(this, arguments); T.setSel(null); return r; };
 /* ---------- three.js vrstva s vozidly ---------- */
 let tl = null;
 function threeLayer() {
  tl = {id: 'veh3d', type: 'custom', renderingMode: '3d', slot: 'top',
   onAdd(map, gl) {
    this.map = map; this.camera = new THREE.Camera(); this.scene = new THREE.Scene();
    this.amb = new THREE.AmbientLight(0xffffff, .78); this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xffffff, .62); this.sun.position.set(.4, -.6, 1).normalize(); this.scene.add(this.sun);
    this.renderer = new THREE.WebGLRenderer({canvas: map.getCanvas(), context: gl, antialias: true}); this.renderer.autoClear = false;
    lightModels();
   },
   render(gl, matrix) {
    const now = performance.now(), z = this.map.getZoom();
    const sc = MG.clamp(Math.pow(2, (16.2 - z)), 1, 7);
    /* lokální soustava v metrech kolem středu mapy (přesnost float32), sever = +Y */
    const c = this.map.getCenter(), ref = mapboxgl.MercatorCoordinate.fromLngLat([c.lng, c.lat], 0), mpu = ref.meterInMercatorCoordinateUnits();
    for (const o of T.objs.values()) {
     const a = MG.clamp((now - o.t0) / 1000, 0, 1);
     const lat = o.a[0] + (o.b[0] - o.a[0]) * a, lon = o.a[1] + (o.b[1] - o.a[1]) * a;
     let dh = ((o.b[2] - o.a[2] + 540) % 360) - 180; const hd = o.a[2] + dh * a;
     o.cur = [lat, lon, hd];
     const mc = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0);
     const dx = (mc.x - ref.x) / mpu, dy = -(mc.y - ref.y) / mpu;
     const M = new THREE.Matrix4().makeRotationZ(-hd * Math.PI / 180);
     M.premultiply(new THREE.Matrix4().makeScale(sc, sc, sc)); M.premultiply(new THREE.Matrix4().makeTranslation(dx, dy, 0));
     o.g.matrix.copy(M); o.g.matrixAutoUpdate = false; o.g.matrixWorldNeedsUpdate = true;
    }
    if (T.ride) rideCam();
    else if (T.follow) { const o = T.objs.get(T.follow); if (o && o.cur) this.map.jumpTo({center: [o.cur[1], o.cur[0]]}); }
    const loc = new THREE.Matrix4().makeTranslation(ref.x, ref.y, ref.z).scale(new THREE.Vector3(mpu, -mpu, mpu));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(loc);
    this.renderer.resetState(); this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
   }};
  return tl;
 }
 function lightModels() {
  if (!tl) return; const n = T.light === 'night' ? .38 : T.light === 'dusk' || T.light === 'dawn' ? .62 : .8;
  tl.amb.intensity = n; tl.sun.intensity = n * .8;
  for (const m of MG.models.matsList()) if (m.emissive && m.emissiveIntensity) m.emissiveIntensity = T.light === 'night' ? 2.2 : .5;
 }
 T.syncVehicles = (insts) => {
  if (!T.ready || !tl) return;
  const keep = new Set(), feats = [];
  for (const it of insts) {
   keep.add(it.key);
   let o = T.objs.get(it.key);
   const tgt = [it.lat, it.lon, it.hd || 0];
   if (!o) {
    const type = MG.models.typeOf(it.L), liv = MG.models.livery(it.L);
    const g = MG.models.build(type, liv); tl.scene.add(g);
    o = {g, a: tgt, b: tgt, t0: performance.now(), it}; T.objs.set(it.key, o);
   } else { o.a = o.cur || o.b; o.b = tgt; o.t0 = performance.now(); o.it = it; }
   feats.push({type: 'Feature', properties: {k: it.key, l: MG.veh.label(it), c: it.L.c}, geometry: {type: 'Point', coordinates: [it.lon, it.lat]}});
  }
  for (const [k, o] of T.objs) if (!keep.has(k)) { tl.scene.remove(o.g); T.objs.delete(k); }
  T.map.getSource('veh3').setData(fc(feats));
  if (T.ride) rideHud();
 };
 /* ---------- jízda vozidlem ---------- */
 T.startRide = (key) => {
  let it = key ? (MG.veh.byKey.get(key) || MG.veh.findSel()) : null;
  if (!it) {
   const c = T.map.getCenter(); let best = null, bd = 1e12;
   for (const x of MG.veh.insts) { if (x.L.k === 'vlak' && MG.veh.insts.some(y => y.L.k !== 'vlak')) continue; const d = MG.dist(c.lat, c.lng, x.lat, x.lon); if (d < bd) { bd = d; best = x; } }
   it = best;
  }
  if (!it) { MG.toast('V okolí teď nejede žádné vozidlo'); return; }
  T.ride = it.key; MG.veh.sel = it.key; document.body.classList.add('riding');
  MG.map.showPattern(it.p, {fromD: it.pos && it.pos.d, kind: 'veh'});
  MG.toast('Jízda: linka ' + MG.veh.label(it) + ' → ' + it.head);
  rideHud();
 };
 T.endRide = () => { if (!T.ride) return; T.ride = null; document.body.classList.remove('riding'); MG.qs('#tabs button[data-t=ride]').classList.remove('on'); if (T.map) T.map.easeTo({pitch: 62, zoom: 16, duration: 600}); };
 function rideCam() {
  const o = T.objs.get(T.ride); if (!o || !o.cur) return;
  const [lat, lon, hd] = o.cur, k = Math.PI / 180;
  const back = 0.00018; /* ~20 m za vozidlem */
  const la = lat + Math.cos(hd * k) * back * .15, lo = lon + Math.sin(hd * k) * back * .15 / Math.cos(lat * k);
  T.map.jumpTo({center: [lo, la], bearing: hd, pitch: 74, zoom: 18.3});
 }
 function rideHud() {
  const h = $('ride-hud'); const o = T.objs.get(T.ride); if (!o) { if (T.ride) { MG.toast('Spoj dojel do cíle'); T.endRide(); } return; }
  const it = o.it, p = it.p, pos = it.pos || {k: 0};
  const nk = pos.at ? pos.k : Math.min(pos.k + 1, p.s.length - 1);
  const pl = D.pl.get(p.s[nk]); const t = it.start + p.arr[it.prof][nk] + (it.delay > 0 ? it.delay : 0);
  h.innerHTML = D.badge(it.L, {size: 'big', text: MG.veh.label(it)}) + '<div style="flex:1;min-width:0"><div style="font:800 13.5px Outfit,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">→ ' + MG.h(it.head) + '</div><div style="font:600 11.5px Outfit,sans-serif;color:var(--mut)">Příští: ' + MG.h(pl ? D.stName(pl.st) : '') + ' · ' + MG.hm2(t) + '</div></div><button class="btn sm" id="ride-end"><i class="fa-solid fa-xmark"></i>Ukončit</button>';
  $('ride-end').onclick = () => T.endRide();
 }
 /* ---------- okno ve 3D ---------- */
 let pop = null;
 T.popup = (lat, lon, html) => { T.closePopup(); pop = new mapboxgl.Popup({className: 'pop-mg', maxWidth: '300px', offset: 12}).setLngLat([lon, lat]).setHTML(html).addTo(T.map); };
 T.closePopup = () => { if (pop) { pop.remove(); pop = null; } };
})();
