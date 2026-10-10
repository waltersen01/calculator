/* Finanzkompass – CSV-Import: Sparkasse (CSV-CAMT V2 / CSV-MT940), Trade Republic (Transaktionsexport) und andere Banken.
   Alles läuft lokal im Browser; Dateien verlassen das Gerät nicht. */
(function (FK) {
  'use strict';
  const norm = FK.util.normalize;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Datei lesen: UTF-8, sonst Windows-1252 (Sparkasse liefert ISO-8859-1) ---------- */
  async function readText(file) {
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
    return text.replace(/^﻿/, '');
  }

  /* ---------- CSV ---------- */
  function countOutside(line, d) {
    let n = 0;
    let q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (c === d && !q) n++;
    }
    return n;
  }

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
    let best = ';';
    let bestScore = -1;
    for (const d of [';', ',', '\t', '|']) {
      const counts = lines.map((l) => countOutside(l, d)).filter((n) => n > 0);
      if (!counts.length) continue;
      const freq = {};
      counts.forEach((n) => { freq[n] = (freq[n] || 0) + 1; });
      const [mode, times] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      const score = times * Math.min(Number(mode), 30);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function parseCSV(text, delim) {
    const rows = [];
    let row = [];
    let field = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
  }

  /* ---------- Werte ---------- */
  function parseAmount(s) {
    if (s == null) return NaN;
    let v = String(s).replace(/[\s €]|EUR/gi, '');
    if (!v) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
    if (/-$/.test(v)) { neg = !neg; v = v.slice(0, -1); }
    if (/^[-−]/.test(v)) { neg = !neg; v = v.slice(1); } else if (/^\+/.test(v)) v = v.slice(1);
    const c = v.lastIndexOf(',');
    const d = v.lastIndexOf('.');
    if (c > -1 && d > -1) v = c > d ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    else if (c > -1) v = v.replace(',', '.');
    else if ((v.match(/\./g) || []).length > 1) v = v.replace(/\./g, '');
    if (!/^\d*\.?\d+$/.test(v)) return NaN;
    const n = parseFloat(v);
    return neg ? -n : n;
  }

  const validYMD = (y, m, d) => y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

  /** Datum (und ggf. Uhrzeit) aus „04.10.26“, „04.10.2026“, „2026-10-04“, „2026-10-04T08:12:00Z“ */
  function parseDate(s) {
    const v = String(s || '').trim();
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) {
      if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
        const dt = new Date(v.replace(' ', 'T'));
        if (!isNaN(dt)) return { date: FK.date.ymd(dt), time: FK.dfmt.time(dt) };
      }
      if (validYMD(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
    }
    m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m && validYMD(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: null };
    m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      if (validYMD(y, +m[2], +m[1])) return { date: `${y}-${pad(m[2])}-${pad(m[1])}`, time: m[4] ? `${pad(m[4])}:${m[5]}` : null };
    }
    return null;
  }

  /* ---------- Spaltenerkennung ---------- */
  const SYN = {
    date: ['buchungstag', 'buchungsdatum', 'datum', 'date', 'booking date', 'buchung', 'transaktionsdatum', 'transaction date', 'belegdatum', 'umsatzdatum'],
    valueDate: ['valutadatum', 'valuta', 'wertstellung', 'value date', 'wertstellungsdatum', 'wert'],
    amount: ['betrag', 'amount', 'betrag (eur)', 'betrag in eur', 'betrag (€)', 'umsatz', 'umsatz in eur', 'betrag eur'],
    debit: ['soll', 'soll (eur)', 'soll (€)', 'ausgang', 'debit', 'belastung'],
    credit: ['haben', 'haben (eur)', 'haben (€)', 'eingang', 'credit'],
    counterparty: ['beguenstigter/zahlungspflichtiger', 'begunstigter/zahlungspflichtiger', 'auftraggeber/empfanger', 'auftraggeber / begunstigter', 'empfanger/auftraggeber', 'name', 'counterparty', 'merchant', 'gegenpartei', 'beteiligter', 'name zahlungsbeteiligter', 'zahlungsbeteiligter'],
    payee: ['zahlungsempfanger*in', 'zahlungsempfanger', 'empfanger', 'payee', 'begunstigter'],
    payer: ['zahlungspflichtige*r', 'zahlungspflichtiger', 'auftraggeber', 'payer', 'absender'],
    purpose: ['verwendungszweck', 'purpose', 'description', 'beschreibung', 'buchungsinformation', 'text', 'reference', 'zahlungsreferenz', 'vorgang/verwendungszweck', 'memo', 'buchungsdetails'],
    iban: ['kontonummer/iban', 'iban', 'iban auftraggeber', 'iban empfanger', 'gegenkonto', 'iban zahlungsbeteiligter'],
    bic: ['bic (swift-code)', 'bic', 'swift', 'bic/swift', 'swift-code'],
    bookingText: ['buchungstext', 'umsatzart', 'transaktionsart', 'vorgang', 'umsatztyp', 'art'],
    creditorId: ['glaeubiger id', 'glaubiger id', 'glaubiger-id', 'glaeubiger-id', 'creditor id', 'glaubiger-identifikationsnummer'],
    mandateRef: ['mandatsreferenz', 'mandate reference', 'mandat'],
    ownAccount: ['auftragskonto', 'eigenes konto', 'iban eigenes konto'],
    currency: ['waehrung', 'wahrung', 'currency'],
    status: ['info', 'status'],
    balance: ['saldo', 'kontostand', 'balance', 'saldo nach buchung', 'saldo (eur)', 'saldo (€)'],
  };
  const FIELD_LABEL = { date: 'Datum', amount: 'Betrag', counterparty: 'Empfänger / Auftraggeber', purpose: 'Verwendungszweck', iban: 'IBAN', bookingText: 'Buchungstext' };

  const key = (s) => norm(s).replace(/\s+/g, ' ').trim();

  function autoMap(header) {
    const h = header.map(key);
    const map = {};
    for (const [field, names] of Object.entries(SYN)) {
      let idx = h.findIndex((x) => names.includes(x));
      if (idx < 0) idx = h.findIndex((x) => names.some((n) => n.length > 4 && x.startsWith(n)));
      if (idx >= 0 && !Object.values(map).includes(idx)) map[field] = idx;
    }
    return map;
  }

  function findHeader(rows) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const m = autoMap(rows[i]);
      const score = Object.keys(m).length + (m.date != null ? 2 : 0) + (m.amount != null || m.debit != null ? 2 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return bestScore >= 5 ? best : -1;
  }

  /* ---------- Formate ---------- */
  function isTradeRepublic(h) {
    const k = h.map(key);
    return k.includes('account_type') || k.includes('counterparty_iban') || k.includes('mcc_code') || (k.includes('symbol') && k.includes('shares') && k.includes('amount'));
  }

  /** Vorgangsart aus Typ/Kategorie, z. B. „SAVINGS_PLAN_EXECUTION“, „TRANSFER_INSTANT_OUTBOUND“, „Kartentransaktion“ */
  function trKind(type, category, amount, hasSecurity, shares) {
    const t = ` ${type} ${category} `.replace(/[_\-/]+/g, ' ');
    if (/saveback/.test(t)) return 'saveback';
    if (/round ?up|aufrund/.test(t)) return 'buy';
    if (/\bsell\b|verkauf|\bsale\b|redemption|tilgung|maturity/.test(t)) return 'sell';
    if (/savings ?plan|sparplan|\bbuy\b|\bkauf\b|purchase/.test(t)) return 'buy';
    if (/dividend|distribution|ausschuttung|coupon|kupon/.test(t)) return 'dividend';
    if (/interest|zins/.test(t)) return 'interest';
    if (/card|karte/.test(t)) return 'card';
    if (/outbound|withdraw|auszahlung|transfer out|outgoing|payout|ausgehend/.test(t)) return 'withdrawal';
    if (/inbound|deposit|einzahlung|transfer in\b|incoming|inpayment|top ?up|eingehend/.test(t)) return 'deposit';
    if (/\bfees?\b|gebuhr/.test(t)) return 'fee';
    if (/\btax\b|steuer/.test(t)) return 'tax';
    if (hasSecurity) return shares < 0 || amount > 0 ? 'sell' : 'buy';
    return 'other';
  }

  const KIND_LABEL = { buy: 'Kauf', sell: 'Verkauf', saveback: 'Saveback', dividend: 'Dividende', interest: 'Zinsen', card: 'Kartenzahlung', deposit: 'Einzahlung', withdrawal: 'Auszahlung', fee: 'Gebühr', tax: 'Steuer', transfer: 'Überweisung', other: 'Buchung' };

  const OUTFLOW = new Set(['buy', 'card', 'withdrawal', 'transfer', 'fee', 'tax']);
  const isSecType = (s) => /secur|depot|wertpapier|crypto|krypto|stock|asset|portfolio/.test(s);

  function mapTradeRepublic(rows, hi) {
    const head = rows[hi].map(key);
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
    const ix = {
      datetime: col('datetime'), date: col('date', 'datum'), accountType: col('account_type'), category: col('category'),
      type: col('type', 'typ'), assetClass: col('asset_class'), name: col('name'), symbol: col('symbol', 'isin'),
      shares: col('shares', 'quantity', 'stuck'), price: col('price', 'kurs'), amount: col('amount', 'betrag'),
      currency: col('currency', 'wahrung'), description: col('description', 'beschreibung'),
      txId: col('transaction_id', 'id'), cpName: col('counterparty_name'), cpIban: col('counterparty_iban'),
      reference: col('payment_reference'), mcc: col('mcc_code', 'mcc'),
    };
    const get = (r, i) => (i >= 0 ? r[i] || '' : '');
    const parsed = [];
    for (const r of rows.slice(hi + 1)) {
      const d = parseDate(get(r, ix.datetime)) || parseDate(get(r, ix.date));
      if (!d) continue;
      const amount = parseAmount(get(r, ix.amount));
      const shares = parseAmount(get(r, ix.shares));
      const symbol = get(r, ix.symbol);
      const hasSec = !!symbol && !isNaN(shares) && shares !== 0;
      const p = {
        d, amount, shares, symbol, hasSec, price: parseAmount(get(r, ix.price)), name: get(r, ix.name), at: key(get(r, ix.accountType)),
        cpName: get(r, ix.cpName), cpIban: get(r, ix.cpIban), mcc: get(r, ix.mcc), txId: get(r, ix.txId),
        description: get(r, ix.description), reference: get(r, ix.reference), currency: get(r, ix.currency) || 'EUR', assetClass: get(r, ix.assetClass),
      };
      p.group = p.txId || (ix.datetime >= 0 && get(r, ix.datetime) ? `${get(r, ix.datetime)}|${p.name}` : '');
      p.kind = trKind(key(get(r, ix.type)), key(get(r, ix.category)), isNaN(amount) ? 0 : amount, hasSec, shares);
      if (p.kind === 'withdrawal' && p.cpName) p.kind = 'transfer';
      parsed.push(p);
    }

    // Manche Exporte buchen einen Kauf zweimal: Verrechnungskonto (Geld) und Depot (Stücke)
    const groups = FK.util.groupBy(parsed.filter((p) => p.group), (p) => p.group);
    const splitLegs = [...groups.values()].some((l) => l.length > 1 && l.some((p) => isSecType(p.at)) && l.some((p) => !isSecType(p.at)));
    const units = splitLegs ? [...groups.values(), ...parsed.filter((p) => !p.group).map((p) => [p])] : parsed.map((p) => [p]);
    // Ohne negative Beträge im Export: Vorzeichen aus der Vorgangsart ableiten
    const signed = parsed.some((p) => p.amount < 0);

    const txs = [];
    const trades = [];
    for (const unit of units) {
      const sec = unit.find((p) => p.hasSec);
      const cashRows = unit.filter((p) => !splitLegs || !isSecType(p.at));
      const security = sec ? { isin: sec.symbol, name: sec.name || sec.symbol, shares: Math.abs(sec.shares), price: isNaN(sec.price) ? null : sec.price, assetClass: sec.assetClass } : null;
      const cashAmt = (cashRows.find((p) => !isNaN(p.amount)) || unit.find((p) => !isNaN(p.amount)) || {}).amount;
      if (security) trades.push({ date: sec.d.date, kind: sec.kind, amount: isNaN(cashAmt) || cashAmt == null ? 0 : cashAmt, security });
      for (const p of cashRows) {
        if (isNaN(p.amount) || Math.abs(p.amount) < 0.005) continue;
        const kind = sec && p.kind === 'other' ? sec.kind : p.kind;
        if (kind === 'saveback') continue; // Saveback wird direkt angelegt und bewegt kein Guthaben
        let amount = Math.round(p.amount * 100) / 100;
        if (!signed) amount = OUTFLOW.has(kind) ? -Math.abs(amount) : Math.abs(amount);
        const label = KIND_LABEL[kind] || 'Buchung';
        txs.push({
          date: p.d.date, valueDate: null, time: p.d.time, amount, currency: p.currency,
          counterparty: p.cpName || (security ? security.name : p.name) || 'Trade Republic',
          counterIban: p.cpIban,
          purpose: p.description || p.reference || (security ? `${label} ${security.name}${security.shares ? ` · ${String(security.shares).replace('.', ',')} Stk.` : ''}` : label),
          bookingText: label, creditorId: '', mandateRef: '', mcc: p.mcc, pending: false, kind, security, extId: p.txId,
        });
      }
    }
    const warnings = [];
    if (!txs.length && !trades.length) warnings.push('Keine Buchungen mit Datum und Betrag gefunden.');
    return { format: 'traderepublic', bankId: 'traderepublic', accountIban: '', txs, holdings: holdingsFrom(trades), balance: null, warnings };
  }

  /** Depotbestand aus Käufen/Verkäufen (Durchschnittskosten), bewertet zum letzten Ausführungskurs */
  function holdingsFrom(trades) {
    const pos = new Map();
    trades.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const t of trades) {
      const s = t.security;
      const p = pos.get(s.isin) || { isin: s.isin, name: s.name, assetClass: s.assetClass, shares: 0, cost: 0, lastPrice: null, lastDate: null };
      const cash = Math.abs(t.amount) || (s.price ? s.price * s.shares : 0);
      if (t.kind === 'sell') {
        const ratio = p.shares > 0 ? Math.min(1, s.shares / p.shares) : 0;
        p.cost -= p.cost * ratio;
        p.shares -= s.shares;
      } else {
        p.shares += s.shares;
        if (t.kind !== 'saveback' || cash) p.cost += cash;
      }
      const px = s.price || (cash && s.shares ? cash / s.shares : null);
      if (px) { p.lastPrice = px; p.lastDate = t.date; }
      if (s.name && s.name !== s.isin) p.name = s.name;
      pos.set(s.isin, p);
    }
    return [...pos.values()]
      .filter((p) => p.shares > 1e-6)
      .map((p) => Object.assign(p, { cost: Math.round(p.cost * 100) / 100, value: Math.round((p.lastPrice ? p.shares * p.lastPrice : p.cost) * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }

  const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
  const ibanOf = (v) => { const x = String(v || '').replace(/\s+/g, '').toUpperCase(); return IBAN_RE.test(x) ? x : ''; };

  /** Vorspann vor der Kopfzeile (z. B. DKB, ING): eigene IBAN und Kontostand */
  function preamble(rows, hi) {
    const out = { iban: '', balance: null };
    for (const r of rows.slice(0, Math.max(0, hi))) {
      for (const c of r) if (!out.iban && ibanOf(c)) out.iban = ibanOf(c);
      if (/kontostand|saldo/i.test(r[0] || '')) {
        const v = r.slice(1).map(parseAmount).find((x) => !isNaN(x));
        const dm = String(r[0]).match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
        const pd = dm ? parseDate(dm[1]) : null;
        if (v != null) out.balance = { amount: v, date: pd ? pd.date : null };
      }
    }
    return out;
  }

  function mapGeneric(rows, hi, map, format) {
    const get = (r, f) => (map[f] != null && map[f] >= 0 ? r[map[f]] || '' : '');
    const txs = [];
    let own = '';
    let skipped = 0;
    const saldo = [];
    for (const r of rows.slice(hi + 1)) {
      const d = parseDate(get(r, 'date'));
      let amount = parseAmount(get(r, 'amount'));
      if (isNaN(amount) && (map.debit != null || map.credit != null)) {
        const de = parseAmount(get(r, 'debit'));
        const cr = parseAmount(get(r, 'credit'));
        if (!isNaN(de) || !isNaN(cr)) amount = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(de) ? 0 : Math.abs(de));
      }
      if (!d || isNaN(amount)) { skipped++; continue; }
      if (!own) own = get(r, 'ownAccount');
      const vd = parseDate(get(r, 'valueDate'));
      // Getrennte Spalten für Zahlungspflichtige und Empfänger: die Gegenseite hängt von der Richtung ab
      const counterparty = get(r, 'counterparty') || (amount < 0 ? get(r, 'payee') || get(r, 'payer') : get(r, 'payer') || get(r, 'payee'));
      const bal = parseAmount(get(r, 'balance'));
      if (!isNaN(bal)) saldo.push({ date: d.date, amount: bal });
      txs.push({
        date: d.date, valueDate: vd ? vd.date : null, time: d.time, amount: Math.round(amount * 100) / 100,
        currency: get(r, 'currency') || 'EUR', counterparty, counterIban: get(r, 'iban'), counterBic: get(r, 'bic'),
        purpose: get(r, 'purpose'), bookingText: get(r, 'bookingText'), creditorId: get(r, 'creditorId'), mandateRef: get(r, 'mandateRef'),
        mcc: '', pending: /vorgemerkt|pending|offen|ausstehend/i.test(get(r, 'status')), kind: null, security: null, extId: '',
      });
    }
    const warnings = [];
    if (skipped) warnings.push(`${skipped} ${skipped === 1 ? 'Zeile' : 'Zeilen'} ohne gültiges Datum oder Betrag ${skipped === 1 ? 'wurde' : 'wurden'} übersprungen.`);
    const pre = preamble(rows, hi);
    // Saldo-Spalte: Stand nach der jüngsten Buchung (Reihenfolge der Datei beachten)
    let balance = pre.balance;
    if (saldo.length) {
      const newestFirst = saldo[0].date >= saldo[saldo.length - 1].date;
      const latest = newestFirst ? saldo[0] : saldo[saldo.length - 1];
      balance = { amount: latest.amount, date: latest.date };
    }
    return { format: format || 'generic', bankId: format === 'sparkasse' ? 'sparkasse' : null, accountIban: ibanOf(own) || pre.iban, txs, holdings: null, balance, warnings };
  }

  /** Spalten nach Inhalt vorschlagen, wenn die Überschriften unbekannt sind */
  function guessByContent(rows, hi, known) {
    const map = Object.assign({}, known);
    const data = rows.slice(hi + 1, hi + 51);
    const width = rows[hi].length;
    if (!data.length) return map;
    const share = (i, test) => data.filter((r) => test(r[i] || '')).length / data.length;
    // Zuordnungen nach Überschrift verwerfen, wenn der Inhalt nicht passt (z. B. „Wert“ = Betrag statt Valuta)
    for (const f of ['date', 'valueDate']) if (map[f] != null && share(map[f], (v) => !!parseDate(v)) < 0.5) delete map[f];
    for (const f of ['amount', 'debit', 'credit', 'balance']) if (map[f] != null && share(map[f], (v) => v === '' || !isNaN(parseAmount(v))) < 0.8) delete map[f];
    const used = () => new Set(Object.values(map));
    const best = (score, min) => {
      let bi = -1;
      let bs = min;
      for (let i = 0; i < width; i++) {
        if (used().has(i)) continue;
        const v = score(i);
        if (v > bs) { bs = v; bi = i; }
      }
      return bi;
    };
    if (map.date == null) { const i = best((c) => share(c, (v) => !!parseDate(v)), 0.8); if (i >= 0) map.date = i; }
    if (map.amount == null && map.debit == null) {
      const i = best((c) => share(c, (v) => !isNaN(parseAmount(v)) && !parseDate(v) && /[.,]\d{2}$|^-/.test(v.trim())), 0.8);
      if (i >= 0) map.amount = i;
    }
    // Textspalten: die mit den längsten Texten ist meist der Verwendungszweck
    const textLen = (c) => (share(c, (v) => /[a-zäöüß]{3}/i.test(v)) < 0.6 ? 0 : data.reduce((sum, r) => sum + String(r[c] || '').length, 0) / data.length);
    if (map.purpose == null) { const i = best(textLen, 2); if (i >= 0) map.purpose = i; }
    if (map.counterparty == null) { const i = best(textLen, 2); if (i >= 0) map.counterparty = i; }
    return map;
  }

  /**
   * Datei analysieren. Ergebnis: { format, bankId, accountIban, txs, holdings, balance, warnings }
   * oder { needsMapping, header, sample, rows, headerIndex, map } wenn Spalten unklar sind.
   */
  async function analyze(file) {
    const text = await readText(file);
    const delim = detectDelimiter(text);
    const rows = parseCSV(text, delim);
    if (!rows.length) throw new Error('Die Datei ist leer.');
    let hi = findHeader(rows);
    if (hi < 0 && isTradeRepublic(rows[0])) hi = 0;
    if ((rows[Math.max(0, hi)] || []).length < 2 || rows.length < 2) {
      throw new Error('In der Datei steht keine Tabelle mit Umsätzen. Exportiere die Umsätze im Online-Banking als CSV-Datei.');
    }
    if (hi < 0) return { needsMapping: true, headerIndex: 0, header: rows[0], sample: rows.slice(1, 4), rows, map: guessByContent(rows, 0, autoMap(rows[0])) };
    const header = rows[hi];
    if (isTradeRepublic(header)) return mapTradeRepublic(rows, hi);
    const map = autoMap(header);
    const k = header.map(key);
    const sparkasse = k.includes('auftragskonto') && k.includes('buchungstag') && k.some((x) => x.startsWith('beguenstigter') || x.startsWith('begunstigter'));
    if (map.date == null || (map.amount == null && map.debit == null && map.credit == null)) {
      return { needsMapping: true, headerIndex: hi, header, sample: rows.slice(hi + 1, hi + 4), rows, map: guessByContent(rows, hi, map) };
    }
    return mapGeneric(rows, hi, map, sparkasse ? 'sparkasse' : 'generic');
  }

  /** Stabile ID je Umsatz: gleiche Buchung → gleiche ID, auch bei erneutem Import */
  function assignIds(accountId, txs) {
    const seen = {};
    for (const t of txs) {
      const base = t.extId
        ? 'x' + FK.hash(accountId + '|' + t.extId).toString(36)
        : FK.hash(`${accountId}|${t.date}|${t.amount.toFixed(2)}|${norm(t.counterparty)}|${norm(t.purpose).slice(0, 80)}`).toString(36);
      seen[base] = (seen[base] || 0) + 1;
      t.id = base + (seen[base] > 1 ? '-' + seen[base] : '');
    }
    return txs;
  }

  FK.importer = { analyze, readText, parseCSV, detectDelimiter, parseAmount, parseDate, autoMap, mapGeneric, assignIds, holdingsFrom, FIELD_LABEL };
})(window.FK);
