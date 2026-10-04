/* Finanzkompass – Zustand (localStorage) und Auswertungen: Salden, Monatsanalyse, Verträge, Prognose, Hinweise */
(function (FK) {
  'use strict';
  const D = FK.date;
  const C = FK.catalog;
  const U = FK.util;
  const r2 = FK.fmt.round2;
  const eur = FK.fmt.eur;

  const defaults = () => ({
    v: 1,
    settings: { theme: 'system', hideAmounts: false, notifications: true, appLock: false, plus: false },
    budgets: { lebensmittel: 380, restaurants: 160, shopping: 200, freizeit: 120 },
    txCategory: {},
    merchantRules: {},
    notes: {},
    cancellations: {},
    reminders: {},
    customContracts: [],
    addedAccounts: [],
    dismissed: {},
    lastSync: Date.now(),
  });

  const store = {
    state: null,
    data: null,
    contractsBase: [],
    version: 0,
    ui: { analysisMonth: null, analysisMode: 'expense', txFilter: 'all', contractsView: 'monthly', accountRange: 90 },
  };
  const listeners = new Set();
  let cache = new Map();

  function memo(key, fn) {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  }
  function emit(info) { listeners.forEach((fn) => fn(info || {})); }

  store.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  store.load = function () {
    const saved = FK.storage.get(FK.config.storageKey, null);
    const base = defaults();
    store.state = Object.assign(base, saved || {});
    store.state.settings = Object.assign(defaults().settings, (saved && saved.settings) || {});
    store.rebuild();
  };

  store.save = () => FK.storage.set(FK.config.storageKey, store.state);

  store.rebuild = function () {
    const now = new Date();
    store.contractsBase = resolveContracts(now);
    store.data = FK.data.generate(now, store.state, store.contractsBase);
    if (!store.ui.analysisMonth) store.ui.analysisMonth = D.ym(store.data.today);
    store.version++;
    cache = new Map();
  };

  /** Zustand ändern, speichern, neu auswerten und alle Ansichten benachrichtigen */
  store.update = function (fn, opts) {
    fn(store.state);
    store.save();
    if (opts && opts.rebuild) store.rebuild();
    else { store.version++; cache = new Map(); }
    emit(opts);
  };

  store.reset = function () {
    FK.storage.remove(FK.config.storageKey);
    store.state = defaults();
    store.ui.analysisMonth = null;
    store.rebuild();
    emit({ reset: true });
  };

  store.sync = function () {
    store.state.lastSync = Date.now();
    store.save();
    store.rebuild();
    emit({ sync: true });
  };

  store.setting = (key) => store.state.settings[key];

  /* ---------- Verträge auflösen (inkl. eigener Verträge und Kündigungen) ---------- */
  function resolveContracts(now) {
    const curYM = D.ym(now);
    const st = store.state;
    const list = C.contracts.map((c) => Object.assign({}, c, { prices: FK.data.resolvePrices(c.prices, curYM) }));
    for (const cc of st.customContracts || []) {
      list.push(Object.assign({}, cc, {
        custom: true,
        prices: [{ since: cc.since.slice(0, 7), amount: cc.amount }],
        terms: { kind: 'notice', months: 1, label: '1 Monat zum Monatsende (angenommen)' },
      }));
    }
    for (const c of list) {
      const canc = st.cancellations[c.id];
      if (canc) { c.cancelled = canc; c.endsOn = canc.endDate; }
    }
    return list;
  }

  /* ---------- Grundlagen ---------- */
  store.today = () => store.data.today;
  store.curYM = () => D.ym(store.data.today);
  store.dayIndex = (d) => D.diffDays(store.data.start, typeof d === 'string' ? D.parse(d) : d);
  store.accounts = () => store.data.accounts;
  store.account = (id) => store.data.accounts.find((a) => a.id === id) || null;
  store.balance = (id) => store.data.balances[id] || 0;
  store.balanceSeries = (id, days) => {
    const arr = store.data.daily[id] || [];
    const n = Math.min(days, arr.length);
    const out = [];
    for (let i = arr.length - n; i < arr.length; i++) {
      out.push({ date: D.ymd(D.addDays(store.data.start, i)), value: arr[i] });
    }
    return out;
  };

  store.totals = () => memo('totals', () => {
    const t = { giro: 0, credit: 0, savings: 0, depot: 0 };
    for (const a of store.data.accounts) t[a.type] += store.balance(a.id);
    t.liquid = r2(t.giro + t.credit + t.savings);
    t.total = r2(t.liquid + t.depot);
    // Veränderung seit Monatsbeginn
    const idx = store.dayIndex(D.addDays(D.startOfMonth(store.data.today), -1));
    let before = 0;
    for (const a of store.data.accounts) before += (store.data.daily[a.id][idx] != null ? store.data.daily[a.id][idx] : a.start || 0);
    t.monthDelta = r2(t.total - before);
    return t;
  });

  /* ---------- Umsätze ---------- */
  store.categoryOf = (t) => store.state.txCategory[t.id] || (t.merchantId && store.state.merchantRules[t.merchantId]) || t.categoryId;

  store.txs = () => memo('txs', () => store.data.txs.map((t) => {
    const cat = store.categoryOf(t);
    return Object.assign({}, t, { categoryId: cat, origCategoryId: t.categoryId, note: store.state.notes[t.id] || '' });
  }));

  store.txMap = () => memo('txmap', () => {
    const m = new Map();
    store.txs().forEach((t) => m.set(t.id, t));
    return m;
  });
  store.tx = (id) => store.txMap().get(id) || null;

  /** Filter: accountId, ym, categoryId, kind (all|expense|income|contracts|transfers), q */
  store.queryTxs = function (f) {
    const q = f.q ? U.normalize(f.q.trim()) : '';
    return store.txs().filter((t) => {
      if (f.accountId && t.accountId !== f.accountId) return false;
      if (f.ym && !t.date.startsWith(f.ym)) return false;
      if (f.categoryId && t.categoryId !== f.categoryId) return false;
      if (f.merchantId && t.merchantId !== f.merchantId) return false;
      if (f.kind && f.kind !== 'all') {
        const type = C.cat(t.categoryId).type;
        if (f.kind === 'expense' && !(type === 'expense' && t.amount < 0)) return false;
        if (f.kind === 'income' && !(type === 'income' && t.amount > 0)) return false;
        if (f.kind === 'contracts' && !t.contractId) return false;
        if (f.kind === 'transfers' && !(type === 'transfer' || type === 'saving')) return false;
      }
      if (q) {
        const hay = U.normalize(`${t.name} ${t.purpose} ${C.cat(t.categoryId).name} ${FK.fmt.eur(t.amount)} ${t.note}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  /* ---------- Monatsauswertung ---------- */
  /** uptoDay: nur Umsätze bis zu diesem Tag des Monats (für faire Vergleiche im laufenden Monat) */
  store.month = (ym, uptoDay) => memo(`m:${ym}:${uptoDay || ''}`, () => {
    const exp = new Map();
    const inc = new Map();
    let income = 0;
    let expense = 0;
    let saved = 0;
    const list = [];
    for (const t of store.txs()) {
      if (!t.date.startsWith(ym)) continue;
      if (uptoDay && Number(t.date.slice(8, 10)) > uptoDay) continue;
      list.push(t);
      const c = C.cat(t.categoryId);
      if (c.type === 'expense') {
        expense -= t.amount;
        const e = exp.get(c.id) || { id: c.id, amount: 0, count: 0 };
        e.amount -= t.amount; e.count++;
        exp.set(c.id, e);
      } else if (c.type === 'income') {
        income += t.amount;
        const e = inc.get(c.id) || { id: c.id, amount: 0, count: 0 };
        e.amount += t.amount; e.count++;
        inc.set(c.id, e);
      } else if (c.type === 'saving' && t.amount < 0) {
        saved -= t.amount;
      }
    }
    const sortCats = (m) => [...m.values()].map((e) => Object.assign(e, { amount: r2(e.amount) }))
      .filter((e) => Math.abs(e.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
    return {
      ym, income: r2(income), expense: r2(expense), saved: r2(saved), net: r2(income - expense),
      expenseCats: sortCats(exp), incomeCats: sortCats(inc), txs: list,
    };
  });

  store.months = () => memo('months', () => {
    const out = [];
    for (let d = D.startOfMonth(store.data.start); d <= store.data.today; d = D.addMonths(d, 1)) out.push(D.ym(d));
    return out;
  });

  /** Vergleich zum Vormonat; im laufenden Monat nur bis zum selben Tag */
  store.compare = (ym, mode) => memo(`cmp:${ym}:${mode}`, () => {
    const prev = D.ymAdd(ym, -1);
    if (!store.months().includes(prev)) return null;
    const isCur = ym === store.curYM();
    const day = isCur ? store.data.today.getDate() : null;
    const a = store.month(ym);
    const b = store.month(prev, day);
    const key = mode === 'income' ? 'income' : 'expense';
    const delta = a[key] - b[key];
    return { prev, partial: isCur, day, prevValue: b[key], delta: r2(delta), ratio: b[key] ? delta / b[key] : null };
  });

  /** Summe einer Kategorie (oder aller Ausgaben/Einnahmen) über die letzten n Monate bis ym */
  store.series = (ym, n, mode, categoryId) => memo(`ser:${ym}:${n}:${mode}:${categoryId || ''}`, () => {
    const months = store.months();
    const end = months.indexOf(ym);
    const out = [];
    for (let i = Math.max(0, end - n + 1); i <= end; i++) {
      const m = store.month(months[i]);
      let v;
      if (categoryId) {
        const list = mode === 'income' ? m.incomeCats : m.expenseCats;
        const e = list.find((x) => x.id === categoryId);
        v = e ? e.amount : 0;
      } else v = mode === 'income' ? m.income : m.expense;
      out.push({ ym: months[i], value: r2(v) });
    }
    return out;
  });

  /* ---------- Budgets ---------- */
  store.budgets = (ym) => memo('bud:' + ym, () => {
    const m = store.month(ym);
    const isCur = ym === store.curYM();
    const today = store.data.today;
    const daysLeft = isCur ? D.dim(today.getFullYear(), today.getMonth()) - today.getDate() + 1 : 0;
    return Object.entries(store.state.budgets).map(([catId, limit]) => {
      const e = m.expenseCats.find((x) => x.id === catId);
      const spent = e ? e.amount : 0;
      const ratio = limit > 0 ? spent / limit : 0;
      const remaining = r2(limit - spent);
      return {
        catId, limit, spent, ratio, remaining,
        status: ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok',
        perDay: isCur && remaining > 0 ? r2(remaining / daysLeft) : null,
      };
    }).sort((a, b) => b.ratio - a.ratio);
  });

  /* ---------- Verträge ---------- */
  const intervalLabel = { monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich' };
  store.intervalLabel = (c) => intervalLabel[c.interval] || 'monatlich';

  function nextDue(c, today) {
    const dates = FK.data.bookingDates(c, D.addDays(today, 1), D.addMonths(today, 14));
    return dates[0] || null;
  }

  function cancelInfo(c, today) {
    const t = c.terms || { kind: 'period' };
    const y = today.getFullYear();
    const m = today.getMonth();
    if (c.cancelable === false || t.kind === 'none') return { possible: false, label: t.label, hint: c.cancelHint };
    let end;
    let deadline = null;
    if (t.kind === 'period') {
      const n = nextDue(c, today);
      end = n ? D.addDays(n, -1) : D.endOfMonth(today);
    } else if (t.kind === 'notice') {
      end = D.endOfMonth(D.shiftMonths(today, t.months));
    } else if (t.kind === 'toDay') {
      const inTime = today.getDate() <= t.day;
      end = inTime ? D.endOfMonth(today) : D.endOfMonth(D.addMonths(today, 1));
      deadline = inTime ? new Date(y, m, t.day) : new Date(y, m + 1, t.day);
    } else if (t.kind === 'yearly') {
      const [mm, dd] = t.renewal.split('-').map(Number);
      let R = new Date(y, mm - 1, dd);
      if (R <= today) R = new Date(y + 1, mm - 1, dd);
      let dl = D.addDays(D.shiftMonths(R, -t.noticeMonths), -1);
      if (today > dl) {
        R = new Date(R.getFullYear() + 1, mm - 1, dd);
        dl = D.addDays(D.shiftMonths(R, -t.noticeMonths), -1);
      }
      end = D.addDays(R, -1);
      deadline = dl;
    } else if (t.kind === 'minterm') {
      const E = D.parse(t.endsOn);
      const dl = D.shiftMonths(E, -t.noticeMonths);
      if (today <= dl) { end = E; deadline = dl; } else end = D.endOfMonth(D.shiftMonths(today, 1));
    }
    return { possible: true, end, deadline, label: t.label, hint: c.cancelHint };
  }

  function priceChange(c, today) {
    if (c.prices.length < 2) return null;
    const last = c.prices[c.prices.length - 1];
    const prev = c.prices[c.prices.length - 2];
    const ageMonths = (today.getFullYear() - Number(last.since.slice(0, 4))) * 12 + today.getMonth() + 1 - Number(last.since.slice(5, 7));
    return { from: prev.amount, to: last.amount, since: last.since, ratio: (last.amount - prev.amount) / prev.amount, recent: ageMonths <= 3 && ageMonths >= 0 };
  }

  store.contracts = () => memo('contracts', () => {
    const today = store.data.today;
    const byContract = U.groupBy(store.txs().filter((t) => t.contractId), (t) => t.contractId);
    return store.contractsBase.map((c) => {
      const amount = FK.data.priceAt(c, today);
      const months = FK.data.intervalMonths(c);
      const monthly = amount / months;
      return Object.assign({}, c, {
        amount,
        monthly,
        yearly: monthly * 12,
        next: nextDue(c, today),
        payments: byContract.get(c.id) || [],
        change: priceChange(c, today),
        cancel: cancelInfo(c, today),
        status: c.cancelled ? 'cancelled' : 'active',
        account: c.account,
      });
    });
  });
  store.contract = (id) => store.contracts().find((c) => c.id === id) || null;

  store.contractSummary = () => memo('csum', () => {
    const list = store.contracts();
    const active = list.filter((c) => c.status === 'active');
    const groups = C.contractGroups.map((g, i) => {
      const items = active.filter((c) => c.group === g.id);
      return { id: g.id, name: g.name, slot: i + 1, monthly: r2(U.sum(items, (c) => c.monthly)), count: items.length };
    });
    const monthly = r2(U.sum(active, (c) => c.monthly));
    const nonMonthly = active.filter((c) => c.interval !== 'monthly');
    const reserve = r2(U.sum(nonMonthly, (c) => c.monthly));
    const savings = active.filter((c) => c.savings);
    const cancelled = list.filter((c) => c.status === 'cancelled');
    return {
      monthly, yearly: r2(monthly * 12), count: active.length, groups, reserve, nonMonthly,
      savingsTotal: U.sum(savings, (c) => c.savings.perYear), savings,
      cancelled, cancelledYearly: r2(U.sum(cancelled, (c) => c.yearly)),
    };
  });

  /* ---------- Prognose (Girokonto bis Monatsende) ---------- */
  function avgVariablePerDay(accountId, days) {
    const today = store.data.today;
    const from = D.ymd(D.addDays(today, -days));
    const to = D.ymd(today);
    let s = 0;
    for (const t of store.txs()) {
      if (t.accountId !== accountId || t.date <= from || t.date > to) continue;
      if (t.contractId || t.transferId || t.amount >= 0) continue;
      if (C.cat(t.categoryId).type !== 'expense') continue;
      if (t.amount < -300) continue; // Ausreißer wie Reisen nicht hochrechnen
      s += t.amount;
    }
    return s / days;
  }

  /** Geplante Buchungen (Verträge, Gehalt, Sparen, Kreditkarte) für ein Konto im Zeitraum */
  store.scheduled = function (accountId, from, to) {
    const items = [];
    for (const c of store.contracts()) {
      if (c.account !== accountId) continue;
      for (const d of FK.data.bookingDates(c, from, to)) {
        items.push({ date: D.ymd(d), name: c.provider, sub: c.product, amount: -FK.data.priceAt(c, d), kind: 'contract', contractId: c.id, merchantId: c.merchant });
      }
    }
    if (accountId === 'giro') {
      for (let mm = D.startOfMonth(from); mm <= to; mm = D.addMonths(mm, 1)) {
        const y = mm.getFullYear();
        const m = mm.getMonth();
        const sal = D.lastBankDayOfMonth(y, m);
        if (sal >= from && sal <= to) items.push({ date: D.ymd(sal), name: 'Nordlicht Software GmbH', sub: m === 10 ? 'Gehalt inkl. Weihnachtsgeld' : 'Gehalt', amount: r2(FK.data.SALARY + (m === 10 ? FK.data.XMAS_BONUS : 0)), kind: 'income', merchantId: 'nordlicht' });
        const sv = D.nthBankDay(y, m, 2);
        if (sv >= from && sv <= to) {
          items.push({ date: D.ymd(sv), name: 'ING Tagesgeld', sub: 'Dauerauftrag Rücklage', amount: -FK.data.SAVE_TAGESGELD, kind: 'transfer', merchantId: 'ing' });
          items.push({ date: D.ymd(sv), name: 'Trade Republic', sub: 'ETF-Sparplan', amount: -FK.data.SAVE_ETF, kind: 'transfer', merchantId: 'traderepublic' });
        }
        const cc = D.nextBankDay(new Date(y, m, 22));
        if (cc >= from && cc <= to) {
          // Schätzung: aktueller Kartensaldo + bis dahin fällige Kartenverträge + Ø Kartenausgaben
          const days = D.diffDays(store.data.today, cc);
          let est = -store.balance('visa');
          for (const c of store.contracts()) {
            if (c.account !== 'visa') continue;
            for (const d of FK.data.bookingDates(c, D.addDays(store.data.today, 1), D.addDays(cc, -1))) est += FK.data.priceAt(c, d);
          }
          est += -avgVariablePerDay('visa', 90) * Math.max(0, days - 1);
          if (est > 1) items.push({ date: D.ymd(cc), name: 'DKB Visa', sub: 'Kreditkartenabrechnung (geschätzt)', amount: -r2(est), kind: 'transfer', merchantId: 'dkb', estimate: true });
        }
      }
    }
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));
  };

  store.forecast = (accountId) => memo('fc:' + (accountId || 'giro'), () => {
    const acc = accountId || 'giro';
    const today = store.data.today;
    const start = D.startOfMonth(today);
    const end = D.endOfMonth(today);
    const daily = store.data.daily[acc];
    const points = [];
    for (let d = start; d <= today; d = D.addDays(d, 1)) points.push({ date: D.ymd(d), value: daily[store.dayIndex(d)], kind: 'actual' });
    const current = store.balance(acc);
    const items = store.scheduled(acc, D.addDays(today, 1), end);
    const perDay = avgVariablePerDay(acc, 90);
    const byDate = U.groupBy(items, (i) => i.date);
    let v = current;
    for (let d = D.addDays(today, 1); d <= end; d = D.addDays(d, 1)) {
      const ds = D.ymd(d);
      for (const it of byDate.get(ds) || []) v += it.amount;
      v += perDay;
      points.push({ date: ds, value: r2(v), kind: 'forecast' });
    }
    const daysLeft = D.diffDays(today, end);
    const incoming = r2(U.sum(items.filter((i) => i.amount > 0), (i) => i.amount));
    const outgoing = r2(U.sum(items.filter((i) => i.amount < 0), (i) => i.amount));
    const lowest = points.reduce((lo, p) => (p.value < lo.value ? p : lo), points[0]);
    return { account: acc, start, end, today, points, current, endValue: r2(v), items, perDay, daysLeft, variable: r2(perDay * daysLeft), incoming, outgoing, lowest };
  });

  /* ---------- Hinweise ---------- */
  store.insights = (includeDismissed) => memo('ins:' + !!includeDismissed, () => {
    const today = store.data.today;
    const ym = store.curYM();
    const list = [];
    const contracts = store.contracts().filter((c) => c.status === 'active');

    for (const c of contracts) {
      if (c.change && c.change.recent && c.change.to > c.change.from) {
        const yearly = ((c.change.to - c.change.from) * 12) / FK.data.intervalMonths(c);
        list.push({
          id: `price:${c.id}:${c.change.since}`, tone: 'warning', icon: 'trending-up',
          title: `${c.provider} ist teurer geworden`,
          text: `Seit ${FK.dfmt.month(c.change.since)} zahlst du ${eur(c.change.to)} statt ${eur(c.change.from)} (+${FK.fmt.pct(c.change.ratio)}). Das sind ${eur(yearly)} mehr im Jahr.`,
          action: { label: 'Vertrag prüfen', go: 'vertrag/' + c.id }, merchantId: c.merchant,
        });
      }
    }

    const fc = store.forecast('giro');
    const sal = store.txs().find((t) => t.categoryId === 'gehalt' && t.amount > 0);
    if (sal && D.diffDays(D.parse(sal.date), today) <= 4) {
      list.push({
        id: 'salary:' + sal.date, tone: 'positive', icon: 'briefcase', title: 'Dein Gehalt ist da',
        text: `${eur(sal.amount, { sign: true })} von ${sal.name} sind am ${FK.dfmt.dm(sal.date)} auf deinem Girokonto eingegangen.`,
        action: { label: 'Umsatz ansehen', go: 'umsatz/' + sal.id },
      });
    }

    for (const c of contracts) {
      if (!c.cancel.possible || !c.cancel.deadline || !c.savings) continue;
      const n = D.diffDays(today, c.cancel.deadline);
      if (n < 0 || n > 75) continue;
      list.push({
        id: `deadline:${c.id}:${D.ymd(c.cancel.deadline)}`, tone: 'info', icon: 'calendar',
        title: `${c.category === 'versicherungen' && c.id === 'kfz' ? 'Kfz-Versicherung' : c.provider}: Wechsel bis ${FK.dfmt.dm(c.cancel.deadline)}`,
        text: `Noch ${n} ${n === 1 ? 'Tag' : 'Tage'} bis zum Stichtag. ${c.savings.text}`,
        action: { label: 'Vergleichen', go: 'vertrag/' + c.id }, merchantId: c.merchant,
      });
    }

    const soon = fc.items.filter((i) => i.amount <= -100 && D.diffDays(today, D.parse(i.date)) <= 3);
    if (soon.length) {
      const s = soon[0];
      list.push({
        id: 'soon:' + s.date + ':' + s.name, tone: 'info', icon: 'clock',
        title: `${FK.dfmt.due(s.date).replace(/^./, (x) => x.toUpperCase())}: ${s.name}`,
        text: `${eur(s.amount)} werden ${FK.dfmt.due(s.date)} von deinem Girokonto abgebucht. Danach voraussichtlich ${eur(fc.endValue)} am Monatsende.`,
        action: { label: 'Prognose ansehen', go: 'prognose' }, merchantId: s.merchantId,
      });
    }

    for (const b of store.budgets(ym)) {
      if (b.status === 'ok') continue;
      const cat = C.cat(b.catId);
      list.push({
        id: `budget:${b.catId}:${ym}:${b.status}`, tone: b.status === 'over' ? 'critical' : 'warning', icon: 'target',
        title: b.status === 'over' ? `Budget ${cat.name} überschritten` : `${cat.name}: ${FK.fmt.pct(b.ratio)} verbraucht`,
        text: b.status === 'over'
          ? `Du hast ${eur(b.spent)} von ${eur(b.limit)} ausgegeben – ${eur(-b.remaining)} mehr als geplant.`
          : `Noch ${eur(b.remaining)} übrig${b.perDay ? `, also etwa ${eur(b.perDay)} pro Tag` : ''}.`,
        action: { label: 'Kategorie ansehen', go: `kategorie/${b.catId}/${ym}` }, categoryId: b.catId,
      });
    }

    const abos = contracts.filter((c) => c.group === 'abos');
    if (abos.length >= 3) {
      const sum = U.sum(abos, (c) => c.monthly);
      list.push({
        id: 'abos:' + abos.length + ':' + Math.round(sum * 100), tone: 'info', icon: 'tv',
        title: `${abos.length} Abos kosten dich ${eur(sum)} im Monat`,
        text: `${abos.map((c) => c.provider).join(', ')}. Nutzt du noch alle? Kündigen geht direkt in der App.`,
        action: { label: 'Abos ansehen', go: 'vertraege', tab: 'vertraege' },
      });
    }

    const sum = store.contractSummary();
    if (sum.reserve > 0) {
      list.push({
        id: 'reserve:' + Math.round(sum.reserve * 100), tone: 'info', icon: 'piggy',
        title: `Lege ${eur(sum.reserve)} im Monat zurück`,
        text: `So sind deine jährlichen und vierteljährlichen Verträge (${eur(U.sum(sum.nonMonthly, (c) => c.yearly))} im Jahr) gedeckt, wenn sie fällig werden.`,
        action: { label: 'Rücklagen ansehen', go: 'vertraege', tab: 'vertraege' },
      });
    }

    if (sum.savingsTotal > 0) {
      list.push({
        id: 'savings:' + sum.savingsTotal, tone: 'positive', icon: 'sparkles',
        title: `Bis zu ${eur(sum.savingsTotal, { decimals: 0 })} im Jahr sparen`,
        text: `Für ${sum.savings.map((c) => c.provider).join(', ')} haben wir günstigere Tarife gefunden.`,
        action: { label: 'Sparpotenzial ansehen', go: 'vertrag/' + sum.savings[0].id },
      });
    }

    return includeDismissed ? list : list.filter((i) => !store.state.dismissed[i.id]);
  });

  /* ---------- Aktionen ---------- */
  store.act = {
    setCategory(txId, catId, merchantId, applyAll) {
      store.update((s) => {
        if (applyAll && merchantId) {
          s.merchantRules[merchantId] = catId;
          // Einzelzuordnungen dieses Händlers aufheben, damit die Regel greift
          for (const t of store.data.txs) if (t.merchantId === merchantId) delete s.txCategory[t.id];
        } else s.txCategory[txId] = catId;
      });
    },
    setNote(txId, text) {
      store.update((s) => { if (text.trim()) s.notes[txId] = text.trim(); else delete s.notes[txId]; }, { silent: true });
    },
    setBudget(catId, limit) { store.update((s) => { s.budgets[catId] = limit; }); },
    removeBudget(catId) { store.update((s) => { delete s.budgets[catId]; }); },
    cancelContract(id, info) { store.update((s) => { s.cancellations[id] = info; }, { rebuild: true }); },
    undoCancel(id) { store.update((s) => { delete s.cancellations[id]; }, { rebuild: true }); },
    toggleReminder(id) { store.update((s) => { if (s.reminders[id]) delete s.reminders[id]; else s.reminders[id] = true; }); },
    addContract(c) { store.update((s) => { s.customContracts.push(c); }, { rebuild: true }); },
    removeContract(id) { store.update((s) => { s.customContracts = s.customContracts.filter((c) => c.id !== id); delete s.cancellations[id]; }, { rebuild: true }); },
    addAccount(bankId) {
      const id = U.uid('acc');
      store.update((s) => { s.addedAccounts.push({ id, bankId, createdAt: D.ymd(store.data.today) }); }, { rebuild: true });
      return id;
    },
    removeAccount(id) { store.update((s) => { s.addedAccounts = s.addedAccounts.filter((a) => a.id !== id); }, { rebuild: true }); },
    dismiss(id) { store.update((s) => { s.dismissed[id] = true; }); },
    restoreInsights() { store.update((s) => { s.dismissed = {}; }); },
    setSetting(key, value) { store.update((s) => { s.settings[key] = value; }, { setting: key }); },
  };

  FK.store = store;
})(window.FK);
