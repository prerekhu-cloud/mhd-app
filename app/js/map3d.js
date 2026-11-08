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
  MG.models.loadGLB();
  MG.ui.closeSheets();
  document.body.classList.add('m3d'); MG.mode3d = true;
  $('m-3d').classList.add('on'); $('m-2d').classList.remove('on');
  MG.qs('#tabs button[data-t=ride]').classList.toggle('on', !!opt.ride);
  let c;
  if (opt.follow) { const it = opt.it || MG.veh.byKey.get(opt.follow) || MG.veh.findSel(); if (it) c = {lat: it.lat, lon: it.lon}; }
  if (!c && opt.it && opt.it.virt) { const q = D.pointAt(D.geo3(opt.it.p), 0); c = {lat: q[0], lon: q[1]}; }
  if (!c) c = await T.homeCenter();
  if (!T.map) init(c); else { T.map.resize(); T.map.jumpTo({center: [c.lon, c.lat], zoom: 15.6, pitch: 62, bearing: -18}); }
  if (c.name && !opt.follow) MG.toast('3D · ' + c.name);
  T.loadAround(c);
  if (opt.follow) { T.follow = opt.follow; }
  if (opt.it && opt.it.virt) { const q = D.pointAt(D.geo3(opt.it.p), 0); T.map.jumpTo({center: [q[1], q[0]]}); }
  if (opt.ride) setTimeout(() => (opt.follow || opt.it) ? T.startRide(opt.follow, opt.it) : T.pickRide(), T.ready ? 150 : 900);
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
  if (T.wx == null) { const w = MG.app.wx; T.wx = w && w.code >= 51 && w.code <= 67 || (w && w.code >= 80 && w.code <= 82) ? 'rain' : (w && (w.code >= 71 && w.code <= 77 || w.code === 85 || w.code === 86) ? 'snow' : (w && (w.code === 3 || w.code === 45 || w.code === 48) ? 'cloud' : 'none')); }
  markSeg('fx-wx', T.wx);
  try {
   if (map.setRain) map.setRain(T.wx === 'rain' ? {density: .55, intensity: 1, color: '#a8adbc', opacity: .7, vignette: .9, 'vignette-color': '#464646', direction: [0, 80], 'droplet-size': [2.6, 18], 'distortion-strength': .6, 'center-thinning': 0} : null);
   if (map.setSnow) map.setSnow(T.wx === 'snow' ? {density: .85, intensity: 1, 'center-thinning': .1, direction: [0, 50], opacity: 1, color: '#ffffff', 'flake-size': .7, vignette: .3, 'vignette-color': '#ffffff'} : null);
   if (map.setFog) map.setFog(T.wx === 'none' ? {} : {range: T.wx === 'cloud' ? [1.2, 9] : [0.8, 7], color: T.wx === 'snow' ? '#e9edf2' : T.wx === 'cloud' ? '#c9ccd2' : '#b9bec8', 'horizon-blend': .15});
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
   if (seen.has(li)) continue; seen.add(li); const L_ = D.ln.get(li); if (!L_ || (L_.k === 'vlak' && MG.app.hideTrains) || ((L_.k === 'regio' || L_.k === 'mezi') && MG.app.hideRegio)) continue;
   const col = L_.k === 'vlak' ? '#4a4f5a' : L_.k === 'regio' ? '#d7a17d' : L_.k === 'mezi' ? '#5aa5ad' : (MG.map.colorNet || L_.k === 'metro' ? L_.c : '#C1784F');
   for (const p of D.mainPats(L_).filter(Boolean)) lines.push({type: 'Feature', properties: {c: col}, geometry: {type: 'LineString', coordinates: D.geo3(p).pts.map(q => [q[1], q[0]])}});
  }
  for (const oi of D.loaded) for (const g of (D.okSt.get(oi) || [])) { const s = D.st.get(g); if (!s) continue; const t = [...s.lines].some(l => (D.ln.get(l) || {}).k === 'vlak'); stops.push({type: 'Feature', properties: {g, n: D.shortName(s.name, ''), t}, geometry: {type: 'Point', coordinates: [s.lon, s.lat]}}); }
  T.map.getSource('net3').setData(fc(lines)); T.map.getSource('st3').setData(fc(stops));
 };
 MG.on('pack', () => T.updData());
 /* po načtení skutečných 3D modelů vyměnit vozidla v mapě */
 MG.on('models', () => {
  if (!tl) return;
  for (const o of T.objs.values()) { const type = MG.models.typeOf(o.it.L); if (!MG.models.glb[type] || (o.g.userData && o.g.userData.glb)) continue; tl.scene.remove(o.g); o.g = MG.models.build(type, MG.models.livery(o.it.L)); tl.scene.add(o.g); }
  if (R && R.obj && !(R.obj.userData && R.obj.userData.glb)) { const type = MG.models.typeOf(R.it.L); if (MG.models.glb[type]) { tl.scene.remove(R.obj); R.obj = MG.models.build(type, MG.models.livery(R.it.L)); tl.scene.add(R.obj); } }
  if (R) rideHud(true);
 });
 T.setSel = (pts, color, road) => {
  if (!T.ready) return;
  T.map.getSource('sel3').setData(fc(pts && pts.length > 1 ? [{type: 'Feature', properties: {c: color}, geometry: {type: 'LineString', coordinates: pts.map(q => [q[1], q[0]])}}] : []));
  /* při jízdě pás šíře vozovky (7 m) jako v OpavaGO, jinak čára */
  try {
   T.map.setPaintProperty('sel3', 'line-width', road ? ['interpolate', ['exponential', 2], ['zoom'], 10, .075, 22, 307] : ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7, 19, 18]);
   T.map.setPaintProperty('sel3', 'line-opacity', road ? .82 : 1);
   T.map.setLayoutProperty('sel3-case', 'visibility', road ? 'none' : 'visible');
  } catch (_) {}
 };
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
    if (R) rideStep(now);
    for (const o of T.objs.values()) {
     o.g.visible = !(R && o.it && o.it.key === R.it.key);
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
    if (R && R.cur) {
     const [lat, lon, hd] = R.cur, mc = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0);
     const M = new THREE.Matrix4().makeRotationZ(-hd * Math.PI / 180); M.premultiply(new THREE.Matrix4().makeTranslation((mc.x - ref.x) / mpu, -(mc.y - ref.y) / mpu, 0));
     R.obj.matrix.copy(M); R.obj.matrixAutoUpdate = false; R.obj.matrixWorldNeedsUpdate = true;
     rideCam();
    }
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
  if (R) rideHud();
 };
 /* ---------- jízda vozidlem (jako OpavaGO) ----------
  Vozidlo plynule jede po trase spoje (rychlost podle jízdního řádu, na zastávkách zastaví),
  kamera je za ním, trasa je na silnici vyznačená pásem šíře vozovky. 2× zrychlí jízdu. */
 const RIDE = {zoom: 19.1, pitch: 66};
 let R = null;
 T.pickRide = () => {
  const oi = MG.app.cur; const ids = (D.okLines.get(oi) || []).map(i => D.ln.get(i)).filter(Boolean).filter(L_ => !L_.city || !D.okresy[oi] || true);
  const o = D.okresy[oi]; const bb = o ? o.bbox : null;
  const act = new Map(); for (const it of MG.veh.active(bb ? [bb[1], bb[0], bb[3], bb[2]] : null)) { MG.veh.place(it); (act.get(it.L.i) || act.set(it.L.i, []).get(it.L.i)).push(it); }
  const num = s => { const m = /(\d+)/.exec(s || ''); return m ? +m[1] : 1e9; };
  const srt = ls => ls.sort((a, b) => num(D.lineText(a)) - num(D.lineText(b)) || String(D.lineText(a)).localeCompare(String(D.lineText(b))));
  const chips = ls => '<div class="lns">' + srt(ls).slice(0, 90).map(L_ => '<span class="ln' + (act.has(L_.i) ? '' : ' off') + '" data-rl="' + L_.i + '" style="--lc:' + L_.c + ';--lt:' + L_.tc + '" title="' + MG.h(L_.ln || '') + '">' + MG.h(D.lineText(L_)) + '</span>').join('') + '</div>';
  let h = '<div class="rd-pick"><button class="btn" id="rd-rnd"><i class="fa-solid fa-shuffle"></i>Náhodné vozidlo</button>';
  /* jako v síti: nejdřív MHD okresního města podle druhu, pak MHD dalších měst, regionální, dálkové, vlaky */
  const CITYK = ['metro', 'tram', 'trol', 'mhd'], seat = o ? o.seat : '';
  const KN = {metro: 'Metro', tram: 'Tramvaje', trol: 'Trolejbusy', mhd: 'Autobusy'};
  const mine = ids.filter(L_ => CITYK.includes(L_.k) && (!L_.city || L_.city === seat));
  for (const k of CITYK) { const ls = mine.filter(L_ => L_.k === k); if (ls.length) h += '<div class="sec-t">' + (seat ? 'MHD ' + MG.h(seat) + ' · ' : '') + KN[k] + '</div>' + chips(ls); }
  const byCity = new Map(); for (const L_ of ids.filter(L_ => CITYK.includes(L_.k) && L_.city && L_.city !== seat)) (byCity.get(L_.city) || byCity.set(L_.city, []).get(L_.city)).push(L_);
  for (const [city, ls] of [...byCity].sort((a, b) => b[1].length - a[1].length)) h += '<div class="sec-t">MHD ' + MG.h(city) + '</div>' + chips(ls);
  for (const [k, t] of [['regio', 'Regionální autobusy'], ['mezi', 'Dálkové autobusy'], ['vlak', 'Vlaky']]) { const ls = ids.filter(L_ => L_.k === k); if (ls.length) h += '<div class="sec-t">' + t + '</div>' + chips(ls); }
  h += '<div class="status" style="margin-top:12px">Barevné linky právě jezdí – jízda začne tam, kde je vozidlo teď. U šedých linek začne na první zastávce.</div></div>';
  const el = MG.ui.misc({eb: 'Jízda vozidlem', title: 'Vyber linku', sub: o ? 'Okres ' + MG.h(o.name) : ''}, h, true);
  const go = (li) => {
   const its = act.get(li);
   MG.ui.close('sh-misc');
   if (its && its.length) {
    const c = T.map ? T.map.getCenter() : MG.map.m.getCenter(); const cl = c.lat, cn = c.lng;
    its.sort((a, b2) => MG.dist(cl, cn, a.lat, a.lon) - MG.dist(cl, cn, b2.lat, b2.lon));
    return T.open({follow: its[0].key, ride: true, it: its[0]});
   }
   const L_ = D.ln.get(li), mp = D.mainPats(L_), pt = mp[0] || mp[1]; if (!pt) return MG.toast('Linka nemá trasu');
   T.open({ride: true, it: {key: 'v:' + pt.i, p: pt, L: L_, j: -1, virt: true}});
  };
  MG.qsa('[data-rl]', el).forEach(b => b.onclick = () => go(+b.dataset.rl));
  $('rd-rnd').onclick = () => { const keys = [...act.keys()].filter(li => (D.ln.get(li) || {}).k !== 'vlak'); if (!keys.length) { MG.toast('V okrese teď nic nejede'); return; } go(keys[Math.floor(Math.random() * keys.length)]); };
 };
 const stopD = (g, k) => g.cd[g.x[k]];
 T.startRide = (key, it0) => {
  let it = it0 || (key ? (MG.veh.byKey.get(key) || MG.veh.findKey(key) || ((T.objs.get(key) || {}).it)) : null);
  if (!it) { T.pickRide(); return; }
  if (!tl || !T.ready) { setTimeout(() => T.startRide(key, it), 400); return; }
  T.endRide(true);
  if (!it.virt && !it.pos) MG.veh.place(it);
  const p = it.p, g = D.geo3(p), end = g.cd[g.cd.length - 1];
  let d = !it.virt && it.pos && isFinite(it.pos.d) ? it.pos.d : stopD(g, 0);
  if (d > end - 60) d = stopD(g, 0);
  const obj = MG.models.build(MG.models.typeOf(it.L), MG.models.livery(it.L)); tl.scene.add(obj);
  R = {it, p, g, d, end, mult: 1, dwell: 0, served: -1, sb: null, last: 0, obj, done: false, sig: ''};
  for (let k = 0; k < p.s.length; k++) if (stopD(g, k) <= d + 2) R.served = k;
  T.ride = it.key; T.follow = null; MG.veh.sel = it.key; T.joyB = 0; T.joyP = 0;
  document.body.classList.add('riding');
  MG.qs('#tabs button[data-t=ride]').classList.add('on'); $('m-ride').classList.add('on'); $('m-3d').classList.remove('on');
  T.setSel(g.pts, '#C1784F', true);
  try { T.map.setLayoutProperty('net3', 'visibility', 'none'); } catch (_) {}
  rideHud(true);
  const pt = D.pointAt(g, d); T.map.jumpTo({center: [pt[1], pt[0]], zoom: RIDE.zoom, pitch: RIDE.pitch, bearing: pt[2], padding: ridePad()});
  setFF();
 };
 T.endRide = (quiet) => {
  if (!R && !T.ride) return;
  if (R && R.obj && tl) tl.scene.remove(R.obj);
  R = null; T.ride = null; MG.veh.sel = null; document.body.classList.remove('riding');
  MG.qs('#tabs button[data-t=ride]').classList.remove('on'); T.setSel(null);
  $('m-ride').classList.remove('on'); if (MG.mode3d) $('m-3d').classList.add('on');
  try { T.map.setLayoutProperty('net3', 'visibility', 'visible'); } catch (_) {}
  if (T.map && !quiet) { T.map.easeTo({pitch: 62, zoom: 16.4, padding: {top: 0, bottom: 0, left: 0, right: 0}, duration: 700}); }
 };
 function ridePad() {
  const h = $('ride-hud'), m = $('map3d'); if (!h || !m) return {top: 0, bottom: 0, left: 0, right: 0};
  const a = h.getBoundingClientRect(), b = m.getBoundingClientRect();
  if (!a.width) return {top: 0, bottom: 0, left: 0, right: 0};
  if (a.width < b.width * .7) return {top: 0, bottom: 0, left: 0, right: Math.max(0, b.right - a.left)};
  return {top: 40, bottom: Math.max(0, b.bottom - a.top), left: 0, right: 0};
 }
 /* rychlost úseku podle jízdního řádu (m/s) */
 function segSpeed(k) {
  const p = R.p, g = R.g, it = R.it, prof = it.prof != null ? it.prof : (p.T ? p.T[1] : 0);
  const dist = stopD(g, k + 1) - stopD(g, k);
  let v = 0;
  try { const dt = (p.arr[prof][k + 1] - p.dep[prof][k]) * 60; if (dt > 20) v = dist / dt; } catch (_) {}
  const vmax = it.L.k === 'vlak' ? 33 : it.L.k === 'mezi' || it.L.k === 'regio' ? 22 : 15;
  return MG.clamp(v || 10, 5, vmax);
 }
 function rideStep(now) {
  if (!R) return;
  const dt = R.last ? Math.min(.1, (now - R.last) / 1000) : 0; R.last = now;
  const p = R.p, g = R.g, n = p.s.length;
  if (R.dwell > 0) { R.dwell -= dt * R.mult; }
  else if (!R.done) {
   const k = Math.min(R.served + 1, n - 1), ds = stopD(g, k), toStop = ds - R.d;
   let v = segSpeed(Math.max(0, k - 1)) * R.mult;
   const since = R.d - stopD(g, Math.max(0, R.served));
   if (toStop < 45) v = Math.max(1.4 * R.mult, v * Math.sqrt(Math.max(0, toStop) / 45));
   else if (since < 30) v = Math.max(2.5 * R.mult, v * Math.sqrt(Math.max(.05, since / 30)));
   R.d = Math.min(R.end, R.d + v * dt);
   if (R.d >= ds - .6) {
    R.d = Math.max(R.d, ds); R.served = k;
    if (k >= n - 1) { R.done = true; MG.toast('Konečná zastávka – ' + D.stName(D.pl.get(p.s[n - 1]).st), 3500); setTimeout(() => { if (R && R.done) T.endRide(); }, 7000); }
    else R.dwell = D.isRequest(p, k) ? 2.5 : 6;
    rideHud(true);
   }
  }
  const a = D.pointAt(g, R.d), b = D.pointAt(g, Math.min(R.end, R.d + 9));
  let hd = R.d < R.end - 1 ? MG.bearing(a[0], a[1], b[0], b[1]) : a[2];
  if (R.sb == null) R.sb = hd;
  const df = ((hd - R.sb + 540) % 360) - 180; R.sb = (R.sb + df * Math.min(1, dt * 7) + 360) % 360;
  R.cur = [a[0], a[1], R.sb];
 }
 function rideCam() {
  if (!R || !R.cur) return;
  T.map.jumpTo({center: [R.cur[1], R.cur[0]], bearing: (R.sb + (T.joyB || 0)) % 360, pitch: MG.clamp(RIDE.pitch + (T.joyP || 0), 30, 80), zoom: RIDE.zoom + (T.joyZ || 0), padding: ridePad()});
 }
 function setFF() { const f = $('ride-ff'); if (!f) return; const on = R && R.mult > 1; f.classList.toggle('on', !!on); f.title = on ? 'Zpomalit na 1×' : '2× zrychlit jízdu'; f.innerHTML = '<i class="fa-solid fa-' + (on ? 'backward' : 'forward') + '"></i>'; }
 T.rideFast = () => { if (!R) return; R.mult = R.mult > 1 ? 1 : 2; setFF(); MG.toast(R.mult > 1 ? 'Jízda 2× rychleji' : 'Jízda normální rychlostí', 1400); };
 function rideHud(force) {
  const h = $('ride-hud'); if (!R) return;
  const it = R.it, p = R.p, n = p.s.length, L_ = it.L, city = L_.city || '', g = R.g;
  const nk = R.dwell > 0 ? R.served : Math.min(R.served + 1, n - 1);
  const dNext = Math.max(0, stopD(g, nk) - R.d), seg = nk > 0 ? stopD(g, nk) - stopD(g, nk - 1) : 1;
  const prog = R.dwell > 0 ? 1 : MG.clamp(1 - dNext / (seg || 1), 0, 1);
  const sig = it.key + '|' + nk + '|' + (R.dwell > 0 ? 1 : 0) + '|' + R.done;
  if (force || sig !== R.sig || !h.querySelector('.rd-next')) {
   R.sig = sig;
   const st0 = it.virt ? null : it.start;
   const rows = [];
   for (let k = Math.max(0, nk - 1); k < n; k++) {
    const pl = D.pl.get(p.s[k]); const s = pl && D.st.get(pl.st);
    const others = s ? [...s.lines].filter(x => x !== L_.i).map(x => D.ln.get(x)).filter(Boolean).sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k)).slice(0, 10) : [];
    const tm = st0 != null ? MG.hm2(st0 + p.dep[it.prof][k] + (it.delay > 0 ? it.delay : 0)) : '';
    rows.push('<div class="rd-s' + (k < nk || (k === nk && R.done) ? ' past' : '') + (k === nk && !R.done ? ' nx' : '') + '"><div class="rd-d"><i></i></div><div class="rd-t"><b>' + MG.h(D.shortName(s ? s.name : '?', city)) + (D.isRequest(p, k) ? ' <span class="req-ic" title="Zastávka na znamení"><i class="fa-solid fa-thumbs-up"></i></span>' : '') + '</b>' + (others.length ? '<div class="lns">' + others.map(x => D.badge(x)).join('') + '</div>' : '') + '</div>' + (tm ? '<em class="rd-tm">' + tm + '</em>' : '') + '</div>');
   }
   const t0 = D.shortName(D.plName(p.s[0]), city), t1 = D.shortName(D.plName(p.s[n - 1]), city);
   const ttl = R.done ? 'Konečná zastávka' : R.dwell > 0 ? 'Stojíme – zastávka' : 'Příští zastávka';
   h.innerHTML = '<div class="rd-h">' + D.badge(L_, {text: MG.veh.label(it)}) + '<b>' + MG.h(t0) + ' → ' + MG.h(t1) + '<small>' + MG.h(MG.models.label(it.L)) + (it.live ? ' · živě' + (it.delay != null ? (it.delay > .5 ? ' +' + Math.round(it.delay) + ' min' : ' včas') : '') : it.virt ? ' · ukázková jízda' : ' · podle jízdního řádu') + '</small></b></div>' +
    '<div class="rd-next"><small>' + ttl + '</small><div><b id="rd-nn">' + MG.h(D.shortName(D.plName(p.s[nk]), city)) + '</b><span id="rd-nd"></span></div><div class="rd-bar"><i id="rd-nb"></i></div></div>' +
    '<div class="rd-list" style="--lc:' + L_.c + '">' + rows.join('') + '</div>';
  }
  const nd = $('rd-nd'), nb = $('rd-nb');
  if (nd) nd.textContent = R.dwell > 0 || R.done ? '' : dNext < 1000 ? Math.round(dNext / 10) * 10 + ' m' : (dNext / 1000).toFixed(1).replace('.', ',') + ' km';
  if (nb) nb.style.width = Math.round(prog * 100) + '%';
 }
 setInterval(() => { if (R) rideHud(); }, 500);
 /* ---------- ovladač kamery (joystick) ---------- */
 (function joy() {
  const j = $('joy'), k = $('joy-k'); if (!j) return;
  let on = false, x0 = 0, y0 = 0, b0 = 0, p0 = 0, raf = 0, dx = 0, dy = 0;
  const loop = () => { if (!on || !T.map) return; if (R) { T.joyB = (T.joyB || 0) + dx * .05; T.joyP = MG.clamp((T.joyP || 0) - dy * .03, -33, 15); } else T.map.jumpTo({bearing: T.map.getBearing() + dx * .05, pitch: MG.clamp(T.map.getPitch() - dy * .04, 0, 82)}); raf = requestAnimationFrame(loop); };
  j.addEventListener('pointerdown', e => { on = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; j.setPointerCapture(e.pointerId); raf = requestAnimationFrame(loop); });
  j.addEventListener('pointermove', e => { if (!on) return; dx = MG.clamp(e.clientX - x0, -26, 26); dy = MG.clamp(e.clientY - y0, -26, 26); k.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; });
  const up = () => { on = false; cancelAnimationFrame(raf); k.style.transform = ''; };
  j.addEventListener('pointerup', up); j.addEventListener('pointercancel', up);
  j.addEventListener('dblclick', () => { T.joyB = 0; T.joyP = 0; T.north(); });
  const rx = $('ride-x'); if (rx) rx.onclick = () => T.endRide();
  const ff = $('ride-ff'); if (ff) ff.onclick = () => T.rideFast();
 })();
 /* ---------- bublina vozidla ve 3D ---------- */
 let vpop = null;
 T.vehPopup = (lat, lon, el, onClose) => { T.closeVehPopup(); vpop = new mapboxgl.Popup({className: 'lv-pop', maxWidth: '300px', offset: 18, closeOnClick: true}).setLngLat([lon, lat]).setDOMContent(el).addTo(T.map); vpop.on('close', () => { if (vpop && !vpop._quiet) { vpop = null; onClose(); } }); };
 T.moveVehPopup = (lat, lon) => { if (vpop) vpop.setLngLat([lon, lat]); };
 T.closeVehPopup = () => { if (vpop) { vpop._quiet = true; vpop.remove(); vpop = null; } };
 /* ---------- okno ve 3D ---------- */
 let pop = null;
 T.popup = (lat, lon, html) => { T.closePopup(); pop = new mapboxgl.Popup({className: 'pop-mg', maxWidth: '300px', offset: 12}).setLngLat([lon, lat]).setHTML(html).addTo(T.map); };
 T.closePopup = () => { if (pop) { pop.remove(); pop = null; } };
})();
