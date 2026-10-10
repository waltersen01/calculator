/* Finanzkompass – Erkennung wiederkehrender Zahlungen (Verträge, Abos, Gehalt, Daueraufträge) aus echten Umsätzen */
(function (FK) {
  'use strict';
  const D = FK.date;
  const C = FK.catalog;
  const norm = FK.util.normalize;

  const PERIODS = [
    { id: 'monthly', months: 1, days: 30.44, tol: 7, min: 3 },
    { id: 'quarterly', months: 3, days: 91.3, tol: 14, min: 2 },
    { id: 'halfyearly', months: 6, days: 182.6, tol: 20, min: 2 },
    { id: 'yearly', months: 12, days: 365.25, tol: 30, min: 2 },
  ];

  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** Gruppenschlüssel: Marke > IBAN > Gläubiger-ID > bereinigter Name (je Richtung) */
  function groupKey(t) {
    const dir = t.amount < 0 ? 'd' : 'c';
    if (t.merchantId) return `${dir}:brand:${t.merchantId}`;
    if (t.counterIban && !t.intermediary) return `${dir}:iban:${FK.categorize.normIban(t.counterIban)}`;
    if (t.creditorId && !t.intermediary) return `${dir}:cid:${t.creditorId.toUpperCase()}`;
    const n = norm(t.name).replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    return n ? `${dir}:name:${n}` : null;
  }
  const mandateOf = (t) => (t.creditorId && t.mandateRef && !t.intermediary ? `${t.creditorId}|${t.mandateRef}`.toUpperCase() : null);

  /**
   * Mehrere Verträge beim selben Anbieter (z. B. Haftpflicht und Kfz bei derselben Versicherung) über die
   * Mandatsreferenz trennen. Umsätze ohne Mandat (z. B. aus der Live-Verbindung) kommen zum Vertrag mit dem
   * ähnlichsten Betrag.
   */
  function splitByMandate(key, items) {
    const byMandate = FK.util.groupBy(items.filter(mandateOf), mandateOf);
    if (byMandate.size < 2) return [{ key, items }];
    const subs = [...byMandate].map(([m, list]) => ({ key: `${key}|m:${m}`, items: list.slice(), amount: median(list.map((t) => Math.abs(t.amount))) }));
    const rest = [];
    for (const t of items) {
      if (mandateOf(t)) continue;
      const a = Math.abs(t.amount);
      const best = subs.reduce((b, x) => (Math.abs(x.amount - a) < Math.abs(b.amount - a) ? x : b), subs[0]);
      if (Math.abs(best.amount - a) <= Math.max(1.5, best.amount * 0.2)) best.items.push(t); else rest.push(t);
    }
    if (rest.length) subs.push({ key: `${key}|rest`, items: rest });
    return subs;
  }

  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Verwendungszweck als kurze Tarifbeschreibung: ohne Namen, Nummern, Datumsangaben und Füllwörter */
  function productOf(t) {
    if (t.via) return `über ${t.via}`;
    let p = String(t.purpose || '')
      .replace(/(EREF|MREF|CRED|KREF|ABWA|ABWE|IBAN|BIC)\+\S*/g, ' ')
      .replace(/SVWZ\+/g, ' ')
      .replace(/\b\S+\.(com|de|net|org|eu|io)\b\S*/gi, ' ');
    for (const n of [t.counterparty, t.name]) if (n && n.length > 2) p = p.replace(new RegExp(escRe(n), 'ig'), ' ');
    p = p
      .replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|\b\d{4}-\d{2}(-\d{2})?(T[\d:]+)?\b|\b\d{1,2}[./]\d{4}\b/g, ' ')
      .replace(/\S*\d{4,}\S*/g, ' ')
      .replace(/\b(kunden|vertrags|vers|versicherungs|beitrags|mitglieds|rechnungs|abo)?[.-]*\s?(nr|nummer)\b\.?:?/gi, ' ')
      .replace(/\b(vertragskonto|rechnung|kundennummer|referenz|mandat)\b\.?:?/gi, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.,:;/+–-]+|[\s.,:;/+–-]+$/g, '')
      .trim();
    return p.length > 3 ? p.slice(0, 44) : '';
  }

  function nextDate(last, period, bankDays, preferEndOfMonth) {
    let d;
    if (preferEndOfMonth) d = D.lastBankDayOfMonth(last.getFullYear(), last.getMonth() + period.months);
    else d = D.shiftMonths(last, period.months);
    return bankDays ? D.nextBankDay(d) : d;
  }

  /**
   * Erkennt Serien. Ergebnis je Serie:
   * { key, kind: 'contract'|'income'|'transfer'|'variable', interval, period, txs, last, amount, prices, next, ... }
   */
  function detect(txs, today) {
    const groups = new Map();
    for (const t of txs) {
      if (t.pending || Math.abs(t.amount) < 0.5) continue;
      if (t.categoryId === 'bargeld') continue;
      const k = groupKey(t);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const out = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      // Pro Konto getrennt betrachten
      for (const [accountId, items] of FK.util.groupBy(list, (t) => t.accountId)) {
        for (const sub of splitByMandate(key, items)) {
          if (sub.items.length < 2) continue;
          const s = analyzeSeries(sub.key, accountId, sub.items, today);
          if (s) out.push(s);
        }
      }
    }
    return out;
  }

  function analyzeSeries(key, accountId, items, today) {
    const list = items.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    // Mehrere Buchungen am selben Tag zusammenfassen (z. B. geteilte Zahlungen)
    const days = [];
    for (const t of list) {
      const last = days[days.length - 1];
      if (last && last.date === t.date) { last.amount += t.amount; last.txs.push(t); } else days.push({ date: t.date, amount: t.amount, txs: [t] });
    }
    if (days.length < 2) return null;
    const dates = days.map((d) => D.parse(d.date));
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(D.diffDays(dates[i - 1], dates[i]));
    const g = median(gaps);
    const period = PERIODS.find((p) => Math.abs(g - p.days) <= p.tol);
    if (!period) return null;
    const fit = gaps.filter((x) => Math.abs(x - period.days) <= period.tol).length / gaps.length;
    if (fit < 0.75) return null;
    const hasMandate = items.some((t) => t.creditorId && !t.intermediary);
    const minCount = period.id === 'monthly' && hasMandate ? 2 : period.min;
    if (days.length < minCount) return null;

    // Beträge: stabil oder mit klaren Preisstufen
    const amounts = days.map((d) => Math.abs(d.amount));
    const recent = amounts.slice(-6);
    const med = median(recent);
    const stable = recent.filter((a) => Math.abs(a - med) <= Math.max(1.5, med * 0.2)).length / recent.length;
    if (stable < 0.7) return null;

    const last = dates[dates.length - 1];
    const lastDay = days[days.length - 1];
    const ageDays = D.diffDays(last, today);
    if (ageDays > period.days * 1.6 + 10) return null; // Serie ist offenbar beendet

    const sample = lastDay.txs[0];
    const sign = lastDay.amount < 0 ? -1 : 1;
    // Preisstufen erkennen
    const prices = [];
    for (let i = 0; i < days.length; i++) {
      const a = Math.round(Math.abs(days[i].amount) * 100) / 100;
      const prev = prices[prices.length - 1];
      if (!prev || Math.abs(prev.amount - a) > Math.max(0.01, prev.amount * 0.01)) prices.push({ since: days[i].date.slice(0, 7), date: days[i].date, amount: a });
    }
    // Einmalige Ausreißer (nur ein Monat abweichend) nicht als Preisstufe werten
    const cleaned = [];
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      const next = prices[i + 1];
      const count = days.filter((d) => Math.abs(Math.abs(d.amount) - p.amount) <= Math.max(0.01, p.amount * 0.01)).length;
      if (count === 1 && next && i > 0) continue;
      cleaned.push(p);
    }
    const isMonthEnd = days.slice(-3).every((d) => {
      const dt = D.parse(d.date);
      return D.diffDays(dt, D.endOfMonth(dt)) <= 4;
    });
    // Mandat für Anzeige und Kündigung: aus der jüngsten Zahlung, die eines trägt
    const withMandate = list.slice().reverse().find((t) => t.creditorId && !t.intermediary);
    const method = withMandate ? 'sepa' : sample.method;
    const bankDays = method === 'sepa' || method === 'standing' || sign > 0;
    const next = nextDate(last, period, bankDays, sign > 0 && isMonthEnd);

    const cat = sample.categoryId;
    const type = C.cat(cat).type;
    let kind = 'contract';
    if (type === 'saving' || type === 'transfer') kind = 'transfer'; // Sparraten und Umbuchungen, auch eingehend
    else if (sign > 0) kind = 'income';
    else if (cat === 'lebensmittel' || cat === 'restaurants' || (cat === 'shopping' && stable < 0.9)) kind = 'variable';

    return {
      id: 'rc_' + FK.hash(key + '|' + accountId).toString(36),
      key, accountId, kind, sign,
      interval: period.id, period,
      txs: days.flatMap((d) => d.txs).reverse(),
      count: days.length,
      first: dates[0], last, next,
      amount: Math.round(Math.abs(lastDay.amount) * 100) / 100,
      prices: cleaned.length ? cleaned : prices,
      name: sample.name, merchantId: sample.merchantId, categoryId: cat, method,
      creditorId: withMandate ? withMandate.creditorId : '', mandateRef: withMandate ? withMandate.mandateRef || '' : '',
      counterparty: sample.counterparty, counterIban: sample.counterIban,
      product: productOf(withMandate || sample),
      day: last.getDate(), isMonthEnd,
    };
  }

  /** Künftige Termine einer Serie im Zeitraum [from, to] */
  function datesBetween(s, from, to, until) {
    const out = [];
    const endLimit = until ? D.parse(until) : null;
    const bankDays = s.method === 'sepa' || s.method === 'standing' || s.sign > 0;
    for (let i = 1; i <= 40; i++) {
      const n = s.period.months * i;
      const base = s.sign > 0 && s.isMonthEnd ? D.lastBankDayOfMonth(s.last.getFullYear(), s.last.getMonth() + n) : D.shiftMonths(s.last, n);
      const d = bankDays ? D.nextBankDay(base) : base;
      if (d > to) break;
      if (endLimit && d > endLimit) break;
      if (d >= from) out.push(d);
    }
    return out;
  }

  FK.recurring = { detect, datesBetween, PERIODS };
})(window.FK);
