/* Finanzkompass – Profil & Einstellungen: persönliche Angaben, Darstellung, Live-Verbindung, Backup, Daten löschen */
(function (FK) {
  'use strict';
  const { html, icon, ui, raw } = FK;
  const S = FK.store;
  const D = FK.date;

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
      const p = S.state.profile;
      const theme = S.setting('theme');
      const liveOk = FK.live.configured();
      const txCount = S.txs().length;
      const body = html`
        <button type="button" class="profile" data-action="edit-profile">
          <span class="avatar">${p.name ? FK.util.initials(p.name) : icon('user', 26)}</span>
          <span style="min-width:0;flex:1"><span class="n">${p.name || 'Dein Profil'}</span><span class="e">${p.email || 'Name und Adresse für Kündigungsschreiben'}</span></span>
          ${icon('chevron-right', 18, 'chev')}
        </button>

        ${ui.section('Konten & Daten', html`<div class="list">
          ${link({ go: '/konten', icon: 'wallet', color: '#00768c', title: 'Konten verwalten', sub: `${S.accounts().length} ${S.accounts().length === 1 ? 'Konto' : 'Konten'} · ${txCount} Umsätze` })}
          ${link({ action: 'connect', icon: 'plus', color: '#2e9e5b', title: 'Konto verbinden', sub: 'Sparkasse, Trade Republic oder CSV' })}
          ${link({ action: 'live-settings', icon: 'refresh', color: '#2479b5', title: 'Live-Verbindung (PSD2)', sub: liveOk ? 'Eingerichtet · Enable Banking' : 'Nicht eingerichtet' })}
          ${link({ go: '/analyse', icon: 'target', color: '#8452bf', title: 'Budgets', sub: `${Object.keys(S.state.budgets).length} aktiv` })}
        </div>`)}

        ${ui.section('Darstellung', html`<div class="card" style="padding:12px">
          ${ui.seg('theme', [{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }], theme, 'Darstellung')}
        </div>
        <div class="list" style="margin-top:12px">
          ${setting('hideAmounts', 'eye-off', '#5f6f84', 'Beträge ausblenden', 'Für unterwegs: alle Summen werden unscharf')}
          ${setting('appLock', 'lock', '#2e9e5b', 'Sperrbildschirm beim Öffnen', 'Sichtschutz – die Daten werden dadurch nicht verschlüsselt')}
        </div>`)}

        ${ui.section('Sicherung', html`<div class="list">
          ${link({ action: 'export-backup', icon: 'arrow-down', color: '#13804d', title: 'Backup exportieren', sub: 'Alle Konten, Umsätze und Einstellungen als Datei', chevron: false })}
          ${link({ action: 'import-backup', icon: 'arrow-up', color: '#1c7397', title: 'Backup wiederherstellen', chevron: false })}
          ${link({ action: 'privacy', icon: 'shield', color: '#6c5bd4', title: 'So werden deine Daten gespeichert' })}
          ${link({ action: 'about', icon: 'info', color: '#5f6f84', title: `Über ${FK.config.appName}` })}
          ${link({ action: 'reset', icon: 'trash', color: '#c2322e', title: 'Alle Daten löschen', chevron: false })}
        </div>
        <input type="file" accept="application/json,.json" class="sr-only" data-backup-file aria-label="Backup-Datei">`)}

        <p class="footnote" style="text-align:center;margin-top:22px">${FK.config.appName} ${FK.config.version} · Inspiriert von Finanzguru – kein offizielles Produkt</p>`;
      return { title: 'Profil', body };
    },
    mount(el) {
      const input = el.querySelector('[data-backup-file]');
      if (!input) return;
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const ok = await ui.confirm({ title: 'Backup wiederherstellen?', text: 'Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.', confirm: 'Wiederherstellen', destructive: true, icon: 'arrow-up' });
          if (!ok) return;
          S.importBackup(text);
          FK.toast('Backup wiederhergestellt');
        } catch (e) {
          FK.toast(e.message || 'Das Backup konnte nicht gelesen werden.', { icon: 'alert', tone: 'info', duration: 5000 });
        } finally {
          input.value = '';
        }
      });
    },
  };

  FK.actions['toggle-setting'] = (el) => {
    const key = el.dataset.key;
    const on = !S.setting(key);
    S.act.setSetting(key, on);
    const msg = {
      hideAmounts: on ? 'Beträge werden ausgeblendet' : 'Beträge werden angezeigt',
      appLock: on ? 'Sperrbildschirm aktiviert' : 'Sperrbildschirm deaktiviert',
    }[key];
    if (msg) FK.toast(msg, { icon: key === 'appLock' ? 'lock' : 'eye-off', tone: 'info' });
  };

  FK.actions['edit-profile'] = () => {
    const p = S.state.profile;
    const f = (id, label, key, type, ac, ph) => html`<div class="field col"><label for="${id}">${label}</label><input id="${id}" type="${type || 'text'}" value="${p[key]}" data-key="${key}" placeholder="${ph || ''}"${ac ? raw(` autocomplete="${ac}"`) : ''}></div>`;
    const sheet = FK.sheet.open({
      title: 'Persönliche Angaben',
      body: html`<p class="sheet-lead">Für die Begrüßung und deine Kündigungsschreiben. Die Angaben bleiben auf diesem Gerät.</p>
        <div class="form">${f('p-name', 'Name', 'name', 'text', 'name', 'Vor- und Nachname')}${f('p-street', 'Straße und Hausnummer', 'street', 'text', 'street-address')}${f('p-city', 'PLZ und Ort', 'city', 'text', 'address-level2')}${f('p-mail', 'E-Mail', 'email', 'email', 'email')}</div>`,
      foot: html`<button type="button" class="btn" data-save>Speichern</button>`,
    });
    sheet.foot.querySelector('[data-save]').addEventListener('click', () => {
      const next = {};
      sheet.body.querySelectorAll('input[data-key]').forEach((i) => { next[i.dataset.key] = i.value.trim(); });
      S.act.setProfile(next);
      FK.nav.refresh();
      sheet.close();
      FK.toast('Gespeichert');
    });
  };

  FK.actions['live-settings'] = () => {
    const l = S.state.live;
    const sheet = FK.sheet.open({
      title: 'Live-Verbindung (PSD2)',
      large: true,
      body: html`<p class="sheet-lead">Konten werden über den regulierten Kontoinformationsdienst Enable Banking abgerufen. Den API-Schlüssel verwahrt dein eigener Proxy (Docker-Container oder Cloudflare Worker) – die Anleitung steht in der README.</p>
        <div class="callout" data-bundled hidden></div>
        <div class="form">
          <div class="field col"><label for="ls-url">Proxy-Adresse</label><input id="ls-url" type="text" inputmode="url" value="${l.proxyUrl}" placeholder="/api oder https://….workers.dev" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
          <div class="field col"><label for="ls-token">Zugriffstoken</label><input id="ls-token" type="password" value="${l.token}" autocomplete="off"></div>
        </div>
        <div class="form" style="margin-top:12px"><div class="field col"><label>Redirect-URL für Enable Banking</label><input readonly value="${FK.live.redirectUrl()}"></div></div>
        <p class="footnote">Das Token wird nur auf diesem Gerät gespeichert.</p>`,
      foot: html`<button type="button" class="btn" data-test>Speichern und testen</button>${l.proxyUrl ? html`<button type="button" class="btn plain" data-clear style="color:var(--neg)">Live-Zugang entfernen</button>` : ''}`,
    });
    if (FK.bundledHint) FK.bundledHint(sheet, '#ls-url');
    sheet.foot.querySelector('[data-test]').addEventListener('click', async (e) => {
      const url = sheet.body.querySelector('#ls-url').value.trim();
      const token = sheet.body.querySelector('#ls-token').value.trim();
      if (!FK.live.validUrl(url) || token.length < 12) { FK.toast('Bitte Proxy-Adresse (/api oder https://…) und Token eintragen', { icon: 'alert-circle', tone: 'info' }); return; }
      S.act.setLive({ proxyUrl: url, token });
      e.target.disabled = true;
      try {
        const list = await FK.live.aspsps();
        FK.toast(`Verbindung klappt · ${list.length} Banken verfügbar`);
        sheet.close();
      } catch (err) {
        e.target.disabled = false;
        FK.toast(err.message, { icon: 'alert', tone: 'info', duration: 5000 });
      }
    });
    const clear = sheet.foot.querySelector('[data-clear]');
    if (clear) clear.addEventListener('click', () => {
      S.act.setLive({ proxyUrl: '', token: '', pending: null });
      sheet.close();
      FK.toast('Live-Zugang entfernt', { icon: 'trash', tone: 'info' });
    });
  };

  FK.actions['export-backup'] = async () => {
    const json = S.exportBackup();
    const name = `finanzkompass-backup-${D.ymd(new Date())}.json`;
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Finanzkompass-Backup' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    FK.toast('Backup gespeichert');
  };

  FK.actions['import-backup'] = () => {
    const input = document.querySelector('.tab-view.active [data-backup-file]');
    if (input) input.click();
  };

  FK.actions['show-lock'] = () => FK.showLock();

  FK.actions.privacy = () => {
    FK.sheet.open({
      title: 'Deine Daten',
      body: html`<div class="feature-list" style="margin-top:8px">
          <div>${icon('lock', 20)}<span><b>Nur auf diesem Gerät</b><span>Konten, Umsätze und Einstellungen liegen im lokalen Speicher deines Browsers. Es gibt keinen Server, der sie speichert.</span></span></div>
          <div>${icon('arrow-up', 20)}<span><b>CSV-Dateien bleiben lokal</b><span>Importierte Dateien werden im Browser gelesen und nicht hochgeladen.</span></span></div>
          <div>${icon('refresh', 20)}<span><b>Live-Verbindung</b><span>Nur wenn du sie einrichtest: Umsätze kommen dann über deinen eigenen Proxy von Enable Banking, einem regulierten Kontoinformationsdienst. Die Bankanmeldung läuft direkt bei der Bank.</span></span></div>
          <div>${icon('alert-circle', 20)}<span><b>Speicher kann gelöscht werden</b><span>Safari löscht Website-Daten nach längerer Nichtnutzung. Als Home-Bildschirm-App bleiben sie erhalten. Exportiere zur Sicherheit regelmäßig ein Backup.</span></span></div>
        </div>`,
    });
  };

  FK.actions.about = () => {
    FK.sheet.open({
      title: `Über ${FK.config.appName}`,
      body: html`<div class="sheet-hero">${ui.logo(72)}<h3>${FK.config.appName}</h3><p class="sheet-lead" style="margin:0">${FK.config.tagline} · Version ${FK.config.version}</p></div>
        <div class="list">${ui.kv([
          ['Optimiert für', 'iPhone 17 · iOS 26'],
          ['Import', 'Sparkasse (CSV-CAMT), Trade Republic, CSV'],
          ['Live', 'PSD2 über Enable Banking (optional)'],
          ['Technik', 'HTML, CSS, JavaScript – ohne Server'],
        ])}</div>
        <p class="footnote">Ein Nachbau-Konzept im Stil von Multibanking-Apps wie Finanzguru. Es besteht keine Verbindung zu Finanzguru.</p>`,
    });
  };

  FK.actions.reset = async () => {
    const ok = await ui.confirm({ title: 'Alle Daten löschen?', text: 'Konten, Umsätze, Kündigungen, Budgets und Einstellungen werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen – exportiere vorher ein Backup.', confirm: 'Alles löschen', destructive: true, icon: 'trash' });
    if (!ok) return;
    S.reset();
    FK.toast('Alle Daten gelöscht', { icon: 'trash', tone: 'info' });
  };
})(window.FK);
