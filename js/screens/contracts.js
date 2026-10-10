/* Finanzkompass – Verträge: aus wiederkehrenden Abbuchungen erkannt, Fixkosten, Rücklagen, Kündigungsschreiben */
(function (FK) {
  'use strict';
  const { html, icon, ui, raw } = FK;
  const S = FK.store;
  const D = FK.date;
  const F = FK.dfmt;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;

  const METHOD = { sepa: 'SEPA-Lastschrift', standing: 'Dauerauftrag', card: 'Kartenzahlung', credit: 'Kreditkarte', transfer: 'Überweisung' };
  const GROUP_CAT = { wohnen: 'wohnen', versicherungen: 'versicherungen', kommunikation: 'kommunikation', abos: 'abos', mobilitaet: 'mobilitaet', freizeit: 'freizeit' };

  function contractRow(c) {
    let sub;
    if (c.status === 'cancelled') sub = c.cancelled.endDate ? `Gekündigt zum ${F.dmy(c.cancelled.endDate)}` : 'Gekündigt';
    else if (c.next) sub = `Fällig ${F.due(c.next)}`;
    else sub = c.product;
    const tags = [];
    if (c.status === 'active' && c.change && c.change.recent && c.change.to > c.change.from) tags.push(ui.badge('teurer', 'warn', 'trending-up'));
    else if (c.detected && D.diffDays(c.series.first, S.today()) <= 75 && c.status === 'active') tags.push(ui.badge('neu', 'accent'));
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
      const actions = html`<button type="button" class="gbtn" data-action="add-contract" aria-label="Vertrag hinzufügen">${icon('plus', 22)}</button>`;
      if (!S.hasData() && !S.state.customContracts.length) {
        return {
          title: 'Verträge', actions,
          body: html`${ui.empty('contracts', 'Noch keine Verträge', 'Verträge wie Miete, Handy, Versicherungen oder Streaming erkennt die App automatisch aus wiederkehrenden Abbuchungen.')}
            <div class="stack-8"><button type="button" class="btn" data-action="connect">${icon('plus', 20)}Konto verbinden</button>
            <button type="button" class="btn plain" data-action="add-contract">Vertrag manuell anlegen</button></div>`,
        };
      }
      const sum = S.contractSummary();
      const view = S.ui.contractsView;
      const factor = view === 'yearly' ? 12 : 1;
      const list = S.contracts();
      const active = list.filter((c) => c.status === 'active');
      const groups = C.contractGroups
        .map((g) => Object.assign({}, g, { items: active.filter((c) => c.group === g.id) }))
        .filter((g) => g.items.length);
      const total = sum.monthly || 1;
      const shown = sum.groups.filter((g) => g.monthly > 0);
      const ignoredCount = Object.keys(S.state.ignored).length;

      const summary = active.length ? html`<div class="card">
        <div class="card-title"><span>Fixkosten</span>${ui.seg('contracts-view', [{ value: 'monthly', label: 'Monat' }, { value: 'yearly', label: 'Jahr' }], view, 'Zeitraum')}</div>
        <div class="big-figure amt prop" style="margin-top:6px">${eur(sum.monthly * factor)}</div>
        <div class="fc-sub">${sum.count} ${sum.count === 1 ? 'aktiver Vertrag' : 'aktive Verträge'} · ${view === 'yearly' ? 'pro Jahr' : 'pro Monat'}</div>
        <div class="stackbar" role="img" aria-label="Fixkosten nach Bereich">
          ${shown.map((g) => html`<span style="flex:${g.monthly.toFixed(2)};background:var(--g${g.slot})" title="${g.name}: ${eur(g.monthly * factor)}"></span>`)}
        </div>
        <div class="legend">
          ${shown.map((g) => html`<div class="legend-row"><span class="swatch" style="--c:var(--g${g.slot})"></span><span class="n">${g.name}</span>${ui.amt(g.monthly * factor)}<span class="p">${FK.fmt.pct(g.monthly / total)}</span></div>`)}
        </div>
      </div>` : html`<div class="card">${ui.empty('search', 'Noch keine Verträge erkannt', 'Dafür braucht die App meist Umsätze aus 2–3 Monaten. Importiere ältere Umsätze oder lege Verträge selbst an.')}</div>`;

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

      const groupSections = groups.map((g) => ui.section(g.name, html`<div class="list">${g.items.map(contractRow)}</div>
        <p class="footnote" style="text-align:right;margin-top:6px"><span class="amt">${eur(U.sum(g.items, (c) => c.monthly) * factor)}</span> ${view === 'yearly' ? 'pro Jahr' : 'pro Monat'}</p>`));

      const cancelled = sum.cancelled.length ? ui.section('Gekündigt', html`<div class="list">${sum.cancelled.map(contractRow)}</div>
        <p class="footnote">Nach Vertragsende sparst du <b class="amt">${eur(sum.cancelledYearly)}</b> im Jahr.</p>`) : '';

      const body = html`${summary}${reserve}${groupSections}${cancelled}
        <div class="section stack-8"><button type="button" class="btn tinted" data-action="add-contract">${icon('plus', 20)}Vertrag hinzufügen</button>
        ${ignoredCount ? html`<button type="button" class="btn plain" data-action="restore-contracts">${ignoredCount} ausgeblendete Verträge wieder anzeigen</button>` : ''}
        <p class="footnote" style="text-align:center">Verträge werden aus wiederkehrenden Abbuchungen mit gleichem Empfänger und ähnlichem Betrag erkannt.</p></div>`;
      return { title: 'Verträge', actions, body };
    },
  };

  FK.actions['contracts-view'] = (el) => { S.ui.contractsView = el.dataset.value; FK.nav.refresh(); };
  FK.actions['restore-contracts'] = () => S.act.restoreContracts();

  /* ---------- Vertragsdetails ---------- */
  FK.screens.contract = {
    render(p) {
      const c = S.contract(p.id);
      if (!c) return null;
      const acc = S.account(c.account);
      const cancelled = c.status === 'cancelled';
      const badges = [];
      if (cancelled) badges.push(ui.badge(c.cancelled.endDate ? `Gekündigt zum ${F.dmy(c.cancelled.endDate)}` : 'Gekündigt', 'pos', 'check'));
      else badges.push(ui.badge('Aktiv', 'accent'));
      if (c.change && c.change.recent && c.change.to > c.change.from) badges.push(ui.badge(`+${FK.fmt.pct(c.change.ratio)} seit ${F.monthShort(c.change.since)}`, 'warn', 'trending-up'));
      badges.push(ui.badge(c.custom ? 'Manuell angelegt' : 'Automatisch erkannt'));

      const callouts = [];
      if (cancelled) {
        callouts.push(html`<div class="callout pos">${icon('check-circle', 20)}<span>Als gekündigt markiert am ${F.dmy(c.cancelled.requestedAt)}.${c.cancelled.endDate ? html` Vertragsende: <b>${F.long(c.cancelled.endDate)}</b> – danach sparst du <b class="amt">${eur(c.yearly)}</b> im Jahr.` : ''}</span></div>`);
      } else if (c.change && c.change.recent && c.change.to > c.change.from) {
        const yearly = ((c.change.to - c.change.from) * 12) / S.intervalMonths(c);
        callouts.push(html`<div class="callout warn">${icon('trending-up', 20)}<span><b>Preiserhöhung erkannt.</b> Seit ${F.month(c.change.since)} zahlst du ${eur(c.change.to)} statt ${eur(c.change.from)} – <span class="amt">${eur(yearly)}</span> mehr im Jahr. Bei Preiserhöhungen besteht oft ein Sonderkündigungsrecht.</span></div>`);
      }
      if (c.detected && !cancelled) callouts.push(html`<div class="callout">${icon('sparkles', 20)}<span>Erkannt aus ${c.series.count} Abbuchungen seit ${F.dmy(c.since)}. Ist das kein Vertrag, kannst du ihn ausblenden.</span></div>`);

      const actions = cancelled
        ? html`<button type="button" class="btn tinted" data-action="undo-cancel" data-id="${c.id}">${icon('refresh', 20)}Kündigung zurücknehmen</button>`
        : html`<div class="btn-row"><button type="button" class="btn" data-action="cancel-contract" data-id="${c.id}">${icon('scissors', 20)}Kündigen</button><button type="button" class="btn tinted" data-action="compare" data-id="${c.id}">${icon('sparkles', 20)}Vergleichen</button></div>`;

      const prices = (c.prices || []).slice().reverse();
      const timeline = prices.length > 1 ? ui.section('Preisentwicklung', html`<div class="list timeline">
        ${prices.map((pr, i) => {
          const prev = prices[i + 1];
          const diff = prev ? (pr.amount - prev.amount) / prev.amount : null;
          return html`<div class="tl-row${i === 0 ? ' now' : ''}"><span class="dot"></span><span>${i === 0 ? 'seit ' : 'ab '}${F.month(pr.since)}${diff != null ? html` <span class="muted">· ${diff >= 0 ? '+' : ''}${FK.fmt.pct(diff)}</span>` : ''}</span>${ui.amt(pr.amount)}</div>`;
        })}
      </div>`) : '';

      const payments = c.payments.slice(0, 12);
      const paymentList = ui.section('Letzte Zahlungen', payments.length
        ? html`<div class="list">${payments.map((t) => ui.row({ go: 'umsatz/' + t.id, cls: 'compact plain', title: F.long(t.date), end: ui.amt(t.amount), chevron: true }))}</div>`
        : ui.empty('receipt', 'Noch keine Zahlungen', 'Zahlungen erscheinen, sobald sie auf deinem Konto gebucht sind.'));

      const details = ui.section('Details', html`<div class="list">${ui.kv([
        ['Nächste Zahlung', c.next ? `${F.WDS[c.next.getDay()]}, ${F.dmy(c.next)}${c.detected ? ' (erwartet)' : ''}` : '–'],
        ['Betrag', html`<span class="amt">${eur(c.amount)}</span> ${S.intervalLabel(c)}`],
        ['Kosten pro Jahr', html`<span class="amt">${eur(c.yearly)}</span>`],
        ['Konto', acc ? `${C.bank(acc.bankId).short} · ${acc.name}` : '–'],
        ['Zahlungsart', METHOD[c.method] || 'Abbuchung'],
        [c.detected ? 'Erste Zahlung' : 'Beginn', F.dmy(c.since)],
        ['Kündigungsfrist', c.cancel.label],
        c.creditorId ? ['Gläubiger-ID', c.creditorId, 'mono'] : null,
        c.mandateRef ? ['Mandatsreferenz', c.mandateRef, 'mono'] : null,
        c.detected && c.series.counterparty && c.series.counterparty !== c.provider ? ['Empfänger laut Bank', c.series.counterparty] : null,
      ])}</div>`);

      const body = html`
        <div class="detail-head">
          ${ui.contractAvatar(c, 'lg')}
          <div class="name">${c.provider}</div>
          ${c.product && c.product !== C.cat(c.category).name ? html`<div class="sub">${c.product}</div>` : ''}
          <div class="detail-amount amt prop" style="margin-top:6px">${eur(c.amount)}</div>
          <div class="sub">${S.intervalLabel(c)} · ${C.cat(c.category).name}</div>
          <div class="detail-badges">${badges}</div>
        </div>
        <div class="stack-12">${callouts}${actions}</div>
        ${details}
        ${timeline}
        ${paymentList}
        <div class="section">${c.custom
          ? html`<button type="button" class="btn danger" data-action="remove-contract" data-id="${c.id}">${icon('trash', 20)}Vertrag löschen</button>`
          : html`<button type="button" class="btn plain" data-action="ignore-contract" data-id="${c.id}" style="color:var(--neg)">${icon('eye-off', 20)}Kein Vertrag – ausblenden</button>`}</div>`;
      return { title: c.provider, large: false, body };
    },
  };

  FK.actions['undo-cancel'] = async (el) => {
    const c = S.contract(el.dataset.id);
    const ok = await ui.confirm({ title: 'Kündigung zurücknehmen?', text: `${c.provider} wird wieder als aktiver Vertrag geführt. Hast du die Kündigung schon verschickt, musst du sie beim Anbieter selbst widerrufen.`, confirm: 'Zurücknehmen', icon: 'refresh' });
    if (!ok) return;
    S.act.undoCancel(c.id);
    FK.toast('Wieder als aktiv markiert', { icon: 'refresh', tone: 'info' });
  };

  FK.actions['ignore-contract'] = async (el) => {
    const c = S.contract(el.dataset.id);
    const ok = await ui.confirm({ title: 'Ausblenden?', text: `„${c.provider}“ wird nicht mehr als Vertrag gezählt. Die Umsätze bleiben erhalten.`, confirm: 'Ausblenden', icon: 'eye-off' });
    if (!ok) return;
    FK.nav.back();
    setTimeout(() => { S.act.ignoreContract(c.id); FK.toast('Vertrag ausgeblendet', { icon: 'eye-off', tone: 'info' }); }, 480);
  };

  FK.actions['remove-contract'] = async (el) => {
    const c = S.contract(el.dataset.id);
    const ok = await ui.confirm({ title: 'Vertrag löschen?', text: `„${c.provider}“ wird aus deiner Vertragsübersicht entfernt.`, confirm: 'Löschen', destructive: true, icon: 'trash' });
    if (!ok) return;
    FK.nav.back();
    setTimeout(() => { S.act.removeContract(c.id); FK.toast('Vertrag gelöscht', { icon: 'trash', tone: 'info' }); }, 480);
  };

  /* ---------- Kündigungsschreiben ---------- */
  const REASONS = ['', 'Zu teuer', 'Nutze ich nicht mehr', 'Wechsel zu einem anderen Anbieter', 'Umzug', 'Preiserhöhung (Sonderkündigung)', 'Sonstiges'];

  FK.actions['cancel-contract'] = (el) => {
    const c = S.contract(el.dataset.id);
    if (!c) return;
    const pr = S.state.profile;
    const st = { when: 'next', date: '', reason: c.change && c.change.recent ? 'Preiserhöhung (Sonderkündigung)' : '', name: pr.name, street: pr.street, city: pr.city, email: pr.email, customerNo: c.customerNo || '' };
    const tomorrow = D.ymd(D.addDays(S.today(), 1));
    const estimate = c.cancel.end ? D.ymd(c.cancel.end) : null;
    const steps = (n) => html`<div class="steps" aria-label="Schritt ${n} von 3">${[1, 2, 3].map((i) => html`<span class="${i <= n ? 'on' : ''}"></span>`)}</div>`;
    const sheet = FK.sheet.open({ title: `${c.provider} kündigen`, large: true });

    function letterText() {
      const lines = [];
      lines.push(`${st.name}`, `${st.street}`, `${st.city}`, '', `${c.provider}`, 'Kundenservice', '', `${(st.city || '').replace(/^\d+\s*/, '') || ''}${st.city ? ', ' : ''}${F.dmy(S.today())}`, '');
      lines.push(`Kündigung ${c.product && c.product !== C.cat(c.category).name ? c.product : 'meines Vertrags'}`);
      if (st.customerNo) lines.push(`Kunden-/Vertragsnummer bzw. Mandatsreferenz: ${st.customerNo}`);
      lines.push('', 'Sehr geehrte Damen und Herren,', '');
      if (st.when === 'date' && st.date) lines.push(`hiermit kündige ich den oben genannten Vertrag zum ${F.dmy(st.date)}, hilfsweise zum nächstmöglichen Zeitpunkt.`);
      else lines.push('hiermit kündige ich den oben genannten Vertrag fristgerecht zum nächstmöglichen Zeitpunkt.');
      if (st.reason === 'Preiserhöhung (Sonderkündigung)') lines.push('Ich mache dabei von meinem Sonderkündigungsrecht aufgrund der Preiserhöhung Gebrauch.');
      lines.push('', `Bitte bestätigen Sie mir den Eingang dieser Kündigung und das Vertragsende schriftlich${st.email ? ` an ${st.email}` : ''}.`);
      if (c.method === 'sepa') lines.push('', 'Die erteilte Einzugsermächtigung (SEPA-Lastschriftmandat) widerrufe ich zum Vertragsende.');
      lines.push('', 'Mit freundlichen Grüßen', '', `${st.name}`);
      return lines.join('\n');
    }

    function step1() {
      sheet.set(html`${steps(1)}
        <div class="sheet-hero">${ui.contractAvatar(c, 'lg')}<h3>Zu wann möchtest du kündigen?</h3></div>
        <div class="form" role="radiogroup" aria-label="Kündigungszeitpunkt">
          <button type="button" class="radio-row" role="radio" data-when="next" aria-checked="${String(st.when === 'next')}"><span><span class="row-title">Nächstmöglicher Zeitpunkt</span><span class="row-sub">${estimate ? `voraussichtlich ${F.dmy(estimate)}` : 'ergibt sich aus deinem Vertrag'}</span></span>${icon('check', 20, 'tick')}</button>
          <button type="button" class="radio-row" role="radio" data-when="date" aria-checked="${String(st.when === 'date')}"><span><span class="row-title">Zu einem bestimmten Datum</span><span class="row-sub">hilfsweise zum nächstmöglichen Zeitpunkt</span></span>${icon('check', 20, 'tick')}</button>
        </div>
        <div class="form" style="margin-top:12px" ${st.when === 'date' ? '' : raw('hidden')} data-datebox>
          <div class="field"><label for="cancel-date">Datum</label><input id="cancel-date" type="date" min="${tomorrow}" value="${st.date || estimate || tomorrow}"></div>
        </div>
        <div class="form-label">Grund (optional)</div>
        <div class="form"><div class="field"><label for="cancel-reason">Grund</label>
          <select id="cancel-reason">${REASONS.map((r) => html`<option value="${r}" ${r === st.reason ? raw('selected') : ''}>${r || 'Keine Angabe'}</option>`)}</select></div></div>
        <p class="footnote">Die genaue Kündigungsfrist steht in deinen Vertragsunterlagen. Mit „hilfsweise zum nächstmöglichen Zeitpunkt“ ist die Kündigung auch bei falsch gewähltem Datum wirksam.</p>`,
      html`<button type="button" class="btn" data-next>Weiter</button>`);
      sheet.body.querySelectorAll('[data-when]').forEach((b) => b.addEventListener('click', () => {
        st.when = b.dataset.when;
        if (st.when === 'date' && !st.date) st.date = estimate || tomorrow;
        sheet.body.querySelectorAll('[data-when]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        sheet.body.querySelector('[data-datebox]').hidden = st.when !== 'date';
      }));
      sheet.body.querySelector('#cancel-date').addEventListener('change', (e) => { st.date = e.target.value >= tomorrow ? e.target.value : tomorrow; e.target.value = st.date; });
      sheet.body.querySelector('#cancel-reason').addEventListener('change', (e) => { st.reason = e.target.value; });
      sheet.foot.querySelector('[data-next]').addEventListener('click', step2);
    }

    function step2() {
      const f = (id, label, key, type, ac) => html`<div class="field col"><label for="${id}">${label}</label><input id="${id}" type="${type || 'text'}" value="${st[key]}" data-key="${key}"${ac ? raw(` autocomplete="${ac}"`) : ''}></div>`;
      sheet.set(html`${steps(2)}
        <p class="sheet-lead">Diese Angaben stehen im Kündigungsschreiben. Sie werden nur auf diesem Gerät gespeichert.</p>
        <div class="form">${f('c-name', 'Name', 'name', 'text', 'name')}${f('c-street', 'Straße und Hausnummer', 'street', 'text', 'street-address')}${f('c-city', 'PLZ und Ort', 'city', 'text', 'address-level2')}</div>
        <div class="form">${f('c-no', 'Kunden-/Vertragsnummer', 'customerNo')}${f('c-mail', 'E-Mail für die Bestätigung', 'email', 'email', 'email')}</div>`,
      html`<button type="button" class="btn" data-next>Schreiben erstellen</button><button type="button" class="btn plain" data-prev>Zurück</button>`);
      sheet.body.querySelectorAll('input[data-key]').forEach((i) => i.addEventListener('input', () => { st[i.dataset.key] = i.value; }));
      sheet.foot.querySelector('[data-prev]').addEventListener('click', step1);
      sheet.foot.querySelector('[data-next]').addEventListener('click', () => {
        if (!st.name.trim()) { sheet.body.querySelector('#c-name').focus(); FK.toast('Bitte gib deinen Namen an', { icon: 'alert-circle', tone: 'info' }); return; }
        S.act.setProfile({ name: st.name.trim(), street: st.street.trim(), city: st.city.trim(), email: st.email.trim() });
        step3();
      });
    }

    function step3() {
      const text = letterText();
      const subject = `Kündigung ${c.provider}${st.customerNo ? ` – ${st.customerNo}` : ''}`;
      const mail = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      sheet.set(html`${steps(3)}
        <p class="sheet-lead">Dein Kündigungsschreiben. Verschicke es per E-Mail, über das Kundenkonto des Anbieters oder als Brief.</p>
        <pre class="letter" data-letter tabindex="0">${text}</pre>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn tinted" data-copy>${icon('copy', 20)}Kopieren</button>
          <a class="btn tinted" href="${mail}" data-mail>${icon('mail', 20)}E-Mail</a>
        </div>
        <p class="footnote">Tipp: Kündige nachweisbar, z. B. per E-Mail mit Lesebestätigung, über das Kündigungsformular („Kündigungsbutton“) auf der Website des Anbieters oder per Einschreiben.</p>`,
      html`<button type="button" class="btn" data-mark>${icon('check', 20)}Als gekündigt markieren</button><button type="button" class="btn plain" data-prev>Zurück</button>`);
      sheet.body.querySelector('[data-copy]').addEventListener('click', () => {
        const done = () => FK.toast('Text kopiert', { icon: 'copy' });
        const fallback = () => {
          const range = document.createRange();
          range.selectNodeContents(sheet.body.querySelector('[data-letter]'));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          FK.toast('Text markiert – jetzt kopieren', { icon: 'copy', tone: 'info' });
        };
        try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
      });
      sheet.foot.querySelector('[data-prev]').addEventListener('click', step2);
      sheet.foot.querySelector('[data-mark]').addEventListener('click', step4);
    }

    function step4() {
      const end = st.when === 'date' && st.date ? st.date : estimate || '';
      sheet.set(html`
        <div class="sheet-hero">${ui.contractAvatar(c, 'lg')}<h3>Kündigung vermerken</h3>
          <p class="sheet-lead" style="margin:0">Trage das Vertragsende ein, sobald du die Bestätigung hast. Ab dann rechnet die App nicht mehr mit diesen Zahlungen.</p></div>
        <div class="form"><div class="field"><label for="end-date">Vertragsende</label><input id="end-date" type="date" value="${end}" min="${D.ymd(S.today())}"></div></div>
        <p class="footnote">Ohne Datum wird der Vertrag als gekündigt markiert, erwartete Zahlungen bleiben aber in der Prognose.</p>`,
      html`<button type="button" class="btn" data-save>Speichern</button><button type="button" class="btn plain" data-prev>Zurück</button>`);
      sheet.foot.querySelector('[data-prev]').addEventListener('click', step3);
      sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
        const v = sheet.body.querySelector('#end-date').value;
        S.act.cancelContract(c.id, { endDate: v || null, requestedAt: D.ymd(S.today()), reason: st.reason });
        sheet.set(html`<div class="success"><span class="ring">${icon('check', 42)}</span><h3>Als gekündigt markiert</h3>
          <p>${v ? `${c.provider} endet zum ${F.long(v)}. Danach sparst du ${eur(c.yearly)} im Jahr.` : `${c.provider} ist als gekündigt markiert.`}</p></div>`,
        html`<button type="button" class="btn" data-sheet-close>Fertig</button>`);
      });
    }

    step1();
  };

  /* ---------- Vergleichen ---------- */
  const PORTALS = {
    energie: [['Verivox Strom & Gas', 'https://www.verivox.de/strom/'], ['Check24 Strom', 'https://www.check24.de/strom/']],
    kommunikation: [['Check24 DSL', 'https://www.check24.de/dsl/'], ['Check24 Handytarife', 'https://www.check24.de/handytarife/'], ['Verivox Mobilfunk', 'https://www.verivox.de/handytarife/']],
    versicherungen: [['Check24 Versicherungen', 'https://www.check24.de/versicherungen/'], ['Verivox Versicherungen', 'https://www.verivox.de/versicherungen/']],
    mobilitaet: [['Check24 Kfz-Versicherung', 'https://www.check24.de/kfz-versicherung/']],
  };

  FK.actions.compare = (el) => {
    const c = S.contract(el.dataset.id);
    if (!c) return;
    const portals = PORTALS[c.category] || [];
    FK.sheet.open({
      title: 'Vergleichen',
      body: html`<div class="sheet-hero">${ui.contractAvatar(c, 'lg')}<h3>${c.provider}: ${eur(c.yearly)} im Jahr</h3><p class="sheet-lead" style="margin:0">${eur(c.amount)} ${S.intervalLabel(c)}</p></div>
        ${portals.length ? html`<div class="list">${portals.map(([n, u]) => html`<a class="row compact plain" href="${u}" target="_blank" rel="noopener noreferrer"><span class="row-main"><span class="row-title">${n}</span></span>${icon('arrow-up-right', 18, 'chev')}</a>`)}</div>` : ''}
        <div class="feature-list" style="margin-top:16px">
          <div>${icon('calendar', 20)}<span><b>Frist prüfen</b><span>Laufzeit und Kündigungsfrist stehen in deinen Vertragsunterlagen oder im Kundenkonto.</span></span></div>
          <div>${icon('percent', 20)}<span><b>Beim Anbieter nachfragen</b><span>Mit einem günstigeren Angebot in der Hand gibt es oft einen Bestandskunden-Rabatt.</span></span></div>
          <div>${icon('scissors', 20)}<span><b>Wechseln oder kündigen</b><span>Das Kündigungsschreiben erstellt die App für dich.</span></span></div>
        </div>`,
    });
  };

  /* ---------- Vertrag manuell hinzufügen ---------- */
  FK.actions['add-contract'] = () => {
    const today = S.today();
    const accounts = S.accounts().filter((a) => a.type !== 'depot');
    const sheet = FK.sheet.open({
      title: 'Vertrag hinzufügen',
      large: true,
      body: html`<p class="sheet-lead">Für Verträge, die nicht automatisch erkannt wurden, zum Beispiel jährliche Zahlungen oder Barzahlungen.</p>
        <div class="form">
          <div class="field"><label for="nc-provider">Anbieter</label><input id="nc-provider" placeholder="z. B. Zeitungsabo" autocomplete="off" required></div>
          <div class="field"><label for="nc-product">Tarif</label><input id="nc-product" placeholder="optional" autocomplete="off"></div>
        </div>
        <div class="form">
          <div class="field"><label for="nc-amount">Betrag in €</label><input id="nc-amount" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
          <div class="field"><label for="nc-interval">Rhythmus</label><select id="nc-interval"><option value="monthly">monatlich</option><option value="quarterly">vierteljährlich</option><option value="halfyearly">halbjährlich</option><option value="yearly">jährlich</option></select></div>
          <div class="field"><label for="nc-date">Nächste Zahlung</label><input id="nc-date" type="date" min="${D.ymd(D.addDays(today, 1))}" value="${D.ymd(D.addDays(today, 7))}"></div>
        </div>
        <div class="form">
          <div class="field"><label for="nc-group">Bereich</label><select id="nc-group">${C.contractGroups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></div>
          ${accounts.length ? html`<div class="field"><label for="nc-account">Konto</label><select id="nc-account">${accounts.map((a) => html`<option value="${a.id}">${C.bank(a.bankId).short} · ${a.name}</option>`)}</select></div>` : ''}
        </div>`,
      foot: html`<button type="button" class="btn" data-save>Speichern</button>`,
    });
    const $ = (s) => sheet.body.querySelector(s);
    sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
      const provider = $('#nc-provider').value.trim();
      const amount = FK.importer.parseAmount($('#nc-amount').value);
      const dateStr = $('#nc-date').value;
      if (!provider) { $('#nc-provider').focus(); FK.toast('Bitte gib einen Anbieter an', { icon: 'alert-circle', tone: 'info' }); return; }
      if (!(amount > 0)) { $('#nc-amount').focus(); FK.toast('Bitte gib einen Betrag an', { icon: 'alert-circle', tone: 'info' }); return; }
      if (!dateStr || dateStr <= D.ymd(today)) { $('#nc-date').focus(); FK.toast('Die nächste Zahlung muss in der Zukunft liegen', { icon: 'alert-circle', tone: 'info' }); return; }
      const group = $('#nc-group').value;
      const accSel = $('#nc-account');
      S.act.addContract({
        id: U.uid('cc'), merchant: null, provider, product: $('#nc-product').value.trim() || 'Eigener Vertrag',
        group, category: GROUP_CAT[group] || 'sonstiges', account: accSel ? accSel.value : null,
        interval: $('#nc-interval').value, amount: FK.fmt.round2(amount), since: dateStr, method: 'sepa',
      });
      sheet.close();
      FK.toast(`${provider} hinzugefügt`);
    });
  };
})(window.FK);
