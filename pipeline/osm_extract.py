#!/usr/bin/env python3
"""Extrakce z OSM (pbf ČR): hranice krajů/okresů/obcí, středy obcí, zastávky (nástupiště)
a železniční/tramvajová síť pro výpočet tras. Výstup: JSON/pickle do adresáře work/.
Použití: python3 osm_extract.py cz.osm.pbf work/"""
import sys, json, pickle, os, time
import osmium
from shapely import wkb as swkb
from shapely.geometry import mapping

pbf, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
t0 = time.time()
wkbf = osmium.geom.WKBFactory()

admin = []   # (level, name, ref, wkb, tags)
places = []  # (type, name, lat, lon, population)
stops = []   # (id, lat, lon, tags subset)
RAIL_OK = {'rail', 'narrow_gauge', 'light_rail', 'subway', 'tram', 'funicular'}
rail_ways = []  # (kind, [node ids], [(lat,lon)])

STOP_KEYS = ('name', 'local_ref', 'ref', 'public_transport', 'highway', 'railway', 'bus', 'tram',
             'trolleybus', 'train', 'official_name', 'ref:CIS_JR', 'ref:IDOS', 'uic_ref', 'railway:ref')

class H(osmium.SimpleHandler):
    def node(self, n):
        t = n.tags
        if 'place' in t and t.get('place') in ('city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'isolated_dwelling') and 'name' in t:
            try: pop = int(t.get('population', '0').replace(' ', ''))
            except: pop = 0
            places.append((t['place'], t['name'], n.location.lat, n.location.lon, pop))
        if (t.get('highway') == 'bus_stop' or t.get('public_transport') in ('platform', 'stop_position')
                or t.get('railway') in ('tram_stop', 'halt', 'station', 'platform')):
            stops.append(('n%d' % n.id, n.location.lat, n.location.lon, {k: t[k] for k in STOP_KEYS if k in t}))

    def way(self, w):
        t = w.tags
        rw = t.get('railway')
        if rw in RAIL_OK and t.get('service') not in ('yard', 'spur') and t.get('usage') not in ('industrial', 'military', 'test'):
            try:
                ids = [nd.ref for nd in w.nodes]
                pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes]
            except osmium.InvalidLocationError:
                return
            rail_ways.append((rw, ids, pts, t.get('oneway', '')))
        if t.get('public_transport') == 'platform' or t.get('railway') == 'platform' or t.get('highway') == 'platform':
            try:
                pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes]
            except osmium.InvalidLocationError:
                return
            if pts:
                la = sum(p[0] for p in pts) / len(pts); lo = sum(p[1] for p in pts) / len(pts)
                stops.append(('w%d' % w.id, la, lo, {k: t[k] for k in STOP_KEYS if k in t}))

    def area(self, a):
        t = a.tags
        if t.get('boundary') == 'administrative' and t.get('admin_level') in ('2', '4', '5', '8'):
            try:
                g = wkbf.create_multipolygon(a)
            except Exception:
                return
            admin.append((t.get('admin_level'), t.get('name', ''), t.get('ref', ''), g,
                          {k: t[k] for k in ('name', 'ref', 'admin_level', 'population', 'ref:lau', 'ref:nuts', 'ref:nuts:3', 'ref:nuts:4', 'wikidata', 'short_name') if k in t}))

h = H()
h.apply_file(pbf, locations=True, idx='flex_mem')
print('pass done', time.time() - t0, 'admin', len(admin), 'places', len(places), 'stops', len(stops), 'rail', len(rail_ways), flush=True)
pickle.dump(admin, open(os.path.join(out, 'admin.pkl'), 'wb'))
pickle.dump(places, open(os.path.join(out, 'places.pkl'), 'wb'))
pickle.dump(stops, open(os.path.join(out, 'osm_stops.pkl'), 'wb'))
pickle.dump(rail_ways, open(os.path.join(out, 'rail_ways.pkl'), 'wb'))
print('saved', time.time() - t0)
