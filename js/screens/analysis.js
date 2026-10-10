/* Finanzkompass – Analyse: Monatsvergleich, Kategorien, Budgets, Kategoriedetails */
(function (FK) {
  'use strict';
  const { html, icon, ui } = FK;
  const S = FK.store;
  const F = FK.dfmt;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;

  function deltaHTML(cmp, mode) {
    if (!cmp || cmp.ratio == null || !isFinite(cmp.ratio)) return '';
    const up = cmp.delta > 0;
    // Mehr Ausgaben = schlecht, mehr Einnahmen = gut
    const good = mode === 'income' ? up : !up;
    const tone = Math.abs(cmp.ratio) < 0.02 ? 'neutral' : good ? 'good' : 'bad';
    const label = cmp.partial ? `ggü. 1.–${cmp.day}. ${F.monthName(cmp.prev)}` : `ggü. ${F.monthName(cmp.prev)}`;
    return html`<span class="delta ${tone}">${icon(up ? 'arrow-up' : 'arrow-down', 15)}<span class="amt">${eur(Math.abs(cmp.delta), { decimals: 0 })}</span> (${FK.fmt.pct(Math.abs(cmp.ratio))})</span> <span class="fc-sub">${label}</span>`;
  }

  function budgetRow(b, ym) {
    const cat = C.cat(b.catId);
    const state = b.status === 'over'
      ? html`<span class="state over">${icon('alert', 14)}${eur(-b.remaining)} überschritten</span>`
      : b.status === 'warn'
        ? html`<span class="state warn">${icon('alert-circle', 14)}Noch ${eur(b.remaining)}</span>`
        : html`<span class="state">Noch <span class="amt">${eur(b.remaining)}</span></span>`;
    return html`<button type="button" class="budget" data-action="edit-budget" data-cat="${b.catId}" aria-label="Budget ${cat.name} bearbeiten">
      <div class="budget-top">${ui.catIcon(b.catId, 'sm')}<span class="row-main"><span class="row-title">${cat.name}</span></span><span class="amt" style="font-weight:600">${eur(b.spent, { decimals: 0 })} <span class="muted" style="font-weight:500">von ${eur(b.limit, { decimals: 0 })}</span></span></div>
      ${ui.meter(b.ratio, b.status, `${cat.name}: ${FK.fmt.pct(b.ratio)} des Budgets`)}
      <div class="budget-foot">${state}<span>${b.perDay && ym === S.curYM() ? html`ca. <span class="amt">${eur(b.perDay)}</span> pro Tag` : FK.fmt.pct(b.ratio)}</span></div>
    </button>`;
  }
  FK.budgetRow = budgetRow;

  function monthSwitch(ym, action) {
    const months = S.months();
    const i = months.indexOf(ym);
    return html`<div class="month-switch">
      <button type="button" data-action="${action}" data-value="${months[i - 1] || ''}" aria-label="Vorheriger Monat" ${i <= 0 ? FK.raw('disabled') : ''}>${icon('chevron-left', 22)}</button>
      <div class="label">${F.month(ym)}${ym === S.curYM() ? html`<small>bis heute, ${F.dm(S.today())}</small>` : ''}</div>
      <button type="button" data-action="${action}" data-value="${months[i + 1] || ''}" aria-label="Nächster Monat" ${i >= months.length - 1 ? FK.raw('disabled') : ''}>${icon('chevron-right', 22)}</button>
    </div>`;
  }

  /* ---------- Analyse ---------- */
  FK.screens.analysis = {
    render() {
      if (!S.hasData()) {
        return { title: 'Analyse', body: html`${ui.empty('analysis', 'Noch nichts auszuwerten', 'Sobald du Umsätze importierst, siehst du hier Einnahmen, Ausgaben und Kategorien pro Monat.')}<button type="button" class="btn" data-action="connect">${icon('plus', 20)}Konto verbinden</button>` };
      }
      const ym = S.ui.analysisMonth || S.curYM();
      const mode = S.ui.analysisMode;
      const m = S.month(ym);
      const cats = mode === 'income' ? m.incomeCats : m.expenseCats;
      const total = mode === 'income' ? m.income : m.expense;
      const max = cats.length ? cats[0].amount : 1;
      const cmp = S.compare(ym, mode);
      const series = S.series(ym, 6, mode);
      const budgets = S.budgets(ym);
      const savingsRate = m.income > 0 ? m.saved / m.income : 0;

      const body = html`
        <div class="stack-12">
          ${monthSwitch(ym, 'analysis-month')}
          ${ui.seg('analysis-mode', [{ value: 'expense', label: 'Ausgaben' }, { value: 'income', label: 'Einnahmen' }], mode, 'Ansicht')}
        </div>
        <div class="card" style="margin-top:12px">
          <div class="card-title">${mode === 'income' ? 'Einnahmen' : 'Ausgaben'} im ${F.monthName(ym)}</div>
          <div class="big-figure amt prop">${eur(total)}</div>
          <div style="margin-top:2px">${deltaHTML(cmp, mode)}</div>
          <div class="chart" data-chart="months" style="margin-top:16px"></div>
          ${ui.srTable(`${mode === 'income' ? 'Einnahmen' : 'Ausgaben'} der letzten Monate`, ['Monat', 'Betrag'], series.map((s) => [F.month(s.ym), eur(s.value)]))}
          <p class="footnote" style="margin:8px 0 0">Tippe auf eine Säule, um den Monat zu wechseln.</p>
        </div>

        ${mode === 'expense' ? html`<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px">
          <div class="kpi"><span class="kpi-label">${icon('piggy', 14)}Gespart</span><div class="kpi-value amt">${eur(m.saved)}</div></div>
          <div class="kpi"><span class="kpi-label">${icon('percent', 14)}Sparquote</span><div class="kpi-value">${m.income >= m.saved && m.income > 0 ? FK.fmt.pct(savingsRate) : '–'}</div></div>
        </div>` : ''}

        ${ui.section('Kategorien', cats.length ? html`<div class="list">
          ${cats.map((c) => {
            const cat = C.cat(c.id);
            return html`<button type="button" class="row cat-row" data-go="kategorie/${c.id}/${ym}">
              ${ui.catIcon(c.id)}
              <span class="row-main"><span class="row-title">${cat.name}</span><span class="row-sub">${c.count} ${c.count === 1 ? 'Umsatz' : 'Umsätze'} · ${FK.fmt.pct(total ? c.amount / total : 0)}</span></span>
              <span class="row-end">${ui.amt(c.amount)}</span>
              <span class="share" aria-hidden="true"><span style="width:${((c.amount / max) * 100).toFixed(1)}%"></span></span>
            </button>`;
          })}
        </div>` : ui.empty('analysis', 'Keine Umsätze', 'In diesem Monat gibt es noch nichts auszuwerten.'))}

        ${mode === 'expense' ? ui.section('Budgets', html`<div class="list">
          ${budgets.length ? budgets.map((b) => budgetRow(b, ym)) : html`<div style="padding:4px 0">${ui.empty('target', 'Noch keine Budgets', 'Lege fest, wie viel du pro Monat ausgeben möchtest.')}</div>`}
        </div>
        <div style="margin-top:10px"><button type="button" class="btn tinted" data-action="edit-budget">${icon('plus', 20)}Budget hinzufügen</button></div>`) : ''}
        <p class="footnote" style="text-align:center;margin-top:20px">Umbuchungen zwischen deinen eigenen Konten und Sparbeträge zählen nicht als Ausgaben.</p>`;

      return { title: 'Analyse', body };
    },
    mount(el) {
      if (!S.hasData()) return;
      const ym = S.ui.analysisMonth || S.curYM();
      const mode = S.ui.analysisMode;
      const series = S.series(ym, 6, mode);
      const chart = el.querySelector('[data-chart="months"]');
      FK.charts.columns(chart, {
        data: series.map((s) => ({ label: F.monthShort(s.ym), value: s.value, title: F.month(s.ym) })),
        selected: series.length - 1,
        height: 170,
        onSelect: (i) => {
          if (series[i].ym === ym) return;
          S.ui.analysisMonth = series[i].ym;
          FK.nav.refresh();
        },
      });
    },
  };

  FK.actions['analysis-month'] = (el) => {
    if (!el.dataset.value) return;
    S.ui.analysisMonth = el.dataset.value;
    FK.nav.refresh();
  };
  FK.actions['analysis-mode'] = (el) => {
    S.ui.analysisMode = el.dataset.value;
    FK.nav.refresh();
  };

  /* ---------- Kategorie ---------- */
  FK.screens.category = {
    render(p) {
      const cat = C.cat(p.id);
      const ym = p.ym || S.ui.analysisMonth || S.curYM();
      const mode = cat.type === 'income' ? 'income' : 'expense';
      const m = S.month(ym);
      const list = (mode === 'income' ? m.incomeCats : m.expenseCats).find((c) => c.id === cat.id);
      const total = list ? list.amount : 0;
      const series = S.series(ym, 6, mode, cat.id);
      const avg = series.length ? U.sum(series, (s) => s.value) / series.length : 0;
      const txs = m.txs.filter((t) => t.categoryId === cat.id);
      const byMerchant = [...U.groupBy(txs, (t) => t.name)].map(([name, l]) => ({ name, merchantId: l[0].merchantId, sum: -U.sum(l, (t) => t.amount) * (mode === 'income' ? -1 : 1), count: l.length }))
        .sort((a, b) => b.sum - a.sum).slice(0, 5);
      const budget = mode === 'expense' ? S.budgets(ym).find((b) => b.catId === cat.id) : null;

      const body = html`
        <div class="detail-head">
          ${ui.catIcon(cat.id, 'lg')}
          <div class="name">${cat.name}</div>
          <div class="sub">${F.month(ym)}</div>
          <div class="detail-amount amt prop" style="margin-top:4px">${eur(total)}</div>
          <div class="sub">Ø 6 Monate: <span class="amt">${eur(avg)}</span></div>
        </div>
        <div class="card">
          <div class="chart" data-chart="cat" ></div>
          ${ui.srTable(`${cat.name} der letzten Monate`, ['Monat', 'Betrag'], series.map((s) => [F.month(s.ym), eur(s.value)]))}
        </div>
        ${budget ? ui.section('Budget', html`<div class="list">${budgetRow(budget, ym)}</div>`) : mode === 'expense' ? html`<div class="section"><button type="button" class="btn tinted" data-action="edit-budget" data-cat="${cat.id}">${icon('target', 20)}Budget für ${cat.name} festlegen</button></div>` : ''}
        ${byMerchant.length > 1 ? ui.section('Wo am meisten', html`<div class="list">${byMerchant.map((b) => ui.row({ lead: ui.merchantAvatar(b.merchantId, b.name, 'sm'), cls: 'compact', title: b.name, sub: `${b.count} ${b.count === 1 ? 'Umsatz' : 'Umsätze'}`, end: ui.amt(b.sum) }))}</div>`) : ''}
        ${ui.section('Umsätze', txs.length ? ui.txGroups(txs, {}) : ui.empty('receipt', 'Keine Umsätze', `Im ${F.monthName(ym)} gab es in dieser Kategorie nichts.`))}`;
      return { title: cat.name, large: false, body };
    },
    mount(el, p) {
      const cat = C.cat(p.id);
      const ym = p.ym || S.ui.analysisMonth || S.curYM();
      const mode = cat.type === 'income' ? 'income' : 'expense';
      const series = S.series(ym, 6, mode, cat.id);
      FK.charts.columns(el.querySelector('[data-chart="cat"]'), {
        data: series.map((s) => ({ label: F.monthShort(s.ym), value: s.value, title: F.month(s.ym) })),
        selected: series.length - 1,
        height: 150,
        onSelect: (i) => { if (series[i].ym !== ym) FK.nav.go(`kategorie/${cat.id}/${series[i].ym}`); },
      });
    },
  };

  /* ---------- Budget bearbeiten ---------- */
  FK.actions['edit-budget'] = (el) => {
    const existing = el && el.dataset.cat && S.state.budgets[el.dataset.cat] != null ? el.dataset.cat : null;
    let catId = (el && el.dataset.cat) || null;
    const expenseCats = C.categories.filter((c) => c.type === 'expense');
    if (!catId) catId = (expenseCats.find((c) => S.state.budgets[c.id] == null) || expenseCats[0]).id;
    // Vorschlag: Durchschnitt der letzten 3 vollen Monate, auf 10 € gerundet
    const suggest = (id) => {
      const months = S.months();
      const full = months.slice(-4, -1);
      const avg = full.length ? U.sum(full, (ym) => { const e = S.month(ym).expenseCats.find((x) => x.id === id); return e ? e.amount : 0; }) / full.length : 100;
      return Math.max(20, Math.round(avg / 10) * 10);
    };
    let value = S.state.budgets[catId] != null ? S.state.budgets[catId] : suggest(catId);

    const sheet = FK.sheet.open({ title: existing ? 'Budget bearbeiten' : 'Neues Budget' });
    function draw() {
      const cat = C.cat(catId);
      sheet.set(html`
        <div class="sheet-hero">${ui.catIcon(catId, 'lg')}
          ${existing ? html`<h3>${cat.name}</h3>` : html`<div class="form" style="width:100%"><div class="field"><label for="b-cat">Kategorie</label><select id="b-cat">${expenseCats.map((c) => html`<option value="${c.id}" ${c.id === catId ? FK.raw('selected') : ''}>${c.name}${S.state.budgets[c.id] != null ? ' (vorhanden)' : ''}</option>`)}</select></div></div>`}
        </div>
        <div class="stepper">
          <button type="button" data-step="-10" aria-label="10 € weniger">${icon('minus', 22)}</button>
          <span class="val" aria-live="polite">${eur(value, { decimals: 0 })}</span>
          <button type="button" data-step="10" aria-label="10 € mehr">${icon('plus', 22)}</button>
        </div>
        <label class="sr-only" for="b-range">Monatliches Budget</label>
        <input id="b-range" type="range" min="10" max="1500" step="10" value="${value}">
        <p class="footnote" style="text-align:center">Vorschlag aus deinen letzten 3 Monaten: <b>${eur(suggest(catId), { decimals: 0 })}</b> pro Monat</p>`,
      html`<button type="button" class="btn" data-save>Budget speichern</button>${existing ? html`<button type="button" class="btn plain" data-del style="color:var(--neg)">Budget löschen</button>` : ''}`);
      const val = sheet.body.querySelector('.val');
      const range = sheet.body.querySelector('#b-range');
      const setV = (v) => { value = Math.max(10, Math.min(5000, v)); val.textContent = eur(value, { decimals: 0 }); range.value = String(Math.min(1500, value)); };
      sheet.body.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setV(value + Number(b.dataset.step))));
      range.addEventListener('input', () => setV(Number(range.value)));
      const sel = sheet.body.querySelector('#b-cat');
      if (sel) sel.addEventListener('change', () => { catId = sel.value; value = S.state.budgets[catId] != null ? S.state.budgets[catId] : suggest(catId); draw(); });
      sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
        S.act.setBudget(catId, value);
        sheet.close();
        FK.toast(`Budget ${C.cat(catId).name}: ${eur(value, { decimals: 0 })}`, { icon: 'target' });
      });
      const del = sheet.foot.querySelector('[data-del]');
      if (del) del.addEventListener('click', () => {
        S.act.removeBudget(catId);
        sheet.close();
        FK.toast('Budget gelöscht', { icon: 'trash', tone: 'info' });
      });
    }
    draw();
  };
})(window.FK);
