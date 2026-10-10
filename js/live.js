/* Finanzkompass – Live-Verbindung über Enable Banking (PSD2-Kontoinformationsdienst).
   Die App spricht mit einem eigenen kleinen Proxy (server/enablebanking-proxy.js), der den API-Schlüssel verwahrt.
   Die Anmeldung erfolgt direkt bei der Bank – die App sieht keine Zugangsdaten. */
(function (FK) {
  'use strict';
  const S = FK.store;
  const D = FK.date;

  const cfg = () => S.state.live;
  const configured = () => !!(cfg().proxyUrl && cfg().token);
  /** https://…, http://localhost (wrangler dev), eigene Adresse oder Pfad wie „/api“ (Proxy im Docker-Container) */
  const validUrl = (u) => {
    const v = String(u || '').trim();
    if (/^\/[\w\-/]*$/.test(v)) return true;
    if (/^https:\/\/[^\s/]+/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v)) return true;
    try { return new URL(v).origin === location.origin; } catch (e) { return false; }
  };

  /** Läuft der Proxy im selben Docker-Container? Fragt „api/health“ neben der App ab (ohne Token). */
  async function detectBundled() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const url = new URL('api/health', location.href);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.service === 'finanzkompass-proxy' ? { url: url.pathname.replace(/\/health$/, ''), configured: !!d.configured } : null;
    } catch (e) {
      return null;
    }
  }

  async function call(path, opts) {
    const o = opts || {};
    const base = cfg().proxyUrl.trim().replace(/\/+$/, '');
    let res;
    try {
      res = await fetch(base + path, {
        method: o.method || 'GET',
        headers: { Authorization: 'Bearer ' + cfg().token.trim(), 'Content-Type': 'application/json' },
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
    } catch (e) {
      throw new Error('Der Proxy ist nicht erreichbar. Prüfe die Proxy-Adresse und deine Internetverbindung.');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      if (res.status === 401 && data && data.error === 'unauthorized') throw new Error('Das Zugriffstoken ist falsch.');
      if (res.status === 502 && !data) throw new Error('Der Proxy läuft nicht. Starte ihn mit „docker compose --profile live up -d“.');
      const msg = (data && (data.message || data.error_description || data.error || data.detail)) || `Fehler ${res.status}`;
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function aspsps() {
    const d = await call('/aspsps?country=DE&psu_type=personal');
    return ((d && d.aspsps) || []).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  const redirectUrl = () => location.origin + location.pathname;

  /** Freigabe bei der Bank starten: leitet zur Anmeldeseite der Bank weiter */
  async function start(aspsp, bankId) {
    const maxSec = Number(aspsp.maximum_consent_validity) || 90 * 86400;
    const days = Math.max(1, Math.min(180, Math.floor(maxSec / 86400)));
    const validUntil = new Date(Date.now() + days * 86400e3).toISOString();
    const state = FK.util.uid('st');
    const d = await call('/auth', {
      method: 'POST',
      body: { access: { valid_until: validUntil }, aspsp: { name: aspsp.name, country: aspsp.country || 'DE' }, state, redirect_url: redirectUrl(), psu_type: 'personal' },
    });
    if (!d || !d.url) throw new Error('Die Bank hat keine Anmeldeseite zurückgegeben.');
    S.act.setLive({ pending: { state, aspsp: { name: aspsp.name, country: aspsp.country || 'DE' }, bankId, startedAt: new Date().toISOString(), validUntil } });
    location.href = d.url;
  }

  async function fetchTransactions(uid, dateFrom) {
    const out = [];
    let key = null;
    let guard = 0;
    do {
      const q = new URLSearchParams({ date_from: dateFrom });
      if (key) q.set('continuation_key', key);
      const d = await call(`/accounts/${encodeURIComponent(uid)}/transactions?${q}`);
      out.push(...((d && d.transactions) || []));
      key = d && d.continuation_key;
      guard++;
    } while (key && guard < 60);
    return out;
  }

  /** Enable-Banking-Umsatz → internes Format */
  function mapTx(t) {
    const amt = Math.abs(parseFloat(t.transaction_amount && t.transaction_amount.amount));
    const debit = t.credit_debit_indicator === 'DBIT';
    const party = debit ? t.creditor : t.debtor;
    const partyAcc = debit ? t.creditor_account : t.debtor_account;
    const rem = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : t.remittance_information || '';
    const btc = t.bank_transaction_code || {};
    return {
      date: t.booking_date || t.value_date || t.transaction_date,
      valueDate: t.value_date || null,
      time: null,
      amount: Math.round((debit ? -amt : amt) * 100) / 100,
      currency: (t.transaction_amount && t.transaction_amount.currency) || 'EUR',
      counterparty: (party && party.name) || '',
      counterIban: (partyAcc && partyAcc.iban) || '',
      purpose: rem || t.note || '',
      bookingText: btc.description || '',
      creditorId: '',
      mandateRef: '',
      mcc: t.merchant_category_code || '',
      pending: !!t.status && t.status !== 'BOOK',
      kind: null,
      security: null,
      extId: t.entry_reference || t.transaction_id || '',
    };
  }

  function pickBalance(list) {
    const order = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD', 'PRCD'];
    const rank = (b) => { const i = order.indexOf(b.balance_type); return i < 0 ? 99 : i; };
    const b = (list || []).slice().sort((x, y) => rank(x) - rank(y))[0];
    if (!b || !b.balance_amount) return null;
    const date = b.reference_date || (b.last_change_date_time || '').slice(0, 10) || D.ymd(new Date());
    return { amount: parseFloat(b.balance_amount.amount), date: date > D.ymd(new Date()) ? D.ymd(new Date()) : date };
  }

  async function syncAccount(link) {
    const linkIban = link.account && link.account.account_id && link.account.account_id.iban;
    const existing = S.state.accounts.find((a) => a.live && a.live.uid === link.uid)
      || (linkIban ? S.state.accounts.find((a) => a.type !== 'depot' && a.iban && a.iban.replace(/\s+/g, '').toUpperCase() === linkIban.replace(/\s+/g, '').toUpperCase()) : null);
    // Laufende Verbindung: letzte 30 Tage reichen; neu verbunden: so weit zurück, wie die Bank erlaubt
    const since = existing && existing.source === 'live' ? D.ymd(D.addDays(new Date(), -30)) : D.ymd(D.addDays(new Date(), -365));
    let raw;
    try {
      raw = await fetchTransactions(link.uid, since);
    } catch (e) {
      if (existing && existing.source === 'live') throw e;
      raw = await fetchTransactions(link.uid, D.ymd(D.addDays(new Date(), -89)));
    }
    const balData = await call(`/accounts/${encodeURIComponent(link.uid)}/balances`);
    const bal = pickBalance(balData && balData.balances);
    const acc = link.account || {};
    const iban = (acc.account_id && acc.account_id.iban) || (existing && existing.iban) || '';
    const isTR = link.bankId === 'traderepublic';
    // „name“ ist bei Enable Banking der Kontoinhaber, „product“ die Kontobezeichnung
    const name = existing ? existing.name : String(acc.product || '').trim().slice(0, 40) || (isTR ? 'Verrechnungskonto' : 'Girokonto');
    return S.act.importAccount({
      accountId: existing && existing.id, bankId: link.bankId, name, type: 'giro', iban, holder: acc.name || '',
      balance: bal ? bal.amount : null, balanceDate: bal ? bal.date : D.ymd(new Date()),
      txs: raw.map(mapTx).filter((t) => t.date && !isNaN(t.amount)), source: 'live',
      live: { uid: link.uid, sessionId: link.sessionId, aspsp: link.aspsp, validUntil: link.validUntil },
    });
  }

  /** Rückkehr von der Bank (?code=…&state=…) verarbeiten */
  async function handleCallback() {
    const p = new URLSearchParams(location.search);
    const code = p.get('code');
    const error = p.get('error');
    if (!code && !error) return null;
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* ignorieren */ }
    const pending = cfg().pending;
    if (!pending || pending.state !== p.get('state')) return { error: 'Diese Anmeldung gehört zu keiner offenen Anfrage. Starte die Verbindung bitte neu.' };
    if (error) {
      S.act.setLive({ pending: null });
      return { error: p.get('error_description') || 'Die Freigabe wurde bei der Bank abgebrochen.' };
    }
    const session = await call('/sessions', { method: 'POST', body: { code } });
    const results = [];
    for (const account of (session && session.accounts) || []) {
      results.push(await syncAccount({
        uid: account.uid, sessionId: session.session_id, aspsp: pending.aspsp, account, bankId: pending.bankId,
        validUntil: (session.access && session.access.valid_until) || pending.validUntil,
      }));
    }
    S.act.setLive({ pending: null });
    return { results, aspsp: pending.aspsp, bankId: pending.bankId };
  }

  const expired = (a) => a.live && a.live.validUntil && new Date(a.live.validUntil) < new Date();

  async function syncAll() {
    const out = { ok: 0, failed: [] };
    for (const a of S.state.accounts.filter((x) => x.source === 'live' && x.live)) {
      if (expired(a)) { out.failed.push({ account: a, error: 'Freigabe abgelaufen' }); continue; }
      try {
        await syncAccount({ uid: a.live.uid, sessionId: a.live.sessionId, aspsp: a.live.aspsp, validUntil: a.live.validUntil, bankId: a.bankId });
        out.ok++;
      } catch (e) {
        out.failed.push({ account: a, error: e.message });
      }
    }
    return out;
  }

  FK.live = { configured, validUrl, detectBundled, call, aspsps, start, handleCallback, syncAccount, syncAll, redirectUrl, expired, mapTx, pickBalance };
})(window.FK);
