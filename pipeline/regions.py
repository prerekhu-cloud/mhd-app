#!/usr/bin/env python3
"""Fáze 2: kraje, okresy a obce z OSM; přiřazení zastávek k okresům; okresní města a středy obcí.
Použití: python3 regions.py <work_dir>"""
import sys, os, pickle, json, re, time, collections, unicodedata
from shapely import wkb as swkb
from shapely.geometry import Point, mapping
from shapely.strtree import STRtree
from shapely.ops import unary_union
import shapely

work = sys.argv[1]
t0 = time.time()
def log(*a): print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

admin = pickle.load(open(os.path.join(work, 'admin.pkl'), 'rb'))
if os.path.exists(os.path.join(work, 'admin45.pkl')):
    admin = [a for a in admin if a[0] not in ('2', '4', '5')] + pickle.load(open(os.path.join(work, 'admin45.pkl'), 'rb'))
places = pickle.load(open(os.path.join(work, 'places.pkl'), 'rb'))
G = pickle.load(open(os.path.join(work, 'gtfs.pkl'), 'rb'))

def fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

geoms = []
for lvl, name, ref, g, tags in admin:
    try:
        geom = swkb.loads(g, hex=True) if isinstance(g, str) else swkb.loads(bytes(g))
    except Exception:
        continue
    if not geom.is_valid:
        geom = geom.buffer(0)
    geoms.append((lvl, name, ref, geom, tags))
cz = [g for g in geoms if g[0] == '2' and (g[4].get('name') in ('Česko', 'Česká republika'))]
log('admin', collections.Counter(g[0] for g in geoms), 'cz', len(cz))
CZ = cz[0][3] if cz else None
def in_cz(geom):
    return CZ is None or CZ.contains(geom.representative_point())

kraje = [g for g in geoms if g[0] == '4' and in_cz(g[3])]
okresy = [g for g in geoms if g[0] == '5' and in_cz(g[3]) and not g[1].startswith('obvod ')]
obce = [g for g in geoms if g[0] == '8' and in_cz(g[3])]
log('kraje', len(kraje), 'okresy', len(okresy), 'obce', len(obce))
# Praha: kraj i okres zároveň
if not any('Praha' == o[1].replace('okres ', '') or 'Hlavní' in o[1] for o in okresy):
    pk = [k for k in kraje if k[1] in ('Praha', 'Hlavní město Praha')]
    if pk:
        okresy.append(('7', 'Hlavní město Praha', 'CZ0100', pk[0][3], {'name': 'Hlavní město Praha', 'ref:lau': 'CZ0100'}))

kraj_tree = STRtree([k[3] for k in kraje])
def kraj_of(geom):
    p = geom.representative_point()
    for i in kraj_tree.query(p):
        if kraje[i][3].contains(p):
            return int(i)
    best = min(range(len(kraje)), key=lambda i: kraje[i][3].distance(p))
    return best

KRAJ_SHORT = {
    'Hlavní město Praha': ('PHA', 'Praha'), 'Praha': ('PHA', 'Praha'), 'Středočeský kraj': ('STC', 'Středočeský'), 'Jihočeský kraj': ('JHC', 'Jihočeský'),
    'Plzeňský kraj': ('PLK', 'Plzeňský'), 'Karlovarský kraj': ('KVK', 'Karlovarský'), 'Ústecký kraj': ('ULK', 'Ústecký'),
    'Liberecký kraj': ('LBK', 'Liberecký'), 'Královéhradecký kraj': ('HKK', 'Královéhradecký'), 'Pardubický kraj': ('PAK', 'Pardubický'),
    'Kraj Vysočina': ('VYS', 'Vysočina'), 'Jihomoravský kraj': ('JHM', 'Jihomoravský'), 'Olomoucký kraj': ('OLK', 'Olomoucký'),
    'Zlínský kraj': ('ZLK', 'Zlínský'), 'Moravskoslezský kraj': ('MSK', 'Moravskoslezský')}
KRAJ_ORDER = ['PHA', 'STC', 'JHC', 'PLK', 'KVK', 'ULK', 'LBK', 'HKK', 'PAK', 'VYS', 'JHM', 'OLK', 'ZLK', 'MSK']

# místa (place nody)
pl_by_name = collections.defaultdict(list)
for typ, name, lat, lon, pop in places:
    pl_by_name[fold(name)].append((typ, name, lat, lon, pop))
RANK = {'city': 0, 'town': 1, 'village': 2, 'hamlet': 3, 'suburb': 4, 'quarter': 5, 'neighbourhood': 6, 'isolated_dwelling': 7}

def seat_name(okres_name):
    n = okres_name.replace('Okres ', '').replace('okres ', '').strip()
    if 'Praha' in n: return 'Praha'
    n = re.sub(r'-(město|venkov|jih|sever|východ|západ)$', '', n)
    return n

def find_place(name, geom=None, near=None):
    cands = pl_by_name.get(fold(name), [])
    if geom is not None:
        inside = [c for c in cands if geom.buffer(0.02).contains(Point(c[3], c[2]))]
        if inside: cands = inside
    if near is not None and cands:
        cands = sorted(cands, key=lambda c: (RANK.get(c[0], 9), (c[2] - near[0]) ** 2 + (c[3] - near[1]) ** 2))
    else:
        cands = sorted(cands, key=lambda c: (RANK.get(c[0], 9), -c[4]))
    return cands[0] if cands else None

