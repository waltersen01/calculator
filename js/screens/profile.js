/* Finanzkompass – Profil & Einstellungen, Plus, Datenschutz, Zurücksetzen */
(function (FK) {
  'use strict';
  const { html, icon, ui, raw } = FK;
  const S = FK.store;

  const setting = (key, ic, color, title, sub) => html`<label class="row setting">
    <span class="row-icon" style="background:${color}">${icon(ic, 18)}</span>
    <span class="row-main"><span class="row-title">${title}</span>${sub ? html`<span class="row-sub">${sub}</span>` : ''}</span>
    <input type="checkbox" class="switch" data-action="toggle-setting" data-key="${key}" ${S.setting(key) ? raw('checked') : ''} aria-label="${title}">
  </label>`;

  const link = (o) => ui.row(Object.assign({ cls: 'setting', chevron: true }, o, {
    lead: html`<span class="row-icon" style="background:${o.color}">${icon(o.icon, 18)}</span>`,
  }));

  FK.screens.profile = {
    render() {
      const u = FK.config.user;
      const plus = S.setting('plus');
      const theme = S.setting('theme');
      const body = html`
        <div class="profile">
          <span class="avatar">${FK.util.initials(u.firstName + ' ' + u.lastName)}</span>
          <div style="min-width:0"><div class="n">${u.firstName} ${u.lastName}</div><div class="e">${u.email}</div>
            <div style="margin-top:6px">${plus ? ui.badge('Plus aktiv', 'accent', 'crown') : ui.badge('Basis')}</div></div>
        </div>

        <button type="button" class="plus-hero" data-action="plus">
          ${ui.topo('plus')}
          <span class="plus-badge">${icon('crown', 13)}${FK.config.appName} Plus</span>
          <h3>${plus ? 'Danke, dass du Plus nutzt' : 'Mehr Durchblick mit Plus'}</h3>
          <p>${plus ? 'Prognose, unbegrenzte Budgets und Auswertungen über alle Monate sind freigeschaltet.' : 'Kontostandsprognose, unbegrenzte Budgets und Analysen über deine gesamte Historie.'}</p>
          <span class="cta">${plus ? 'Abo verwalten' : '1 Monat kostenlos testen'}${icon('chevron-right', 16)}</span>
        </button>

        ${ui.section('Darstellung', html`<div class="card" style="padding:12px">
          ${ui.seg('theme', [{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], theme, 'Darstellung')}
        </div>
        <div class="list" style="margin-top:12px">
          ${setting('hideAmounts', 'eye-off', '#5f6f84', 'Beträge ausblenden', 'Für unterwegs: alle Summen werden unscharf')}
        </div>`)}

        ${ui.section('Sicherheit & Mitteilungen', html`<div class="list">
          ${setting('appLock', 'face-id', '#2e9e5b', 'Mit Face ID sperren', 'Beim Öffnen der App entsperren')}
          ${setting('notifications', 'bell', '#c93a70', 'Mitteilungen', 'Preiserhöhungen, Fristen, Budgets')}
        </div>`)}

        ${ui.section('Finanzen', html`<div class="list">
          ${link({ go: '/konten', icon: 'wallet', color: '#00768c', title: 'Konten verwalten', sub: `${S.accounts().length} verbundene Konten` })}
          ${link({ go: '/analyse', icon: 'target', color: '#8452bf', title: 'Budgets', sub: `${Object.keys(S.state.budgets).length} Budgets aktiv` })}
          ${link({ go: 'hinweise', icon: 'sparkles', color: '#b26f00', title: 'Hinweise', sub: `${S.insights().length} offen` })}
        </div>`)}

        ${ui.section('Daten & Datenschutz', html`<div class="list">
          ${link({ action: 'privacy', icon: 'shield', color: '#13804d', title: 'So schützt die App deine Daten' })}
          ${link({ action: 'about', icon: 'info', color: '#2479b5', title: `Über ${FK.config.appName}` })}
          ${link({ action: 'show-lock', icon: 'lock', color: '#5f6f84', title: 'App jetzt sperren' })}
          ${link({ action: 'reset', icon: 'refresh', color: '#c2322e', title: 'Demo-Daten zurücksetzen', chevron: false })}
        </div>`)}

        <p class="footnote" style="text-align:center;margin-top:22px">${FK.config.appName} ${FK.config.version} · Demo mit Beispieldaten<br>Inspiriert von Finanzguru – kein offizielles Produkt</p>`;
      return { title: 'Profil', body };
    },
  };

  FK.actions['toggle-setting'] = (el) => {
    const key = el.dataset.key;
    const on = !S.setting(key);
    S.act.setSetting(key, on);
    const msg = {
      hideAmounts: on ? 'Beträge werden ausgeblendet' : 'Beträge werden angezeigt',
      appLock: on ? 'Face ID beim Öffnen aktiviert' : 'Sperre deaktiviert',
      notifications: on ? 'Mitteilungen aktiviert' : 'Mitteilungen deaktiviert',
    }[key];
    if (msg) FK.toast(msg, { icon: key === 'appLock' ? 'face-id' : key === 'hideAmounts' ? 'eye-off' : 'bell', tone: 'info' });
  };

  FK.actions['show-lock'] = () => FK.showLock();

  FK.actions.plus = () => {
    const plus = S.setting('plus');
    const sheet = FK.sheet.open({
      title: `${FK.config.appName} Plus`,
      body: html`<div class="sheet-hero"><span class="insight-icon" style="width:56px;height:56px;border-radius:28px">${icon('crown', 26)}</span><h3>${plus ? 'Plus ist aktiv' : 'Alles im Blick – auch morgen'}</h3></div>
        <div class="feature-list">
          <div>${icon('line-chart', 20)}<span><b>Kontostandsprognose</b><span>Sieh heute, was am Monatsende übrig bleibt.</span></span></div>
          <div>${icon('target', 20)}<span><b>Unbegrenzte Budgets</b><span>Für jede Kategorie ein eigenes Limit.</span></span></div>
          <div>${icon('bar-chart', 20)}<span><b>Analysen über alle Monate</b><span>Vergleiche Ausgaben über deine gesamte Historie.</span></span></div>
          <div>${icon('bell', 20)}<span><b>Frühwarnungen</b><span>Hinweise bei Preiserhöhungen und Fristen.</span></span></div>
        </div>
        <p class="footnote" style="text-align:center">Demo: Es wird nichts berechnet und kein Abo abgeschlossen.</p>`,
      foot: plus
        ? html`<button type="button" class="btn danger" data-toggle>Plus beenden</button>`
        : html`<button type="button" class="btn" data-toggle>1 Monat gratis testen</button><p class="footnote" style="text-align:center;margin:0">danach 2,99 € im Monat · monatlich kündbar</p>`,
    });
    sheet.foot.querySelector('[data-toggle]').addEventListener('click', () => {
      S.act.setSetting('plus', !plus);
      sheet.close();
      FK.toast(plus ? 'Plus beendet' : 'Plus ist aktiv – viel Spaß!', { icon: 'crown' });
    });
  };

  FK.actions.privacy = () => {
    FK.sheet.open({
      title: 'Datenschutz',
      body: html`<div class="feature-list" style="margin-top:8px">
          <div>${icon('lock', 20)}<span><b>Nur auf deinem Gerät</b><span>Einstellungen, Budgets und Notizen speichert diese Demo ausschließlich im lokalen Speicher deines Browsers.</span></span></div>
          <div>${icon('shield', 20)}<span><b>Keine Bankzugangsdaten</b><span>Es gibt keine Verbindung zu echten Banken. Alle Konten und Umsätze sind erfundene Beispieldaten.</span></span></div>
          <div>${icon('eye-off', 20)}<span><b>Kein Tracking</b><span>Die App lädt keine Analyse- oder Werbedienste.</span></span></div>
        </div>`,
    });
  };

  FK.actions.about = () => {
    FK.sheet.open({
      title: `Über ${FK.config.appName}`,
      body: html`<div class="sheet-hero">${ui.logo(72)}<h3>${FK.config.appName}</h3><p class="sheet-lead" style="margin:0">${FK.config.tagline} · Version ${FK.config.version}</p></div>
        <div class="list">${ui.kv([
          ['Optimiert für', 'iPhone 17 · iOS 26'],
          ['Viewport', '402 × 874 pt'],
          ['Technik', 'HTML, CSS, JavaScript – ohne Frameworks'],
          ['Daten', 'Beispieldaten, lokal erzeugt'],
        ])}</div>
        <p class="footnote">Diese Web-App ist ein Nachbau-Konzept im Stil von Multibanking-Apps wie Finanzguru. Sie steht in keiner Verbindung zu Finanzguru.</p>`,
    });
  };

  FK.actions.reset = async () => {
    const ok = await ui.confirm({ title: 'Demo-Daten zurücksetzen?', text: 'Kündigungen, Budgets, Kategorien, Notizen und hinzugefügte Konten werden gelöscht.', confirm: 'Zurücksetzen', destructive: true, icon: 'refresh' });
    if (!ok) return;
    S.reset();
    FK.toast('Demo-Daten zurückgesetzt', { icon: 'refresh', tone: 'info' });
  };
})(window.FK);
