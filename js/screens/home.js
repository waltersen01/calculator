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

  /** Erwartete Abbuchungen und Eingänge der nächsten Tage über alle Konten */
  function upcoming(days) {
    const today = S.today();
    const from = D.addDays(today, 1);
    const until = D.addDays(today, days);
    const items = [];
    for (const c of S.contracts()) {
      for (const d of S.contractDates(c, from, until)) items.push({ date: D.ymd(d), name: c.provider, sub: c.product, amount: -c.amount, merchantId: c.merchant, go: 'vertrag/' + c.id });
    }
    for (const a of S.accounts()) {
      for (const it of S.scheduled(a.id, from, until)) if (it.kind !== 'contract') items.push(Object.assign({}, it, { go: 'prognose' }));
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
    if (!el || !fc) return;
    FK.charts.line(el, {
      points: fc.points,
      height,
      yAxis,
      todayLabel: true,
      xLabels: forecastLabels(fc),
      label: `Kontostand ${fc.account.name} im ${F.monthName(D.ym(fc.today))}: heute ${eur(fc.current)}, voraussichtlich ${eur(fc.endValue)} am ${F.dm(fc.end)}.`,
      tipTitle: (p) => `${F.wdShort(p.date)}${p.kind === 'forecast' ? ' · Prognose' : ''}`,
    });
  }

  const accLabel = (a) => `${C.bank(a.bankId).short} · ${a.name}`;

  function lastUpdate() {
    const times = S.accounts().map((a) => a.updatedAt).filter(Boolean).sort();
    return times.length ? new Date(times[times.length - 1]) : null;
  }

  function updatedLine() {
    const u = lastUpdate();
    if (!u) return '';
    return html`<div class="updated">${icon('check-circle', 14)}<span>Aktualisiert ${D.sameDay(u, new Date()) ? 'heute' : F.dm(u)}, ${F.time(u)}</span>·<button type="button" data-action="sync">${icon('refresh', 14)}Aktualisieren</button></div>`;
  }
  FK.updatedLine = updatedLine;

  function greetingHead() {
    const name = (S.state.profile.name || '').trim().split(/\s+/)[0];
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
    return html`<div class="greeting"><div><div class="eyebrow">${F.weekdayLong(S.today())}</div><h1>${greet}${name ? `, ${name}` : ''}</h1></div></div>`;
  }

  function navActions(insightCount) {
    const name = (S.state.profile.name || '').trim();
    return html`<button type="button" class="gbtn" data-go="hinweise" aria-label="Hinweise, ${insightCount} neu">${icon('bell', 21)}${insightCount ? html`<span class="dot"></span>` : ''}</button>
      <button type="button" class="gbtn avatar-btn" data-go="/profil" aria-label="Profil">${name ? FK.util.initials(name) : icon('user', 20)}</button>`;
  }

  /* ---------- Erststart ---------- */
  function onboarding() {
    return html`
      <div class="hero onboard">
        ${ui.topo('hero')}
        <span class="plus-badge">${icon('compass', 13)}${FK.config.appName}</span>
        <h2>Verbinde dein erstes Konto</h2>
        <p>Importiere deine Umsätze von Sparkasse und Trade Republic. Verträge, Prognose und Analyse entstehen daraus automatisch.</p>
        <div class="onboard-actions">
          <button type="button" class="btn light" data-action="connect" data-bank="sparkasse">${ui.bankAvatar('sparkasse', 'sm')}Sparkasse verbinden</button>
          <button type="button" class="btn light" data-action="connect" data-bank="traderepublic">${ui.bankAvatar('traderepublic', 'sm')}Trade Republic verbinden</button>
        </div>
        <button type="button" class="onboard-other" data-action="connect" data-bank="other">Andere Bank per CSV-Datei${icon('chevron-right', 16)}</button>
      </div>
      ${ui.section('So funktioniert’s', html`<div class="list">
        ${ui.row({ cls: 'plain', lead: html`<span class="step-no">1</span>`, title: 'Umsätze exportieren', sub: 'Im Online-Banking als CSV-Datei – oder live per PSD2', subWrap: true })}
        ${ui.row({ cls: 'plain', lead: html`<span class="step-no">2</span>`, title: 'Hier importieren', sub: 'Die Datei wird nur auf diesem Gerät gelesen', subWrap: true })}
        ${ui.row({ cls: 'plain', lead: html`<span class="step-no">3</span>`, title: 'Überblick bekommen', sub: 'Kategorien, Verträge, Gehalt und Prognose werden erkannt', subWrap: true })}
      </div>`)}
      <div class="callout" style="margin-top:16px">${icon('lock', 20)}<span><b>Deine Daten bleiben bei dir.</b> Es gibt keinen Server, der deine Umsätze speichert. Tipp: Füge die App zum Home-Bildschirm hinzu, damit Safari die Daten nicht nach längerer Nichtnutzung löscht.</span></div>`;
  }

  /* ---------- Übersicht ---------- */
  FK.screens.home = {
    render() {
      if (!S.hasData()) {
        return { title: 'Übersicht', head: greetingHead(), actions: navActions(0), body: onboarding() };
      }
      const tot = S.totals();
      const ins = S.insights();
      const fc = S.forecast();
      const ym = S.curYM();
      const m = S.month(ym);
      const hidden = !!S.setting('hideAmounts');
      const accounts = S.accounts();
      const up = upcoming(14).slice(0, 4);
      const recent = S.txs().slice(0, 6);
      const topCats = m.expenseCats.slice(0, 3);
      const maxCat = topCats.length ? topCats[0].amount : 1;

      const hero = html`<div class="hero">
        ${ui.topo('hero')}
        <div class="hero-top">
          <span class="hero-label">Gesamtsaldo · ${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'}</span>
          <button type="button" class="hero-eye" data-action="toggle-hide" aria-pressed="${String(hidden)}" aria-label="${hidden ? 'Beträge anzeigen' : 'Beträge ausblenden'}">${icon(hidden ? 'eye-off' : 'eye', 20)}</button>
        </div>
        <div class="hero-amount amt prop">${eur(tot.total)}</div>
        <div class="hero-delta">${icon(tot.monthDelta >= 0 ? 'trending-up' : 'trending-down')}<span><span class="amt">${eur(tot.monthDelta, { sign: true })}</span> seit 1. ${F.monthName(ym)}</span></div>
        <div class="acc-chips">
          ${accounts.map((a) => html`<button type="button" class="acc-chip" data-go="konto/${a.id}">${ui.bankAvatar(a.bankId, 'sm')}<span><span class="t">${accLabel(a)}</span><br><span class="v amt">${eur(S.balance(a.id))}</span></span></button>`)}
          <button type="button" class="acc-chip add" data-action="connect" aria-label="Konto verbinden">${icon('plus', 18)}<span class="t">Konto</span></button>
        </div>
      </div>`;

      const salary = fc ? fc.items.find((i) => i.kind === 'income') : null;
      const outs = fc ? fc.items.filter((i) => i.amount < 0) : [];
      const forecast = fc ? ui.section('Kontostandsprognose', html`<div class="card forecast-card">
          <div class="fc-head"><div>
            <div class="card-title">${accLabel(fc.account)}</div>
            <div class="fc-value amt prop">${eur(fc.endValue)}</div>
            <div class="fc-sub">voraussichtlich am ${F.dayMonth(fc.end)}</div>
          </div>${fc.lowest.value < 0 ? ui.badge('Minus droht', 'neg', 'alert') : ''}</div>
          <div class="chart" data-chart="home-forecast" style="margin-top:12px"></div>
          <div class="fc-foot"><span>Noch <b>${outs.length} ${outs.length === 1 ? 'Abbuchung' : 'Abbuchungen'}</b> · <span class="amt">${eur(fc.outgoing)}</span></span>${salary ? html`<span>Eingang <b>${F.dm(salary.date)}</b></span>` : ''}</div>
        </div>`, { go: 'prognose', text: 'Details' }) : '';

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
      </div>`, fc ? { go: 'prognose', text: 'Alle' } : null) : '';

      const recentBlock = recent.length ? ui.section('Letzte Umsätze', html`<div class="list">${recent.map((t) => ui.txRow(t, { showDate: true }))}</div>`, { go: 'umsaetze', text: 'Alle' }) : '';

      return {
        title: 'Übersicht',
        head: greetingHead(),
        refresh: true,
        actions: navActions(ins.length),
        body: html`${hero}${forecast}${insights}${monthBlock}${upBlock}${recentBlock}${updatedLine()}`,
      };
    },
    mount(el) {
      if (S.hasData()) mountForecast(el.querySelector('[data-chart="home-forecast"]'), S.forecast(), 128, false);
    },
  };

  /* ---------- Prognose ---------- */
  FK.screens.forecast = {
    render() {
      const fc = S.forecast();
      if (!fc) return { title: 'Prognose', body: ui.empty('line-chart', 'Noch keine Prognose', 'Verbinde ein Girokonto, damit die App deinen Kontostand bis Monatsende hochrechnen kann.') };
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
          }));
        }
      }
      const table = ui.srTable('Kontostand je Tag', ['Datum', 'Kontostand', 'Art'], fc.points.map((p) => [F.dmy(p.date), eur(p.value), p.kind === 'forecast' ? 'Prognose' : 'Ist']));
      const body = html`
        <div class="card">
          <div class="card-title">${accLabel(fc.account)}</div>
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
          ['Erwartete Abbuchungen', html`<span class="amt">${eur(fc.outgoing)}</span>`],
          [`Alltagsausgaben (Ø ${eur(-fc.perDay)} / Tag)`, html`<span class="amt">${eur(fc.variable)}</span>`],
          ['Am Monatsende', html`<span class="amt"><b>${eur(fc.endValue)}</b></span>`],
        ])}</div>
        <p class="footnote">Grundlage sind erkannte Verträge, regelmäßige Eingänge und Überweisungen sowie deine durchschnittlichen Alltagsausgaben der letzten 90 Tage auf diesem Konto.</p>`)}
        ${ui.section(`Erwartet bis ${F.dm(fc.end)}`, rows.length ? html`<div class="list">${rows}</div>` : ui.empty('calendar', 'Nichts mehr geplant', 'Bis Monatsende wurden keine wiederkehrenden Buchungen erkannt.'))}`;
      return { title: 'Prognose', body };
    },
    mount(el) {
      mountForecast(el.querySelector('[data-chart="forecast"]'), S.forecast(), 210, true);
    },
  };

  /* ---------- Hinweise ---------- */
  FK.screens.insights = {
    render() {
      const all = S.insights(true);
      const visible = all.filter((i) => !S.state.dismissed[i.id]);
      const hiddenCount = all.length - visible.length;
      const body = html`
        ${visible.length ? html`<div class="stack-12">${visible.map((i) => insightCard(i, true))}</div>` : ui.empty('check-circle', S.hasData() ? 'Alles erledigt' : 'Noch keine Hinweise', S.hasData() ? 'Du hast alle Hinweise gelesen.' : 'Sobald du ein Konto verbindest, erscheinen hier Hinweise zu Verträgen, Budgets und deinem Kontostand.')}
        ${hiddenCount ? html`<div style="margin-top:16px;text-align:center"><button type="button" class="btn sm tinted" data-action="restore-insights">${icon('eye', 18)}${hiddenCount} ausgeblendete anzeigen</button></div>` : ''}
        <p class="footnote" style="text-align:center">Hinweise entstehen automatisch aus deinen Umsätzen, Verträgen und Budgets.</p>`;
      return { title: 'Hinweise', body };
    },
  };
  FK.actions['restore-insights'] = () => S.act.restoreInsights();
})(window.FK);
