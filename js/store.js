/* Finanzkompass – Zustand (lokal im Browser) und Auswertungen auf Basis echter, importierter Umsätze:
   Salden, Monatsanalyse, erkannte Verträge, Prognose und Hinweise. */
(function (FK) {
  'use strict';
  const D = FK.date;
  const C = FK.catalog;
  const U = FK.util;
  const r2 = FK.fmt.round2;
  const eur = FK.fmt.eur;
  const normIban = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  const defaults = () => ({
    v: 2,
    profile: { name: '', street: '', city: '', email: '' },
    settings: { theme: 'system', hideAmounts: false, notifications: true, appLock: false, plus: false },
    accounts: [],
    tx: {},
    budgets: {},
    txCategory: {},
    merchantRules: {},
    notes: {},
    cancellations: {},
    reminders: {},
    customContracts: [],
    ignored: {},
    dismissed: {},
    live: { proxyUrl: '', token: '', pending: null },
  });

  const store = {
    state: null,
    data: null,
    version: 0,
    ui: { analysisMonth: null, analysisMode: 'expense', contractsView: 'monthly' },
  };
  const listeners = new Set();
  let cache = new Map();

  function memo(k, fn) {
    if (!cache.has(k)) cache.set(k, fn());
    return cache.get(k);
  }
  function emit(info) { listeners.forEach((fn) => fn(info || {})); }
  store.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  store.load = function () {
    const saved = FK.storage.get(FK.config.storageKey, null);
    const base = defaults();
    if (saved && saved.v === 2) {
      store.state = Object.assign(base, saved);
      store.state.settings = Object.assign(defaults().settings, saved.settings || {});
      store.state.profile = Object.assign(defaults().profile, saved.profile || {});
      store.state.live = Object.assign(defaults().live, saved.live || {});
    } else {
      store.state = base;
    }
    // Daten der früheren Demo-Version entfernen
    FK.storage.remove('finanzkompass:v1');
    store.rebuild();
  };

  store.save = function () {
    const ok = FK.storage.set(FK.config.storageKey, store.state);
    if (!ok && FK.toast) FK.toast('Speichern fehlgeschlagen – Speicher voll? Exportiere ein Backup.', { icon: 'alert', tone: 'info', duration: 5000 });
    return ok;
  };

  store.update = function (fn, opts) {
    fn(store.state);
    store.save();
    store.rebuild();
    emit(opts);
  };

  store.reset = function () {
    const keep = { theme: store.state.settings.theme };
    FK.storage.remove(FK.config.storageKey);
    store.state = defaults();
    store.state.settings.theme = keep.theme;
    store.save();
    store.ui.analysisMonth = null;
    store.rebuild();
    emit({ reset: true });
  };

  store.setting = (key) => store.state.settings[key];
  store.hasData = () => store.state.accounts.length > 0;

  /* ---------- Aufbereitung ---------- */
  function effectiveCategory(t) {
    const st = store.state;
    if (st.txCategory[t.id]) return st.txCategory[t.id];
    const rk = t.merchantId ? 'm:' + t.merchantId : 'n:' + U.normalize(t.name);
    if (st.merchantRules[rk]) return st.merchantRules[rk];
    return t.autoCategoryId;
  }
  store.ruleKey = (t) => (t.merchantId ? 'm:' + t.merchantId : 'n:' + U.normalize(t.name));

  store.rebuild = function () {
    const st = store.state;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ownIbans = new Set(st.accounts.map((a) => normIban(a.iban)).filter(Boolean));
    // Überweisungen an eine Bank, bei der ein eigenes Konto verbunden ist (z. B. Trade Republic), sind Umbuchungen
    const ownBanks = new Set(st.accounts.map((a) => a.bankId).filter((b) => b === 'traderepublic'));
    const pn = U.normalize(st.profile.name || '').replace(/\s+/g, ' ').trim();
    const ownName = pn.includes(' ') ? pn : '';
    const all = [];
    for (const a of st.accounts) {
      const ctx = { ownIbans, ownBanks, ownName, bankId: a.bankId, bankName: C.bank(a.bankId).short };
      for (const raw of st.tx[a.id] || []) {
        const cls = FK.categorize.classify(raw, ctx);
        const t = Object.assign({}, raw, {
          accountId: a.id, name: cls.name, merchantId: cls.merchantId, autoCategoryId: cls.categoryId,
          method: cls.method, via: cls.via, intermediary: cls.intermediary, contractId: null, seriesId: null,
        });
        t.categoryId = effectiveCategory(t);
        t.origCategoryId = t.autoCategoryId;
        t.note = st.notes[t.id] || '';
        all.push(t);
      }
    }
    // Wiederkehrende Zahlungen erkennen; regelmäßige Eingänge ab 300 € gelten als Gehalt
    let series = FK.recurring.detect(all, today);
    let changed = false;
    for (const s of series) {
      if (s.kind === 'income' && s.interval === 'monthly' && s.amount >= 300) {
        for (const t of s.txs) {
          if (t.categoryId === 'einnahmen' && t.autoCategoryId === 'einnahmen') { t.categoryId = 'gehalt'; t.autoCategoryId = 'gehalt'; t.origCategoryId = 'gehalt'; changed = true; }
        }
      }
    }
    if (changed) series = FK.recurring.detect(all, today);
    for (const s of series) for (const t of s.txs) {
      t.seriesId = s.id;
      if (s.kind === 'contract') t.contractId = s.id;
    }
    all.sort((a, b) => (a.date === b.date ? ((b.time || '') < (a.time || '') ? -1 : 1) : a.date < b.date ? 1 : -1));

    let start = all.length ? D.parse(all[all.length - 1].date) : D.addDays(today, -30);
    if (D.diffDays(start, today) < 30) start = D.addDays(today, -30);
    start = D.startOfMonth(start);

    // Tägliche Salden: vom bekannten Kontostand aus rückwärts und vorwärts rechnen
    const daily = {};
    const balances = {};
    const n = D.diffDays(start, today) + 1;
    for (const a of st.accounts) {
      const arr = new Array(n).fill(0);
      if (a.type === 'depot') {
        arr.fill(a.balance || 0);
      } else {
        const delta = new Map();
        for (const t of all) {
          if (t.accountId !== a.id || t.pending) continue;
          delta.set(t.date, (delta.get(t.date) || 0) + t.amount);
        }
        const bDate = a.balanceDate ? D.parse(a.balanceDate) : today;
        const bi = Math.max(0, Math.min(n - 1, D.diffDays(start, bDate)));
        arr[bi] = a.balance || 0;
        for (let i = bi - 1; i >= 0; i--) arr[i] = r2(arr[i + 1] - (delta.get(D.ymd(D.addDays(start, i + 1))) || 0));
        for (let i = bi + 1; i < n; i++) arr[i] = r2(arr[i - 1] + (delta.get(D.ymd(D.addDays(start, i))) || 0));
      }
      daily[a.id] = arr;
      balances[a.id] = arr[n - 1];
    }

    store.data = { start, today, accounts: st.accounts, txs: all, daily, balances, series };
    if (!store.ui.analysisMonth || store.ui.analysisMonth > D.ym(today)) store.ui.analysisMonth = D.ym(today);
    store.version++;
    cache = new Map();
  };

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
    for (let i = arr.length - n; i < arr.length; i++) out.push({ date: D.ymd(D.addDays(store.data.start, i)), value: arr[i] });
    return out;
  };
  /** Ältestes Umsatzdatum eines Kontos (für Diagramm-Zeiträume) */
  store.firstTxDate = (id) => {
    const list = store.data.txs.filter((t) => t.accountId === id);
    return list.length ? list[list.length - 1].date : null;
  };

  store.totals = () => memo('totals', () => {
    const t = { giro: 0, credit: 0, savings: 0, depot: 0 };
    for (const a of store.data.accounts) t[a.type] = r2((t[a.type] || 0) + store.balance(a.id));
    t.liquid = r2(t.giro + t.credit + t.savings);
    t.total = r2(t.liquid + t.depot);
    const idx = store.dayIndex(D.addDays(D.startOfMonth(store.data.today), -1));
    let before = 0;
    for (const a of store.data.accounts) {
      const arr = store.data.daily[a.id];
      before += idx >= 0 && arr[idx] != null ? arr[idx] : arr[0] || 0;
    }
    t.monthDelta = r2(t.total - before);
    return t;
  });

  /** Konto für die Prognose: Girokonto mit Gehaltseingang, sonst das mit den meisten Umsätzen */
  store.primaryAccount = () => memo('primary', () => {
    const giros = store.data.accounts.filter((a) => a.type === 'giro');
    if (!giros.length) return null;
    const withSalary = giros.find((a) => store.data.series.some((s) => s.accountId === a.id && s.kind === 'income' && s.amount >= 300));
    if (withSalary) return withSalary;
    const count = (a) => store.data.txs.filter((t) => t.accountId === a.id).length;
    return giros.slice().sort((a, b) => count(b) - count(a))[0];
  });

  /* ---------- Umsätze ---------- */
  store.txs = () => store.data.txs;
  store.txMap = () => memo('txmap', () => {
    const m = new Map();
    store.data.txs.forEach((t) => m.set(t.id, t));
    return m;
  });
  store.tx = (id) => store.txMap().get(id) || null;

  store.queryTxs = function (f) {
    const q = f.q ? U.normalize(f.q.trim()) : '';
    return store.data.txs.filter((t) => {
      if (f.accountId && t.accountId !== f.accountId) return false;
      if (f.ym && !t.date.startsWith(f.ym)) return false;
      if (f.categoryId && t.categoryId !== f.categoryId) return false;
      if (f.kind && f.kind !== 'all') {
        const type = C.cat(t.categoryId).type;
        if (f.kind === 'expense' && !(type === 'expense' && t.amount < 0)) return false;
        if (f.kind === 'income' && !(type === 'income' && t.amount > 0)) return false;
        if (f.kind === 'contracts' && !t.contractId) return false;
        if (f.kind === 'transfers' && !(type === 'transfer' || type === 'saving')) return false;
      }
      if (q) {
        const hay = U.normalize(`${t.name} ${t.counterparty} ${t.purpose} ${C.cat(t.categoryId).name} ${eur(t.amount)} ${t.note}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  /* ---------- Monatsauswertung ---------- */
  store.month = (ym, uptoDay) => memo(`m:${ym}:${uptoDay || ''}`, () => {
    const exp = new Map();
    const inc = new Map();
    let income = 0;
    let expense = 0;
    let saved = 0;
    const list = [];
    for (const t of store.data.txs) {
      if (!t.date.startsWith(ym)) continue;
      if (uptoDay && Number(t.date.slice(8, 10)) > uptoDay) continue;
      list.push(t);
      const c = C.cat(t.categoryId);
      if (c.type === 'expense') {
        expense -= t.amount;
        const e = exp.get(c.id) || { id: c.id, amount: 0, count: 0 };
        e.amount -= t.amount;
        e.count++;
        exp.set(c.id, e);
      } else if (c.type === 'income') {
        income += t.amount;
        const e = inc.get(c.id) || { id: c.id, amount: 0, count: 0 };
        e.amount += t.amount;
        e.count++;
        inc.set(c.id, e);
      } else if (c.type === 'saving') {
        saved -= t.amount; // Käufe und Sparraten minus Verkäufe
      }
    }
    const sortCats = (m) => [...m.values()].map((e) => Object.assign(e, { amount: r2(e.amount) }))
      .filter((e) => Math.abs(e.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
    return { ym, income: r2(income), expense: r2(expense), saved: r2(saved), net: r2(income - expense), expenseCats: sortCats(exp), incomeCats: sortCats(inc), txs: list };
  });

  store.months = () => memo('months', () => {
    const out = [];
    for (let d = D.startOfMonth(store.data.start); d <= store.data.today; d = D.addMonths(d, 1)) out.push(D.ym(d));
    return out;
  });

  store.compare = (ym, mode) => memo(`cmp:${ym}:${mode}`, () => {
    const prev = D.ymAdd(ym, -1);
    if (!store.months().includes(prev)) return null;
    const first = store.data.txs.length ? store.data.txs[store.data.txs.length - 1].date : null;
    if (!first || first.slice(0, 7) > prev) return null; // Vormonat liegt vor den Daten
    const isCur = ym === store.curYM();
    const day = isCur ? store.data.today.getDate() : null;
    const a = store.month(ym);
    const b = store.month(prev, day);
    const k = mode === 'income' ? 'income' : 'expense';
    const delta = a[k] - b[k];
    return { prev, partial: isCur, day, prevValue: b[k], delta: r2(delta), ratio: b[k] ? delta / b[k] : null };
  });

  store.series = (ym, n, mode, categoryId) => memo(`ser:${ym}:${n}:${mode}:${categoryId || ''}`, () => {
    const months = store.months();
    const end = months.indexOf(ym);
    const out = [];
    for (let i = Math.max(0, end - n + 1); i <= end; i++) {
      const m = store.month(months[i]);
      let v;
      if (categoryId) {
        const e = (mode === 'income' ? m.incomeCats : m.expenseCats).find((x) => x.id === categoryId);
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
      return { catId, limit, spent, ratio, remaining, status: ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : 'ok', perDay: isCur && remaining > 0 ? r2(remaining / daysLeft) : null };
    }).sort((a, b) => b.ratio - a.ratio);
  });

  /* ---------- Verträge (aus wiederkehrenden Abbuchungen erkannt + eigene) ---------- */
  const INTERVAL = { monthly: 'monatlich', quarterly: 'vierteljährlich', halfyearly: 'halbjährlich', yearly: 'jährlich' };
  const MONTHS = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };
  store.intervalLabel = (c) => INTERVAL[c.interval] || 'monatlich';
  store.intervalMonths = (c) => MONTHS[c.interval] || 1;

  function priceChange(prices, today) {
    if (!prices || prices.length < 2) return null;
    const last = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const age = D.diffDays(D.parse(last.date), today);
    return { from: prev.amount, to: last.amount, since: last.since, ratio: (last.amount - prev.amount) / prev.amount, recent: age <= 75 };
  }

  function customDates(c, from, to) {
    const out = [];
    const first = D.parse(c.since);
    const months = MONTHS[c.interval] || 1;
    for (let i = 0; i < 60; i++) {
      const base = D.shiftMonths(first, i * months);
      const d = c.method === 'credit' ? base : D.nextBankDay(base);
      if (d > to) break;
      if (d >= from) out.push(d);
    }
    return out;
  }

  /** Künftige Abbuchungstermine eines Vertrags im Zeitraum */
  store.contractDates = (c, from, to) => {
    const until = c.cancelled && c.cancelled.endDate ? c.cancelled.endDate : null;
    if (c.custom) return customDates(c, from, until ? new Date(Math.min(to, D.parse(until))) : to);
    return FK.recurring.datesBetween(c.series, from, to, until);
  };

  store.contracts = () => memo('contracts', () => {
    const st = store.state;
    const today = store.data.today;
    const list = [];
    for (const s of store.data.series) {
      if (s.kind !== 'contract' || st.ignored[s.id]) continue;
      const months = s.period.months;
      const canc = st.cancellations[s.id] || null;
      const c = {
        id: s.id, detected: true, series: s, merchant: s.merchantId, provider: s.name,
        product: s.product || C.cat(s.categoryId).name, group: C.groupOfCategory(s.categoryId, s.merchantId), category: s.categoryId,
        account: s.accountId, interval: s.interval, amount: s.amount, monthly: s.amount / months, yearly: (s.amount * 12) / months,
        since: D.ymd(s.first), payments: s.txs, prices: s.prices, change: priceChange(s.prices, today),
        method: s.method, creditorId: s.creditorId, mandateRef: s.mandateRef, customerNo: s.mandateRef || '',
        status: canc ? 'cancelled' : 'active', cancelled: canc,
      };
      const nextDates = store.contractDates(c, D.addDays(today, 1), D.addMonths(today, 14));
      c.next = nextDates[0] || null;
      c.cancel = {
        possible: true,
        end: c.group === 'abos' && c.next ? D.addDays(c.next, -1) : null,
        estimate: true,
        label: c.group === 'abos' ? 'meist zum Ende des bezahlten Zeitraums' : 'steht in deinen Vertragsunterlagen',
      };
      list.push(c);
    }
    for (const cc of st.customContracts) {
      const months = MONTHS[cc.interval] || 1;
      const canc = st.cancellations[cc.id] || null;
      const c = Object.assign({}, cc, {
        custom: true, monthly: cc.amount / months, yearly: (cc.amount * 12) / months, payments: [], prices: [{ since: cc.since.slice(0, 7), date: cc.since, amount: cc.amount }],
        change: null, status: canc ? 'cancelled' : 'active', cancelled: canc, customerNo: cc.customerNo || '',
      });
      c.next = store.contractDates(c, D.addDays(today, 1), D.addMonths(today, 14))[0] || null;
      c.cancel = { possible: true, end: null, estimate: true, label: 'steht in deinen Vertragsunterlagen' };
      list.push(c);
    }
    return list.sort((a, b) => b.monthly - a.monthly);
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
    const cancelled = list.filter((c) => c.status === 'cancelled');
    return {
      monthly, yearly: r2(monthly * 12), count: active.length, groups, nonMonthly,
      reserve: r2(U.sum(nonMonthly, (c) => c.monthly)),
      cancelled, cancelledYearly: r2(U.sum(cancelled, (c) => c.yearly)),
    };
  });

  /* ---------- Prognose ---------- */
  function avgVariablePerDay(accountId) {
    const today = store.data.today;
    const first = store.firstTxDate(accountId);
    if (!first) return 0;
    const span = Math.max(1, Math.min(90, D.diffDays(D.parse(first), today)));
    const from = D.ymd(D.addDays(today, -span));
    let s = 0;
    for (const t of store.data.txs) {
      if (t.accountId !== accountId || t.date <= from || t.pending) continue;
      if (t.seriesId || t.amount >= 0) continue;
      if (C.cat(t.categoryId).type !== 'expense') continue;
      if (t.amount < -400) continue; // Ausreißer wie Reisen oder Anschaffungen nicht hochrechnen
      s += t.amount;
    }
    return s / span;
  }

  /** Geplante Buchungen (Verträge, regelmäßige Eingänge, Daueraufträge) für ein Konto */
  store.scheduled = function (accountId, from, to) {
    const items = [];
    for (const c of store.contracts()) {
      if (c.account !== accountId) continue;
      for (const d of store.contractDates(c, from, to)) items.push({ date: D.ymd(d), name: c.provider, sub: c.product, amount: -c.amount, kind: 'contract', contractId: c.id, merchantId: c.merchant });
    }
    for (const s of store.data.series) {
      if (s.accountId !== accountId || (s.kind !== 'income' && s.kind !== 'transfer')) continue;
      for (const d of FK.recurring.datesBetween(s, from, to)) {
        items.push({ date: D.ymd(d), name: s.name, sub: s.kind === 'income' ? C.cat(s.categoryId).name : 'Regelmäßige Überweisung', amount: s.sign * s.amount, kind: s.kind, merchantId: s.merchantId });
      }
    }
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));
  };

  store.forecast = (accountId) => memo('fc:' + (accountId || ''), () => {
    const acc = accountId ? store.account(accountId) : store.primaryAccount();
    if (!acc) return null;
    const today = store.data.today;
    const start = D.startOfMonth(today);
    const end = D.endOfMonth(today);
    const daily = store.data.daily[acc.id];
    const points = [];
    for (let d = start; d <= today; d = D.addDays(d, 1)) {
      const i = store.dayIndex(d);
      points.push({ date: D.ymd(d), value: daily[i] != null ? daily[i] : daily[0], kind: 'actual' });
    }
    const current = store.balance(acc.id);
    const items = store.scheduled(acc.id, D.addDays(today, 1), end);
    const perDay = avgVariablePerDay(acc.id);
    const byDate = U.groupBy(items, (i) => i.date);
    let v = current;
    for (let d = D.addDays(today, 1); d <= end; d = D.addDays(d, 1)) {
      const ds = D.ymd(d);
      for (const it of byDate.get(ds) || []) v += it.amount;
      v += perDay;
      points.push({ date: ds, value: r2(v), kind: 'forecast' });
    }
    const daysLeft = D.diffDays(today, end);
    const lowest = points.reduce((lo, p) => (p.value < lo.value ? p : lo), points[0]);
    return {
      account: acc, start, end, today, points, current, endValue: r2(v), items, perDay, daysLeft, variable: r2(perDay * daysLeft),
      incoming: r2(U.sum(items.filter((i) => i.amount > 0), (i) => i.amount)),
      outgoing: r2(U.sum(items.filter((i) => i.amount < 0), (i) => i.amount)),
      lowest,
    };
  });

  /* ---------- Hinweise ---------- */
  store.insights = (includeDismissed) => memo('ins:' + !!includeDismissed, () => {
    const st = store.state;
    if (!st.accounts.length) return [];
    const today = store.data.today;
    const ym = store.curYM();
    const list = [];
    const contracts = store.contracts().filter((c) => c.status === 'active');

    for (const a of st.accounts) {
      if (a.source === 'live' || a.type === 'depot') continue;
      const age = a.updatedAt ? D.diffDays(D.parse(a.updatedAt.slice(0, 10)), today) : 99;
      if (age >= 7) {
        list.push({
          id: `stale:${a.id}:${a.updatedAt}`, tone: 'info', icon: 'refresh',
          title: `${C.bank(a.bankId).short}: Umsätze aktualisieren`,
          text: `Dein letzter Import ist ${age} Tage alt. Lade eine neue CSV-Datei hoch, damit Prognose und Analyse stimmen.`,
          action: { label: 'Jetzt importieren', go: 'konto/' + a.id },
        });
      }
    }

    const fc = store.forecast();
    if (fc && fc.lowest.kind === 'forecast' && fc.lowest.value < 0) {
      list.push({
        id: `minus:${ym}:${Math.round(fc.lowest.value)}`, tone: 'critical', icon: 'alert',
        title: 'Dein Konto könnte ins Minus rutschen',
        text: `Voraussichtlich am ${FK.dfmt.dm(fc.lowest.date)} mit ${eur(fc.lowest.value)}. Plane einen Puffer ein, um Dispozinsen zu vermeiden.`,
        action: { label: 'Prognose ansehen', go: 'prognose' },
      });
    }

    for (const c of contracts) {
      if (c.change && c.change.recent && c.change.to > c.change.from) {
        const yearly = ((c.change.to - c.change.from) * 12) / store.intervalMonths(c);
        list.push({
          id: `price:${c.id}:${c.change.since}`, tone: 'warning', icon: 'trending-up',
          title: `${c.provider} ist teurer geworden`,
          text: `Seit ${FK.dfmt.month(c.change.since)} zahlst du ${eur(c.change.to)} statt ${eur(c.change.from)} (+${FK.fmt.pct(c.change.ratio)}). Das sind ${eur(yearly)} mehr im Jahr.`,
          action: { label: 'Vertrag prüfen', go: 'vertrag/' + c.id }, merchantId: c.merchant,
        });
      }
      if (c.detected && D.diffDays(c.series.first, today) <= 75) {
        list.push({
          id: `new:${c.id}`, tone: 'info', icon: 'sparkles',
          title: `Neuer Vertrag erkannt: ${c.provider}`,
          text: `${eur(c.amount)} ${store.intervalLabel(c)} seit ${FK.dfmt.dm(c.since)}. Stimmt das? Du kannst ihn bestätigen oder ausblenden.`,
          action: { label: 'Ansehen', go: 'vertrag/' + c.id }, merchantId: c.merchant,
        });
      }
    }

    const salary = store.data.series.find((s) => s.kind === 'income' && s.amount >= 300 && D.diffDays(s.last, today) <= 4);
    if (salary) {
      const t = salary.txs[0];
      list.push({
        id: 'salary:' + t.id, tone: 'positive', icon: 'briefcase', title: 'Dein Gehalt ist da',
        text: `${eur(t.amount, { sign: true })} von ${t.name} sind am ${FK.dfmt.dm(t.date)} eingegangen.`,
        action: { label: 'Umsatz ansehen', go: 'umsatz/' + t.id },
      });
    }

    if (fc) {
      const soon = fc.items.filter((i) => i.amount <= -100 && D.diffDays(today, D.parse(i.date)) <= 3);
      if (soon.length) {
        const s = soon[0];
        const when = FK.dfmt.due(s.date);
        list.push({
          id: 'soon:' + s.date + ':' + s.name, tone: 'info', icon: 'clock',
          title: `${when.replace(/^./, (x) => x.toUpperCase())}: ${s.name}`,
          text: `${eur(s.amount)} werden voraussichtlich ${when} abgebucht.`,
          action: { label: 'Prognose ansehen', go: 'prognose' }, merchantId: s.merchantId,
        });
      }
    }

    for (const b of store.budgets(ym)) {
      if (b.status === 'ok') continue;
      const cat = C.cat(b.catId);
      list.push({
        id: `budget:${b.catId}:${ym}:${b.status}`, tone: b.status === 'over' ? 'critical' : 'warning', icon: 'target',
        title: b.status === 'over' ? `Budget ${cat.name} überschritten` : `${cat.name}: ${FK.fmt.pct(b.ratio)} verbraucht`,
        text: b.status === 'over' ? `Du hast ${eur(b.spent)} von ${eur(b.limit)} ausgegeben – ${eur(-b.remaining)} mehr als geplant.` : `Noch ${eur(b.remaining)} übrig${b.perDay ? `, also etwa ${eur(b.perDay)} pro Tag` : ''}.`,
        action: { label: 'Kategorie ansehen', go: `kategorie/${b.catId}/${ym}` },
      });
    }

    const abos = contracts.filter((c) => c.group === 'abos');
    if (abos.length >= 2) {
      const sum = U.sum(abos, (c) => c.monthly);
      list.push({
        id: 'abos:' + abos.length + ':' + Math.round(sum * 100), tone: 'info', icon: 'tv',
        title: `${abos.length} Abos kosten dich ${eur(sum)} im Monat`,
        text: `${abos.map((c) => c.provider).join(', ')}. Nutzt du noch alle?`,
        action: { label: 'Abos ansehen', go: 'vertraege', tab: 'vertraege' },
      });
    }

    const sum = store.contractSummary();
    if (sum.reserve > 0) {
      list.push({
        id: 'reserve:' + Math.round(sum.reserve * 100), tone: 'info', icon: 'piggy',
        title: `Lege ${eur(sum.reserve)} im Monat zurück`,
        text: `So sind deine Jahres- und Quartalsverträge (${eur(U.sum(sum.nonMonthly, (c) => c.yearly))} im Jahr) gedeckt, wenn sie fällig werden.`,
        action: { label: 'Rücklagen ansehen', go: 'vertraege', tab: 'vertraege' },
      });
    }

    const kfz = contracts.find((c) => c.category === 'versicherungen' && c.interval === 'yearly' && /kfz|auto|fahrzeug/i.test(`${c.provider} ${c.product}`));
    if (kfz && today.getMonth() >= 8 && today.getMonth() <= 10) {
      const dl = new Date(today.getFullYear(), 10, 30);
      const days = D.diffDays(today, dl);
      if (days >= 0) {
        list.push({
          id: `kfz:${kfz.id}:${today.getFullYear()}`, tone: 'info', icon: 'calendar',
          title: 'Kfz-Versicherung: Wechsel meist bis 30.11.',
          text: `Noch ${days} Tage bis zum üblichen Stichtag. Prüfe, ob sich ein Vergleich für ${kfz.provider} lohnt.`,
          action: { label: 'Vertrag ansehen', go: 'vertrag/' + kfz.id },
        });
      }
    }

    return includeDismissed ? list : list.filter((i) => !st.dismissed[i.id]);
  });

  /* ---------- Import & Konten ---------- */
  const RAW_KEYS = ['id', 'date', 'valueDate', 'time', 'amount', 'currency', 'counterparty', 'counterIban', 'counterBic', 'purpose', 'bookingText', 'creditorId', 'mandateRef', 'mcc', 'pending', 'kind', 'security', 'extId', 'src'];
  const rawOf = (t) => {
    const o = {};
    for (const k of RAW_KEYS) if (t[k] != null && t[k] !== '') o[k] = t[k];
    return o;
  };

  /**
   * Umsätze in ein Konto übernehmen; vorgemerkte Umsätze im neuen Zeitraum werden ersetzt.
   * Gleiche Quelle: Abgleich über die ID. Andere Quelle (CSV ↔ live): Abgleich über Datum und Betrag.
   */
  function mergeInto(accountId, incoming, src) {
    const st = store.state;
    const prepared = FK.importer.assignIds(accountId, incoming.map(rawOf)).map((t) => Object.assign(t, { src }));
    const dates = prepared.map((t) => t.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const before = st.tx[accountId] || [];
    const known = new Set(before.map((t) => t.id));
    // Vorgemerkte Umsätze im Zeitraum der neuen Daten werden durch den aktuellen Stand ersetzt
    const existing = before.filter((t) => !(t.pending && t.date >= minDate && t.date <= maxDate));
    const ids = new Set(existing.map((t) => t.id));
    const fkey = (t) => `${t.date}|${t.amount.toFixed(2)}`;
    const foreign = new Map();
    const booked = new Set();
    for (const t of existing) {
      if (t.pending) continue;
      booked.add(fkey(t));
      if ((t.src || 'csv') !== src) foreign.set(fkey(t), (foreign.get(fkey(t)) || 0) + 1);
    }
    let added = 0;
    for (const t of prepared) {
      if (ids.has(t.id)) continue;
      const k = fkey(t);
      if (t.pending && booked.has(k)) continue; // ist inzwischen gebucht
      if (!t.pending && foreign.get(k) > 0) { foreign.set(k, foreign.get(k) - 1); continue; }
      existing.push(t);
      ids.add(t.id);
      if (!known.has(t.id)) added++;
    }
    st.tx[accountId] = existing.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { added, duplicates: prepared.length - added };
  }

  store.act = {
    /** Import abschließen. o: { accountId?, bankId, name, type, iban, balance, balanceDate, txs, source, live, holdings } */
    importAccount(o) {
      let result;
      store.update((st) => {
        let acc = o.accountId ? st.accounts.find((a) => a.id === o.accountId) : null;
        if (!acc && o.iban) acc = st.accounts.find((a) => normIban(a.iban) === normIban(o.iban) && a.type === o.type);
        if (!acc && o.live) acc = st.accounts.find((a) => a.live && a.live.uid === o.live.uid);
        const nowIso = new Date().toISOString();
        if (!acc) {
          acc = { id: U.uid('acc'), bankId: o.bankId, name: o.name, type: o.type || 'giro', iban: o.iban || '', currency: 'EUR', createdAt: nowIso };
          st.accounts.push(acc);
        }
        if (o.name) acc.name = o.name;
        if (o.iban) acc.iban = o.iban;
        if (o.balance != null && !isNaN(o.balance)) { acc.balance = r2(o.balance); acc.balanceDate = o.balanceDate || D.ymd(new Date()); }
        if (o.holdings) acc.holdings = o.holdings;
        // Ein live verbundenes Konto bleibt live, auch wenn ältere Umsätze per CSV ergänzt werden
        acc.source = acc.live && !o.live ? 'live' : o.source || acc.source || 'csv';
        if (o.live) acc.live = o.live;
        if (o.holder && !st.profile.name) st.profile.name = o.holder;
        acc.updatedAt = nowIso;
        const m = o.txs && o.txs.length ? mergeInto(acc.id, o.txs, o.source || 'csv') : { added: 0, duplicates: 0 };
        result = { accountId: acc.id, added: m.added, duplicates: m.duplicates };
      }, { imported: true });
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
      return result;
    },
    setBalance(accountId, balance, date) {
      store.update((st) => {
        const a = st.accounts.find((x) => x.id === accountId);
        if (a) { a.balance = r2(balance); a.balanceDate = date; }
      });
    },
    renameAccount(accountId, name) {
      store.update((st) => { const a = st.accounts.find((x) => x.id === accountId); if (a && name.trim()) a.name = name.trim(); });
    },
    removeAccount(id) {
      store.update((st) => {
        const ids = new Set((st.tx[id] || []).map((t) => t.id));
        st.accounts = st.accounts.filter((a) => a.id !== id);
        delete st.tx[id];
        for (const k of Object.keys(st.txCategory)) if (ids.has(k)) delete st.txCategory[k];
        for (const k of Object.keys(st.notes)) if (ids.has(k)) delete st.notes[k];
      });
    },
    setCategory(tx, catId, applyAll) {
      store.update((s) => {
        if (applyAll) {
          s.merchantRules[store.ruleKey(tx)] = catId;
          for (const t of store.data.txs) if (store.ruleKey(t) === store.ruleKey(tx)) delete s.txCategory[t.id];
        } else s.txCategory[tx.id] = catId;
      });
    },
    resetCategory(tx) {
      store.update((s) => { delete s.txCategory[tx.id]; delete s.merchantRules[store.ruleKey(tx)]; });
    },
    setNote(txId, text) {
      store.state.notes[txId] = text.trim();
      if (!text.trim()) delete store.state.notes[txId];
      store.save();
      const t = store.tx(txId);
      if (t) t.note = text.trim();
    },
    setBudget(catId, limit) { store.update((s) => { s.budgets[catId] = limit; }); },
    removeBudget(catId) { store.update((s) => { delete s.budgets[catId]; }); },
    cancelContract(id, info) { store.update((s) => { s.cancellations[id] = info; }); },
    undoCancel(id) { store.update((s) => { delete s.cancellations[id]; }); },
    ignoreContract(id) { store.update((s) => { s.ignored[id] = true; }); },
    restoreContracts() { store.update((s) => { s.ignored = {}; }); },
    toggleReminder(id) { store.update((s) => { if (s.reminders[id]) delete s.reminders[id]; else s.reminders[id] = true; }); },
    addContract(c) { store.update((s) => { s.customContracts.push(c); }); },
    removeContract(id) { store.update((s) => { s.customContracts = s.customContracts.filter((c) => c.id !== id); delete s.cancellations[id]; }); },
    dismiss(id) { store.update((s) => { s.dismissed[id] = true; }); },
    restoreInsights() { store.update((s) => { s.dismissed = {}; }); },
    setSetting(key, value) { store.update((s) => { s.settings[key] = value; }, { setting: key }); },
    setProfile(p) { store.update((s) => { Object.assign(s.profile, p); }, { silent: true }); },
    setLive(p) { store.update((s) => { Object.assign(s.live, p); }); },
  };

  /* ---------- Backup ---------- */
  store.exportBackup = () => JSON.stringify({ app: 'finanzkompass', exportedAt: new Date().toISOString(), state: store.state }, null, 1);
  store.importBackup = (json) => {
    const data = JSON.parse(json);
    const st = data && data.state;
    if (!st || st.v !== 2 || !Array.isArray(st.accounts)) throw new Error('Das ist kein gültiges Finanzkompass-Backup.');
    store.state = Object.assign(defaults(), st);
    store.save();
    store.rebuild();
    emit({ reset: true });
  };

  FK.store = store;
})(window.FK);
