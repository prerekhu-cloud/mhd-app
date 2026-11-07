/* ===== mhdGO – Dopravní síť okresu ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const N = MG.net = {open: null, dir: 0, pat: null, q: ''};
 const numKey = s => { const m = /^(\D*)(\d+)(.*)$/.exec(s || ''); return m ? [m[1], +m[2], m[3]] : [s || '', 1e9, '']; };
 const cmpLine = (a, b) => { const x = numKey(D.lineText(a)), y = numKey(D.lineText(b)); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || (x[2] < y[2] ? -1 : 1); };
 function terminals(L_) {
  const [a, b] = D.mainPats(L_); const p = a || b; if (!p) return L_.ln || '';
  const city = L_.city || '';
  return D.shortName(D.plName(p.s[0]), city) + ' → ' + D.shortName(D.plName(p.s[p.s.length - 1]), city);
 }
 N.render = () => {
  const el = $('sh-net'), oi = MG.app.cur;
  const ok = oi >= 0 ? D.okresy[oi] : null;
  const ids = (oi >= 0 && D.okLines.get(oi)) || [];
  const lines = ids.map(i => D.ln.get(i)).filter(Boolean);
  const q = MG.fold(N.q);
  const groups = new Map();
  for (const L_ of lines) {
   if (q && !MG.fold(D.lineText(L_) + ' ' + (L_.ln || '') + ' ' + (L_.city || '')).includes(q)) continue;
   (groups.get(L_.k) || groups.set(L_.k, []).get(L_.k)).push(L_);
  }
  let html = U_head(ok, lines.length);
  html += '<div class="sh-body"><div class="field" style="margin:0 2px 8px"><i class="fa-solid fa-magnifying-glass"></i><input id="net-q" placeholder="Číslo nebo název linky…" value="' + MG.h(N.q) + '" autocomplete="off"></div>';
  if (!lines.length) html += '<div class="empty"><i class="fa-solid fa-bus"></i>' + (D.loaded.has(oi) ? 'V okrese nejsou žádné linky.' : 'Načítám síť okresu…') + '</div>';
  for (const k of D.kindOrder) {
   const g = groups.get(k); if (!g) continue;
   const cc = new Map(); for (const x of g) cc.set(x.city || '', (cc.get(x.city || '') || 0) + 1);
   const seat = ok ? ok.seat : '';
   const cRank = c => (c === seat ? -1e6 : 0) - (cc.get(c || '') || 0);
   g.sort(k === 'mhd' || k === 'trol' || k === 'tram' ? (a, b) => cRank(a.city) - cRank(b.city) || (a.city || '').localeCompare(b.city || '', 'cs') || cmpLine(a, b) : cmpLine);
   html += '<div class="sec-t"><i class="fa-solid ' + D.KIND[k][0] + '"></i>' + D.KIND[k][1] + ' <b>· ' + g.length + ' ' + (g.length === 1 ? 'linka' : g.length < 5 ? 'linky' : 'linek') + '</b></div>';
   let city = null;
   for (const L_ of g) {
    if ((k === 'mhd' || k === 'trol' || k === 'tram') && L_.city !== city && new Set(g.map(x => x.city)).size > 1) { city = L_.city; html += '<div class="sec-t" style="margin-top:8px;letter-spacing:.06em">MHD ' + MG.h(city) + '</div>'; }
    html += '<div class="ln-row' + (N.open === L_.i ? ' open' : '') + '" data-l="' + L_.i + '"><div class="ln-h"><span class="ln-ic"><i class="fa-solid ' + D.KIND[L_.k][0] + '"></i></span>' + D.badge(L_, {size: 'big'}) + '<div class="tx">' + MG.h(terminals(L_)) + (L_.k === 'vlak' || L_.k === 'regio' || L_.k === 'mezi' ? '<small>' + MG.h(L_.ln || '') + '</small>' : '') + '</div><i class="fa-solid fa-chevron-down chev"></i></div>' + (N.open === L_.i ? expand(L_) : '') + '</div>';
   }
  }
  html += '<div class="status" style="text-align:center;margin-top:10px">Jízdní řády CIS JŘ · platnost od ' + MG.h(D.core.d0) + '</div></div>';
  el.innerHTML = html;
  bind(el);
 };
 function U_head(ok, n) {
  return MG.ui.head({icon: 'fa-solid fa-bus', eb: 'mhd<b>GO</b>', title: 'Dopravní síť', sub: ok ? 'Okres ' + MG.h(ok.name) + ' · ' + n + ' linek' : ''});
 }
 function expand(L_) {
  const pats = D.mainPats(L_);
  let p = (N.pat && N.pat.l === L_.i) ? N.pat : (pats[N.dir] || pats[0] || pats[1]);
  if (!p) return '';
  N.pat = p;
  const u = D.ttUrl(L_), city = L_.city || '';
  let h = '<div class="ln-x">';
  if (u) h += '<a class="jr-link" href="' + MG.h(u.href) + '" target="_blank" rel="noopener"><i class="fa-regular fa-calendar-days"></i><span><em>Jízdní řád ' + (L_.k === 'vlak' ? 'vlaku' : 'linky') + ' <b>' + MG.h(D.lineText(L_)) + '</b></em><small>' + MG.h(u.src) + '</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>';
  const variants = L_.pats.filter(x => (x.d ? 1 : 0) === (p.d ? 1 : 0)).sort((a, b) => b.nt - a.nt);
  h += '<div class="row" style="justify-content:space-between;margin:4px 0 6px"><div style="font:700 12px Outfit,sans-serif;color:var(--mut)">' + (L_.a && L_.a[0] ? MG.h(D.agency(L_.a[0])) : '') + '</div>' + (pats[0] && pats[1] ? '<button class="dir-btn" data-flip><i class="fa-solid fa-right-left"></i>Otočit směr</button>' : '') + '</div>';
  if (variants.length > 1) h += '<div class="chips" style="margin-bottom:4px">' + variants.slice(0, 8).map((v, i) => '<button class="chip' + (v === p ? ' on' : '') + '" data-var="' + v.i + '">' + (i === 0 ? 'Hlavní trasa' : 'Varianta ' + i) + ' · ' + v.nt + '×</button>').join('') + '</div>';
  const dep = p.dep[0];
  h += '<div class="st-list" style="--lc:' + L_.c + '">';
  p.s.forEach((pg, k) => {
   const pl = D.pl.get(pg); if (!pl) return; const s = D.st.get(pl.st);
   const others = s ? [...s.lines].filter(x => x !== L_.i).map(x => D.ln.get(x)).filter(Boolean).filter(x => x.k !== 'vlak' || L_.k === 'vlak' || true) : [];
   others.sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || cmpLine(a, b));
   const chips = others.slice(0, 5).map(x => D.badge(x)).join('') + (others.length > 5 ? '<span class="ln" style="--lc:transparent;--lt:var(--faint);box-shadow:none">+' + (others.length - 5) + '</span>' : '');
   h += '<div class="st-r' + (k === 0 || k === p.s.length - 1 ? ' term' : '') + '" data-st="' + pl.st + '" data-pl="' + pg + '"><i></i><span>' + MG.h(D.shortName(s ? s.name : '?', city)) + (D.isRequest(p, k) ? '<em class="rq" title="zastávka na znamení"> ✕</em>' : '') + '</span><em class="t">' + (k ? '+' + dep[k] : '') + '</em><div class="lns">' + chips + '</div></div>';
  });
  h += '</div></div>';
  return h;
 }
 function bind(el) {
  const qi = $('net-q');
  if (qi) qi.oninput = MG.debounce(() => { N.q = qi.value; const pos = qi.selectionStart; N.render(); const q2 = $('net-q'); q2.focus(); try { q2.setSelectionRange(pos, pos) } catch (_) {} }, 250);
  MG.qsa('.ln-h', el).forEach(h => h.onclick = () => {
   const li = +h.parentNode.dataset.l;
   if (N.open === li) { N.open = null; N.pat = null; MG.map.clearSel(); N.render(); return; }
   N.open = li; N.dir = 0; N.pat = null; N.render(); show(true);
   const row = MG.qs('.ln-row.open', el); if (row) row.scrollIntoView({block: 'start', behavior: 'smooth'});
  });
  const flip = MG.qs('[data-flip]', el);
  if (flip) flip.onclick = (e) => { e.stopPropagation(); N.dir = N.pat && N.pat.d ? 0 : 1; N.pat = null; N.render(); show(true); };
  MG.qsa('[data-var]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); N.pat = D.pt.get(+b.dataset.var); N.render(); show(true); });
  MG.qsa('.st-r', el).forEach(r => r.onclick = () => { const pl = D.pl.get(+r.dataset.pl); if (pl) MG.map.m.flyTo([pl.lat, pl.lon], Math.max(MG.map.m.getZoom(), 16), {duration: .6}); MG.dep.stopPopup(+r.dataset.st, +r.dataset.pl); });
 }
 function show(fit) { if (!N.pat) return; MG.veh.close && MG.veh.sel && MG.veh.close(); MG.map.showPattern(N.pat, {kind: 'line'}); if (fit) MG.map.fitPad(L.latLngBounds(D.geo3(N.pat).pts)); }
 N.openLine = async (li, opt) => {
  opt = opt || {};
  const L_ = D.ln.get(li); if (!L_) return;
  N.open = li; N.dir = 0; N.pat = opt.pattern != null ? D.pt.get(opt.pattern) : null; N.q = '';
  if (MG.mode3d) MG.m3d.close();
  N.render(); MG.ui.open('sh-net', {tall: false}); N.render(); show(true);
  setTimeout(() => { const row = MG.qs('#sh-net .ln-row.open'); if (row) row.scrollIntoView({block: 'start'}); }, 50);
 };
 MG.on('sheetclose', id => { if (id === 'sh-net' && MG.map.selKind === 'line') { MG.map.clearSel(); N.open = null; N.pat = null; } });
})();
