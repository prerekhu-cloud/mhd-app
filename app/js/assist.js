/* ===== mhdGO – sdílené jádro pro velkou aplikaci i verzi bez mapy =====
 Hledání zastávek a adres, živé zpoždění spojů (odjezdy i spojení), plánování, pěší trasy, počasí, Moje místa.
 Hostitel (aplikace) nastaví C.me() – poloha uživatele, C.locate() – zjištění polohy a C.ctx() – co má otevřené. */
(function(){
 const D = MG.D, LV = MG.live;
 const C = MG.core = {me: () => null, locate: async () => null, ctx: () => ({})};
 C.clk = () => { const P = MG.pragueParts(MG.now()); return {P, ymd: P.ymd, day: D.dayIdx(P.ymd), m: P.h * 60 + P.mi + P.s / 60, s: (P.h * 60 + P.mi) * 60 + P.s}; };
 C.fmtDur = m => { m = Math.round(m); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };
 C.walkMin = d => Math.max(1, Math.round(d * 1.25 / 75));
 C.mePoint = async () => { const me = C.me() || await C.locate(); return me ? {kind: 'me', name: 'Moje poloha', lat: me.lat, lon: me.lon} : null; };
 C.refPt = () => { const m = C.me(); if (m) return m; const c = C.ctx().center; return c || {lat: 49.8, lon: 15.5}; };

 /* ---------- Moje místa (sdílená s mapovou verzí: klíč favs) ---------- */
 C.FAV_IC = {'Domů': 'fa-house', 'Práce': 'fa-briefcase', 'Škola': 'fa-graduation-cap'};
 C.favs = () => MG.store.get('favs', []) || [];
 C.saveFavs = F => { MG.store.set('favs', F); MG.emit('favs'); };
 C.addFav = (pt, label) => {
  const F = C.favs(); label = (label || pt.name || 'Místo').trim();
  const o = {label, name: pt.name, lat: +(+pt.lat).toFixed(6), lon: +(+pt.lon).toFixed(6), icon: C.FAV_IC[label] || pt.icon || 'fa-star'};
  if (pt.st != null) o.st = pt.st;
  const i = F.findIndex(f => f.label === label); if (i >= 0) F[i] = o; else F.push(o);
  C.saveFavs(F); MG.toast('Uloženo do Mých míst: ' + label);
 };

 /* ---------- zastávky a adresy ---------- */
 C.findStops = async (q, n) => {
  const idx = await D.loadIdx(); const f = MG.fold(q); if (!f) return [];
  const words = f.split(' '), ref = C.refPt(), out = [];
  for (const s of idx) {
   let sc = 0; const last = s.f.split(' ').slice(-words.length).join(' ');
   if (s.f === f || last === f) sc = 7; else if (s.f.startsWith(f)) sc = 6; else if (s.f.includes(' ' + f)) sc = 4; else if (words.every(w => s.f.includes(w))) sc = 2; else continue;
   if (s.m & 1) sc += .5; if (s.m & 6) sc += .4;
   out.push([sc - MG.dist(ref.lat, ref.lon, s.lat, s.lon) / 120000, s]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, n || 8).map(x => x[1]);
 };
 C.geocode = async (q, n) => {
  try {
   const ref = C.refPt();
   const r = await fetch(MG.cfg.PHOTON + '?q=' + encodeURIComponent(q) + '&limit=' + (n || 5) + '&lang=de&lat=' + ref.lat.toFixed(4) + '&lon=' + ref.lon.toFixed(4) + '&bbox=12.09,48.55,18.86,51.06');
   const j = await r.json();
   return (j.features || []).map(f => { const p = f.properties || {}; const street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : ''; const name = p.name || street || p.city || ''; return {kind: 'addr', addr: true, name, sub: [p.name && street ? street : '', p.district || '', p.city || p.town || p.village || ''].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && x !== name).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0]}; }).filter(x => x.name);
  } catch (_) { return []; }
 };
 C.nearestStops = async (lat, lon, n, maxD) => {
  const idx = await D.loadIdx(); const out = [];
  for (const s of idx) { if (Math.abs(s.lat - lat) > .03) continue; const d = MG.dist(lat, lon, s.lat, s.lon); if (d < (maxD || 1500)) out.push([d, s]); }
  out.sort((a, b) => a[0] - b[0]); return out.slice(0, n || 6);
 };

 /* ---------- živé polohy: instance spojů, párování, zpoždění ---------- */
 C.mkInst = (p, j, day) => {
  const c = C.clk(), start = p.T[3 * j], prof = p.T[3 * j + 1], L_ = D.ln.get(p.l), n = p.dep[prof].length;
  const m = c.m + (c.day - day) * 1440, end = start + p.arr[prof][n - 1];
  const it = {key: p.i + ':' + j + ':' + day, p, j, day, prof, start, m, L: L_, spoj: p.c ? p.c[j] : 0, num: p.n ? p.n[j] : '', head: D.headsign(p, j), end};
  const pos = D.tripPos(p, prof, m - start); it.lat = pos.lat; it.lon = pos.lon;
  it.running = m >= start - 3 && m <= end + 25;
  return it;
 };
 C.liveOf = (insts) => {
  const out = new Map(); if (!LV.on) return out;
  /* mapová verze už má spárováno vše, co je na mapě */
  if (MG.veh && MG.veh.liveMap) for (const it of insts) { const v = MG.veh.liveMap.get(it.key); if (v) out.set(it.key, v); }
  const run = insts.filter(it => it.running && it.L && !out.has(it.key));
  for (const it of run) if (it.L.k === 'vlak' && it.num) { const t = LV.trains.get(String(it.num)); if (t) out.set(it.key, t); }
  const bus = run.filter(it => it.L.k !== 'vlak');
  if (bus.length) { try { const {res} = LV.matchBus(bus); for (const [k, v] of res) out.set(k, v); } catch (e) { MG.err('match', e); } }
  return out;
 };
 C.delayOf = (it, v) => {
  if (!v) return null;
  if (v.delay != null && isFinite(v.delay)) return {d: +v.delay, est: false, v};
  if (isFinite(v.lat)) { if (v._estK !== it.key || Date.now() - (v._estAt || 0) > 15000) { v._est = D.estDelay(it, v.lat, v.lon); v._estAt = Date.now(); v._estK = it.key; } if (v._est != null) return {d: v._est, est: true, v}; }
  return {d: null, est: false, v};
 };
 C.dlBadge = (x) => {
  if (!x) return '';
  if (x.d == null) return '<span class="dl on" title="vozidlo je na trase, zpoždění zdroj nehlásí"><i class="fa-solid fa-tower-broadcast"></i> živě</span>';
  const d = x.d, t = x.est ? '~' : '', ti = x.est ? ' title="odhad podle polohy vozidla"' : ' title="hlášené zpoždění (' + MG.h(x.v.src || 'živě') + ')"';
  if (d < -1.5) return '<span class="dl ok"' + ti + '>' + t + Math.round(d) + ' min</span>';
  return d <= .5 ? '<span class="dl ok"' + ti + '>' + t + 'včas</span>' : '<span class="dl ' + (d <= 3 ? 'mid' : 'bad') + '"' + ti + '>' + t + '+' + Math.round(d) + ' min</span>';
 };
 C.depItems = (g, opt) => {
  opt = opt || {}; const c = C.clk();
  const ymd = opt.ymd || c.ymd, from = opt.from != null ? opt.from : c.m, today = ymd === c.ymd;
  const deps = D.departures(g, {ymd, from: from - 1, horizon: opt.horizon || (opt.from == null ? 300 : 480), limit: opt.limit || 60, lines: opt.lines, platform: opt.platform});
  const insts = today ? deps.map(d => C.mkInst(d.p, d.j, d.day)) : [];
  const live = today ? C.liveOf(insts) : new Map();
  return deps.map((d, i) => { const it = insts[i]; const x = it ? C.delayOf(it, live.get(it.key)) : null; const dl = x && x.d > 0 ? x.d : 0; return {d, it, x, exp: d.t + dl, dl}; });
 };

 /* ---------- spojení ---------- */
 C.planTrip = async (from, to, ymd, t, count) => {
  const r = await MG.raptor.search(from, to, ymd, t, {count: count || 5});
  if (r.err) return r;
  r.ymd = ymd; r.t = t; r.from = from; r.to = to;
  return r;
 };
 C.legTimes = (res, l) => { const st0 = l.p.T[3 * l.j] + (l.day - res.qday) * 1440; return {dep: st0 + l.p.dep[l.prof][l.bi], arr: st0 + l.p.arr[l.prof][l.ai]}; };
 C.connTimes = (res, c) => { const rides = c.legs.filter(l => !l.walk); const t1 = C.legTimes(res, rides[0]); return {dep: t1.dep - (c.acc[1] || 0), arr: c.arr, rides}; };
 C.connLive = (res, c) => {
  const rides = c.legs.filter(l => !l.walk);
  const today = (res.ymd || C.clk().ymd) === C.clk().ymd;
  const insts = today ? rides.map(l => C.mkInst(l.p, l.j, l.day)) : [];
  const live = today ? C.liveOf(insts) : new Map();
  const out = rides.map((l, i) => { const it = insts[i]; return {l, t: C.legTimes(res, l), x: it ? C.delayOf(it, live.get(it.key)) : null}; });
  for (let i = 1; i < out.length; i++) {
   const a = out[i - 1], b = out[i];
   const da = a.x && a.x.d > 0 ? a.x.d : 0, db = b.x && b.x.d > 0 ? b.x.d : 0;
   const walk = c.legs.slice(c.legs.indexOf(a.l) + 1, c.legs.indexOf(b.l)).filter(l => l.walk).reduce((s, l) => s + l.dur, 0);
   const slack = (b.t.dep + db) - (a.t.arr + da) - walk;
   b.slack = slack; b.risk = da > 0 && slack < 1;
  }
  return out;
 };
 /* posun jedné jízdy na předchozí / další spoj mezi stejnými zastávkami (jako OpavaGO); ostatní jízdy zůstanou */
 C.shiftLeg = (res, c, li, dir) => {
  const l = c.legs[li]; if (!l || l.walk) return null;
  const n = res.n, bs = l.from, as = l.to, t0 = C.legTimes(res, l);
  const cand = [];
  for (const code of n.stPats[bs]) {
   const q = n.pats[(code / 1024) | 0], i = code % 1024, p = q.p;
   if (!D.canBoard(p, i)) continue;
   let k = -1; for (let x = i + 1; x < q.seq.length; x++) if (q.seq[x] === as && D.canAlight(p, x)) { k = x; break; }
   if (k < 0) continue;
   for (let dd = -1; dd <= 1; dd++) {
    const d = res.qday + dd;
    for (let j = 0; j < p.nt; j++) {
     const st = p.T[3 * j], prof = p.T[3 * j + 1];
     if (!D.svcOn(p.T[3 * j + 2], d)) continue;
     const dep = st + dd * 1440 + p.dep[prof][i], arr = st + dd * 1440 + p.arr[prof][k];
     cand.push({p, j, day: d, prof, bi: i, ai: k, dep, arr});
    }
   }
  }
  cand.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const pick = dir > 0 ? cand.find(x => x.dep > t0.dep + .01) : [...cand].reverse().find(x => x.dep < t0.dep - .01);
  if (!pick) return null;
  const legs = c.legs.map((x, i) => i === li ? Object.assign({}, x, {p: pick.p, j: pick.j, day: pick.day, prof: pick.prof, bi: pick.bi, ai: pick.ai}) : x);
  const nc = Object.assign({}, c, {legs, shifted: true});
  const rides = legs.filter(x => !x.walk), last = rides[rides.length - 1];
  nc.arr = C.legTimes(res, last).arr + (c.egress || 0);
  return nc;
 };
 /* návaznost přestupů po posunu: false = některý přestup nejde stihnout */
 C.connOk = (res, c) => {
  let prev = null, walk = 0;
  for (const l of c.legs) {
   if (l.walk) { if (prev) walk += l.dur || 0; continue; }
   const t = C.legTimes(res, l);
   if (prev && t.dep < C.legTimes(res, prev).arr + walk + 1 - .01) return false;
   prev = l; walk = 0;
  }
  return true;
 };

 /* ---------- pěší trasy (Valhalla nad OpenStreetMap – chodníky, přechody, schody) ---------- */
 const dec6 = (s) => { const out = []; let i = 0, la = 0, lo = 0; while (i < s.length) { for (let w = 0; w < 2; w++) { let sh = 0, r = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5 } while (b >= 32); const d = r & 1 ? ~(r >> 1) : r >> 1; if (w) lo += d; else la += d } out.push([la / 1e6, lo / 1e6]) } return out; };
 const walkCache = new Map();
 C.walkRoute = async (a, b) => {
  const key = [a.lat, a.lon, b.lat, b.lon].map(x => (+x).toFixed(5)).join(',');
  if (walkCache.has(key)) return walkCache.get(key);
  const q = {locations: [{lat: a.lat, lon: a.lon}, {lat: b.lat, lon: b.lon}], costing: 'pedestrian', directions_options: {language: 'cs-CZ', units: 'kilometers'}};
  const r = await fetch('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)));
  if (!r.ok) throw Error('HTTP ' + r.status);
  const j = await r.json(); const leg = j.trip.legs[0];
  const pts = dec6(leg.shape), cd = [0]; for (let i = 1; i < pts.length; i++) cd.push(cd[i - 1] + MG.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const out = {pts, cd, len: j.trip.summary.length * 1000, time: j.trip.summary.time / 60, man: leg.maneuvers.map(m => ({t: m.instruction, i: m.begin_shape_index, len: m.length * 1000, type: m.type}))};
  if (walkCache.size > 60) walkCache.clear();
  walkCache.set(key, out); return out;
 };

 /* ---------- počasí (Open-Meteo) ---------- */
 const WX = C.WX = {0: ['fa-sun', 'jasno', 'fa-moon'], 1: ['fa-cloud-sun', 'skoro jasno', 'fa-cloud-moon'], 2: ['fa-cloud-sun', 'polojasno', 'fa-cloud-moon'], 3: ['fa-cloud', 'zataženo'], 45: ['fa-smog', 'mlha'], 48: ['fa-smog', 'mlha s námrazou'], 51: ['fa-cloud-rain', 'slabé mrholení'], 53: ['fa-cloud-rain', 'mrholení'], 55: ['fa-cloud-rain', 'silné mrholení'], 56: ['fa-icicles', 'mrznoucí mrholení'], 57: ['fa-icicles', 'mrznoucí mrholení'], 61: ['fa-cloud-rain', 'slabý déšť'], 63: ['fa-cloud-rain', 'déšť'], 65: ['fa-cloud-showers-heavy', 'silný déšť'], 66: ['fa-icicles', 'mrznoucí déšť'], 67: ['fa-icicles', 'mrznoucí déšť'], 71: ['fa-snowflake', 'slabé sněžení'], 73: ['fa-snowflake', 'sněžení'], 75: ['fa-snowflake', 'silné sněžení'], 77: ['fa-snowflake', 'sněhová zrna'], 80: ['fa-cloud-sun-rain', 'přeháňky'], 81: ['fa-cloud-showers-heavy', 'přeháňky'], 82: ['fa-cloud-showers-heavy', 'prudké přeháňky'], 85: ['fa-snowflake', 'sněhové přeháňky'], 86: ['fa-snowflake', 'sněhové přeháňky'], 95: ['fa-cloud-bolt', 'bouřka'], 96: ['fa-cloud-bolt', 'bouřka s kroupami'], 99: ['fa-cloud-bolt', 'bouřka s kroupami']};
 C.wxIc = (code, day) => { const w = WX[code] || ['fa-cloud', '']; return day === 0 && w[2] ? w[2] : w[0]; };
 C.wxText = code => (WX[code] || ['', 'neznámé'])[1];
 /* druh počasí pro 3D: none / cloud / fog / rain / snow */
 C.wxKind = code => code == null ? 'none' : [45, 48].includes(code) ? 'fog' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code >= 51 ? 'rain' : code >= 3 ? 'cloud' : 'none';
 C.windDir = d => ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'][Math.round(((d % 360) + 360) % 360 / 45) % 8];
 const wxCache = new Map();
 C.weather = async (lat, lon) => {
  const key = lat.toFixed(2) + ',' + lon.toFixed(2), hit = wxCache.get(key);
  if (hit && Date.now() - hit._at < 10 * 60000) return hit;
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) +
   '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day' +
   '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day' +
   '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max' +
   '&timezone=Europe%2FPrague&forecast_days=7';
  const r = await fetch(u); if (!r.ok) throw Error('HTTP ' + r.status);
  const j = await r.json(); j._at = Date.now(); j._lat = lat; j._lon = lon;
  wxCache.set(key, j); return j;
 };
 C.wxAdvice = (j) => {
  const out = [], c = j.current, hh = j.hourly; if (!c) return out;
  const nowI = Math.max(0, hh.time.findIndex(t => t >= j.current.time.slice(0, 13)));
  const next3 = [0, 1, 2, 3].map(k => nowI + k).filter(i => i < hh.time.length);
  const pmax = Math.max(...next3.map(i => hh.precipitation_probability[i] || 0)), psum = next3.reduce((s, i) => s + (hh.precipitation[i] || 0), 0);
  if (c.precipitation > .1) out.push(['fa-umbrella', 'Teď ' + (c.temperature_2m < 1 ? 'sněží nebo mrzne' : 'prší') + ' – vezmi si deštník, na zastávce hledej přístřešek.']);
  else if (pmax >= 60 || psum > .8) out.push(['fa-umbrella', 'Během 3 hodin pravděpodobně zaprší (' + pmax + ' %). Deštník se hodí.']);
  if (c.temperature_2m <= 1 && (c.precipitation > 0 || pmax > 40)) out.push(['fa-person-falling', 'Kolem nuly a vlhko – na chodnících a zastávkách může klouzat.']);
  if (c.wind_gusts_10m >= 60) out.push(['fa-wind', 'Silné nárazy větru (' + Math.round(c.wind_gusts_10m) + ' km/h) – možné komplikace v dopravě.']);
  if (c.apparent_temperature <= -8) out.push(['fa-temperature-low', 'Velká zima, pocitově ' + Math.round(c.apparent_temperature) + ' °C – nečekej na zastávce zbytečně dlouho, sleduj odjezd živě.']);
  if (c.temperature_2m >= 30) out.push(['fa-temperature-high', 'Horko – vezmi si vodu, v klimatizovaných vozech bývá příjemněji.']);
  if ([95, 96, 99].includes(c.weather_code)) out.push(['fa-cloud-bolt', 'Bouřka – na cestu raději počkej.']);
  if (!out.length) out.push(['fa-circle-check', 'Počasí cestování neztěžuje.']);
  return out;
 };
 /* HTML panelu počasí (verze bez mapy i velká aplikace) */
 const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
 C.wxHTML = (j, openDay) => {
  const c = j.current, d = j.daily, hh = j.hourly, H = MG.h;
  const nowI = Math.max(0, hh.time.findIndex(t => t >= c.time.slice(0, 13)));
  let h = '<div class="wx-hero"><i class="fa-solid ' + C.wxIc(c.weather_code, c.is_day) + ' wx-big"></i><div><b class="wx-t">' + Math.round(c.temperature_2m) + '°</b><div class="wx-tx">' + H(cap(C.wxText(c.weather_code))) + '</div><small>pocitově ' + Math.round(c.apparent_temperature) + '° · ' + Math.round(d.temperature_2m_min[0]) + '° / ' + Math.round(d.temperature_2m_max[0]) + '°</small></div></div>';
  h += '<div class="wx-adv">' + C.wxAdvice(j).map(([i, t]) => '<div><i class="fa-solid ' + i + '"></i><span>' + H(t) + '</span></div>').join('') + '</div>';
  h += '<div class="wx-grid">' + [['fa-wind', 'Vítr', Math.round(c.wind_speed_10m) + ' km/h ' + C.windDir(c.wind_direction_10m)], ['fa-wind', 'Nárazy', Math.round(c.wind_gusts_10m) + ' km/h'], ['fa-droplet', 'Vlhkost', c.relative_humidity_2m + ' %'], ['fa-umbrella', 'Srážky dnes', (d.precipitation_sum[0] || 0).toFixed(1).replace('.', ',') + ' mm'], ['fa-gauge', 'Tlak', Math.round(c.pressure_msl) + ' hPa'], ['fa-sun', 'UV index', d.uv_index_max[0] != null ? Math.round(d.uv_index_max[0]) : '–'], ['fa-arrow-up', 'Východ', d.sunrise[0].slice(11, 16)], ['fa-arrow-down', 'Západ', d.sunset[0].slice(11, 16)]].map(([i, l, v]) => '<div class="wg"><i class="fa-solid ' + i + '"></i><small>' + l + '</small><b>' + v + '</b></div>').join('') + '</div>';
  h += '<div class="sec-t">Příštích 24 hodin</div><div class="wx-hours">';
  for (let i = nowI; i < Math.min(hh.time.length, nowI + 24); i++) h += '<div class="wh"><small>' + (i === nowI ? 'teď' : hh.time[i].slice(11, 13)) + '</small><i class="fa-solid ' + C.wxIc(hh.weather_code[i], hh.is_day[i]) + '"></i><b>' + Math.round(hh.temperature_2m[i]) + '°</b><span class="pp' + (hh.precipitation_probability[i] >= 50 ? ' hi' : '') + '">' + (hh.precipitation_probability[i] || 0) + ' %</span></div>';
  h += '</div><div class="sec-t">7 dní <small>klepni pro hodinový detail</small></div><div class="wx-days">';
  const tmin = Math.min(...d.temperature_2m_min), tmax = Math.max(...d.temperature_2m_max);
  d.time.forEach((day, k) => {
   const op = openDay === k;
   const l = (d.temperature_2m_min[k] - tmin) / ((tmax - tmin) || 1) * 100, w = (d.temperature_2m_max[k] - d.temperature_2m_min[k]) / ((tmax - tmin) || 1) * 100;
   h += '<div class="wd' + (op ? ' open' : '') + '"><button type="button" class="wd-h" data-wd="' + k + '"><span class="wd-n">' + (k === 0 ? 'Dnes' : k === 1 ? 'Zítra' : cap(MG.dowName(day)).slice(0, 2) + ' ' + +day.slice(8) + '. ' + +day.slice(5, 7) + '.') + '</span><i class="fa-solid ' + C.wxIc(d.weather_code[k], 1) + '"></i><span class="wd-p">' + (d.precipitation_probability_max[k] >= 20 ? '<i class="fa-solid fa-droplet"></i>' + d.precipitation_probability_max[k] + ' %' : '') + '</span><span class="wd-lo">' + Math.round(d.temperature_2m_min[k]) + '°</span><span class="wd-bar"><i style="left:' + l.toFixed(0) + '%;width:' + Math.max(6, w).toFixed(0) + '%"></i></span><span class="wd-hi">' + Math.round(d.temperature_2m_max[k]) + '°</span><i class="fa-solid fa-chevron-down chev"></i></button>';
   if (op) {
    h += '<div class="wd-b"><div class="wd-sum">' + H(cap(C.wxText(d.weather_code[k]))) + ' · srážky ' + (d.precipitation_sum[k] || 0).toFixed(1).replace('.', ',') + ' mm · vítr až ' + Math.round(d.wind_gusts_10m_max[k]) + ' km/h · slunce ' + d.sunrise[k].slice(11, 16) + '–' + d.sunset[k].slice(11, 16) + '</div><div class="wd-rows">';
    for (let i = 0; i < hh.time.length; i++) if (hh.time[i].startsWith(day) && +hh.time[i].slice(11, 13) % 3 === 0) h += '<div class="wr"><span>' + hh.time[i].slice(11, 16) + '</span><i class="fa-solid ' + C.wxIc(hh.weather_code[i], hh.is_day[i]) + '"></i><b>' + Math.round(hh.temperature_2m[i]) + '°</b><small>pocitově ' + Math.round(hh.apparent_temperature[i]) + '°</small><span class="pp' + (hh.precipitation_probability[i] >= 50 ? ' hi' : '') + '"><i class="fa-solid fa-droplet"></i>' + (hh.precipitation_probability[i] || 0) + ' %</span><small>' + Math.round(hh.wind_speed_10m[i]) + ' km/h</small></div>';
    h += '</div></div>';
   }
   h += '</div>';
  });
  h += '</div><div class="pl-note">Předpověď: Open-Meteo (modely ICON, ECMWF a další). Aktualizováno ' + MG.hm2(MG.nowMin() - (Date.now() - j._at) / 60000) + '.</div>';
  return h;
 };
})();
