/* ===== mhdGO – vyhledávání spojení (RAPTOR) ===== */
(function(){
 const D = MG.D;
 const R = MG.raptor = {};
 const WALK = 1.15 * 60 / 1.3; /* metrů za minutu (s ohledem na zákruty) ≈ 53 m/min */
 let net = null;
 function build() {
  /* index stanic a vzorů; staví se znovu po načtení dalšího balíčku */
  const stIdx = new Map(), stArr = [];
  const sid = g => { let i = stIdx.get(g); if (i == null) { i = stArr.length; stIdx.set(g, i); stArr.push(g); } return i; };
  const pats = [];
  for (const p of D.pt.values()) {
   const seq = new Int32Array(p.s.length);
   let ok = true;
   for (let k = 0; k < p.s.length; k++) { const pl = D.pl.get(p.s[k]); if (!pl) { ok = false; break; } seq[k] = sid(pl.st); }
   if (!ok) continue;
   /* maximální odjezdový posun na každé zastávce (pro hledání spoje) */
   const mx = new Int16Array(p.s.length); for (const dp of p.dep) for (let k = 0; k < dp.length; k++) if (dp[k] > mx[k]) mx[k] = dp[k];
   pats.push({p, seq, mx, train: (D.ln.get(p.l) || {}).k === 'vlak'});
  }
  const stPats = Array.from({length: stArr.length}, () => []);
  pats.forEach((q, qi) => { for (let k = 0; k < q.seq.length; k++) stPats[q.seq[k]].push(qi * 1024 + k); });
  /* pěší přesuny mezi blízkými stanicemi (mřížka ~400 m) */
  const lat = new Float64Array(stArr.length), lon = new Float64Array(stArr.length);
  stArr.forEach((g, i) => { const s = D.st.get(g); lat[i] = s.lat; lon[i] = s.lon; });
  const cell = new Map(), key = (a, b) => a + ':' + b, G = 0.004;
  for (let i = 0; i < stArr.length; i++) { const k = key(Math.floor(lat[i] / G), Math.floor(lon[i] / (G * 1.5))); (cell.get(k) || cell.set(k, []).get(k)).push(i); }
  const foot = Array.from({length: stArr.length}, () => []);
  for (let i = 0; i < stArr.length; i++) {
   const a = Math.floor(lat[i] / G), b = Math.floor(lon[i] / (G * 1.5));
   for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (const j of (cell.get(key(a + x, b + y)) || [])) {
    if (j === i) continue; const d = MG.dist(lat[i], lon[i], lat[j], lon[j]); if (d < 450) foot[i].push([j, Math.max(1, Math.ceil(d / WALK) + 1), d]);
   }
  }
  net = {stIdx, stArr, pats, stPats, foot, lat, lon, ver: D.pt.size};
  return net;
 }
 R.net = () => (net && net.ver === D.pt.size) ? net : build();
 R.nearStations = (lat, lon, maxD) => {
  const n = R.net(), out = [];
  for (let i = 0; i < n.stArr.length; i++) { const dy = Math.abs(n.lat[i] - lat) * 111000; if (dy > maxD) continue; const d = MG.dist(lat, lon, n.lat[i], n.lon[i]); if (d < maxD) out.push([i, d]); }
  out.sort((a, b) => a[1] - b[1]);
  return out.slice(0, 40);
 };
 /* jedno spuštění RAPTORu: vrací pareto-optimální spojení (počet přestupů × příjezd) */
 function run(n, src, dst, t0, qday, maxRounds) {
  const NS = n.stArr.length, INF = 1e9, K = maxRounds + 1;
  const tau = Array.from({length: K}, () => new Float64Array(NS).fill(INF));
  const best = new Float64Array(NS).fill(INF);
  const lab = Array.from({length: K}, () => new Array(NS));
  let marked = new Set();
  for (const [s, w] of src) { const t = t0 + w; if (t < tau[0][s]) { tau[0][s] = t; best[s] = t; lab[0][s] = {walk: true, from: -1, dist: w * WALK}; marked.add(s); } }
  const dstMap = new Map(dst.map(([s, w]) => [s, w]));
  const target = () => { let b = INF; for (const [s, w] of dstMap) if (best[s] + w < b) b = best[s] + w; return b; };
  /* pěšky z výchozích */
  for (let k = 1; k < K; k++) {
   const Q = new Map();
   for (const s of marked) for (const code of n.stPats[s]) { const qi = (code / 1024) | 0, pos = code % 1024; const cur = Q.get(qi); if (cur == null || pos < cur) Q.set(qi, pos); }
   const newMarked = new Set();
   const tgt = target();
   for (const [qi, pos0] of Q) {
    const q = n.pats[qi], p = q.p, seq = q.seq, T = p.T, nt = p.nt;
    let trip = null; /* {j, d, base, prof, boardPos, boardSt} */
    for (let i = pos0; i < seq.length; i++) {
     const s = seq[i];
     if (trip) {
      const at = trip.base + p.arr[trip.prof][i];
      if (D.canAlight(p, i) && at < Math.min(best[s], tgt)) {
       tau[k][s] = at; best[s] = at; lab[k][s] = {p, j: trip.j, day: trip.d, prof: trip.prof, bi: trip.bi, ai: i, from: trip.bs}; newMarked.add(s);
      }
     }
     const prev = tau[k - 1][s];
     if (prev < INF && D.canBoard(p, i)) {
      const lab0 = lab[k - 1][s];
      const chg = lab0 && lab0.p ? (q.train || (D.ln.get(lab0.p.l) || {}).k === 'vlak' ? 4 : 2) : 0;
      const ready = prev + chg;
      if (!trip || trip.base + p.dep[trip.prof][i] >= ready) {
       /* nejdřívější spoj s odjezdem >= ready */
       let bestTrip = trip, bestDep = trip ? trip.base + p.dep[trip.prof][i] : INF;
       for (let dd = -1; dd <= 1; dd++) {
        const d = qday + dd, off = dd * 1440, lim = ready - off - q.mx[i];
        let lo = 0, hi = nt; while (lo < hi) { const m = (lo + hi) >> 1; if (T[3 * m] < lim) lo = m + 1; else hi = m; }
        for (let j = lo; j < nt; j++) {
         const st = T[3 * j], prof = T[3 * j + 1]; const dep = st + off + p.dep[prof][i];
         if (st + off > bestDep) break;
         if (dep < ready || dep >= bestDep) continue;
         if (!D.svcOn(T[3 * j + 2], d)) continue;
         bestDep = dep; bestTrip = {j, d, base: st + off, prof, bi: i, bs: s};
        }
       }
       if (bestTrip && bestTrip !== trip) trip = bestTrip;
      }
     }
    }
   }
   /* pěší přesuny */
   for (const s of [...newMarked]) {
    for (const [s2, w, dist] of n.foot[s]) {
     const t = tau[k][s] + w;
     if (t < Math.min(best[s2], target())) { tau[k][s2] = t; best[s2] = t; lab[k][s2] = {walk: true, from: s, dist}; newMarked.add(s2); }
    }
   }
   marked = newMarked;
   if (!marked.size) break;
  }
  /* sestavení cest */
  const res = [];
  let lastArr = INF;
  for (let k = 1; k < K; k++) {
   let bs = -1, ba = INF;
   for (const [s, w] of dstMap) { if (tau[k][s] + w < ba) { ba = tau[k][s] + w; bs = s; } }
   if (bs < 0 || ba >= lastArr - .01) continue;
   const legs = []; let s = bs, kk = k, guard = 0;
   while (s >= 0 && guard++ < 40) {
    let L0 = lab[kk][s];
    while (!L0 && kk > 0) { kk--; L0 = lab[kk][s]; }
    if (!L0) break;
    if (L0.walk) { legs.unshift({walk: true, from: L0.from, to: s, dist: L0.dist, dur: Math.max(1, Math.round(L0.dist / WALK))}); if (L0.from < 0) break; s = L0.from; continue; }
    legs.unshift({p: L0.p, j: L0.j, day: L0.day, prof: L0.prof, bi: L0.bi, ai: L0.ai, from: L0.from, to: s}); s = L0.from; kk--;
   }
   const eg = dstMap.get(bs) || 0;
   res.push({legs, arr: ba, egress: eg, end: bs, rounds: k});
   lastArr = ba;
  }
  return res;
 }
 /* veřejné API: hledání více spojení od času t */
 R.search = async (from, to, ymd, t, opt) => {
  opt = opt || {};
  const oks = new Set([D.okresAt(from.lat, from.lon), D.okresAt(to.lat, to.lon)].filter(x => x >= 0));
  await Promise.all([...oks].map(o => D.loadOkres(o).catch(() => {})).concat([D.loadDalkove().catch(() => {})]));
  const n = R.net();
  const qday = D.dayIdx(ymd);
  const acc = (pt) => {
   const out = new Map();
   if (pt.st != null && n.stIdx.has(pt.st)) out.set(n.stIdx.get(pt.st), 0);
   for (const [s, d] of R.nearStations(pt.lat, pt.lon, pt.st != null ? 600 : 1300)) { const w = Math.ceil(d / WALK); if (!out.has(s) || out.get(s) > w) out.set(s, w); }
   return [...out];
  };
  const src = acc(from), dst = acc(to);
  if (!src.length || !dst.length) return {err: 'V okolí nejsou žádné zastávky.'};
  const direct = MG.dist(from.lat, from.lon, to.lat, to.lon);
  const results = []; let tt = t;
  for (let it = 0; it < (opt.count || 5) && results.length < (opt.count || 5); it++) {
   const r = run(n, src, dst, tt, qday, 6);
   if (!r.length) break;
   for (const c of r) {
    const firstRide = c.legs.find(l => !l.walk);
    if (!firstRide) continue;
    const dep = firstRide.p.T[3 * firstRide.j] + (firstRide.day - qday) * 1440 + firstRide.p.dep[firstRide.prof][firstRide.bi];
    const firstWalk = c.legs[0].walk ? c.legs[0].dur : (src.find(x => x[0] === firstRide.from) || [0, 0])[1];
    c.dep = dep - (firstWalk || 0); c.rideDep = dep;
    c.acc = src.find(x => x[0] === (c.legs[0].walk ? c.legs[0].to : firstRide.from)) || [0, 0];
    const key = c.legs.filter(l => !l.walk).map(l => l.p.i + ':' + l.j).join('|');
    if (!results.some(x => x.key === key)) { c.key = key; results.push(c); }
   }
   const firsts = r.map(c => c.rideDep).filter(isFinite);
   if (!firsts.length) break;
   tt = Math.min(...firsts) + 1 - 2;
  }
  results.sort((a, b) => a.arr - b.arr || a.rounds - b.rounds);
  const walkOnly = direct < 1500 ? {walk: true, dur: Math.round(direct / WALK), dist: direct} : null;
  return {results: results.slice(0, opt.count || 5), n, src, dst, walkOnly, qday};
 };
})();
