/* Finanzkompass – Demo-Katalog (Kategorien, Banken, Händler, Verträge) und deterministischer Umsatz-Generator.
   Alle Daten sind Beispieldaten. Umsätze werden pro Tag mit festem Seed erzeugt und bleiben dadurch stabil. */
(function (FK) {
  'use strict';
  const D = FK.date;
  const r2 = FK.fmt.round2;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Kategorien ---------- */
  const CATEGORIES = [
    { id: 'wohnen', name: 'Wohnen', icon: 'building', color: '#3b6fd8', type: 'expense' },
    { id: 'energie', name: 'Energie', icon: 'zap', color: '#b26f00', type: 'expense' },
    { id: 'lebensmittel', name: 'Lebensmittel', icon: 'cart', color: '#2a8f53', type: 'expense' },
    { id: 'restaurants', name: 'Restaurants & Cafés', icon: 'utensils', color: '#c95a26', type: 'expense' },
    { id: 'mobilitaet', name: 'Mobilität', icon: 'car', color: '#2479b5', type: 'expense' },
    { id: 'versicherungen', name: 'Versicherungen', icon: 'umbrella', color: '#6c5bd4', type: 'expense' },
    { id: 'kommunikation', name: 'Internet & Telefon', icon: 'wifi', color: '#13808c', type: 'expense' },
    { id: 'abos', name: 'Abos & Streaming', icon: 'tv', color: '#c93a70', type: 'expense' },
    { id: 'shopping', name: 'Shopping', icon: 'bag', color: '#a8478a', type: 'expense' },
    { id: 'freizeit', name: 'Freizeit & Sport', icon: 'ticket', color: '#8452bf', type: 'expense' },
    { id: 'gesundheit', name: 'Gesundheit & Pflege', icon: 'heart-pulse', color: '#cf4646', type: 'expense' },
    { id: 'reisen', name: 'Reisen', icon: 'plane', color: '#0e7f7f', type: 'expense' },
    { id: 'bargeld', name: 'Bargeld', icon: 'banknote', color: '#5a7566', type: 'expense' },
    { id: 'steuern', name: 'Steuern & Abgaben', icon: 'landmark', color: '#5f6f84', type: 'expense' },
    { id: 'sonstiges', name: 'Sonstiges', icon: 'tag', color: '#6f7d82', type: 'expense' },
    { id: 'gehalt', name: 'Gehalt', icon: 'briefcase', color: '#13804d', type: 'income' },
    { id: 'erstattungen', name: 'Erstattungen', icon: 'receipt', color: '#24806f', type: 'income' },
    { id: 'zinsen', name: 'Zinsen & Erträge', icon: 'percent', color: '#1c7397', type: 'income' },
    { id: 'einnahmen', name: 'Sonstige Einnahmen', icon: 'arrow-down-left', color: '#467f35', type: 'income' },
    { id: 'sparen', name: 'Sparen & Anlegen', icon: 'piggy', color: '#00768c', type: 'saving' },
    { id: 'umbuchung', name: 'Umbuchungen', icon: 'transfer', color: '#6f7d82', type: 'transfer' },
  ];
  const CAT = {};
  CATEGORIES.forEach((c) => { CAT[c.id] = c; });

  /* ---------- Banken (für Konten und „Konto hinzufügen“) ---------- */
  const BANKS = [
    { id: 'sparkasse', name: 'Sparkasse KölnBonn', short: 'Sparkasse', color: '#e2001a', letter: 'S' },
    { id: 'dkb', name: 'DKB', short: 'DKB', color: '#1467b0', letter: 'DKB' },
    { id: 'ing', name: 'ING', short: 'ING', color: '#ff6200', letter: 'ING', dark: true },
    { id: 'traderepublic', name: 'Trade Republic', short: 'Trade Republic', color: '#111111', letter: 'TR' },
    { id: 'n26', name: 'N26', short: 'N26', color: '#2f8f7f', letter: 'N26' },
    { id: 'commerzbank', name: 'Commerzbank', short: 'Commerzbank', color: '#ffcc00', letter: 'C' },
    { id: 'deutschebank', name: 'Deutsche Bank', short: 'Deutsche Bank', color: '#0018a8', letter: 'DB' },
    { id: 'volksbank', name: 'Volksbank Köln Bonn', short: 'Volksbank', color: '#0066b3', letter: 'VB' },
    { id: 'comdirect', name: 'comdirect', short: 'comdirect', color: '#fff500', letter: 'c' },
    { id: 'postbank', name: 'Postbank', short: 'Postbank', color: '#ffcc00', letter: 'P' },
    { id: 'consorsbank', name: 'Consorsbank', short: 'Consorsbank', color: '#007bb8', letter: 'C' },
    { id: 'paypal', name: 'PayPal', short: 'PayPal', color: '#003087', letter: 'P' },
    { id: 'revolut', name: 'Revolut', short: 'Revolut', color: '#191c1f', letter: 'R' },
    { id: 'hvb', name: 'HypoVereinsbank', short: 'HVB', color: '#d40012', letter: 'HVB' },
    { id: 'targobank', name: 'TARGOBANK', short: 'TARGOBANK', color: '#002e5d', letter: 'T' },
    { id: 'c24', name: 'C24 Bank', short: 'C24', color: '#0b3c78', letter: 'C24' },
  ];
  const BANK = {};
  BANKS.forEach((b) => { BANK[b.id] = b; });

  /* ---------- Händler & Gegenparteien ---------- */
  // color = Farbe der Logo-Kachel, letter = Kürzel, city = Ort für den Verwendungszweck
  const MERCHANTS = {
    rewe: { name: 'REWE', legal: 'REWE Markt GmbH', color: '#cc071e', cat: 'lebensmittel' },
    edeka: { name: 'EDEKA', legal: 'EDEKA Center', color: '#1a4c9c', cat: 'lebensmittel' },
    lidl: { name: 'Lidl', legal: 'Lidl Dienstleistung', color: '#0050aa', cat: 'lebensmittel' },
    aldi: { name: 'ALDI SÜD', legal: 'ALDI SUED', color: '#00205b', letter: 'A', cat: 'lebensmittel' },
    kaufland: { name: 'Kaufland', legal: 'Kaufland Ehrenfeld', color: '#e10915', cat: 'lebensmittel' },
    denns: { name: "denn's Biomarkt", legal: 'denns BioMarkt', color: '#4f7f23', letter: 'd', cat: 'lebensmittel' },
    baecker: { name: 'Bäckerei Hommel', legal: 'Baeckerei Hommel', color: '#8d5a2b', cat: 'lebensmittel' },
    dm: { name: 'dm-drogerie markt', legal: 'DM Drogeriemarkt', color: '#21468b', letter: 'dm', cat: 'gesundheit' },
    rossmann: { name: 'Rossmann', legal: 'Dirk Rossmann GmbH', color: '#c8102e', cat: 'gesundheit' },
    apotheke: { name: 'Löwen-Apotheke', legal: 'Loewen-Apotheke', color: '#1e7d3a', cat: 'gesundheit' },
    friseur: { name: 'Salon Haarwerk', legal: 'Salon Haarwerk', color: '#6b4e71', cat: 'gesundheit' },
    starbucks: { name: 'Starbucks', legal: 'Starbucks Coffee', color: '#00704a', cat: 'restaurants' },
    cafe: { name: 'Café Wahlen', legal: 'Cafe Wahlen', color: '#6d4c41', cat: 'restaurants' },
    pizzeria: { name: 'Pizzeria da Enzo', legal: 'Pizzeria da Enzo', color: '#2e7d32', cat: 'restaurants' },
    vapiano: { name: 'Vapiano', legal: 'Vapiano Koeln', color: '#b5121b', cat: 'restaurants' },
    burgerking: { name: 'Burger King', legal: 'Burger King', color: '#c42000', letter: 'BK', cat: 'restaurants' },
    sushi: { name: 'Sushi Kaiten', legal: 'Sushi Kaiten', color: '#263238', cat: 'restaurants' },
    lieferando: { name: 'Lieferando', legal: 'Lieferando.de', color: '#ff8000', cat: 'restaurants', online: true },
    aral: { name: 'Aral', legal: 'Aral Station', color: '#0063b5', cat: 'mobilitaet' },
    shell: { name: 'Shell', legal: 'Shell Station', color: '#fbce07', cat: 'mobilitaet' },
    jet: { name: 'JET', legal: 'JET Tankstelle', color: '#ffd100', cat: 'mobilitaet' },
    db: { name: 'Deutsche Bahn', legal: 'DB Vertrieb GmbH', color: '#ec0016', letter: 'DB', cat: 'mobilitaet', online: true },
    lime: { name: 'Lime', legal: 'Lime Ride', color: '#0b8a2e', cat: 'mobilitaet', online: true },
    parkhaus: { name: 'Parkhaus Am Dom', legal: 'Parkhaus Am Dom', color: '#455a64', letter: 'P', cat: 'mobilitaet' },
    amazon: { name: 'Amazon', legal: 'AMZN Mktp DE', color: '#232f3e', letter: 'a', cat: 'shopping', online: true, city: 'LUXEMBOURG' },
    zalando: { name: 'Zalando', legal: 'Zalando SE', color: '#e85d00', cat: 'shopping', online: true, city: 'BERLIN' },
    hm: { name: 'H&M', legal: 'H+M Hennes Mauritz', color: '#e50010', letter: 'H&M', cat: 'shopping' },
    ikea: { name: 'IKEA', legal: 'IKEA Deutschland', color: '#0058a3', cat: 'shopping' },
    mediamarkt: { name: 'MediaMarkt', legal: 'MediaMarkt Koeln', color: '#df0000', cat: 'shopping' },
    decathlon: { name: 'Decathlon', legal: 'Decathlon Deutschland', color: '#0082c3', cat: 'freizeit' },
    kino: { name: 'Odeon Kino', legal: 'Odeon Lichtspieltheater', color: '#4527a0', cat: 'freizeit' },
    thalia: { name: 'Thalia', legal: 'Thalia Buecher', color: '#c2410c', cat: 'freizeit' },
    eventim: { name: 'Eventim', legal: 'CTS Eventim', color: '#002b5c', cat: 'freizeit', online: true, city: 'BREMEN' },
    steam: { name: 'Steam', legal: 'Steam Purchase', color: '#1b2838', cat: 'freizeit', online: true, city: 'BELLEVUE' },
    booking: { name: 'Booking.com', legal: 'Booking.com', color: '#003580', letter: 'B.', cat: 'reisen', online: true, city: 'AMSTERDAM' },
    lufthansa: { name: 'Lufthansa', legal: 'Deutsche Lufthansa AG', color: '#05164d', cat: 'reisen', online: true, city: 'FRANKFURT' },
    atm: { name: 'Bargeldauszahlung', legal: 'Geldautomat Sparkasse', icon: 'banknote', color: '#5a7566', cat: 'bargeld' },
    hauptzollamt: { name: 'Hauptzollamt Köln', legal: 'Hauptzollamt Koeln', icon: 'landmark', color: '#5f6f84', cat: 'steuern' },
    // Vertragspartner
    hausverwaltung: { name: 'Hausverwaltung Berger', color: '#5d6d7e', letter: 'HB', cat: 'wohnen' },
    rheinstrom: { name: 'Rheinstrom', color: '#b26f00', cat: 'energie' },
    beitragsservice: { name: 'Rundfunkbeitrag', color: '#1e3a5f', letter: 'RB', cat: 'steuern' },
    allianz: { name: 'Allianz', color: '#003781', cat: 'versicherungen' },
    ergo: { name: 'ERGO', color: '#bf1528', cat: 'versicherungen' },
    huk: { name: 'HUK-COBURG', color: '#ffdd00', letter: 'H', cat: 'versicherungen' },
    alteleipziger: { name: 'Alte Leipziger', color: '#004b87', letter: 'AL', cat: 'versicherungen' },
    dkv: { name: 'DKV', color: '#00733a', cat: 'versicherungen' },
    vodafone: { name: 'Vodafone', color: '#e60000', cat: 'kommunikation' },
    telekom: { name: 'Telekom', color: '#e20074', letter: 'T', cat: 'kommunikation' },
    netflix: { name: 'Netflix', color: '#b20710', cat: 'abos' },
    spotify: { name: 'Spotify', color: '#1db954', cat: 'abos' },
    disney: { name: 'Disney+', color: '#0e2a73', letter: 'D+', cat: 'abos' },
    amazonprime: { name: 'Amazon Prime', color: '#146eb4', letter: 'P', cat: 'abos' },
    apple: { name: 'Apple', color: '#1d1d1f', icon: 'cloud', cat: 'abos' },
    kvb: { name: 'KVB', color: '#e2001a', letter: 'D', cat: 'mobilitaet' },
    fithaus: { name: 'FitHaus', color: '#1f2937', letter: 'F', cat: 'freizeit' },
    // Einnahmen & Gegenparteien
    nordlicht: { name: 'Nordlicht Software GmbH', color: '#00768c', letter: 'N', cat: 'gehalt' },
    finanzamt: { name: 'Finanzamt Köln-Altstadt', icon: 'landmark', color: '#5f6f84', cat: 'erstattungen' },
    traderepublic: { name: 'Trade Republic', color: '#111111', letter: 'TR', cat: 'sparen' },
    ing: { name: 'ING', color: '#ff6200', letter: 'ING', cat: 'sparen' },
    dkb: { name: 'DKB', color: '#1467b0', letter: 'DKB', cat: 'umbuchung' },
    sparkasse: { name: 'Sparkasse KölnBonn', color: '#e2001a', letter: 'S', cat: 'umbuchung' },
  };

  const FRIENDS = ['Lisa Wagner', 'Tom Becker', 'Mia Schulz', 'Paul Richter', 'Sara Yilmaz'];
  const FRIEND_PURPOSES = ['Pizza gestern', 'Kinokarten', 'Geschenk für Anna', 'Konzertkarten', 'Tankrechnung', 'WG-Einkauf', 'Danke fürs Auslegen', 'Bowling'];

  /* ---------- Konten ---------- */
  const ACCOUNTS = [
    { id: 'giro', bankId: 'sparkasse', name: 'Girokonto', type: 'giro', iban: 'DE00 3705 0198 1932 4821 07', start: 1150, cardLast: '4821' },
    { id: 'visa', bankId: 'dkb', name: 'Visa Kreditkarte', type: 'credit', iban: null, cardNo: '4916 •••• •••• 7713', cardLast: '7713', limit: 2500, start: 0 },
    { id: 'tagesgeld', bankId: 'ing', name: 'Tagesgeld', type: 'savings', iban: 'DE00 5001 0517 5403 2219 64', start: 5400, rate: 0.0175 },
    { id: 'depot', bankId: 'traderepublic', name: 'Depot', type: 'depot', iban: 'DE00 1001 0178 3302 5519 40', start: 7400, etf: 'iShares Core MSCI World' },
  ];

  const ACCOUNT_TYPES = {
    giro: { name: 'Girokonten', icon: 'landmark' },
    credit: { name: 'Kreditkarten', icon: 'credit-card' },
    savings: { name: 'Sparkonten', icon: 'piggy' },
    depot: { name: 'Depots', icon: 'line-chart' },
  };

  /* ---------- Verträge ---------- */
  // Reihenfolge = feste Farbzuordnung im Fixkosten-Balken (Farbe folgt der Gruppe, nie dem Rang)
  const CONTRACT_GROUPS = [
    { id: 'wohnen', name: 'Wohnen & Energie', icon: 'building' },
    { id: 'versicherungen', name: 'Versicherungen', icon: 'umbrella' },
    { id: 'kommunikation', name: 'Internet & Mobilfunk', icon: 'wifi' },
    { id: 'abos', name: 'Streaming & Abos', icon: 'tv' },
    { id: 'mobilitaet', name: 'Mobilität', icon: 'car' },
    { id: 'freizeit', name: 'Freizeit & Sonstiges', icon: 'ticket' },
  ];

  /*  interval: monthly | quarterly | yearly; months: 0-basierte Monate für quarterly/yearly
      terms.kind:
        period  – jederzeit zum Ende des bezahlten Zeitraums kündbar
        notice  – Kündigungsfrist in Monaten zum Monatsende
        toDay   – bis zum Tag X eines Monats zum Monatsende
        yearly  – Verlängerung jährlich zum renewal (MM-TT), Frist noticeMonths
        minterm – Mindestlaufzeit bis endsOn, danach monatlich
        none    – nicht kündbar (z. B. Rundfunkbeitrag) */
  const CONTRACTS = [
    {
      id: 'miete', merchant: 'hausverwaltung', provider: 'Hausverwaltung Berger', product: 'Miete inkl. Nebenkosten',
      group: 'wohnen', category: 'wohnen', account: 'giro', interval: 'monthly', day: 1, method: 'standing',
      prices: [{ since: '2022-04', amount: 980 }, { since: '2025-04', amount: 1050 }], since: '2022-04-01',
      terms: { kind: 'notice', months: 3, label: '3 Monate zum Monatsende' }, cancelable: false,
      cancelHint: 'Mietverträge kündigst du schriftlich und unterschrieben direkt bei deinem Vermieter.',
      customerNo: 'WE 12 · 3. OG links',
    },
    {
      id: 'strom', merchant: 'rheinstrom', provider: 'Rheinstrom', product: 'Ökostrom Plus · 2.100 kWh/Jahr',
      group: 'wohnen', category: 'energie', account: 'giro', interval: 'monthly', day: 15, method: 'sepa',
      prices: [{ since: '2024-02', amount: 79 }, { since: '2026-01', amount: 84 }], since: '2024-02-01',
      terms: { kind: 'notice', months: 1, label: '1 Monat zum Monatsende' },
      savings: { perYear: 186, text: 'Vergleichbare Ökostrom-Tarife in deiner Region gibt es ab 68,50 € im Monat.' },
      customerNo: '4002 7731 95', creditorId: 'DE47ZZZ00000182933', mandateRef: 'RS-4002773195-01',
    },
    {
      id: 'rundfunk', merchant: 'beitragsservice', provider: 'Rundfunkbeitrag', product: 'ARD ZDF Deutschlandradio Beitragsservice',
      group: 'wohnen', category: 'steuern', account: 'giro', interval: 'quarterly', months: [1, 4, 7, 10], day: 15, method: 'sepa',
      prices: [{ since: '2021-08', amount: 55.08 }], since: '2019-05-15',
      terms: { kind: 'none', label: 'Gesetzlicher Beitrag – Abmeldung nur bei Auszug' }, cancelable: false,
      cancelHint: 'Der Rundfunkbeitrag ist gesetzlich vorgeschrieben. Eine Abmeldung ist nur bei Auszug oder Zusammenzug möglich.',
      customerNo: '512 345 678', creditorId: 'DE16ZZZ00000004413', mandateRef: '512345678',
    },
    {
      id: 'haftpflicht', merchant: 'allianz', provider: 'Allianz', product: 'Privathaftpflicht Komfort',
      group: 'versicherungen', category: 'versicherungen', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      prices: [{ since: '2020-01', amount: 5.9 }], since: '2020-01-01',
      terms: { kind: 'yearly', renewal: '01-01', noticeMonths: 3, label: '3 Monate zum Ablauf, sonst Verlängerung um 1 Jahr' },
      customerNo: 'AS-7 3301 8842', creditorId: 'DE21ZZZ00000009861', mandateRef: 'AZ73301884201',
    },
    {
      id: 'hausrat', merchant: 'ergo', provider: 'ERGO', product: 'Hausratversicherung Best',
      group: 'versicherungen', category: 'versicherungen', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      prices: [{ since: '2022-04', amount: 7.5 }], since: '2022-04-01',
      terms: { kind: 'yearly', renewal: '04-01', noticeMonths: 3, label: '3 Monate zum Ablauf, sonst Verlängerung um 1 Jahr' },
      customerNo: 'HR 55 120 334', creditorId: 'DE33ZZZ00000017284', mandateRef: 'ERGO-HR55120334',
    },
    {
      id: 'kfz', merchant: 'huk', provider: 'HUK-COBURG', product: 'Kfz-Haftpflicht & Teilkasko · K-AN 482',
      group: 'versicherungen', category: 'versicherungen', account: 'giro', interval: 'yearly', months: [0], day: 1, method: 'sepa',
      prices: [{ since: '2023-01', amount: 389.4 }, { since: '2026-01', amount: 412.8 }], since: '2023-01-01',
      terms: { kind: 'yearly', renewal: '01-01', noticeMonths: 1, label: 'Kündigung bis 30.11. zum 01.01.' },
      savings: { perYear: 96, text: 'Vor dem Wechselstichtag am 30.11. lohnt ein Vergleich – ähnliche Tarife gibt es ab 316 € im Jahr.' },
      customerNo: 'KF 921 004 773', creditorId: 'DE12ZZZ00000020119', mandateRef: 'HUK-KF921004773',
    },
    {
      id: 'bu', merchant: 'alteleipziger', provider: 'Alte Leipziger', product: 'Berufsunfähigkeitsversicherung',
      group: 'versicherungen', category: 'versicherungen', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      prices: [{ since: '2021-07', amount: 62.4 }], since: '2021-07-01',
      terms: { kind: 'notice', months: 1, label: 'monatlich zum Monatsende' },
      cancelHint: 'Überlege gut: Eine neue Berufsunfähigkeitsversicherung wird mit höherem Alter meist teurer.',
      customerNo: 'BU 4471 2209', creditorId: 'DE55ZZZ00000013526', mandateRef: 'AL-BU44712209',
    },
    {
      id: 'zahn', merchant: 'dkv', provider: 'DKV', product: 'Zahnzusatzversicherung KDT85',
      group: 'versicherungen', category: 'versicherungen', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      prices: [{ since: '2023-03', amount: 18.9 }], since: '2023-03-01',
      terms: { kind: 'yearly', renewal: '03-01', noticeMonths: 3, label: '3 Monate zum Versicherungsjahr' },
      customerNo: 'ZZ 300 118 42', creditorId: 'DE71ZZZ00000006602', mandateRef: 'DKV30011842',
    },
    {
      id: 'internet', merchant: 'vodafone', provider: 'Vodafone', product: 'GigaZuhause 250 Kabel',
      group: 'kommunikation', category: 'kommunikation', account: 'giro', interval: 'monthly', day: 7, method: 'sepa',
      prices: [{ since: '2025-03', amount: 39.99 }], since: '2025-03-14',
      terms: { kind: 'minterm', endsOn: '2027-03-13', noticeMonths: 1, label: 'Mindestlaufzeit bis 13.03.2027, danach monatlich kündbar' },
      customerNo: '1188 2207 431', creditorId: 'DE94ZZZ00000013577', mandateRef: 'VFK-11882207431',
    },
    {
      id: 'mobilfunk', merchant: 'telekom', provider: 'Telekom', product: 'MagentaMobil M',
      group: 'kommunikation', category: 'kommunikation', account: 'giro', interval: 'monthly', day: 20, method: 'sepa',
      prices: [{ since: '2023-09', amount: 29.95 }], since: '2023-09-20',
      terms: { kind: 'notice', months: 1, label: '1 Monat zum Monatsende' },
      savings: { perYear: 144, text: 'Tarife mit ähnlichem Datenvolumen gibt es ab 17,95 € im Monat.' },
      customerNo: '0170 5528 113', creditorId: 'DE44ZZZ00000017599', mandateRef: 'TDG-01705528113',
    },
    {
      id: 'netflix', merchant: 'netflix', provider: 'Netflix', product: 'Standard-Abo',
      group: 'abos', category: 'abos', account: 'visa', interval: 'monthly', day: 5, method: 'credit',
      prices: [{ since: '2021-03', amount: 12.99 }, { since: '2024-06', amount: 13.99 }], since: '2021-03-05',
      terms: { kind: 'period', label: 'jederzeit zum Ende des Abrechnungszeitraums' }, customerNo: 'alex.neumann@example.de',
    },
    {
      id: 'spotify', merchant: 'spotify', provider: 'Spotify', product: 'Premium Individual',
      group: 'abos', category: 'abos', account: 'visa', interval: 'monthly', day: 12, method: 'credit',
      prices: [{ since: '2019-11', amount: 9.99 }, { since: '2023-08', amount: 10.99 }], since: '2019-11-12',
      terms: { kind: 'period', label: 'jederzeit zum Ende des Abrechnungszeitraums' }, customerNo: 'alexn_koeln',
    },
    {
      id: 'disney', merchant: 'disney', provider: 'Disney+', product: 'Standard',
      group: 'abos', category: 'abos', account: 'visa', interval: 'monthly', day: 21, method: 'credit',
      prices: [{ since: '2024-11', amount: 9.99 }], since: '2024-11-21',
      terms: { kind: 'period', label: 'jederzeit zum Ende des Abrechnungszeitraums' }, customerNo: 'alex.neumann@example.de',
    },
    {
      id: 'prime', merchant: 'amazonprime', provider: 'Amazon', product: 'Prime-Mitgliedschaft (jährlich)',
      group: 'abos', category: 'abos', account: 'visa', interval: 'yearly', months: [2], day: 14, method: 'credit',
      prices: [{ since: '2022-03', amount: 69 }, { since: '2023-03', amount: 89.9 }], since: '2022-03-14',
      terms: { kind: 'period', label: 'jederzeit zum Ende der Mitgliedschaft' }, customerNo: 'alex.neumann@example.de',
    },
    {
      id: 'icloud', merchant: 'apple', provider: 'Apple', product: 'iCloud+ 200 GB',
      group: 'abos', category: 'abos', account: 'visa', interval: 'monthly', day: 18, method: 'credit',
      prices: [{ since: '2021-09', amount: 2.99 }], since: '2021-09-18',
      terms: { kind: 'period', label: 'jederzeit zum Ende des Abrechnungszeitraums' }, customerNo: 'alex.neumann@example.de',
    },
    {
      id: 'dticket', merchant: 'kvb', provider: 'KVB', product: 'Deutschlandticket',
      group: 'mobilitaet', category: 'mobilitaet', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      prices: [{ since: '2023-05', amount: 49 }, { since: '2025-01', amount: 58 }, { since: '2026-01', amount: 63 }], since: '2023-05-01',
      terms: { kind: 'toDay', day: 10, label: 'bis zum 10. eines Monats zum Monatsende' },
      customerNo: 'DT-0049 1127 3', creditorId: 'DE65ZZZ00000038871', mandateRef: 'KVB-DT004911273',
    },
    {
      id: 'gym', merchant: 'fithaus', provider: 'FitHaus', product: 'Mitgliedschaft Flex',
      group: 'freizeit', category: 'freizeit', account: 'giro', interval: 'monthly', day: 1, method: 'sepa',
      // sinceRel: relativ zum aktuellen Monat – die Preiserhöhung ist dadurch immer „frisch“
      prices: [{ since: '2024-01', amount: 24.9 }, { sinceRel: -1, amount: 29.9 }], since: '2024-01-01',
      terms: { kind: 'notice', months: 1, label: '1 Monat zum Monatsende' },
      customerNo: 'M-20240117', creditorId: 'DE08ZZZ00001244710', mandateRef: 'FH-M20240117',
    },
  ];

  /* ---------- Variable Ausgaben: Wahrscheinlichkeit je Tag, Händler-Gewichte, Betragsbereich ---------- */
  const PATTERNS = [
    { p: (d) => (!D.isShopDay(d) ? 0 : d.getDay() === 6 ? 0.55 : 0.36), merchants: [['rewe', 34], ['edeka', 18], ['lidl', 17], ['aldi', 17], ['kaufland', 8], ['denns', 6]], amount: [6.5, 92], skew: 1.7, hours: [8, 21] },
    { p: (d) => (D.holiday(d) ? 0.1 : 0.2), merchants: [['baecker', 1]], amount: [2.1, 9.8], skew: 1.2, hours: [6.5, 11] },
    { p: (d) => (D.isShopDay(d) ? 0.065 : 0), merchants: [['dm', 60], ['rossmann', 40]], amount: [3.45, 36], skew: 1.6, hours: [9, 20] },
    { p: (d) => (d.getDay() === 5 || d.getDay() === 6 ? 0.36 : 0.18), merchants: [['starbucks', 16], ['cafe', 16], ['pizzeria', 14], ['vapiano', 10], ['burgerking', 10], ['sushi', 10], ['lieferando', 24]], amount: [4.2, 54], skew: 1.5, hours: [11, 22] },
    { p: () => 0.05, merchants: [['aral', 50], ['shell', 30], ['jet', 20]], amount: [46, 84], skew: 1, hours: [7, 21] },
    { p: () => 0.022, merchants: [['db', 1]], amount: [17.9, 89.9], skew: 1.4, hours: [7, 22] },
    { p: (d) => (d.getMonth() >= 3 && d.getMonth() <= 9 ? 0.04 : 0.012), merchants: [['lime', 1]], amount: [2.6, 7.4], skew: 1, hours: [8, 23] },
    { p: (d) => (d.getMonth() === 10 ? 0.16 : d.getMonth() === 11 && d.getDate() < 22 ? 0.22 : 0.095), merchants: [['amazon', 1]], amount: [7.99, 84.99], skew: 2, hours: [7, 23] },
    { p: () => 0.032, merchants: [['zalando', 55], ['hm', 45]], amount: [19.95, 109], skew: 1.6, hours: [10, 21] },
    { p: (d) => (D.isShopDay(d) ? 0.011 : 0), merchants: [['ikea', 60], ['mediamarkt', 40]], amount: [24, 239], skew: 2.2, hours: [10, 20] },
    { p: (d) => (D.isShopDay(d) ? 0.008 : 0), merchants: [['decathlon', 1]], amount: [14.99, 79.99], skew: 1.6, hours: [10, 20] },
    { p: () => 0.038, merchants: [['kino', 40], ['thalia', 35], ['eventim', 10], ['steam', 15]], amount: [8.5, 58], skew: 1.8, hours: [12, 23] },
    { p: (d) => (D.isShopDay(d) ? 0.024 : 0), merchants: [['apotheke', 1]], amount: [4.95, 36.9], skew: 1.6, hours: [9, 19] },
    { p: (d) => (D.isShopDay(d) ? 0.022 : 0), merchants: [['friseur', 1]], amount: [32, 58], skew: 1, hours: [10, 18] },
    { p: () => 0.018, merchants: [['parkhaus', 1]], amount: [2.5, 14], skew: 1.2, hours: [9, 22] },
    { p: () => 0.042, merchants: [['atm', 1]], fixed: [50, 100, 100, 150, 200], hours: [8, 22] },
  ];

  const SALARY = 3284.17;
  const XMAS_BONUS = 1450;
  const SAVE_TAGESGELD = 350;
  const SAVE_ETF = 200;
  const DEPOT_MU = 0.07;
  const DEPOT_SIGMA = 0.15;

  /* ---------- Hilfsfunktionen ---------- */
  const amountIn = (r, min, max, skew) => r2(min + (max - min) * Math.pow(r(), skew || 1));
  const timeIn = (r, h1, h2) => {
    const mins = Math.floor(r.between(h1 * 60, h2 * 60));
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  };
  const minutesOf = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 6 * 60);
  const upper = (s) => FK.util.normalize(s).toUpperCase();

  /** Preise mit relativen Angaben (sinceRel) auf den aktuellen Monat auflösen */
  function resolvePrices(prices, curYM) {
    return prices
      .map((p) => ({ since: p.since || D.ymAdd(curYM, p.sinceRel), amount: p.amount }))
      .sort((a, b) => (a.since < b.since ? -1 : 1));
  }

  function priceAt(c, d) {
    const ym = typeof d === 'string' ? d.slice(0, 7) : D.ym(d);
    let amount = c.prices[0].amount;
    for (const p of c.prices) if (p.since <= ym) amount = p.amount;
    return amount;
  }

  /** Alle Buchungstage eines Vertrags im Zeitraum (Wochenenden/Feiertage → nächster Bankarbeitstag) */
  function bookingDates(c, from, to) {
    const out = [];
    const until = c.endsOn ? D.parse(c.endsOn) : null;
    const since = c.since ? D.parse(c.since) : null;
    for (let mm = D.addMonths(from, -1); mm <= to; mm = D.addMonths(mm, 1)) {
      const y = mm.getFullYear();
      const m = mm.getMonth();
      if (c.interval === 'quarterly' && !c.months.includes(m)) continue;
      if (c.interval === 'yearly' && c.months[0] !== m) continue;
      const nominal = new Date(y, m, Math.min(c.day, D.dim(y, m)));
      const date = c.method === 'credit' ? nominal : D.nextBankDay(nominal);
      if (date < from || date > to) continue;
      if (since && nominal < since) continue;
      if (until && nominal > until) continue;
      out.push(date);
    }
    return out;
  }

  const intervalMonths = (c) => (c.interval === 'yearly' ? 12 : c.interval === 'quarterly' ? 3 : 1);

  function contractPurpose(c, d) {
    const mon = FK.dfmt.MON[d.getMonth()];
    if (c.method === 'standing') return `Dauerauftrag · ${c.product} ${mon} ${d.getFullYear()}`;
    if (c.method === 'credit') return `${upper(c.provider)} · ${c.product} · Visa ••${'7713'}`;
    const period = c.interval === 'monthly' ? `${mon} ${d.getFullYear()}` : c.interval === 'quarterly' ? `Quartal ${Math.floor(d.getMonth() / 3) + 1}/${d.getFullYear()}` : `Jahresbeitrag ${d.getFullYear()}`;
    return `${c.product} · Kd.-Nr. ${c.customerNo} · ${period}`;
  }

  /* ---------- Generator ---------- */
  /**
   * Erzeugt alle Konten und Umsätze von vor 12 Monaten bis heute.
   * contracts: aufgelöste Vertragsliste (siehe store), state: gespeicherter Zustand (hinzugefügte Konten)
   */
  function generate(now, state, contracts) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = D.ymd(today);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);

    const accounts = ACCOUNTS.map((a) => Object.assign({}, a));
    for (const add of state.addedAccounts || []) accounts.push(addedAccount(add));

    const bal = {};
    const daily = {};
    accounts.forEach((a) => { bal[a.id] = a.start || 0; daily[a.id] = []; });

    // Vertragsbuchungen vorberechnen: Datum → Verträge
    const due = new Map();
    for (const c of contracts) {
      if (c.custom) continue; // selbst angelegte Verträge haben keine Historie
      for (const d of bookingDates(c, start, today)) {
        const k = D.ymd(d);
        if (!due.has(k)) due.set(k, []);
        due.get(k).push(c);
      }
    }

    // Einmalige Ereignisse relativ zu heute
    const taxMonth = D.addMonths(today, -4);
    const taxDay = D.ymd(D.nthBankDay(taxMonth.getFullYear(), taxMonth.getMonth(), 6));
    const vacYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    const vacHotel = D.ymd(new Date(vacYear, 7, 4));
    const vacFlight = D.ymd(new Date(vacYear, 5, 19));
    const kfzTax = D.ymd(D.nextBankDay(new Date(today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1, 6, 15)));

    let price = 100;
    let units = (accounts.find((a) => a.id === 'depot') || { start: 0 }).start / price;
    const depotSeries = [];
    const txs = [];

    for (let d = start; d <= today; d = D.addDays(d, 1)) {
      const ds = D.ymd(d);
      const r = FK.rng('day:' + ds);
      const y = d.getFullYear();
      const m = d.getMonth();
      const dayTx = [];
      const isToday = ds === todayStr;
      const push = (tx) => {
        if (isToday && tx.time && minutesOf(tx.time) > nowMin) return; // liegt noch in der Zukunft
        dayTx.push(tx);
      };

      // Kreditkartenabrechnung: Saldo vom Vortag wird vom Girokonto ausgeglichen
      if (ds === D.ymd(D.nextBankDay(new Date(y, m, 22))) && bal.visa < -0.005) {
        const owed = r2(-bal.visa);
        const tid = 'cc-' + ds;
        push({ accountId: 'giro', amount: -owed, merchantId: 'dkb', name: 'DKB Visa Kreditkartenabrechnung', categoryId: 'umbuchung', method: 'transfer', transferId: tid, purpose: `Kreditkartenabrechnung ${FK.dfmt.MON[m]} ${y} · Karte ••7713`, counterpart: { name: 'DKB AG', iban: 'DE00 1203 0000 1020 7713 00' } });
        push({ accountId: 'visa', amount: owed, merchantId: 'sparkasse', name: 'Ausgleich vom Girokonto', categoryId: 'umbuchung', method: 'transfer', transferId: tid, purpose: `Ausgleich Kreditkartenabrechnung ${FK.dfmt.MON[m]} ${y}`, counterpart: { name: 'Alex Neumann', iban: ACCOUNTS[0].iban } });
      }

      // Verträge
      for (const c of due.get(ds) || []) {
        push({
          accountId: c.account, amount: -priceAt(c, d), merchantId: c.merchant, name: c.provider, categoryId: c.category,
          method: c.method, contractId: c.id, purpose: contractPurpose(c, d),
          creditorId: c.creditorId, mandateRef: c.mandateRef,
        });
      }

      // Gehalt am letzten Bankarbeitstag
      if (ds === D.ymd(D.lastBankDayOfMonth(y, m))) {
        const bonus = m === 10 ? XMAS_BONUS : 0;
        push({ accountId: 'giro', amount: r2(SALARY + bonus), merchantId: 'nordlicht', name: 'Nordlicht Software GmbH', categoryId: 'gehalt', method: 'incoming', purpose: `LOHN/GEHALT ${pad(m + 1)}/${y}${bonus ? ' inkl. Weihnachtsgeld' : ''} · PNr. 10482`, counterpart: { name: 'Nordlicht Software GmbH', iban: 'DE00 3804 0007 0123 4567 00' } });
        // Zinsen auf dem Tagesgeld
        const interest = r2((bal.tagesgeld * 0.0175) / 12);
        push({ accountId: 'tagesgeld', amount: interest, merchantId: 'ing', name: 'Zinsgutschrift', categoryId: 'zinsen', method: 'interest', purpose: `Habenzinsen ${FK.dfmt.MON[m]} ${y} · 1,75 % p. a.` });
      }

      // Sparen am 2. Bankarbeitstag
      if (ds === D.ymd(D.nthBankDay(y, m, 2))) {
        const t1 = 'sv-' + ds;
        push({ accountId: 'giro', amount: -SAVE_TAGESGELD, merchantId: 'ing', name: 'ING Tagesgeld', categoryId: 'sparen', method: 'standing', transferId: t1, purpose: 'Dauerauftrag · Rücklage Tagesgeld', counterpart: { name: 'Alex Neumann', iban: ACCOUNTS[2].iban } });
        push({ accountId: 'tagesgeld', amount: SAVE_TAGESGELD, merchantId: 'sparkasse', name: 'Einzahlung vom Girokonto', categoryId: 'sparen', method: 'transfer', transferId: t1, purpose: 'Dauerauftrag · Rücklage Tagesgeld', counterpart: { name: 'Alex Neumann', iban: ACCOUNTS[0].iban } });
        const t2 = 'sp-' + ds;
        push({ accountId: 'giro', amount: -SAVE_ETF, merchantId: 'traderepublic', name: 'Trade Republic Sparplan', categoryId: 'sparen', method: 'sepa', transferId: t2, purpose: 'Sparplan iShares Core MSCI World · Lastschrift', creditorId: 'DE00ZZZ00002267891', mandateRef: 'TR-SP-0042', counterpart: { name: 'Trade Republic Bank GmbH', iban: 'DE00 1001 0178 0000 0000 00' } });
        push({ accountId: 'depot', amount: SAVE_ETF, merchantId: 'traderepublic', name: 'Sparplan ausgeführt', categoryId: 'sparen', method: 'transfer', transferId: t2, purpose: `Kauf iShares Core MSCI World (Acc) · ${(SAVE_ETF / price).toFixed(4).replace('.', ',')} Stk.` });
        units += SAVE_ETF / price;
      }

      // Einmalige Ereignisse
      if (ds === taxDay) push({ accountId: 'giro', amount: 612.4, merchantId: 'finanzamt', name: 'Finanzamt Köln-Altstadt', categoryId: 'erstattungen', method: 'incoming', purpose: `Erstattung Einkommensteuer ${y - 1} · StNr. 214/5582/0917`, counterpart: { name: 'Finanzamt Köln-Altstadt', iban: 'DE00 3700 0000 0038 0010 00' } });
      if (ds === vacFlight) push({ accountId: 'visa', amount: -284.38, merchantId: 'lufthansa', name: 'Lufthansa', categoryId: 'reisen', method: 'credit', time: '21:14', purpose: 'DEUTSCHE LUFTHANSA AG · FRANKFURT · Flug CGN–LIS · Visa ••7713' });
      if (ds === vacHotel) push({ accountId: 'visa', amount: -486, merchantId: 'booking', name: 'Booking.com', categoryId: 'reisen', method: 'credit', time: '15:02', purpose: 'BOOKING.COM HOTEL · AMSTERDAM · Lissabon, 5 Nächte · Visa ••7713' });
      if (ds === kfzTax) push({ accountId: 'giro', amount: -118, merchantId: 'hauptzollamt', name: 'Hauptzollamt Köln', categoryId: 'steuern', method: 'sepa', purpose: 'Kraftfahrzeugsteuer K-AN 482 · Zeitraum 07/' + y + '–06/' + (y + 1), creditorId: 'DE00ZZZ00000010092', mandateRef: 'KFZ-K-AN482' });

      // Variable Ausgaben
      for (const pat of PATTERNS) {
        const p = pat.p(d);
        const roll = r();
        const pick = r.weighted(pat.merchants);
        const value = pat.fixed ? r.pick(pat.fixed) : amountIn(r, pat.amount[0], pat.amount[1], pat.skew);
        const time = timeIn(r, pat.hours[0], pat.hours[1]);
        if (roll >= p) continue;
        const mer = MERCHANTS[pick];
        const viaCard = mer.online ? 'visa' : (pick === 'lieferando' ? 'visa' : 'giro');
        const accountId = viaCard;
        const dmy = FK.dfmt.dmy(d);
        const purpose = pick === 'atm'
          ? `Bargeldauszahlung · GA-Nr. 0${(FK.hash(ds) % 9000) + 1000} · ${dmy} ${time}`
          : accountId === 'visa'
            ? `${upper(mer.legal || mer.name)} · ${mer.city || 'KOELN'} · ${dmy} ${time} · Visa ••7713`
            : `${upper(mer.legal || mer.name)}//KOELN/DE · ${dmy} ${time} · Debitkarte ••4821`;
        push({ accountId, amount: -value, merchantId: pick, name: mer.name, categoryId: mer.cat, method: pick === 'atm' ? 'cash' : accountId === 'visa' ? 'credit' : 'card', time, purpose });
      }

      // Gelegentliche Eingänge
      const rIn = r();
      const friend = r.pick(FRIENDS);
      const fp = r.pick(FRIEND_PURPOSES);
      const fAmount = amountIn(r, 8, 48, 1.3);
      if (rIn < 0.02) push({ accountId: 'giro', amount: fAmount, merchantId: null, name: friend, categoryId: 'einnahmen', method: 'incoming', purpose: fp, counterpart: { name: friend, iban: 'DE00 •••• •••• •••• ••' + pad(FK.hash(friend) % 100) + ' ' + pad(FK.hash(friend + 'x') % 100) } });
      const rRef = r();
      const refAmount = amountIn(r, 12.99, 59.99, 1.2);
      if (rRef < 0.008) push({ accountId: 'visa', amount: refAmount, merchantId: 'amazon', name: 'Amazon Erstattung', categoryId: 'erstattungen', method: 'credit', time: timeIn(r, 8, 20), purpose: `AMZN Mktp DE · Gutschrift Bestellung 302-${FK.hash(ds) % 9000000 + 1000000}` });

      // Hinzugefügte Demo-Konten
      for (const a of accounts) {
        if (!a.added || ds < a.historyFrom) continue;
        const ra = FK.rng('acc:' + a.id + ':' + ds);
        for (const pat of a.patterns) {
          const roll = ra();
          const pick = ra.weighted(pat.merchants);
          const value = amountIn(ra, pat.amount[0], pat.amount[1], pat.skew);
          const time = timeIn(ra, pat.hours[0], pat.hours[1]);
          if (roll >= pat.p) continue;
          const mer = MERCHANTS[pick];
          push({ accountId: a.id, amount: -value, merchantId: pick, name: mer.name, categoryId: mer.cat, method: 'card', time, purpose: `${upper(mer.legal || mer.name)} · ${FK.dfmt.dmy(d)} ${time} · Karte ••${a.cardLast}` });
        }
      }

      // Depotkurs: Random Walk an Bankarbeitstagen
      if (D.isBankDay(d) && ds !== D.ymd(start)) {
        const rd = FK.rng('depot:' + ds);
        price *= Math.exp(DEPOT_MU / 252 + (DEPOT_SIGMA / Math.sqrt(252)) * rd.normal());
      }

      // Tagesumsätze sortieren, IDs vergeben, Salden fortschreiben
      dayTx.forEach((tx, i) => { tx.seq = i; });
      for (const tx of dayTx) {
        tx.id = ds + '-' + tx.seq;
        tx.date = ds;
        if (!tx.time) tx.time = null;
        if (tx.accountId !== 'depot') bal[tx.accountId] = r2(bal[tx.accountId] + tx.amount);
        txs.push(tx);
      }
      bal.depot = r2(units * price);
      depotSeries.push(price);
      for (const a of accounts) daily[a.id].push(a.id === 'depot' ? bal.depot : bal[a.id]);
    }

    txs.sort((a, b) => (a.date === b.date ? minutesOf(b.time) - minutesOf(a.time) || b.seq - a.seq : a.date < b.date ? 1 : -1));

    const depot = accounts.find((a) => a.id === 'depot');
    if (depot) {
      depot.invested = r2(depot.start + SAVE_ETF * txs.filter((t) => t.accountId === 'depot').length);
      depot.units = units;
      depot.price = price;
    }

    return { start, today, accounts, txs, daily, balances: bal };
  }

  /** Ein über „Konto hinzufügen“ angelegtes Demo-Konto */
  function addedAccount(add) {
    const r = FK.rng('added:' + add.id);
    const created = D.parse(add.createdAt);
    const bank = BANK[add.bankId] || BANKS[0];
    return {
      id: add.id,
      bankId: add.bankId,
      name: add.bankId === 'paypal' ? 'PayPal-Konto' : 'Girokonto',
      type: 'giro',
      added: true,
      iban: `DE00 ${r.int(1000, 9999)} ${r.int(1000, 9999)} ${r.int(1000, 9999)} ${r.int(1000, 9999)} ${r.int(10, 99)}`,
      cardLast: String(r.int(1000, 9999)),
      start: r2(r.between(640, 1840)),
      historyFrom: D.ymd(D.addDays(created, -75)),
      bankName: bank.name,
      patterns: [
        { p: 0.13, merchants: [['rewe', 3], ['lidl', 2], ['dm', 1], ['starbucks', 1], ['lieferando', 1]], amount: [3.5, 46], skew: 1.6, hours: [8, 21] },
        { p: 0.04, merchants: [['amazon', 2], ['zalando', 1], ['steam', 1]], amount: [9.99, 64], skew: 1.8, hours: [9, 23] },
      ],
    };
  }

  FK.catalog = {
    categories: CATEGORIES,
    cat: (id) => CAT[id] || CAT.sonstiges,
    banks: BANKS,
    bank: (id) => BANK[id] || { id, name: id, short: id, color: '#6f7d82', letter: '?' },
    merchants: MERCHANTS,
    merchant: (id) => (id && MERCHANTS[id]) || null,
    accountTypes: ACCOUNT_TYPES,
    contractGroups: CONTRACT_GROUPS,
    contracts: CONTRACTS,
  };

  FK.data = {
    generate, resolvePrices, priceAt, bookingDates, intervalMonths,
    SALARY, XMAS_BONUS, SAVE_TAGESGELD, SAVE_ETF,
  };
})(window.FK);
