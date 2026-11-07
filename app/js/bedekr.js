/* ===== mhdGO – Bedekr: památky a zajímavosti ČR po krajích a okresech ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const B = MG.bedekr = {kraj: null, okres: null, det: null, data: null};
 const TYPEI = {'hrad': 'fa-chess-rook', 'zámek': 'fa-landmark', 'církevní': 'fa-church', 'muzeum': 'fa-building-columns', 'příroda': 'fa-mountain-sun', 'rozhledna': 'fa-tower-observation', 'zahrada': 'fa-tree', 'město': 'fa-city', 'památka': 'fa-monument'};
 const TYPEN = {'hrad': 'Hrad / pevnost', 'zámek': 'Zámek / palác', 'církevní': 'Církevní památka', 'muzeum': 'Muzeum / galerie', 'příroda': 'Příroda', 'rozhledna': 'Rozhledna / věž', 'zahrada': 'Zahrada / zoo / park', 'město': 'Město a jeho památky', 'památka': 'Kulturní památka'};
 const img = (f, w) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f) + '?width=' + (w || 640);
 B.open = async () => {
  const el = $('bedekr'); MG.ui.hideMore && MG.ui.hideMore(); MG.ui.open('bedekr', {tall: true});
  if (!B.data) {
   el.innerHTML = '<div class="bd-top">' + head() + '</div><div class="bd-body"><div class="empty"><span class="spin" style="display:inline-block"></span><br>Načítám bedekr…</div></div>';
   bindHead();
   try { const j = await MG.fetchJSON('bedekr.json'); B.data = j.places.map(p => ({q: p[0], name: p[1], desc: p[2], lat: p[3], lon: p[4], img: p[5], cat: p[6], art: p[7], type: p[8], ok: p[9], sc: p[10], fl: p[11] || ''})); }
   catch (e) { el.querySelector('.bd-body').innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>Bedekr se nepodařilo načíst.</div>'; return; }
  }
  B.det = null; render();
 };
 B.close = () => MG.ui.close('bedekr');
 function head() {
  return '<div class="sh-grab"></div><div class="bd-head"><div class="sh-ic">' + MG.mi('museum') + '</div><div class="sh-tt"><div class="sh-eb brand-eb">mhd<b>GO</b></div><div class="sh-title">Bedekr Česka</div><div class="sh-sub">Průvodce po památkách a zajímavostech' + (B.okres != null ? ' okresu ' + MG.h(D.okresy[B.okres].name) : B.kraj != null ? ' – ' + MG.h(D.kraje[B.kraj].name) : ' celé republiky') + '</div></div><button class="xbtn" id="bd-x"><i class="fa-solid fa-xmark"></i></button></div>' +
   '<div class="kraj-tabs"><button class="chip' + (B.kraj == null ? ' on' : '') + '" data-k="-1"><i class="fa-solid fa-earth-europe"></i>Celá ČR</button>' + D.kraje.map((k, i) => '<button class="chip' + (B.kraj === i ? ' on' : '') + '" data-k="' + i + '">' + MG.h(k.short) + '</button>').join('') + '</div>' +
   (B.kraj != null ? '<div class="kraj-tabs"><button class="chip' + (B.okres == null ? ' on' : '') + '" data-o="-1">Celý kraj</button>' + D.okresy.map((o, i) => o.kraj !== B.kraj ? '' : '<button class="chip' + (B.okres === i ? ' on' : '') + '" data-o="' + i + '">' + MG.h(o.name) + '</button>').join('') + '</div>' : '');
 }
 function bindHead() {
  $('bd-x').onclick = () => { if (B.det) { B.det = null; render(); } else B.close(); };
  MG.qsa('#bedekr [data-k]').forEach(b => b.onclick = () => { const v = +b.dataset.k; B.kraj = v < 0 ? null : v; B.okres = null; B.det = null; render(); });
  MG.qsa('#bedekr [data-o]').forEach(b => b.onclick = () => { const v = +b.dataset.o; B.okres = v < 0 ? null : v; B.det = null; render(); });
 }
 function render() {
  const el = $('bedekr');
  if (B.det) return detail(B.det);
  let list = B.data;
  let title = 'To nejlepší z Česka', sub = 'Výběr nejvýznamnějších památek a míst celé republiky';
  if (B.okres != null) { list = list.filter(p => p.ok === B.okres); title = 'Okres ' + D.okresy[B.okres].name; sub = list.length + ' míst – od slavných po méně známá'; }
  else if (B.kraj != null) { list = list.filter(p => D.okresy[p.ok] && D.okresy[p.ok].kraj === B.kraj); title = D.kraje[B.kraj].name; sub = 'To nejlepší v kraji · vyber okres pro další místa'; list = list.slice(0, 40); }
  else { const per = new Map(); list = list.filter(p => { const k = D.okresy[p.ok] ? D.okresy[p.ok].kraj : -1; const n = per.get(k) || 0; if (n >= 5) return false; per.set(k, n + 1); return true; }).slice(0, 48); }
  const hero = list[0];
  let h = '<div class="bd-top">' + head() + '</div><div class="bd-body sh-body">';
  h += '<div class="bd-sec"><b>' + MG.h(title) + '</b><small>' + MG.h(sub) + '</small></div>';
  h += '<div class="bd-grid">' + list.map(card).join('') + '</div>';
  if (!list.length) h += '<div class="empty"><i class="fa-regular fa-image"></i>Pro tento výběr zatím nemáme místa.</div>';
  h += '<div class="bd-credit">Data: Wikidata a Wikipedie (CC BY-SA), fotografie: Wikimedia Commons – autoři a licence jsou uvedeni na stránce každé fotografie.</div></div>';
  el.innerHTML = h; bindHead();
  MG.qsa('#bedekr .bd-card').forEach(c => c.onclick = () => { B.det = B.data.find(p => p.q === c.dataset.q); render(); $('bedekr').querySelector('.bd-body').scrollTop = 0; });
 }
 function card(p) {
  const ok = D.okresy[p.ok];
  return '<div class="bd-card" data-q="' + p.q + '"><div class="bd-ph" style="background-image:url(\'' + img(p.img, 640).replace(/'/g, '%27') + '\')"><span class="bd-type">' + MG.h(TYPEN[p.type] || 'Památka') + '</span><div class="bd-badges">' + (p.fl.includes('U') ? '<span class="bd-badge u">UNESCO</span>' : '') + (p.fl.includes('N') ? '<span class="bd-badge n">NKP</span>' : '') + '</div></div><div class="bd-ci"><b>' + MG.h(p.name) + '</b><small>' + MG.h(p.desc ? p.desc.charAt(0).toUpperCase() + p.desc.slice(1) : '') + (ok ? ' · okres ' + MG.h(ok.name) : '') + '</small><span class="bd-more">Zobrazit více <i class="fa-solid fa-arrow-right"></i></span></div></div>';
 }
 async function detail(p) {
  const el = $('bedekr'), ok = D.okresy[p.ok], kr = ok ? D.kraje[ok.kraj] : null;
  let h = '<div class="bd-top">' + head() + '</div><div class="bd-body sh-body"><div class="bd-det"><button class="chip" id="bd-back"><i class="fa-solid fa-arrow-left"></i>Zpět</button><h1>' + MG.h(p.name) + '</h1>' +
   '<div class="bd-dhero"><img src="' + img(p.img, 1400) + '" alt="' + MG.h(p.name) + '"></div>' +
   '<div class="row" style="flex-wrap:wrap;margin-bottom:12px"><button class="btn sm" id="bd-go"><i class="fa-solid fa-route"></i>Jak se tam dostanu</button><button class="btn sec sm" id="bd-map"><i class="fa-solid fa-map-location-dot"></i>Na mapě</button><button class="btn sec sm" id="bd-dep"><i class="fa-regular fa-clock"></i>Nejbližší zastávka</button>' + (p.art ? '<a class="btn sec sm" target="_blank" rel="noopener" href="https://cs.wikipedia.org/wiki/' + encodeURIComponent(p.art) + '"><i class="fa-brands fa-wikipedia-w"></i>Wikipedie</a>' : '') + '</div>' +
   '<div class="bd-text" id="bd-text">' + MG.h(p.desc ? p.desc.charAt(0).toUpperCase() + p.desc.slice(1) + '.' : '') + (p.art ? ' <span class="spin" style="display:inline-block;vertical-align:-2px"></span>' : '') + '</div>' +
   '<div class="bd-info"><div><small>Lokalita</small>' + MG.h(ok ? 'okres ' + ok.name : '') + (kr ? ', ' + MG.h(kr.name) : '') + '</div><div><small>Typ</small>' + MG.h(TYPEN[p.type] || p.type) + '</div><div><small>Ochrana</small>' + (p.fl.includes('U') ? 'Světové dědictví UNESCO' : p.fl.includes('N') ? 'Národní kulturní památka' : 'Kulturní a přírodní dědictví') + '</div><div><small>Souřadnice</small>' + p.lat.toFixed(4) + ' N, ' + p.lon.toFixed(4) + ' E</div></div>' +
   '<div class="bd-trivia" id="bd-trivia" hidden></div>' +
   '<h2 style="font:800 20px Outfit,sans-serif;margin:22px 0 4px"><i class="fa-solid fa-images" style="color:var(--acc)"></i> Fotogalerie</h2><div class="bd-gal" id="bd-gal"><div class="status">Načítám fotografie…</div></div>' +
   '<div class="bd-credit">Text: Wikipedie (CC BY-SA 4.0). Fotografie: Wikimedia Commons – klepnutím otevřeš stránku souboru s autorem a licencí.</div></div></div>';
  el.innerHTML = h; bindHead();
  $('bd-back').onclick = () => { B.det = null; render(); };
  $('bd-go').onclick = () => { B.close(); MG.search.routeTo({name: p.name, lat: p.lat, lon: p.lon}); };
  $('bd-map').onclick = () => { B.close(); if (MG.mode3d) MG.m3d.close(); MG.map.m.flyTo([p.lat, p.lon], 15, {duration: 1}); MG.search.place && setTimeout(() => MG.search.place({name: p.name, lat: p.lat, lon: p.lon}), 50); };
  $('bd-dep').onclick = async () => { const idx = await D.loadIdx(); let best = null, bd = 1e12; for (const s of idx) { const d = MG.dist(p.lat, p.lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } } B.close(); if (best) MG.dep.show(best.g, best.ok); };
  if (p.art) {
   try {
    const r = await fetch('https://cs.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(p.art));
    const j = await r.json();
    if (B.det === p && j.extract) {
     const sents = j.extract.split(/(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/);
     $('bd-text').innerHTML = MG.h(sents.slice(0, Math.max(3, sents.length - 1)).join(' '));
     if (sents.length > 3) { const tv = $('bd-trivia'); tv.hidden = false; tv.innerHTML = '<b><i class="fa-solid fa-circle-info"></i> Zajímavost</b><br>' + MG.h(sents[sents.length - 1]); }
    }
   } catch (_) { const t = $('bd-text'); if (t) t.querySelector('.spin')?.remove(); }
  }
  try {
   let files = [];
   if (p.cat) {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmtype=file&gcmlimit=16&gcmtitle=' + encodeURIComponent('Category:' + p.cat) + '&prop=imageinfo&iiprop=url&iiurlwidth=420';
    const j = await (await fetch(u)).json();
    files = Object.values((j.query && j.query.pages) || {}).filter(x => x.imageinfo && /\.(jpe?g|png|webp)$/i.test(x.title)).map(x => ({t: x.title, th: x.imageinfo[0].thumburl, url: x.imageinfo[0].descriptionurl}));
   }
   if (!files.length) files = [{t: p.img, th: img(p.img, 420), url: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(p.img)}];
   if (B.det === p) $('bd-gal').innerHTML = files.slice(0, 12).map(f => '<a href="' + MG.h(f.url) + '" target="_blank" rel="noopener" style="background-image:url(\'' + MG.h(f.th).replace(/'/g, '%27') + '\')" title="' + MG.h(f.t.replace(/^File:/, '')) + '"></a>').join('');
  } catch (_) { const g = $('bd-gal'); if (g) g.innerHTML = '<div class="status">Galerii se nepodařilo načíst.</div>'; }
 }
})();
