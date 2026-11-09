/* ===== mhdGO – start aplikace, poloha, počasí (celá ČR najednou, bez dělení na okresy) ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const A = MG.app = {cur: -1, me: null, home: -1, perm: 'unknown', rnd: -1, hideTrains: MG.store.get('hidetrains', false), hideRegio: MG.store.get('hideregio', false)};
 A.toggleTrains = () => { A.hideTrains = !A.hideTrains; MG.store.set('hidetrains', A.hideTrains); MG.veh.tick(); MG.m3d.updData && MG.m3d.updData(); MG.ui.syncToggles(); MG.toast(A.hideTrains ? 'Vlaky skryty' : 'Vlaky zobrazeny'); };
 A.toggleRegio = () => { A.hideRegio = !A.hideRegio; MG.store.set('hideregio', A.hideRegio); MG.veh.tick(); MG.m3d.updData && MG.m3d.updData(); MG.ui.syncToggles(); MG.toast(A.hideRegio ? 'Regionální linky skryty' : 'Regionální linky zobrazeny'); };
 const stage = t => { const e = $('sp-stage'); if (e) e.textContent = t; };
 const loadbar = (t) => { const b = $('loadbar'); if (!t) { b.hidden = true; return; } $('loadbar-t').textContent = t; b.hidden = false; };
 A.loadbar = loadbar;
 A.setDark = (on) => {
  document.body.classList.toggle('dark', on); MG.store.set('dark', on);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = on ? '#1d1a18' : '#f4ebe2';
  if (MG.map.m) { MG.map.retheme(); MG.map.refreshStops(); }
  MG.m3d && MG.m3d.retheme && MG.m3d.retheme();
  MG.ui && MG.ui.syncToggles && MG.ui.syncToggles();
 };
 /* kompatibilita se staršími voláními – okres se už nevybírá, jen se přeletí na oblast */
 A.selectOkres = (oi, opt) => { if (oi >= 0 && D.okresy[oi] && !(opt && opt.keepView)) MG.map.fitOkres(oi, {fly: true}); };
 A.showCZ = () => { if (MG.mode3d) MG.m3d.close(); MG.map.fitCZ(); };
 A.center = () => {
  if (MG.mode3d) return MG.m3d.recenter();
  if (A.me) MG.map.m.flyTo([A.me.lat, A.me.lon], Math.max(MG.map.m.getZoom(), 15), {duration: .9});
  else if (A.perm !== 'denied') A.locate(true);
  else { MG.toast('Poloha není povolena – zobrazuji celou ČR'); A.showCZ(); }
 };
 /* okres pod středem mapy – jen informativně (počasí, jízdné, výchozí místo 3D) */
 const updCur = () => { if (!D.geo || !MG.map.m) return; const c = MG.map.m.getCenter(); const oi = D.okresAt(c.lat, c.lng); if (oi >= 0) A.cur = oi; };
 /* ---------- poloha ---------- */
 let watching = false;
 A.locate = (fly) => new Promise(res => {
  if (!navigator.geolocation) { A.perm = 'denied'; if (fly) A.showCZ(); return res(null); }
  navigator.geolocation.getCurrentPosition(pos => { onPos(pos, true); if (fly && A.me) MG.map.m.flyTo([A.me.lat, A.me.lon], 15, {duration: .9}); res(A.me); watch(); },
   err => { if (err.code === 1) A.perm = 'denied'; if (fly) { MG.toast(err.code === 1 ? 'Přístup k poloze není povolen – zobrazuji celou ČR' : 'Polohu se nepodařilo zjistit'); A.showCZ(); } res(null); },
   {enableHighAccuracy: true, timeout: 12000, maximumAge: 60000});
 });
 function watch() { if (watching || !navigator.geolocation) return; watching = true; navigator.geolocation.watchPosition(p => onPos(p), () => {}, {enableHighAccuracy: true, maximumAge: 15000}); }
 function onPos(pos) {
  const c = pos.coords, had = !!A.me;
  A.me = {lat: c.latitude, lon: c.longitude, acc: c.accuracy}; A.perm = 'granted';
  MG.map.setMe(A.me.lat, A.me.lon, A.me.acc);
  const oi = D.okresAt(A.me.lat, A.me.lon); if (oi >= 0) A.home = oi;
  /* první poloha po startu bez povolení: přeletět k uživateli */
  if (!had && A.started && A.waitMe && !MG.mode3d) { A.waitMe = false; MG.map.m.flyTo([A.me.lat, A.me.lon], 15, {duration: 1}); }
  MG.emit('me', A.me);
 }
 /* ---------- hodiny a počasí (sdílené jádro MG.core) ---------- */
 function clock() { const p = MG.pragueParts(MG.now()); $('clock').textContent = MG.pad(p.h) + ':' + MG.pad(p.mi) + ':' + MG.pad(p.s); }
 A.wx = null; A.wxData = null;
 A.wxPoint = () => { if (A.wxPlace) return A.wxPlace; if (A.me) return {name: 'Moje poloha', lat: A.me.lat, lon: A.me.lon}; const c = MG.mode3d && MG.m3d.center ? MG.m3d.center() : MG.map.m.getCenter(); return {name: A.cur >= 0 ? 'okolí – okres ' + D.okresy[A.cur].name : 'střed mapy', lat: c.lat, lon: c.lng != null ? c.lng : c.lon}; };
 async function weather(force) {
  try {
   const p = A.wxPoint(), C = MG.core;
   const j = await C.weather(p.lat, p.lon); const cur = j.current; if (!cur) return;
   A.wxData = j; A.wxData._name = p.name;
   let rain = '';
   const adv = C.wxAdvice(j).find(x => x[0] === 'fa-umbrella'); if (adv) rain = cur.precipitation > .1 ? 'prší' : 'během 3 h asi zaprší';
   A.wx = {t: Math.round(cur.temperature_2m), code: cur.weather_code, txt: C.wxText(cur.weather_code), ic: C.wxIc(cur.weather_code, cur.is_day), rain, kind: C.wxKind(cur.weather_code), isDay: cur.is_day, sunrise: j.daily && j.daily.sunrise[0], sunset: j.daily && j.daily.sunset[0]};
   const b = $('weather'); b.hidden = false; b.innerHTML = '<i class="fa-solid ' + A.wx.ic + '"></i>' + A.wx.t + ' °C'; b.title = 'Počasí: ' + A.wx.txt;
   const hc = $('hdr-wx'); if (hc) { hc.hidden = false; hc.innerHTML = '<i class="fa-solid ' + A.wx.ic + '"></i><span>' + A.wx.t + '°</span>'; hc.title = 'Počasí: ' + A.wx.txt; }
   MG.emit('wx', A.wx);
  } catch (e) { MG.err('wx', e); }
 }
 A.weather = weather;
 /* ---------- start ---------- */
 A.boot = async () => {
  const t0 = performance.now();
  const dark = MG.store.get('dark', null);
  A.setDark(dark == null ? matchMedia('(prefers-color-scheme: dark)').matches : dark);
  stage('Připravuji mapu…');
  MG.map.init(); MG.ui.initTabs();
  /* sdílené jádro (rádce, počasí, spojení) ví, kde uživatel je a co má otevřené */
  const C = MG.core;
  C.me = () => A.me; C.locate = () => A.locate(false);
  C.ctx = () => { const c = MG.map.m.getCenter(); return {stop: MG.dep.st, conn: MG.search && MG.search.from && MG.search.to ? {from: MG.search.from, to: MG.search.to} : null, center: {lat: c.lat, lon: c.lng}}; };
  C.wxPlace = () => A.wxPoint();
  stage('Načítám kalendáře…');
  try { await Promise.all([D.loadCore(), D.loadGeo()]); }
  catch (e) { stage('Data se nepodařilo načíst – zkontroluj připojení k internetu.'); MG.err('core', e); setTimeout(() => location.reload(), 15000); return; }
  if (!D.dataValid()) MG.toast('Pozor: jízdní řády v aplikaci jsou pro jiné období (' + D.core.d0 + ')', 6000);
  MG.map.drawOkresy();
  try { if (navigator.permissions) { const p = await navigator.permissions.query({name: 'geolocation'}); A.perm = p.state; p.onchange = () => { A.perm = p.state; if (p.state === 'granted') A.locate(false); }; } } catch (_) {}
  stage('Načítám jízdní řády celé ČR…');
  const all = D.loadAll().catch(e => { MG.err('cz', e); return false; });
  let me = null;
  if (A.perm === 'granted') me = await Promise.race([A.locate(false), MG.sleep(6000).then(() => null)]);
  if (!await all) { stage('Jízdní řády se nepodařilo načíst – zkontroluj připojení.'); setTimeout(() => location.reload(), 15000); return; }
  if (me) MG.map.m.setView([me.lat, me.lon], 15); else { MG.map.m.fitBounds([[48.55, 12.09], [51.06, 18.86]], {padding: [10, 10]}); A.waitMe = true; }
  updCur(); MG.map.refreshStops();
  A.started = true;
  MG.veh.start(); MG.live.start();
  clock(); setInterval(clock, 1000);
  weather(); setInterval(weather, 15 * 60000);
  MG.map.m.on('moveend', MG.debounce(() => { updCur(); if (!A.me && !A.wxPlace && A.wxData && MG.dist(A.wxData._lat, A.wxData._lon, MG.map.m.getCenter().lat, MG.map.m.getCenter().lng) > 25000) weather(); }, 600));
  const wait = Math.max(0, 1600 - (performance.now() - t0));
  setTimeout(() => { const s = $('splash'); s.classList.add('out'); setTimeout(() => s.remove(), 700); }, wait);
  if (A.perm !== 'granted' && A.perm !== 'denied') setTimeout(() => A.locate(false), 1500);
  else if (A.perm === 'granted') watch();
  D.loadIdx().catch(() => {});
  MG.emit('ready');
 };
 document.addEventListener('visibilitychange', () => { if (!document.hidden) { MG.veh.tick(); MG.live.tick(); } });
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => A.boot()); else A.boot();
})();
