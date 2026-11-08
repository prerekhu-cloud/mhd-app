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
  const thumb = (st) => MG.cfg.MAPBOX ? 'https://api.mapbox.com/styles/v1/mapbox/' + st + '/tiles/256/12/2211/1387?access_token=' + MG.cfg.MAPBOX : FALLBACK[st][0].replace('{z}', 12).replace('{x}', 2211).replace('{y}', 1387);
  if (!MG.cfg.MAPBOX) $('lay-light').classList.add('tl-light');
  $('lay-basic').style.backgroundImage = 'url(' + thumb('streets-v12') + ')';
  $('lay-light').style.backgroundImage = 'url(' + thumb('light-v11') + ')';
  $('lay-sat').style.backgroundImage = 'url(' + thumb('satellite-streets-v12') + ')';
  map.on('zoomend', () => { if ((map.getZoom() >= 15.5) !== !!M.netDetail) M.drawNet(); else M.restyleNet && M.restyleNet(); });
  map.on('moveend', MG.debounce(() => { if (M.netDetail) M.drawNet(); }, 250));
  map.on('zoomend moveend', () => { updScale(); M.refreshStops(); MG.emit('view'); });
  map.on('click', () => MG.emit('mapclick'));
  updScale();
  M.colorNet = MG.store.get('colornet', false);
 };
 M.setLayer = (k) => {
  M.layerKey = k; MG.store.set('layer', k);
  if (M.base) M.m.removeLayer(M.base);
  M.base = tile(M.styles[k]()).addTo(M.m); M.base.bringToBack();
  MG.qsa('#layers .lay, #layseg button').forEach(b => b.classList.toggle('on', b.dataset.l === k));
 };
 M.retheme = () => M.setLayer(M.layerKey);
 function updScale() {
  const m = M.m, c = m.getCenter(), z = m.getZoom();
  const mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z + 8);
  const max = 80 * mpp, p = Math.pow(10, Math.floor(Math.log10(max))), d = max / p, nice = (d >= 5 ? 5 : d >= 2 ? 2 : 1) * p;
  const w = Math.round(nice / mpp);
  MG.qs('#scale .sc-bar').style.width = w + 'px';
  MG.qs('#scale .sc-tx').textContent = nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m';
 }
 M.updScale = updScale;
 /* ---------- hranice okresů ---------- */
 M.drawOkresy = (cur) => {
  M.gOkres.clearLayers();
  if (!D.geo) return;
  const dark = document.body.classList.contains('dark');
  D.geo.okresy.forEach((rings, i) => {
   const isCur = i === cur;
   const pg = L.polygon(rings, {pane: 'okres', renderer: M.rNet, color: isCur ? '#C1784F' : (dark ? '#8d7f73' : '#9c8676'), weight: isCur ? 2.6 : 1, opacity: isCur ? .9 : .45, dashArray: isCur ? '7 6' : '3 5', fillColor: '#C1784F', fillOpacity: isCur ? .03 : 0.0001, interactive: !isCur});
   if (!isCur) pg.on('click', (e) => { L.DomEvent.stop(e); if (M.m.getZoom() < 10.5) MG.app.selectOkres(i, {fly: true}); });
   pg.bindTooltip(D.okresy[i].name, {sticky: true, className: 'stop-tip', direction: 'top', opacity: .95});
   pg.addTo(M.gOkres);
  });
  D.geo.kraje.forEach(rings => L.polygon(rings, {pane: 'okres', renderer: M.rNet, color: dark ? '#b8a99c' : '#7d6a5d', weight: 1.6, opacity: .45, fill: false, interactive: false}).addTo(M.gOkres));
 };
 M.fitOkres = (oi, opt) => {
  const bb = D.okresy[oi].bbox, b = L.latLngBounds([bb[1], bb[0]], [bb[3], bb[2]]);
  if (opt && opt.fly) M.m.flyToBounds(b, {padding: [20, 20], duration: .9}); else M.m.fitBounds(b, {padding: [16, 16]});
 };
 M.fitCZ = () => M.m.flyToBounds(CZ_BOUNDS, {padding: [10, 10], duration: .9});
 /* ---------- síť linek ---------- */
 const NETC = {mhd: '#C1784F', tram: '#b2603a', trol: '#C1784F', metro: null, regio: '#d7a17d', mezi: '#5aa5ad', vlak: '#4a4f5a', lan: '#8b6d5c', lod: '#2c7ab0'};
 const NETW = {mhd: 3, tram: 3.4, trol: 3, metro: 4.5, regio: 2, mezi: 2, vlak: 3, lan: 3, lod: 2.5};
 /* síť: sloučené souběžné trasy (jedna čára jako v OpavaGO), šířka podle přiblížení */
 const W = z => z >= 17 ? 8 : z >= 16 ? 6 : z >= 15 ? 4.6 : z >= 14 ? 3.6 : z >= 12 ? 2.8 : 2.2;
 M.drawNet = () => {
  M.gNet.clearLayers(); M.netLayers = [];
  const dark = document.body.classList.contains('dark'), z = M.m.getZoom();
  const copper = dark ? '#E39A70' : '#C1784F';
  const add = (pts, o) => { const l = L.polyline(pts, Object.assign({renderer: M.rNet, lineCap: 'round', lineJoin: 'round', interactive: true}, o)); l._k = o._k; l.on('click', e => { L.DomEvent.stop(e); M.linesAt(e.latlng); }); l.addTo(M.gNet); M.netLayers.push(l); return l; };
  /* při velkém přiblížení skutečné trasy linek (vedou osou silnic a kolejí, směry se překrývají), jinak sloučená síť */
  M.netDetail = z >= 15.5;
  if (M.netDetail) {
   const b = M.m.getBounds().pad(.35), S = b.getSouth(), Wd = b.getWest(), N = b.getNorth(), E = b.getEast();
   const seen = new Set(), rail = [], reg = [], city = [];
   for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) {
    if (seen.has(li)) continue; seen.add(li); const Ln = D.ln.get(li); if (!Ln) continue;
    if (Ln.k === 'vlak' ? MG.app.hideTrains : (Ln.k === 'regio' || Ln.k === 'mezi') && MG.app.hideRegio) continue;
    const pats = Ln.pats.length <= 6 ? Ln.pats : D.mainPats(Ln).filter(Boolean).concat(Ln.pats.filter(p => p.nt >= 4));
    for (const p of new Set(pats)) {
     const g = D.geo3(p), pts = [];
     let inb = false; for (let i = 0; i < g.lat.length; i += 3) if (g.lat[i] > S && g.lat[i] < N && g.lon[i] > Wd && g.lon[i] < E) { inb = true; break; }
     if (!inb) continue;
     (Ln.k === 'vlak' ? rail : Ln.k === 'regio' || Ln.k === 'mezi' ? reg : city).push(g.pts);
    }
   }
   if (rail.length) { add(rail, {color: dark ? '#9aa1ad' : '#4a4f5a', weight: W(z) * .9 + 1.4, opacity: .8, _k: 'vlak0'}); add(rail, {color: dark ? '#24221f' : '#ffffff', weight: Math.max(1.2, W(z) * .45), opacity: .95, dashArray: '7 8', interactive: false, _k: 'vlak1'}); }
   if (reg.length) add(reg, {color: dark ? '#b98a6c' : '#b98c6e', weight: Math.max(1.6, W(z) * .62), opacity: .75, _k: 'regio'});
   if (city.length) add(city, {color: copper, weight: W(z), opacity: .92, _k: 'mhd'});
  }
  else for (const oi of D.loaded) {
   const n = D.okNet && D.okNet.get(oi); if (!n) continue;
   if (!MG.app.hideTrains) for (const p of n.vlak) { add(p, {color: dark ? '#9aa1ad' : '#4a4f5a', weight: W(z) * .9 + 1.4, opacity: .8, _k: 'vlak0'}); add(p, {color: dark ? '#24221f' : '#ffffff', weight: Math.max(1.2, W(z) * .45), opacity: .95, dashArray: '7 8', interactive: false, _k: 'vlak1'}); }
   if (!MG.app.hideRegio) for (const p of n.regio) add(p, {color: dark ? '#b98a6c' : '#b98c6e', weight: Math.max(1.6, W(z) * .62), opacity: .75, _k: 'regio'});
   for (const p of n.mhd) add(p, {color: copper, weight: W(z), opacity: .92, _k: 'mhd'});
  }
  /* barevná síť: hlavní trasy linek v jejich barvách */
  if (M.colorNet) for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) { const Ln = D.ln.get(li); if (!Ln || (Ln.k === 'vlak' && MG.app.hideTrains) || ((Ln.k === 'regio' || Ln.k === 'mezi') && MG.app.hideRegio)) continue; for (const p of D.mainPats(Ln).filter(Boolean)) add(D.geo3(p).pts, {color: Ln.c, weight: Math.max(2, W(z) * .6), opacity: .9, _k: 'color'}); }
  M.refreshStops();
 };
 M.restyleNet = () => { const z = M.m.getZoom(); for (const l of (M.netLayers || [])) { const k = l._k; const w = k === 'mhd' ? W(z) : k === 'regio' ? Math.max(1.6, W(z) * .62) : k === 'vlak0' ? W(z) * .9 + 1.4 : k === 'vlak1' ? Math.max(1.2, W(z) * .45) : Math.max(2, W(z) * .6); l.setStyle({weight: w}); } };
 /* klik na síť: které linky tudy jezdí */
 M.linesAt = (ll) => {
  const found = new Map(), lim = 30;
  for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) {
   const Ln = D.ln.get(li); if (!Ln || found.has(li)) continue;
   if ((Ln.k === 'vlak' && MG.app.hideTrains) || ((Ln.k === 'regio' || Ln.k === 'mezi') && MG.app.hideRegio)) continue;
   for (const p of Ln.pats) { const g = D.geo3(p); let hit = false; for (let i = 0; i < g.lat.length; i += 1) { if (Math.abs(g.lat[i] - ll.lat) > .0012) continue; if (MG.dist(g.lat[i], g.lon[i], ll.lat, ll.lng) < lim) { hit = true; break; } } if (hit) { found.set(li, Ln); break; } }
  }
  if (!found.size) return;
  const ls = [...found.values()].sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || String(D.lineText(a)).localeCompare(String(D.lineText(b)), 'cs', {numeric: true}));
  const h = '<div style="font-family:Outfit,sans-serif;min-width:200px;max-width:270px"><div style="font:800 10px Outfit;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:7px">Tudy jezdí</div><div class="lns">' + ls.slice(0, 40).map(x => '<a href="#" data-ln="' + x.i + '" style="text-decoration:none">' + D.badge(x) + '</a>').join('') + '</div></div>';
  L.popup({className: 'pop-mg', maxWidth: 290}).setLatLng(ll).setContent(h).openOn(M.m);
  setTimeout(() => MG.qsa('.pop-mg [data-ln]').forEach(a => a.onclick = (e) => { e.preventDefault(); M.m.closePopup(); MG.net.openLine(+a.dataset.ln); }), 20);
 };
 M.dimNet = (on) => { M.gNet.eachLayer(l => { if (l.setStyle) { if (l._o0 == null) l._o0 = l.options.opacity; l.setStyle({opacity: on ? l._o0 * .28 : l._o0}); } }); };
 /* ---------- zastávky a nástupiště ---------- */
 M.refreshStops = () => {
  if (!M.m) return;
  const z = M.m.getZoom(), b = M.m.getBounds().pad(.25);
  M.gStops.clearLayers(); M.gPlat.clearLayers();
  if (z < 11) return;
  const dark = document.body.classList.contains('dark');
  const shown = new Set();
  const showPlat = z >= 16.5;
  for (const oi of D.loaded) {
   for (const sg of (D.okSt.get(oi) || [])) {
    if (shown.has(sg)) continue; const s = D.st.get(sg); if (!s || !b.contains([s.lat, s.lon])) continue;
    shown.add(sg);
    const isTrain = [...s.lines].some(l => { const x = D.ln.get(l); return x && x.k === 'vlak'; });
    if (z < 13 && !isTrain && s.lines.size < 3) continue;
    if (showPlat && s.pls.length) {
     for (const pg of s.pls) {
      const pl = D.pl.get(pg); if (!pl || !pl.pats.length) continue;
      const lab = pl.lab || (s.pls.length > 1 ? '' : '');
      const ic = L.divIcon({className: 'plat-ic', html: '<div class="plat' + (isTrain && s.pls.length === 1 ? ' tr' : '') + '">' + MG.h(lab.slice(0, 3)) + '</div>', iconSize: [0, 0]});
      const mk = L.marker([pl.lat, pl.lon], {icon: ic, pane: 'stops', keyboard: false});
      mk.on('click', (e) => { L.DomEvent.stop(e); MG.dep && MG.dep.stopPopup(sg, pg); });
      mk.bindTooltip(MG.h(s.name) + (lab ? ' · nást. ' + MG.h(lab) : '') + '<br><small>směr ' + MG.h(D.plDir(pg)) + '</small>', {className: 'stop-tip', direction: 'top', offset: [0, -10]});
      mk.addTo(M.gPlat);
     }
     continue;
    }
    const r = isTrain ? (z >= 14 ? 6.5 : 5) : (z >= 15 ? 5.5 : z >= 13 ? 4 : 3);
    const c = L.circleMarker([s.lat, s.lon], {renderer: M.rStops, radius: r, color: isTrain ? '#2f3b52' : (dark ? '#f1ebe5' : '#24201c'), weight: isTrain ? 2.5 : 2, fillColor: isTrain ? '#fff' : (dark ? '#24201c' : '#fff'), fillOpacity: 1});
    c.on('click', (e) => { L.DomEvent.stop(e); MG.dep && MG.dep.stopPopup(sg); });
    c.bindTooltip(MG.h(s.name), {className: 'stop-tip', direction: 'top', offset: [0, -6]});
    c.addTo(M.gStops);
   }
  }
 };
 /* ---------- výběr: trasa linky / spoje / spojení ---------- */
 M.clearSel = () => { M.gSel.clearLayers(); M.dimNet(false); M.selKind = null; };
 M.showPattern = (p, opt) => {
  opt = opt || {}; M.gSel.clearLayers();
  const Ln = D.ln.get(p.l), g = D.geo3(p);
  let pts = g.pts, from = opt.fromK || 0;
  if (opt.fromD != null) { const r = D.pointAt(g, opt.fromD); const i = r[3]; pts = [[r[0], r[1]], ...g.pts.slice(i + 1)]; }
  else if (from > 0) pts = g.pts.slice(g.x[from]);
  L.polyline(pts, {renderer: M.rSel, color: '#ffffff', weight: 9, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(M.gSel);
  L.polyline(pts, {renderer: M.rSel, color: Ln.c, weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(M.gSel);
  if (opt.flow) L.polyline(pts, {renderer: M.rFlow, color: '#fff', weight: 2.4, opacity: .9, lineCap: 'butt', className: 'flow', interactive: false}).addTo(M.gSel);
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
 /* ---------- moje poloha ---------- */
 M.setMe = (lat, lon, acc) => {
  if (!M.meMk) {
   M.meMk = L.marker([lat, lon], {icon: L.divIcon({className: 'plat-ic', html: '<div class="me-dot"></div>', iconSize: [0, 0]}), pane: 'me', interactive: false}).addTo(M.gMe);
   M.meAcc = L.circle([lat, lon], {radius: acc || 30, pane: 'me', color: '#2a7de1', weight: 1, fillOpacity: .08, interactive: false}).addTo(M.gMe);
  } else { M.meMk.setLatLng([lat, lon]); M.meAcc.setLatLng([lat, lon]).setRadius(acc || 30); }
 };
})();
