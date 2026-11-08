/* ===== mhdGO – hledání zastávek, míst a spojení (jako OpavaGO) =====
 Zastávky: našeptávač (Moje místa, linky, zastávky celé ČR, adresy) → „Hledané místo“ a karty nejbližších zastávek s linkami.
 Spojení: odkud/kam s našeptávačem, čas → řádky spojů (odjezd–příjezd, linky, doba) a detail s časovou osou. */
(function(){
 const D = MG.D, $ = MG.$;
 const S = MG.search = {tab: 'stops', from: null, to: null, res: null, sel: 0, ymd: null, t: null, q: null, near: null};
 /* ---------- zastávky v celé ČR ---------- */
 S.findStops = async (q, n) => {
  const idx = await D.loadIdx(); const f = MG.fold(q); if (!f) return [];
  const words = f.split(' ');
  const c = MG.map.m.getCenter(), cur = MG.app.cur;
  const out = [];
  for (const s of idx) {
   let sc = 0;
   const last = s.f.split(' ').slice(-words.length).join(' ');
   if (s.f === f || last === f) sc = 7; else if (s.f.startsWith(f)) sc = 6; else if (s.f.includes(' ' + f)) sc = 4; else if (words.every(w => s.f.includes(w))) sc = 2; else continue;
   if (s.ok === cur) sc += 2.5;
   if (s.m & 1) sc += .5; if (s.m & 6) sc += .4;
   out.push([sc - MG.dist(c.lat, c.lng, s.lat, s.lon) / 150000, s]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, n || 10).map(x => x[1]);
 };
 S.geocode = async (q) => {
  try {
   const c = MG.map.m.getCenter();
   const r = await fetch(MG.cfg.PHOTON + '?q=' + encodeURIComponent(q) + '&limit=6&lang=de&lat=' + c.lat.toFixed(4) + '&lon=' + c.lng.toFixed(4) + '&bbox=12.09,48.55,18.86,51.06');
   const j = await r.json();
   return (j.features || []).map(f => { const p = f.properties || {}; const street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : ''; const name = p.name || street || p.city || ''; return {name, sub: [p.name && street ? street : '', p.district || '', p.city || p.town || p.village || ''].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && x !== name).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], addr: true}; }).filter(a => a.name);
  } catch (_) { return []; }
 };
 const stIcon = m => m & 1 ? 'fa-train' : m & 4 ? 'fa-train-subway' : m & 2 ? 'fa-train-tram' : 'fa-bus-simple';
 function lineChips(g, max) {
  const ls = D.stLines(g); if (!ls.length) return '';
  max = max || 10;
  return ls.slice(0, max).map(x => D.badge(x, {attr: 'data-line="' + x.i + '"'})).join('') + (ls.length > max ? '<span class="ln more">+' + (ls.length - max) + '</span>' : '');
 }
 /* ---------- našeptávač (sug41) ---------- */
 async function suggestions(q, opt) {
  const out = [];
  const F = MG.store.get('favs', []) || [];
  const f = MG.fold(q);
  if (!f) {
   if (opt && opt.me && MG.app.me) out.push({me: true, name: 'Moje poloha', sub: 'aktuální poloha', lat: MG.app.me.lat, lon: MG.app.me.lon});
   for (const x of F) out.push({fav: true, icon: x.icon, name: x.label, sub: x.name, lat: x.lat, lon: x.lon, st: x.st});
   return out;
  }
  for (const x of F) if (MG.fold(x.label + ' ' + x.name).includes(f)) out.push({fav: true, icon: x.icon, name: x.label, sub: x.name, lat: x.lat, lon: x.lon, st: x.st});
  if (!(opt && opt.noLines)) {
   const lines = [];
   for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) { const L_ = D.ln.get(li); if (L_ && MG.fold(D.lineText(L_)) === f && !lines.includes(L_)) lines.push(L_); }
   for (const L_ of lines.slice(0, 4)) out.push({line: L_.i, name: (L_.k === 'vlak' ? 'Vlak ' : L_.city ? 'Linka MHD ' + L_.city + ' ' : 'Linka ') + D.lineText(L_), sub: L_.ln || ''});
  }
  for (const s of await S.findStops(q, 7)) out.push({name: s.name, sub: D.okresy[s.ok] ? 'okres ' + D.okresy[s.ok].name : '', lat: s.lat, lon: s.lon, st: s.g, ok: s.ok, m: s.m});
  return out;
 }
 function sugHTML(r, i) {
  const ic = r.me ? 'fa-location-crosshairs' : r.fav ? (r.icon || 'fa-star') : r.line != null ? 'fa-route' : r.addr ? 'fa-location-dot' : stIcon(r.m);
  const chips = r.st != null && !r.fav ? lineChips(r.st, 8) : '';
  const lb = r.line != null ? D.badge(D.ln.get(r.line)) : '';
  return '<div class="sug41-item" data-i="' + i + '"><span class="sug41-ico' + (r.fav ? ' fav' : '') + '">' + (lb || '<i class="fa-solid ' + ic + '"></i>') + '</span><span class="sug41-main"><strong>' + MG.h(r.name) + '</strong>' + (chips ? '<span class="sug41-lines">' + chips + '</span>' : '<small>' + MG.h(r.sub || (r.addr ? 'adresa' : '')) + '</small>') + '</span></div>';
 }
 /* napojí našeptávač na pole; onPick(položka) */
 function attachSug(input, box, onPick, opt) {
  let items = [], hi = -1, seq = 0;
  const close = () => { box.hidden = true; box.innerHTML = ''; hi = -1; };
  const paint = () => {
   if (!items.length) { box.innerHTML = input.value.trim().length > 1 ? '<div class="sug41-empty">Nic nenalezeno</div>' : ''; box.hidden = !box.innerHTML; return; }
   box.innerHTML = items.map(sugHTML).join(''); box.hidden = false;
   MG.qsa('.sug41-item', box).forEach(x => { x.onpointerdown = e => e.preventDefault(); x.onclick = () => { const r = items[+x.dataset.i]; close(); onPick(r); }; });
  };
  const run = MG.debounce(async () => {
   const q = input.value.trim(), my = ++seq;
   items = await suggestions(q, opt); if (my !== seq) return;
   hi = -1; paint();
   if (q.length >= 3) { const g = await S.geocode(q); if (my !== seq || document.activeElement !== input) return; items = items.concat(g.slice(0, 5)); paint(); }
  }, 160);
  input.addEventListener('input', () => { input._pick = null; run(); });
  input.addEventListener('focus', () => { const sh = input.closest('.sheet'); if (sh && !MG.isWide()) sh.classList.add('tall'); run(); });
  input.addEventListener('blur', () => setTimeout(close, 160));
  input.addEventListener('keydown', e => {
   const n = items.length;
   if (e.key === 'ArrowDown' && n) { e.preventDefault(); hi = (hi + 1) % n; }
   else if (e.key === 'ArrowUp' && n) { e.preventDefault(); hi = (hi - 1 + n) % n; }
   else if (e.key === 'Escape') { close(); return; }
   else if (e.key === 'Enter') { e.preventDefault(); const r = items[hi >= 0 ? hi : 0]; if (r) { close(); onPick(r); input.blur(); } else if (opt && opt.onEnter) opt.onEnter(); return; }
   else return;
   MG.qsa('.sug41-item', box).forEach((x, i) => x.classList.toggle('active', i === hi));
  });
 }
 /* ---------- vykreslení panelu ---------- */
 const field = (id, icon, ph, val, btns) => '<div class="s-wrap"><div class="s-field' + (S.tab === 'conn' ? ' dim' : '') + '"><i class="' + icon + '"></i><input id="' + id + '" placeholder="' + ph + '" value="' + MG.h(val || '') + '" autocomplete="off" enterkeyhint="search">' + (btns || '') + '</div><div class="sug41" id="' + id + '-sug" hidden></div></div>';
 S.render = () => {
  const el = $('sh-search');
  let h = '<div class="sh-grab"></div><div class="sh-body" style="padding-top:2px"><div class="seg-tabs" style="margin:4px 0 10px"><button data-tab="stops" class="' + (S.tab === 'stops' ? 'on' : '') + '"><i class="fa-solid fa-location-dot"></i>Zastávky</button><button data-tab="conn" class="' + (S.tab === 'conn' ? 'on' : '') + '"><i class="fa-solid fa-route"></i>Spojení</button></div>';
  h += MG.dep.favStrip('search');
  if (S.tab === 'stops') {
   h += '<div class="s-head"><h3>' + (S.favLabel != null ? 'Uložit místo' + (S.favLabel ? ' „' + MG.h(S.favLabel) + '“' : '') : 'Najít nejbližší zastávky') + '</h3><button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>' +
    field('s-q', 'fa-solid fa-location-dot', 'Zastávka, linka nebo adresa', S.q ? S.q.name : '', '<button class="fbtn" id="s-clr" title="Vymazat"' + (S.q ? '' : ' hidden') + '><i class="fa-solid fa-xmark"></i></button><button class="fbtn" id="s-me" title="Moje poloha"><i class="fa-solid fa-crosshairs"></i></button>') +
    '<button class="s-light" id="s-clear"><i class="fa-solid fa-eraser"></i>Vymazat</button><button class="btn" id="s-go"><i class="fa-solid fa-magnifying-glass"></i>Hledat</button><div class="status" id="s-st"></div><div id="s-res"></div>';
  } else {
   h += '<div class="s-head"><h3>Vyhledat spojení</h3><button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="conn-io">' + field('c-from', 'fa-regular fa-circle-dot', 'Odkud – zastávka, adresa nebo místo', S.from ? S.from.name : '', '<button class="fbtn" id="c-from-me" title="Moje poloha"><i class="fa-solid fa-crosshairs"></i></button>') +
    field('c-to', 'fa-solid fa-location-dot', 'Kam – zastávka, adresa nebo místo', S.to ? S.to.name : '') +
    '<button class="swap41" id="c-swap" title="Prohodit"><i class="fa-solid fa-arrow-right-arrow-left"></i></button></div>' +
    '<div class="when41"><button class="chip' + (S.t == null ? ' on' : '') + '" id="c-now">Teď</button><input type="time" id="c-t" value="' + MG.hm2(S.t != null ? S.t : MG.nowMin()) + '"><input type="date" id="c-d" value="' + (S.ymd || MG.pragueParts(MG.now()).ymd) + '"></div>' +
    '<button class="btn" id="c-go"><i class="fa-solid fa-magnifying-glass"></i>Hledat spojení</button><div class="status" id="c-st"></div><div id="c-res"></div>';
  }
  h += '</div>';
  el.innerHTML = h;
  MG.qsa('[data-tab]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.render(); });
  MG.dep.bindFav(el, f => S.tab === 'conn' ? (S.to = {name: f.label || f.name, lat: f.lat, lon: f.lon, st: f.st}, S.render(), S.find()) : S.pick({name: f.label, sub: f.name, lat: f.lat, lon: f.lon, st: f.st, fav: true}));
  if (S.tab === 'stops') bindStops(); else { bindConn(); if (S.res) renderResults(); }
 };
 /* přidání do Mých míst: vyhledej místo a potvrď */
 S.addFavFlow = (label) => {
  S.favLabel = label || ''; S.tab = 'stops'; S.q = null; S.near = null;
  if (MG.ui.cur !== 'sh-search') MG.ui.open('sh-search', {tall: true});
  S.render(); setTimeout(() => { const q = $('s-q'); if (q) q.focus(); }, 250);
 };
 function bindStops() {
  const q = $('s-q');
  attachSug(q, $('s-q-sug'), r => S.pick(r), {onEnter: () => S.searchText()});
  $('s-clr').onclick = $('s-clear').onclick = () => { S.q = null; S.near = null; q.value = ''; $('s-res').innerHTML = ''; $('s-st').textContent = ''; $('s-clr').hidden = true; if (S.pin) { MG.map.m.removeLayer(S.pin); S.pin = null; } q.focus(); };
  q.addEventListener('input', () => { $('s-clr').hidden = !q.value; });
  $('s-go').onclick = () => S.searchText();
  $('s-me').onclick = async () => { const me = MG.app.me || await MG.app.locate(false); if (!me) return MG.toast('Poloha není k dispozici'); S.pick({name: 'Moje poloha', sub: 'aktuální poloha', lat: me.lat, lon: me.lon, me: true}); };
  if (S.q) renderNear(); else if (S.favLabel == null) setTimeout(() => { if (MG.ui.cur === 'sh-search' && !MG.isWide()) return; q.focus(); }, 300);
 }
 /* tlačítko Hledat / Enter bez výběru: první zastávka, jinak první adresa */
 S.searchText = async () => {
  const v = ($('s-q') || {}).value; if (!v || !v.trim()) { $('s-me') && $('s-me').click(); return; }
  if (S.q && S.q.name === v) return S.pick(S.q);
  $('s-st').innerHTML = '<span class="spin"></span> Hledám…';
  const st = await S.findStops(v, 1);
  if (st[0] && MG.fold(st[0].name).includes(MG.fold(v))) return S.pick({name: st[0].name, sub: D.okresy[st[0].ok] ? 'okres ' + D.okresy[st[0].ok].name : '', lat: st[0].lat, lon: st[0].lon, st: st[0].g, ok: st[0].ok, m: st[0].m});
  const g = await S.geocode(v);
  if (g[0]) return S.pick(g[0]);
  $('s-st').textContent = 'Místo se nepodařilo najít.';
 };
 /* výběr místa → nejbližší zastávky */
 S.pick = async (r) => {
  if (r.line != null) { MG.net.openLine(r.line); return; }
  if (S.tab !== 'stops') { S.tab = 'stops'; S.render(); }
  S.q = r; const qi = $('s-q'); if (qi) qi.value = r.name; if ($('s-clr')) $('s-clr').hidden = false;
  const idx = await D.loadIdx();
  const near = idx.map(s => [MG.dist(r.lat, r.lon, s.lat, s.lon), s]).sort((x, y) => x[0] - y[0]).slice(0, 4);
  if (r.st != null) { const i = near.findIndex(x => x[1].g === r.st); if (i > 0) near.unshift(near.splice(i, 1)[0]); else if (i < 0) { const s = idx.find(x => x.g === r.st); if (s) near.unshift([0, s]); near.length = Math.min(near.length, 4); } }
  S.near = near;
  const oi = D.okresAt(r.lat, r.lon);
  if (oi >= 0 && !D.loaded.has(oi)) D.loadOkres(oi).then(() => { if (S.q === r) renderNear(); }).catch(() => {});
  if (oi >= 0 && oi !== MG.app.cur) MG.app.selectOkres(oi, {keepView: true});
  if (MG.mode3d) MG.m3d.flyTo && MG.m3d.flyTo(r.lat, r.lon); else MG.map.m.flyTo([r.lat, r.lon], 16, {duration: .8});
  if (S.pin) MG.map.m.removeLayer(S.pin);
  S.pin = L.marker([r.lat, r.lon], {icon: L.divIcon({className: 'plat-ic', html: '<div class="pin41"><i class="fa-solid fa-location-dot"></i></div>', iconSize: [0, 0]}), pane: 'me'}).addTo(MG.map.m);
  $('s-st').textContent = '';
  renderNear();
 };
 S.place = (a) => { if (MG.ui.cur !== 'sh-search') { S.tab = 'stops'; MG.ui.open('sh-search', {tall: true}); S.render(); } S.pick(a); };
 function renderNear() {
  const box = $('s-res'); if (!box || !S.q) return;
  const r = S.q, near = S.near || [];
  let h = '<div class="list41-title">Hledané místo</div><div class="hl41"><i class="fa-solid ' + (r.me ? 'fa-location-crosshairs' : r.fav ? (r.icon || 'fa-star') : 'fa-location-dot') + '"></i><span><b>' + MG.h(r.name) + '</b>' + (r.sub ? '<small>' + MG.h(r.sub) + '</small>' : '') + '</span>' +
   (S.favLabel != null ? '<button class="btn sm" id="s-savefav"><i class="fa-solid fa-star"></i>Uložit</button>' : '<button class="fbtn" id="s-fav" title="Uložit do Mých míst"><i class="fa-regular fa-star"></i></button>') + '</div>';
  h += '<div class="list41-title">Nejbližší zastávky a jejich linky</div>';
  near.forEach(([d, s], i) => {
   const walk = Math.max(1, Math.round(d * 1.25 / 75));
   h += '<div class="card41" data-st="' + s.g + '" data-ok="' + s.ok + '"><div class="card41-top"><span class="card41-ico">' + (i + 1) + '</span><span class="card41-name">' + MG.h(D.shortName(s.name, '')) + '</span><span class="card41-dist">' + (d < 15 ? 'zde' : MG.fmtDist(d) + ' · ' + walk + ' min') + '</span></div><div class="card41-lines">' + (lineChips(s.g, 14) || '<span class="muted41">' + (D.loaded.has(s.ok) ? 'linky nejsou v datech' : 'načítám linky…') + '</span>') + '</div>' +
    '<div class="card41-acts"><button class="chip" data-dep="' + s.g + '|' + s.ok + '"><i class="fa-regular fa-clock"></i>Odjezdy</button><button class="chip" data-walk="' + i + '"><i class="fa-solid fa-person-walking"></i>Pěšky sem</button></div></div>';
  });
  h += '<button class="btn sec" id="s-route"><i class="fa-solid fa-route"></i>Spojení sem</button>';
  box.innerHTML = h;
  MG.qsa('.card41', box).forEach(c => c.onclick = (e) => {
   if (e.target.closest('[data-line],[data-dep],[data-walk]')) return;
   const g = +c.dataset.st, s = (S.near.find(x => x[1].g === g) || [])[1]; if (!s) return;
   if (!MG.isWide()) MG.ui.close('sh-search');
   MG.map.m.flyTo([s.lat, s.lon], 17, {duration: .7});
   setTimeout(() => MG.dep.stopPopup(g), 750);
  });
  MG.qsa('[data-line]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); MG.net.openLine(+b.dataset.line); });
  MG.qsa('[data-dep]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); const [g, ok] = b.dataset.dep.split('|').map(Number); MG.dep.show(g, ok); });
  MG.qsa('[data-walk]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); const s = S.near[+b.dataset.walk][1]; MG.walk.to({name: s.name, lat: s.lat, lon: s.lon}); });
  $('s-route').onclick = () => S.routeTo(r);
  if ($('s-fav')) $('s-fav').onclick = () => addFav(r, '');
  if ($('s-savefav')) $('s-savefav').onclick = () => { addFav(r, S.favLabel); S.favLabel = null; };
 }
 MG.on('pack', () => { if (MG.ui.cur === 'sh-search' && S.tab === 'stops' && S.q) renderNear(); });
 function addFav(pt, label0) {
  if (!pt) { S.addFavFlow(''); return; }
  const F = MG.store.get('favs', []) || [];
  const label = label0 || prompt('Název místa (např. Domů, Práce, Škola):', pt.name); if (!label) return;
  const icon = /dom/i.test(label) ? 'fa-house' : /prác|prac/i.test(label) ? 'fa-briefcase' : /škol|skol/i.test(label) ? 'fa-graduation-cap' : 'fa-star';
  const i = F.findIndex(f => f.label === label); const rec = {label, name: pt.sub && pt.fav ? pt.sub : pt.name, lat: pt.lat, lon: pt.lon, st: pt.st, icon};
  if (i >= 0) F[i] = rec; else F.push(rec);
  MG.store.set('favs', F); MG.toast('Uloženo do Mých míst: ' + label); S.favLabel = null; S.render();
 }
 /* ---------- spojení ---------- */
 function bindConn() {
  const fi = $('c-from'), ti = $('c-to');
  attachSug(fi, $('c-from-sug'), r => { if (r.line != null) return; S.from = r; fi.value = r.name; if (!S.to) ti.focus(); else S.find(); }, {me: true, noLines: true});
  attachSug(ti, $('c-to-sug'), r => { if (r.line != null) return; S.to = r; ti.value = r.name; if (S.from) S.find(); else fi.focus(); }, {noLines: true});
  $('c-from-me').onclick = async () => { const me = MG.app.me || await MG.app.locate(false); if (!me) return MG.toast('Poloha není k dispozici'); S.from = {name: 'Moje poloha', lat: me.lat, lon: me.lon, me: true}; fi.value = 'Moje poloha'; if (S.to) S.find(); };
  $('c-swap').onclick = () => { const a = S.from; S.from = S.to; S.to = a; fi.value = S.from ? S.from.name : ''; ti.value = S.to ? S.to.name : ''; if (S.from && S.to) S.find(); };
  $('c-now').onclick = () => { S.t = null; S.ymd = null; S.render(); if (S.from && S.to) S.find(); };
  $('c-t').onchange = e => { const [h, m] = e.target.value.split(':').map(Number); if (isFinite(h)) S.t = h * 60 + m; $('c-now').classList.remove('on'); };
  $('c-d').onchange = e => { S.ymd = e.target.value || null; $('c-now').classList.remove('on'); };
  $('c-go').onclick = async () => {
   if (!S.from && fi.value.trim()) { const r = (await suggestions(fi.value, {noLines: true}))[0] || (await S.geocode(fi.value))[0]; if (r) { S.from = r; fi.value = r.name; } }
   if (!S.to && ti.value.trim()) { const r = (await suggestions(ti.value, {noLines: true}))[0] || (await S.geocode(ti.value))[0]; if (r) { S.to = r; ti.value = r.name; } }
   S.find();
  };
 }
 S.routeTo = (pt) => {
  S.tab = 'conn'; S.to = pt; S.res = null;
  if (!S.from && MG.app.me) S.from = {name: 'Moje poloha', lat: MG.app.me.lat, lon: MG.app.me.lon, me: true};
  if (MG.mode3d) MG.m3d.close();
  if (MG.ui.cur !== 'sh-search') MG.ui.open('sh-search', {tall: true});
  S.render();
  if (S.from && S.to) S.find(); else setTimeout(() => { const f = $('c-from'); if (f) f.focus(); }, 250);
 };
 S.find = async (tOverride) => {
  if (!S.from || !S.to) { const st = $('c-st'); if (st) st.textContent = 'Vyber, odkud a kam.'; return; }
  const ymd = S.ymd || MG.pragueParts(MG.now()).ymd, t = tOverride != null ? tOverride : S.t != null ? S.t : Math.ceil(MG.nowMin());
  $('c-st').innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>Hledám spojení…';
  $('c-res').innerHTML = '';
  await MG.sleep(30);
  try {
   const r = await MG.raptor.search(S.from, S.to, ymd, t, {count: 6});
   S.res = r; S.sel = 0; S.qymd = ymd; S.qt = t;
   if (r.err) { $('c-st').textContent = r.err; return; }
   $('c-st').textContent = r.results.length || r.walkOnly ? '' : 'Spojení nenalezeno. Zkus jiný čas nebo bližší zastávku.';
   renderResults(); if (r.results.length) showConn(0);
  } catch (e) { MG.err('raptor', e); $('c-st').textContent = 'Při hledání nastala chyba.'; }
 };
 function legTimes(l) { const st0 = l.p.T[3 * l.j] + (l.day - S.res.qday) * 1440; return {dep: st0 + l.p.dep[l.prof][l.bi], arr: st0 + l.p.arr[l.prof][l.ai]}; }
 const fmtDur = m => { m = Math.round(m); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + MG.pad(m % 60) + ' min'; };
 const czStops = n => n + (n === 1 ? ' zastávka' : n < 5 ? ' zastávky' : ' zastávek');
 const legChip = l => { const L_ = D.ln.get(l.p.l); return D.badge(L_, {text: L_.k === 'vlak' ? D.trainLabel(L_, l.p.n && l.p.n[l.j]) : null}); };
 function connTimes(c) { const rides = c.legs.filter(l => !l.walk); const t1 = legTimes(rides[0]); return {dep: t1.dep - (c.acc[1] || 0), arr: c.arr, rides}; }
 function renderResults() {
  const box = $('c-res'); if (!box || !S.res) return;
  const r = S.res; let h = '';
  if (r.walkOnly) h += '<div class="var41 t41 walk"><span class="t41-tm"><i class="fa-solid fa-person-walking"></i></span><span class="var41-lines">Pěšky ' + MG.fmtDist(r.walkOnly.dist) + '</span><span class="t41-dur"><b>' + r.walkOnly.dur + ' min</b><small>bez MHD</small></span></div>';
  if (r.results.length) {
   h += '<div class="vars41 t41s"><button type="button" class="less41-conn" id="c-less"><i class="fa-solid fa-angles-up"></i> Dřívější spoje</button>';
   r.results.forEach((c, i) => {
    const {dep, arr, rides} = connTimes(c);
    h += '<button type="button" class="var41 t41' + (i === S.sel ? ' active' : '') + '" data-c="' + i + '"><span class="t41-tm"><b>' + MG.hm(dep) + '</b><i>–</i><span>' + MG.hm(arr) + '</span></span><span class="var41-lines">' + rides.map(legChip).join('<i class="fa-solid fa-chevron-right"></i>') + '</span><span class="t41-dur"><b>' + fmtDur(arr - dep) + '</b><small>' + (rides.length - 1 ? (rides.length - 1) + '× přestup' : 'přímo') + '</small></span></button>';
   });
   h += '<button type="button" class="more41-conn" id="c-more"><i class="fa-solid fa-angles-down"></i> Další spoje</button></div>';
   h += plan(r.results[S.sel]);
  }
  box.innerHTML = h;
  MG.qsa('.var41[data-c]', box).forEach(x => x.onclick = () => { S.sel = +x.dataset.c; renderResults(); showConn(S.sel); });
  if ($('c-less')) $('c-less').onclick = () => { const d0 = connTimes(r.results[0]).dep; S.find(Math.max(0, d0 - 75)); };
  if ($('c-more')) $('c-more').onclick = () => { const dl = connTimes(r.results[r.results.length - 1]).dep; S.find(dl + 1); };
  MG.qsa('[data-alarm]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); const [key, k] = b.dataset.alarm.split('|'); MG.alarm.set(key, +k); b.classList.add('on'); });
  MG.qsa('[data-walkto]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); const [ll, nm] = b.dataset.walkto.split('|'); const [la, lo] = ll.split(',').map(Number); MG.walk.to({name: nm, lat: la, lon: lo}); });
  MG.qsa('[data-depst]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); MG.dep.show(+b.dataset.depst); });
 }
 function plan(c) {
  const nm = i => D.stName(S.res.n.stArr[i]);
  const {dep, arr, rides} = connTimes(c);
  let h = '<div class="plan41"><div class="plan41-head"><span>' + MG.h(S.from.name) + '</span><i class="fa-solid fa-arrow-right"></i><span>' + MG.h(S.to.name) + '</span><em>' + MG.hm(dep) + ' – ' + MG.hm(arr) + ' · ' + fmtDur(arr - dep) + '</em></div>';
  const firstRide = rides[0];
  const walkIn = c.acc[1] > 0 ? c.acc[1] : (c.legs[0].walk ? c.legs[0].dur : 0);
  if (walkIn > 0) { const pb = D.pl.get(firstRide.p.s[firstRide.bi]); h += '<div class="step41 walk"><div class="step41-rail"></div><div class="step41-body"><i class="fa-solid fa-person-walking"></i> Pěšky ' + walkIn + ' min na zastávku ' + MG.h(D.stName(pb.st)) + ' <button type="button" class="step41-dep" data-walkto="' + pb.lat + ',' + pb.lon + '|' + MG.h(D.stName(pb.st)) + '"><i class="fa-solid fa-diamond-turn-right"></i> navigovat</button></div></div>'; }
  let prev = null;
  for (const l of c.legs) {
   if (l.walk) { if (l.from >= 0 && l.dur > 0) h += '<div class="step41 xfer"><div class="step41-rail"></div><div class="step41-body"><i class="fa-solid fa-person-walking"></i> Přestup pěšky ' + l.dur + ' min · ' + MG.h(nm(l.from)) + ' → ' + MG.h(nm(l.to)) + ' · ' + MG.fmtDist(l.dist) + '</div></div>'; continue; }
   const L_ = D.ln.get(l.p.l), t = legTimes(l), pb = D.pl.get(l.p.s[l.bi]), pa = D.pl.get(l.p.s[l.ai]);
   if (prev) { const wait = Math.round(t.dep - legTimes(prev).arr); h += '<div class="step41 xfer"><div class="step41-rail"></div><div class="step41-body"><i class="fa-solid fa-arrow-right-arrow-left"></i> Přestup – ' + MG.h(D.stName(pb.st)) + (wait > 0 ? ' · čekání ' + wait + ' min' : '') + '</div></div>'; }
   const mids = l.p.s.slice(l.bi + 1, l.ai).map(pg => { const pl = D.pl.get(pg); return pl ? D.stName(pl.st) : ''; });
   h += '<div class="step41 ride" style="--lc:' + L_.c + '"><div class="step41-rail"></div><div class="step41-body"><div class="step41-top">' + legChip(l) + '<span class="step41-dir">směr ' + MG.h(D.headsign(l.p, l.j)) + '</span></div>' +
    '<div class="step41-stop"><span class="t41">' + MG.hm2(t.dep) + '</span><strong>' + MG.h(D.stName(pb.st)) + '</strong>' + (pb.lab ? '<span class="pl41">' + MG.h(pb.lab) + '</span>' : '') + '<button type="button" class="step41-dep" data-depst="' + pb.st + '"><i class="fa-regular fa-clock"></i> odjezdy</button></div>' +
    (mids.length ? '<details class="step41-mid"><summary>' + czStops(l.ai - l.bi) + '</summary>' + mids.map(x => '<div>' + MG.h(x) + '</div>').join('') + '</details>' : '<div class="step41-mid plain">' + czStops(l.ai - l.bi) + '</div>') +
    '<div class="step41-stop"><span class="t41">' + MG.hm2(t.arr) + '</span><strong>' + MG.h(D.stName(pa.st)) + '</strong><button type="button" class="step41-alight" data-alarm="' + l.p.i + ':' + l.j + ':' + l.day + '|' + l.ai + '" title="Upozornit, až se budu blížit k výstupu"><i class="fa-solid fa-bell"></i> Upozornit na výstup</button></div></div></div>';
   prev = l;
  }
  if (c.egress > 0) h += '<div class="step41 walk"><div class="step41-rail"></div><div class="step41-body"><i class="fa-solid fa-flag-checkered"></i> Pěšky ' + c.egress + ' min do cíle ' + MG.h(S.to.name) + '</div></div>';
  h += '<div class="plan41-note">Podle jízdního řádu CIS JŘ' + (MG.live.on ? ', zpoždění vozidel vidíš na mapě' : '') + '.</div><a class="idos41" target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/spojeni/?f=' + encodeURIComponent(S.from.st != null ? D.stName(S.from.st) : S.from.name) + '&t=' + encodeURIComponent(S.to.st != null ? D.stName(S.to.st) : S.to.name) + '"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ověřit v IDOS</a></div>';
  return h;
 }
 function showConn(i) {
  const c = S.res.results[i]; if (!c) return;
  const g = MG.map.gSel; g.clearLayers(); MG.map.dimNet(true); MG.map.selKind = 'conn';
  const all = [];
  const nmll = si => { const s = D.st.get(S.res.n.stArr[si]); return [s.lat, s.lon]; };
  const firstRide = c.legs.find(l => !l.walk);
  const a0 = nmll(c.legs[0].walk ? c.legs[0].to : firstRide.from);
  const walkLine = (a, b) => L.polyline([a, b], {renderer: MG.map.rSel, color: '#2F6F4E', weight: 4, dashArray: '2 8', lineCap: 'round'}).addTo(g);
  walkLine([S.from.lat, S.from.lon], a0);
  for (const l of c.legs) {
   if (l.walk) { if (l.from >= 0) walkLine(nmll(l.from), nmll(l.to)); continue; }
   const L_ = D.ln.get(l.p.l), geo = D.geo3(l.p), pts = geo.pts.slice(geo.x[l.bi], geo.x[l.ai] + 1);
   all.push(...pts);
   L.polyline(pts, {renderer: MG.map.rSel, color: '#fff', weight: 10, opacity: .95}).addTo(g);
   L.polyline(pts, {renderer: MG.map.rSel, color: L_.c, weight: 6}).addTo(g);
   for (const k of [l.bi, l.ai]) { const pl = D.pl.get(l.p.s[k]); L.circleMarker([pl.lat, pl.lon], {renderer: MG.map.rSel, radius: 6, color: L_.c, weight: 3, fillColor: '#fff', fillOpacity: 1}).bindTooltip(MG.h(D.stName(pl.st)), {className: 'stop-tip'}).addTo(g); }
  }
  const last = nmll(c.end); walkLine(last, [S.to.lat, S.to.lon]);
  for (const [p, t] of [[S.from, 'A'], [S.to, 'B']]) L.marker([p.lat, p.lon], {icon: L.divIcon({className: 'rt41', html: '<span class="rt41-pin' + (t === 'B' ? ' b' : '') + '">' + t + '</span>', iconSize: [24, 24], iconAnchor: [12, 12]}), pane: 'me'}).addTo(g);
  all.push([S.from.lat, S.from.lon], [S.to.lat, S.to.lon]);
  MG.map.fitPad(L.latLngBounds(all));
 }
 MG.on('sheetclose', id => { if (id === 'sh-search' && MG.map.selKind === 'conn') MG.map.clearSel(); if (id === 'sh-search' && S.pin) { MG.map.m.removeLayer(S.pin); S.pin = null; } });
})();
