/* ===== mhdGO – hledání zastávek, míst a spojení ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const S = MG.search = {tab: 'stops', from: null, to: null, res: null, sel: 0, ymd: null, t: null};
 /* ---------- zastávky v celé ČR ---------- */
 S.findStops = async (q, n) => {
  const idx = await D.loadIdx(); const f = MG.fold(q); if (!f) return [];
  const words = f.split(' ');
  const c = MG.map.m.getCenter(), cur = MG.app.cur;
  const out = [];
  for (const s of idx) {
   let sc = 0;
   if (s.f.startsWith(f)) sc = 6; else if (s.f.includes(' ' + f)) sc = 4; else if (words.every(w => s.f.includes(w))) sc = 2; else continue;
   if (s.ok === cur) sc += 2;
   if (s.m & 1) sc += .6; if (s.m & 6) sc += .4;
   out.push([sc - MG.dist(c.lat, c.lng, s.lat, s.lon) / 200000, s]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, n || 10).map(x => x[1]);
 };
 S.geocode = async (q) => {
  try {
   const c = MG.map.m.getCenter();
   const r = await fetch(MG.cfg.PHOTON + '?q=' + encodeURIComponent(q) + '&limit=6&lat=' + c.lat.toFixed(4) + '&lon=' + c.lng.toFixed(4) + '&bbox=12.09,48.55,18.86,51.06');
   const j = await r.json();
   return (j.features || []).map(f => { const p = f.properties || {}; const name = [p.name, p.street && (p.street + (p.housenumber ? ' ' + p.housenumber : ''))].filter(Boolean)[0] || p.city || ''; return {name, sub: [p.street && p.name ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '', p.city || p.town || p.village || '', p.county || ''].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], addr: true}; });
  } catch (_) { return []; }
 };
 const sugIcon = r => r.me ? 'fa-location-crosshairs' : r.fav ? 'fa-star' : r.addr ? 'fa-map-pin' : (r.m & 1 ? 'fa-train' : r.m & 4 ? 'fa-train-subway' : r.m & 2 ? 'fa-train-tram' : 'fa-location-dot');
 async function suggestions(q) {
  const out = [];
  if (!q) {
   if (MG.app.me) out.push({me: true, name: 'Moje poloha', sub: 'aktuální poloha', lat: MG.app.me.lat, lon: MG.app.me.lon});
   for (const f of (MG.store.get('favs', []) || [])) out.push({fav: true, name: f.label, sub: f.name, lat: f.lat, lon: f.lon, st: f.st});
   return out;
  }
  const st = await S.findStops(q, 6);
  for (const s of st) out.push({name: s.name, sub: D.okresy[s.ok] ? 'zastávka · okres ' + D.okresy[s.ok].name : 'zastávka', lat: s.lat, lon: s.lon, st: s.g, ok: s.ok, m: s.m});
  if (q.length >= 3) { const g = await S.geocode(q); for (const a of g.slice(0, 4)) out.push(a); }
  return out;
 }
 function sugBox(input, list, onPick) {
  let items = [];
  const show = MG.debounce(async () => {
   items = await suggestions(input.value.trim());
   list.innerHTML = items.map((r, i) => '<div class="sg" data-i="' + i + '"><i class="fa-solid ' + sugIcon(r) + '"></i><div class="tx"><b>' + MG.h(r.name) + '</b><small>' + MG.h(r.sub || '') + '</small></div></div>').join('');
   MG.qsa('.sg', list).forEach(x => x.onmousedown = x.ontouchstart = (e) => { e.preventDefault(); const r = items[+x.dataset.i]; list.innerHTML = ''; onPick(r); });
  }, 180);
  input.oninput = show; input.onfocus = show;
  input.onblur = () => setTimeout(() => { list.innerHTML = ''; }, 200);
  input.onkeydown = e => { if (e.key === 'Enter' && items[0]) { list.innerHTML = ''; onPick(items[0]); input.blur(); } };
 }
 /* ---------- vykreslení panelu ---------- */
 S.render = () => {
  const el = $('sh-search');
  let h = '<div class="sh-grab"></div><div class="sh-head" style="padding-bottom:6px"><div class="seg-tabs" style="flex:1;margin:0"><button data-tab="stops" class="' + (S.tab === 'stops' ? 'on' : '') + '"><i class="fa-solid fa-location-dot"></i>Zastávky</button><button data-tab="conn" class="' + (S.tab === 'conn' ? 'on' : '') + '"><i class="fa-solid fa-route"></i>Spojení</button></div><button class="xbtn" data-close><i class="fa-solid fa-xmark"></i></button></div><div class="sh-body">';
  const favs = MG.store.get('favs', []) || [];
  h += '<div class="favs">' + favs.map((f, i) => '<button class="chip" data-fav="' + i + '"><i class="fa-solid ' + (f.icon || 'fa-star') + '"></i>' + MG.h(f.label) + '</button>').join('') + '<button class="chip" id="fav-add"><i class="fa-solid fa-plus"></i>' + (favs.length ? '' : 'Domů, práce…') + '</button></div>';
  if (S.tab === 'stops') {
   h += '<div class="sec-t" style="margin-top:4px">Najít zastávku, linku nebo místo</div><div class="sugg"><div class="field"><i class="fa-solid fa-magnifying-glass"></i><input id="s-q" placeholder="Zastávka, linka nebo adresa v celé ČR" autocomplete="off"><button class="fbtn" id="s-me" title="Nejbližší zastávky"><i class="fa-solid fa-location-crosshairs"></i></button></div></div><div id="s-res"></div>';
  } else {
   h += '<div class="sugg"><div class="field"><i class="fa-regular fa-circle"></i><input id="c-from" placeholder="Odkud – zastávka, adresa, místo" value="' + MG.h(S.from ? S.from.name : '') + '" autocomplete="off"><button class="fbtn" id="c-from-me" title="Moje poloha"><i class="fa-solid fa-location-crosshairs"></i></button></div><div class="sugg-list" id="c-from-l"></div></div>' +
    '<div style="display:flex;justify-content:flex-end;margin:-4px 8px -4px"><button class="xbtn" id="c-swap" title="Prohodit" style="width:32px;height:32px;position:relative;z-index:2"><i class="fa-solid fa-arrow-right-arrow-left" style="transform:rotate(90deg)"></i></button></div>' +
    '<div class="sugg"><div class="field"><i class="fa-solid fa-location-dot"></i><input id="c-to" placeholder="Kam – zastávka, adresa, místo" value="' + MG.h(S.to ? S.to.name : '') + '" autocomplete="off"><button class="fbtn" id="c-star" title="Uložit do Mých míst"><i class="fa-regular fa-star"></i></button></div><div class="sugg-list" id="c-to-l"></div></div>' +
    '<div class="dep-ctl"><button class="chip' + (S.t == null ? ' on' : '') + '" id="c-now">Nyní</button><input type="time" id="c-t" value="' + MG.hm2(S.t != null ? S.t : MG.nowMin()) + '"><input type="date" id="c-d" value="' + (S.ymd || MG.pragueParts(MG.now()).ymd) + '"></div>' +
    '<button class="btn" id="c-go"><i class="fa-solid fa-route"></i>Najít spojení</button><div class="status" id="c-st"></div><div id="c-res"></div>';
  }
  h += '</div>';
  el.innerHTML = h;
  MG.qsa('[data-tab]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.render(); });
  MG.qsa('[data-close]', el).forEach(b => b.onclick = () => MG.ui.close('sh-search'));
  MG.qsa('[data-fav]', el).forEach(b => b.onclick = () => { const f = favs[+b.dataset.fav]; S.routeTo({name: f.name, lat: f.lat, lon: f.lon, st: f.st}); });
  $('fav-add').onclick = () => addFav();
  if (S.tab === 'stops') bindStops(); else { bindConn(); if (S.res) renderResults(); }
 };
 function bindStops() {
  const q = $('s-q'), res = $('s-res');
  const run = MG.debounce(async () => {
   const v = q.value.trim(); if (!v) { res.innerHTML = ''; return; }
   let h = '';
   /* linky v načtených okresech */
   const lf = MG.fold(v), lines = [];
   for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) { const L_ = D.ln.get(li); if (L_ && MG.fold(D.lineText(L_)) === lf && !lines.includes(L_)) lines.push(L_); }
   if (lines.length) h += '<div class="sec-t">Linky</div>' + lines.slice(0, 6).map(L_ => '<div class="list-item" data-line="' + L_.i + '">' + D.badge(L_, {size: 'big'}) + '<div class="li-tx"><b>' + MG.h(L_.ln || '') + '</b><small>' + MG.h(L_.city ? 'MHD ' + L_.city : (L_.sys || '')) + '</small></div><i class="fa-solid fa-chevron-right" style="color:var(--faint)"></i></div>').join('');
   const st = await S.findStops(v, 8);
   if (st.length) h += '<div class="sec-t">Zastávky</div>' + st.map(s => '<div class="list-item" data-st="' + s.g + '" data-ok="' + s.ok + '"><i class="fa-solid ' + sugIcon(s) + '" style="color:var(--acc);width:18px;text-align:center"></i><div class="li-tx"><b>' + MG.h(s.name) + '</b><small>' + (D.okresy[s.ok] ? 'okres ' + MG.h(D.okresy[s.ok].name) : '') + '</small></div><span class="li-r">odjezdy</span></div>').join('');
   res.innerHTML = h + '<div id="s-geo"></div>';
   bindRes();
   if (v.length >= 3) { const g = await S.geocode(v); const ge = $('s-geo'); if (ge && g.length) { ge.innerHTML = '<div class="sec-t">Místa a adresy</div>' + g.map((a, i) => '<div class="list-item" data-geo="' + i + '"><i class="fa-solid fa-map-pin" style="color:var(--acc);width:18px;text-align:center"></i><div class="li-tx"><b>' + MG.h(a.name) + '</b><small>' + MG.h(a.sub) + '</small></div></div>').join(''); MG.qsa('[data-geo]', ge).forEach(x => x.onclick = () => S.place(g[+x.dataset.geo])); } }
  }, 220);
  q.oninput = run;
  $('s-me').onclick = async () => { const me = MG.app.me || await MG.app.locate(false); if (!me) return MG.toast('Poloha není k dispozici'); S.place({name: 'Moje poloha', lat: me.lat, lon: me.lon, me: true}); };
  function bindRes() {
   MG.qsa('[data-line]', res).forEach(x => x.onclick = () => MG.net.openLine(+x.dataset.line));
   MG.qsa('[data-st]', res).forEach(x => x.onclick = () => MG.dep.show(+x.dataset.st, +x.dataset.ok));
  }
  setTimeout(() => q.focus(), 300);
 }
 /* místo: přiblížit a ukázat nejbližší zastávky */
 S.place = async (a) => {
  const idx = await D.loadIdx();
  const near = idx.map(s => [MG.dist(a.lat, a.lon, s.lat, s.lon), s]).sort((x, y) => x[0] - y[0]).slice(0, 4);
  const res = $('s-res');
  if (res) {
   res.innerHTML = '<div class="sec-t">Nejbližší zastávky – ' + MG.h(a.name) + '</div>' + near.map(([d, s]) => '<div class="list-item" data-st="' + s.g + '" data-ok="' + s.ok + '"><i class="fa-solid ' + sugIcon(s) + '" style="color:var(--acc);width:18px;text-align:center"></i><div class="li-tx"><b>' + MG.h(s.name) + '</b><small>' + MG.fmtDist(d) + ' · pěšky ' + Math.max(1, Math.round(d / 70)) + ' min</small></div><span class="li-r">odjezdy</span></div>').join('') +
    '<button class="btn sec" id="s-route" style="margin-top:6px"><i class="fa-solid fa-route"></i>Spojení sem</button>';
   MG.qsa('[data-st]', res).forEach(x => x.onclick = () => MG.dep.show(+x.dataset.st, +x.dataset.ok));
   $('s-route').onclick = () => S.routeTo(a);
  }
  const oi = D.okresAt(a.lat, a.lon); if (oi >= 0 && oi !== MG.app.cur) MG.app.selectOkres(oi, {keepView: true});
  MG.map.m.flyTo([a.lat, a.lon], 16, {duration: .8});
  if (S.pin) MG.map.m.removeLayer(S.pin);
  S.pin = L.marker([a.lat, a.lon], {icon: L.divIcon({className: 'plat-ic', html: '<div style="transform:translate(-50%,-100%);color:var(--acc);font-size:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))"><i class="fa-solid fa-location-dot"></i></div>', iconSize: [0, 0]}), pane: 'me'}).addTo(MG.map.m);
 };
 function bindConn() {
  sugBox($('c-from'), $('c-from-l'), r => { S.from = r; $('c-from').value = r.name; });
  sugBox($('c-to'), $('c-to-l'), r => { S.to = r; $('c-to').value = r.name; });
  $('c-from-me').onclick = async () => { const me = MG.app.me || await MG.app.locate(false); if (!me) return MG.toast('Poloha není k dispozici'); S.from = {name: 'Moje poloha', lat: me.lat, lon: me.lon, me: true}; $('c-from').value = 'Moje poloha'; };
  $('c-swap').onclick = () => { const a = S.from; S.from = S.to; S.to = a; $('c-from').value = S.from ? S.from.name : ''; $('c-to').value = S.to ? S.to.name : ''; };
  $('c-star').onclick = () => { if (!S.to) return MG.toast('Nejdřív vyber cíl'); addFav(S.to); };
  $('c-now').onclick = () => { S.t = null; S.ymd = null; S.render(); };
  $('c-t').onchange = e => { const [h, m] = e.target.value.split(':').map(Number); if (isFinite(h)) S.t = h * 60 + m; $('c-now').classList.remove('on'); };
  $('c-d').onchange = e => { S.ymd = e.target.value || null; $('c-now').classList.remove('on'); };
  $('c-go').onclick = () => S.find();
 }
 function addFav(pt) {
  const F = MG.store.get('favs', []) || [];
  const label = prompt('Název místa (např. Domů, Práce, Škola):', pt ? pt.name : 'Domů'); if (!label) return;
  if (!pt) { MG.toast('Vyber místo v hledání a ulož ho hvězdičkou'); return; }
  const icon = /dom/i.test(label) ? 'fa-house' : /prác|prac/i.test(label) ? 'fa-briefcase' : /škol|skol/i.test(label) ? 'fa-graduation-cap' : 'fa-star';
  F.push({label, name: pt.name, lat: pt.lat, lon: pt.lon, st: pt.st, icon}); MG.store.set('favs', F); MG.toast('Uloženo do Mých míst'); S.render();
 }
 S.routeTo = (pt) => {
  S.tab = 'conn'; S.to = pt; S.res = null;
  if (!S.from && MG.app.me) S.from = {name: 'Moje poloha', lat: MG.app.me.lat, lon: MG.app.me.lon, me: true};
  if (MG.mode3d) MG.m3d.close();
  S.render(); MG.ui.open('sh-search', {tall: true}); S.render();
  if (S.from && S.to) S.find();
 };
 S.find = async () => {
  if (!S.from || !S.to) { $('c-st').textContent = 'Vyber, odkud a kam.'; return; }
  const ymd = S.ymd || MG.pragueParts(MG.now()).ymd, t = S.t != null ? S.t : Math.ceil(MG.nowMin());
  $('c-st').innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>Hledám spojení…';
  $('c-res').innerHTML = '';
  await MG.sleep(30);
  try {
   const r = await MG.raptor.search(S.from, S.to, ymd, t, {count: 5});
   S.res = r; S.sel = 0; S.qymd = ymd;
   if (r.err) { $('c-st').textContent = r.err; return; }
   $('c-st').textContent = r.results.length ? '' : 'Spojení nenalezeno. Zkus jiný čas nebo bližší zastávku.';
   renderResults(); if (r.results.length) showConn(0);
  } catch (e) { MG.err('raptor', e); $('c-st').textContent = 'Při hledání nastala chyba.'; }
 };
 function legTimes(l) { const st0 = l.p.T[3 * l.j] + (l.day - S.res.qday) * 1440; return {dep: st0 + l.p.dep[l.prof][l.bi], arr: st0 + l.p.arr[l.prof][l.ai]}; }
 function renderResults() {
  const box = $('c-res'); if (!box || !S.res) return;
  const r = S.res; let h = '';
  if (r.walkOnly) h += '<div class="conn"><div class="conn-h"><i class="fa-solid fa-person-walking" style="color:var(--acc)"></i><b>Pěšky</b><span class="du">' + r.walkOnly.dur + ' min · ' + MG.fmtDist(r.walkOnly.dist) + '</span></div></div>';
  r.results.forEach((c, i) => {
   const rides = c.legs.filter(l => !l.walk);
   const t1 = legTimes(rides[0]), tl = legTimes(rides[rides.length - 1]);
   const dep = t1.dep - (c.acc[1] || 0), arr = c.arr;
   const chips = c.legs.map(l => l.walk ? (l.dur > 0 ? '<i class="fa-solid fa-person-walking"></i>' : '') : D.badge(D.ln.get(l.p.l), {text: D.ln.get(l.p.l).k === 'vlak' ? D.trainLabel(D.ln.get(l.p.l), l.p.n && l.p.n[l.j]) : null})).filter(Boolean).join('<i class="fa-solid fa-angle-right" style="font-size:9px"></i>');
   h += '<div class="conn' + (i === S.sel ? ' sel' : '') + '" data-c="' + i + '"><div class="conn-h"><span class="tm">' + MG.hm2(dep) + ' → ' + MG.hm2(arr) + '</span><span class="du">' + fmtDur(arr - dep) + ' · ' + (rides.length - 1 ? (rides.length - 1) + ' přest.' : 'přímo') + '</span></div><div class="conn-legs">' + chips + '</div>';
   if (i === S.sel) h += detail(c);
   h += '</div>';
  });
  box.innerHTML = h;
  MG.qsa('.conn[data-c]', box).forEach(x => x.onclick = () => { S.sel = +x.dataset.c; renderResults(); showConn(S.sel); });
 }
 const fmtDur = m => { m = Math.round(m); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + MG.pad(m % 60) + ' min'; };
 function detail(c) {
  let h = '<div class="conn-d">';
  const nm = i => D.stName(S.res.n.stArr[i]);
  const firstRide = c.legs.find(l => !l.walk);
  if (c.acc[1] > 0 || (c.legs[0].walk && c.legs[0].dur > 0)) h += '<div class="leg"><div class="lg-ic"><i class="fa-solid fa-person-walking"></i></div><div class="lg-tx"><b>Pěšky ' + Math.max(1, c.acc[1] || c.legs[0].dur) + ' min</b><small>' + MG.h(S.from.name) + ' → ' + MG.h(nm(c.legs[0].walk ? c.legs[0].to : firstRide.from)) + '</small></div></div>';
  for (const l of c.legs) {
   if (l.walk) { if (l.from >= 0 && l.dur > 0) h += '<div class="leg"><div class="lg-ic"><i class="fa-solid fa-person-walking"></i></div><div class="lg-tx"><b>Přestup pěšky ' + l.dur + ' min</b><small>' + MG.h(nm(l.from)) + ' → ' + MG.h(nm(l.to)) + ' · ' + MG.fmtDist(l.dist) + '</small></div></div>'; continue; }
   const L_ = D.ln.get(l.p.l), t = legTimes(l), pb = D.pl.get(l.p.s[l.bi]), pa = D.pl.get(l.p.s[l.ai]);
   h += '<div class="leg"><div class="lg-ic">' + D.badge(L_, {text: L_.k === 'vlak' ? D.trainLabel(L_, l.p.n && l.p.n[l.j]) : null}) + '</div><div class="lg-tx"><b>' + MG.hm2(t.dep) + ' ' + MG.h(D.stName(pb.st)) + '</b>' + (pb.lab ? ' <span class="pl" style="font:800 10px Outfit;padding:2px 5px;border-radius:5px;background:var(--hover)">' + MG.h(pb.lab) + '</span>' : '') + '<small>směr ' + MG.h(D.headsign(l.p, l.j)) + ' · ' + (l.ai - l.bi) + ' zast.</small><b>' + MG.hm2(t.arr) + ' ' + MG.h(D.stName(pa.st)) + '</b></div></div>';
  }
  if (c.egress > 0) h += '<div class="leg"><div class="lg-ic"><i class="fa-solid fa-person-walking"></i></div><div class="lg-tx"><b>Pěšky ' + c.egress + ' min</b><small>→ ' + MG.h(S.to.name) + '</small></div></div>';
  h += '<div class="row" style="margin-top:6px"><a class="btn sec sm" target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/spojeni/?f=' + encodeURIComponent(S.from.st != null ? D.stName(S.from.st) : S.from.name) + '&t=' + encodeURIComponent(S.to.st != null ? D.stName(S.to.st) : S.to.name) + '"><i class="fa-solid fa-arrow-up-right-from-square"></i>Ověřit v IDOS</a></div></div>';
  return h;
 }
 function showConn(i) {
  const c = S.res.results[i]; if (!c) return;
  const g = MG.map.gSel; g.clearLayers(); MG.map.dimNet(true); MG.map.selKind = 'conn';
  const all = [];
  const nmll = si => { const s = D.st.get(S.res.n.stArr[si]); return [s.lat, s.lon]; };
  const firstRide = c.legs.find(l => !l.walk);
  const a0 = nmll(c.legs[0].walk ? c.legs[0].to : firstRide.from);
  L.polyline([[S.from.lat, S.from.lon], a0], {renderer: MG.map.rSel, color: '#6b625b', weight: 4, dashArray: '2 8', lineCap: 'round'}).addTo(g);
  for (const l of c.legs) {
   if (l.walk) { if (l.from >= 0) L.polyline([nmll(l.from), nmll(l.to)], {renderer: MG.map.rSel, color: '#6b625b', weight: 4, dashArray: '2 8', lineCap: 'round'}).addTo(g); continue; }
   const L_ = D.ln.get(l.p.l), geo = D.geo3(l.p), pts = geo.pts.slice(geo.x[l.bi], geo.x[l.ai] + 1);
   all.push(...pts);
   L.polyline(pts, {renderer: MG.map.rSel, color: '#fff', weight: 9, opacity: .95}).addTo(g);
   L.polyline(pts, {renderer: MG.map.rSel, color: L_.c, weight: 5.5}).addTo(g);
   for (const k of [l.bi, l.ai]) { const pl = D.pl.get(l.p.s[k]); L.circleMarker([pl.lat, pl.lon], {renderer: MG.map.rSel, radius: 6, color: L_.c, weight: 3, fillColor: '#fff', fillOpacity: 1}).bindTooltip(MG.h(D.stName(pl.st)), {className: 'stop-tip'}).addTo(g); }
  }
  const last = nmll(c.end); L.polyline([last, [S.to.lat, S.to.lon]], {renderer: MG.map.rSel, color: '#6b625b', weight: 4, dashArray: '2 8', lineCap: 'round'}).addTo(g);
  for (const [p, ic] of [[S.from, 'fa-circle-dot'], [S.to, 'fa-location-dot']]) L.marker([p.lat, p.lon], {icon: L.divIcon({className: 'plat-ic', html: '<div style="transform:translate(-50%,-90%);color:#24201c;font-size:22px;filter:drop-shadow(0 1px 2px #fff)"><i class="fa-solid ' + ic + '"></i></div>', iconSize: [0, 0]}), pane: 'me'}).addTo(g);
  all.push([S.from.lat, S.from.lon], [S.to.lat, S.to.lon]);
  MG.map.fitPad(L.latLngBounds(all));
 }
 MG.on('sheetclose', id => { if (id === 'sh-search' && MG.map.selKind === 'conn') MG.map.clearSel(); if (id === 'sh-search' && S.pin) { MG.map.m.removeLayer(S.pin); S.pin = null; } });
})();