def simp(geom, tol):
    g = geom.simplify(tol, preserve_topology=True)
    if g.geom_type == 'Polygon':
        polys = [g]
    else:
        polys = sorted(g.geoms, key=lambda x: -x.area)
        big = polys[0].area
        polys = [p for p in polys if p.area > big * 0.02]
    out = []
    for p in polys:
        out.append([[round(x, 4), round(y, 4)] for x, y in p.exterior.coords])
    return out

# --- kraje ---
K = []
for i, (lvl, name, ref, geom, tags) in enumerate(kraje):
    code, short = KRAJ_SHORT.get(name, (ref or name[:3].upper(), name))
    K.append({'i': i, 'code': code, 'name': name, 'short': short, 'nuts': tags.get('ref:nuts:3', ref), 'geom': geom})
K.sort(key=lambda k: KRAJ_ORDER.index(k['code']) if k['code'] in KRAJ_ORDER else 99)
kraj_pos = {k['i']: j for j, k in enumerate(K)}

# --- okresy ---
O = []
for lvl, name, ref, geom, tags in okresy:
    nm = name.replace('okres ', '').replace('Okres ', '')
    if nm == 'Hlavní město Praha': nm = 'Praha'
    kj = kraj_pos[kraj_of(geom)]
    seat = seat_name(nm)
    c = geom.representative_point()
    pl = find_place(seat, geom=K[kj]['geom'], near=(c.y, c.x))
    seat_ll = [round(pl[2], 6), round(pl[3], 6)] if pl else [round(c.y, 6), round(c.x, 6)]
    code = tags.get('ref:lau') or tags.get('ref:nuts:4') or ref or ''
    O.append({'name': nm, 'code': code, 'kraj': kj, 'geom': geom, 'seat': seat if pl else nm, 'seatll': seat_ll,
              'bbox': [round(v, 4) for v in geom.bounds]})
O.sort(key=lambda o: (o['kraj'], fold(o['name'])))
for j, o in enumerate(O):
    o['id'] = j
    o['slug'] = fold(o['name']).replace(' ', '-')
okres_tree = STRtree([o['geom'] for o in O])
log('okresy', len(O), [o['name'] for o in O][:10])

def okres_of_pt(lon, lat):
    p = Point(lon, lat)
    for i in okres_tree.query(p):
        if O[i]['geom'].contains(p):
            return int(i)
    return -1

# --- zastávky -> okres ---
st_okres = []
for s in G['stations']:
    st_okres.append(okres_of_pt(s['lon'], s['lat']) if s['lat'] is not None else -1)
log('stations assigned', sum(1 for x in st_okres if x >= 0), 'outside', sum(1 for x in st_okres if x < 0))

# --- obce ---
obce_out = collections.defaultdict(list)
for lvl, name, ref, geom, tags in obce:
    c = geom.representative_point()
    oi = okres_of_pt(c.x, c.y)
    if oi < 0: continue
    pl = find_place(name, geom=geom, near=(c.y, c.x))
    if pl and geom.buffer(0.005).contains(Point(pl[3], pl[2])):
        ctr = [round(pl[2], 6), round(pl[3], 6)]
    else:
        ctr = [round(c.y, 6), round(c.x, 6)]
    try: pop = int(tags.get('population', '0'))
    except: pop = 0
    obce_out[oi].append({'name': name, 'c': ctr, 'pop': pop, 'poly': simp(geom, 0.0012)})
log('obce assigned', sum(len(v) for v in obce_out.values()))

# okresní město = obec se stejným názvem (střed obce)
for o in O:
    for ob in obce_out.get(o['id'], []):
        if fold(ob['name']) == fold(o['seat']):
            o['seatll'] = ob['c']; break
    else:
        # Praha-východ/západ, Brno-venkov…: sídlo mimo okres
        for oo in O:
            for ob in obce_out.get(oo['id'], []):
                if fold(ob['name']) == fold(o['seat']):
                    o['seatll'] = ob['c']; break

out = {
    'kraje': [{'code': k['code'], 'name': k['name'], 'short': k['short'], 'nuts': k['nuts'],
               'bbox': [round(v, 4) for v in k['geom'].bounds]} for k in K],
    'okresy': [{'id': o['id'], 'name': o['name'], 'slug': o['slug'], 'code': o['code'], 'kraj': o['kraj'], 'seat': o['seat'],
                'seatll': o['seatll'], 'bbox': o['bbox']} for o in O],
}
geo = {'okresy': [simp(o['geom'], 0.0025) for o in O], 'kraje': [simp(k['geom'], 0.004) for k in K],
       'cz': simp(CZ, 0.004) if CZ is not None else None}
pickle.dump({'regions': out, 'geo': geo, 'st_okres': st_okres, 'obce': dict(obce_out),
             'okres_geoms': [o['geom'] for o in O], 'kraj_geoms': [k['geom'] for k in K]},
            open(os.path.join(work, 'regions.pkl'), 'wb'))
log('saved')
for o in O[:80]:
    print(o['id'], o['name'], O and K[o['kraj']]['code'], o['seat'], o['seatll'])
