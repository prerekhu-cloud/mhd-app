/**
 * mhdGO – Cloudflare Worker: sjednocené živé polohy vozidel v ČR
 *
 * Výstup (GET /?bbox=west,south,east,north):
 * {
 *   updated: 1730000000000,
 *   vehicles: [{src, line, cis, spoj, lat, lon, delay, head, last, next, plate, carrier, low, bearing}],
 *   trains:   [{src, num, cat, name, lat, lon, delay, head, from, cur, next, carrier, az}],
 *   stats: {...}, errors: {...}
 * }
 * delay = zpoždění v minutách (záporné = napřed)
 *
 * Zdroje (každý lze vypnout proměnnou prostředí "0"):
 *  - ODIS (Moravskoslezský kraj), JIKORD (Jihočeský kraj), IDOL (Liberecký kraj)
 *                                           MPVNET_PORTALS="odis,jikord,idol"  mpvnet.cz/<portál>/map/mapData (záloha ODIS_PROXY)
 *  - PID (Praha a Středočeský kraj)          PID=1             mapa.pid.cz (veřejná mapa PID); nebo GOLEMIO_TOKEN=... api.golemio.cz
 *  - mimořádnosti a výluky PID              ALERTS=1          pid.cz RSS (výstup alerts[])
 *  - IDS JMK (Brno a Jihomoravský kraj)     IDSJMK_URL=...    např. https://mapa.idsjmk.cz/api/vehicles.json
 *  - Správa železnic (všechny vlaky v ČR)   SZ=1
 *
 * Nasazení: Cloudflare → Workers & Pages → Create → Worker „mhdgo-live“ → Edit code → vložit tento soubor → Deploy
 *           (nebo „npx wrangler deploy“ ve složce worker/). Bez proměnných běží vše výchozí.
 * Adresu workeru vlož v mhdGO: Více → Nastavení → Živé polohy a worker.
 */
const CZ = {w: 12.0, s: 48.5, e: 18.95, n: 51.1};
/* rozsahy veřejných map poloh CHAPS (mpvnet.cz/<portál>/map) */
const BBOX = {odis: {w: 17.1, s: 49.35, e: 18.9, n: 50.35}, jikord: {w: 13.35, s: 48.5, e: 15.65, n: 49.7}, idol: {w: 14.35, s: 50.4, e: 15.6, n: 51.08}, pid: {w: 13.4, s: 49.5, e: 15.6, n: 50.62}};
/* paměť v rámci instance workeru (Cache API na *.workers.dev nefunguje) */
let MEM = null, MEM_AT = 0, PENDING = null;

