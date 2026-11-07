#!/usr/bin/env python3
"""Bedekr: památky a zajímavosti ČR z Wikidat (s fotkou a souřadnicí), přiřazené k okresům.
Výstup: data/bedekr.json  {types:[...], places:[[qid, název, popis, lat, lon, foto, kategorie_commons, článek_cs, typ, okres, skóre, příznaky]]}
Použití: python3 bedekr.py <work_dir> <out_dir>"""
import sys, os, json, time, pickle, urllib.request, urllib.parse, collections, re
from shapely.geometry import Point
from shapely.strtree import STRtree

work, out = sys.argv[1], sys.argv[2]
UA = 'mhdGO-build/1.0 (https://github.com/prerekhu-cloud/mhd-app)'
EP = 'https://query.wikidata.org/sparql'

# typ -> (třídy Wikidat, váha)
TYPES = [
    ('hrad', ['Q23413', 'Q17715832', 'Q57831', 'Q11863091'], 8),
    ('zámek', ['Q751876', 'Q16560', 'Q1408475'], 8),
    ('církevní', ['Q16970', 'Q2977', 'Q44613', 'Q34627', 'Q108325', 'Q15135589', 'Q1623136'], 3),
    ('muzeum', ['Q33506', 'Q756102', 'Q1254933', 'Q164419', 'Q1491852'], 4),
    ('příroda', ['Q35509', 'Q34038', 'Q1404150', 'Q1361400', 'Q8502', 'Q23397', 'Q46169', 'Q8545897', 'Q2551525', 'Q3253281'], 5),
    ('rozhledna', ['Q1440300', 'Q12518'], 6),
    ('zahrada', ['Q43501', 'Q167346', 'Q22698', 'Q1107656'], 4),
    ('město', ['Q174782', 'Q543654', 'Q12280', 'Q26789694', 'Q179700', 'Q1341387', 'Q131734', 'Q38720', 'Q1054650', 'Q88598'], 3),
]
HER = {'Q9259': 'unesco', 'Q43113623': 'unesco', 'Q649434': 'nkp', 'Q30118401': 'nkp', 'Q385405': 'kp'}

CACHE = os.path.join(work, 'wd_cache'); os.makedirs(CACHE, exist_ok=True)
_last = [0.0]
def sparql(q, tries=6):
    import hashlib
    cf = os.path.join(CACHE, hashlib.md5(q.encode()).hexdigest() + '.json')
    if os.path.exists(cf): return json.load(open(cf))
    for i in range(tries):
        wait = 62 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(EP + '?' + urllib.parse.urlencode({'query': q}),
                                         headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.load(r)['results']['bindings']
            json.dump(res, open(cf, 'w')); return res
        except Exception as e:
            print('retry', i, e, flush=True)
    return []

Q = '''SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?links ?cat ?article (GROUP_CONCAT(DISTINCT ?h;separator=",") AS ?hers) WHERE {
  VALUES ?cls { %s }
  ?item wdt:P31 ?cls ; wdt:P17 wd:Q213 ; wdt:P625 ?coord ; wdt:P18 ?image ; wikibase:sitelinks ?links .
  FILTER(?links >= %d)
  OPTIONAL { ?item wdt:P373 ?cat }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?item wdt:P1435 ?h }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
} GROUP BY ?item ?itemLabel ?itemDescription ?coord ?image ?links ?cat ?article'''

QH = '''SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?links ?cat ?article (GROUP_CONCAT(DISTINCT ?h;separator=",") AS ?hers) WHERE {
  VALUES ?h0 { wd:Q9259 wd:Q43113623 wd:Q649434 wd:Q30118401 }
  ?item wdt:P1435 ?h0 ; wdt:P625 ?coord ; wdt:P18 ?image ; wikibase:sitelinks ?links .
  ?item wdt:P17 wd:Q213 .
  OPTIONAL { ?item wdt:P373 ?cat }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?item wdt:P1435 ?h }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
} GROUP BY ?item ?itemLabel ?itemDescription ?coord ?image ?links ?cat ?article'''

items = {}
def add(rows, typ, w):
    for b in rows:
        q = b['item']['value'].rsplit('/', 1)[-1]
        m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', b['coord']['value'])
        if not m: continue
        lon, lat = float(m.group(1)), float(m.group(2))
        img = urllib.parse.unquote(b['image']['value'].rsplit('/', 1)[-1])
        hers = {HER[h.rsplit('/', 1)[-1]] for h in b.get('hers', {}).get('value', '').split(',') if h and h.rsplit('/', 1)[-1] in HER}
        art = urllib.parse.unquote(b['article']['value'].rsplit('/', 1)[-1]) if 'article' in b else ''
        it = items.get(q)
        if it is None:
            items[q] = it = {'q': q, 'name': b['itemLabel']['value'], 'desc': b.get('itemDescription', {}).get('value', ''),
                             'lat': lat, 'lon': lon, 'img': img, 'cat': b.get('cat', {}).get('value', ''), 'art': art,
                             'links': int(b['links']['value']), 'types': set(), 'w': 0, 'her': set()}
        if typ: it['types'].add(typ); it['w'] = max(it['w'], w)
        it['her'] |= hers

for typ, classes, w in TYPES:
    vals = ' '.join('wd:' + c for c in classes)
    minl = 2 if typ in ('hrad', 'zámek', 'rozhledna', 'příroda') else 3
    rows = sparql(Q % (vals, minl))
    print(typ, len(rows), flush=True)
    add(rows, typ, w)
rows = sparql(QH); print('heritage', len(rows)); add(rows, None, 0)

RG = pickle.load(open(os.path.join(work, 'regions.pkl'), 'rb'))
geoms = RG['okres_geoms']; tree = STRtree(geoms)
def okres_of(lon, lat):
    p = Point(lon, lat)
    for i in tree.query(p):
        if geoms[i].contains(p): return int(i)
    return -1

places = []
for it in items.values():
    o = okres_of(it['lon'], it['lat'])
    if o < 0: continue
    typ = sorted(it['types'], key=lambda t: -dict((a, c) for a, b, c in TYPES)[t])[0] if it['types'] else 'památka'
    score = it['links'] * 1.0 + it['w'] * 2 + (60 if 'unesco' in it['her'] else 0) + (18 if 'nkp' in it['her'] else 0) + (2 if 'kp' in it['her'] else 0)
    if not it['art']: score *= 0.6
    flags = ''.join(sorted(('U' if 'unesco' in it['her'] else '') + ('N' if 'nkp' in it['her'] else '')))
    places.append([it['q'], it['name'], it['desc'], round(it['lat'], 5), round(it['lon'], 5), it['img'], it['cat'], it['art'], typ, o, round(score, 1), flags])
# každému okresu max. 24 nejlepších (méně známé taky – i s nižším skóre)
byo = collections.defaultdict(list)
for p in places: byo[p[9]].append(p)
final = []
for o, ps in byo.items():
    ps.sort(key=lambda p: -p[10])
    # odstraň duplicitní názvy / téměř shodné polohy
    seen = []; keep = []
    for p in ps:
        if any(abs(p[3] - s[3]) < 0.0006 and abs(p[4] - s[4]) < 0.0009 for s in seen): continue
        seen.append(p); keep.append(p)
        if len(keep) >= 24: break
    final += keep
final.sort(key=lambda p: -p[10])
json.dump({'v': 1, 'built': time.strftime('%Y-%m-%d'), 'places': final}, open(os.path.join(out, 'bedekr.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('places', len(final), 'okresy', len(byo), 'of', len(places))
