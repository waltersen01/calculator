/* Finanzkompass – Konten, Kontodetails, Depot, Umsatzliste, Umsatzdetails, Kategorie ändern */
(function (FK) {
  'use strict';
  const { html, icon, ui } = FK;
  const S = FK.store;
  const D = FK.date;
  const F = FK.dfmt;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;

  const METHOD = {
    card: 'Kartenzahlung', sepa: 'SEPA-Lastschrift', standing: 'Dauerauftrag', transfer: 'Überweisung',
    incoming: 'Gutschrift', cash: 'Bargeld', interest: 'Zinsen / Erträge', fee: 'Entgelt', trade: 'Wertpapiergeschäft',
  };

  const maskIban = (iban) => {
    const s = String(iban || '').replace(/\s+/g, '');
    if (s.length < 8) return s;
    return `${s.slice(0, 4)} •••• ${s.slice(-4)}`;
  };
  FK.maskIban = maskIban;

  const updatedText = (a) => {
    if (!a.updatedAt) return 'noch nie aktualisiert';
    const d = new Date(a.updatedAt);
    return `aktualisiert ${D.sameDay(d, new Date()) ? 'heute' : F.dm(d)}, ${F.time(d)}`;
  };

  /* ---------- Konten ---------- */
  FK.screens.accounts = {
    render() {
      const actions = html`<button type="button" class="gbtn" data-go="umsaetze" aria-label="Umsätze durchsuchen">${icon('search', 21)}</button><button type="button" class="gbtn" data-action="connect" aria-label="Konto verbinden">${icon('plus', 22)}</button>`;
      if (!S.hasData()) {
        return {
          title: 'Konten', actions,
          body: html`${ui.empty('wallet', 'Noch kein Konto verbunden', 'Importiere Umsätze aus deinem Online-Banking oder verbinde dein Konto live.')}
            <div class="stack-8">
              <button type="button" class="btn" data-action="connect" data-bank="sparkasse">${ui.bankAvatar('sparkasse', 'sm')}Sparkasse verbinden</button>
              <button type="button" class="btn tinted" data-action="connect" data-bank="traderepublic">${ui.bankAvatar('traderepublic', 'sm')}Trade Republic verbinden</button>
              <button type="button" class="btn plain" data-action="connect" data-bank="other">Andere Bank per CSV-Datei</button>
            </div>`,
        };
      }
      const tot = S.totals();
      const accounts = S.accounts();
      const groups = Object.keys(C.accountTypes).map((t) => ({ t, list: accounts.filter((a) => a.type === t) })).filter((g) => g.list.length);
      const accRow = (a) => {
        const bank = C.bank(a.bankId);
        let sub = `${bank.short}${a.iban ? ' · ••' + a.iban.replace(/\s/g, '').slice(-4) : ''}`;
        if (a.type === 'depot') sub = `${bank.short} · ${(a.holdings || []).length} Positionen`;
        sub += a.source === 'live' ? ' · live' : '';
        return ui.row({ go: 'konto/' + a.id, lead: ui.bankAvatar(a.bankId), title: a.name, sub, end: ui.amt(S.balance(a.id)), chevron: true });
      };
      const body = html`
        <div class="card">
          <div class="card-title">Vermögen</div>
          <div class="big-figure amt prop">${eur(tot.total)}</div>
          <div class="legend" style="margin-top:10px">
            <div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto"><span class="n">Auf Konten</span>${ui.amt(tot.liquid)}</div>
            ${tot.depot ? html`<div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto"><span class="n">Im Depot (geschätzt)</span>${ui.amt(tot.depot)}</div>` : ''}
          </div>
        </div>
        ${groups.map((g) => ui.section(C.accountTypes[g.t].name, html`<div class="list">${g.list.map(accRow)}</div>`))}
        <div class="section stack-8">
          <button type="button" class="btn tinted" data-action="connect">${icon('plus', 20)}Konto verbinden</button>
          <button type="button" class="btn plain" data-go="umsaetze">${icon('list', 20)}Alle Umsätze ansehen</button>
        </div>
        ${FK.updatedLine()}`;
      return { title: 'Konten', refresh: true, actions, body };
    },
  };

  /* ---------- Kontodetails ---------- */
  const accountUi = {};
  FK.screens.account = {
    render(p) {
      const a = S.account(p.id);
      if (!a) return null;
      const bank = C.bank(a.bankId);
      const st = accountUi[a.id] || (accountUi[a.id] = { range: 90, q: '' });
      const bal = S.balance(a.id);
      const live = a.source === 'live' && a.live;
      const expired = live && FK.live.expired(a);

      if (a.type === 'depot') return renderDepot(a, bank);

      const actions = html`<div class="btn-row">
        ${live
          ? html`<button type="button" class="btn tinted" data-action="${expired ? 'renew-live' : 'sync-account'}" data-id="${a.id}">${icon('refresh', 20)}${expired ? 'Freigabe erneuern' : 'Aktualisieren'}</button>`
          : html`<button type="button" class="btn tinted" data-action="import-file" data-id="${a.id}" aria-label="CSV-Datei importieren">${icon('arrow-up', 20)}Importieren</button>`}
        <button type="button" class="btn tinted" data-action="edit-balance" data-id="${a.id}">${icon('pencil', 20)}Kontostand</button>
      </div>`;

      const body = html`
        <div class="detail-head">
          ${ui.bankAvatar(a.bankId, 'lg')}
          <div class="name">${a.name}</div>
          <div class="sub">${bank.name}${live ? ' · Live-Verbindung' : ' · CSV-Import'}</div>
          <div class="detail-amount amt prop" style="margin-top:6px">${eur(bal)}</div>
          <div class="sub">Stand ${a.balanceDate ? F.dmy(a.balanceDate) : '–'} · ${updatedText(a)}</div>
          ${a.iban ? html`<button type="button" class="badge" data-action="copy-iban" data-iban="${a.iban}" aria-label="IBAN kopieren">${icon('copy', 13)}${maskIban(a.iban)}</button>` : ''}
        </div>
        ${expired ? html`<div class="callout warn" style="margin-bottom:12px">${icon('alert', 20)}<span>Die Freigabe bei ${a.live.aspsp ? a.live.aspsp.name : bank.name} ist abgelaufen. Erneuere sie, um neue Umsätze abzurufen.</span></div>` : ''}
        ${actions}
        <div class="card" style="margin-top:12px">
          <div class="card-title"><span>Kontostand</span>${ui.seg('acc-range', [{ value: '30', label: '30 T' }, { value: '90', label: '90 T' }, { value: '365', label: '1 J' }], String(st.range), 'Zeitraum')}</div>
          <div class="chart" data-chart="balance" style="margin-top:12px"></div>
          <p class="footnote" style="margin:8px 0 0">Zurückgerechnet aus dem Kontostand und deinen Umsätzen.</p>
        </div>
        ${ui.section('Umsätze', html`<label class="search" style="margin-bottom:4px">${icon('search', 18)}<span class="sr-only">Umsätze durchsuchen</span><input type="search" data-acc-search placeholder="Suchen" value="${st.q}" enterkeyhint="search"></label>
          <div data-acc-list></div>`)}
        <div class="section stack-8">
          <button type="button" class="btn plain" data-action="rename-account" data-id="${a.id}">${icon('pencil', 20)}Umbenennen</button>
          <button type="button" class="btn danger" data-action="remove-account" data-id="${a.id}">${icon('trash', 20)}Konto entfernen</button>
        </div>`;
      return { title: `${bank.short} ${a.name}`, large: false, body };
    },
    mount(el, p) {
      const a = S.account(p.id);
      if (!a || a.type === 'depot') return;
      const st = accountUi[a.id];
      const series = S.balanceSeries(a.id, st.range);
      const labels = [];
      series.forEach((pt, i) => {
        const d = D.parse(pt.date);
        if (i === 0 || i === series.length - 1) return;
        if ((st.range > 120 && d.getDate() === 1 && d.getMonth() % 3 === 0) || (st.range <= 120 && st.range > 40 && d.getDate() === 1) || (st.range <= 40 && i % 7 === 0 && i < series.length - 4)) {
          labels.push({ i, text: st.range > 40 ? F.monthShort(pt.date) : F.dm(pt.date) });
        }
      });
      FK.charts.line(el.querySelector('[data-chart="balance"]'), {
        points: series.map((pt) => Object.assign({ kind: 'actual' }, pt)),
        height: 170,
        yAxis: true,
        includeZero: series.some((pt) => pt.value < 0),
        xLabels: labels,
        label: `Kontostand der letzten ${st.range} Tage, aktuell ${eur(S.balance(a.id))}`,
      });
      const list = el.querySelector('[data-acc-list]');
      const input = el.querySelector('[data-acc-search]');
      const draw = () => {
        const txs = S.queryTxs({ accountId: a.id, q: st.q });
        list.innerHTML = String(html`${ui.txGroups(txs.slice(0, 80), {})}${txs.length > 80 ? html`<p class="footnote" style="text-align:center">${txs.length - 80} ältere Umsätze – nutze die Suche.</p>` : ''}`);
      };
      draw();
      input.addEventListener('input', U.debounce(() => { st.q = input.value; draw(); }, 120));
    },
  };

  const shareFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });

  function renderDepot(a, bank) {
    const h = a.holdings || [];
    const invested = U.sum(h, (p) => p.cost);
    const value = U.sum(h, (p) => p.value);
    const gain = value - invested;
    const lastTrade = h.map((p) => p.lastDate).filter(Boolean).sort().pop();
    const body = html`
      <div class="detail-head">
        ${ui.bankAvatar(a.bankId, 'lg')}
        <div class="name">${a.name}</div>
        <div class="sub">${bank.name} · ${h.length} Positionen</div>
        <div class="detail-amount amt prop" style="margin-top:6px">${eur(value)}</div>
        <div class="sub">geschätzt · ${updatedText(a)}</div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="kpi"><span class="kpi-label">Investiert</span><div class="kpi-value amt">${eur(invested, { decimals: 0 })}</div></div>
        <div class="kpi"><span class="kpi-label">Gewinn/Verlust</span><div class="kpi-value amt ${gain >= 0 ? 'pos' : 'neg'}">${eur(gain, { sign: true, decimals: 0 })}${invested ? ` (${FK.fmt.pct(gain / invested, 1)})` : ''}</div></div>
      </div>
      <div class="callout" style="margin-top:12px">${icon('info', 20)}<span>Bewertet mit dem letzten Ausführungskurs aus deinem Export${lastTrade ? ` (zuletzt am ${F.dmy(lastTrade)})` : ''}, nicht mit aktuellen Börsenkursen. Für einen genaueren Wert importiere einen aktuellen Transaktionsexport.</span></div>
      ${ui.section('Positionen', h.length ? html`<div class="list">${h.map((p) => ui.row({
        lead: html`<span class="avatar" style="--c:#1f2937">${icon(/crypto|krypto/i.test(p.assetClass || '') ? 'coins' : 'line-chart', 20)}</span>`,
        title: p.name, sub: `${shareFmt.format(p.shares)} Stk. · ${p.isin}`,
        end: ui.amt(p.value), endSub: html`<span class="amt ${p.value >= p.cost ? 'pos' : 'neg'}">${eur(p.value - p.cost, { sign: true, decimals: 0 })}</span>`,
      }))}</div>` : ui.empty('line-chart', 'Keine Positionen', 'Im Export wurden keine offenen Wertpapierpositionen gefunden.'))}
      <div class="section stack-8">
        <button type="button" class="btn tinted" data-action="connect" data-bank="${a.bankId}" data-method="csv">${icon('arrow-up', 20)}Neuen Export importieren</button>
        <button type="button" class="btn danger" data-action="remove-account" data-id="${a.id}">${icon('trash', 20)}Depot entfernen</button>
      </div>`;
    return { title: `${bank.short} ${a.name}`, large: false, body };
  }

  FK.actions['acc-range'] = (el) => {
    const top = FK.nav.top();
    const st = accountUi[top.params.id];
    if (st) st.range = Number(el.dataset.value);
    FK.nav.refresh();
  };

  FK.actions['copy-iban'] = (el) => {
    const iban = el.dataset.iban.replace(/\s/g, '');
    const done = () => FK.toast('IBAN kopiert', { icon: 'copy' });
    try { navigator.clipboard.writeText(iban).then(done, () => FK.toast(iban, { icon: 'copy', tone: 'info', duration: 5000 })); } catch (e) { FK.toast(iban, { icon: 'copy', tone: 'info', duration: 5000 }); }
  };

  FK.actions['edit-balance'] = (el) => {
    const a = S.account(el.dataset.id);
    const sheet = FK.sheet.open({
      title: 'Kontostand korrigieren',
      body: html`<p class="sheet-lead">Trage den Kontostand ein, den deine Bank anzeigt. Der Verlauf wird daraus neu berechnet.</p>
        <div class="form">
          <div class="field"><label for="bal-v">Kontostand in €</label><input id="bal-v" inputmode="decimal" value="${String(S.balance(a.id).toFixed(2)).replace('.', ',')}"></div>
          <div class="field"><label for="bal-d">Stand vom</label><input id="bal-d" type="date" max="${D.ymd(new Date())}" value="${D.ymd(new Date())}"></div>
        </div>`,
      foot: html`<button type="button" class="btn" data-save>Speichern</button>`,
    });
    sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
      const v = FK.importer.parseAmount(sheet.body.querySelector('#bal-v').value);
      const d = sheet.body.querySelector('#bal-d').value || D.ymd(new Date());
      if (isNaN(v)) { FK.toast('Bitte gib einen Betrag ein', { icon: 'alert-circle', tone: 'info' }); return; }
      S.act.setBalance(a.id, v, d);
      sheet.close();
      FK.toast('Kontostand gespeichert');
    });
  };

  FK.actions['rename-account'] = (el) => {
    const a = S.account(el.dataset.id);
    const sheet = FK.sheet.open({
      title: 'Konto umbenennen',
      body: html`<div class="form"><div class="field"><label for="acc-n">Name</label><input id="acc-n" value="${a.name}" autocomplete="off"></div></div>`,
      foot: html`<button type="button" class="btn" data-save>Speichern</button>`,
    });
    sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
      S.act.renameAccount(a.id, sheet.body.querySelector('#acc-n').value);
      sheet.close();
    });
  };

  FK.actions['remove-account'] = async (el) => {
    const a = S.account(el.dataset.id);
    const ok = await ui.confirm({ title: 'Konto entfernen?', text: `${C.bank(a.bankId).name} ${a.name} und alle importierten Umsätze werden von diesem Gerät gelöscht.`, confirm: 'Entfernen', destructive: true, icon: 'trash' });
    if (!ok) return;
    FK.nav.back();
    setTimeout(() => { S.act.removeAccount(a.id); FK.toast('Konto entfernt', { icon: 'trash', tone: 'info' }); }, 480);
  };

  FK.actions['sync-account'] = async (el) => {
    const a = S.account(el.dataset.id);
    el.disabled = true;
    try {
      const r = await FK.live.syncAccount({ uid: a.live.uid, sessionId: a.live.sessionId, aspsp: a.live.aspsp, validUntil: a.live.validUntil, bankId: a.bankId });
      FK.toast(r.added ? `${r.added} neue Umsätze` : 'Alles aktuell');
    } catch (e) {
      el.disabled = false;
      FK.toast(e.message, { icon: 'alert', tone: 'info', duration: 5000 });
    }
  };

  FK.actions['renew-live'] = (el) => {
    const a = S.account(el.dataset.id);
    FK.connect({ bankId: a.bankId, method: 'live' });
  };

  /* ---------- Alle Umsätze ---------- */
  const txUi = { q: '', kind: 'all', limit: 60 };
  FK.screens.transactions = {
    render() {
      const body = html`
        <label class="search">${icon('search', 18)}<span class="sr-only">Umsätze durchsuchen</span><input type="search" data-tx-search placeholder="Händler, Kategorie, Betrag" value="${txUi.q}" enterkeyhint="search"></label>
        <div style="margin-top:12px">${ui.chips('tx-kind', [
          { value: 'all', label: 'Alle' }, { value: 'expense', label: 'Ausgaben' }, { value: 'income', label: 'Einnahmen' },
          { value: 'contracts', label: 'Verträge' }, { value: 'transfers', label: 'Umbuchungen & Sparen' },
        ], txUi.kind, 'Filter')}</div>
        <div data-tx-summary class="fc-sub" style="margin:14px 6px 0"></div>
        <div data-tx-list></div>`;
      return { title: 'Umsätze', body };
    },
    mount(el) {
      const list = el.querySelector('[data-tx-list]');
      const summary = el.querySelector('[data-tx-summary]');
      const input = el.querySelector('[data-tx-search]');
      const draw = () => {
        const txs = S.queryTxs({ q: txUi.q, kind: txUi.kind });
        const shown = txs.slice(0, txUi.limit);
        summary.innerHTML = String(html`${txs.length} ${txs.length === 1 ? 'Umsatz' : 'Umsätze'} · Summe <span class="amt">${eur(U.sum(txs, (t) => t.amount), { sign: true })}</span>`);
        list.innerHTML = String(html`${S.hasData() ? ui.txGroups(shown, { showAccount: true }) : ui.empty('wallet', 'Noch keine Umsätze', 'Verbinde zuerst ein Konto.')}
          ${txs.length > shown.length ? html`<div style="margin-top:14px"><button type="button" class="btn tinted" data-more>Weitere ${Math.min(60, txs.length - shown.length)} laden</button></div>` : ''}`);
        const more = list.querySelector('[data-more]');
        if (more) more.addEventListener('click', () => { txUi.limit += 60; draw(); });
      };
      draw();
      input.addEventListener('input', U.debounce(() => { txUi.q = input.value; txUi.limit = 60; draw(); }, 120));
    },
  };
  FK.actions['tx-merchant'] = (el) => {
    txUi.q = el.dataset.name;
    txUi.kind = 'all';
    txUi.limit = 60;
    FK.nav.go('umsaetze');
  };
  FK.actions['tx-kind'] = (el) => {
    txUi.kind = el.dataset.value;
    txUi.limit = 60;
    FK.nav.refresh();
  };

  /* ---------- Umsatzdetails ---------- */
  FK.screens.transaction = {
    render(p) {
      const t = S.tx(p.id);
      if (!t) return null;
      const cat = C.cat(t.categoryId);
      const acc = S.account(t.accountId);
      const bank = acc ? C.bank(acc.bankId) : null;
      const contract = t.contractId ? S.contract(t.contractId) : null;
      const changed = t.categoryId !== t.origCategoryId;
      const d = D.parse(t.date);
      const body = html`
        <div class="detail-head">
          ${ui.txAvatar(t, 'lg')}
          <div class="name">${t.name}</div>
          <div class="detail-amount amt prop ${t.amount > 0 ? 'pos' : ''}">${eur(t.amount, { sign: true })}</div>
          <div class="sub">${F.weekdayLong(t.date)} ${d.getFullYear()}${t.time ? `, ${t.time} Uhr` : ''}</div>
          <div class="detail-badges">${t.pending ? ui.badge('Vorgemerkt', 'warn', 'clock') : ui.badge('Gebucht', 'pos', 'check')}${contract ? ui.badge('Vertrag', 'accent', 'repeat') : ''}${t.via ? ui.badge('über ' + t.via) : ''}</div>
        </div>
        <div class="list">
          ${ui.row({ action: 'pick-category', data: { id: t.id }, lead: ui.catIcon(t.categoryId), title: cat.name, sub: changed ? 'Von dir geändert' : 'Kategorie · antippen zum Ändern', chevron: true })}
          ${acc ? ui.row({ go: 'konto/' + acc.id, lead: ui.bankAvatar(acc.bankId), title: `${bank.short} ${acc.name}`, sub: acc.iban ? maskIban(acc.iban) : bank.name, chevron: true }) : ''}
          ${contract ? ui.row({ go: 'vertrag/' + contract.id, lead: ui.contractAvatar(contract), title: contract.provider, sub: `${eur(contract.amount)} ${S.intervalLabel(contract)}`, chevron: true }) : ''}
        </div>
        ${ui.section('Buchungsdetails', html`<div class="list">${ui.kv([
          ['Buchungstag', F.dmy(t.date)],
          t.valueDate && t.valueDate !== t.date ? ['Wertstellung', F.dmy(t.valueDate)] : null,
          ['Zahlungsart', t.bookingText || METHOD[t.method] || 'Buchung'],
          t.counterparty ? [t.amount > 0 ? 'Auftraggeber' : 'Empfänger', t.counterparty] : null,
          t.counterIban ? ['IBAN', maskIban(t.counterIban), 'mono'] : null,
          t.purpose ? ['Verwendungszweck', t.purpose, '', true] : null,
          t.creditorId ? ['Gläubiger-ID', t.creditorId, 'mono'] : null,
          t.mandateRef ? ['Mandatsreferenz', t.mandateRef, 'mono'] : null,
          t.security ? ['Wertpapier', `${t.security.name} (${t.security.isin})`] : null,
          t.security && t.security.shares ? ['Stück', String(t.security.shares).replace('.', ',')] : null,
          t.currency && t.currency !== 'EUR' ? ['Währung', t.currency] : null,
        ])}</div>`)}
        ${ui.section('Notiz', html`<div class="list"><label class="sr-only" for="note-${t.id}">Notiz</label><textarea id="note-${t.id}" class="note-field" data-note placeholder="Notiz hinzufügen, z. B. „Geschenk für Mama“" maxlength="280">${t.note}</textarea></div>`)}
        <div class="section"><button type="button" class="btn plain" data-action="tx-merchant" data-name="${t.name}">${icon('search', 20)}Alle Umsätze von ${t.name}</button></div>`;
      return { title: t.name, large: false, body };
    },
    mount(el, p) {
      const ta = el.querySelector('[data-note]');
      if (!ta) return;
      const save = () => S.act.setNote(p.id, ta.value);
      ta.addEventListener('change', save);
      ta.addEventListener('blur', save);
    },
  };

  /* ---------- Kategorie ändern ---------- */
  FK.actions['pick-category'] = (el) => {
    const t = S.tx(el.dataset.id);
    if (!t) return;
    const type = C.cat(t.origCategoryId).type;
    const pool = C.categories.filter((c) => (t.amount > 0 ? ['income', 'saving', 'transfer', 'expense'] : ['expense', 'saving', 'transfer']).includes(c.type));
    pool.sort((a, b) => (a.type === type ? 0 : 1) - (b.type === type ? 0 : 1));
    let applyAll = false;
    const key = S.ruleKey(t);
    const others = S.txs().filter((x) => S.ruleKey(x) === key).length - 1;
    const sheet = FK.sheet.open({
      title: 'Kategorie wählen',
      large: true,
      body: html`
        ${others > 0 ? html`<div class="list" style="margin-bottom:12px"><label class="row setting">
          <span class="row-main"><span class="row-title">Für alle von ${t.name}</span><span class="row-sub">Auch ${others} weitere und künftige Umsätze</span></span>
          <input type="checkbox" class="switch" data-all aria-label="Für alle Umsätze von ${t.name} übernehmen"></label></div>` : ''}
        <div class="form" role="radiogroup" aria-label="Kategorie">
          ${pool.map((c) => html`<button type="button" class="radio-row" role="radio" data-cat="${c.id}" aria-checked="${String(c.id === t.categoryId)}">${ui.catIcon(c.id, 'sm')}<span>${c.name}</span>${icon('check', 20, 'tick')}</button>`)}
        </div>
        ${t.categoryId !== t.origCategoryId ? html`<div style="margin-top:12px"><button type="button" class="btn plain" data-reset>Automatische Kategorie (${C.cat(t.origCategoryId).name})</button></div>` : ''}`,
    });
    const all = sheet.body.querySelector('[data-all]');
    if (all) all.addEventListener('change', () => { applyAll = all.checked; });
    sheet.body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      S.act.setCategory(t, b.dataset.cat, applyAll);
      sheet.close();
      FK.toast(applyAll ? `${C.cat(b.dataset.cat).name} für alle von ${t.name}` : `Kategorie: ${C.cat(b.dataset.cat).name}`, { icon: 'tag' });
    }));
    const reset = sheet.body.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => {
      S.act.resetCategory(t);
      sheet.close();
      FK.toast('Kategorie zurückgesetzt', { icon: 'refresh', tone: 'info' });
    });
  };
})(window.FK);
