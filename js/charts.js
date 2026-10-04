/* Finanzkompass – SVG-Diagramme: Linie/Fläche (Kontostand & Prognose) und Säulen (Monatsvergleich).
   Dünne Marken, Haarlinien-Raster, Fadenkreuz + Tooltip, Tastaturbedienung. */
(function (FK) {
  'use strict';
  const eur = FK.fmt.eur;
  const eurAxis = FK.fmt.eurAxis;
  const esc = FK.esc;

  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return { lo, hi, ticks };
  }

  /** Breite messen und bei Größenänderung neu zeichnen */
  function responsive(el, draw) {
    let lastW = 0;
    let ro = null;
    const run = () => {
      if (ro && !el.isConnected) { ro.disconnect(); return; }
      const w = el.clientWidth;
      if (!w || w === lastW) return;
      lastW = w;
      draw(w);
    };
    run();
    if (!lastW) requestAnimationFrame(run);
    if (window.ResizeObserver) {
      ro = new ResizeObserver(run);
      ro.observe(el);
    }
  }

  /** Zeigerposition in Diagrammkoordinaten (berücksichtigt die Skalierung des Gerätrahmens) */
  function localX(el, ev) {
    const rect = el.getBoundingClientRect();
    const scale = rect.width / el.clientWidth || 1;
    return (ev.clientX - rect.left) / scale;
  }

  function placeTip(tip, el, x, y) {
    const w = el.clientWidth;
    const tw = tip.offsetWidth;
    const left = Math.max(0, Math.min(w - tw, x - tw / 2));
    tip.style.transform = `translate(${left}px, ${Math.max(-6, y)}px)`;
  }

  /**
   * Linien-/Flächendiagramm
   * cfg: points [{date, value, kind:'actual'|'forecast'}], height, yAxis, endLabel, todayLabel, xLabels [{i,text}], tipTitle(p)
   */
  function line(el, cfg) {
    el.classList.add('chart');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'img');
    if (cfg.label) el.setAttribute('aria-label', cfg.label);
    const pts = cfg.points;
    const n = pts.length;
    const splitAt = pts.findIndex((p) => p.kind === 'forecast');
    const lastActual = splitAt === -1 ? n - 1 : Math.max(0, splitAt - 1);
    let geom = null;
    let active = null;

    function draw(W) {
      const H = cfg.height || 160;
      const padL = cfg.yAxis ? 50 : 6;
      const padR = cfg.endLabel ? 70 : 10;
      const padT = 16;
      const padB = cfg.xLabels ? 24 : 8;
      const vals = pts.map((p) => p.value);
      let min = Math.min(...vals);
      let max = Math.max(...vals);
      if (cfg.includeZero) { min = Math.min(0, min); max = Math.max(0, max); }
      const pad = (max - min) * 0.08 || 10;
      const t = niceTicks(min - pad, max + pad, cfg.ticks || 3);
      const lo = cfg.yAxis ? t.lo : min - pad;
      const hi = cfg.yAxis ? t.hi : max + pad;
      const x = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR);
      const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
      const base = H - padB;
      // Fläche zur Nulllinie, wenn der Wertebereich sie schneidet (z. B. Kreditkarte)
      const areaBase = lo < 0 && hi > 0 ? y(0) : base;
      const path = (from, to) => {
        let d = '';
        for (let i = from; i <= to; i++) d += (i === from ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(pts[i].value).toFixed(1);
        return d;
      };
      let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
      if (cfg.yAxis) {
        for (const tv of t.ticks) {
          const ty = Math.round(y(tv)) + 0.5;
          s += `<line class="grid" x1="${padL}" x2="${W - padR + 6}" y1="${ty}" y2="${ty}"/>`;
          s += `<text class="chart-amt" x="${padL - 8}" y="${ty + 4}" text-anchor="end">${esc(eurAxis(tv))}</text>`;
        }
      } else {
        s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
      }
      if (lo < 0 && hi > 0) s += `<line class="zero" x1="${padL}" x2="${W - padR}" y1="${Math.round(y(0)) + 0.5}" y2="${Math.round(y(0)) + 0.5}"/>`;
      // Fläche unter dem tatsächlichen Verlauf
      const areaTo = lastActual;
      if (areaTo > 0) {
        s += `<path d="${path(0, areaTo)}L${x(areaTo).toFixed(1)} ${areaBase.toFixed(1)}L${x(0).toFixed(1)} ${areaBase.toFixed(1)}Z" fill="var(--chart-wash)" stroke="none"/>`;
      }
      s += `<path d="${path(0, lastActual)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (splitAt > 0) {
        s += `<path d="${path(lastActual, n - 1)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round"/>`;
      }
      // Heute-Markierung
      if (splitAt > 0 && cfg.todayLabel) {
        const tx = Math.round(x(lastActual)) + 0.5;
        s += `<line class="grid" x1="${tx}" x2="${tx}" y1="${padT - 6}" y2="${base}"/>`;
      }
      const dot = (i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(pts[i].value).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--chart-surface)" stroke-width="2"/>`;
      if (splitAt > 0) s += dot(lastActual);
      s += dot(n - 1);
      if (cfg.endLabel) {
        const ey = y(pts[n - 1].value);
        s += `<text class="strong chart-amt" x="${(x(n - 1) + 9).toFixed(1)}" y="${(ey - 2).toFixed(1)}">${esc(eur(pts[n - 1].value, { decimals: 0 }))}</text>`;
        s += `<text x="${(x(n - 1) + 9).toFixed(1)}" y="${(ey + 12).toFixed(1)}">${esc(cfg.endLabel)}</text>`;
      }
      if (cfg.xLabels) {
        for (const l of cfg.xLabels) {
          const anchor = l.i === 0 ? 'start' : l.i === n - 1 ? 'end' : 'middle';
          s += `<text x="${x(l.i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}"${l.strong ? ' class="strong"' : ''}>${esc(l.text)}</text>`;
        }
      }
      s += `<line class="cross" x1="0" x2="0" y1="${padT - 6}" y2="${base}"/>`;
      s += `<circle class="hover-dot" r="5" fill="var(--accent)" stroke="var(--chart-surface)" stroke-width="2" cx="-20" cy="-20"/>`;
      s += '</svg><div class="chart-tip" aria-hidden="true"></div>';
      el.innerHTML = s;
      geom = { x, y, W, padL, padR, padT };
      if (active != null) show(active);
    }

    function show(i) {
      if (!geom) return;
      active = i;
      const p = pts[i];
      const cx = geom.x(i);
      const cy = geom.y(p.value);
      el.classList.add('active');
      const cross = el.querySelector('.cross');
      cross.setAttribute('x1', cx.toFixed(1));
      cross.setAttribute('x2', cx.toFixed(1));
      const hd = el.querySelector('.hover-dot');
      hd.setAttribute('cx', cx.toFixed(1));
      hd.setAttribute('cy', cy.toFixed(1));
      const tip = el.querySelector('.chart-tip');
      tip.textContent = '';
      const strong = document.createElement('strong');
      strong.className = 'amt';
      strong.textContent = eur(p.value);
      const sub = document.createElement('span');
      const key = document.createElement('i');
      key.className = 'key' + (p.kind === 'forecast' ? ' dash' : '');
      sub.appendChild(key);
      sub.appendChild(document.createTextNode(cfg.tipTitle ? cfg.tipTitle(p) : FK.dfmt.wdShort(p.date)));
      tip.appendChild(strong);
      tip.appendChild(sub);
      placeTip(tip, el, cx, -46);
    }
    function hide() {
      active = null;
      el.classList.remove('active');
    }
    function indexAt(px) {
      const span = geom.W - geom.padL - geom.padR;
      return Math.max(0, Math.min(n - 1, Math.round(((px - geom.padL) / span) * (n - 1))));
    }

    let hideTimer = null;
    el.addEventListener('pointermove', (e) => {
      if (!geom) return;
      clearTimeout(hideTimer);
      show(indexAt(localX(el, e)));
    });
    el.addEventListener('pointerdown', (e) => {
      if (!geom) return;
      clearTimeout(hideTimer);
      show(indexAt(localX(el, e)));
    });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') hideTimer = setTimeout(hide, 1600); });
    el.addEventListener('pointercancel', () => { hideTimer = setTimeout(hide, 600); });
    el.addEventListener('focus', () => show(active != null ? active : lastActual));
    el.addEventListener('blur', hide);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = active == null ? lastActual : active + (e.key === 'ArrowRight' ? 1 : -1);
      show(Math.max(0, Math.min(n - 1, i)));
    });

    responsive(el, draw);
  }

  /**
   * Säulendiagramm mit Hervorhebung des gewählten Monats
   * cfg: data [{label, value, title}], selected, height, onSelect(i)
   */
  function columns(el, cfg) {
    el.classList.add('chart');
    const data = cfg.data;
    const n = data.length;

    function draw(W) {
      const H = cfg.height || 170;
      const padL = 46;
      const padR = 4;
      const padT = 22;
      const padB = 24;
      const max = Math.max(1, ...data.map((d) => d.value));
      const t = niceTicks(0, max, 3);
      const hi = t.hi;
      const slot = (W - padL - padR) / n;
      const bw = Math.min(24, slot * 0.5);
      const y = (v) => padT + (1 - v / hi) * (H - padT - padB);
      const base = H - padB;
      let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
      for (const tv of t.ticks) {
        const ty = Math.round(y(tv)) + 0.5;
        s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${ty}" y2="${ty}"/>`;
        s += `<text class="chart-amt" x="${padL - 8}" y="${ty + 4}" text-anchor="end">${esc(eurAxis(tv))}</text>`;
      }
      data.forEach((d, i) => {
        const cx = padL + slot * (i + 0.5);
        const x0 = cx - bw / 2;
        const top = y(d.value);
        const h = base - top;
        const r = Math.min(4, h, bw / 2);
        const sel = i === cfg.selected;
        if (h > 0.5) {
          s += `<path d="M${x0.toFixed(1)} ${base}V${(top + r).toFixed(1)}Q${x0.toFixed(1)} ${top.toFixed(1)} ${(x0 + r).toFixed(1)} ${top.toFixed(1)}H${(x0 + bw - r).toFixed(1)}Q${(x0 + bw).toFixed(1)} ${top.toFixed(1)} ${(x0 + bw).toFixed(1)} ${(top + r).toFixed(1)}V${base}Z" fill="${sel ? 'var(--accent)' : 'var(--chart-muted)'}"/>`;
        }
        if (sel) s += `<text class="strong chart-amt" x="${cx.toFixed(1)}" y="${(top - 7).toFixed(1)}" text-anchor="middle">${esc(eur(d.value, { decimals: 0 }))}</text>`;
        s += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle"${sel ? ' class="strong"' : ''}>${esc(d.label)}</text>`;
      });
      s += '</svg>';
      // Trefferflächen als echte Buttons (größer als die Säule)
      let hits = '';
      data.forEach((d, i) => {
        const left = padL + slot * i;
        hits += `<button type="button" class="col-hit" data-i="${i}" aria-pressed="${i === cfg.selected}" aria-label="${esc(d.title)}: ${esc(eur(d.value))}" style="position:absolute;top:0;height:${H}px;left:${left.toFixed(1)}px;width:${slot.toFixed(1)}px;border-radius:10px"></button>`;
      });
      el.innerHTML = s + hits + '<div class="chart-tip" aria-hidden="true"></div>';
      el.querySelectorAll('.col-hit').forEach((b) => {
        const i = Number(b.dataset.i);
        b.addEventListener('click', () => cfg.onSelect && cfg.onSelect(i));
        b.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse') return;
          const tip = el.querySelector('.chart-tip');
          tip.innerHTML = '';
          const st = document.createElement('strong');
          st.className = 'amt';
          st.textContent = eur(data[i].value);
          const sp = document.createElement('span');
          sp.textContent = data[i].title;
          tip.appendChild(st);
          tip.appendChild(sp);
          el.classList.add('active');
          placeTip(tip, el, padL + slot * (i + 0.5), y(data[i].value) - 58);
        });
        b.addEventListener('pointerleave', () => el.classList.remove('active'));
      });
    }

    responsive(el, draw);
  }

  FK.charts = { line, columns, niceTicks };
})(window.FK);
