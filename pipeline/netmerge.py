#!/usr/bin/env python3
"""Sloučení souběžných tras do jedné čáry (jako síť v OpavaGO).
Pro každý okres vezme trasy linek (hlavní varianty), zhustí je, přichytí body k už existujícím uzlům
v okruhu R metrů (dvě strany silnice, oba směry, víc linek v jedné ulici -> jedna čára), ze vzniklého grafu
složí souvislé úseky a zjednoduší je. Výsledek uloží do balíčku okresu jako "net": {mhd, regio, vlak}.
Použití: python3 netmerge.py <adresář s okres/*.json>"""
import sys, os, json, math, glob, time, collections

LAT0 = 49.8; KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
CAT = {'mhd': 'mhd', 'trol': 'mhd', 'tram': 'mhd', 'metro': 'mhd', 'lan': 'mhd', 'lod': 'mhd', 'regio': 'regio', 'mezi': 'regio', 'vlak': 'vlak'}
R = {'mhd': 14.0, 'regio': 16.0, 'vlak': 22.0}
STEP = {'mhd': 6.0, 'regio': 9.0, 'vlak': 12.0}

def dec(s):
    out = []; i = la = lo = 0
    while i < len(s):
        v = []
        for _ in range(2):
            sh = r = 0
            while True:
                b = ord(s[i]) - 63; i += 1; r |= (b & 31) << sh; sh += 5
                if b < 32: break
            v.append(~(r >> 1) if r & 1 else r >> 1)
        la += v[0]; lo += v[1]; out.append((la / 1e5, lo / 1e5))
    return out

def enc_num(v):
    v = ~(v << 1) if v < 0 else (v << 1); o = []
    while v >= 0x20: o.append(chr((0x20 | (v & 0x1f)) + 63)); v >>= 5
    o.append(chr(v + 63)); return ''.join(o)

def enc(pts):
    o = []; pa = pb = 0
    for la, lo in pts:
        a = int(round(la * 1e5)); b = int(round(lo * 1e5)); o.append(enc_num(a - pa)); o.append(enc_num(b - pb)); pa, pb = a, b
    return ''.join(o)

def simplify(P, tol):
    if len(P) < 3: return P
    keep = [False] * len(P); keep[0] = keep[-1] = True; st = [(0, len(P) - 1)]
    while st:
        a, b = st.pop()
        if b <= a + 1: continue
        (x1, y1), (x2, y2) = P[a], P[b]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-9
        bi, bd = -1, 0
        for i in range(a + 1, b):
            x, y = P[i]; d = abs(dx * (y - y1) - dy * (x - x1)) / L
            if d > bd: bd, bi = d, i
        if bd > tol: keep[bi] = True; st.append((a, bi)); st.append((bi, b))
    return [p for p, k in zip(P, keep) if k]

def merge(polys, r, step):
    """polys: seznam polylinií v metrech (x,y). Vrací seznam sloučených polylinií."""
    cell = r
    grid = collections.defaultdict(list)
    nodes = []
    edges = set()
    r2 = r * 1.8; cell = r2
    def near(x, y, rr):
        cx, cy = int(x // cell), int(y // cell); best = None; bd = rr * rr
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for n in grid.get((cx + i, cy + j), ()):
                    nx, ny = nodes[n]; d = (nx - x) ** 2 + (ny - y) ** 2
                    if d < bd: bd, best = d, n
        return best
    for P in polys:
        prev = None; stuck = False
        for k in range(len(P)):
            x0, y0 = P[k]
            pts = [(x0, y0)]
            if k + 1 < len(P):
                x1, y1 = P[k + 1]; L = math.hypot(x1 - x0, y1 - y0); m = int(L // step)
                pts += [(x0 + (x1 - x0) * t / (m + 1), y0 + (y1 - y0) * t / (m + 1)) for t in range(1, m + 1)]
            for x, y in pts:
                n = near(x, y, r2 if stuck else r)
                if n is None:
                    n = len(nodes); nodes.append((x, y)); grid[(int(x // cell), int(y // cell))].append(n); stuck = False
                else:
                    stuck = True
                if prev is not None and n != prev:
                    edges.add((prev, n) if prev < n else (n, prev))
                prev = n
    adj = collections.defaultdict(set)
    for a, b in edges: adj[a].add(b); adj[b].add(a)
    used = set(); out = []
    def walk(a, b):
        line = [a, b]; used.add((a, b) if a < b else (b, a))
        while len(adj[b]) == 2:
            nb = [c for c in adj[b] if c != line[-2]]
            if not nb: break
            c = nb[0]; e = (b, c) if b < c else (c, b)
            if e in used: break
            used.add(e); line.append(c); b = c
        return line
    for a in list(adj):
        if len(adj[a]) != 2:
            for b in adj[a]:
                e = (a, b) if a < b else (b, a)
                if e not in used: out.append(walk(a, b))
    for a, b in edges:  # zbylé cykly
        if (a, b) not in used: out.append(walk(a, b))
    return [[nodes[i] for i in ln] for ln in out]

def run(path):
    pk = json.load(open(path, encoding='utf-8'))
    lines = {l['i']: l for l in pk['ln']}
    by = collections.defaultdict(list)
    for p in pk['pt']:
        L_ = lines.get(p['l'])
        if not L_ or not p.get('g'): continue
        by[(p['l'], p['d'])].append(p)
    cats = collections.defaultdict(list)
    for (li, d), ps in by.items():
        L_ = lines[li]; c = CAT.get(L_['k'], 'regio')
        ps.sort(key=lambda p: -len(p['t']))
        tot = sum(len(p['t']) for p in ps)
        sel = [p for i, p in enumerate(ps) if i < 2 or len(p['t']) >= tot * .15]
        for p in sel: cats[c].append((len(p['t']), p['g']))
    net = {}
    for c, items in cats.items():
        items.sort(key=lambda x: -x[0])
        polys = [[(lo * KX, la * KY) for la, lo in dec(g)] for _, g in items]
        merged = merge(polys, R[c], STEP[c])
        res = []
        for ln in merged:
            s = simplify(ln, 2.5)
            if len(s) >= 2: res.append(enc([(y / KY, x / KX) for x, y in s]))
        net[c] = res
    pk['net'] = net
    json.dump(pk, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return {c: len(v) for c, v in net.items()}

if __name__ == '__main__':
    d = sys.argv[1]
    files = sorted(glob.glob(os.path.join(d, 'okres', '*.json')), key=lambda f: int(os.path.basename(f)[:-5]))
    if len(sys.argv) > 2: files = [os.path.join(d, 'okres', x + '.json') for x in sys.argv[2:]]
    for f in files:
        t = time.time(); r = run(f)
        print(os.path.basename(f), r, '%.1fs' % (time.time() - t), flush=True)
