/* ===== mhdGO – jízdné: integrované systémy krajů, ceníky a nákup =====
 Konkrétní ceny uvádíme jen tam, kde se shodují oficiální tarif a další zdroje (s datem platnosti).
 Jinde je odkaz na oficiální ceník – tarify se v roce 2026 v několika krajích měnily. Ověřeno v listopadu 2026. */
(function(){
 const T = MG.tickets = {};
 const IDOS = 'https://idos.cz/vlakyautobusymhdvse/spojeni/';
 T.SYS = [
  {id: 'PID', name: 'PID', full: 'Pražská integrovaná doprava', kraje: ['PHA', 'STC'], web: 'https://pid.cz/',
   links: [['Tarif PID od 1. 1. 2026 (PDF)', 'https://pid.cz/wp-content/uploads/ke-stazeni/tarif/Tarif_PID_2026-01-01.pdf'], ['Nový tarif 2026 – vysvětlení', 'https://pid.cz/neplatvicnezmusis/']],
   buy: [['fa-mobile-screen', 'Aplikace PID Lítačka', 'nejlevnější jednotlivé jízdné'], ['fa-ticket', 'Papírová jízdenka', 'automaty a předprodej'], ['fa-comment-sms', 'SMS jízdenka', 'jen v Praze, nejdražší varianta']],
   prices: {title: 'Praha (pásma P, 0, B) – základní jízdné', valid: 'platí od 1. 1. 2026', cols: ['Lítačka', 'papír', 'SMS'], rows: [['30 minut', 36, 39, 42], ['90 minut', 46, 50, 55]],
    note: 'Zlevněné jízdné: 30 min 18 / 19 Kč, 90 min 23 / 25 Kč (Lítačka / papír). Mimo Prahu se cena řídí počtem pásem.'}},
  {id: 'IDSJMK', name: 'IDS JMK', full: 'Integrovaný dopravní systém Jihomoravského kraje', kraje: ['JHM'], web: 'https://www.idsjmk.cz/',
   links: [['Tarif IDS JMK (PDF)', 'https://content.idsjmk.cz/cenik/Tarif.pdf'], ['E-shop a elektronické jízdenky', 'https://www.idsjmk.cz/a/eoc.html']],
   buy: [['fa-globe', 'E-shop a elektronické jízdenky IDS JMK', 'jízdenky do mobilu i předplatné'], ['fa-ticket', 'Papírová jízdenka', 'automaty a předprodej']],
   tip: 'Nový tarif IDS JMK platí od 1. 10. 2026 – aktuální ceny jsou v tarifu.'},
  {id: 'ODIS', name: 'ODIS', full: 'Ostravský dopravní integrovaný systém', kraje: ['MSK'], web: 'https://www.odis.cz/',
   links: [['Koordinátor KODIS', 'https://www.kodis.cz/'], ['24hodinové a 3denní jízdné', 'https://www.kodis.cz/24hodinove-a-3denni-jizdne'], ['Ceny jízdenek DPO (Ostrava)', 'https://www.dpo.cz/pro-cestujici/jizdne-dp/ceny-jizdenek.html']],
   buy: [['fa-globe', 'Elektronické jízdenky ODIS', 'informace na odis.cz'], ['fa-comment-sms', 'SMS jízdenka', 'Ostrava'], ['fa-ticket', 'Papírová jízdenka', 'automaty, předprodej, u řidiče']]},
  {id: 'IDOL', name: 'IDOL', full: 'Integrovaná doprava Libereckého kraje', kraje: ['LBK'], web: 'https://www.iidol.cz/',
   buy: [['fa-mobile-screen', 'Aplikace Idolka', 'jednotlivé i časové jízdenky do mobilu'], ['fa-globe', 'E-shop IDOL', 'jen časové a síťové jízdenky'], ['fa-ticket', 'Jízdenka u řidiče nebo v automatu', 'přestupní jízdenky mají QR kód']]},
  {id: 'DUK', name: 'DÚK', full: 'Doprava Ústeckého kraje', kraje: ['ULK'], web: 'https://www.dopravauk.cz/',
   buy: [['fa-mobile-screen', 'Aplikace DÚKapka', 'jednotlivé i jednodenní síťové jízdenky'], ['fa-calculator', 'Počítadlo jízdného', 'cena libovolné trasy na dopravauk.cz'], ['fa-ticket', 'Jízdenka u řidiče nebo v předprodeji', '']]},
  {id: 'IREDO', name: 'IREDO', full: 'Integrovaná regionální doprava (Královéhradecký a Pardubický kraj)', kraje: ['HKK', 'PAK'], web: 'https://www.iredo.info/',
   links: [['Tarif IREDO od 14. 12. 2025 vč. ceníku (PDF)', 'https://md.gov.cz/getattachment/Dokumenty/Ministerstvo/Prepravni-a-tarifni-vestnik/Prepravni-a-tarifni-vestnik-2025/Prepravni-a-tarifni-vestnik-23-2025/Tarif-IDS-IREDO-(od-2025-12-14)-vc-Ceniku-jizdneho-IREDO.pdf.aspx']],
   buy: [['fa-ticket', 'Jízdenka u řidiče, v pokladně nebo automatu', ''], ['fa-globe', 'Informace o elektronických jízdenkách', 'iredo.info']]},
  {id: 'IDSOK', name: 'IDSOK', full: 'Integrovaný dopravní systém Olomouckého kraje', kraje: ['OLK'], web: 'https://www.idsok.cz/',
   links: [['E-shop IDSOK', 'https://eshop.idsok.cz/']],
   buy: [['fa-mobile-screen', 'Aplikace MobilOK', 'celá nabídka jízdenek IDSOK, přihlášení jako v e-shopu'], ['fa-train', 'Aplikace Můj vlak (ČD)', 'vybrané jízdenky IDSOK'], ['fa-ticket', 'Papírová jízdenka', 'dražší než elektronická']]},
  {id: 'IDESKA', name: 'IDESKA', full: 'Integrovaný dopravní systém Jihočeského kraje', kraje: ['JHC'], web: 'https://www.cd.cz/scripts/detail.php?pgid=1455',
   buy: [['fa-ticket', 'Jízdenka u dopravce', 've vlaku, u řidiče nebo v e-shopu dopravce']],
   tip: 'Od 1. 7. 2026 nahradila IDESKA dřívější IDS JK, JIKORD plus a IDS Táborska.'},
  {id: 'IDZK', name: 'IDZK', full: 'Integrovaná doprava Zlínského kraje', kraje: ['ZLK'], web: 'https://www.idzk.cz/',
   links: [['Ceník IDZK od 14. 12. 2025 (PDF)', 'https://www.arriva.cz/file/edee/downloadable-files/2026/01/2025-12__cenik_idzk_a4.pdf']],
   buy: [['fa-mobile-screen', 'Aplikace IDZK', 'časové jízdenky bez karty Zetka'], ['fa-train', 'Můj vlak a e-shop ČD', 'jízdné na vlaky v tarifu IDZK'], ['fa-ticket', 'Jízdenka u řidiče', '']],
   prices: {title: 'Síťová jízdenka IDZK', valid: 'ceník od 14. 12. 2025', cols: ['základní', 'zlevněná'], rows: [['24 hodin', 230, 115]], note: ''}},
  {id: 'VDV', name: 'VDV', full: 'Veřejná doprava Vysočiny', kraje: ['VYS'], web: '',
   links: [['Tarif Veřejné dopravy Vysočiny (PDF)', 'https://md.gov.cz/getattachment/Dokumenty/Ministerstvo/Prepravni-a-tarifni-vestnik/Prepravni-a-tarifni-vestnik-2025/Prepravni-a-tarifni-vestnik-13-2025/Tarif-Verejne-dopravy-Vysociny.pdf.aspx']],
   buy: [['fa-ticket', 'Jízdenka u řidiče nebo ve vlaku', '']]},
  {id: 'IDPK', name: 'IDPK', full: 'Integrovaná doprava Plzeňského kraje', kraje: ['PLK'], web: 'https://www.idpk.cz/',
   links: [['Plzeňské městské dopravní podniky (PMDP)', 'https://www.pmdp.cz/']],
   buy: [['fa-ticket', 'Terminál ve voze PMDP (Plzeň)', 'přestupní jízdenka na celou cestu'], ['fa-ticket', 'Jízdenka u řidiče nebo v předprodeji', '']]},
  {id: 'KVK', name: 'Karlovarský kraj', full: 'Veřejná doprava Karlovarského kraje', kraje: ['KVK'], web: '',
   buy: [['fa-ticket', 'Jízdenka u dopravce', 'u řidiče, ve vlaku nebo v e-shopu dopravce']]}
 ];
 T.TRAINS = [
  ['České dráhy', 'https://www.cd.cz/eshop/', 'e-shop a aplikace Můj vlak'],
  ['RegioJet', 'https://www.regiojet.cz/', 'místenky a jízdenky'],
  ['Leo Express', 'https://www.leoexpress.com/', ''],
  ['Arriva', 'https://www.arriva.cz/', 'vlaky i autobusy']
 ];
 T.forKraj = code => T.SYS.find(s => s.kraje.includes(code)) || null;
 T.forPoint = (lat, lon) => { const D = MG.D; if (!D.geo) return null; const oi = D.okresAt(lat, lon); if (oi < 0) return null; const k = D.kraj(oi); return k ? T.forKraj(k.code) : null; };
 T.idos = (from, to, ymd, t) => IDOS + '?f=' + encodeURIComponent(from) + '&t=' + encodeURIComponent(to) + (ymd ? '&date=' + ymd.split('-').reverse().map(Number).join('.') : '') + (t != null ? '&time=' + MG.hm(t) : '');
 /* pro AI rádce: strukturovaný výpis (jen ověřené ceny) */
 T.summary = (s) => s && ({system: s.name + ' – ' + s.full, web: s.web || null, verified_prices: s.prices ? {area: s.prices.title, valid: s.prices.valid, currency: 'CZK', columns: s.prices.cols, rows: s.prices.rows, note: s.prices.note || ''} : null,
  how_to_buy: s.buy.map(b => b[1] + (b[2] ? ' (' + b[2] + ')' : '')), official_links: (s.links || []).map(l => ({title: l[0], url: l[1]})), note: s.tip || ''});
})();
