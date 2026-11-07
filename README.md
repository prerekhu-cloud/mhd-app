# mhdGO – veřejná doprava celé České republiky

Nástupce aplikace **OpavaGO** pro celou ČR: stejný vzhled (liquid glass, měděný akcent, písmo Outfit) a stejné ovládání,
ale pro všechna města, regionální a meziregionální autobusy a všechny vlaky.

Aplikace je **jeden HTML soubor** – [`mhdgo.html`](mhdgo.html) (totéž je v `index.html` pro GitHub Pages).
Jízdní řády si stahuje po okresech z adresáře [`data/`](data) tohoto repozitáře (přes `raw.githubusercontent.com`).

## Funkce

- **Start v tvém okrese** – podle polohy; bez povolení polohy se vybere náhodný okres a po povolení se mapa přepne na tvůj okres.
- **Celá ČR / Vycentrovat** – pohled na celou republiku s hranicemi okresů (klepnutím okres otevřeš), návrat na tvůj okres
  (bez polohy na celou ČR). Ve 3D Vycentrovat vrací pohled na centrum tvé obce (bez polohy na centrum náhodného okresního města).
- **Dopravní síť okresu** – linky podle druhu (metro, tramvaje, trolejbusy, MHD, regionální, meziregionální, vlaky), rozbalení linky
  ukáže trasu po silnicích/kolejích se zastávkami, **Otočit směr**, varianty tras, přestupy a odkaz na oficiální jízdní řád.
- **Zastávky a nástupiště** – každá zastávka má všechna svá nástupiště (zobrazí se po přiblížení, s písmenem a směrem).
- **Vozidla** – všechny spoje jezdí na mapě podle jízdního řádu; kde jsou živá data, ukazuje se skutečná poloha a zpoždění
  (✓ včas, +N min). Karta vozidla: linka, směr, zpoždění, 4 příští zastávky s časy a trasa do cílové zastávky.
- **Odjezdy** z libovolné zastávky v ČR (i na jiný den a čas), filtr linek a nástupišť, živá zpoždění.
- **Hledání** zastávek v celé ČR, adres a míst (Photon) a **vyhledání spojení** (RAPTOR) s přestupy, pěšími přesuny a vlaky mezi okresy.
- **Barvy linek** – MHD v každém městě má vlastní barvy (stejný princip jako OpavaGO – Opava má přesně původní barvy),
  regionální a meziregionální linky mají podobnou barvu s odstínem podle okresu, každý vlak má vlastní barvu.
- **3D mapa** (Mapbox Standard s 3D budovami) s procedurálními 3D modely vozidel v barvách dopravců
  (autobus 12 m, kloubový, midibus, trolejbusy, regionální a dálkové autobusy, tramvaje, metro, osobní vlaky, rychlíky, dálkové vlaky),
  denní doba, déšť a sníh, **Jízda vozidlem** (kamera za vozidlem) a **Garáž** s modely vozidel okresu.
- **Bedekr** – nejlepší památky a zajímavosti Česka; lišta krajů → to nejlepší v kraji → lišta okresů → místa v okrese
  (včetně méně známých). Fotografie z Wikimedia Commons, text z Wikipedie, galerie, „Jak se tam dostanu“.
- Měřítko, hodiny, kompas, legenda, počasí, tmavý režim, Moje místa; funguje na mobilu na výšku i na šířku i na počítači.

## Data

| Co | Zdroj |
|----|-------|
| Jízdní řády všech linek a vlaků | CIS JŘ – GTFS projektu Spojenka (MFF UK), `spojenka.d3s.mff.cuni.cz` |
| Nástupiště | CIS JŘ (PID, IDS JMK, IDOL, ODIS, PMDP), chybějící dopočítána ze sloupků OpenStreetMap podle směru jízdy |
| Trasy linek | PID GTFS (shapes), ostatní dopočítány po silnicích (Valhalla nad OSM) a po kolejích (vlastní graf z OSM) |
| Hranice krajů, okresů a obcí, středy obcí | OpenStreetMap |
| Bedekr | Wikidata, Wikipedie, Wikimedia Commons |
| Živé polohy | Správa železnic (vlaky celé ČR, přímo z prohlížeče), ODIS (přes worker), volitelně vlastní worker |

