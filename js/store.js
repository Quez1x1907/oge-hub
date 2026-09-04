window.Store = (function () {
  const KEY = 'pyaterochka_v1';
  const defaults = () => ({
    user: { name: '', theme: 'light', examDate: '2027-06-07', weeklyGoal: 40, ai: { base: '', key: '', model: '' } },
    answers: {},
    history: [],
    plan: {},
    variants: [],
    streak: { last: '', count: 0 }
  });
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = defaults();
        const p = JSON.parse(raw);
        d.user = Object.assign(d.user, p.user || {});
        d.user.ai = Object.assign({ base: '', key: '', model: '' }, (p.user && p.user.ai) || {});
        d.answers = p.answers || {};
        d.history = p.history || [];
        d.plan = p.plan || {};
        d.variants = p.variants || [];
        d.streak = p.streak || { last: '', count: 0 };
        return d;
      }
    } catch (e) { }
    return defaults();
  }
  let s = load();
  function localDay(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return {
    get: () => s,
    save: () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } return s; },
    recordAnswer: (sub, qid, theme, correct, ms, self) => {
      const a = s.answers[qid] || (s.answers[qid] = { attempts: 0, ok: 0, lastCorrect: false, self: 0, ts: 0 });
      a.attempts += 1;
      a.ok += correct ? 1 : 0;
      a.lastCorrect = !!correct;
      a.ts = Date.now();
      if (self != null) a.self = self;
      s.history.push({ ts: Date.now(), sub, qid, theme, correct: !!correct, ms: ms || 0 });
      if (s.history.length > 5000) s.history.splice(0, s.history.length - 5000);
      const today = localDay(Date.now());
      if (s.streak.last !== today) {
        const y = new Date(Date.now() - 864e5);
        s.streak.count = (s.streak.last === localDay(y)) ? s.streak.count + 1 : 1;
        s.streak.last = today;
      }
      this.save();
    },
    togglePlan: id => { s.plan[id] = !s.plan[id]; this.save(); },
    addVariant: v => { s.variants.push(v); if (s.variants.length > 200) s.variants.shift(); this.save(); },
    reset: () => { s = defaults(); this.save(); }
  };
})();
