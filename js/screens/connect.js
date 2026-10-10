/* Finanzkompass – Konto verbinden: Bankauswahl, CSV-Import (Sparkasse, Trade Republic, andere Banken) und Live-Verbindung (PSD2) */
(function (FK) {
  'use strict';
  const { html, icon, ui, raw } = FK;
  const S = FK.store;
  const D = FK.date;
  const F = FK.dfmt;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;

  const GUIDE = {
    sparkasse: {
      title: 'Umsätze aus dem Sparkasse Online-Banking',
      steps: [
        'Melde dich im Browser im Online-Banking deiner Sparkasse an.',
        'Öffne die Umsätze deines Girokontos und wähle einen Zeitraum, am besten die letzten 12 Monate.',
        'Wähle „Exportieren“ und das Format „Excel (CSV-CAMT V2)“.',
        'Wähle die heruntergeladene Datei hier aus.',
      ],
      note: 'Die Sparkasse liefert oft nur die letzten 90 Tage. Für eine längere Historie kannst du später weitere Dateien importieren – doppelte Umsätze werden erkannt.',
    },
    traderepublic: {
      title: 'Transaktionsexport von Trade Republic',
      steps: [
        'Öffne Trade Republic in der App oder unter app.traderepublic.com.',
        'Gehe zu Profil → Kontoauszüge → Transaktionsexport.',
        'Wähle den Zeitraum „seit Kontoeröffnung“ und erstelle die Datei.',
        'Wähle die CSV-Datei hier aus.',
      ],
      note: 'Die Datei enthält Verrechnungskonto und Depot. Den Depotwert schätzt die App mit dem letzten Ausführungskurs deiner Käufe und Verkäufe.',
    },
    other: {
      title: 'Umsätze als CSV-Datei',
      steps: [
        'Melde dich im Online-Banking deiner Bank an.',
        'Exportiere die Umsätze deines Kontos als CSV-Datei.',
        'Wähle die Datei hier aus. Erkennt die App die Spalten nicht, ordnest du sie im nächsten Schritt zu.',
      ],
      note: '',
    },
  };

  const defaultName = (bankId) => (bankId === 'traderepublic' ? 'Verrechnungskonto' : 'Girokonto');

  /** Proxy im Docker-Container gefunden? Dann Adresse vorschlagen und Status anzeigen. */
  async function bundledHint(sheet, inputSel) {
    const b = await FK.live.detectBundled();
    const box = sheet.body.querySelector('[data-bundled]');
    const input = sheet.body.querySelector(inputSel);
    if (!b || !box || !input) return;
    if (!input.value) input.value = b.url;
    box.innerHTML = String(b.configured
      ? html`${icon('check-circle', 20)}<span><b>Proxy im Docker-Container gefunden.</b> Trage nur noch das Zugriffstoken aus deiner <code>.env</code> ein.</span>`
      : html`${icon('alert', 20)}<span><b>Proxy gefunden, aber noch nicht eingerichtet.</b> Trage EB_APP_ID und ACCESS_TOKEN in die <code>.env</code> ein, lege den Schlüssel unter <code>secrets/enablebanking.pem</code> ab und starte den Container neu.</span>`);
    box.classList.toggle('warn', !b.configured);
    box.hidden = false;
  }
  FK.bundledHint = bundledHint;
  const steps = (n, total) => html`<div class="steps" aria-label="Schritt ${n} von ${total}">${Array.from({ length: total }, (_, i) => html`<span class="${i < n ? 'on' : ''}"></span>`)}</div>`;

  /**
   * Einstieg: FK.connect({ bankId?, accountId?, method? })
   * accountId: vorhandenes Konto aktualisieren
   */
  FK.connect = function (opts) {
    const o = opts || {};
    const target = o.accountId ? S.account(o.accountId) : null;
    const st = { bankId: o.bankId || (target && target.bankId) || null, accountId: target ? target.id : null };
    const sheet = FK.sheet.open({ title: target ? 'Umsätze aktualisieren' : 'Konto verbinden', large: true });

    function chooseBank() {
      const featured = C.banks.filter((b) => b.featured);
      sheet.set(html`
        <p class="sheet-lead">Wähle deine Bank. Deine Umsätze bleiben auf diesem Gerät gespeichert.</p>
        <div class="form">
          ${featured.map((b) => html`<button type="button" class="radio-row" data-bank="${b.id}">${ui.bankAvatar(b.id, 'sm')}<span><span class="row-title">${b.name}</span><span class="row-sub">${b.id === 'traderepublic' ? 'Verrechnungskonto und Depot' : 'Girokonto'}</span></span>${icon('chevron-right', 18, 'chev')}</button>`)}
        </div>
        <div class="form" style="margin-top:12px">
          <button type="button" class="radio-row" data-bank="other">${ui.bankAvatar('other', 'sm')}<span><span class="row-title">Andere Bank</span><span class="row-sub">CSV-Datei aus dem Online-Banking</span></span>${icon('chevron-right', 18, 'chev')}</button>
        </div>`);
      sheet.body.querySelectorAll('[data-bank]').forEach((b) => b.addEventListener('click', () => {
        st.bankId = b.dataset.bank;
        if (st.bankId === 'other') csvGuide(); else chooseMethod();
      }));
    }

    function chooseMethod() {
      const b = C.bank(st.bankId);
      const liveReady = FK.live.configured();
      sheet.set(html`
        <div class="sheet-hero">${ui.bankAvatar(st.bankId, 'lg')}<h3>${b.name} verbinden</h3></div>
        <div class="stack-12">
          <button type="button" class="option-card" data-method="csv">
            <span class="option-ic">${icon('list', 22)}</span>
            <span class="option-main"><span class="option-title">CSV-Datei importieren ${ui.badge('Empfohlen', 'pos')}</span>
              <span class="option-text">Sofort startklar, ohne Zusatzdienst. Du exportierst die Umsätze im ${st.bankId === 'traderepublic' ? 'Trade-Republic-Profil' : 'Online-Banking'} und lädst sie hier hoch.</span></span>
          </button>
          <button type="button" class="option-card" data-method="live">
            <span class="option-ic">${icon('refresh', 22)}</span>
            <span class="option-main"><span class="option-title">Live verbinden (PSD2) ${liveReady ? ui.badge('Bereit', 'accent') : ui.badge('Einrichtung nötig', 'warn')}</span>
              <span class="option-text">Automatische Aktualisierung über den Kontoinformationsdienst Enable Banking. Du meldest dich direkt bei ${st.bankId === 'traderepublic' ? 'Trade Republic' : 'deiner Sparkasse'} an.</span></span>
          </button>
        </div>`,
      html`<button type="button" class="btn plain" data-back>Andere Bank wählen</button>`);
      sheet.body.querySelector('[data-method="csv"]').addEventListener('click', csvGuide);
      sheet.body.querySelector('[data-method="live"]').addEventListener('click', () => (FK.live.configured() ? liveList() : liveSetup()));
      sheet.foot.querySelector('[data-back]').addEventListener('click', chooseBank);
    }

    /* ---------- CSV ---------- */
    function csvGuide() {
      const g = GUIDE[st.bankId] || GUIDE.other;
      sheet.set(html`
        ${steps(1, 3)}
        <div class="sheet-hero" style="padding-bottom:10px">${ui.bankAvatar(st.bankId || 'other', 'lg')}<h3>${g.title}</h3></div>
        <ol class="guide">${g.steps.map((s) => html`<li>${s}</li>`)}</ol>
        <label class="dropzone" for="csv-file">
          ${icon('arrow-up', 26)}<span class="dz-title">CSV-Datei auswählen</span><span class="dz-sub">oder hierher ziehen</span>
          <input id="csv-file" type="file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain" class="sr-only">
        </label>
        ${g.note ? html`<p class="footnote">${g.note}</p>` : ''}
        <p class="footnote">${icon('lock', 13, 'inline-ic')} Die Datei wird nur auf diesem Gerät gelesen und nirgendwohin hochgeladen.</p>`,
      !target && st.bankId !== 'other' ? html`<button type="button" class="btn plain" data-back>Zurück</button>` : null);
      const input = sheet.body.querySelector('#csv-file');
      const zone = sheet.body.querySelector('.dropzone');
      input.addEventListener('change', () => { if (input.files[0]) readFile(input.files[0]); });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('over');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
      });
      const back = sheet.foot.querySelector('[data-back]');
      if (back) back.addEventListener('click', chooseMethod);
    }

    async function readFile(file) {
      sheet.set(html`<div class="progress-steps"><div class="on"><span class="st">${icon('refresh', 15)}</span>${file.name} wird gelesen</div></div>`);
      try {
        const res = await FK.importer.analyze(file);
        if (res.needsMapping) return mapping(res, file.name);
        review(res, file.name);
      } catch (e) {
        failed(e.message || 'Die Datei konnte nicht gelesen werden.');
      }
    }

    function failed(msg) {
      sheet.set(html`<div class="success"><span class="ring err">${icon('alert', 38)}</span><h3>Import nicht möglich</h3><p>${msg}</p></div>`,
        html`<button type="button" class="btn" data-retry>Andere Datei wählen</button>`);
      sheet.foot.querySelector('[data-retry]').addEventListener('click', csvGuide);
    }

    function mapping(res, fileName) {
      const opts = (sel) => html`<option value="-1">–</option>${res.header.map((h, i) => html`<option value="${i}" ${sel === i ? raw('selected') : ''}>${h || `Spalte ${i + 1}`}</option>`)}`;
      const m = res.map || {};
      sheet.set(html`
        ${steps(2, 3)}
        <p class="sheet-lead">Ordne die Spalten aus „${fileName}“ zu. Datum und Betrag sind Pflicht.</p>
        <div class="form">
          ${['date', 'amount', 'counterparty', 'purpose'].map((f) => html`<div class="field"><label for="map-${f}">${FK.importer.FIELD_LABEL[f]}</label><select id="map-${f}" data-field="${f}">${opts(m[f])}</select></div>`)}
        </div>
        <div class="form-label">Vorschau</div>
        <div class="table-scroll"><table class="preview">
          <thead><tr>${res.header.map((h) => html`<th>${h}</th>`)}</tr></thead>
          <tbody>${res.sample.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody>
        </table></div>`,
      html`<button type="button" class="btn" data-next>Weiter</button><button type="button" class="btn plain" data-back>Andere Datei</button>`);
      sheet.foot.querySelector('[data-back]').addEventListener('click', csvGuide);
      sheet.foot.querySelector('[data-next]').addEventListener('click', () => {
        const map = {};
        sheet.body.querySelectorAll('[data-field]').forEach((s) => { const v = Number(s.value); if (v >= 0) map[s.dataset.field] = v; });
        if (map.date == null || map.amount == null) { FK.toast('Bitte Datum und Betrag zuordnen', { icon: 'alert-circle', tone: 'info' }); return; }
        const out = FK.importer.mapGeneric(res.rows, res.headerIndex, map, 'generic');
        if (!out.txs.length) { FK.toast('Mit dieser Zuordnung wurden keine Umsätze gefunden', { icon: 'alert-circle', tone: 'info' }); return; }
        review(out, fileName);
      });
    }

    function review(res, fileName) {
      if (!res.txs.length && !(res.holdings && res.holdings.length)) return failed('In der Datei wurden keine Umsätze gefunden. Prüfe, ob du das richtige Format exportiert hast.');
      const bankId = res.bankId || st.bankId || 'other';
      if (st.bankId && st.bankId !== bankId && st.bankId !== 'other' && res.format !== 'generic') {
        FK.toast(`Die Datei sieht nach ${C.bank(bankId).name} aus`, { icon: 'info', tone: 'info' });
      }
      st.bankId = bankId;
      const dates = res.txs.map((t) => t.date).sort();
      const first = dates[0];
      const last = dates[dates.length - 1];
      const existing = target || (res.accountIban ? S.state.accounts.find((a) => FK.categorize.normIban(a.iban) === res.accountIban && a.type !== 'depot') : null)
        || (bankId === 'traderepublic' ? S.state.accounts.find((a) => a.bankId === 'traderepublic' && a.type === 'giro' && a.source !== 'live') : null);
      // Vorschlag für den Kontostand
      let suggested = null;
      let hint = '';
      let balDate = D.ymd(new Date());
      if (res.balance && !isNaN(res.balance.amount)) {
        suggested = FK.fmt.round2(res.balance.amount);
        if (res.balance.date && res.balance.date < balDate) balDate = res.balance.date;
        hint = `Aus der Datei übernommen${res.balance.date ? ` (Stand ${F.dmy(res.balance.date)})` : ''}. Vergleiche ihn mit deinem Online-Banking.`;
      } else if (existing) {
        const known = new Set((S.state.tx[existing.id] || []).map((t) => t.id));
        const fresh = FK.importer.assignIds(existing.id, res.txs.map((t) => Object.assign({}, t))).filter((t) => !known.has(t.id) && !t.pending && t.date > (existing.balanceDate || ''));
        suggested = FK.fmt.round2(S.balance(existing.id) + U.sum(fresh, (t) => t.amount));
        hint = 'Berechnet aus dem bisherigen Kontostand und den neuen Umsätzen. Vergleiche ihn mit deinem Online-Banking.';
      } else if (bankId === 'traderepublic') {
        suggested = FK.fmt.round2(U.sum(res.txs.filter((t) => !t.pending), (t) => t.amount));
        hint = 'Summe aller Buchungen der Datei. Stimmt nur, wenn der Export seit Kontoeröffnung reicht – vergleiche mit der App.';
      }
      const fmtLabel = { sparkasse: 'Sparkasse CSV-CAMT', traderepublic: 'Trade Republic Transaktionsexport', generic: 'CSV-Datei' }[res.format] || 'CSV-Datei';
      const h = res.holdings || [];
      const invested = U.sum(h, (p) => p.cost);
      const value = U.sum(h, (p) => p.value);

      sheet.set(html`
        ${steps(3, 3)}
        <div class="card import-summary">
          <div class="card-title"><span>${fmtLabel}</span>${ui.badge(fileName.length > 22 ? fileName.slice(0, 20) + '…' : fileName)}</div>
          <div class="big-figure" style="font-size:30px">${res.txs.length} Umsätze</div>
          <div class="fc-sub">${first ? `${F.dmy(first)} – ${F.dmy(last)}` : 'keine Kontobewegungen'}</div>
          ${h.length ? html`<div class="fc-sub" style="margin-top:6px">Depot: ${h.length} ${h.length === 1 ? 'Position' : 'Positionen'} · investiert <span class="amt">${eur(invested, { decimals: 0 })}</span> · Wert ca. <span class="amt">${eur(value, { decimals: 0 })}</span></div>` : ''}
        </div>
        ${res.warnings && res.warnings.length ? html`<div class="callout warn" style="margin-top:12px">${icon('alert', 20)}<span>${res.warnings.join(' ')}</span></div>` : ''}
        ${existing ? html`<div class="callout" style="margin-top:12px">${icon('refresh', 20)}<span>Wird zu <b>${C.bank(existing.bankId).short} ${existing.name}</b> hinzugefügt. Bereits vorhandene Umsätze werden übersprungen.</span></div>` : ''}
        <div class="form-label">Konto</div>
        <div class="form">
          <div class="field"><label for="imp-name">Name</label><input id="imp-name" value="${existing ? existing.name : defaultName(bankId)}" autocomplete="off"></div>
          <div class="field"><label for="imp-iban">IBAN</label><input id="imp-iban" value="${res.accountIban || (existing && existing.iban) || ''}" placeholder="optional" autocomplete="off" autocapitalize="characters"></div>
        </div>
        <div class="form-label">Aktueller Kontostand</div>
        <div class="form">
          <div class="field"><label for="imp-balance">Kontostand in €</label><input id="imp-balance" inputmode="decimal" placeholder="z. B. 1.234,56" value="${suggested != null ? String(suggested.toFixed(2)).replace('.', ',') : ''}" autocomplete="off"></div>
        </div>
        <p class="footnote">${hint || 'Trage den Kontostand ein, den dein Online-Banking heute anzeigt. Daraus berechnet die App den Verlauf.'}</p>
        ${h.length ? html`<div class="list" style="margin-top:12px"><label class="row setting"><span class="row-main"><span class="row-title">Depot als eigenes Konto anzeigen</span><span class="row-sub">${h.length} Positionen aus deinen Käufen und Verkäufen</span></span><input type="checkbox" class="switch" id="imp-depot" checked aria-label="Depot als eigenes Konto anzeigen"></label></div>` : ''}`,
      html`<button type="button" class="btn" data-import>Importieren</button><button type="button" class="btn plain" data-back>Andere Datei</button>`);
      sheet.foot.querySelector('[data-back]').addEventListener('click', csvGuide);
      sheet.foot.querySelector('[data-import]').addEventListener('click', () => {
        const name = sheet.body.querySelector('#imp-name').value.trim() || defaultName(bankId);
        const iban = sheet.body.querySelector('#imp-iban').value.replace(/\s+/g, '').toUpperCase();
        const balRaw = sheet.body.querySelector('#imp-balance').value;
        const balance = FK.importer.parseAmount(balRaw);
        if (res.txs.length && isNaN(balance)) {
          sheet.body.querySelector('#imp-balance').focus();
          FK.toast('Bitte gib den aktuellen Kontostand ein', { icon: 'alert-circle', tone: 'info' });
          return;
        }
        let r = { accountId: existing && existing.id, added: 0, duplicates: 0 };
        if (res.txs.length) {
          r = S.act.importAccount({ accountId: existing && existing.id, bankId, name, type: 'giro', iban, balance, balanceDate: balDate, txs: res.txs, source: 'csv' });
        }
        const depotToggle = sheet.body.querySelector('#imp-depot');
        let depotId = null;
        if (h.length && (!depotToggle || depotToggle.checked)) {
          const prev = S.state.accounts.find((a) => a.bankId === bankId && a.type === 'depot');
          depotId = S.act.importAccount({ accountId: prev && prev.id, bankId, name: 'Depot', type: 'depot', balance: FK.fmt.round2(value), balanceDate: D.ymd(new Date()), holdings: h, txs: [], source: 'csv' }).accountId;
        }
        done(r, depotId);
      });
    }

    function done(r, depotId) {
      const acc = S.account(r.accountId || depotId);
      const contracts = S.contracts().filter((c) => c.detected && (c.account === r.accountId)).length;
      const salary = S.data.series.some((s) => s.accountId === r.accountId && s.kind === 'income' && s.amount >= 300);
      sheet.set(html`<div class="success">
        <span class="ring">${icon('check', 42)}</span>
        <h3>${acc ? `${C.bank(acc.bankId).short} ist verbunden` : 'Import abgeschlossen'}</h3>
        <p>${r.added} ${r.added === 1 ? 'Umsatz' : 'Umsätze'} importiert${r.duplicates ? `, ${r.duplicates} waren schon vorhanden` : ''}.${depotId ? ' Depot angelegt.' : ''}</p>
        ${r.accountId && (contracts || salary || acc.bankId !== 'traderepublic') ? html`<p>${contracts ? `${contracts} ${contracts === 1 ? 'Vertrag' : 'Verträge'} erkannt` : 'Noch keine Verträge erkannt – dafür braucht es meist 2–3 Monate Umsätze'}${salary ? ' · Gehalt erkannt' : ''}.</p>` : ''}
      </div>`, html`<button type="button" class="btn" data-open>Konto ansehen</button><button type="button" class="btn plain" data-sheet-close>Fertig</button>`);
      sheet.foot.querySelector('[data-open]').addEventListener('click', () => {
        sheet.close();
        FK.nav.go('/konten/konto/' + (r.accountId || depotId));
      });
    }

    /* ---------- Live (PSD2) ---------- */
    function liveSetup() {
      const l = S.state.live;
      sheet.set(html`
        <div class="sheet-hero">${ui.bankAvatar(st.bankId || 'other', 'lg')}<h3>Live-Verbindung einrichten</h3>
          <p class="sheet-lead" style="margin:0">Für automatische Aktualisierungen nutzt die App den regulierten Kontoinformationsdienst Enable Banking. Er ist für private, nicht-kommerzielle Nutzung mit eigenen Konten kostenlos.</p></div>
        <ol class="guide">
          <li>Konto im Enable Banking Control Panel anlegen und eine Production-App registrieren. Als Redirect-URL trägst du <code>${FK.live.redirectUrl()}</code> ein.</li>
          <li>Deine eigenen Konten im Control Panel verknüpfen, damit die App freigeschaltet wird.</li>
          <li>Den Proxy starten: mit Docker über <code>docker compose --profile live up -d</code> (App-ID, Schlüssel und Zugriffstoken in <code>.env</code>) – oder als kostenloser Cloudflare Worker.</li>
          <li>Proxy-Adresse und Zugriffstoken hier eintragen.</li>
        </ol>
        <p class="footnote">Die ausführliche Anleitung steht in der README und im Ordner <code>server/</code> des Projekts.</p>
        <div class="callout" data-bundled hidden></div>
        <div class="form">
          <div class="field col"><label for="live-url">Proxy-Adresse</label><input id="live-url" type="text" inputmode="url" placeholder="/api oder https://….workers.dev" value="${l.proxyUrl}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
          <div class="field col"><label for="live-token">Zugriffstoken</label><input id="live-token" type="password" placeholder="ACCESS_TOKEN" value="${l.token}" autocomplete="off"></div>
        </div>`,
      html`<button type="button" class="btn" data-save>Speichern und testen</button><button type="button" class="btn plain" data-csv>Stattdessen CSV importieren</button>`);
      sheet.foot.querySelector('[data-csv]').addEventListener('click', csvGuide);
      bundledHint(sheet, '#live-url');
      sheet.foot.querySelector('[data-save]').addEventListener('click', async (e) => {
        const url = sheet.body.querySelector('#live-url').value.trim();
        const token = sheet.body.querySelector('#live-token').value.trim();
        if (!FK.live.validUrl(url)) { FK.toast('Gib die Proxy-Adresse ein, z. B. /api oder https://…', { icon: 'alert-circle', tone: 'info' }); return; }
        if (token.length < 12) { FK.toast('Das Zugriffstoken ist zu kurz', { icon: 'alert-circle', tone: 'info' }); return; }
        S.act.setLive({ proxyUrl: url, token });
        e.target.disabled = true;
        try {
          const list = await FK.live.aspsps();
          FK.toast(`Verbunden · ${list.length} Banken verfügbar`, { icon: 'check' });
          liveList(list);
        } catch (err) {
          e.target.disabled = false;
          FK.toast(err.message, { icon: 'alert', tone: 'info', duration: 5000 });
        }
      });
    }

    async function liveList(preloaded) {
      sheet.set(html`<div class="progress-steps"><div class="on"><span class="st">${icon('refresh', 15)}</span>Banken werden geladen</div></div>`);
      let list = preloaded;
      try {
        if (!list) list = await FK.live.aspsps();
      } catch (e) {
        sheet.set(html`<div class="success"><span class="ring err">${icon('alert', 38)}</span><h3>Keine Verbindung zum Proxy</h3><p>${e.message}</p></div>`,
          html`<button type="button" class="btn" data-setup>Einstellungen prüfen</button><button type="button" class="btn plain" data-csv>CSV importieren</button>`);
        sheet.foot.querySelector('[data-setup]').addEventListener('click', liveSetup);
        sheet.foot.querySelector('[data-csv]').addEventListener('click', csvGuide);
        return;
      }
      const filter = st.bankId === 'sparkasse' ? /sparkasse/i : st.bankId === 'traderepublic' ? /trade ?republic/i : null;
      const pool = filter ? list.filter((a) => filter.test(a.name)) : list;
      let q = '';
      sheet.set(html`
        <p class="sheet-lead">${st.bankId === 'sparkasse' ? 'Wähle deine Sparkasse.' : 'Wähle deine Bank.'}</p>
        <label class="search" style="margin-bottom:12px">${icon('search', 18)}<span class="sr-only">Bank suchen</span><input type="search" data-q placeholder="${st.bankId === 'sparkasse' ? 'z. B. KölnBonn' : 'Bank suchen'}"></label>
        <div class="form" data-list></div>
        ${!pool.length ? html`<div class="callout warn" style="margin-top:12px">${icon('info', 20)}<span>${C.bank(st.bankId).name} ist bei Enable Banking derzeit nicht verfügbar. Nutze den CSV-Import.</span></div>` : ''}`,
      html`<button type="button" class="btn plain" data-csv>Stattdessen CSV importieren</button>`);
      sheet.foot.querySelector('[data-csv]').addEventListener('click', csvGuide);
      const box = sheet.body.querySelector('[data-list]');
      const draw = () => {
        const nq = U.normalize(q);
        const hits = pool.filter((a) => U.normalize(a.name).includes(nq)).slice(0, 80);
        box.innerHTML = String(hits.length ? html`${hits.map((a, i) => html`<button type="button" class="radio-row" data-i="${pool.indexOf(a)}">${ui.bankAvatar(st.bankId || 'other', 'sm')}<span><span class="row-title">${a.name}</span>${a.bic ? html`<span class="row-sub">${a.bic}</span>` : ''}</span>${icon('chevron-right', 18, 'chev')}</button>`)}` : html`<div class="empty">Keine Bank gefunden</div>`);
        box.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => liveConfirm(pool[Number(b.dataset.i)])));
      };
      draw();
      sheet.body.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
    }

    function liveConfirm(aspsp) {
      const days = Math.max(1, Math.min(180, Math.floor((Number(aspsp.maximum_consent_validity) || 90 * 86400) / 86400)));
      sheet.set(html`
        <div class="sheet-hero">${ui.bankAvatar(st.bankId || 'other', 'lg')}<h3>${aspsp.name}</h3></div>
        <div class="feature-list">
          <div>${icon('shield', 20)}<span><b>Anmeldung direkt bei der Bank</b><span>Du wirst zur Seite deiner Bank weitergeleitet und bestätigst den Zugriff dort, z. B. mit S-pushTAN.</span></span></div>
          <div>${icon('eye', 20)}<span><b>Nur lesender Zugriff</b><span>Kontostand und Umsätze. Überweisungen sind über diese Verbindung nicht möglich.</span></span></div>
          <div>${icon('clock', 20)}<span><b>Gültig für ${days} Tage</b><span>Danach erneuerst du die Freigabe mit einem Tipp.</span></span></div>
        </div>`,
      html`<button type="button" class="btn" data-go-bank>Weiter zur Bank</button><button type="button" class="btn plain" data-back>Zurück</button>`);
      sheet.foot.querySelector('[data-back]').addEventListener('click', () => liveList());
      sheet.foot.querySelector('[data-go-bank]').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await FK.live.start(aspsp, st.bankId || 'other');
        } catch (err) {
          e.target.disabled = false;
          FK.toast(err.message, { icon: 'alert', tone: 'info', duration: 5000 });
        }
      });
    }

    if (o.method === 'live') { if (FK.live.configured()) liveList(); else liveSetup(); } else if (target || o.method === 'csv') csvGuide();
    else if (st.bankId) chooseMethod();
    else chooseBank();
    return sheet;
  };

  /** Rückkehr von der Bank nach der Freigabe */
  FK.finishLiveConnection = async function () {
    if (!/[?&](code|error)=/.test(location.search)) return;
    const sheet = FK.sheet.open({ title: 'Konto verbinden' });
    sheet.set(html`<div class="progress-steps" aria-live="polite">
      <div class="on"><span class="st">${icon('refresh', 15)}</span>Freigabe wird bestätigt</div>
      <div><span class="st">${icon('refresh', 15)}</span>Umsätze werden abgerufen</div>
    </div>`);
    try {
      const res = await FK.live.handleCallback();
      if (!res) { sheet.close(); return; }
      if (res.error) {
        sheet.set(html`<div class="success"><span class="ring err">${icon('alert', 38)}</span><h3>Verbindung nicht abgeschlossen</h3><p>${res.error}</p></div>`, html`<button type="button" class="btn" data-sheet-close>Schließen</button>`);
        return;
      }
      const added = U.sum(res.results, (r) => r.added);
      sheet.set(html`<div class="success"><span class="ring">${icon('check', 42)}</span><h3>${res.aspsp.name} ist verbunden</h3>
        <p>${res.results.length} ${res.results.length === 1 ? 'Konto' : 'Konten'} · ${added} Umsätze abgerufen.</p></div>`,
      html`<button type="button" class="btn" data-open>Konto ansehen</button><button type="button" class="btn plain" data-sheet-close>Fertig</button>`);
      sheet.foot.querySelector('[data-open]').addEventListener('click', () => {
        sheet.close();
        if (res.results[0]) FK.nav.go('/konten/konto/' + res.results[0].accountId);
      });
    } catch (e) {
      sheet.set(html`<div class="success"><span class="ring err">${icon('alert', 38)}</span><h3>Verbindung fehlgeschlagen</h3><p>${e.message}</p></div>`, html`<button type="button" class="btn" data-sheet-close>Schließen</button>`);
    }
  };

  FK.actions.connect = (el) => FK.connect({ bankId: el && el.dataset.bank, method: el && el.dataset.method });
  FK.actions['import-file'] = (el) => FK.connect({ accountId: el.dataset.id, method: 'csv' });
})(window.FK);
