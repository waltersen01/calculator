/* Finanzkompass – Verträge: Fixkosten, Rücklagen, Sparpotenzial, Vertragsdetails, Kündigungsservice, Tarifvergleich */
(function (FK) {
  'use strict';
  const { html, icon, ui, raw } = FK;
  const S = FK.store;
  const D = FK.date;
  const F = FK.dfmt;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;

  const METHOD = { sepa: 'SEPA-Lastschrift', standing: 'Dauerauftrag', credit: 'Kreditkarte' };
  const GROUP_CAT = { wohnen: 'wohnen', versicherungen: 'versicherungen', kommunikation: 'kommunikation', abos: 'abos', mobilitaet: 'mobilitaet', freizeit: 'freizeit' };

  function deadlineSoon(c) {
    if (!c.cancel.possible || !c.cancel.deadline) return null;
    const n = D.diffDays(S.today(), c.cancel.deadline);
    return n >= 0 && n <= 75 ? n : null;
  }

  function contractRow(c) {
    let sub;
    if (c.status === 'cancelled') sub = `Gekündigt zum ${F.dmy(c.cancelled.endDate)}`;
    else if (c.next) sub = `Fällig ${F.due(c.next)}`;
    else sub = c.product;
    const tags = [];
    if (c.status === 'active' && c.change && c.change.recent && c.change.to > c.change.from) tags.push(ui.badge('teurer', 'warn', 'trending-up'));
    else if (c.status === 'active' && deadlineSoon(c) != null && c.savings) tags.push(ui.badge('Frist', 'accent', 'clock'));
    else if (c.status === 'active' && c.savings) tags.push(ui.badge('sparen', 'pos', 'sparkles'));
    return ui.row({
      go: 'vertrag/' + c.id,
      lead: ui.contractAvatar(c),
      title: c.provider,
      badge: tags.length ? tags : null,
      sub,
      end: ui.amt(c.amount),
      endSub: S.intervalLabel(c),
      label: `${c.provider}, ${eur(c.amount)} ${S.intervalLabel(c)}`,
    });
  }

  /* ---------- Übersicht ---------- */
  FK.screens.contracts = {
    render() {
      const sum = S.contractSummary();
      const view = S.ui.contractsView;
      const factor = view === 'yearly' ? 12 : 1;
      const list = S.contracts();
      const active = list.filter((c) => c.status === 'active');
      const groups = C.contractGroups
        .map((g, i) => Object.assign({}, g, { slot: i + 1, items: active.filter((c) => c.group === g.id).sort((a, b) => b.monthly - a.monthly) }))
        .filter((g) => g.items.length);
      const total = sum.monthly || 1;
      const shown = sum.groups.filter((g) => g.monthly > 0);

      const summary = html`<div class="card">
        <div class="card-title"><span>Fixkosten</span>${ui.seg('contracts-view', [{ value: 'monthly', label: 'Monat' }, { value: 'yearly', label: 'Jahr' }], view, 'Zeitraum')}</div>
        <div class="big-figure amt prop" style="margin-top:6px">${eur(sum.monthly * factor)}</div>
        <div class="fc-sub">${sum.count} aktive Verträge · ${view === 'yearly' ? 'pro Jahr' : 'pro Monat'}</div>
        <div class="stackbar" role="img" aria-label="Fixkosten nach Bereich">
          ${shown.map((g) => html`<span style="flex:${g.monthly.toFixed(2)};background:var(--g${g.slot})" title="${g.name}: ${eur(g.monthly * factor)}"></span>`)}
        </div>
        <div class="legend">
          ${shown.map((g) => html`<div class="legend-row"><span class="swatch" style="--c:var(--g${g.slot})"></span><span class="n">${g.name}</span>${ui.amt(g.monthly * factor)}<span class="p">${FK.fmt.pct(g.monthly / total)}</span></div>`)}
        </div>
      </div>`;

      const reserve = sum.reserve > 0 ? ui.section('Rücklagen', html`<div class="card">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <span class="insight-icon">${icon('piggy', 18)}</span>
          <div style="min-width:0">
            <div style="font-weight:600">Lege <span class="amt">${eur(sum.reserve)}</span> im Monat zurück</div>
            <div class="fc-sub" style="margin-top:2px">Damit sind Jahres- und Quartalszahlungen gedeckt, wenn sie fällig werden.</div>
          </div>
        </div>
        <div class="legend" style="margin-top:8px">
          ${sum.nonMonthly.map((c) => html`<div class="legend-row" style="grid-template-columns:minmax(0,1fr) auto auto"><span class="n">${c.provider} <span class="muted">· ${c.next ? F.monthName(D.ym(c.next)) : '–'}</span></span>${ui.amt(c.amount)}<span class="p">${S.intervalLabel(c)}</span></div>`)}
        </div>
      </div>`) : '';

      const savings = sum.savings.length ? ui.section('Sparpotenzial', html`<div class="list">
        ${sum.savings.map((c) => ui.row({ go: 'vertrag/' + c.id, lead: ui.contractAvatar(c), title: c.provider, sub: c.product, end: html`<span class="amt pos">bis ${eur(c.savings.perYear, { decimals: 0 })}</span>`, endSub: 'pro Jahr', chevron: false }))}
      </div>`) : '';

      const groupSections = groups.map((g) => ui.section(g.name, html`<div class="list">${g.items.map(contractRow)}</div>
        <p class="footnote" style="text-align:right;margin-top:6px"><span class="amt">${eur(U.sum(g.items, (c) => c.monthly) * factor)}</span> ${view === 'yearly' ? 'pro Jahr' : 'pro Monat'}</p>`));

      const cancelled = sum.cancelled.length ? ui.section('Gekündigt', html`<div class="list">${sum.cancelled.map(contractRow)}</div>
        <p class="footnote">Durch deine Kündigungen sparst du <b class="amt">${eur(sum.cancelledYearly)}</b> im Jahr.</p>`) : '';

      const body = html`${summary}${reserve}${savings}${groupSections}${cancelled}
        <div class="section"><button type="button" class="btn tinted" data-action="add-contract">${icon('plus', 20)}Vertrag hinzufügen</button>
        <p class="footnote" style="text-align:center">Verträge werden automatisch aus wiederkehrenden Umsätzen erkannt.</p></div>`;

      return {
        title: 'Verträge',
        actions: html`<button type="button" class="gbtn" data-action="add-contract" aria-label="Vertrag hinzufügen">${icon('plus', 22)}</button>`,
        body,
      };
    },
  };

  FK.actions['contracts-view'] = (el) => {
    S.ui.contractsView = el.dataset.value;
    FK.nav.refresh();
  };

  /* ---------- Vertragsdetails ---------- */
  FK.screens.contract = {
    render(p) {
      const c = S.contract(p.id);
      if (!c) return null;
      const acc = S.account(c.account);
      const cancelled = c.status === 'cancelled';
      const soon = deadlineSoon(c);
      const badges = [];
      if (cancelled) badges.push(ui.badge(`Gekündigt zum ${F.dmy(c.cancelled.endDate)}`, 'pos', 'check'));
      else badges.push(ui.badge('Aktiv', 'accent'));
      if (c.change && c.change.recent && c.change.to > c.change.from) badges.push(ui.badge(`+${FK.fmt.pct(c.change.ratio)} seit ${F.monthShort(c.change.since)}`, 'warn', 'trending-up'));
      if (c.custom) badges.push(ui.badge('Manuell angelegt'));

      const callouts = [];
      if (cancelled) {
        callouts.push(html`<div class="callout pos">${icon('check-circle', 20)}<span>Kündigung verschickt am ${F.dmy(c.cancelled.requestedAt)}. Der Vertrag endet am <b>${F.long(c.cancelled.endDate)}</b> – du sparst danach <b class="amt">${eur(c.yearly)}</b> im Jahr.</span></div>`);
      } else {
        if (c.change && c.change.recent && c.change.to > c.change.from) {
          const yearly = ((c.change.to - c.change.from) * 12) / FK.data.intervalMonths(c);
          callouts.push(html`<div class="callout warn">${icon('trending-up', 20)}<span><b>Preiserhöhung erkannt.</b> Seit ${F.month(c.change.since)} zahlst du ${eur(c.change.to)} statt ${eur(c.change.from)} – <span class="amt">${eur(yearly)}</span> mehr im Jahr. Bei einer Preiserhöhung hast du oft ein Sonderkündigungsrecht.</span></div>`);
        }
        if (soon != null && c.savings) {
          callouts.push(html`<div class="callout">${icon('calendar', 20)}<span><b>Noch ${soon} Tage</b> bis zum Stichtag am ${F.dmy(c.cancel.deadline)}. ${c.savings.text}</span></div>`);
        } else if (c.savings) {
          callouts.push(html`<div class="callout pos">${icon('sparkles', 20)}<span><b>Bis zu ${eur(c.savings.perYear, { decimals: 0 })} im Jahr sparen.</b> ${c.savings.text}</span></div>`);
        }
        if (!c.cancel.possible && c.cancel.hint) callouts.push(html`<div class="callout">${icon('info', 20)}<span>${c.cancel.hint}</span></div>`);
        else if (c.cancel.hint) callouts.push(html`<div class="callout">${icon('info', 20)}<span>${c.cancel.hint}</span></div>`);
      }

      let actions;
      if (cancelled) actions = html`<button type="button" class="btn tinted" data-action="undo-cancel" data-id="${c.id}">${icon('refresh', 20)}Kündigung zurückziehen</button>`;
      else if (c.cancel.possible) actions = html`<div class="btn-row"><button type="button" class="btn" data-action="cancel-contract" data-id="${c.id}">${icon('scissors', 20)}Kündigen</button><button type="button" class="btn tinted" data-action="compare" data-id="${c.id}">${icon('sparkles', 20)}Vergleichen</button></div>`;
      else actions = html`<button type="button" class="btn tinted" data-action="compare" data-id="${c.id}">${icon('sparkles', 20)}Tarife vergleichen</button>`;

      const prices = c.prices.slice().reverse();
      const timeline = prices.length > 1 ? ui.section('Preisentwicklung', html`<div class="list timeline">
        ${prices.map((pr, i) => {
          const prev = prices[i + 1];
          const diff = prev ? (pr.amount - prev.amount) / prev.amount : null;
          return html`<div class="tl-row${i === 0 ? ' now' : ''}"><span class="dot"></span><span>${i === 0 ? 'seit ' : 'ab '}${F.month(pr.since)}${diff != null ? html` <span class="muted">· ${diff >= 0 ? '+' : ''}${FK.fmt.pct(diff)}</span>` : ''}</span>${ui.amt(pr.amount)}</div>`;
        })}
      </div>`) : '';

      const payments = c.payments.slice(0, 12);
      const paymentList = ui.section('Letzte Zahlungen', payments.length
        ? html`<div class="list">${payments.map((t) => ui.row({ go: 'umsatz/' + t.id, cls: 'compact plain', title: F.long(t.date), sub: null, end: ui.amt(t.amount), chevron: true }))}</div>`
        : ui.empty('receipt', 'Noch keine Zahlungen', c.custom ? 'Zahlungen erscheinen, sobald sie gebucht sind.' : 'Für diesen Vertrag liegen noch keine Buchungen vor.'));

      const reminder = !cancelled && c.cancel.possible ? html`<div class="list" style="margin-top:12px">
        <label class="row setting">
          <span class="row-icon" style="background:var(--accent)">${icon('bell', 18)}</span>
          <span class="row-main"><span class="row-title">An Kündigungsfrist erinnern</span><span class="row-sub">${c.cancel.deadline ? `7 Tage vor dem ${F.dmy(c.cancel.deadline)}` : 'Vor der nächsten Verlängerung'}</span></span>
          <input type="checkbox" class="switch" data-action="toggle-reminder" data-id="${c.id}" ${S.state.reminders[c.id] ? raw('checked') : ''} aria-label="An Kündigungsfrist erinnern">
        </label></div>` : '';

      const details = ui.section('Details', html`<div class="list">${ui.kv([
        ['Nächste Zahlung', c.next ? `${F.WDS[c.next.getDay()]}, ${F.dmy(c.next)}` : '–'],
        ['Betrag', html`<span class="amt">${eur(c.amount)}</span> ${S.intervalLabel(c)}`],
        ['Kosten pro Jahr', html`<span class="amt">${eur(c.yearly)}</span>`],
        ['Konto', acc ? `${C.bank(acc.bankId).short} · ${acc.name}` : '–'],
        ['Zahlungsart', METHOD[c.method] || 'SEPA-Lastschrift'],
        ['Kunde seit', F.month(c.since.slice(0, 7))],
        ['Kündigungsfrist', c.cancel.label || '–'],
        c.cancel.possible && !cancelled ? ['Frühestens kündbar zum', F.dmy(c.cancel.end)] : null,
        c.cancel.deadline && !cancelled ? ['Kündigen bis', F.dmy(c.cancel.deadline)] : null,
        c.customerNo ? ['Kundennummer', c.customerNo, 'mono'] : null,
        c.creditorId ? ['Gläubiger-ID', c.creditorId, 'mono'] : null,
        c.mandateRef ? ['Mandatsreferenz', c.mandateRef, 'mono'] : null,
      ])}</div>`);

      const body = html`
        <div class="detail-head">
          ${ui.contractAvatar(c, 'lg')}
          <div class="name">${c.provider}</div>
          <div class="sub">${c.product}</div>
          <div class="detail-amount amt prop" style="margin-top:6px">${eur(c.amount)}</div>
          <div class="sub">${S.intervalLabel(c)} · ${C.cat(c.category).name}</div>
          <div class="detail-badges">${badges}</div>
        </div>
        <div class="stack-12">${callouts}${actions}</div>
        ${reminder}
        ${details}
        ${timeline}
        ${paymentList}
        ${c.custom ? html`<div class="section"><button type="button" class="btn danger" data-action="remove-contract" data-id="${c.id}">${icon('trash', 20)}Vertrag löschen</button></div>` : ''}`;
      return { title: c.provider, large: false, body };
    },
  };

  FK.actions['toggle-reminder'] = (el) => {
    const c = S.contract(el.dataset.id);
    const on = !S.state.reminders[c.id];
    S.act.toggleReminder(c.id);
    if (on) {
      const when = c.cancel.deadline ? D.addDays(c.cancel.deadline, -7) : D.addDays(c.cancel.end, -30);
      FK.toast(`Erinnerung am ${F.dm(when)} eingerichtet`, { icon: 'bell', tone: 'info' });
    } else FK.toast('Erinnerung entfernt', { icon: 'bell', tone: 'info' });
  };

  FK.actions['undo-cancel'] = async (el) => {
    const c = S.contract(el.dataset.id);
    const ok = await ui.confirm({ title: 'Kündigung zurückziehen?', text: `Der Vertrag mit ${c.provider} läuft dann normal weiter. (Demo: Es wird nichts verschickt.)`, confirm: 'Zurückziehen', icon: 'refresh' });
    if (!ok) return;
    S.act.undoCancel(c.id);
    FK.toast('Kündigung zurückgezogen', { icon: 'refresh', tone: 'info' });
  };

  FK.actions['remove-contract'] = async (el) => {
    const c = S.contract(el.dataset.id);
    const ok = await ui.confirm({ title: 'Vertrag löschen?', text: `„${c.provider}“ wird aus deiner Vertragsübersicht entfernt.`, confirm: 'Löschen', destructive: true, icon: 'trash' });
    if (!ok) return;
    FK.nav.back();
    setTimeout(() => {
      S.act.removeContract(c.id);
      FK.toast('Vertrag gelöscht', { icon: 'trash', tone: 'info' });
    }, 480);
  };

  /* ---------- Kündigungsservice (4 Schritte) ---------- */
  const REASONS = ['', 'Zu teuer', 'Nutze ich nicht mehr', 'Wechsel zu einem anderen Anbieter', 'Umzug', 'Sonstiges'];

  FK.actions['cancel-contract'] = (el) => {
    const c = S.contract(el.dataset.id);
    if (!c) return;
    const u = FK.config.user;
    const st = {
      step: 1, when: 'next', date: '', reason: '',
      name: `${u.firstName} ${u.lastName}`, street: u.street, city: `${u.zip} ${u.city}`,
      customerNo: c.customerNo || '', email: u.email,
    };
    const earliest = c.cancel.end;
    const endDate = () => (st.when === 'date' && st.date ? D.parse(st.date) : earliest);
    const steps = (n) => html`<div class="steps" aria-label="Schritt ${n} von 3">${[1, 2, 3].map((i) => html`<span class="${i <= n ? 'on' : ''}"></span>`)}</div>`;

    const sheet = FK.sheet.open({ title: `${c.provider} kündigen`, large: true });

    function letter() {
      const today = S.today();
      const sepa = c.method === 'sepa';
      const end = endDate();
      return html`<div class="letter">
        <div class="from">${st.name} · ${st.street} · ${st.city}</div>
        <p>${c.provider}<br>Kundenservice</p>
        <p class="right">${FK.config.user.city}, ${F.dmy(today)}</p>
        <p class="subject">Kündigung ${c.product}${st.customerNo ? html`<br>Kunden-/Vertragsnummer: ${st.customerNo}` : ''}</p>
        <p>Sehr geehrte Damen und Herren,</p>
        <p>hiermit kündige ich den oben genannten Vertrag ${st.when === 'date' && st.date ? html`zum <b>${F.dmy(end)}</b>, hilfsweise zum nächstmöglichen Zeitpunkt` : html`fristgerecht zum nächstmöglichen Zeitpunkt. Nach meiner Berechnung ist das der <b>${F.dmy(end)}</b>`}.</p>
        <p>Bitte bestätigen Sie mir den Eingang dieser Kündigung und das Vertragsende schriftlich${st.email ? html` an ${st.email}` : ''}.</p>
        ${sepa ? html`<p>Die erteilte Einzugsermächtigung (SEPA-Lastschriftmandat) widerrufe ich zum Vertragsende.</p>` : ''}
        ${st.reason ? html`<p>Grund der Kündigung: ${st.reason}.</p>` : ''}
        <p>Mit freundlichen Grüßen<br>${st.name}</p>
      </div>`;
    }

    function step1() {
      sheet.set(html`${steps(1)}
        <div class="sheet-hero">${ui.contractAvatar(c, 'lg')}<h3>Zu wann möchtest du kündigen?</h3></div>
        <div class="form" role="radiogroup" aria-label="Kündigungszeitpunkt">
          <button type="button" class="radio-row" role="radio" data-when="next" aria-checked="${String(st.when === 'next')}"><span><span class="row-title">Nächstmöglicher Termin</span><span class="row-sub">${F.long(earliest)}</span></span>${icon('check', 20, 'tick')}</button>
          <button type="button" class="radio-row" role="radio" data-when="date" aria-checked="${String(st.when === 'date')}"><span><span class="row-title">Wunschtermin</span><span class="row-sub">Nicht früher als ${F.dmy(earliest)}</span></span>${icon('check', 20, 'tick')}</button>
        </div>
        <div class="form" style="margin-top:12px" ${st.when === 'date' ? '' : raw('hidden')} data-datebox>
          <div class="field"><label for="cancel-date">Datum</label><input id="cancel-date" type="date" min="${D.ymd(earliest)}" value="${st.date || D.ymd(earliest)}"></div>
        </div>
        <div class="form-label">Grund (optional)</div>
        <div class="form"><div class="field"><label for="cancel-reason">Grund</label>
          <select id="cancel-reason">${REASONS.map((r) => html`<option value="${r}" ${r === st.reason ? raw('selected') : ''}>${r || 'Keine Angabe'}</option>`)}</select></div></div>
        <p class="footnote">Der Kündigungstermin wird aus der Kündigungsfrist „${c.cancel.label}“ berechnet.</p>`,
      html`<button type="button" class="btn" data-next>Weiter</button>`);
      sheet.body.querySelectorAll('[data-when]').forEach((b) => b.addEventListener('click', () => {
        st.when = b.dataset.when;
        if (st.when === 'date' && !st.date) st.date = D.ymd(earliest);
        sheet.body.querySelectorAll('[data-when]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        sheet.body.querySelector('[data-datebox]').hidden = st.when !== 'date';
      }));
      sheet.body.querySelector('#cancel-date').addEventListener('change', (e) => {
        const v = e.target.value;
        st.date = v && v >= D.ymd(earliest) ? v : D.ymd(earliest);
        e.target.value = st.date;
      });
      sheet.body.querySelector('#cancel-reason').addEventListener('change', (e) => { st.reason = e.target.value; });
      sheet.foot.querySelector('[data-next]').addEventListener('click', step2);
    }

    function step2() {
      const f = (id, label, key, type, ac) => html`<div class="field col"><label for="${id}">${label}</label><input id="${id}" type="${type || 'text'}" value="${st[key]}" data-key="${key}"${ac ? raw(` autocomplete="${ac}"`) : ''}></div>`;
      sheet.set(html`${steps(2)}
        <p class="sheet-lead">Diese Angaben stehen im Kündigungsschreiben. Prüfe sie kurz.</p>
        <div class="form">
          ${f('c-name', 'Name', 'name', 'text', 'name')}
          ${f('c-street', 'Straße und Hausnummer', 'street', 'text', 'street-address')}
          ${f('c-city', 'PLZ und Ort', 'city', 'text', 'postal-code')}
        </div>
        <div class="form">
          ${f('c-no', 'Kunden- oder Vertragsnummer', 'customerNo')}
          ${f('c-mail', 'E-Mail für die Bestätigung', 'email', 'email', 'email')}
        </div>`,
      html`<button type="button" class="btn" data-next>Vorschau ansehen</button><button type="button" class="btn plain" data-prev>Zurück</button>`);
      sheet.body.querySelectorAll('input[data-key]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.key] = i.value; }));
      sheet.foot.querySelector('[data-next]').addEventListener('click', () => {
        if (!st.name.trim()) { sheet.body.querySelector('#c-name').focus(); FK.toast('Bitte gib deinen Namen an', { icon: 'alert-circle', tone: 'info' }); return; }
        step3();
      });
      sheet.foot.querySelector('[data-prev]').addEventListener('click', step1);
    }

    function step3() {
      sheet.set(html`${steps(3)}
        <p class="sheet-lead">So sieht deine Kündigung aus.</p>
        ${letter()}
        <p class="footnote">Demo: Beim Absenden wird nichts verschickt. In einer echten App ginge das Schreiben per E-Mail oder Fax an ${c.provider}.</p>`,
      html`<button type="button" class="btn" data-send>${icon('send', 20)}Kündigung absenden</button><button type="button" class="btn plain" data-prev>Zurück</button>`);
      sheet.foot.querySelector('[data-prev]').addEventListener('click', step2);
      sheet.foot.querySelector('[data-send]').addEventListener('click', send);
    }

    function send() {
      const end = endDate();
      sheet.set(html`<div class="progress-steps" aria-live="polite">
        <div data-s="1" class="on"><span class="st">${icon('refresh', 15)}</span>Schreiben wird erstellt</div>
        <div data-s="2"><span class="st">${icon('refresh', 15)}</span>An ${c.provider} senden</div>
        <div data-s="3"><span class="st">${icon('refresh', 15)}</span>Erinnerung einrichten</div>
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
        S.act.cancelContract(c.id, { endDate: D.ymd(end), requestedAt: D.ymd(S.today()), reason: st.reason });
        sheet.set(html`<div class="success">
          <span class="ring">${icon('check', 42)}</span>
          <h3>Kündigung verschickt</h3>
          <p>${c.provider} endet zum <b>${F.long(end)}</b>. Danach sparst du <b class="amt">${eur(c.yearly)}</b> im Jahr.</p>
          <p class="footnote" style="margin:0">Demo-Modus: Es wurde nichts verschickt.</p>
        </div>`, html`<button type="button" class="btn" data-sheet-close>Fertig</button>`);
      }, 2100);
    }

    step1();
  };

  /* ---------- Tarifvergleich ---------- */
  const OFFERS = {
    strom: [['Grünwerk Strom', 'Ökostrom · 12 Monate Preisgarantie', 68.5], ['Volta Öko', 'Ökostrom · monatlich kündbar', 71.2], ['Rheinstrom Basis', 'Dein Anbieter · günstigerer Tarif', 76]],
    kfz: [['Kfz-Direkt Basis', 'Haftpflicht + Teilkasko · SB 150 €', 316], ['Autoschutz 24', 'Haftpflicht + Teilkasko · SB 150 €', 338.4], ['Mobil Plus', 'inkl. Schutzbrief', 361]],
    mobilfunk: [['Funkwerk M', '20 GB · 5G · monatlich kündbar', 17.95], ['Netzfrei 25', '25 GB · 5G · 24 Monate', 19.99], ['simfix Allnet', '15 GB · LTE · monatlich kündbar', 12.49]],
  };

  FK.actions.compare = (el) => {
    const c = S.contract(el.dataset.id);
    if (!c) return;
    const list = OFFERS[c.id] || [
      [`${c.provider} Spar-Tarif`, 'Gleicher Anbieter · kleinere Leistung', FK.fmt.round2(c.amount * 0.82)],
      ['Vergleichsangebot A', 'Ähnliche Leistung', FK.fmt.round2(c.amount * 0.9)],
      ['Vergleichsangebot B', 'Ähnliche Leistung · Neukundenbonus', FK.fmt.round2(c.amount * 0.95)],
    ];
    const months = FK.data.intervalMonths(c);
    const offers = list.map(([n, d, p]) => ({ n, d, p, save: (c.amount - p) * (12 / months) })).sort((a, b) => b.save - a.save);
    const sheet = FK.sheet.open({
      title: 'Tarife vergleichen',
      body: html`<div class="sheet-hero">${ui.contractAvatar(c, 'lg')}<h3>${c.provider}: ${eur(c.amount)} ${S.intervalLabel(c)}</h3><p class="sheet-lead" style="margin:0">${c.product}</p></div>
        <div class="form">${offers.map((o, i) => html`<div class="offer">
          <span class="n">${o.n}${i === 0 && o.save > 0 ? html` ${ui.badge('Bester Preis', 'pos')}` : ''}</span><span class="p amt">${eur(o.p)}</span>
          <span class="d">${o.d}</span><span class="s amt ${o.save > 0 ? 'pos' : ''}">${o.save > 0 ? `spart ${eur(o.save, { decimals: 0 })}/Jahr` : 'teurer'}</span>
        </div>`)}</div>
        <p class="footnote">Beispielangebote für diese Demo. Preise ${months === 12 ? 'pro Jahr' : months === 3 ? 'pro Quartal' : 'pro Monat'}.</p>`,
      foot: html`<button type="button" class="btn" data-switch>Zum günstigsten Angebot</button>`,
    });
    sheet.foot.querySelector('[data-switch]').addEventListener('click', () => {
      sheet.close();
      FK.toast('Demo: Hier ginge es zum Anbieter', { icon: 'info', tone: 'info' });
    });
  };

  /* ---------- Vertrag manuell hinzufügen ---------- */
  FK.actions['add-contract'] = () => {
    const today = S.today();
    const sheet = FK.sheet.open({
      title: 'Vertrag hinzufügen',
      large: true,
      body: html`<p class="sheet-lead">Für Verträge, die nicht automatisch erkannt wurden, zum Beispiel Barzahlungen oder Konten ohne Anbindung.</p>
        <div class="form">
          <div class="field"><label for="nc-provider">Anbieter</label><input id="nc-provider" placeholder="z. B. Zeitungsabo" autocomplete="off" required></div>
          <div class="field"><label for="nc-product">Tarif</label><input id="nc-product" placeholder="optional" autocomplete="off"></div>
        </div>
        <div class="form">
          <div class="field"><label for="nc-amount">Betrag in €</label><input id="nc-amount" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
          <div class="field"><label for="nc-interval">Rhythmus</label><select id="nc-interval"><option value="monthly">monatlich</option><option value="quarterly">vierteljährlich</option><option value="yearly">jährlich</option></select></div>
          <div class="field"><label for="nc-date">Nächste Zahlung</label><input id="nc-date" type="date" min="${D.ymd(D.addDays(today, 1))}" value="${D.ymd(D.addDays(today, 7))}"></div>
        </div>
        <div class="form">
          <div class="field"><label for="nc-group">Bereich</label><select id="nc-group">${C.contractGroups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>
          <div class="field"><label for="nc-account">Konto</label><select id="nc-account">${S.accounts().filter((a) => a.type === 'giro' || a.type === 'credit').map((a) => html`<option value="${a.id}">${C.bank(a.bankId).short} · ${a.name}</option>`)}</select></div>
        </div>`,
      foot: html`<button type="button" class="btn" data-save>Speichern</button>`,
    });
    const $ = (s) => sheet.body.querySelector(s);
    sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
      const provider = $('#nc-provider').value.trim();
      const amount = parseFloat($('#nc-amount').value.replace(/\./g, '').replace(',', '.'));
      const dateStr = $('#nc-date').value;
      if (!provider) { $('#nc-provider').focus(); FK.toast('Bitte gib einen Anbieter an', { icon: 'alert-circle', tone: 'info' }); return; }
      if (!(amount > 0)) { $('#nc-amount').focus(); FK.toast('Bitte gib einen Betrag an', { icon: 'alert-circle', tone: 'info' }); return; }
      if (!dateStr || dateStr <= D.ymd(today)) { $('#nc-date').focus(); FK.toast('Die nächste Zahlung muss in der Zukunft liegen', { icon: 'alert-circle', tone: 'info' }); return; }
      const d = D.parse(dateStr);
      const interval = $('#nc-interval').value;
      const group = $('#nc-group').value;
      const m = d.getMonth();
      S.act.addContract({
        id: U.uid('cc'), merchant: null, provider, product: $('#nc-product').value.trim() || 'Eigener Vertrag',
        group, category: GROUP_CAT[group] || 'sonstiges', account: $('#nc-account').value,
        interval, day: d.getDate(), months: interval === 'quarterly' ? [m, (m + 3) % 12, (m + 6) % 12, (m + 9) % 12] : [m],
        amount: FK.fmt.round2(amount), since: dateStr, method: $('#nc-account').value === 'visa' ? 'credit' : 'sepa',
      });
      sheet.close();
      FK.toast(`${provider} hinzugefügt`);
    });
  };
})(window.FK);