export default {
 async fetch(req, env, ctx) {
  if (req.method === 'OPTIONS') return new Response(null, {headers: cors()});
  if (req.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: cors()});
  const url = new URL(req.url);
  const bbox = parseBbox(url.searchParams.get('bbox')) || CZ;
  let all = null;
  if (MEM && Date.now() - MEM_AT < 8000) all = MEM;
  else {
   if (!PENDING) PENDING = collect(env).then(r => { MEM = r; MEM_AT = Date.now(); PENDING = null; return r; }).catch(e => { PENDING = null; throw e; });
   all = await PENDING;
  }
  const inB = v => v.lat >= bbox.s && v.lat <= bbox.n && v.lon >= bbox.w && v.lon <= bbox.e;
  if (url.searchParams.get('alerts')) return new Response(JSON.stringify({updated: all.updated, alerts: all.alerts || []}), {headers: {...cors(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
  const out = {updated: all.updated, vehicles: all.vehicles.filter(inB), trains: url.searchParams.get('trains') === '0' ? [] : all.trains.filter(inB), stats: all.stats, errors: all.errors};
  return new Response(JSON.stringify(out), {headers: {...cors(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
 }
};

function cors() { return {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}; }
function parseBbox(s) { if (!s) return null; const a = s.split(',').map(Number); if (a.length !== 4 || a.some(x => !isFinite(x))) return null; return {w: a[0], s: a[1], e: a[2], n: a[3]}; }
const on = (env, k, def) => { const v = env[k]; return v == null ? def : !(v === '0' || v === 'false'); };

async function collect(env) {
 const stats = {}, errors = {}, vehicles = [], trains = [], alerts = [];
 const jobs = [];
 const portals = String(env.MPVNET_PORTALS || 'odis,jikord,idol').split(',').map(s => s.trim()).filter(Boolean);
 if (on(env, 'ODIS', true)) for (const p of portals) jobs.push(run('mpvnet:' + p, () => mpvnet(p, BBOX[p] || CZ, env), r => { vehicles.push(...r.vehicles); trains.push(...r.trains); return r.vehicles.length; }));
 if (env.GOLEMIO_TOKEN) jobs.push(run('pid', () => golemio(env.GOLEMIO_TOKEN), r => { vehicles.push(...r); return r.length; }));
 else if (on(env, 'PID', true)) jobs.push(run('pid', () => pidmap(), r => { vehicles.push(...r); return r.length; }));
 if (on(env, 'ALERTS', true)) jobs.push(run('alerts', () => pidAlerts(), r => { alerts.push(...r); return r.length; }));
 if (env.IDSJMK_URL) jobs.push(run('idsjmk', () => idsjmk(env.IDSJMK_URL), r => { vehicles.push(...r); return r.length; }));
 if (on(env, 'SZ', true)) jobs.push(run('sz', () => sz(), r => { const have = new Set(trains.map(t => t.num)); for (const t of r) if (!have.has(t.num)) trains.push(t); return r.length; }));
 await Promise.all(jobs);
 return {updated: Date.now(), vehicles, trains, alerts, stats, errors};
 async function run(name, f, put) {
  try { const r = await withTimeout(f(), 9000); stats[name] = put(r); }
  catch (e) { errors[name] = String(e && e.message || e); }
 }
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

/* ---------- CHAPS mpvnet (ODIS a další portály) ---------- */
async function mpvnet(portal, b, env) {
 let j = null;
 try {
  const r = await fetch('https://mpvnet.cz/' + portal + '/map/mapData', {method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json'},
   body: JSON.stringify({w: b.w, s: b.s, e: b.e, n: b.n, zoom: 13, showStops: false, mapFilterId: null})});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  j = await r.json();
 } catch (e) {
  /* záloha: stávající proxy OpavaGO (pokrývá okolí Opavy) */
  const px = env && env.ODIS_PROXY != null ? env.ODIS_PROXY : 'https://opavago.prerekhu.workers.dev/'; if (portal !== 'odis' || !px) throw e;
  const r2 = await fetch(px, {headers: {'Accept': 'application/json'}}); if (!r2.ok) throw e;
  j = await r2.json();
 }
 const list = j.transmitters || j || [];
 const vehicles = [], trains = [];
 for (const t of list) {
  if (!t || !isFinite(t.x) || !isFinite(t.y)) continue;
  const f = String(t.cn || '').split('|');
  if (t.cat === 1) {
   const [cat = '', tn = ''] = String(t.n || f[0] || '').split(' ');
   trains.push({src: portal.toUpperCase(), num: f[2] || tn, cat, lat: t.x, lon: t.y, delay: isFinite(t.dm) ? t.dm : null, head: f[9] || '', cur: f[3] || '', carrier: t.cr || ''});
   continue;
  }
  if (t.t && t.t !== 'H') continue;
  const cis = /^\d{6}$/.test(f[0]) ? f[0] : '';
  vehicles.push({src: portal.toUpperCase(), cis, line: cis ? String(+cis.slice(3)) : f[0], spoj: +f[2] || 0, lat: t.x, lon: t.y,
   delay: isFinite(t.dm) ? t.dm : delayStr(t.ds), last: f[3] || '', next: f[5] || '', from: f[8] || '', head: f[9] || '', low: f[10] === '1',
   plate: (f[11] || '').replace(/^Ev\.\s*č\.\s*/i, '').trim(), carrier: t.cr || '', stand: /stoji/.test(t.ico || '')});
 }
 return {vehicles, trains};
}
function delayStr(ds) { const m = /\$([zp])-?(\d+)~min\.~(\d+)~s/.exec(ds || ''); if (!m) return null; const s = +m[2] * 60 + +m[3]; return (m[1] === 'p' ? -s : s) / 60; }

/* ---------- PID – Golemio ---------- */
async function golemio(token) {
 const r = await fetch('https://api.golemio.cz/v2/vehiclepositions?limit=10000&includeNotTracking=false&includePositions=false', {headers: {'X-Access-Token': token, 'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const f of (j.features || [])) {
  const c = f.geometry && f.geometry.coordinates; if (!c) continue;
  const p = f.properties || {}, lp = p.last_position || {}, tr = p.trip || {}, g = tr.gtfs || {};
  const d = lp.delay && lp.delay.actual;
  out.push({src: 'PID', line: String(g.route_short_name || ''), pidTrip: g.trip_id || '', lat: c[1], lon: c[0], delay: isFinite(d) ? d / 60 : null,
   head: g.trip_headsign || '', bearing: lp.bearing, plate: String(tr.vehicle_registration_number || ''), carrier: (tr.agency_name && (tr.agency_name.real || tr.agency_name.scheduled)) || '', low: !!tr.wheelchair_accessible});
 }
 return out;
}

/* ---------- PID – veřejná mapa mapa.pid.cz ---------- */
async function pidmap() {
 const r = await fetch('https://mapa.pid.cz/getData.php', {headers: {'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const t of (j.trips || [])) {
  if (!isFinite(t.lat) || !isFinite(t.lon) || t.inactive || t.routeType === 2) continue;
  const parts = String(t.tripId || '').split('_');
  out.push({src: 'PID', line: String(t.route || ''), spoj: +parts[1] || 0, pidTrip: t.tripId || '', lat: t.lat, lon: t.lon,
   delay: isFinite(t.delay) ? t.delay / 60 : null, bearing: t.bearing, plate: t.vehicle != null ? String(t.vehicle) : '', low: t.wheelchair === 1, state: t.statePosition || ''});
 }
 return out;
}
/* ---------- PID – mimořádnosti a výluky (RSS) ---------- */
async function pidAlerts() {
 const out = [];
 for (const [u, type] of [['https://pid.cz/feed/rss-mimoradnosti/', 'mimořádnost'], ['https://pid.cz/feed/rss-vyluky/', 'výluka']]) {
  const r = await fetch(u); if (!r.ok) continue;
  const x = await r.text();
  for (const it of x.split('<item>').slice(1)) {
   const g = (tag) => { const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(it); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
   const lines = [...it.matchAll(/<line>([^<]*)<\/line>/g)].map(m => m[1].trim()).filter(Boolean);
   const from = +g('dateFrom'), to = +g('dateTo');
   out.push({src: 'PID', type, title: unent(g('title')), text: unent(g('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 1200), url: g('link'), lines,
    from: from ? from * 1000 : null, to: to ? to * 1000 : null});
  }
 }
 return out;
}
function unent(s) { return String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' '); }

/* ---------- IDS JMK ---------- */
async function idsjmk(u) {
 const r = await fetch(u, {headers: {'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const list = j.Vehicles || j.vehicles || (Array.isArray(j) ? j : []);
 return list.filter(v => !v.IsInactive).map(v => ({src: 'IDS JMK', line: String(v.LineName ?? v.lineName ?? v.LineID ?? ''), lat: +(v.Lat ?? v.lat), lon: +(v.Lng ?? v.lon ?? v.lng), delay: isFinite(+(v.Delay ?? v.delay)) ? +(v.Delay ?? v.delay) : null,
  head: String(v.FinalStopName ?? v.finalStop ?? ''), bearing: v.Bearing, plate: String(v.ID ?? ''), low: !!(v.LF ?? v.lowFloor)})).filter(v => isFinite(v.lat) && isFinite(v.lon));
}

/* ---------- Správa železnic ---------- */
async function sz() {
 const r = await fetch('https://mapy.spravazeleznic.cz/serverside/request2.php?module=Layers\\OsVlaky&&action=load');
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const f of (j.result || [])) {
  const p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c) continue;
  const [lat, lon] = jtsk(c[0], c[1]);
  out.push({src: 'Správa železnic', num: String(p.tn || '').trim(), cat: String(p.tt || '').trim(), name: p.na || '', lat, lon, delay: p.de === '' || p.de == null ? null : +p.de, from: p.fn || '', head: p.ln || '', cur: p.cna || '', next: p.nsn || '', nextT: p.nst || '', carrier: p.d || '', az: p.a});
 }
 return out;
}
/* S-JTSK (EPSG:5514) -> WGS84 */
function jtsk(ex, ny) {
 const X = -ny, Y = -ex, H = 245;
 const n = 0.97992470462083, konst = 12310230.12797036, sinUQ = 0.863499969506341, cosUQ = 0.504348889819882, sinVQ = 0.420215144586493, cosVQ = 0.907424504992097, alfa = 1.000597498371542, k = 1.003419163966575, e = 0.081696831215303;
 const ro = Math.sqrt(X * X + Y * Y), eps = 2 * Math.atan(Y / (ro + X)), D = eps / n, S = 2 * Math.atan(Math.exp(1 / n * Math.log(konst / ro))) - Math.PI / 2;
 const sinS = Math.sin(S), cosS = Math.cos(S), sinU = sinUQ * sinS - cosUQ * cosS * Math.cos(D), cosU = Math.sqrt(1 - sinU * sinU);
 const sinDV = Math.sin(D) * cosS / cosU, cosDV = Math.sqrt(1 - sinDV * sinDV), sinV = sinVQ * cosDV - cosVQ * sinDV, cosV = cosVQ * cosDV + sinVQ * sinDV;
 const Lj = 2 * Math.atan(sinV / (1 + cosV)) / alfa, t = Math.exp(2 / alfa * Math.log((1 + sinU) / cosU / k));
 let pom = (t - 1) / (t + 1), sinB, it = 0;
 do { sinB = pom; pom = t * Math.exp(e * Math.log((1 + e * sinB) / (1 - e * sinB))); pom = (pom - 1) / (pom + 1); } while (Math.abs(pom - sinB) > 1e-15 && ++it < 50);
 const Bj = Math.atan(pom / Math.sqrt(1 - pom * pom));
 const a = 6377397.15508, f1 = 299.152812853, e2 = 1 - (1 - 1 / f1) * (1 - 1 / f1), r = a / Math.sqrt(1 - e2 * Math.sin(Bj) ** 2);
 const x = (r + H) * Math.cos(Bj) * Math.cos(Lj), y = (r + H) * Math.cos(Bj) * Math.sin(Lj), z = ((1 - e2) * r + H) * Math.sin(Bj);
 const dx = 570.69, dy = 85.69, dz = 462.84, wz = -5.2611 / 3600 * Math.PI / 180, wy = -1.58676 / 3600 * Math.PI / 180, wx = -4.99821 / 3600 * Math.PI / 180, m = 3.543e-6;
 const xn = dx + (1 + m) * (x + wz * y - wy * z), yn = dy + (1 + m) * (-wz * x + y + wx * z), zn = dz + (1 + m) * (wy * x - wx * y + z);
 const a2 = 6378137.0, f2 = 298.257223563, ab = f2 / (f2 - 1), p = Math.sqrt(xn * xn + yn * yn), e22 = 1 - (1 - 1 / f2) ** 2;
 const th = Math.atan(zn * ab / p), st = Math.sin(th), ct = Math.cos(th);
 const B = Math.atan((zn + e22 * ab * ab * a2 / ab * st ** 3) / (p - e22 * a2 * ct ** 3)), L = 2 * Math.atan(yn / (p + xn));
 return [B * 180 / Math.PI, L * 180 / Math.PI];
}
