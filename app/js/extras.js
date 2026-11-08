/* ===== mhdGO – budík před výstupem, pěší navigace, mimořádnosti, offline ===== */
(function(){
 const D = MG.D, $ = MG.$;
 /* ---------------- pomocné: zvuk, vibrace, oznámení ---------------- */
 let actx = null;
 const beep = (n) => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); for (let i = 0; i < (n || 3); i++) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = i % 2 ? 660 : 880; o.type = 'sine'; g.gain.setValueAtTime(.0001, actx.currentTime + i * .32); g.gain.exponentialRampToValueAtTime(.35, actx.currentTime + i * .32 + .03); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + i * .32 + .26); o.connect(g).connect(actx.destination); o.start(actx.currentTime + i * .32); o.stop(actx.currentTime + i * .32 + .3); } } catch (_) {} };
 const notify = (title, body) => {
  try { navigator.vibrate && navigator.vibrate([260, 120, 260, 120, 420]); } catch (_) {}
  beep(4);
  try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(title, {body, tag: 'mhdgo', renotify: true}); } catch (_) {}
  MG.toast(title + ' – ' + body, 6000);
 };
 function bar(id, html, cls) {
  let b = $(id);
  if (!html) { if (b) b.remove(); document.body.classList.toggle('has-tb', !!document.querySelector('.topbar')); return null; }
  if (!b) { b = document.createElement('div'); b.id = id; document.body.appendChild(b); }
  b.className = 'topbar glass ' + (cls || '');
  b.innerHTML = html; document.body.classList.add('has-tb'); return b;
 }
 /* ---------------- budík ---------------- */
 const AL = MG.alarm = {cur: null};
 AL.set = (key, k) => {
  const it = MG.veh.findKey(key); if (!it) { MG.toast('Spoj se nepodařilo najít'); return; }
  const pl = D.pl.get(it.p.s[k]);
  AL.cur = {key, k, name: pl ? D.stName(pl.st) : '?', pre: false, fired: false, L: it.L, label: MG.veh.label(it)};
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (_) {}
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  MG.toast('Budík nastaven: vystupuješ v ' + AL.cur.name);
  AL.check();
 };
 AL.clear = () => { AL.cur = null; bar('alarm-bar', null); };
 AL.check = () => {
  const a = AL.cur; if (!a) return;
  const it = MG.veh.findKey(a.key);
  if (!it) { bar('alarm-bar', null); return; }
  const p = it.p, delay = it.delay > 0 ? it.delay : 0;
  const eta = it.start + p.arr[it.prof][a.k] + delay - it.m;
  const pos = it.pos || {k: 0, at: true};
  const nextK = pos.at ? pos.k : pos.k + 1;
  const left = a.k - nextK;
  if (!a.fired && (pos.k >= a.k || eta <= 0.3)) { a.fired = true; notify('Vystupuješ', a.name); setTimeout(() => { if (AL.cur === a) AL.clear(); }, 90000); }
  else if (!a.pre && !a.fired && (eta <= 2 || (left <= 1 && eta <= 4))) { a.pre = true; notify('Příští zastávka', a.name + ' – připrav se k výstupu'); }
  const txt = a.fired ? 'Vystupuješ: <b>' + MG.h(a.name) + '</b>' : 'Vystupuješ v <b>' + MG.h(a.name) + '</b> · ' + (eta < 1 ? 'teď' : 'za ' + Math.round(eta) + ' min') + (left > 0 ? ' · ' + left + ' ' + (left === 1 ? 'zastávka' : left < 5 ? 'zastávky' : 'zastávek') : '');
  const b = bar('alarm-bar', '<i class="fa-solid fa-bell' + (a.pre ? ' fa-shake' : '') + '"></i>' + D.badge(a.L, {text: a.label}) + '<span class="tb-tx">' + txt + '</span><button class="xbtn" id="alarm-x" title="Zrušit budík"><i class="fa-solid fa-xmark"></i></button>', a.pre ? 'warn' : '');
  if (b) { $('alarm-x').onclick = AL.clear; b.querySelector('.tb-tx').onclick = () => MG.veh.select(a.key); }
 };
 setInterval(() => { try { AL.check(); } catch (e) { MG.err('alarm', e); } }, 2000);
 /* ---------------- pěší navigace ---------------- */
 const W = MG.walk = {cur: null, layer: null};
 const dec6 = (s) => { const out = []; let i = 0, la = 0, lo = 0; while (i < s.length) { for (let w = 0; w < 2; w++) { let sh = 0, r = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5 } while (b >= 32); const d = r & 1 ? ~(r >> 1) : r >> 1; if (w) lo += d; else la += d } out.push([la / 1e6, lo / 1e6]) } return out; };
 W.route = async (a, b) => {
  const q = {locations: [{lat: a.lat, lon: a.lon}, {lat: b.lat, lon: b.lon}], costing: 'pedestrian', directions_options: {language: 'cs-CZ', units: 'kilometers'}};
  const r = await fetch('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)));
  if (!r.ok) throw Error('HTTP ' + r.status);
  const j = await r.json(); const leg = j.trip.legs[0];
  return {pts: dec6(leg.shape), len: j.trip.summary.length * 1000, time: j.trip.summary.time / 60, man: leg.maneuvers.map(m => ({t: m.instruction, i: m.begin_shape_index, len: m.length * 1000}))};
 };
 W.to = async (dest) => {
  const me = MG.app.me || await MG.app.locate(false);
  if (!me) { MG.toast('Pro navigaci povol přístup k poloze'); return; }
  if (MG.mode3d) MG.m3d.close();
  MG.ui.closeSheets(); MG.map.m.closePopup();
  bar('walk-bar', '<i class="fa-solid fa-person-walking"></i><span class="tb-tx">Hledám pěší trasu do <b>' + MG.h(dest.name) + '</b>…</span>');
  let r;
  try { r = await W.route(me, dest); }
  catch (e) { const d = MG.dist(me.lat, me.lon, dest.lat, dest.lon); r = {pts: [[me.lat, me.lon], [dest.lat, dest.lon]], len: d * 1.25, time: d * 1.25 / 75, man: [{t: 'Jdi směrem k cíli', i: 0, len: d}], straight: true}; }
  W.cur = Object.assign({dest}, r);
  if (W.layer) MG.map.m.removeLayer(W.layer);
  W.layer = L.layerGroup([
   L.polyline(r.pts, {renderer: MG.map.rSel, color: '#ffffff', weight: 9, opacity: .9}),
   L.polyline(r.pts, {renderer: MG.map.rSel, color: '#2a7de1', weight: 5, dashArray: r.straight ? '6 10' : null, opacity: .95}),
   L.circleMarker([dest.lat, dest.lon], {renderer: MG.map.rSel, radius: 8, color: '#2a7de1', weight: 3, fillColor: '#fff', fillOpacity: 1})
  ]).addTo(MG.map.m);
  MG.map.fitPad(L.latLngBounds(r.pts));
  W.update();
 };
 W.stop = () => { W.cur = null; if (W.layer) { MG.map.m.removeLayer(W.layer); W.layer = null; } bar('walk-bar', null); };
 W.update = () => {
  const w = W.cur; if (!w) return;
  const me = MG.app.me;
  let idx = 0, rem = w.len;
  if (me) {
   let bd = 1e12; w.pts.forEach((q, i) => { const d = MG.dist(me.lat, me.lon, q[0], q[1]); if (d < bd) { bd = d; idx = i; } });
   rem = 0; for (let i = idx; i < w.pts.length - 1; i++) rem += MG.dist(w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1]);
   if (MG.dist(me.lat, me.lon, w.dest.lat, w.dest.lon) < 25) { MG.toast('Jsi u cíle: ' + w.dest.name, 4000); beep(2); W.stop(); return; }
  }
  const man = w.man.filter(m => m.i >= idx)[0] || w.man[w.man.length - 1];
  const b = bar('walk-bar', '<i class="fa-solid fa-person-walking"></i><span class="tb-tx"><b>' + MG.h(w.dest.name) + '</b> · ' + MG.fmtDist(rem) + ' · ' + Math.max(1, Math.round(rem / 75)) + ' min<small>' + MG.h(man ? man.t : '') + '</small></span><button class="xbtn" id="walk-x" title="Ukončit navigaci"><i class="fa-solid fa-xmark"></i></button>');
  if (b) $('walk-x').onclick = W.stop;
 };
 MG.on('me', () => W.update());
 /* ---------------- mimořádnosti a výluky ---------------- */
 const X = MG.alerts = {list: [], at: 0};
 const parseCz = s => { const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() : null; };
 const kraje = () => new Set([...D.loaded].map(o => D.kraje[D.okresy[o].kraj].code));
 X.load = async () => {
  const ks = kraje(), out = [];
  if (ks.has('JHM')) {
   try {
    const u = 'https://gis.brno.cz/ags1/rest/services/Hosted/IDS_JMK_v%C3%BDluky_a_odklony_zdroj_GeoJSON/FeatureServer/0/query?where=1%3D1&outFields=title,publictext,affectedlines,validfrom,validto,latitude,longitude,type_,diversionid&returnGeometry=false&f=json';
    const j = await (await fetch(u)).json();
    for (const f of (j.features || [])) {
     const a = f.attributes || {};
     out.push({src: 'IDS JMK', sys: 'IDS JMK', title: a.title || 'Výluka', text: a.publictext || '', lines: String(a.affectedlines || '').split(/[,;\s]+/).filter(Boolean), from: parseCz(a.validfrom), to: parseCz(a.validto), lat: a.latitude, lon: a.longitude, type: a.type_ === 'P' ? 'výluka' : a.type_ === 'Z' ? 'přesun zastávky' : 'omezení', url: 'https://www.idsjmk.cz/'});
    }
   } catch (e) { MG.err('alerts jmk', e); }
  }
  if (MG.cfg.WORKER) {
   try {
    const j = await (await fetch(MG.cfg.WORKER + (MG.cfg.WORKER.includes('?') ? '&' : '?') + 'alerts=1&bbox=0,0,0,0')).json();
    for (const a of (j.alerts || [])) out.push(Object.assign({sys: a.src}, a));
   } catch (e) { MG.err('alerts worker', e); }
  }
  const now = Date.now();
  X.list = out.filter(a => (!a.to || a.to > now) && (!a.from || a.from < now + 3 * 864e5));
  X.at = now; X.index(); MG.emit('alerts');
 };
 X.index = () => {
  X.byLine = new Map();
  for (const a of X.list) for (const L_ of D.ln.values()) {
   if (L_.sys !== a.sys) continue;
   if (a.lines.includes(String(L_.n))) (X.byLine.get(L_.i) || X.byLine.set(L_.i, []).get(L_.i)).push(a);
  }
  X.draw();
 };
 X.forLine = (li) => (X.byLine && X.byLine.get(li)) || [];
 X.forStation = (g) => { const s = D.st.get(g); if (!s) return []; const set = new Set(); for (const li of s.lines) for (const a of X.forLine(li)) set.add(a); return [...set]; };
 X.active = a => !a.from || a.from <= Date.now();
 const fmtD = t => t ? new Date(t).toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
 X.card = (a) => '<div class="alert-c"><div class="alert-h"><i class="fa-solid fa-triangle-exclamation"></i><b>' + MG.h(a.title) + '</b><span>' + MG.h(a.type || (X.active(a) ? 'platí' : 'chystá se')) + '</span></div>' +
  (a.lines && a.lines.length ? '<div class="lns" style="margin:4px 0">' + a.lines.slice(0, 12).map(n => { const L_ = [...D.ln.values()].find(x => x.sys === a.sys && String(x.n) === n); return L_ ? D.badge(L_) : '<span class="ln" style="--lc:#8a8079">' + MG.h(n) + '</span>'; }).join('') + '</div>' : '') +
  '<div class="alert-t">' + MG.h(a.text || '').slice(0, 900).replace(/\n/g, '<br>') + '</div><div class="alert-f">' + (a.from ? fmtD(a.from) : '') + (a.to ? ' – ' + fmtD(a.to) : '') + ' · ' + MG.h(a.src) + (a.url ? ' · <a href="' + MG.h(a.url) + '" target="_blank" rel="noopener">detail</a>' : '') + '</div></div>';
 X.draw = () => {
  if (!MG.map.m) return;
  if (X.layer) X.layer.clearLayers(); else X.layer = L.layerGroup().addTo(MG.map.m);
  if (MG.map.m.getZoom() < 12) return;
  for (const a of X.list) {
   if (!isFinite(a.lat) || !isFinite(a.lon) || !a.lat) continue;
   const mk = L.marker([a.lat, a.lon], {icon: L.divIcon({className: 'plat-ic', html: '<div class="alert-ic"><i class="fa-solid fa-triangle-exclamation"></i></div>', iconSize: [0, 0]}), pane: 'stops'});
   mk.bindPopup(X.card(a), {className: 'pop-mg', maxWidth: 320}); mk.addTo(X.layer);
  }
 };
 MG.on('view', () => X.draw());
 X.show = () => {
  const list = X.list.slice().sort((a, b) => (X.active(b) - X.active(a)) || ((a.from || 0) - (b.from || 0)));
  MG.ui.misc({icon: 'fa-solid fa-triangle-exclamation', eb: 'Doprava', title: 'Mimořádnosti a výluky', sub: list.length ? list.length + ' aktuálních a chystaných' : 'Pro načtené okresy nejsou hlášeny'},
   (list.length ? list.map(X.card).join('') : '<div class="empty"><i class="fa-regular fa-circle-check"></i>Žádné mimořádnosti. Zdroje: IDS JMK přímo, PID a další přes worker mhdGO.</div>'), true);
 };
 MG.on('pack', () => { if (Date.now() - X.at > 60000) X.load(); else X.index(); });
 setInterval(() => X.load(), 5 * 60000);
 /* ---------------- offline: mezipaměť dat ---------------- */
 const CN = 'mhdgo-data-v1', KEY = p => 'https://mhdgo.local/' + p.split('?')[0];
 const hasCache = () => { try { return !!window.caches && window.isSecureContext; } catch (_) { return false; } };
 const orig = MG.fetchJSON;
 MG.fetchJSON = async (path, opt) => {
  try {
   const j = await orig(path, opt);
   if (hasCache()) caches.open(CN).then(c => c.put(KEY(path), new Response(JSON.stringify(j), {headers: {'Content-Type': 'application/json'}}))).then(prune).catch(() => {});
   return j;
  } catch (e) {
   if (hasCache()) { const r = await caches.match(KEY(path)); if (r) { MG.offline = true; MG.toast('Offline – používám uložená data', 3500); return r.json(); } }
   throw e;
  }
 };
 async function prune() {
  const c = await caches.open(CN), keys = (await c.keys()).filter(k => /\/okres\//.test(k.url));
  if (keys.length > 8) for (const k of keys.slice(0, keys.length - 8)) await c.delete(k);
 }
 /* ---------------- instalace (PWA) ---------------- */
 MG.pwa = {prompt: null, can: () => !(matchMedia('(display-mode: standalone)').matches || navigator.standalone)};
 window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); MG.pwa.prompt = e; });
 if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host)) {
  fetch('sw.js', {method: 'HEAD'}).then(r => { if (r.ok) navigator.serviceWorker.register('sw.js').catch(() => {}); }).catch(() => {});
 }
 MG.pwa.install = async () => {
  if (MG.pwa.prompt) { MG.pwa.prompt.prompt(); try { await MG.pwa.prompt.userChoice; } catch (_) {} MG.pwa.prompt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  MG.ui.misc({icon: 'fa-solid fa-mobile-screen', eb: 'mhd<b>GO</b>', title: 'Přidat na plochu'}, '<div class="info-p">' + (ios ? '<p>V Safari klepni na <b>Sdílet</b> <i class="fa-solid fa-arrow-up-from-bracket"></i> a zvol <b>Přidat na plochu</b>.</p>' : '<p>V prohlížeči otevři nabídku <b>⋮</b> a zvol <b>Nainstalovat aplikaci</b> nebo <b>Přidat na plochu</b>.</p>') + '<p><small>Okresy, které otevřeš, se uloží a mhdGO je ukáže i bez připojení (jízdní řády, síť, odjezdy). Živé polohy offline nejsou.</small></p></div>');
 };
})();
