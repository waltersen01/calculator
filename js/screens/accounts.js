/* Finanzkompass – Konten, Kontodetails, Umsatzliste, Umsatzdetails, Kategorie ändern, Konto hinzufügen */
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
    card: 'Kartenzahlung (girocard)', credit: 'Kreditkarte', sepa: 'SEPA-Lastschrift', standing: 'Dauerauftrag',
    transfer: 'Überweisung', incoming: 'Gutschrift', cash: 'Bargeldauszahlung', interest: 'Zinsgutschrift',
  };

  const maskIban = (iban) => {
    if (!iban) return '';
    const parts = iban.split(' ');
    return parts.map((p, i) => (i === 0 || i >= parts.length - 2 ? p : '••••')).join(' ');
  };

  /* ---------- Konten ---------- */
  FK.screens.accounts = {
    render() {
      const tot = S.totals();
      const accounts = S.accounts();
      const types = Object.keys(C.accountTypes);
      const groups = types.map((t) => ({ t, list: accounts.filter((a) => a.type === t) })).filter((g) => g.list.length);
      const synced = new Date(S.state.lastSync || Date.now());

      const accRow = (a) => {
        const bank = C.bank(a.bankId);
        let sub = `${bank.short} · ${a.iban ? '••' + a.iban.replace(/\s/g, '').slice(-4) : ''}`;
        if (a.type === 'credit') sub = `${bank.short} · ••${a.cardLast} · Limit ${eur(a.limit, { decimals: 0 })}`;
        if (a.type === 'depot') sub = `${bank.short} · ETF-Sparplan`;
        return ui.row({ go: 'konto/' + a.id, lead: ui.bankAvatar(a.bankId), title: a.name, sub, end: ui.amt(S.balance(a.id)), chevron: true });
      };

      const body = html`
        <div class="card">
          <div class="card-title">Vermögen</div>
          <div class="big-figure amt prop">${eur(tot.total)}</div>
          <div class="legend" style="margin-top:10px">
            <div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto"><span class="n">Verfügbar auf Konten</span>${ui.amt(tot.giro + tot.credit)}</div>
            <div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto"><span class="n">Gespart (Tagesgeld)</span>${ui.amt(tot.savings)}</div>
            <div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto"><span class="n">Angelegt (Depot)</span>${ui.amt(tot.depot)}</div>
          </div>
        </div>
        ${groups.map((g) => ui.section(C.accountTypes[g.t].name, html`<div class="list">${g.list.map(accRow)}</div>`))}
        <div class="section stack-8">
          <button type="button" class="btn tinted" data-action="add-account">${icon('plus', 20)}Konto hinzufügen</button>
          <button type="button" class="btn plain" data-go="umsaetze">${icon('list', 20)}Alle Umsätze ansehen</button>
        </div>
        <div class="updated">${icon('check-circle', 14)}<span>Aktualisiert ${D.sameDay(synced, new Date()) ? 'heute' : F.dm(synced)}, ${F.time(synced)}</span>·<button type="button" data-action="sync">${icon('refresh', 14)}Aktualisieren</button></div>
        <p class="footnote" style="text-align:center">Über 3.000 Banken werden in echten Multibanking-Apps per PSD2-Schnittstelle angebunden. In dieser Demo sind alle Konten Beispieldaten.</p>`;

      return {
        title: 'Konten',
        refresh: true,
        actions: html`<button type="button" class="gbtn" data-go="umsaetze" aria-label="Umsätze durchsuchen">${icon('search', 21)}</button><button type="button" class="gbtn" data-action="add-account" aria-label="Konto hinzufügen">${icon('plus', 22)}</button>`,
        body,
      };
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
      let extra = '';
      if (a.type === 'depot') {
        const gain = bal - a.invested;
        extra = html`<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px">
          <div class="kpi"><span class="kpi-label">Eingezahlt</span><div class="kpi-value amt">${eur(a.invested, { decimals: 0 })}</div></div>
          <div class="kpi"><span class="kpi-label">Gewinn/Verlust</span><div class="kpi-value amt ${gain >= 0 ? 'pos' : 'neg'}">${eur(gain, { sign: true, decimals: 0 })} (${FK.fmt.pct(gain / a.invested, 1)})</div></div>
        </div>`;
      } else if (a.type === 'credit') {
        extra = html`<div class="card" style="margin-top:12px"><div class="card-title"><span>Verfügbarer Rahmen</span><span class="amt">${eur(a.limit + bal)}</span></div>
          <div style="margin-top:10px">${ui.meter(-bal / a.limit, -bal / a.limit > 0.85 ? 'warn' : 'ok', 'Genutzter Kreditrahmen')}</div>
          <p class="footnote" style="margin:8px 0 0">Abrechnung am 22. eines Monats vom Girokonto.</p></div>`;
      } else if (a.type === 'savings') {
        extra = html`<div class="callout pos" style="margin-top:12px">${icon('percent', 20)}<span>1,75 % Zinsen p. a. · monatliche Gutschrift. Dauerauftrag: <b class="amt">${eur(FK.data.SAVE_TAGESGELD)}</b> am 2. Bankarbeitstag.</span></div>`;
      }
      const body = html`
        <div class="detail-head">
          ${ui.bankAvatar(a.bankId, 'lg')}
          <div class="name">${bank.name}</div>
          <div class="sub">${a.name}${a.added ? ' · Beispielkonto' : ''}</div>
          <div class="detail-amount amt prop" style="margin-top:6px">${eur(bal)}</div>
          ${a.iban ? html`<button type="button" class="badge" data-action="copy-iban" data-iban="${a.iban}" aria-label="IBAN kopieren">${icon('copy', 13)}${maskIban(a.iban)}</button>` : html`<span class="badge">${icon('credit-card', 13)}${a.cardNo}</span>`}
        </div>
        <div class="card">
          <div class="card-title"><span>${a.type === 'depot' ? 'Depotwert' : 'Kontostand'}</span>${ui.seg('acc-range', [{ value: '30', label: '30 T' }, { value: '90', label: '90 T' }, { value: '365', label: '1 J' }], String(st.range), 'Zeitraum')}</div>
          <div class="chart" data-chart="balance" style="margin-top:12px"></div>
        </div>
        ${extra}
        ${ui.section('Umsätze', html`<label class="search" style="margin-bottom:4px">${icon('search', 18)}<span class="sr-only">Umsätze durchsuchen</span><input type="search" data-acc-search placeholder="Suchen" value="${st.q}" enterkeyhint="search"></label>
          <div data-acc-list></div>`)}
        ${a.added ? html`<div class="section"><button type="button" class="btn danger" data-action="remove-account" data-id="${a.id}">${icon('trash', 20)}Konto entfernen</button></div>` : ''}`;
      return { title: `${bank.short} ${a.name}`, large: false, body };
    },
    mount(el, p) {
      const a = S.account(p.id);
      if (!a) return;
      const st = accountUi[a.id];
      const series = S.balanceSeries(a.id, st.range);
      const step = st.range > 120 ? 30 : st.range > 40 ? 30 : 7;
      const labels = [];
      series.forEach((pt, i) => {
        const d = D.parse(pt.date);
        if (i === 0 || i === series.length - 1) return;
        if ((st.range > 120 && d.getDate() === 1 && d.getMonth() % 3 === 0) || (st.range <= 120 && st.range > 40 && d.getDate() === 1) || (st.range <= 40 && i % step === 0 && i < series.length - 4)) {
          labels.push({ i, text: st.range > 40 ? F.monthShort(pt.date) : F.dm(pt.date) });
        }
      });
      FK.charts.line(el.querySelector('[data-chart="balance"]'), {
        points: series.map((pt) => Object.assign({ kind: 'actual' }, pt)),
        height: 170,
        yAxis: true,
        includeZero: a.type === 'credit',
        xLabels: labels,
        label: `${a.type === 'depot' ? 'Depotwert' : 'Kontostand'} der letzten ${st.range} Tage, aktuell ${eur(S.balance(a.id))}`,
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

  FK.actions['acc-range'] = (el) => {
    const top = FK.nav.top();
    const st = accountUi[top.params.id];
    if (st) st.range = Number(el.dataset.value);
    FK.nav.refresh();
  };

  FK.actions['copy-iban'] = (el) => {
    const iban = el.dataset.iban;
    const done = () => FK.toast('IBAN kopiert', { icon: 'copy' });
    try {
      navigator.clipboard.writeText(iban.replace(/\s/g, '')).then(done, () => FK.toast(iban, { icon: 'copy', tone: 'info', duration: 4000 }));
    } catch (e) {
      FK.toast(iban, { icon: 'copy', tone: 'info', duration: 4000 });
    }
  };

  FK.actions['remove-account'] = async (el) => {
    const a = S.account(el.dataset.id);
    const ok = await ui.confirm({ title: 'Konto entfernen?', text: `${C.bank(a.bankId).name} und alle Umsätze dieses Beispielkontos werden entfernt.`, confirm: 'Entfernen', destructive: true, icon: 'trash' });
    if (!ok) return;
    FK.nav.back();
    setTimeout(() => {
      S.act.removeAccount(a.id);
      FK.toast('Konto entfernt', { icon: 'trash', tone: 'info' });
    }, 480);
  };

  /* ---------- Alle Umsätze ---------- */
  const txUi = { q: '', kind: 'all', limit: 60 };
  FK.screens.transactions = {
    render() {
      const body = html`
        <label class="search">${icon('search', 18)}<span class="sr-only">Umsätze durchsuchen</span><input type="search" data-tx-search placeholder="Händler, Kategorie, Betrag" value="${txUi.q}" enterkeyhint="search"></label>
        <div style="margin-top:12px">${ui.chips('tx-kind', [
          { value: 'all', label: 'Alle' }, { value: 'expense', label: 'Ausgaben' }, { value: 'income', label: 'Einnahmen' },
          { value: 'contracts', label: 'Verträge' }, { value: 'transfers', label: 'Umbuchungen' },
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
        const total = U.sum(txs, (t) => t.amount);
        summary.innerHTML = String(html`${txs.length} ${txs.length === 1 ? 'Umsatz' : 'Umsätze'} · Summe <span class="amt">${eur(total, { sign: true })}</span>`);
        list.innerHTML = String(html`${ui.txGroups(shown, { showAccount: true })}
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
      const counterTx = t.transferId ? S.txs().find((x) => x.transferId === t.transferId && x.id !== t.id) : null;
      const changed = t.categoryId !== t.origCategoryId;
      const d = D.parse(t.date);
      const valuta = t.method === 'credit' ? D.nextBankDay(D.addDays(d, 1)) : d;

      const body = html`
        <div class="detail-head">
          ${ui.txAvatar(t, 'lg')}
          <div class="name">${t.name}</div>
          <div class="detail-amount amt prop ${t.amount > 0 ? 'pos' : ''}">${eur(t.amount, { sign: true })}</div>
          <div class="sub">${F.weekdayLong(t.date)} ${d.getFullYear()}${t.time ? `, ${t.time} Uhr` : ''}</div>
          <div class="detail-badges">${ui.badge('Gebucht', 'pos', 'check')}${contract ? ui.badge('Vertrag', 'accent', 'repeat') : ''}${t.transferId ? ui.badge('Eigene Konten', '', 'transfer') : ''}</div>
        </div>
        <div class="list">
          ${ui.row({ action: 'pick-category', data: { id: t.id }, lead: ui.catIcon(t.categoryId), title: cat.name, sub: changed ? 'Von dir geändert' : 'Kategorie · antippen zum Ändern', chevron: true })}
          ${acc ? ui.row({ go: 'konto/' + acc.id, lead: ui.bankAvatar(acc.bankId), title: `${bank.short} ${acc.name}`, sub: acc.iban ? maskIban(acc.iban) : acc.cardNo, chevron: true }) : ''}
          ${contract ? ui.row({ go: 'vertrag/' + contract.id, lead: ui.contractAvatar(contract), title: contract.provider, sub: `${contract.product} · ${S.intervalLabel(contract)}`, chevron: true }) : ''}
          ${counterTx ? ui.row({ go: 'umsatz/' + counterTx.id, lead: html`<span class="avatar" style="--c:var(--ink-3)">${icon('transfer')}</span>`, title: 'Gegenbuchung', sub: `${C.bank(S.account(counterTx.accountId).bankId).short} ${S.account(counterTx.accountId).name}`, chevron: true }) : ''}
        </div>
        ${ui.section('Buchungsdetails', html`<div class="list">${ui.kv([
          ['Buchungstag', F.dmy(t.date)],
          ['Wertstellung', F.dmy(valuta)],
          ['Zahlungsart', METHOD[t.method] || 'Buchung'],
          t.counterpart ? [t.amount > 0 ? 'Auftraggeber' : 'Empfänger', t.counterpart.name] : null,
          t.counterpart && t.counterpart.iban ? ['IBAN', maskIban(t.counterpart.iban), 'mono'] : null,
          ['Verwendungszweck', t.purpose, '', true],
          t.creditorId ? ['Gläubiger-ID', t.creditorId, 'mono'] : null,
          t.mandateRef ? ['Mandatsreferenz', t.mandateRef, 'mono'] : null,
        ])}</div>`)}
        ${ui.section('Notiz', html`<div class="list"><label class="sr-only" for="note-${t.id}">Notiz</label><textarea id="note-${t.id}" class="note-field" data-note placeholder="Notiz hinzufügen, z. B. „Geschenk für Mama“" maxlength="280">${t.note}</textarea></div>`)}
        ${t.merchantId ? html`<div class="section"><button type="button" class="btn plain" data-action="tx-merchant" data-name="${t.name}">${icon('search', 20)}Alle Umsätze von ${t.name}</button></div>` : ''}`;
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
    const others = t.merchantId ? S.txs().filter((x) => x.merchantId === t.merchantId).length - 1 : 0;
    const sheet = FK.sheet.open({
      title: 'Kategorie wählen',
      large: true,
      body: html`
        ${others > 0 ? html`<div class="list" style="margin-bottom:12px"><label class="row setting">
          <span class="row-main"><span class="row-title">Für alle von ${t.name}</span><span class="row-sub">Auch ${others} weitere Umsätze und künftige Buchungen</span></span>
          <input type="checkbox" class="switch" data-all aria-label="Für alle Umsätze von ${t.name} übernehmen"></label></div>` : ''}
        <div class="form" role="radiogroup" aria-label="Kategorie">
          ${pool.map((c) => html`<button type="button" class="radio-row" role="radio" data-cat="${c.id}" aria-checked="${String(c.id === t.categoryId)}">${ui.catIcon(c.id, 'sm')}<span>${c.name}</span>${icon('check', 20, 'tick')}</button>`)}
        </div>
        ${t.categoryId !== t.origCategoryId ? html`<div style="margin-top:12px"><button type="button" class="btn plain" data-reset>Ursprüngliche Kategorie (${C.cat(t.origCategoryId).name})</button></div>` : ''}`,
    });
    const all = sheet.body.querySelector('[data-all]');
    if (all) all.addEventListener('change', () => { applyAll = all.checked; });
    const choose = (catId) => {
      S.act.setCategory(t.id, catId, t.merchantId, applyAll);
      sheet.close();
      FK.toast(applyAll ? `${C.cat(catId).name} für alle von ${t.name}` : `Kategorie: ${C.cat(catId).name}`, { icon: 'tag' });
    };
    sheet.body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.cat)));
    const reset = sheet.body.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => {
      S.update((s) => { delete s.txCategory[t.id]; if (t.merchantId) delete s.merchantRules[t.merchantId]; });
      sheet.close();
      FK.toast('Kategorie zurückgesetzt', { icon: 'refresh', tone: 'info' });
    });
  };

  /* ---------- Konto hinzufügen (Demo, ohne Zugangsdaten) ---------- */
  FK.actions['add-account'] = () => {
    const banks = C.banks.filter((b) => !['sparkasse', 'dkb', 'ing', 'traderepublic'].includes(b.id));
    const sheet = FK.sheet.open({ title: 'Konto hinzufügen', large: true });
    let q = '';
    function listView() {
      sheet.set(html`
        <p class="sheet-lead">Wähle deine Bank. In dieser Demo wird ein Beispielkonto mit Testumsätzen angelegt.</p>
        <label class="search" style="margin-bottom:12px">${icon('search', 18)}<span class="sr-only">Bank suchen</span><input type="search" data-bank-q placeholder="Bank suchen" value="${q}"></label>
        <div class="form" data-banks></div>`);
      const box = sheet.body.querySelector('[data-banks]');
      const input = sheet.body.querySelector('[data-bank-q]');
      const draw = () => {
        const nq = U.normalize(q);
        const hits = banks.filter((b) => U.normalize(b.name).includes(nq));
        box.innerHTML = String(hits.length ? html`${hits.map((b) => html`<button type="button" class="radio-row" data-bank="${b.id}">${ui.bankAvatar(b.id, 'sm')}<span>${b.name}</span>${icon('chevron-right', 18, 'chev')}</button>`)}` : html`<div class="empty">Keine Bank gefunden</div>`);
        box.querySelectorAll('[data-bank]').forEach((el) => el.addEventListener('click', () => confirmView(el.dataset.bank)));
      };
      draw();
      input.addEventListener('input', () => { q = input.value; draw(); });
    }
    function confirmView(bankId) {
      const b = C.bank(bankId);
      sheet.set(html`
        <div class="sheet-hero">${ui.bankAvatar(bankId, 'lg')}<h3>${b.name} verbinden</h3>
          <p class="sheet-lead" style="margin:0">Echte Apps verbinden sich über die gesicherte PSD2-Schnittstelle deiner Bank. Diese Demo fragt <b>keine Zugangsdaten</b> ab und legt nur ein Beispielkonto an.</p></div>
        <div class="callout">${icon('shield', 20)}<span>Gib niemals Online-Banking-PIN oder TAN in Apps ein, deren Herkunft du nicht kennst.</span></div>`,
      html`<button type="button" class="btn" data-go-on>Beispielkonto anlegen</button><button type="button" class="btn plain" data-back>Andere Bank wählen</button>`);
      sheet.foot.querySelector('[data-back]').addEventListener('click', listView);
      sheet.foot.querySelector('[data-go-on]').addEventListener('click', () => connect(bankId));
    }
    function connect(bankId) {
      const b = C.bank(bankId);
      sheet.set(html`<div class="sheet-hero">${ui.bankAvatar(bankId, 'lg')}<h3>${b.short}</h3></div>
        <div class="progress-steps" aria-live="polite">
          <div data-s="1" class="on"><span class="st">${icon('refresh', 15)}</span>Verbindung wird aufgebaut</div>
          <div data-s="2"><span class="st">${icon('refresh', 15)}</span>Umsätze werden abgerufen</div>
          <div data-s="3"><span class="st">${icon('refresh', 15)}</span>Kategorien und Verträge erkennen</div>
        </div>`);
      const mark = (i) => {
        const prev = sheet.body.querySelector(`[data-s="${i - 1}"]`);
        if (prev) { prev.className = 'done'; prev.querySelector('.st').innerHTML = String(icon('check', 15)); }
        const cur = sheet.body.querySelector(`[data-s="${i}"]`);
        if (cur) cur.className = 'on';
      };
      setTimeout(() => mark(2), 700);
      setTimeout(() => mark(3), 1400);
      setTimeout(() => {
        mark(4);
        const id = S.act.addAccount(bankId);
        const a = S.account(id);
        const n = S.queryTxs({ accountId: id }).length;
        sheet.set(html`<div class="success"><span class="ring">${icon('check', 42)}</span><h3>${b.short} ist verbunden</h3>
          <p>${n} Beispielumsätze wurden importiert. Kontostand: <b class="amt">${eur(S.balance(id))}</b></p></div>`,
        html`<button type="button" class="btn" data-open>Konto ansehen</button><button type="button" class="btn plain" data-sheet-close>Fertig</button>`);
        sheet.foot.querySelector('[data-open]').addEventListener('click', () => {
          sheet.close();
          FK.nav.go('/konten/konto/' + a.id);
        });
      }, 2100);
    }
    listView();
  };
})(window.FK);
