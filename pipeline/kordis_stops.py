#!/usr/bin/env python3
"""Názvy uzlů (zastávek) IDS JMK pro živý stream poloh Brno/JMK (data.brno.cz, FinalStopID → název).
Zdroj: otevřený GTFS KORDIS JMK (kordis-jmk.cz/gtfs/gtfs.zip, CC BY 4.0).
Použití: python3 kordis_stops.py <gtfs.zip> <out_dir>"""
import sys, zipfile, csv, io, json, re, os
z = zipfile.ZipFile(sys.argv[1])
names = {}
for r in csv.DictReader(io.TextIOWrapper(z.open('stops.txt'), 'utf-8-sig')):
    m = re.match(r'U(\d+)[ZN]', r['stop_id'])
    if m and m.group(1) not in names: names[m.group(1)] = r['stop_name']
os.makedirs(sys.argv[2], exist_ok=True)
json.dump(names, open(os.path.join(sys.argv[2], 'kordis_stops.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('kordis nodes', len(names))
