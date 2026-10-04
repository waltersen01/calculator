/* Finanzkompass – Start: Gerüst, iPhone-Rahmen, Theme, Sperrbildschirm, globale Aktionen */
(function (FK) {
  'use strict';
  const { html, icon } = FK;
  const S = FK.store;
  const root = document.documentElement;
  // Ein vom umgebenden Viewer gesetztes Theme bleibt bei „System“ erhalten
  const hostTheme = root.getAttribute('data-theme');

  /* ---------- Globale Aktionen (data-action="…") ---------- */
  Object.assign(FK.actions, {
    back: () => FK.nav.back(),
    'toggle-hide': () => S.act.setSetting('hideAmounts', !S.setting('hideAmounts')),
    dismiss: (el) => {
      S.act.dismiss(el.dataset.id);
      FK.toast('Hinweis ausgeblendet', { icon: 'eye-off', tone: 'info' });
    },
    theme: (el) => S.act.setSetting('theme', el.dataset.value),
    sync: (el, ev, done) => {
      if (el) el.disabled = true;
      setTimeout(() => {
        S.sync();
        FK.toast('Alle Konten sind aktuell');
        if (done) done();
      }, 1100);
    },
  });

  /* ---------- Darstellung ---------- */
  function applyTheme() {
    const t = S.setting('theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else if (hostTheme) root.setAttribute('data-theme', hostTheme);
    else root.removeAttribute('data-theme');
    let dark = (root.getAttribute('data-theme') || '') === 'dark';
    try { if (!root.getAttribute('data-theme')) dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { dark = false; }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#050909' : '#f1f4f5');
    document.querySelectorAll('.stage-info [data-action="theme"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === t)));
  }
  function applyHide() { root.classList.toggle('hide-amounts', !!S.setting('hideAmounts')); }

  /** Großer Bildschirm → App im iPhone-17-Rahmen (402 × 874 pt), sonst randlos */
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const framed = w >= 640 && h >= 560;
    root.classList.toggle('framed', framed);
    root.classList.toggle('wide', framed && w >= 980);
    if (framed) {
      const s = Math.min(1, (h - 40) / 906, (w - 40) / 434);
      root.style.setProperty('--s', s.toFixed(4));
    }
  }

  function clock() {
    const el = document.querySelector('.sb-time');
    if (el) el.textContent = FK.dfmt.time(new Date());
  }

  const SB_ICONS = `<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 2.3c2.3 0 4.5.9 6.1 2.5l1.3-1.3A10.4 10.4 0 0 0 8 .4C5.1.4 2.5 1.6.6 3.5l1.3 1.3A8.6 8.6 0 0 1 8 2.3Zm0 3.6c1.4 0 2.6.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4c-1.9 0-3.6.7-4.9 2l1.3 1.3c1-.9 2.2-1.4 3.6-1.4Zm0 3.5c.5 0 1 .2 1.4.6L8 11.6 6.6 10c.4-.4.9-.6 1.4-.6Z"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2.3" fill="currentColor"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S25.8 4.7 25 4.4Z" fill="currentColor" opacity=".45"/></svg>`;

  function shell() {
    const stage = document.getElementById('stage');
    stage.innerHTML = String(html`
      <aside class="stage-info">
        <div class="brand">${FK.ui.logo(44)}<span class="brand-name">${FK.config.appName}</span></div>
        <h2>Alle Konten, Verträge und Ausgaben in einer App.</h2>
        <p>Web-App im Stil bekannter Finanz-Apps wie Finanzguru, gebaut für das iPhone 17. Öffne die Seite auf dem iPhone in Safari und wähle „Teilen → Zum Home-Bildschirm“, dann startet sie wie eine echte App.</p>
        <dl class="spec">
          <dt>Gerät</dt><dd>iPhone 17 · 6,3″ · 120 Hz</dd>
          <dt>Viewport</dt><dd>402 × 874 pt · @3x</dd>
          <dt>Safe Area</dt><dd>oben 62 pt · unten 34 pt</dd>
          <dt>Design</dt><dd>iOS 26 · Liquid Glass</dd>
        </dl>
        <div class="theme-switch" role="group" aria-label="Darstellung">
          <button type="button" data-action="theme" data-value="system">System</button>
          <button type="button" data-action="theme" data-value="light">Hell</button>
          <button type="button" data-action="theme" data-value="dark">Dunkel</button>
        </div>
        <p class="note">Alle Daten sind Beispieldaten. Es werden keine Bankzugangsdaten abgefragt oder übertragen. Kein offizielles Produkt von Finanzguru.</p>
      </aside>
      <div class="device-slot">
        <div class="device">
          <div class="device-buttons" aria-hidden="true"><span class="b-action"></span><span class="b-vol-up"></span><span class="b-vol-down"></span><span class="b-side"></span><span class="b-camera"></span></div>
          <div class="screen">
            <div class="statusbar" aria-hidden="true"><span class="sb-time">9:41</span><span class="sb-icons">${FK.raw(SB_ICONS)}</span></div>
            <div class="app" id="app">
              <div class="tab-views"></div>
              ${FK.nav.tabbarHTML()}
              <div class="toast-layer" aria-live="polite"></div>
            </div>
          </div>
          <div class="island" aria-hidden="true"></div>
          <div class="home-indicator" aria-hidden="true"></div>
        </div>
      </div>`);
    return stage;
  }

  /* ---------- Sperrbildschirm (Face ID wird simuliert) ---------- */
  function showLock() {
    const app = document.getElementById('app');
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.setAttribute('role', 'dialog');
    lock.setAttribute('aria-label', 'App gesperrt');
    lock.innerHTML = String(html`<div class="logo">${FK.ui.logo(84)}</div>
      <h2>${FK.config.appName}</h2><p>Mit Face ID entsperren</p>
      <div class="faceid" aria-hidden="true">${icon('face-id', 40)}</div>
      <button type="button" class="btn">Entsperren</button>`);
    app.appendChild(lock);
    document.querySelector('.statusbar').style.color = '#fff';
    lock.querySelector('.btn').addEventListener('click', () => {
      lock.querySelector('.faceid').classList.add('scan');
      setTimeout(() => {
        lock.classList.add('hide');
        document.querySelector('.statusbar').style.color = '';
        setTimeout(() => lock.remove(), 500);
      }, 850);
    });
  }
  FK.showLock = showLock;

  /* ---------- Start ---------- */
  function boot() {
    S.load();
    const stage = shell();
    applyTheme();
    applyHide();
    layout();
    clock();
    setInterval(clock, 15000);
    window.addEventListener('resize', layout);
    // iOS Safari zeigt :active-Zustände nur mit einem Touch-Listener
    document.addEventListener('touchstart', () => {}, { passive: true });
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    } catch (e) { /* ältere Browser */ }

    FK.nav.init(stage.querySelector('.tab-views'));

    stage.addEventListener('click', (e) => {
      const t = e.target.closest('[data-go],[data-action],[data-tab]');
      if (!t || !stage.contains(t) || t.closest('.sheet-layer')) {
        if (t && t.closest('.sheet-layer') && t.dataset.go) { FK.sheet.closeTop(); FK.nav.go(t.dataset.go); }
        return;
      }
      if (t.dataset.go) { e.preventDefault(); FK.nav.go(t.dataset.go); return; }
      if (t.dataset.tab) { FK.nav.switchTab(t.dataset.tab); return; }
      const fn = FK.actions[t.dataset.action];
      if (fn) fn(t, e);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!FK.sheet.closeTop()) FK.nav.back();
      }
    });

    S.on((info) => {
      if (info.setting === 'theme' || info.reset) applyTheme();
      if (info.setting === 'hideAmounts' || info.reset) applyHide();
      if (info.silent) return;
      FK.nav.refresh();
    });

    // Neuer Tag seit dem letzten Öffnen? Dann Daten neu erzeugen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && FK.date.ymd(new Date()) !== FK.date.ymd(S.today())) S.sync();
    });

    if (S.setting('appLock')) showLock();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.FK);
