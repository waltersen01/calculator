/* Finanzkompass – UI-Bausteine: Logos, Zeilen, Beträge, Sheets, Toasts, Bestätigungen */
(function (FK) {
  'use strict';
  const { html, raw, icon, esc } = FK;
  const C = FK.catalog;
  const U = FK.util;
  const eur = FK.fmt.eur;
  const ui = {};

  /* ---------- Beträge ---------- */
  /** colored: Einnahmen grün; sign: Pluszeichen bei positiven Werten */
  ui.amt = (n, o) => {
    const opt = o || {};
    const cls = ['amt'];
    if (opt.colored && n > 0.004) cls.push('pos');
    if (opt.cls) cls.push(opt.cls);
    return html`<span class="${cls.join(' ')}">${eur(n, { sign: opt.sign !== false && opt.colored, decimals: opt.decimals })}</span>`;
  };

  /* ---------- Logo-Kacheln ---------- */
  const PERSON_COLORS = ['#7b5ea7', '#2f7d8c', '#b45a3c', '#3f6fb5', '#8a6d1f', '#4f7f43'];
  function tile(color, content, size, extra) {
    const isText = typeof content === 'string';
    const cls = ['avatar'];
    if (size) cls.push(size);
    if (U.luminance(color) > 0.42) cls.push('light');
    if (isText && content.length >= 3) cls.push('l3');
    if (extra) cls.push(extra);
    return html`<span class="${cls.join(' ')}" style="--c:${color}" aria-hidden="true">${content}</span>`;
  }
  ui.tile = tile;

  ui.merchantAvatar = (merchantId, name, size) => {
    const m = C.merchant(merchantId);
    if (m) return tile(m.color, m.icon ? icon(m.icon) : (m.letter || m.name.charAt(0).toUpperCase()), size);
    return ui.nameAvatar(name, size, true);
  };
  /** Kachel aus Initialen, Farbe aus dem Namen abgeleitet (Personen rund, eigene Verträge eckig) */
  ui.nameAvatar = (name, size, round) => tile(PERSON_COLORS[FK.hash(name || '?') % PERSON_COLORS.length], U.initials(name || '?') || '?', size, round ? 'round' : '');
  ui.contractAvatar = (c, size) => (c.merchant ? ui.merchantAvatar(c.merchant, c.provider, size) : ui.nameAvatar(c.provider, size, false));
  ui.bankAvatar = (bankId, size) => {
    const b = C.bank(bankId);
    return tile(b.color, b.letter, size);
  };
  ui.catIcon = (catId, size) => {
    const c = C.cat(catId);
    return tile(c.color, icon(c.icon), size);
  };
  ui.txAvatar = (t, size) => ui.merchantAvatar(t.merchantId, t.name, size);

  /* ---------- Zeilen & Abschnitte ---------- */
  function attrs(o) {
    let s = '';
    if (o.go) s += ` data-go="${esc(o.go)}"`;
    if (o.action) s += ` data-action="${esc(o.action)}"`;
    if (o.data) for (const k of Object.keys(o.data)) s += ` data-${k}="${esc(o.data[k])}"`;
    if (o.label) s += ` aria-label="${esc(o.label)}"`;
    return raw(s);
  }
  ui.attrs = attrs;

  ui.row = (o) => {
    const tag = o.go || o.action ? 'button' : 'div';
    return html`<${raw(tag)} class="row${o.cls ? ' ' + o.cls : ''}"${tag === 'button' ? raw(' type="button"') : ''}${attrs(o)}>
      ${o.lead || ''}
      <span class="row-main">${o.badge ? html`<span class="title-line"><span class="row-title">${o.title}</span>${o.badge}</span>` : html`<span class="row-title">${o.title}</span>`}${o.sub ? html`<span class="row-sub${o.subWrap ? ' wrap' : ''}">${o.sub}</span>` : ''}</span>
      ${o.end != null || o.endSub ? html`<span class="row-end">${o.end != null ? o.end : ''}${o.endSub ? html`<span class="row-sub">${o.endSub}</span>` : ''}</span>` : ''}
      ${o.chevron ? icon('chevron-right', 18, 'chev') : ''}
    </${raw(tag)}>`;
  };

  ui.section = (title, body, link, cls) => html`<section class="section${cls ? ' ' + cls : ''}">
    ${title ? html`<div class="section-head"><h2 class="section-title">${title}</h2>${link ? html`<button type="button" class="section-link"${attrs(link)}>${link.text}</button>` : ''}</div>` : ''}
    ${body}
  </section>`;

  ui.badge = (text, tone, ic) => html`<span class="badge${tone ? ' ' + tone : ''}">${ic ? icon(ic, 13) : ''}${text}</span>`;

  ui.meter = (ratio, status, label) => html`<div class="meter${status && status !== 'ok' ? ' ' + status : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"${label ? raw(` aria-label="${esc(label)}"`) : ''}><span style="width:${Math.min(100, Math.max(ratio > 0 ? 2 : 0, ratio * 100)).toFixed(1)}%"></span></div>`;

  ui.seg = (action, options, value, label) => html`<div class="seg" role="group"${label ? raw(` aria-label="${esc(label)}"`) : ''}>
    ${options.map((o) => html`<button type="button" data-action="${action}" data-value="${o.value}" aria-pressed="${String(o.value === value)}">${o.label}</button>`)}
  </div>`;

  ui.chips = (action, options, value, label) => html`<div class="chips" role="group"${label ? raw(` aria-label="${esc(label)}"`) : ''}>
    ${options.map((o) => html`<button type="button" class="chip" data-action="${action}" data-value="${o.value}" aria-pressed="${String(o.value === value)}">${o.label}</button>`)}
  </div>`;

  ui.empty = (ic, title, text) => html`<div class="empty">${icon(ic, 34)}<strong>${title}</strong>${text ? html`<span>${text}</span>` : ''}</div>`;

  ui.kv = (pairs) => html`<dl class="kv">${pairs.filter(Boolean).map(([k, v, cls, block]) => html`<div${block ? raw(' class="block"') : ''}><dt>${k}</dt><dd${cls ? raw(` class="${cls}"`) : ''}>${v}</dd></div>`)}</dl>`;

  /** Unsichtbare Tabelle als zugängliche Alternative zu Diagrammen */
  ui.srTable = (caption, head, rows) => html`<table class="sr-only"><caption>${caption}</caption><thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody></table>`;

  /* ---------- Umsatzlisten ---------- */
  ui.txRow = (t, opts) => {
    const o = opts || {};
    const cat = C.cat(t.categoryId);
    const acc = o.showAccount ? FK.store.account(t.accountId) : null;
    const subParts = [cat.name];
    if (acc) subParts.push(C.bank(acc.bankId).short);
    if (t.contractId) subParts.push('Vertrag');
    return ui.row({
      go: 'umsatz/' + t.id,
      lead: ui.txAvatar(t),
      title: t.name,
      sub: subParts.join(' · '),
      end: ui.amt(t.amount, { colored: true }),
      endSub: o.showDate ? FK.dfmt.dm(t.date) : null,
      label: `${t.name}, ${eur(t.amount, { sign: true })}, ${cat.name}, ${FK.dfmt.long(t.date)}`,
    });
  };

  ui.txGroups = (txs, opts) => {
    if (!txs.length) return ui.empty('search', 'Keine Umsätze gefunden', 'Passe Suche oder Filter an.');
    const groups = U.groupBy(txs, (t) => t.date);
    const out = [];
    for (const [date, list] of groups) {
      const sum = U.sum(list, (t) => t.amount);
      out.push(html`<div class="day-head"><span>${FK.dfmt.dayHeader(date)}</span>${ui.amt(sum, { colored: false, sign: false })}</div>
        <div class="list">${list.map((t) => ui.txRow(t, opts))}</div>`);
    }
    return out;
  };

  /* ---------- Topografie-Textur (generiert, dekorativ) ---------- */
  const topoCache = {};
  ui.topo = (seed) => {
    const key = seed || 'k';
    if (!topoCache[key]) {
      const r = FK.rng('topo:' + key);
      const waves = [1, 2, 3, 4].map((k) => ({ k, a: r.between(0.02, 0.09) / k, p: r.between(0, Math.PI * 2) }));
      const paths = [];
      for (let lvl = 0; lvl < 9; lvl++) {
        const base = 18 + lvl * 17;
        const pts = [];
        for (let i = 0; i < 96; i++) {
          const th = (i / 96) * Math.PI * 2;
          let f = 1;
          for (const w of waves) f += w.a * (1 + lvl * 0.12) * Math.sin(w.k * th + w.p + lvl * 0.35);
          pts.push([150 + Math.cos(th) * base * f, 150 + Math.sin(th) * base * f * 0.92]);
        }
        paths.push('M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z');
      }
      topoCache[key] = `<svg class="topo" viewBox="0 0 300 300" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.1">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
    }
    return raw(topoCache[key]);
  };

  /* ---------- App-Logo (Kompassnadel) ---------- */
  ui.logo = (size, square) => raw(`<svg class="app-logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect width="64" height="64" rx="${square ? 0 : 15}" fill="#0b2a33"/>
    <circle cx="32" cy="32" r="20.5" fill="none" stroke="#3cc2d7" stroke-opacity=".45" stroke-width="2"/>
    <g transform="rotate(38 32 32)"><path d="M32 12.5 38.2 32H25.8z" fill="#3cc2d7"/><path d="M32 51.5 25.8 32h12.4z" fill="#eef8fa"/></g>
    <circle cx="32" cy="32" r="3.2" fill="#0b2a33"/>
  </svg>`);

  /* ---------- Toasts ---------- */
  FK.toast = (text, opts) => {
    const o = opts || {};
    const layer = document.querySelector('.toast-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'toast' + (o.tone ? ' ' + o.tone : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ti">${icon(o.icon || 'check', 16)}</span><span></span>`;
    el.lastChild.textContent = text;
    layer.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 500);
    }, o.duration || 2600);
  };

  /* ---------- Sheets (iOS-26-Stil, nach unten wegwischbar) ---------- */
  const openSheets = [];
  FK.sheet = {
    open(opts) {
      const host = document.querySelector('.app');
      const layer = document.createElement('div');
      layer.className = 'sheet-layer';
      layer.innerHTML = `<div class="sheet-backdrop"></div>
        <div class="sheet${opts.large ? ' large' : ''}" role="dialog" aria-modal="true" tabindex="-1">
          <div class="sheet-grabber" aria-hidden="true"></div>
          <div class="sheet-head"><span class="sheet-left"></span><div class="sheet-title"></div>
            <button type="button" class="gbtn" data-sheet-close aria-label="Schließen">${icon('x', 18)}</button></div>
          <div class="sheet-body"></div>
          <div class="sheet-foot" hidden></div>
        </div>`;
      const sheetEl = layer.querySelector('.sheet');
      const body = layer.querySelector('.sheet-body');
      const foot = layer.querySelector('.sheet-foot');
      const titleEl = layer.querySelector('.sheet-title');
      const prevFocus = document.activeElement;
      let closed = false;

      const api = {
        el: sheetEl,
        body,
        foot,
        setTitle(t) { titleEl.textContent = t || ''; sheetEl.setAttribute('aria-label', t || 'Dialog'); },
        set(bodyHtml, footHtml) {
          body.innerHTML = String(bodyHtml || '');
          if (footHtml) { foot.innerHTML = String(footHtml); foot.hidden = false; } else { foot.innerHTML = ''; foot.hidden = true; }
          body.scrollTop = 0;
        },
        close(result) {
          if (closed) return;
          closed = true;
          layer.classList.remove('open');
          const i = openSheets.indexOf(api);
          if (i >= 0) openSheets.splice(i, 1);
          setTimeout(() => layer.remove(), FK.reducedMotion() ? 0 : 450);
          if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignorieren */ }
          if (opts.onClose) opts.onClose(result);
        },
      };
      api.setTitle(opts.title);
      if (opts.body) api.set(opts.body, opts.foot);

      layer.addEventListener('click', (e) => {
        if (e.target.classList.contains('sheet-backdrop') || e.target.closest('[data-sheet-close]')) api.close();
      });

      // Ziehen zum Schließen (Griff und Kopfzeile)
      let startY = null;
      let dy = 0;
      let t0 = 0;
      const head = layer.querySelector('.sheet-head');
      const grab = layer.querySelector('.sheet-grabber');
      const onDown = (e) => {
        if (e.target.closest('button')) return;
        startY = e.clientY; dy = 0; t0 = performance.now();
        sheetEl.classList.add('dragging');
        sheetEl.setPointerCapture && sheetEl.setPointerCapture(e.pointerId);
      };
      const onMove = (e) => {
        if (startY == null) return;
        dy = Math.max(0, e.clientY - startY);
        sheetEl.style.transform = `translateY(${dy}px)`;
      };
      const onUp = () => {
        if (startY == null) return;
        const v = dy / Math.max(1, performance.now() - t0);
        startY = null;
        sheetEl.classList.remove('dragging');
        sheetEl.style.transform = '';
        if (dy > 120 || (dy > 40 && v > 0.6)) api.close();
      };
      [head, grab].forEach((el) => el.addEventListener('pointerdown', onDown));
      sheetEl.addEventListener('pointermove', onMove);
      sheetEl.addEventListener('pointerup', onUp);
      sheetEl.addEventListener('pointercancel', onUp);

      host.appendChild(layer);
      openSheets.push(api);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        layer.classList.add('open');
        try { sheetEl.focus({ preventScroll: true }); } catch (e) { /* ignorieren */ }
      }));
      if (opts.onMount) opts.onMount(api);
      return api;
    },
    closeTop() {
      const top = openSheets[openSheets.length - 1];
      if (top) { top.close(); return true; }
      return false;
    },
    count: () => openSheets.length,
  };

  /** Bestätigungsdialog als Sheet (alert/confirm funktionieren nicht überall) */
  ui.confirm = (o) => new Promise((resolve) => {
    let done = false;
    const s = FK.sheet.open({
      title: o.title,
      body: html`<div class="sheet-hero">${o.icon ? html`<span class="insight-icon" style="width:56px;height:56px;border-radius:28px">${icon(o.icon, 26)}</span>` : ''}<p class="sheet-lead" style="margin:0">${o.text}</p></div>`,
      foot: html`<button type="button" class="btn${o.destructive ? ' danger' : ''}" data-ok>${o.confirm || 'Bestätigen'}</button><button type="button" class="btn plain" data-cancel>Abbrechen</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    s.foot.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); s.close(); });
    s.foot.querySelector('[data-cancel]').addEventListener('click', () => s.close());
  });

  FK.ui = ui;
})(window.FK);