Struktura `data/`:

- `core.json` – kraje, okresy, kalendáře (bitové masky dní), metadata
- `geo.json` – zjednodušené hranice okresů, krajů a ČR
- `stops.json` – index všech ~40 tis. zastávek pro hledání
- `okres/<id>.json` – balíček okresu: zastávky, nástupiště, linky, vzory tras s geometrií, jízdní řády, obce
- `dalkove.json` – všechny vlaky a meziregionální linky (pro hledání spojení mezi okresy)
- `bedekr.json` – památky a místa po okresech

## Mapbox token

GitHub (push protection) nedovolí uložit Mapbox token do repozitáře, proto v `mhdgo.html` v repozitáři není.
Bez tokenu aplikace použije podklady CARTO/OpenStreetMap a Esri (letecké) a 3D mapa nejde spustit.
Token se dá zadat:

- v aplikaci: **Více → Nastavení → Mapbox token** (uloží se v prohlížeči), nebo
- jednorázově v adrese: `mhdgo.html#mapbox=pk.…`, nebo
- při sestavení: `MAPBOX_TOKEN=pk.… python3 app/build.py` vytvoří `dist/mhdgo.html` s vloženým tokenem (není v gitu).

## Živé polohy pro další systémy (worker)

[`worker/mhdgo-worker.js`](worker/mhdgo-worker.js) je Cloudflare Worker, který sjednocuje polohy:
ODIS (celý Moravskoslezský kraj, záloha přes stávající proxy OpavaGO), PID přes Golemio (`GOLEMIO_TOKEN`),
IDS JMK (`IDSJMK_URL`), vlaky SŽ a další portály CHAPS (`MPVNET_PORTALS`).

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GOLEMIO_TOKEN   # volitelně, token zdarma na api.golemio.cz
```

Adresu workeru pak vlož v aplikaci: **Více → Nastavení → Živé polohy a worker**.

## Aktualizace jízdních řádů

Data platí od data sestavení zhruba 5–6 týdnů (CIS JŘ publikuje dopředu; 13. 12. 2026 je celostátní změna jízdních řádů).
Workflow [`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) data každé pondělí přepočítá a uloží
(ručně: Actions → „Aktualizace dat mhdGO“ → Run workflow). Lokálně: `pipeline/build_all.sh` (potřebuje ~6 GB RAM).

Pipeline (Python 3.12+, `pip install osmium shapely numpy scipy pandas pyvalhalla`):

1. `osm_extract.py`, `osm_admin.py` – hranice, středy obcí, zastávkové sloupky, koleje z OSM
2. `gtfs_load.py` – načtení CIS JŘ, vzory tras, jízdní profily, kalendáře
3. `regions.py` – kraje, okresy, obce, přiřazení zastávek
4. `platforms.py` – rozdělení zastávek na nástupiště podle směru a umístění podle OSM
5. `shapes.py` – geometrie tras (PID, koleje, Valhalla)
6. `packs.py` – výstupní balíčky (barvy linek, klasifikace MHD/regio/meziregio/vlak)
7. `bedekr.py` – památky z Wikidat
8. `app/build.py` – sestavení `mhdgo.html` z `app/` (CSS, JS, ikona a logo)

## Vývoj aplikace

Zdrojové soubory jsou v `app/` (`index.html`, `css/`, `js/`), `python3 app/build.py` z nich vytvoří jediný soubor.
Lokálně: `python3 -m http.server` v kořeni repozitáře a otevřít `http://localhost:8000/mhdgo.html`.

Licence dat: CIS JŘ (veřejná data), PID (CC BY 4.0), OpenStreetMap (ODbL), Wikidata (CC0), Wikipedie/Commons (CC BY-SA, autoři u fotografií).
