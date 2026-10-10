/* Finanzkompass – Kern: Namespace, HTML-Templates, Formatierung, Datum, Zufall, Speicher */
(function () {
  'use strict';
  const FK = (window.FK = window.FK || {});
  FK.screens = FK.screens || {};
  FK.actions = FK.actions || {};

  /* ---------- HTML-Templates mit automatischem Escaping ---------- */
  class Raw {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const raw = (s) => new Raw(String(s));

  function toHTML(v) {
    if (v == null || v === false || v === true) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(toHTML).join('');
    return esc(v);
  }

  /** html`<b>${wert}</b>` – Werte werden escaped, verschachtelte html``-Ergebnisse nicht. */
  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += toHTML(vals[i]) + strings[i + 1];
    return new Raw(out);
  }

  FK.html = html;
  FK.raw = raw;
  FK.esc = esc;
  FK.toHTML = toHTML;

  /* ---------- Zahlen ---------- */
  const NBSP = ' ';
  const MINUS = '−';
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const round2 = (n) => Math.round(n * 100) / 100;

  /** 1234.5 → „1.234,50 €“, −12 → „−12,00 €“, mit sign:true → „+12,00 €“ */
  function eur(n, opts) {
    const o = opts || {};
    const decimals = o.decimals === 0 ? 0 : 2;
    const r = decimals === 0 ? Math.round(n) : round2(n);
    const body = (decimals === 0 ? nf0.format(Math.abs(r)) : nf2.format(Math.abs(r))) + NBSP + '€';
    if (r < 0) return MINUS + body;
    if (o.sign && r > 0) return '+' + body;
    return body;
  }

  /** Kompakte Achsenbeschriftung: 1500 → „1.500 €“, 12500 → „12,5 Tsd. €“ */
  function eurAxis(n) {
    const a = Math.abs(n);
    const s = n < 0 ? MINUS : '';
    if (a >= 10000) return s + nf1.format(a / 1000).replace(',0', '') + NBSP + 'Tsd.';
    return s + nf0.format(a) + NBSP + '€';
  }

  function pct(x, decimals) {
    const d = decimals || 0;
    return new Intl.NumberFormat('de-DE', {
      style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(x).replace('-', MINUS);
  }

  FK.fmt = { eur, eurAxis, pct, round2, num: (n) => nf0.format(n), MINUS, NBSP };

  /* ---------- Datum ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const D = {
    ymd: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    ym: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
    parse: (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d || 1);
    },
    addDays: (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n),
    addMonths: (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1),
    /** Monat verschieben und Tag behalten (auf Monatsende begrenzt) */
    shiftMonths: (d, n) => {
      const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
      const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), dim));
    },
    startOfMonth: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
    endOfMonth: (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0),
    dim: (y, m) => new Date(y, m + 1, 0).getDate(),
    diffDays: (a, b) => Math.round(
      (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5
    ),
    sameDay: (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(),
    now: () => new Date(),
    today: () => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    },
    ymAdd: (ym, n) => D.ym(D.addMonths(D.parse(ym), n)),
  };

  /* Gesetzliche Feiertage (bundesweit + NRW) – Banken buchen an diesen Tagen nicht */
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  const holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const e = easterSunday(y);
    const map = {};
    const add = (d, name) => { map[D.ymd(d)] = name; };
    add(new Date(y, 0, 1), 'Neujahr');
    add(D.addDays(e, -2), 'Karfreitag');
    add(D.addDays(e, 1), 'Ostermontag');
    add(new Date(y, 4, 1), 'Tag der Arbeit');
    add(D.addDays(e, 39), 'Christi Himmelfahrt');
    add(D.addDays(e, 50), 'Pfingstmontag');
    add(D.addDays(e, 60), 'Fronleichnam');
    add(new Date(y, 9, 3), 'Tag der Deutschen Einheit');
    add(new Date(y, 10, 1), 'Allerheiligen');
    add(new Date(y, 11, 25), '1. Weihnachtstag');
    add(new Date(y, 11, 26), '2. Weihnachtstag');
    holidayCache[y] = map;
    return map;
  }
  D.holiday = (d) => holidays(d.getFullYear())[D.ymd(d)] || null;
  D.isBankDay = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !D.holiday(d);
  D.isShopDay = (d) => d.getDay() !== 0 && !D.holiday(d);
  D.nextBankDay = (d) => {
    let x = d;
    while (!D.isBankDay(x)) x = D.addDays(x, 1);
    return x;
  };
  D.prevBankDay = (d) => {
    let x = d;
    while (!D.isBankDay(x)) x = D.addDays(x, -1);
    return x;
  };
  D.lastBankDayOfMonth = (y, m) => D.prevBankDay(new Date(y, m + 1, 0));
  /** n-ter Bankarbeitstag eines Monats (1-basiert) */
  D.nthBankDay = (y, m, n) => {
    let x = new Date(y, m, 1);
    let count = 0;
    for (;;) {
      if (D.isBankDay(x) && ++count === n) return x;
      x = D.addDays(x, 1);
    }
  };

  FK.date = D;

  const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const WDS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

  const toDate = (d) => (typeof d === 'string' ? D.parse(d) : d);

  FK.dfmt = {
    WD, WDS, MON, MONS,
    dm: (d) => { d = toDate(d); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; },
    dmy: (d) => { d = toDate(d); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; },
    long: (d) => { d = toDate(d); return `${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; },
    dayMonth: (d) => { d = toDate(d); return `${d.getDate()}. ${MON[d.getMonth()]}`; },
    dayMonthShort: (d) => { d = toDate(d); return `${d.getDate()}. ${MONS[d.getMonth()]}`; },
    weekdayLong: (d) => { d = toDate(d); return `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}`; },
    wdShort: (d) => { d = toDate(d); return `${WDS[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; },
    month: (ym) => { const d = D.parse(ym); return `${MON[d.getMonth()]} ${d.getFullYear()}`; },
    monthName: (ym) => MON[D.parse(ym).getMonth()],
    monthShort: (ym) => MONS[D.parse(ym).getMonth()],
    time: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    /** „Heute“, „Gestern“, „Mittwoch, 1. Oktober“ */
    dayHeader: (d) => {
      d = toDate(d);
      const n = D.diffDays(D.today(), d);
      if (n === 0) return 'Heute';
      if (n === -1) return 'Gestern';
      const y = d.getFullYear() !== D.today().getFullYear() ? ` ${d.getFullYear()}` : '';
      return `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}${y}`;
    },
    /** Relativ für anstehende Termine: „heute“, „morgen“, „in 3 Tagen“, „Mi., 07.10.“ */
    due: (d) => {
      d = toDate(d);
      const n = D.diffDays(D.today(), d);
      if (n === 0) return 'heute';
      if (n === 1) return 'morgen';
      if (n > 1 && n <= 6) return `in ${n} Tagen`;
      return `${WDS[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
    },
  };

  /* ---------- Deterministischer Zufall ---------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Zufallsgenerator mit festem Seed – gleiche Eingabe, gleiche Folge */
  function rng(seed) {
    const next = mulberry32(xmur3(String(seed))());
    const r = () => next();
    r.between = (a, b) => a + (b - a) * next();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * next());
    r.chance = (p) => next() < p;
    r.pick = (arr) => arr[Math.floor(next() * arr.length)];
    r.weighted = (pairs) => {
      let total = 0;
      for (const p of pairs) total += p[1];
      let x = next() * total;
      for (const p of pairs) if ((x -= p[1]) < 0) return p[0];
      return pairs[pairs.length - 1][0];
    };
    r.normal = () => {
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return r;
  }
  FK.rng = rng;
  FK.hash = (s) => xmur3(String(s))();

  /* ---------- Sonstiges ---------- */
  FK.util = {
    sum: (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0),
    clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
    groupBy: (arr, f) => {
      const m = new Map();
      for (const x of arr) {
        const k = f(x);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
      }
      return m;
    },
    debounce: (fn, ms) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    },
    uid: (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9),
    /** relative Luminanz für die Wahl von heller/dunkler Schrift auf Farbflächen */
    luminance: (hex) => {
      const h = hex.replace('#', '');
      const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    },
    initials: (name) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
    normalize: (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss'),
  };

  FK.storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    /** Gibt false zurück, wenn nicht gespeichert werden konnte (z. B. Speicher voll oder gesperrt) */
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    },
  };

  FK.reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };
})();
