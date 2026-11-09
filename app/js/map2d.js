/* ===== mhdGO – 2D mapa (Leaflet) ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const M = MG.map = {};
 const CZ_BOUNDS = L.latLngBounds([48.55, 12.09], [51.06, 18.86]);
 const OSMA = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · data CIS JŘ, PID';
 /* bez Mapbox tokenu: OpenStreetMap (CARTO už vyžaduje klíč) – světlá a tmavá varianta filtrem, letecká Esri */
 const OSMT = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
 const FALLBACK = {'streets-v12': [OSMT, ''], 'navigation-night-v1': [OSMT, 'tl-dark'], 'light-v11': [OSMT, 'tl-light'], 'dark-v11': [OSMT, 'tl-dark'], 'satellite-streets-v12': [ESRI, '']};
 const tile = (style) => MG.cfg.MAPBOX ? L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/' + style + '/tiles/512/{z}/{x}/{y}@2x?access_token=' + MG.cfg.MAPBOX,
  {tileSize: 512, zoomOffset: -1, maxZoom: 20, crossOrigin: true, attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' + OSMA}) :
  L.tileLayer(FALLBACK[style][0], {maxZoom: 20, maxNativeZoom: 19, className: FALLBACK[style][1], crossOrigin: true, attribution: (style.startsWith('satellite') ? '© Esri, Maxar · ' : '') + OSMA});
 M.init = () => {
  const map = M.m = L.map('map', {zoomControl: false, preferCanvas: true, minZoom: 6, maxZoom: 19, zoomSnap: .5, wheelPxPerZoomLevel: 90, maxBounds: CZ_BOUNDS.pad(.6), worldCopyJump: false});
  map.setView([49.8, 15.5], 7);
  M.styles = {basic: () => document.body.classList.contains('dark') ? 'navigation-night-v1' : 'streets-v12', light: () => document.body.classList.contains('dark') ? 'dark-v11' : 'light-v11', sat: () => 'satellite-streets-v12'};
  M.layerKey = MG.store.get('layer', 'basic');
  M.setLayer(M.layerKey);
  map.createPane('okres').style.zIndex = 350;
  map.createPane('net').style.zIndex = 380;
  map.createPane('sel').style.zIndex = 420;
  map.createPane('stops').style.zIndex = 450;
  map.createPane('veh').style.zIndex = 620;
  map.createPane('me').style.zIndex = 640;
  M.rNet = L.canvas({pane: 'net', padding: .4});
  M.rSel = L.canvas({pane: 'sel', padding: .4});
  M.rFlow = L.svg({pane: 'sel', padding: .3});
  M.rStops = L.canvas({pane: 'stops', padding: .3, tolerance: 6});
  M.gOkres = L.layerGroup().addTo(map);
  M.gNet = L.layerGroup().addTo(map);
  M.gSel = L.layerGroup().addTo(map);
  M.gStops = L.layerGroup().addTo(map);
  M.gPlat = L.layerGroup().addTo(map);
  M.gMe = L.layerGroup().addTo(map);
  $('z-in').onclick = () => MG.mode3d ? MG.m3d.zoom(1) : map.zoomIn();
  $('z-out').onclick = () => MG.mode3d ? MG.m3d.zoom(-1) : map.zoomOut();
  MG.qsa('#layers .lay, #layseg button').forEach(b => b.onclick = () => M.setLayer(b.dataset.l));
  M.updThumbs();
  map.on('zoomend moveend', () => { updScale(); M.refreshStops(); MG.emit('view'); });
  map.on('click', () => MG.emit('mapclick'));
  updScale();
  M.drawOkresy();
 };
 /* náhledy podkladů a jejich názvy podle režimu (v tmavém režimu „Tmavá“ a tmavé náhledy) */
 M.updThumbs = () => {
  const dark = document.body.classList.contains('dark');
  const thumb = (st) => MG.cfg.MAPBOX ? 'https://api.mapbox.com/styles/v1/mapbox/' + st + '/tiles/256/12/2211/1387?access_token=' + MG.cfg.MAPBOX : FALLBACK[st][0].replace('{z}', 12).replace('{x}', 2211).replace('{y}', 1387);
  const set = (id, st) => { const e = $(id); if (!e) return; e.style.backgroundImage = 'url(' + thumb(st) + ')'; e.classList.remove('tl-light', 'tl-dark'); if (!MG.cfg.MAPBOX && FALLBACK[st][1]) e.classList.add(FALLBACK[st][1]); };
  set('lay-basic', M.styles.basic()); set('lay-light', M.styles.light()); set('lay-sat', M.styles.sat());
  MG.qsa('[data-l="light"]').forEach(b => { const em = b.querySelector('em'); const t = dark ? 'Tmavá' : 'Světlá'; if (em) em.textContent = t; else b.textContent = t; });
 };
 M.setLayer = (k) => {
  M.layerKey = k; MG.store.set('layer', k);
  if (M.base) M.m.removeLayer(M.base);
  M.base = tile(M.styles[k]()).addTo(M.m); M.base.bringToBack();
  MG.qsa('#layers .lay, #layseg button').forEach(b => b.classList.toggle('on', b.dataset.l === k));
 };
 M.retheme = () => { M.setLayer(M.layerKey); M.updThumbs(); M.drawOkresy(); };
 function updScale() {
  const m = M.m, c = m.getCenter(), z = m.getZoom();
  const mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z + 8);
  const max = 80 * mpp, p = Math.pow(10, Math.floor(Math.log10(max))), d = max / p, nice = (d >= 5 ? 5 : d >= 2 ? 2 : 1) * p;
  const w = Math.round(nice / mpp);
  MG.qs('#scale .sc-bar').style.width = w + 'px';
  MG.qs('#scale .sc-tx').textContent = nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m';
 }
 M.updScale = updScale;
 /* ---------- hranice: jen obrys republiky (data nejsou dělená podle okresů) ---------- */
 M.drawOkresy = () => {
  M.gOkres.clearLayers();
  if (!D.geo || !D.geo.cz || !D.geo.cz.length) return;
  const dark = document.body.classList.contains('dark');
  L.polygon(D.geo.cz, {pane: 'okres', renderer: M.rNet, color: dark ? '#E39A70' : '#C1784F', weight: 2, opacity: .55, dashArray: '8 6', fill: false, interactive: false}).addTo(M.gOkres);
 };
 M.fitOkres = (oi, opt) => {
  const bb = D.okresy[oi].bbox, b = L.latLngBounds([bb[1], bb[0]], [bb[3], bb[2]]);
  if (opt && opt.fly) M.m.flyToBounds(b, {padding: [20, 20], duration: .9}); else M.m.fitBounds(b, {padding: [16, 16]});
 };
 M.fitCZ = () => M.m.flyToBounds(CZ_BOUNDS, {padding: [10, 10], duration: .9});
 /* dopravní síť se nekreslí (trasy jen u vybraného vozidla a ve vyhledávání) */
 M.drawNet = () => M.refreshStops();
 M.dimNet = () => {};
 /* ---------- zastávky a nástupiště ---------- */
 let grid = null, gridN = 0;
 const GC = .02;
 function stopGrid() {
  if (grid && gridN === D.st.size) return grid;
  grid = new Map(); gridN = D.st.size;
  for (const s of D.st.values()) { if (!s.lines.size) continue; const k = Math.floor(s.lat / GC) + ':' + Math.floor(s.lon / GC); (grid.get(k) || grid.set(k, []).get(k)).push(s); }
  return grid;
 }
 M.stopsIn = (S, W, N, E) => {
  const g = stopGrid(), out = [];
  for (let a = Math.floor(S / GC); a <= Math.floor(N / GC); a++) for (let b = Math.floor(W / GC); b <= Math.floor(E / GC); b++) { const c = g.get(a + ':' + b); if (c) for (const s of c) if (s.lat >= S && s.lat <= N && s.lon >= W && s.lon <= E) out.push(s); }
  return out;
 };
 M.refreshStops = () => {
  if (!M.m) return;
  const z = M.m.getZoom(), b = M.m.getBounds().pad(.25);
  M.gStops.clearLayers(); M.gPlat.clearLayers();
  if (z < 12.5 || !D.st.size) return;
  const dark = document.body.classList.contains('dark');
  for (const s of M.stopsIn(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())) {
   const isTrain = [...s.lines].some(l => { const x = D.ln.get(l); return x && x.k === 'vlak'; });
   if (z < 14 && !isTrain && s.lines.size < 3) continue;
   const r = isTrain ? (z >= 14 ? 6.5 : 5) : (z >= 15 ? 5.5 : z >= 14 ? 4.2 : 3.2);
   const c = L.circleMarker([s.lat, s.lon], {renderer: M.rStops, radius: r, color: isTrain ? '#2f3b52' : (dark ? '#f1ebe5' : '#24201c'), weight: isTrain ? 2.5 : 2, fillColor: isTrain ? '#fff' : (dark ? '#24201c' : '#fff'), fillOpacity: 1});
   c.on('click', (e) => { L.DomEvent.stop(e); MG.dep && MG.dep.stopPopup(s.g); });
   c.bindTooltip(MG.h(s.name), {className: 'stop-tip', direction: 'top', offset: [0, -6]});
   c.addTo(M.gStops);
  }
 };
 /* ---------- výběr: trasa linky / spoje / spojení ---------- */
 M.clearSel = () => { M.gSel.clearLayers(); M.selKind = null; M._selTok = {}; };
 M.showPattern = (p, opt) => {
  opt = opt || {}; M.gSel.clearLayers();
  const Ln = D.ln.get(p.l), g = D.geo3(p);
  const tok = M._selTok = {};
  if (g.tmp) D.shapeOf(p).then(() => { if (M._selTok === tok && M.selKind === (opt.kind || 'line')) M.showPattern(p, Object.assign({}, opt, {fit: false})); });
  let pts = g.pts, from = opt.fromK || 0;
  if (opt.fromD != null) { const r = D.pointAt(g, opt.fromD); const i = r[3]; pts = [[r[0], r[1]], ...g.pts.slice(i + 1)]; }
  else if (from > 0) pts = g.pts.slice(g.x[from]);
  L.polyline(pts, {renderer: M.rSel, color: '#ffffff', weight: 9, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(M.gSel);
  L.polyline(pts, {renderer: M.rSel, color: Ln.c, weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(M.gSel);
  L.polyline(pts, {renderer: M.rFlow, color: '#fff', weight: 3, opacity: .95, dashArray: '10 14', lineCap: 'butt', className: 'flow41', interactive: false}).addTo(M.gSel);
  p.s.forEach((pg, k) => {
   if (k < from) return; const pl = D.pl.get(pg); if (!pl) return;
   const term = k === 0 || k === p.s.length - 1;
   const c = L.circleMarker([pl.lat, pl.lon], {renderer: M.rSel, radius: term ? 6.5 : 4.8, color: Ln.c, weight: 3, fillColor: term ? Ln.c : '#fff', fillOpacity: 1});
   c.bindTooltip(MG.h(D.stName(pl.st)), {className: 'stop-tip', direction: 'top', offset: [0, -6]});
   c.on('click', (e) => { L.DomEvent.stop(e); MG.dep && MG.dep.stopPopup(pl.st, pg); });
   c.addTo(M.gSel);
  });
  M.dimNet(true); M.selKind = opt.kind || 'line';
  if (opt.fit) { const b = L.latLngBounds(pts); M.m.flyToBounds(b, {padding: M.padFit(), duration: .7, maxZoom: 16}); }
 };
 M.padFit = () => { const sheetOpen = document.querySelector('.sheet.open,#vcard.open'); const land = matchMedia('(orientation:landscape) and (max-height:520px), (min-width:900px) and (min-height:521px)').matches; if (!sheetOpen) return [30, 30]; return land ? [30, 30] : [30, 30]; };
 M.fitPad = (b) => {
  /* odsazení jen o tu část panelu, která mapu skutečně zakrývá (telefon: list dole, šířka: panel vedle mapy) */
  const sh = document.querySelector('.sheet.open,#vcard.open'), mr = $('mapwrap').getBoundingClientRect();
  let tl = [40, 50], br = [40, 62];
  if (sh) {
   const r = sh.getBoundingClientRect();
   const ox = Math.min(r.right, mr.right) - Math.max(r.left, mr.left), oy = Math.min(r.bottom, mr.bottom) - Math.max(r.top, mr.top);
   if (ox > 0 && oy > 0) {
    if (r.width < mr.width * .75) { if (r.left - mr.left > mr.right - r.right) br[0] = mr.right - r.left + 16; else tl[0] = r.right - mr.left + 16; }
    else br[1] = mr.bottom - r.top + 16;
   }
  }
  M.m.flyToBounds(b, {paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 16, duration: .7});
 };
 /* linka z odjezdů nebo z bubliny vozidla: jen její trasa na mapě (dopravní síť se nezobrazuje) */
 MG.net = {openLine: (li, opt) => {
  const Ln = D.ln.get(li); if (!Ln) return;
  const p = (opt && opt.pattern != null && D.pt.get(opt.pattern)) || D.mainPats(Ln).filter(Boolean)[0]; if (!p) return;
  if (MG.veh.sel && MG.veh.close) MG.veh.close();
  if (MG.mode3d) MG.m3d.close();
  MG.ui.closeSheets();
  M.showPattern(p, {kind: 'line'});
  D.shapeOf(p).then(g => M.fitPad(L.latLngBounds(g.pts)));
  MG.toast((Ln.k === 'vlak' ? '' : 'Linka ') + D.lineText(Ln) + ' → ' + D.headsign(p, 0));
 }};
 MG.on('mapclick', () => { if (M.selKind === 'line') M.clearSel(); });
 /* ---------- moje poloha ---------- */
 M.setMe = (lat, lon, acc) => {
  if (!M.meMk) {
   M.meMk = L.marker([lat, lon], {icon: L.divIcon({className: 'plat-ic', html: '<div class="me-dot"></div>', iconSize: [0, 0]}), pane: 'me', interactive: false}).addTo(M.gMe);
   M.meAcc = L.circle([lat, lon], {radius: acc || 30, pane: 'me', color: '#2a7de1', weight: 1, fillOpacity: .08, interactive: false}).addTo(M.gMe);
  } else { M.meMk.setLatLng([lat, lon]); M.meAcc.setLatLng([lat, lon]).setRadius(acc || 30); }
 };
})();
