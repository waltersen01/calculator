/* Finanzkompass – Navigation: Tabs mit eigenem Stapel (wie iOS), Hash-URLs, Push-/Pop-Animationen, Wischen vom Rand */
(function (FK) {
  'use strict';
  const { html, icon } = FK;

  const TABS = [
    { id: 'uebersicht', label: 'Übersicht', icon: 'home', screen: 'home' },
    { id: 'vertraege', label: 'Verträge', icon: 'contracts', screen: 'contracts' },
    { id: 'analyse', label: 'Analyse', icon: 'analysis', screen: 'analysis' },
    { id: 'konten', label: 'Konten', icon: 'wallet', screen: 'accounts' },
    { id: 'profil', label: 'Profil', icon: 'user-circle', screen: 'profile' },
  ];

  const ROUTES = [
    { re: /^vertrag\/([\w-]+)$/, screen: 'contract', keys: ['id'] },
    { re: /^konto\/([\w-]+)$/, screen: 'account', keys: ['id'] },
    { re: /^umsatz\/([\w-]+)$/, screen: 'transaction', keys: ['id'] },
    { re: /^umsaetze$/, screen: 'transactions', keys: [] },
    { re: /^kategorie\/([\w-]+)(?:\/(\d{4}-\d{2}))?$/, screen: 'category', keys: ['id', 'ym'] },
    { re: /^hinweise$/, screen: 'insights', keys: [] },
    { re: /^prognose$/, screen: 'forecast', keys: [] },
  ];

  const nav = { tabs: TABS, current: 'uebersicht', stacks: {}, views: {}, dirty: new Set() };
  let busy = false;

  function parse(path) {
    const clean = String(path || '').replace(/^#?\/?/, '');
    const parts = clean.split('/');
    const tab = TABS.some((t) => t.id === parts[0]) ? parts[0] : 'uebersicht';
    const rest = TABS.some((t) => t.id === parts[0]) ? parts.slice(1).join('/') : '';
    return { tab, rest };
  }

  function resolve(tab, rest) {
    if (!rest) return { screen: TABS.find((t) => t.id === tab).screen, params: {} };
    for (const r of ROUTES) {
      const m = rest.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        return { screen: r.screen, params };
      }
    }
    return null;
  }

  function makeEntry(tab, rest) {
    const route = resolve(tab, rest);
    if (!route) return null;
    const el = document.createElement('section');
    el.className = 'page';
    return { tab, rest: rest || '', path: '/' + tab + (rest ? '/' + rest : ''), screen: route.screen, params: route.params, el, pushed: false };
  }

  /* ---------- Verlauf (Hash) – in gesperrten Umgebungen still ignorieren ---------- */
  function histPush(path) {
    try { history.pushState({ fk: path }, '', '#' + path); return true; } catch (e) { return false; }
  }
  function histReplace(path) {
    try { history.replaceState({ fk: path }, '', '#' + path); } catch (e) { /* ignorieren */ }
  }

  /* ---------- Rendern ---------- */
  function render(entry) {
    const scr = FK.screens[entry.screen];
    const stack = nav.stacks[entry.tab] || [];
    const depth = stack.indexOf(entry);
    let out;
    try {
      out = scr ? scr.render(entry.params, entry) : null;
    } catch (err) {
      console.error(err);
      out = null;
    }
    if (!out) {
      out = { title: 'Nicht gefunden', large: false, body: FK.ui.empty('alert-circle', 'Diese Ansicht gibt es nicht mehr', 'Vielleicht wurde der Eintrag entfernt.') };
    }
    const oldScroll = entry.el.querySelector('.page-scroll');
    const keep = oldScroll ? oldScroll.scrollTop : 0;
    const flags = ['page'];
    if (out.large === false) flags.push('no-large');
    if (entry.el.classList.contains('under')) flags.push('under');
    if (entry.el.classList.contains('scrolled')) flags.push('scrolled');
    entry.el.className = flags.join(' ');
    entry.el.innerHTML = String(html`
      <header class="nav">
        <div class="nav-l">${depth > 0 ? html`<button type="button" class="gbtn" data-action="back" aria-label="Zurück">${icon('chevron-left', 24)}</button>` : out.left || ''}</div>
        <div class="nav-title">${out.title}</div>
        <div class="nav-r">${out.actions || ''}</div>
      </header>
      ${out.refresh ? html`<div class="ptr" aria-hidden="true">${icon('refresh', 20)}</div>` : ''}
      <div class="page-scroll">
        ${out.head ? out.head : out.large === false ? '' : html`<h1 class="large-title">${out.title}</h1>`}
        ${out.body}
      </div>`);
    entry.title = out.title;
    const sc = entry.el.querySelector('.page-scroll');
    sc.scrollTop = keep;
    sc.addEventListener('scroll', () => {
      entry.el.classList.toggle('scrolled', sc.scrollTop > 34);
    }, { passive: true });
    entry.el.classList.toggle('scrolled', sc.scrollTop > 34);
    if (out.refresh) bindPullToRefresh(entry.el, sc);
    if (scr && scr.mount) {
      try { scr.mount(entry.el, entry.params, entry); } catch (err) { console.error(err); }
    }
    nav.dirty.delete(entry);
  }

  function bindPullToRefresh(pageEl, sc) {
    const ptr = pageEl.querySelector('.ptr');
    let startY = null;
    let armed = false;
    sc.addEventListener('touchstart', (e) => {
      startY = sc.scrollTop <= 0 ? e.touches[0].clientY : null;
      armed = false;
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      const p = Math.max(0, Math.min(1, dy / 90));
      ptr.style.opacity = p;
      ptr.style.transform = `rotate(${p * 270}deg)`;
      armed = p >= 1;
    }, { passive: true });
    sc.addEventListener('touchend', () => {
      if (startY == null) return;
      startY = null;
      if (armed) {
        ptr.style.transform = '';
        ptr.style.opacity = '';
        ptr.classList.add('spin');
        FK.actions.sync(null, null, () => ptr.classList.remove('spin'));
      } else {
        ptr.style.opacity = '';
        ptr.style.transform = '';
      }
    });
  }

  function animate(fromEl, toEl, back, done) {
    const dur = FK.reducedMotion() ? 0 : 460;
    const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
    if (!dur || !toEl.animate) { done(); return; }
    busy = true;
    let left = 2;
    const fin = () => { if (--left === 0) { busy = false; done(); } };
    if (!back) {
      toEl.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: dur, easing: ease }).onfinish = fin;
      fromEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-30%)' }], { duration: dur, easing: ease }).onfinish = fin;
    } else {
      toEl.animate([{ transform: 'translateX(-30%)' }, { transform: 'translateX(0)' }], { duration: dur, easing: ease }).onfinish = fin;
      fromEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: dur, easing: ease }).onfinish = fin;
    }
  }

  /* ---------- Stapel-Operationen ---------- */
  function top(tab) {
    const s = nav.stacks[tab || nav.current];
    return s[s.length - 1];
  }

  function ensureRoot(tab) {
    if (!nav.stacks[tab].length) {
      const e = makeEntry(tab, '');
      nav.stacks[tab].push(e);
      nav.views[tab].appendChild(e.el);
      render(e);
    }
  }

  nav.push = function (rest) {
    if (busy) return;
    const tab = nav.current;
    const entry = makeEntry(tab, rest);
    if (!entry) return;
    const from = top(tab);
    if (from && from.path === entry.path) return;
    nav.stacks[tab].push(entry);
    nav.views[tab].appendChild(entry.el);
    render(entry);
    entry.pushed = histPush(entry.path);
    animate(from.el, entry.el, false, () => from.el.classList.add('under'));
    nav.updateChrome();
  };

  function popTop(animated) {
    const stack = nav.stacks[nav.current];
    if (stack.length < 2) return;
    const leaving = stack.pop();
    const showing = stack[stack.length - 1];
    showing.el.classList.remove('under');
    if (nav.dirty.has(showing)) render(showing);
    const finish = () => leaving.el.remove();
    if (animated) animate(leaving.el, showing.el, true, finish);
    else finish();
    nav.updateChrome();
  }

  nav.back = function () {
    if (busy) return;
    if (FK.sheet.closeTop()) return;
    const stack = nav.stacks[nav.current];
    if (stack.length < 2) return;
    const t = stack[stack.length - 1];
    let viaHistory = false;
    try { viaHistory = t.pushed && history.state && history.state.fk === t.path; } catch (e) { viaHistory = false; }
    if (viaHistory) history.back();
    else {
      popTop(true);
      histReplace(top().path);
    }
  };

  nav.popToRoot = function () {
    const stack = nav.stacks[nav.current];
    if (stack.length < 2) {
      const sc = stack[0].el.querySelector('.page-scroll');
      if (sc) sc.scrollTo({ top: 0, behavior: FK.reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const leaving = stack[stack.length - 1];
    while (stack.length > 2) stack.splice(1, 1)[0].el.remove();
    const root = stack[0];
    stack.pop();
    root.el.classList.remove('under');
    if (nav.dirty.has(root)) render(root);
    animate(leaving.el, root.el, true, () => leaving.el.remove());
    histReplace(root.path);
    nav.updateChrome();
  };

  nav.switchTab = function (tab) {
    if (busy) return;
    if (tab === nav.current) { nav.popToRoot(); return; }
    nav.views[nav.current].classList.remove('active');
    nav.current = tab;
    ensureRoot(tab);
    nav.views[tab].classList.add('active');
    for (const e of nav.stacks[tab]) if (nav.dirty.has(e)) render(e);
    histReplace(top(tab).path);
    nav.updateChrome();
  };

  /** Ziel: „vertrag/x“ (im aktuellen Tab öffnen) oder „/vertraege/vertrag/x“ (Tab wechseln) */
  nav.go = function (target) {
    if (!target || busy) return;
    if (target.charAt(0) === '/') {
      const { tab, rest } = parse(target);
      if (tab !== nav.current) {
        nav.switchTab(tab);
        resetToRoot(tab);
      } else if (!rest) {
        nav.popToRoot();
        return;
      }
      if (rest) nav.push(rest);
      return;
    }
    nav.push(target);
  };

  function resetToRoot(tab) {
    const stack = nav.stacks[tab];
    if (stack.length < 2) return;
    while (stack.length > 1) stack.pop().el.remove();
    stack[0].el.classList.remove('under');
    if (nav.dirty.has(stack[0])) render(stack[0]);
    histReplace(stack[0].path);
    nav.updateChrome();
  }

  /** Stapel aus einer URL aufbauen (Start, Vor/Zurück im Browser) */
  nav.open = function (path, initial) {
    const { tab, rest } = parse(path);
    if (nav.current !== tab) {
      nav.views[nav.current].classList.remove('active');
      nav.current = tab;
    }
    nav.views[tab].classList.add('active');
    const stack = nav.stacks[tab];
    while (stack.length > 1) stack.pop().el.remove();
    ensureRoot(tab);
    stack[0].el.classList.remove('under');
    if (rest) {
      const e = makeEntry(tab, rest);
      if (e) {
        stack.push(e);
        nav.views[tab].appendChild(e.el);
        render(e);
        stack[0].el.classList.add('under');
        if (initial) {
          histReplace(stack[0].path);
          e.pushed = histPush(e.path);
        }
      } else if (initial) histReplace(stack[0].path);
    } else if (initial) histReplace(stack[0].path);
    nav.updateChrome();
  };

  /** Alle Seiten neu zeichnen – sichtbare sofort, verdeckte beim nächsten Anzeigen */
  nav.refresh = function () {
    for (const t of TABS) {
      for (const e of nav.stacks[t.id]) {
        const visible = t.id === nav.current && e === top(t.id);
        if (visible) render(e);
        else nav.dirty.add(e);
      }
    }
  };

  nav.top = () => top();

  nav.updateChrome = function () {
    const idx = TABS.findIndex((t) => t.id === nav.current);
    const bar = document.querySelector('.tabbar');
    if (!bar) return;
    bar.querySelectorAll('.tab').forEach((b, i) => {
      if (i === idx) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const pill = bar.querySelector('.tab-pill');
    if (pill) pill.style.transform = `translateX(${idx * 100}%)`;
    const t = top();
    document.title = (t && t.title ? t.title + ' – ' : '') + FK.config.appName;
  };

  nav.tabbarHTML = () => html`<nav class="tabbar" aria-label="Hauptnavigation">
    <span class="tab-pill" aria-hidden="true"></span>
    ${TABS.map((t) => html`<button type="button" class="tab" data-tab="${t.id}">${icon(t.icon, 25)}<span>${t.label}</span></button>`)}
  </nav>`;

  /* ---------- Wischen vom linken Rand (nur als Home-Bildschirm-App, Safari hat sonst eigene Geste) ---------- */
  function bindEdgeSwipe(container) {
    let st = null;
    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || busy) return;
      const rect = container.getBoundingClientRect();
      const scale = rect.width / container.clientWidth || 1;
      const x = (e.clientX - rect.left) / scale;
      const stack = nav.stacks[nav.current];
      if (x > 22 || stack.length < 2) return;
      st = { x0: e.clientX, t0: performance.now(), scale, w: container.clientWidth, top: stack[stack.length - 1], under: stack[stack.length - 2], dx: 0 };
      st.under.el.classList.remove('under');
    });
    container.addEventListener('pointermove', (e) => {
      if (!st) return;
      st.dx = Math.max(0, (e.clientX - st.x0) / st.scale);
      st.top.el.style.transform = `translateX(${st.dx}px)`;
      st.under.el.style.transform = `translateX(${-30 + (st.dx / st.w) * 30}%)`;
    });
    const end = () => {
      if (!st) return;
      const s = st;
      st = null;
      const v = s.dx / Math.max(1, performance.now() - s.t0);
      const complete = s.dx > s.w * 0.35 || v > 0.5;
      const dur = 260;
      const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
      const fromTop = `translateX(${s.dx}px)`;
      const fromUnder = `translateX(${-30 + (s.dx / s.w) * 30}%)`;
      s.top.el.style.transform = '';
      s.under.el.style.transform = '';
      if (complete) {
        busy = true;
        s.top.el.animate([{ transform: fromTop }, { transform: 'translateX(100%)' }], { duration: dur, easing: ease, fill: 'forwards' });
        s.under.el.animate([{ transform: fromUnder }, { transform: 'translateX(0)' }], { duration: dur, easing: ease }).onfinish = () => {
          busy = false;
          const stack = nav.stacks[nav.current];
          if (stack[stack.length - 1] === s.top) {
            let viaHistory = false;
            try { viaHistory = s.top.pushed && history.state && history.state.fk === s.top.path; } catch (e) { viaHistory = false; }
            skipAnim = viaHistory;
            if (viaHistory) history.back();
            else { popTop(false); histReplace(top().path); }
          }
        };
      } else {
        s.top.el.animate([{ transform: fromTop }, { transform: 'translateX(0)' }], { duration: dur, easing: ease });
        s.under.el.animate([{ transform: fromUnder }, { transform: 'translateX(-30%)' }], { duration: dur, easing: ease }).onfinish = () => s.under.el.classList.add('under');
      }
    };
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);
  }

  let skipAnim = false;
  window.addEventListener('popstate', () => {
    if (FK.sheet.count()) FK.sheet.closeTop();
    const path = (location.hash || '').slice(1) || '/uebersicht';
    const { tab } = parse(path);
    const stack = nav.stacks[nav.current];
    if (tab === nav.current && stack.length >= 2 && stack[stack.length - 2].path === path) {
      popTop(!skipAnim);
      skipAnim = false;
      return;
    }
    skipAnim = false;
    if (top() && top().path === path) return;
    nav.open(path, false);
  });

  nav.init = function (container) {
    for (const t of TABS) {
      const v = document.createElement('div');
      v.className = 'tab-view';
      v.dataset.tab = t.id;
      container.appendChild(v);
      nav.views[t.id] = v;
      nav.stacks[t.id] = [];
    }
    let standalone = false;
    try { standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { standalone = false; }
    if (standalone) bindEdgeSwipe(container);
    nav.open((location.hash || '').slice(1) || '/uebersicht', true);
  };

  FK.nav = nav;
})(window.FK);
