/* ===== mhdGO – start aplikace, okres, poloha ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const A = MG.app = {cur: -1, me: null, home: -1, perm: 'unknown', rnd: -1};
 const stage = t => { const e = $('sp-stage'); if (e) e.textContent = t; };
 const loadbar = (t) => { const b = $('loadbar'); if (!t) { b.hidden = true; return; } $('loadbar-t').textContent = t; b.hidden = false; };
 A.loadbar = loadbar;
 A.setDark = (on) => {
  document.body.classList.toggle('dark', on); MG.store.set('dark', on);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = on ? '#1d1a18' : '#f4ebe2';
  if (MG.map.m) { MG.map.retheme(); MG.map.drawNet(); MG.map.drawOkresy(A.cur); }
  MG.m3d && MG.m3d.retheme && MG.m3d.retheme();
 };
 A.selectOkres = async (oi, opt) => {
  opt = opt || {};
  if (oi < 0 || oi >= D.okresy.length) return;
  const prev = A.cur; A.cur = oi;
  $('okres-name').textContent = D.okresy[oi].name;
  MG.store.set('okres', oi);
  if (!opt.keepView) MG.map.fitOkres(oi, {fly: opt.fly});
  if (!D.loaded.has(oi)) {
   loadbar('Načítám okres ' + D.okresy[oi].name + '…');
   try { await D.loadOkres(oi); } catch (e) { loadbar(); MG.toast('Data okresu se nepodařilo načíst. Zkontroluj připojení.'); A.cur = prev; return; }
   loadbar();
  }
  MG.map.drawOkresy(oi); MG.map.drawNet();
  MG.emit('okres', oi);
  MG.veh.tick();
  if (MG.ui.cur === 'sh-net') MG.net.render();
 };
 /* automatické načtení okresu pod středem mapy */
 const autoLoad = MG.debounce(() => {
  if (!D.geo || MG.mode3d) return;
  const m = MG.map.m; if (m.getZoom() < 11) return;
  const c = m.getCenter(), oi = D.okresAt(c.lat, c.lng);
  if (oi >= 0 && oi !== A.cur) A.selectOkres(oi, {keepView: true});
 }, 700);
 A.showCZ = () => { if (MG.mode3d) MG.m3d.close(); MG.map.fitCZ(); MG.map.drawOkresy(A.cur); };
 A.center = () => {
  if (MG.mode3d) return MG.m3d.recenter();
  if (A.me && A.home >= 0) { if (A.cur !== A.home) A.selectOkres(A.home, {fly: true}); else MG.map.fitOkres(A.home, {fly: true}); }
  else if (A.perm !== 'denied') { A.locate(true); }
  else { MG.toast('Poloha není povolena – zobrazuji celou ČR'); A.showCZ(); }
 };
 /* ---------- poloha ---------- */
 let watching = false;
 A.locate = (fly) => new Promise(res => {
  if (!navigator.geolocation) { A.perm = 'denied'; if (fly) A.showCZ(); return res(null); }
  navigator.geolocation.getCurrentPosition(pos => { onPos(pos, true); if (fly && A.home >= 0) A.selectOkres(A.home, {fly: true}); res(A.me); watch(); },
   err => { if (err.code === 1) A.perm = 'denied'; if (fly) { MG.toast(err.code === 1 ? 'Přístup k poloze není povolen – zobrazuji celou ČR' : 'Polohu se nepodařilo zjistit'); A.showCZ(); } res(null); },
   {enableHighAccuracy: true, timeout: 12000, maximumAge: 60000});
 });
 function watch() { if (watching || !navigator.geolocation) return; watching = true; navigator.geolocation.watchPosition(p => onPos(p), () => {}, {enableHighAccuracy: true, maximumAge: 15000}); }
 function onPos(pos, first) {
  const c = pos.coords; const had = !!A.me;
  A.me = {lat: c.latitude, lon: c.longitude, acc: c.accuracy}; A.perm = 'granted';
  MG.map.setMe(A.me.lat, A.me.lon, A.me.acc);
  const oi = D.okresAt(A.me.lat, A.me.lon);
  if (oi >= 0) A.home = oi;
  if (!had && A.started && oi >= 0 && A.autoSwitch && A.cur !== oi) { A.autoSwitch = false; MG.toast('Poloha povolena – přepínám na okres ' + D.okresy[oi].name); A.selectOkres(oi, {fly: true}); }
  MG.emit('me', A.me);
 }
 /* ---------- hodiny a počasí ---------- */
 function clock() { const p = MG.pragueParts(MG.now()); $('clock').textContent = MG.pad(p.h) + ':' + MG.pad(p.mi) + ':' + MG.pad(p.s); }
 const WX = {0: ['fa-sun', 'jasno'], 1: ['fa-cloud-sun', 'skoro jasno'], 2: ['fa-cloud-sun', 'polojasno'], 3: ['fa-cloud', 'zataženo'], 45: ['fa-smog', 'mlha'], 48: ['fa-smog', 'mlha'], 51: ['fa-cloud-rain', 'mrholení'], 53: ['fa-cloud-rain', 'mrholení'], 55: ['fa-cloud-rain', 'mrholení'], 61: ['fa-cloud-rain', 'déšť'], 63: ['fa-cloud-rain', 'déšť'], 65: ['fa-cloud-showers-heavy', 'silný déšť'], 71: ['fa-snowflake', 'sněžení'], 73: ['fa-snowflake', 'sněžení'], 75: ['fa-snowflake', 'silné sněžení'], 77: ['fa-snowflake', 'sníh'], 80: ['fa-cloud-showers-heavy', 'přeháňky'], 81: ['fa-cloud-showers-heavy', 'přeháňky'], 82: ['fa-cloud-showers-heavy', 'přeháňky'], 85: ['fa-snowflake', 'sněhové přeháňky'], 86: ['fa-snowflake', 'sněhové přeháňky'], 95: ['fa-cloud-bolt', 'bouřka'], 96: ['fa-cloud-bolt', 'bouřka'], 99: ['fa-cloud-bolt', 'bouřka']};
 A.wx = null;
 async function weather() {
  try {
   const c = MG.map.m.getCenter();
   const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat.toFixed(3) + '&longitude=' + c.lng.toFixed(3) + '&current=temperature_2m,weather_code,is_day&timezone=Europe%2FPrague');
   const j = await r.json(); const cur = j.current; if (!cur) return;
   const w = WX[cur.weather_code] || ['fa-cloud', ''];
   A.wx = {t: Math.round(cur.temperature_2m), code: cur.weather_code, txt: w[1], ic: w[0]};
   const b = $('weather'); b.hidden = false; b.innerHTML = '<i class="fa-solid ' + w[0] + '"></i>' + A.wx.t + ' °C'; b.title = 'Počasí: ' + w[1];
   MG.emit('wx', A.wx);
  } catch (_) {}
 }
 /* ---------- start ---------- */
 A.boot = async () => {
  const t0 = performance.now();
  const dark = MG.store.get('dark', null);
  A.setDark(dark == null ? matchMedia('(prefers-color-scheme: dark)').matches : dark);
  stage('Připravuji mapu…');
  MG.map.init(); MG.ui.initTabs();
  stage('Načítám okresy a kalendáře…');
  try { await Promise.all([D.loadCore(), D.loadGeo()]); }
  catch (e) { stage('Data se nepodařilo načíst – zkontroluj připojení k internetu.'); MG.err('core', e); setTimeout(() => location.reload(), 15000); return; }
  if (!D.dataValid()) MG.toast('Pozor: jízdní řády v aplikaci jsou pro jiné období (' + D.core.d0 + ')', 6000);
  MG.map.drawOkresy(-1);
  /* stav oprávnění k poloze */
  try { if (navigator.permissions) { const p = await navigator.permissions.query({name: 'geolocation'}); A.perm = p.state; p.onchange = () => { A.perm = p.state; if (p.state === 'granted') A.locate(false); }; } } catch (_) {}
  let oi = -1;
  if (A.perm === 'granted') {
   stage('Zjišťuji tvou polohu…');
   const me = await Promise.race([A.locate(false), MG.sleep(6000).then(() => null)]);
   if (me && A.home >= 0) oi = A.home;
  }
  if (oi < 0) { oi = Math.floor(Math.random() * D.okresy.length); A.rnd = oi; A.autoSwitch = true; }
  A.rndSeat = A.rnd >= 0 ? A.rnd : oi;
  stage('Načítám okres ' + D.okresy[oi].name + '…');
  A.cur = oi; $('okres-name').textContent = D.okresy[oi].name;
  MG.map.fitOkres(oi);
  try { await D.loadOkres(oi); } catch (e) { MG.err('okres', e); }
  MG.map.drawOkresy(oi); MG.map.drawNet();
  A.started = true;
  MG.veh.start(); MG.live.start();
  clock(); setInterval(clock, 1000);
  weather(); setInterval(weather, 15 * 60000);
  MG.map.m.on('moveend', autoLoad);
  const wait = Math.max(0, 1900 - (performance.now() - t0));
  setTimeout(() => { const s = $('splash'); s.classList.add('out'); setTimeout(() => s.remove(), 700); }, wait);
  /* bez povolení: zeptáme se na polohu (náhodný okres zůstane, dokud ji uživatel nepovolí) */
  if (A.perm !== 'granted' && A.perm !== 'denied') setTimeout(() => A.locate(false), 1500);
  else if (A.perm === 'granted') watch();
  D.loadIdx().catch(() => {});
  setTimeout(() => D.loadDalkove().catch(() => {}), 4000);
  MG.emit('ready');
 };
 document.addEventListener('visibilitychange', () => { if (!document.hidden) { MG.veh.tick(); MG.live.tick(); } });
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => A.boot()); else A.boot();
})();
