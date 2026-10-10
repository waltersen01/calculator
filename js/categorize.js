/* Finanzkompass – Kategorisierung und Anzeigenamen für echte Umsätze */
(function (FK) {
  'use strict';
  const C = FK.catalog;
  const norm = FK.util.normalize;

  const normIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  /** PayPal-/Klarna-Zahlungen: eigentlichen Händler aus dem Verwendungszweck holen */
  function innerMerchant(t) {
    const p = String(t.purpose || '');
    let m = p.match(/Ihr Einkauf bei ([^,]+?)(?:,|$)/i) || p.match(/\. ([^.,]{3,40}), Ihr Einkauf/i);
    if (m) return m[1].trim();
    m = p.match(/(?:Bestellung|Einkauf) bei ([^,]+?)(?:,|$| Bestell)/i);
    if (m) return m[1].trim();
    return null;
  }

  function brandOf(text) {
    for (const b of C.brands) if (b.re.test(text)) return b;
    return null;
  }

  // Zahlungsdienste: Der eigentliche Händler steht im Verwendungszweck, Mandate gelten für alle Käufe
  const INTERMEDIARY = new Set(['paypal', 'amazon', 'klarna', 'google', 'apple']);
  // Allgemeine Namen, bei denen ein genauerer Treffer im Verwendungszweck gewinnt (z. B. „Amazon“ → „Amazon Prime“)
  const GENERIC = new Set(['paypal', 'amazon', 'klarna', 'google', 'apple', 'microsoft', 'oepnv']);
  // Banken/Broker anhand der BIC der Gegenseite
  const BIC_BRAND = [[/^TRBKDEBB/, 'traderepublic'], [/^SCFBDE33/, 'scalable']];

  const LEGAL = /\s*(,|\/\/|\s-\s).*$|\s+(gmbh|ag|se|kg|kgaa|mbh|ohg|ug|e\.?\s?v\.?|ltd\.?|limited|inc\.?|s\.?a\.?r\.?l\.?|s\.c\.a\.|b\.v\.|sarl|sa|llc|co\.?\s?kg|& co\.?)(\b.*)?$/i;

  /** Lesbarer Name aus dem Empfängerfeld: Rechtsform, Orte und Kartenzusätze entfernen */
  function cleanName(raw) {
    let s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/^(visa|vpay|mastercard|maestro|debitk\.?|girocard|ec)\s+/i, '');
    s = s.replace(/\s*\.\s*(koeln|berlin|hamburg|muenchen|frankfurt|de|com)\b.*$/i, '');
    const cut = s.replace(LEGAL, '').trim();
    if (cut.length >= 2) s = cut;
    if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
      s = s.toLowerCase().replace(/(^|[\s\-/&.])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase());
    }
    return s.slice(0, 48);
  }

  /** Zahlungsart aus Buchungstext bzw. Importtyp */
  function methodOf(t) {
    if (t.kind === 'card') return 'card';
    if (t.kind === 'buy' || t.kind === 'sell') return 'trade';
    if (t.kind === 'interest' || t.kind === 'dividend') return 'interest';
    const bt = norm(t.bookingText || '');
    if (/karte|card|pos\b|kartenzahlung|debitk/.test(bt)) return 'card';
    if (/lastschrift|direct debit|sepa-?basis/.test(bt) || t.creditorId) return 'sepa';
    if (/dauerauftrag|standing/.test(bt)) return 'standing';
    if (/bargeld|geldautomat|auszahlung ga/.test(bt)) return 'cash';
    if (/entgelt|abschluss|gebuhr/.test(bt)) return 'fee';
    if (/zins/.test(bt)) return 'interest';
    if (t.amount > 0) return 'incoming';
    return 'transfer';
  }

  /**
   * Kategorie, Anzeigename und Marke für einen importierten Umsatz.
   * ctx.ownIbans: IBANs aller eigenen Konten (für Umbuchungen)
   */
  function classify(t, ctx) {
    const c = ctx || {};
    const inner = /paypal|klarna/i.test(t.counterparty || '') ? innerMerchant(t) : null;
    const who = inner || t.counterparty || '';
    const text = norm(`${who} ${t.purpose || ''} ${t.bookingText || ''}`);
    const nameText = norm(who);
    const out = { name: '', merchantId: null, categoryId: null, method: methodOf(t), via: inner ? (/klarna/i.test(t.counterparty) ? 'Klarna' : 'PayPal') : null, intermediary: false };

    let brand = brandOf(nameText);
    const inText = brandOf(text);
    if (!brand || (inText && inText !== brand && GENERIC.has(brand.id))) brand = inText || brand;
    if (!brand && t.counterBic) {
      const hit = BIC_BRAND.find(([re]) => re.test(String(t.counterBic).toUpperCase()));
      if (hit) brand = C.merchant(hit[1]);
    }
    const nameBrand = brandOf(norm(t.counterparty || ''));
    out.intermediary = !!inner || !!(nameBrand && INTERMEDIARY.has(nameBrand.id));
    if (brand && !(brand.id === 'paypal' && inner)) {
      out.merchantId = brand.id;
      out.name = brand.name;
    } else {
      out.name = cleanName(who) || (out.method === 'fee' ? '' : cleanName(t.purpose)) || '';
    }

    const own = () => {
      if (t.counterIban && c.ownIbans && c.ownIbans.has(normIban(t.counterIban))) return true;
      // z. B. Sparrate an das eigene Trade-Republic-Konto – nicht aber Buchungen auf diesem Konto selbst (Zinsen, Käufe)
      if (brand && c.ownBanks && c.ownBanks.has(brand.id) && brand.id !== c.bankId && !t.kind) return true;
      return !!(c.ownName && nameText && nameText === c.ownName && !t.kind);
    };
    const finish = (cat) => {
      out.categoryId = cat;
      if (!out.name) {
        if (cat === 'bargeld' || out.method === 'cash') out.name = 'Bargeldauszahlung';
        else if (out.method === 'fee' || cat === 'steuern') out.name = c.bankName ? `Kontoführung ${c.bankName}` : 'Kontoführung';
        else out.name = t.amount < 0 ? 'Ausgabe' : 'Eingang';
      }
      return out;
    };

    // 1. Eigene Konten → Umbuchung
    if (own()) return finish('umbuchung');
    // 2. Typ aus dem Broker-Export
    if (t.kind === 'buy' || t.kind === 'sell' || t.kind === 'saveback') return finish('sparen');
    if (t.kind === 'interest' || t.kind === 'dividend') return finish('zinsen');
    if (t.kind === 'deposit' || t.kind === 'withdrawal') return finish('umbuchung');
    if (t.kind === 'fee' || t.kind === 'tax') return finish('steuern');
    // 3. Marke, dann Händlerkategorie der Karte (MCC), dann allgemeine Regeln
    let cat = null;
    if (brand && !(brand.id === 'paypal' && inner)) cat = brand.cat;
    if (!cat) cat = C.mcc(t.mcc);
    if (!cat) {
      for (const r of C.rules) {
        if (r.sign && Math.sign(t.amount) !== r.sign) continue;
        if (r.re.test(text)) { cat = r.cat; break; }
      }
    }
    // Eingänge von Händlern sind Erstattungen, nicht Ausgaben
    if (t.amount > 0 && cat && C.cat(cat).type === 'expense') cat = 'erstattungen';
    if (t.amount > 0 && cat === 'sparen') cat = 'umbuchung';
    if (!cat) cat = t.amount < 0 ? 'sonstiges' : 'einnahmen';
    return finish(cat);
  }

  FK.categorize = { classify, cleanName, normIban, brandOf };
})(window.FK);
