/* Finanzkompass – Stammdaten: Kategorien, Banken, bekannte Händler/Marken und Kategorisierungsregeln.
   Enthält keine Umsätze – nur Regeln, um echte Umsätze zu erkennen und darzustellen. */
(function (FK) {
  'use strict';

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
    { id: 'steuern', name: 'Steuern & Gebühren', icon: 'landmark', color: '#5f6f84', type: 'expense' },
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

  /* ---------- Banken (Logos; Sparkasse und Trade Republic sind direkt anbindbar) ---------- */
  const BANKS = [
    { id: 'sparkasse', name: 'Sparkasse', short: 'Sparkasse', color: '#e2001a', letter: 'S', bic: /^[A-Z]{4}DE[A-Z0-9]{2}/, featured: true },
    { id: 'traderepublic', name: 'Trade Republic', short: 'Trade Republic', color: '#111111', letter: 'TR', featured: true },
    { id: 'dkb', name: 'DKB', short: 'DKB', color: '#1467b0', letter: 'DKB' },
    { id: 'ing', name: 'ING', short: 'ING', color: '#ff6200', letter: 'ING' },
    { id: 'n26', name: 'N26', short: 'N26', color: '#2f8f7f', letter: 'N26' },
    { id: 'commerzbank', name: 'Commerzbank', short: 'Commerzbank', color: '#ffcc00', letter: 'C' },
    { id: 'deutschebank', name: 'Deutsche Bank', short: 'Deutsche Bank', color: '#0018a8', letter: 'DB' },
    { id: 'volksbank', name: 'Volksbank / Raiffeisenbank', short: 'Volksbank', color: '#0066b3', letter: 'VR' },
    { id: 'comdirect', name: 'comdirect', short: 'comdirect', color: '#fff500', letter: 'c' },
    { id: 'postbank', name: 'Postbank', short: 'Postbank', color: '#ffcc00', letter: 'P' },
    { id: 'paypal', name: 'PayPal', short: 'PayPal', color: '#003087', letter: 'P' },
    { id: 'other', name: 'Andere Bank', short: 'Konto', color: '#5f6f84', letter: '€' },
  ];
  const BANK = {};
  BANKS.forEach((b) => { BANK[b.id] = b; });

  /* ---------- Bekannte Marken: Logo-Farbe, Anzeigename, Kategorie ----------
     re prüft den normalisierten Text (klein, ohne Umlaute/Akzente) aus Empfänger + Verwendungszweck.
     Reihenfolge zählt: spezifischere Muster zuerst (z. B. „aldi talk“ vor „aldi“). */
  const B = (id, name, color, cat, re, letter, icon) => ({ id, name, color, cat, re, letter, icon });
  const BRANDS = [
    // Abos & Streaming
    B('netflix', 'Netflix', '#b20710', 'abos', /netflix/),
    B('spotify', 'Spotify', '#1db954', 'abos', /spotify/),
    B('disney', 'Disney+', '#0e2a73', 'abos', /disney ?(plus|\+)|disneyplus/, 'D+'),
    B('amazonprime', 'Amazon Prime', '#146eb4', 'abos', /amazon prime|prime video|amzn prime|primevideo/, 'P'),
    B('apple', 'Apple', '#1d1d1f', 'abos', /apple\.com\/bill|apple services|itunes|apple\.com\/de|icloud/, null, 'cloud'),
    B('google', 'Google', '#1a73e8', 'abos', /google \*|google play|google one|youtube ?premium|youtubepremium/, 'G'),
    B('dazn', 'DAZN', '#0c161c', 'abos', /\bdazn\b/),
    B('sky', 'Sky', '#003f8a', 'abos', /\bsky (deutschland|de\b)|sky\.de|wow tv|\bwow\b streaming/),
    B('audible', 'Audible', '#f18e00', 'abos', /audible/),
    B('rtlplus', 'RTL+', '#e3001b', 'abos', /rtl ?\+|rtl plus|rtlplus/, 'RTL'),
    B('joyn', 'Joyn', '#1c1c1c', 'abos', /\bjoyn\b/),
    B('paramount', 'Paramount+', '#0064ff', 'abos', /paramount/, 'P+'),
    B('deezer', 'Deezer', '#a238ff', 'abos', /deezer/),
    B('openai', 'ChatGPT', '#10a37f', 'abos', /openai|chatgpt/, 'AI'),
    B('microsoft', 'Microsoft', '#2b579a', 'abos', /microsoft|xbox|msbill/, 'MS'),
    B('adobe', 'Adobe', '#c8102e', 'abos', /\badobe\b/, 'Ad'),
    B('playstation', 'PlayStation', '#00439c', 'freizeit', /playstation|sony interactive/, 'PS'),
    B('nintendo', 'Nintendo', '#e4000f', 'freizeit', /nintendo/),
    B('steam', 'Steam', '#1b2838', 'freizeit', /\bsteam(games|powered)?\b|valve corp/),
    B('hellofresh', 'HelloFresh', '#7ab800', 'lebensmittel', /hello ?fresh/),
    // Internet & Telefon (vor Supermärkten wegen „aldi talk“, „lidl connect“)
    B('alditalk', 'ALDI TALK', '#00205b', 'kommunikation', /aldi ?talk/, 'AT'),
    B('lidlconnect', 'Lidl Connect', '#0050aa', 'kommunikation', /lidl connect/, 'LC'),
    B('telekom', 'Telekom', '#e20074', 'kommunikation', /telekom|t-mobile/, 'T'),
    B('vodafone', 'Vodafone', '#e60000', 'kommunikation', /vodafone|kabel deutschland/),
    B('o2', 'O2', '#0019a5', 'kommunikation', /\bo2\b|telefonica/, 'O2'),
    B('1und1', '1&1', '#003d8f', 'kommunikation', /1 ?& ?1|1und1/, '1&1'),
    B('congstar', 'congstar', '#1d1d1b', 'kommunikation', /congstar/),
    B('freenet', 'freenet', '#78be20', 'kommunikation', /freenet|klarmobil|mobilcom/),
    B('drillisch', 'Mobilfunk', '#5f6f84', 'kommunikation', /drillisch|winsim|simplytel|sim\.de|smartmobil|yourfone/, 'SIM'),
    B('pyur', 'PYUR', '#e5007d', 'kommunikation', /\bpyur\b|tele columbus/),
    B('netcologne', 'NetCologne', '#e2001a', 'kommunikation', /netcologne/, 'NC'),
    // Lebensmittel
    B('rewe', 'REWE', '#cc071e', 'lebensmittel', /\brewe\b/),
    B('edeka', 'EDEKA', '#1a4c9c', 'lebensmittel', /\bedeka\b|marktkauf/),
    B('lidl', 'Lidl', '#0050aa', 'lebensmittel', /\blidl\b/),
    B('aldi', 'ALDI', '#00205b', 'lebensmittel', /\baldi\b/),
    B('kaufland', 'Kaufland', '#e10915', 'lebensmittel', /kaufland/),
    B('netto', 'Netto', '#ffe600', 'lebensmittel', /\bnetto\b/),
    B('penny', 'PENNY', '#cd1719', 'lebensmittel', /\bpenny\b/),
    B('norma', 'NORMA', '#d40f14', 'lebensmittel', /\bnorma\b/),
    B('denns', "denn's Biomarkt", '#4f7f23', 'lebensmittel', /denn'?s|dennree/, 'd'),
    B('alnatura', 'Alnatura', '#006a3b', 'lebensmittel', /alnatura/),
    B('globus', 'Globus', '#004f9f', 'lebensmittel', /\bglobus\b/),
    B('tegut', 'tegut…', '#e2001a', 'lebensmittel', /\btegut\b/),
    B('picnic', 'Picnic', '#e1171e', 'lebensmittel', /\bpicnic\b/),
    // Gesundheit & Drogerie
    B('dm', 'dm-drogerie markt', '#21468b', 'gesundheit', /dm[- ]?drogerie|\bdm fil|\bdm\b[ .-]?markt/, 'dm'),
    B('rossmann', 'Rossmann', '#c8102e', 'gesundheit', /rossmann/),
    B('mueller', 'Müller', '#f39200', 'gesundheit', /muller (drogerie|handels|ltd)|mueller drogerie/, 'M'),
    B('douglas', 'Douglas', '#000000', 'gesundheit', /\bdouglas\b/),
    // Restaurants
    B('lieferando', 'Lieferando', '#ff8000', 'restaurants', /lieferando|takeaway\.com/),
    B('wolt', 'Wolt', '#009de0', 'restaurants', /\bwolt\b/),
    B('ubereats', 'Uber Eats', '#06c167', 'restaurants', /uber ?eats/, 'UE'),
    B('starbucks', 'Starbucks', '#00704a', 'restaurants', /starbucks/),
    B('mcdonalds', "McDonald's", '#da291c', 'restaurants', /mc ?donald/, 'M'),
    B('burgerking', 'Burger King', '#c42000', 'restaurants', /burger king/, 'BK'),
    B('subway', 'Subway', '#008c15', 'restaurants', /\bsubway\b/),
    B('kfc', 'KFC', '#a3080c', 'restaurants', /\bkfc\b/),
    B('vapiano', 'Vapiano', '#b5121b', 'restaurants', /vapiano/),
    B('dominos', "Domino's", '#006491', 'restaurants', /domino'?s/, 'D'),
    // Mobilität
    B('db', 'Deutsche Bahn', '#ec0016', 'mobilitaet', /db vertrieb|deutsche bahn|db fernverkehr|bahn\.de|db bahn|\bdb\b ticket|db regio/, 'DB'),
    B('dticket', 'Deutschlandticket', '#e2001a', 'mobilitaet', /deutschland-?ticket|d-ticket/, 'D'),
    B('oepnv', 'Nahverkehr', '#2479b5', 'mobilitaet', /\b(kvb|bvg|mvg|hvv|rmv|vrr|vvs|vbb|vgn|kvv|uestra|rheinbahn|bogestra|dvb|swb mobil|ssb|vag)\b/, null, 'train'),
    B('aral', 'Aral', '#0063b5', 'mobilitaet', /\baral\b/),
    B('shell', 'Shell', '#fbce07', 'mobilitaet', /\bshell\b/),
    B('esso', 'Esso', '#d8131f', 'mobilitaet', /\besso\b/),
    B('jet', 'JET', '#ffd100', 'mobilitaet', /\bjet\b (tankstelle|station|[0-9])|jet tank/),
    B('total', 'TotalEnergies', '#ed0000', 'mobilitaet', /total ?energies|\btotal\b (tankstelle|station)/, 'TE'),
    B('uber', 'Uber', '#000000', 'mobilitaet', /\buber\b(?! ?eats)/),
    B('freenow', 'FREENOW', '#c4004c', 'mobilitaet', /free ?now/, 'FN'),
    B('bolt', 'Bolt', '#34d186', 'mobilitaet', /\bbolt\b/),
    B('lime', 'Lime', '#0b8a2e', 'mobilitaet', /\blime\b/),
    B('tier', 'Dott/TIER', '#0e1a50', 'mobilitaet', /\btier\b|\bdott\b/, 'D'),
    B('sharenow', 'SHARE NOW', '#00a0e1', 'mobilitaet', /share ?now|free2move/, 'SN'),
    B('miles', 'MILES', '#005ea8', 'mobilitaet', /miles mobility|\bmiles\b/),
    B('flixbus', 'FlixBus', '#73d700', 'mobilitaet', /flix ?(bus|train)|flixmobility/, 'F'),
    B('adac', 'ADAC', '#ffcc00', 'mobilitaet', /\badac\b/),
    // Shopping
    B('amazon', 'Amazon', '#232f3e', 'shopping', /amazon|amzn/, 'a'),
    B('zalando', 'Zalando', '#e85d00', 'shopping', /zalando/),
    B('otto', 'OTTO', '#d4021d', 'shopping', /\botto\b (gmbh|versand|payments)|otto\.de/),
    B('ikea', 'IKEA', '#0058a3', 'shopping', /\bikea\b/),
    B('mediamarkt', 'MediaMarkt', '#df0000', 'shopping', /media ?markt/),
    B('saturn', 'Saturn', '#f60', 'shopping', /\bsaturn\b/),
    B('hm', 'H&M', '#e50010', 'shopping', /\bh ?& ?m\b|hennes/, 'H&M'),
    B('zara', 'Zara', '#000000', 'shopping', /\bzara\b/),
    B('decathlon', 'Decathlon', '#0082c3', 'freizeit', /decathlon/),
    B('ebay', 'eBay', '#e53238', 'shopping', /\bebay\b/, 'e'),
    B('aboutyou', 'ABOUT YOU', '#000000', 'shopping', /about ?you/, 'AY'),
    B('shein', 'SHEIN', '#000000', 'shopping', /\bshein\b/),
    B('temu', 'Temu', '#fb7701', 'shopping', /\btemu\b/),
    B('tchibo', 'Tchibo', '#1f3d7a', 'shopping', /tchibo/),
    B('thalia', 'Thalia', '#c2410c', 'freizeit', /thalia/),
    // Freizeit
    B('mcfit', 'McFIT', '#e3000f', 'freizeit', /mcfit|rsg group/, 'M'),
    B('fitx', 'FitX', '#000000', 'freizeit', /\bfitx\b/),
    B('urbansports', 'Urban Sports Club', '#0c0c0c', 'freizeit', /urban ?sports/, 'USC'),
    B('cleverfit', 'clever fit', '#e30613', 'freizeit', /clever ?fit/, 'cf'),
    B('eventim', 'Eventim', '#002b5c', 'freizeit', /eventim/),
    B('cinema', 'Kino', '#4527a0', 'freizeit', /cinemaxx|cineplex|cinestar|\buci\b|\bkino\b/, null, 'ticket'),
    // Reisen
    B('booking', 'Booking.com', '#003580', 'reisen', /booking\.com/, 'B.'),
    B('airbnb', 'Airbnb', '#ff5a5f', 'reisen', /airbnb/),
    B('lufthansa', 'Lufthansa', '#05164d', 'reisen', /lufthansa/),
    B('eurowings', 'Eurowings', '#a3005c', 'reisen', /eurowings/),
    B('ryanair', 'Ryanair', '#073590', 'reisen', /ryanair/),
    B('easyjet', 'easyJet', '#ff6600', 'reisen', /easyjet/),
    // Versicherungen
    B('allianz', 'Allianz', '#003781', 'versicherungen', /allianz/),
    B('huk', 'HUK-COBURG', '#ffdd00', 'versicherungen', /huk-?coburg|\bhuk24?\b/, 'H'),
    B('ergo', 'ERGO', '#bf1528', 'versicherungen', /\bergo\b/),
    B('axa', 'AXA', '#00008f', 'versicherungen', /\baxa\b/),
    B('generali', 'Generali', '#c21b17', 'versicherungen', /generali|cosmos ?direkt/, 'G'),
    B('devk', 'DEVK', '#004b8d', 'versicherungen', /\bdevk\b/),
    B('debeka', 'Debeka', '#004b93', 'versicherungen', /debeka/),
    B('signal', 'SIGNAL IDUNA', '#ffcc00', 'versicherungen', /signal ?iduna/, 'SI'),
    B('ruv', 'R+V', '#003b6f', 'versicherungen', /\br ?\+ ?v\b|ruv versicherung/, 'R+V'),
    B('hansemerkur', 'HanseMerkur', '#003f7d', 'versicherungen', /hanse ?merkur/, 'HM'),
    B('tk', 'Techniker Krankenkasse', '#009fe3', 'versicherungen', /techniker krankenkasse|\btk\b krankenkasse/, 'TK'),
    B('aok', 'AOK', '#00563f', 'versicherungen', /\baok\b/),
    B('barmer', 'BARMER', '#00a6e2', 'versicherungen', /barmer/, 'B'),
    // Energie
    B('eon', 'E.ON', '#ea1c0a', 'energie', /\be\.? ?on\b|eon energie/, 'E'),
    B('vattenfall', 'Vattenfall', '#ffda00', 'energie', /vattenfall/),
    B('enbw', 'EnBW', '#000099', 'energie', /\benbw\b/),
    B('rheinenergie', 'RheinEnergie', '#e2001a', 'energie', /rheinenergie/, 'RE'),
    B('lichtblick', 'LichtBlick', '#ffd500', 'energie', /lichtblick/),
    B('naturstrom', 'naturstrom', '#7ab51d', 'energie', /naturstrom/),
    B('tibber', 'Tibber', '#023e84', 'energie', /tibber/),
    B('octopus', 'Octopus Energy', '#e6007e', 'energie', /octopus energy/, 'OE'),
    B('ostrom', 'Ostrom', '#18181b', 'energie', /\bostrom\b/),
    B('stadtwerke', 'Stadtwerke', '#b26f00', 'energie', /stadtwerke|\bswm\b/, null, 'zap'),
    // Wohnen & Abgaben
    B('rundfunk', 'Rundfunkbeitrag', '#1e3a5f', 'steuern', /rundfunk|beitragsservice|ard zdf/, 'RB'),
    B('finanzamt', 'Finanzamt', '#5f6f84', 'steuern', /finanzamt|finanzkasse/, null, 'landmark'),
    B('zoll', 'Hauptzollamt', '#5f6f84', 'steuern', /hauptzollamt|kraftfahrzeugsteuer|kfz-?steuer/, null, 'landmark'),
    // Sparen & Anlegen
    B('traderepublic', 'Trade Republic', '#111111', 'sparen', /trade ?republic/, 'TR'),
    B('scalable', 'Scalable Capital', '#18181b', 'sparen', /scalable/, 'SC'),
    B('paypal', 'PayPal', '#003087', 'shopping', /paypal/, 'P'),
    B('klarna', 'Klarna', '#ffb3c7', 'shopping', /\bklarna\b/, 'K'),
  ];
  const BRAND = {};
  BRANDS.forEach((b) => { BRAND[b.id] = b; });

  /* ---------- Allgemeine Regeln (ohne Logo) ---------- */
  // sign: -1 nur Ausgaben, +1 nur Eingänge
  const RULES = [
    { cat: 'gehalt', sign: 1, re: /\b(gehalt|lohn|bezuge|entgelt|salary|payroll|besoldung|verdienstabrechnung|lohn ?\/ ?gehalt)\b/ },
    { cat: 'einnahmen', sign: 1, re: /kindergeld|familienkasse|elterngeld|rente\b|rentenversicherung|bafog|arbeitsagentur/ },
    { cat: 'zinsen', sign: 1, re: /zinsgutschrift|habenzins|\bzinsen\b|dividende|ausschuttung|ertragsgutschrift|interest/ },
    { cat: 'erstattungen', sign: 1, re: /erstattung|refund|retoure|storno|ruckzahlung|ruckuberweisung/ },
    { cat: 'wohnen', re: /\bmiete\b|mietzahlung|kaltmiete|warmmiete|nebenkosten|hausgeld|wohnungsbau|vonovia|leg wohnen|deutsche wohnen|gewobag|wohnungsgenossenschaft|hausverwaltung|immobilienverwaltung|wohnungsverwaltung/ },
    { cat: 'energie', re: /\bstrom\b|stromvertrag|\bgas\b|abschlag energie|energieversorgung|fernwarme|wasserversorgung/ },
    { cat: 'versicherungen', re: /versicherung|krankenkasse|haftpflicht|hausrat|\bbkk\b|\bikk\b|\bdak\b/ },
    { cat: 'steuern', re: /entgelt|kontofuhrung|kontofuehrung|abschluss|gebuhr|gebuehr|dispozins|sollzins|uberziehungszins|kartengebuhr|\bsteuer\b/ },
    { cat: 'bargeld', re: /geldautomat|bargeldauszahlung|auszahlung (ga|geldautomat)|\batm\b|cash withdrawal|bargeld/ },
    { cat: 'sparen', sign: -1, re: /sparplan|wertpapier|depot|\betf\b|tagesgeld|festgeld|bauspar|wustenrot|schwabisch hall|\blbs\b|comdirect|consorsbank|flatex|smartbroker|onvista|finanzen\.net zero/ },
    { cat: 'gesundheit', re: /apotheke|arztpraxis|zahnarzt|\barzt\b|praxis dr|klinik|physiotherap|optiker|fielmann|apollo optik|friseur|haarstudio|barber|kosmetik/ },
    { cat: 'restaurants', re: /restaurant|ristorante|pizzeria|\bcafe\b|caffe|bistro|imbiss|sushi|doner|kebab|trattoria|gaststatte|brauhaus|backerei|baeckerei|backhaus|backstube|baker/ },
    { cat: 'lebensmittel', re: /supermarkt|markthalle|biomarkt|wochenmarkt|getranke|metzgerei/ },
    { cat: 'mobilitaet', re: /tankstelle|parkhaus|parkplatz|parkticket|apcoa|contipark|easypark|park ?and ?ride|autowasch|kfz|werkstatt|reifen|taxi/ },
    { cat: 'freizeit', re: /fitness|\bgym\b|sportverein|schwimmbad|museum|\bzoo\b|theater|konzert|ticket/ },
    { cat: 'reisen', re: /hotel|hostel|ferienwohnung|airline|airways|flughafen/ },
    { cat: 'shopping', re: /klarna|onlineshop|versandhandel|\bshop\b/ },
  ];

  /* ---------- Händlerkategorien (MCC) für Kartenzahlungen ---------- */
  const MCC = [
    [[5411, 5411], 'lebensmittel'], [[5422, 5499], 'lebensmittel'], [[5811, 5814], 'restaurants'],
    [[5541, 5542], 'mobilitaet'], [[4111, 4131], 'mobilitaet'], [[4784, 4789], 'mobilitaet'], [[7523, 7523], 'mobilitaet'],
    [[3000, 3299], 'reisen'], [[4511, 4511], 'reisen'], [[3501, 3999], 'reisen'], [[7011, 7011], 'reisen'], [[4722, 4722], 'reisen'],
    [[5912, 5912], 'gesundheit'], [[5977, 5977], 'gesundheit'], [[8011, 8099], 'gesundheit'], [[7230, 7230], 'gesundheit'],
    [[4812, 4816], 'kommunikation'], [[4899, 4899], 'abos'], [[5815, 5818], 'abos'],
    [[7832, 7841], 'freizeit'], [[7911, 7999], 'freizeit'], [[5940, 5941], 'freizeit'], [[5942, 5942], 'freizeit'],
    [[6010, 6011], 'bargeld'], [[4900, 4900], 'energie'], [[6300, 6399], 'versicherungen'], [[9311, 9399], 'steuern'],
    [[5200, 5399], 'shopping'], [[5600, 5699], 'shopping'], [[5700, 5799], 'shopping'], [[5900, 5999], 'shopping'],
  ];

  const ACCOUNT_TYPES = {
    giro: { name: 'Girokonten', icon: 'landmark' },
    credit: { name: 'Kreditkarten', icon: 'credit-card' },
    savings: { name: 'Sparkonten', icon: 'piggy' },
    depot: { name: 'Depots', icon: 'line-chart' },
  };

  // Reihenfolge = feste Farbzuordnung im Fixkosten-Balken (Farbe folgt der Gruppe, nie dem Rang)
  const CONTRACT_GROUPS = [
    { id: 'wohnen', name: 'Wohnen & Energie', icon: 'building' },
    { id: 'versicherungen', name: 'Versicherungen', icon: 'umbrella' },
    { id: 'kommunikation', name: 'Internet & Mobilfunk', icon: 'wifi' },
    { id: 'abos', name: 'Streaming & Abos', icon: 'tv' },
    { id: 'mobilitaet', name: 'Mobilität', icon: 'car' },
    { id: 'freizeit', name: 'Freizeit & Sonstiges', icon: 'ticket' },
  ];
  const GROUP_OF_CAT = {
    wohnen: 'wohnen', energie: 'wohnen', versicherungen: 'versicherungen',
    kommunikation: 'kommunikation', abos: 'abos', mobilitaet: 'mobilitaet',
  };

  FK.catalog = {
    categories: CATEGORIES,
    cat: (id) => CAT[id] || CAT.sonstiges,
    banks: BANKS,
    bank: (id) => BANK[id] || BANK.other,
    brands: BRANDS,
    merchant: (id) => (id && BRAND[id]) || null,
    rules: RULES,
    mcc: (code) => {
      const n = Number(code);
      if (!n) return null;
      for (const [[a, b], cat] of MCC) if (n >= a && n <= b) return cat;
      return null;
    },
    accountTypes: ACCOUNT_TYPES,
    contractGroups: CONTRACT_GROUPS,
    /** Bereich in der Vertragsübersicht; der Rundfunkbeitrag zählt zum Wohnen */
    groupOfCategory: (cat, merchantId) => (merchantId === 'rundfunk' ? 'wohnen' : GROUP_OF_CAT[cat] || 'freizeit'),
  };
})(window.FK);
