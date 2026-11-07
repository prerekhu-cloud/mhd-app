#!/usr/bin/env python3
"""Rychlá extrakce jen správních hranic (úrovně 2, 4, 5) do work/admin45.pkl."""
import sys, os, pickle, time
import osmium
pbf, out = sys.argv[1], sys.argv[2]
t0 = time.time(); wkbf = osmium.geom.WKBFactory(); res = []
fp = (osmium.FileProcessor(pbf)
      .with_areas(osmium.filter.TagFilter(('admin_level', '2'), ('admin_level', '4'), ('admin_level', '5')))
      .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)))
for a in fp:
    t = a.tags
    if t.get('boundary') != 'administrative' or t.get('admin_level') not in ('2', '4', '5'): continue
    try: g = wkbf.create_multipolygon(a)
    except Exception: continue
    res.append((t.get('admin_level'), t.get('name', ''), t.get('ref', ''), g,
                {k: t[k] for k in ('name', 'ref', 'admin_level', 'population', 'ref:lau', 'ref:nuts', 'ref:nuts:3', 'ref:nuts:4', 'wikidata', 'short_name') if k in t}))
pickle.dump(res, open(os.path.join(out, 'admin45.pkl'), 'wb'))
print('done', len(res), time.time() - t0)
