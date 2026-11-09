/* ===== mhdGO – procedurální 3D modely vozidel (three.js) =====
 Souřadnice modelu: X = vpravo, Y = vpřed, Z = nahoru, jednotky = metry.
 Rozměry a barevná schémata podle skutečných vozidel (SOR NS 12/18, Solaris Urbino, Iveco Crossway,
 Škoda 26Tr/32Tr, Škoda 15T/13T, Stadler, RegioPanter/RegioShark…) – vzhled je orientační. */
(function(){
 const MD = MG.models = {cache: new Map(), mats: new Map()};
 /* barevná schémata dopravních podniků a dopravců */
 const LIV = {
  'Praha': {body: '#f4f1ea', low: '#c8102e', roof: '#d9d4cb', stripe: '#c8102e', tram: ['#c8102e', '#f2ece0']},
  'Brno': {body: '#f2ece0', low: '#d6001c', roof: '#d8d0c2', stripe: '#d6001c', tram: ['#d6001c', '#f2ece0']},
  'Ostrava': {body: '#ffffff', low: '#0a5bb4', roof: '#d6dde6', stripe: '#0a5bb4', tram: ['#0a5bb4', '#ffffff']},
  'Plzeň': {body: '#ffffff', low: '#e2231a', roof: '#d9d9d9', stripe: '#1f3f8f', tram: ['#e2231a', '#ffffff']},
  'Olomouc': {body: '#ffffff', low: '#d71a21', roof: '#dcdcdc', stripe: '#ffcc00', tram: ['#d71a21', '#ffffff']},
  'Liberec': {body: '#ffffff', low: '#e2001a', roof: '#dcdcdc', stripe: '#ffd200', tram: ['#e2001a', '#ffffff']},
  'Most': {body: '#ffffff', low: '#e2001a', roof: '#dcdcdc', stripe: '#1d71b8', tram: ['#e2001a', '#f4f1ea']},
  'Opava': {body: '#ffffff', low: '#d2232a', roof: '#dedede', stripe: '#d2232a'},
  'Pardubice': {body: '#ffffff', low: '#ffcd00', roof: '#dedede', stripe: '#00539f'},
  'Hradec Králové': {body: '#ffffff', low: '#e30613', roof: '#dedede', stripe: '#ffd200'},
  'České Budějovice': {body: '#ffffff', low: '#00a0e3', roof: '#dedede', stripe: '#0060a8'},
  'Zlín': {body: '#ffffff', low: '#e30613', roof: '#dedede', stripe: '#ffd500'},
  'Jihlava': {body: '#ffffff', low: '#ffcc00', roof: '#dedede', stripe: '#0072bc'},
  'Ústí nad Labem': {body: '#ffffff', low: '#0091d5', roof: '#dedede', stripe: '#e30613'},
  'Karlovy Vary': {body: '#ffffff', low: '#008c45', roof: '#dedede', stripe: '#ffd200'},
  'Havířov': {body: '#ffffff', low: '#e30613', roof: '#dedede', stripe: '#0057a8'},
  'Teplice': {body: '#ffffff', low: '#ffcc00', roof: '#dedede', stripe: '#0072bc'},
  'Chomutov': {body: '#ffffff', low: '#ef7d00', roof: '#dedede', stripe: '#0072bc'},
  'Mariánské Lázně': {body: '#ffffff', low: '#007a3d', roof: '#dedede', stripe: '#c8a200'}
 };
 const IDS_LIV = {
  PID: {body: '#ffffff', low: '#e4002b', stripe: '#ffd100'}, ODIS: {body: '#ffffff', low: '#0067b1', stripe: '#00a3e0'}, 'IDS JMK': {body: '#ffffff', low: '#e30613', stripe: '#ffcc00'},
  IDSOK: {body: '#ffffff', low: '#0b6fb8', stripe: '#ffcd00'}, IDZK: {body: '#ffffff', low: '#ffd200', stripe: '#e3000f'}, VDV: {body: '#ffffff', low: '#00843d', stripe: '#9bc31c'},
  IREDO: {body: '#ffffff', low: '#ffcc00', stripe: '#d71920'}, 'DÚK': {body: '#ffffff', low: '#00a650', stripe: '#0072bc'}, IDOL: {body: '#ffffff', low: '#0067b1', stripe: '#e30613'},
  IDOK: {body: '#ffffff', low: '#00a0de', stripe: '#9a1b58'}, IDPK: {body: '#ffffff', low: '#0091d0', stripe: '#f39200'}, 'IDS JK': {body: '#ffffff', low: '#00a3dd', stripe: '#004f9f'}
 };
 const OP_LIV = [
  [/RegioJet|Student Agency/i, {body: '#ffd200', low: '#ffd200', stripe: '#1d1d1b', roof: '#ececec'}], [/Flix/i, {body: '#73d700', low: '#73d700', stripe: '#ff5f00', roof: '#e8e8e8'}],
  [/Leo Express/i, {body: '#1d1d1b', low: '#1d1d1b', stripe: '#ff5f0f', roof: '#2a2a2a'}], [/ARRIVA/i, {body: '#ffffff', low: '#00a0b0', stripe: '#00a0b0'}],
  [/Transdev/i, {body: '#ffffff', low: '#0063af', stripe: '#e30613'}], [/GW Train/i, {body: '#ffffff', low: '#d9001b', stripe: '#003a70'}],
  [/Länderbahn|Laenderbahn/i, {body: '#ffffff', low: '#0065a4', stripe: '#00a6e2'}], [/České dráhy/i, {body: '#ffffff', low: '#1b4c9c', stripe: '#d12026', roof: '#cfd6dd'}],
  [/AŽD|KŽC|Kolej/i, {body: '#e9e2d4', low: '#7b5d3a', stripe: '#c39a5f'}]
 ];
 MD.livery = (L_) => {
  if (!L_) return {body: '#ffffff', low: '#C1784F', stripe: '#C1784F', roof: '#dedede'};
  const ag = (L_.a || []).join(' ');
  for (const [re, l] of OP_LIV) if (re.test(ag)) return Object.assign({roof: '#dedede'}, l);
  if (L_.city && LIV[L_.city]) return LIV[L_.city];
  if ((L_.k === 'mhd' || L_.k === 'trol' || L_.k === 'tram') && L_.city) {
   let h = 0; for (const c of L_.city) h = (h * 31 + c.charCodeAt(0)) >>> 0;
   const acc = MG.colorMix(L_.c || '#C1784F', .1, '#000000');
   return {body: '#ffffff', low: acc, stripe: L_.c || acc, roof: '#dedede'};
  }
  if (L_.k === 'vlak') return {body: '#ffffff', low: '#1b4c9c', stripe: '#d12026', roof: '#cfd6dd'};
  return Object.assign({roof: '#dedede'}, IDS_LIV[L_.sys] || {body: '#ffffff', low: '#C1784F', stripe: '#C1784F'});
 };
 /* typ vozidla podle linky */
 MD.typeOf = (L_) => {
  if (!L_) return 'bus12';
  const ag = (L_.a || []).join(' ');
  switch (L_.k) {
   case 'tram': return 'tram';
   case 'metro': return 'metro';
   case 'trol': return /Praha|Brno|Plzeň|Ostrava/.test(L_.city || '') && (L_.i % 3 === 0) ? 'trol18' : 'trol12';
   case 'vlak': {
    if (/RegioJet|Leo Express/i.test(ag) || /^(EC|IC|Ex|SC|rj|RJ|LE|EN)/.test(L_.lab || L_.cat || '')) return 'train-ic';
    if (/^R/.test(L_.cat || '') || /Sp/.test(L_.cat || '')) return 'train-r';
    return 'train-os';
   }
   case 'mezi': return 'coach';
   case 'regio': return 'regio';
   case 'lan': return 'funi';
   case 'lod': return 'boat';
   default: return /Praha|Brno|Ostrava|Plzeň|Olomouc|Liberec/.test(L_.city || '') && (L_.i % 4 === 0) ? 'bus18' : (L_.i % 5 === 0 ? 'bus10' : 'bus12');
  }
 };
 MD.TYPES = {bus12: 'Městský autobus 12 m (SOR NS 12 / Solaris Urbino 12)', bus18: 'Kloubový autobus 18 m (SOR NS 18 / Urbino 18)', bus10: 'Midibus 10,5 m (Iveco Urbanway 10,5M)',
  trol12: 'Trolejbus 12 m (Škoda 32Tr SOR)', trol18: 'Kloubový trolejbus 18 m (Škoda 33Tr / 27Tr)', regio: 'Regionální autobus (Iveco Crossway / SOR CN 12)', coach: 'Dálkový autobus (Irizar / Setra)',
  tram: 'Nízkopodlažní tramvaj (Škoda 15T / 13T / Stadler)', metro: 'Souprava metra (M1 / 81-71M)', 'train-os': 'Osobní vlak (RegioPanter / RegioShark / GTW)', 'train-r': 'Rychlík (lokomotiva + vozy)',
  'train-ic': 'Dálkový vlak (Pendolino, RegioJet, Leo Express)', funi: 'Lanovka', boat: 'Přívoz'};
 function mat(color, opt) {
  const k = color + (opt ? JSON.stringify(opt) : '');
  let m = MD.mats.get(k); if (m) return m;
  m = new THREE.MeshLambertMaterial(Object.assign({color: new THREE.Color(color)}, opt || {}));
  MD.mats.set(k, m); return m;
 }
 MD.matsList = () => [...MD.mats.values()];
 const box = (g, w, l, h, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), m); b.position.set(x, y, z); g.add(b); return b; };
 const cyl = (g, r, len, x, y, z, m, rot) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m); c.position.set(x, y, z); if (rot === 'x') c.rotation.z = Math.PI / 2; g.add(c); return c; };
 /* jedna skříň autobusu/tramvaje: délka l, šířka w, výška h, podlaha z0; doors = pole poloh dveří (Y) */
 function section(g, o) {
  const {l, w, h, z0, y0, liv, doors, front, back, glassLow, roofKit} = o;
  const body = mat(liv.body), low = mat(liv.low || liv.body), glass = mat('#1c2630'), dark = mat('#26292c'), roof = mat(liv.roof || '#dedede'), stripe = mat(liv.stripe || liv.low);
  const zMid = z0 + h / 2;
  box(g, w, l, h, 0, y0, zMid, body);
  /* spodní lem (sukně) v barvě podniku */
  box(g, w + .02, l - .1, h * .28, 0, y0, z0 + h * .14, low);
  /* pás oken */
  const gz0 = z0 + h * (glassLow || .36), gz1 = z0 + h * .9;
  box(g, w + .04, l - .6, gz1 - gz0, 0, y0, (gz0 + gz1) / 2, glass);
  /* proužek pod okny */
  box(g, w + .05, l - .5, .12, 0, y0, gz0 - .08, stripe);
  /* okenní sloupky (vynechány u dveří) */
  const pil = mat(liv.body);
  for (let yy = -l / 2 + .9; yy < l / 2 - .5; yy += 1.55) {
   if ((doors || []).some(dy => Math.abs(dy - yy) < .8)) continue;
   box(g, w + .07, .14, gz1 - gz0, 0, y0 + yy, (gz0 + gz1) / 2, pil);
  }
  /* střecha */
  box(g, w - .1, l - .2, .12, 0, y0, z0 + h + .05, roof);
  if (roofKit) roofKit.forEach(([yy, ll, hh]) => box(g, w * .7, ll, hh, 0, y0 + yy, z0 + h + .1 + hh / 2, roof));
  /* dveře */
  for (const dy of (doors || [])) { box(g, w + .06, 1.25, h * .78, 0, y0 + dy, z0 + h * .41, dark); }
  /* čelo a záď */
  if (front) { box(g, w - .2, .1, h * .62, 0, y0 + l / 2 + .02, z0 + h * .58, glass); box(g, w * .82, .12, .24, 0, y0 + l / 2 + .03, z0 + h * .93, mat('#1a1208', {emissive: new THREE.Color('#ffae00'), emissiveIntensity: .5})); box(g, .34, .08, .14, w * .34, y0 + l / 2 + .04, z0 + h * .2, mat('#fff8e0', {emissive: new THREE.Color('#fff2c0'), emissiveIntensity: .6})); box(g, .34, .08, .14, -w * .34, y0 + l / 2 + .04, z0 + h * .2, mat('#fff8e0', {emissive: new THREE.Color('#fff2c0'), emissiveIntensity: .6})); }
  if (back) { box(g, w - .6, .08, h * .3, 0, y0 - l / 2 - .02, z0 + h * .7, glass); box(g, .3, .08, .14, w * .36, y0 - l / 2 - .03, z0 + h * .22, mat('#c00000', {emissive: new THREE.Color('#ff0000'), emissiveIntensity: .5})); box(g, .3, .08, .14, -w * .36, y0 - l / 2 - .03, z0 + h * .22, mat('#c00000', {emissive: new THREE.Color('#ff0000'), emissiveIntensity: .5})); }
 }
 function wheels(g, w, ys, r, z) { const m = mat('#1a1a1a'), hub = mat('#9a9a9a'); for (const y of ys) for (const s of [-1, 1]) { cyl(g, r, .32, s * (w / 2 - .12), y, z ?? r, m, 'x'); cyl(g, r * .5, .34, s * (w / 2 - .1), y, z ?? r, hub, 'x'); } }
 function poles(g, y, len, zTop) { const m = mat('#2b2b2b'); for (const s of [-.3, .3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, len, 6), m); p.position.set(s, y - len * .44, zTop + len * .23); p.rotation.x = -1.13; g.add(p); } box(g, 1.2, 1.4, .25, 0, y + .3, zTop + .12, mat('#3a3a3a')); }
 function pantograph(g, y, zTop) { const m = mat('#2b2b2b'); box(g, 1.6, 1.0, .12, 0, y, zTop + .1, m); const a = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.6, .06), m); a.position.set(0, y - .2, zTop + .55); a.rotation.x = .7; g.add(a); const b = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, .06), m); b.position.set(0, y + .2, zTop + .9); b.rotation.x = -.5; g.add(b); box(g, 1.8, .14, .06, 0, y + .55, zTop + 1.4, m); }
 function bellows(g, y, w, z0, h) { box(g, w - .25, .8, h * .92, 0, y, z0 + h * .48, mat('#2d2d2d')); }
 /* ---------- typy ---------- */
 const B = {};
 B.bus12 = (liv) => { const g = new THREE.Group(); section(g, {l: 12, w: 2.55, h: 2.75, z0: .35, y0: 0, liv, doors: [5.1, .6, -4.2], front: 1, back: 1, roofKit: [[1.5, 3.2, .38]]}); wheels(g, 2.55, [3.4, -2.6], .5); return g; };
 B.bus10 = (liv) => { const g = new THREE.Group(); section(g, {l: 10.5, w: 2.5, h: 2.7, z0: .35, y0: 0, liv, doors: [4.3, .2], front: 1, back: 1, roofKit: [[1, 2.6, .35]]}); wheels(g, 2.5, [3, -2.3], .5); return g; };
 B.bus18 = (liv) => { const g = new THREE.Group(); section(g, {l: 10.2, w: 2.55, h: 2.75, z0: .35, y0: 4.3, liv, doors: [9.2, 4.6, 1.3], front: 1, roofKit: [[0, 3, .38]]}); bellows(g, -1.1, 2.55, .35, 2.75); section(g, {l: 6.9, w: 2.55, h: 2.75, z0: .35, y0: -4.95, liv, doors: [-3.1], back: 1}); wheels(g, 2.55, [7.6, 1.6, -6.4], .5); return g; };
 B.trol12 = (liv) => { const g = B.bus12(liv); poles(g, -1.5, 6.2, 3.2); return g; };
 B.trol18 = (liv) => { const g = B.bus18(liv); poles(g, -6, 6.2, 3.2); return g; };
 B.regio = (liv) => { const g = new THREE.Group(); section(g, {l: 12.1, w: 2.55, h: 3.1, z0: .45, y0: 0, liv, doors: [5.3, -.6], front: 1, back: 1, glassLow: .42, roofKit: [[2.5, 2.4, .3]]}); wheels(g, 2.55, [3.6, -2.7], .52); return g; };
 B.coach = (liv) => { const g = new THREE.Group(); section(g, {l: 13, w: 2.55, h: 3.45, z0: .5, y0: 0, liv, doors: [5.8, -.9], front: 1, back: 1, glassLow: .5}); wheels(g, 2.55, [4, -2.4, -3.8], .52); return g; };
 B.tram = (liv) => {
  const g = new THREE.Group(); const L1 = (liv.tram || [liv.low, liv.body]);
  const lv = {body: L1[1], low: L1[0], stripe: L1[0], roof: '#cfcfcf'};
  const secs = [[9.5, 'f'], [6.2, ''], [9.5, 'b']]; let y = 13.4;
  secs.forEach(([l, t], i) => { y -= l / 2; section(g, {l, w: 2.46, h: 3.05, z0: .35, y0: y, liv: lv, doors: [y > 0 ? l / 2 - 2 : 0].map(v => v), front: t === 'f', back: t === 'b', roofKit: [[0, l * .6, .4]]}); if (i < 2) bellows(g, y - l / 2 - .25, 2.46, .35, 3.05); y -= l / 2 + .5; });
  pantograph(g, 2, 3.8); wheels(g, 2.46, [9.5, 4.5, -4.5, -9.5], .34); return g;
 };
 B.metro = (liv) => { const g = new THREE.Group(); const lv = {body: '#e8e8e8', low: liv.low || '#00a562', stripe: liv.low || '#00a562', roof: '#bdbdbd'}; for (let i = 0; i < 3; i++) section(g, {l: 19, w: 2.7, h: 3.5, z0: .6, y0: 20 - i * 20, liv: lv, doors: [6, 0, -6], front: i === 0, back: i === 2}); wheels(g, 2.7, [26, 14, 6, -6, -14, -26], .4); return g; };
 function railcar(g, y, l, lv, o) { section(g, Object.assign({l, w: 2.85, h: 3.4, z0: .95, y0: y, liv: lv, doors: [l / 2 - 2.6, -l / 2 + 2.6]}, o)); box(g, 2.2, l - 3, .5, 0, y, .65, mat('#2b2b2b')); for (const yy of [y + l / 2 - 3, y - l / 2 + 3]) box(g, 2.4, 2.6, .5, 0, yy, .45, mat('#1d1d1d')); }
 B['train-os'] = (liv) => { const g = new THREE.Group(); railcar(g, 13, 26, liv, {front: 1, glassLow: .35}); railcar(g, -13.3, 26, liv, {back: 1, glassLow: .35}); pantograph(g, 6, 4.5); return g; };
 B['train-r'] = (liv) => { const g = new THREE.Group(); const loco = {body: liv.low || '#1b4c9c', low: '#24292e', stripe: '#ffffff', roof: '#9aa3ad'}; section(g, {l: 18, w: 2.95, h: 3.5, z0: 1, y0: 36, liv: loco, front: 1, doors: []}); box(g, 2.3, 15, .6, 0, 36, .55, mat('#222')); pantograph(g, 38, 4.6); const car = {body: '#ffffff', low: liv.low || '#1b4c9c', stripe: liv.stripe || '#1b4c9c', roof: '#b9c0c8'}; for (let i = 0; i < 3; i++) railcar(g, 17 - i * 26.8, 26.4, car, {back: i === 2, glassLow: .42}); return g; };
 B['train-ic'] = (liv) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) railcar(g, 39 - i * 26.5, 26, liv, {front: i === 0, back: i === 3, glassLow: .4}); pantograph(g, 45, 4.5); return g; };
 B.funi = (liv) => { const g = new THREE.Group(); section(g, {l: 10, w: 2.6, h: 3, z0: .4, y0: 0, liv: {body: '#d6001c', low: '#a8001a', stripe: '#ffffff', roof: '#ddd'}, front: 1, back: 1, doors: [2, -2]}); return g; };
 B.boat = (liv) => { const g = new THREE.Group(); box(g, 4, 14, 1.4, 0, 0, .7, mat('#f4f4f4')); box(g, 3, 6, 2, 0, -1, 2.3, mat('#1c2630')); box(g, 3.2, 6.2, .2, 0, -1, 3.4, mat('#c8102e')); return g; };
 /* ---------- skutečné 3D modely (GLB) ----------
  Modely z OpavaGO (prerekhu-cloud.github.io/Mhd): trolejbusy Škoda 26Tr/32Tr/36Tr, autobusy SOR, Iveco, Irisbus, Z-Group,
  vlaky RegioNova, RegioShark a motorák 810; od uživatele: Tatra T3 (conflig, CC BY-NC 4.0) a ČD 810 (voxellation, CC BY 4.0).
  Modely jsou ilustrační – skutečný typ vozu na spoji neznáme. Načítají se, až je vozidlo daného druhu vidět ve 3D.
  Modely z OpavaGO mají čelo na opačné straně osy než naše konvence → otočení o 180° (rot). */
 const OPAVA = 'https://prerekhu-cloud.github.io/Mhd/';
 MD.MODELS = {
  '26tr': {url: OPAVA + '26tr.glb', len: 12, name: 'Škoda 26Tr Solaris', rot: Math.PI},
  '32tr': {url: OPAVA + '32tr.glb', len: 12, name: 'Škoda 32Tr SOR', rot: Math.PI},
  '36tr': {url: OPAVA + '36tr.glb', len: 12, name: "Škoda 36Tr T'CITY", rot: Math.PI},
  sorbus: {url: OPAVA + 'Sorbus.glb', len: 12, name: 'SOR NS 12', rot: Math.PI},
  sorelektro: {url: OPAVA + 'Sorelektro.glb', len: 12, name: 'SOR NS 12 electric', rot: Math.PI},
  iveco12m: {url: OPAVA + 'Iveco12m.glb', len: 12, name: 'Iveco Urbanway 12M', rot: Math.PI},
  iveco10m: {url: OPAVA + 'Iveco10m.glb', len: 10.5, name: 'Iveco Urbanway 10,5M', rot: Math.PI},
  irisbus: {url: OPAVA + 'Irisbus.glb', len: 12, name: 'Irisbus Citelis 12M', rot: Math.PI},
  zgroupvelky: {url: OPAVA + 'Zgroupvelky.glb', len: 12, name: 'Z-Group (velký autobus)', rot: Math.PI},
  zgroupmaly: {url: OPAVA + 'Zgroupmaly.glb', len: 10.5, name: 'Z-Group (malý autobus)', rot: Math.PI},
  regionova: {url: OPAVA + 'Regionovamodra.glb', len: 28.4, name: 'RegioNova', rot: Math.PI},
  regioshark: {url: OPAVA + 'Regioshark.glb', len: 45, name: 'RegioShark', rot: Math.PI},
  motorak: {url: OPAVA + 'Motorakmaly.glb', len: 14, name: 'Motorák řady 810', rot: Math.PI},
  tatra_t3: {file: 'models/tatra_t3.glb', len: 14, name: 'Tatra T3', credit: 'Tatra T3 – conflig (Sketchfab), CC BY-NC 4.0'},
  cd810: {file: 'models/cd810.glb', len: 14, name: 'ČD 810', credit: 'CD810 motor train – voxellation (Sketchfab), CC BY 4.0'}
 };
 /* druh vozidla → odpovídající modely (vybírá se stabilně podle linky) */
 MD.VARIANTS = {trol12: ['26tr', '32tr', '36tr'], trol18: ['26tr', '36tr'], bus12: ['sorbus', 'sorelektro', 'iveco12m', 'irisbus'], bus18: ['sorbus', 'iveco12m'], bus10: ['iveco10m', 'zgroupmaly'],
  regio: ['zgroupvelky', 'zgroupmaly', 'iveco12m'], coach: ['zgroupvelky'], tram: ['tatra_t3'], 'train-os': ['regionova', 'motorak', 'cd810', 'regioshark'], 'train-r': ['regioshark', 'regionova']};
 MD.modelOf = (L_) => { const t = MD.typeOf(L_), v = MD.VARIANTS[t]; if (!v) return null; return v[(L_ && L_.i || 0) % v.length]; };
 MD.GLB = {}; MD.glb = {};
 MD.gm = {}; const gmP = {};
 const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
 /* osy: GLB má Y nahoru → u nás Z nahoru; délka vozu podél +Y (dopředu), střed v počátku, kola na z = 0 */
 MD.normalize = (scene, cfg) => {
  const inner = new THREE.Group(); inner.add(scene); inner.rotation.x = Math.PI / 2;
  const mid = new THREE.Group(); mid.add(inner);
  const outer = new THREE.Group(); outer.add(mid);
  outer.updateMatrixWorld(true);
  let size = new THREE.Box3().setFromObject(outer).getSize(new THREE.Vector3());
  if (size.x > size.y) mid.rotation.z = Math.PI / 2;
  if (cfg.rot) mid.rotation.z += cfg.rot;
  outer.updateMatrixWorld(true);
  size = new THREE.Box3().setFromObject(outer).getSize(new THREE.Vector3());
  const k = cfg.len / Math.max(size.y, .01); mid.scale.setScalar(k);
  outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(outer), c = box.getCenter(new THREE.Vector3());
  mid.position.set(-c.x, -c.y, -box.min.z);
  /* materiály z PBR (bez mapy prostředí by byly tmavé) → matné, osvětlené jako zbytek scény */
  outer.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; o.material = Array.isArray(o.material) ? ms.map(conv) : conv(o.material); } });
  outer.userData.glb = cfg.name;
  return outer;
 };
 const convCache = new Map();
 function conv(m) {
  if (!m) return m; if (convCache.has(m)) return convCache.get(m);
  const n = new THREE.MeshLambertMaterial({color: m.color ? m.color.clone() : new THREE.Color('#ffffff'), map: m.map || null, transparent: !!m.transparent, opacity: m.opacity != null ? m.opacity : 1, side: m.side, alphaTest: m.alphaTest || 0});
  if (m.map) { m.map.anisotropy = 4; m.map.encoding = THREE.LinearEncoding; }
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .05) { n.emissive = m.emissive.clone(); n.emissiveMap = m.emissiveMap || null; n.emissiveIntensity = .5; }
  convCache.set(m, n); return n;
 }
 let loader = null, active = 0; const queue = [];
 const pump = () => {
  while (active < 2 && queue.length) {
   const [id, ok] = queue.shift(); const cfg = MD.MODELS[id]; active++;
   const urls = cfg.url ? [cfg.url] : (MG._goodBase ? [MG._goodBase, ...MG.cfg.DATA.filter(b => b !== MG._goodBase)] : MG.cfg.DATA).map(b => b + cfg.file);
   (async () => {
    for (const u of urls) { try { const g = await new Promise((res, rej) => loader.load(u, res, undefined, rej)); MD.gm[id] = MD.normalize(g.scene, cfg); break; } catch (_) {} }
    active--; ok(!!MD.gm[id]); MG.emit('models', id); pump();
   })();
  }
 };
 MD.need = (id) => {
  if (!id || MD.gm[id]) return Promise.resolve(!!MD.gm[id]);
  if (gmP[id]) return gmP[id];
  gmP[id] = (async () => {
   try { if (!THREE.GLTFLoader) await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'); } catch (_) { return false; }
   if (!loader) { loader = new THREE.GLTFLoader(); try { loader.setCrossOrigin('anonymous'); } catch (_) {} }
   return new Promise(ok => { queue.push([id, ok]); pump(); });
  })();
  return gmP[id];
 };
 /* nic se nestahuje dopředu – modely se načtou podle vozidel, která jsou ve 3D vidět */
 MD.loadGLB = () => Promise.resolve();
 MD.forLine = (L_) => { const id = MD.modelOf(L_); if (!id) return null; if (!MD.gm[id]) { MD.need(id); return null; } return MD.gm[id]; };
 MD.build = (type, liv, L_) => {
  const gm = L_ ? MD.forLine(L_) : null; if (gm) return gm.clone();
  const key = type + '|' + JSON.stringify(liv);
  let proto = MD.cache.get(key);
  if (!proto) { proto = (B[type] || B.bus12)(liv); MD.cache.set(key, proto); }
  return proto.clone();
 };
 const SHORT = {bus12: 'Autobus 12 m', bus18: 'Kloubový autobus', bus10: 'Midibus 10,5 m', trol12: 'Trolejbus', trol18: 'Kloubový trolejbus', regio: 'Regionální autobus', coach: 'Dálkový autobus', tram: 'Tramvaj', metro: 'Souprava metra', 'train-os': 'Osobní vlak', 'train-r': 'Rychlík', 'train-ic': 'Dálkový vlak', funi: 'Lanovka', boat: 'Přívoz'};
 MD.short = L_ => SHORT[MD.typeOf(L_)] || '';
 /* popis pro panel jízdy: u skutečného modelu poctivě „ilustrační model“ */
 const KINDN = {mhd: 'Autobus MHD', trol: 'Trolejbus', tram: 'Tramvaj', metro: 'Metro', regio: 'Regionální autobus', mezi: 'Dálkový autobus', vlak: 'Vlak', lan: 'Lanovka', lod: 'Přívoz'};
 /* skutečný typ vozu neznáme: jen druh dopravy, u 3D modelu poctivě „ilustrační“ */
 MD.label = L_ => { const id = MD.modelOf(L_); return (KINDN[L_.k] || '') + (id && MD.gm[id] ? ' · ilustrační 3D model ' + MD.MODELS[id].name : ' · ilustrační 3D model'); };
 MD.length = {bus12: 12, bus10: 10.5, bus18: 18, trol12: 12, trol18: 18, regio: 12, coach: 13, tram: 27, metro: 59, 'train-os': 52, 'train-r': 115, 'train-ic': 105, funi: 10, boat: 14};
})();
