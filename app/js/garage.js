/* ===== mhdGO – Garáž: 3D modely vozidel, která jezdí ve zvoleném okrese ===== */
(function(){
 const D = MG.D;
 const G = MG.garage = {raf: 0};
 async function libs() { for (let i = 0; i < 80 && !window.THREE; i++) await MG.sleep(100); return !!window.THREE; }
 G.open = async () => {
  if (!(await libs())) { MG.toast('3D knihovna se nenačetla'); return; }
  const oi = MG.app.cur, lines = (D.okLines.get(oi) || []).map(i => D.ln.get(i)).filter(Boolean);
  const kinds = new Map();
  for (const L_ of lines) {
   if (L_.k === 'vlak' && MG.veh.hideTrains) continue;
   const type = MG.models.typeOf(L_), liv = MG.models.livery(L_);
   const op = L_.k === 'vlak' ? (L_.a[0] || 'Vlak') : L_.k === 'regio' || L_.k === 'mezi' ? (L_.a[0] || L_.sys) : 'MHD ' + (L_.city || '');
   const key = type + '|' + JSON.stringify(liv);
   const e = kinds.get(key) || {type, liv, op, n: 0, lines: []}; e.n++; if (e.lines.length < 6) e.lines.push(L_); kinds.set(key, e);
  }
  const list = [...kinds.values()].sort((a, b) => b.n - a.n).slice(0, 18);
  const el = MG.ui.misc({icon: 'fa-solid fa-warehouse', eb: 'mhd<b>GO</b> · garáž', title: 'Vozidla v okrese ' + MG.h(D.okresy[oi].name), sub: 'Orientační 3D modely v barvách dopravců – skutečná vozidla se mohou lišit'},
   '<div class="gar-grid">' + list.map((e, i) => '<div class="gar-card"><canvas class="gar-cv" id="gcv' + i + '" width="300" height="225"></canvas><div><b>' + MG.h(MG.models.TYPES[e.type] || e.type) + '</b><small>' + MG.h(e.op) + ' · ' + e.n + ' ' + (e.n === 1 ? 'linka' : e.n < 5 ? 'linky' : 'linek') + '</small><div class="lns" style="margin-top:5px">' + e.lines.map(x => D.badge(x)).join('') + '</div></div></div>').join('') + '</div>', true);
  start(list);
  const stop = () => { cancelAnimationFrame(G.raf); G.raf = 0; };
  MG.on('sheetclose', id => { if (id === 'sh-misc') stop(); });
 };
 function start(list) {
  cancelAnimationFrame(G.raf);
  if (!G.r) { G.cv = document.createElement('canvas'); G.cv.width = 300; G.cv.height = 225; G.r = new THREE.WebGLRenderer({canvas: G.cv, antialias: true, alpha: true, preserveDrawingBuffer: true}); G.r.setPixelRatio(1); }
  const scenes = list.map(e => {
   const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, .75)); const d = new THREE.DirectionalLight(0xffffff, .7); d.position.set(.5, -.8, 1); sc.add(d);
   const m = MG.models.build(e.type, e.liv); const len = MG.models.length[e.type] || 12;
   const piv = new THREE.Group(); piv.add(m); sc.add(piv);
   const cam = new THREE.PerspectiveCamera(30, 4 / 3, .5, 800); const dist = Math.max(18, len * 1.25);
   cam.up.set(0, 0, 1); cam.position.set(dist * .78, -dist * .62, dist * .42); cam.lookAt(0, 0, 1.4);
   const ground = new THREE.Mesh(new THREE.CircleGeometry(len * .75, 40), new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: .08})); ground.position.z = .01; sc.add(ground);
   return {sc, cam, piv, cv: document.getElementById('gcv' + list.indexOf(e))};
  });
  let t = 0;
  const loop = () => {
   t += .008;
   for (const s of scenes) { if (!s.cv || !s.cv.isConnected) continue; s.piv.rotation.z = t; G.r.clear(); G.r.render(s.sc, s.cam); const ctx = s.cv.getContext('2d'); ctx.clearRect(0, 0, 300, 225); ctx.drawImage(G.cv, 0, 0); }
   G.raf = requestAnimationFrame(loop);
  };
  loop();
 }
})();
