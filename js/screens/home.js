/* Finanzkompass – Übersicht, Kontostandsprognose, Hinweise */
(function (FK) {
  'use strict';
  const { html, icon, ui } = FK;
  const S = FK.store;
  const D = FK.date;
  const F = FK.dfmt;
  const eur = FK.fmt.eur;
  const C = FK.catalog;

  const goOf = (a) => (a.tab ? '/' + a.tab : a.go);

  function insightCard(i, full) {
    return html`<article class="insight t-${i.tone}${full ? ' full' : ''}">
      <span class="insight-icon">${icon(i.icon, 18)}</span>
      <h3 class="insight-title">${i.title}</h3>
      <p class="insight-text">${i.text}</p>
      <button type="button" class="insight-action" data-go="${goOf(i.action)}">${i.action.label}${icon('chevron-right', 16)}</button>
      <button type="button" class="insight-x" data-action="dismiss" data-id="${i.id}" aria-label="Hinweis ausblenden">${icon('x', 16)}</button>
    </article>`;
  }
  FK.insightCard = insightCard;

  /** Fällige Abbuchungen und Eingänge der nächsten Tage über alle Konten */
  function upcoming(days) {
    const today = S.today();
    const until = D.addDays(today, days);
    const items = [];
    for (const c of S.contracts()) {
      for (const d of FK.data.bookingDates(c, D.addDays(today, 1), until)) {
        items.push({ date: D.ymd(d), name: c.provider, sub: c.product, amount: -FK.data.priceAt(c, d), merchantId: c.merchant, go: 'vertrag/' + c.id });
      }
    }
    for (const it of S.scheduled('giro', D.addDays(today, 1), until)) {
      if (it.kind === 'contract') continue;
      items.push(Object.assign({}, it, { go: it.kind === 'income' ? null : 'prognose' }));
    }
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));
  }
  FK.upcoming = upcoming;

  function forecastLabels(fc) {
    const n = fc.points.length;
    const ti = fc.points.findIndex((p) => p.kind === 'forecast') - 1;
    const labels = [{ i: 0, text: F.dayMonthShort(fc.start) }, { i: n - 1, text: F.dayMonthShort(fc.end) }];
    if (ti > n * 0.18 && ti < n * 0.82) labels.push({ i: ti, text: 'Heute', strong: true });
    return labels;
  }

  function mountForecast(el, fc, height, yAxis) {
    if (!el) return;
    FK.charts.line(el, {
      points: fc.points,
      height,
      yAxis,
      todayLabel: true,
      xLabels: forecastLabels(fc),
      label: `Kontostand Girokonto im ${F.monthName(D.ym(fc.today))}: heute ${eur(fc.current)}, voraussichtlich ${eur(fc.endValue)} am ${F.dm(fc.end)}.`,
      tipTitle: (p) => `${F.wdShort(p.date)}${p.kind === 'forecast' ? ' · Prognose' : ''}`,
    });
  }

  /* ---------- Übersicht ---------- */
  FK.screens.home = {
    render() {
      const today = S.today();
      const tot = S.totals();
      const user = FK.config.user;
      const hour = new Date().getHours();
      const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
      const ins = S.insights();
      const fc = S.forecast('giro');
      const ym = S.curYM();
      const m = S.month(ym);
      const hidden = !!S.setting('hideAmounts');
      const accounts = S.accounts();
      const up = upcoming(14).slice(0, 4);
      const recent = S.txs().slice(0, 6);
      const topCats = m.expenseCats.slice(0, 3);
      const maxCat = topCats.length ? topCats[0].amount : 1;
      const salary = fc.items.find((i) => i.kind === 'income');
      const outs = fc.items.filter((i) => i.amount < 0);
      const initials = FK.util.initials(user.firstName + ' ' + user.lastName);
      const synced = new Date(S.state.lastSync || Date.now());

      const head = html`<div class="greeting"><div><div class="eyebrow">${F.weekdayLong(today)}</div><h1>${greet}, ${user.firstName}</h1></div></div>`;

      const hero = html`<div class="hero">
        ${ui.topo('hero')}
        <div class="hero-top">
          <span class="hero-label">Gesamtsaldo · ${accounts.length} Konten</span>
          <button type="button" class="hero-eye" data-action="toggle-hide" aria-pressed="${String(hidden)}" aria-label="${hidden ? 'Beträge anzeigen' : 'Beträge ausblenden'}">${icon(hidden ? 'eye-off' : 'eye', 20)}</button>
        </div>
        <div class="hero-amount amt prop">${eur(tot.total)}</div>
        <div class="hero-delta">${icon(tot.monthDelta >= 0 ? 'trending-up' : 'trending-down')}<span><span class="amt">${eur(tot.monthDelta, { sign: true })}</span> seit 1. ${F.monthName(ym)}</span></div>
        <div class="acc-chips">
          ${accounts.map((a) => html`<button type="button" class="acc-chip" data-go="konto/${a.id}">${ui.bankAvatar(a.bankId, 'sm')}<span><span class="t">${C.bank(a.bankId).short} · ${a.name}</span><br><span class="v amt">${eur(S.balance(a.id))}</span></span></button>`)}
        </div>
      </div>`;

      const forecast = ui.section('Kontostandsprognose', html`<div class="card forecast-card">
          <div class="fc-head"><div>
            <div class="card-title">Girokonto · Sparkasse</div>
            <div class="fc-value amt prop">${eur(fc.endValue)}</div>
            <div class="fc-sub">voraussichtlich am ${F.dayMonth(fc.end)}</div>
          </div>${fc.lowest.value < 0 ? ui.badge('Dispo droht', 'neg', 'alert') : ui.badge('Plus', 'accent', 'crown')}</div>
          <div class="chart" data-chart="home-forecast" style="margin-top:12px"></div>
          <div class="fc-foot"><span>Noch <b>${outs.length} Abbuchungen</b> · <span class="amt">${eur(fc.outgoing)}</span></span>${salary ? html`<span>Gehalt <b>${F.dm(salary.date)}</b></span>` : ''}</div>
        </div>`, { go: 'prognose', text: 'Details' });

      const insights = ins.length
        ? ui.section('Für dich', html`<div class="carousel">${ins.slice(0, 6).map((i) => insightCard(i))}</div>`, { go: 'hinweise', text: `Alle ${ins.length}` })
        : '';

      const monthBlock = ui.section(`${F.monthName(ym)} bisher`, html`
        <div class="kpis">
          <button type="button" class="kpi" data-go="/analyse"><span class="kpi-label">${icon('arrow-down-left', 14)}Einnahmen</span><div class="kpi-value amt pos">${eur(m.income, { decimals: 0 })}</div></button>
          <button type="button" class="kpi" data-go="/analyse"><span class="kpi-label">${icon('arrow-up-right', 14)}Ausgaben</span><div class="kpi-value amt">${eur(m.expense, { decimals: 0 })}</div></button>
          <button type="button" class="kpi" data-go="/analyse"><span class="kpi-label">${icon('piggy', 14)}Gespart</span><div class="kpi-value amt">${eur(m.saved, { decimals: 0 })}</div></button>
        </div>
        ${topCats.length ? html`<div class="card" style="margin-top:8px">
          <div class="card-title">Größte Ausgaben</div>
          <div class="mini-cats">
            ${topCats.map((c) => html`<button type="button" class="mini-cat" data-go="kategorie/${c.id}/${ym}">${ui.catIcon(c.id, 'sm')}<span class="n">${C.cat(c.id).name}</span>${ui.amt(c.amount)}<span class="share" aria-hidden="true"><span style="width:${((c.amount / maxCat) * 100).toFixed(1)}%"></span></span></button>`)}
          </div>
        </div>` : ''}`, { go: '/analyse', text: 'Analyse' });

      const upBlock = up.length ? ui.section('Demnächst', html`<div class="list">
        ${up.map((u) => ui.row({ go: u.go, lead: ui.merchantAvatar(u.merchantId, u.name), title: u.name, sub: `${F.due(u.date).replace(/^./, (x) => x.toUpperCase())} · ${u.sub}`, end: ui.amt(u.amount, { colored: true }) }))}
      </div>`, { go: 'prognose', text: 'Alle' }) : '';

      const recentBlock = ui.section('Letzte Umsätze', html`<div class="list">${recent.map((t) => ui.txRow(t, { showDate: true }))}</div>`, { go: 'umsaetze', text: 'Alle' });

      const body = html`${hero}${forecast}${insights}${monthBlock}${upBlock}${recentBlock}
        <div class="updated">${icon('check-circle', 14)}<span>Aktualisiert ${D.sameDay(synced, new Date()) ? 'heute' : F.dm(synced)}, ${F.time(synced)}</span>·<button type="button" data-action="sync">${icon('refresh', 14)}Aktualisieren</button></div>
        <p class="footnote" style="text-align:center">Demo mit Beispieldaten · keine echte Bankverbindung</p>`;

      return {
        title: 'Übersicht',
        head,
        refresh: true,
        actions: html`<button type="button" class="gbtn" data-go="hinweise" aria-label="Hinweise, ${ins.length} neu">${icon('bell', 21)}${ins.length ? html`<span class="dot"></span>` : ''}</button>
          <button type="button" class="gbtn avatar-btn" data-go="/profil" aria-label="Profil">${initials}</button>`,
        body,
      };
    },
    mount(el) {
      mountForecast(el.querySelector('[data-chart="home-forecast"]'), S.forecast('giro'), 128, false);
    },
  };

  /* ---------- Prognose ---------- */
  FK.screens.forecast = {
    render() {
      const fc = S.forecast('giro');
      const byDate = FK.util.groupBy(fc.items, (i) => i.date);
      const rows = [];
      for (const [date, list] of byDate) {
        for (const it of list) {
          rows.push(ui.row({
            go: it.contractId ? 'vertrag/' + it.contractId : null,
            lead: ui.merchantAvatar(it.merchantId, it.name),
            title: it.name,
            sub: `${F.wdShort(date)} · ${it.sub}`,
            end: ui.amt(it.amount, { colored: true }),
            endSub: it.estimate ? 'geschätzt' : null,
          }));
        }
      }
      const table = ui.srTable('Kontostand je Tag', ['Datum', 'Kontostand', 'Art'], fc.points.map((p) => [F.dmy(p.date), eur(p.value), p.kind === 'forecast' ? 'Prognose' : 'Ist']));
      const body = html`
        <div class="card">
          <div class="card-title">Girokonto · Sparkasse</div>
          <div class="big-figure amt prop" style="margin-top:4px">${eur(fc.endValue)}</div>
          <div class="fc-sub">voraussichtlich am ${F.long(fc.end)}</div>
          <div class="chart" data-chart="forecast" style="margin-top:14px"></div>
          <div class="legend-inline"><span><i></i>Kontostand</span><span><i class="dash"></i>Prognose</span></div>
          ${table}
        </div>
        ${fc.lowest.kind === 'forecast' && fc.lowest.value < fc.current ? html`<div class="callout${fc.lowest.value < 0 ? ' warn' : ''}" style="margin-top:12px">${icon(fc.lowest.value < 0 ? 'alert' : 'info', 20)}<span>Tiefster Stand voraussichtlich am <b>${F.dayMonth(fc.lowest.date)}</b> mit <b class="amt">${eur(fc.lowest.value)}</b>${fc.lowest.value < 0 ? ' – plane einen Puffer ein, um Dispozinsen zu vermeiden.' : '.'}</span></div>` : ''}
        ${ui.section('So entsteht die Prognose', html`<div class="list">${ui.kv([
          ['Kontostand heute', html`<span class="amt">${eur(fc.current)}</span>`],
          ['Erwartete Eingänge', html`<span class="amt pos">${eur(fc.incoming, { sign: true })}</span>`],
          ['Geplante Abbuchungen', html`<span class="amt">${eur(fc.outgoing)}</span>`],
          [`Alltagsausgaben (Ø ${eur(-fc.perDay)} / Tag)`, html`<span class="amt">${eur(fc.variable)}</span>`],
          ['Am Monatsende', html`<span class="amt"><b>${eur(fc.endValue)}</b></span>`],
        ])}</div>
        <p class="footnote">Grundlage sind deine Verträge, regelmäßige Eingänge wie dein Gehalt und deine durchschnittlichen Alltagsausgaben der letzten 90 Tage.</p>`)}
        ${ui.section(`Geplant bis ${F.dm(fc.end)}`, rows.length ? html`<div class="list">${rows}</div>` : ui.empty('calendar', 'Keine geplanten Buchungen', 'Bis Monatsende ist nichts mehr fällig.'))}
      `;
      return { title: 'Prognose', large: true, body };
    },
    mount(el) {
      mountForecast(el.querySelector('[data-chart="forecast"]'), S.forecast('giro'), 210, true);
    },
  };

  /* ---------- Hinweise ---------- */
  FK.screens.insights = {
    render() {
      const all = S.insights(true);
      const visible = all.filter((i) => !S.state.dismissed[i.id]);
      const hiddenCount = all.length - visible.length;
      const body = html`
        ${visible.length ? html`<div class="stack-12">${visible.map((i) => insightCard(i, true))}</div>` : ui.empty('check-circle', 'Alles erledigt', 'Du hast alle Hinweise gelesen.')}
        ${hiddenCount ? html`<div style="margin-top:16px;text-align:center"><button type="button" class="btn sm tinted" data-action="restore-insights">${icon('eye', 18)}${hiddenCount} ausgeblendete anzeigen</button></div>` : ''}
        <p class="footnote" style="text-align:center">Hinweise entstehen automatisch aus deinen Umsätzen, Verträgen und Budgets.</p>`;
      return { title: 'Hinweise', body };
    },
  };
  FK.actions['restore-insights'] = () => S.act.restoreInsights();
})(window.FK);
