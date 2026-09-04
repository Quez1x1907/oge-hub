// Пятёрка — тренажёр ОГЭ. Ядро приложения: роутер, экраны, сессии, варианты, статистика
window.App = (function () {
  const S = Store, E = Engine, D = window.OGE_DATA, TH = window.THEMES;
  const ORDER = ['math', 'russian', 'social', 'informatics'];
  const SUBJ = {
    math: { name: 'Математика', icon: '🔢', color: '#4757e6', format: '25 заданий: 19 с кратким ответом + 6 с развёрнутым · 3 ч 55 мин · максимум 31 балл' },
    russian: { name: 'Русский язык', icon: '📝', color: '#d6456b', format: '13 заданий · 3 ч 55 мин: сжатое изложение, 11 заданий с кратким ответом, сочинение-рассуждение (13.1–13.3)' },
    social: { name: 'Обществознание', icon: '⚖️', color: '#b97a0a', format: '24 задания: 16 с кратким ответом + 8 с развёрнутым · 3 часа' },
    informatics: { name: 'Информатика', icon: '💻', color: '#1a9e6e', format: '16 заданий · 2 ч 30 мин: письменная часть + практическая (на компьютере)' }
  };
  const TESTS = { math: { n: 15, min: 45 }, russian: { n: 12, min: 30 }, social: { n: 15, min: 30 }, informatics: { n: 12, min: 30 } };

  let session = null;      // { sub, list, idx, sel, results, ok, checked, selfStage, pendingText, t0, finished }
  let lastResults = null;
  let test = null;         // { sub, list, cur, drafts, timeLeft, phase }
  let testTimer = null;

  const $ = s => document.querySelector(s);
  const view = () => $('#view');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function go(h) {
    if (location.hash === h) { route(); return; }
    location.hash = h;
  }
  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function gradeOf(pct) { return pct >= 90 ? 5 : pct >= 70 ? 4 : pct >= 50 ? 3 : 2; }
  function dispAnswer(q) {
    if (q.type === 'choice') return q.options[q.answer] != null ? q.options[q.answer] : String(q.answer);
    if (q.type === 'number') return (Array.isArray(q.answer) ? q.answer : [q.answer]).map(x => String(x).replace('.', ',')).join(' или ');
    return q.accept ? q.accept[0] : 'развёрнутый ответ';
  }
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------- подсчёты ---------- */
  function subState(sub) {
    const st = S.get();
    let attempts = 0, correct = 0, solved = 0, lastTs = 0;
    (D[sub] || []).forEach(q => {
      const a = st.answers[q.id];
      if (a) { attempts += a.attempts; correct += a.ok; if (a.attempts > 0) solved++; if (a.ts > lastTs) lastTs = a.ts; }
    });
    const total = (D[sub] || []).length;
    const pct = attempts ? Math.round(100 * correct / attempts) : 0;
    return { attempts, correct, pct, solved, total, lastTs, grade: attempts < 5 ? null : gradeOf(pct) };
  }
  function themeState(sub, theme) {
    const st = S.get();
    const qs = (D[sub] || []).filter(q => q.theme === theme);
    let att = 0, okc = 0, solved = 0;
    qs.forEach(q => {
      const a = st.answers[q.id];
      if (a) { att += a.attempts; okc += a.ok; if (a.attempts > 0) solved++; }
    });
    return { att, okc, solved, total: qs.length, pct: att ? Math.round(100 * okc / att) : 0 };
  }
  function reviewList() {
    const st = S.get();
    const res = [];
    ORDER.forEach(sub => (D[sub] || []).forEach(q => {
      const a = st.answers[q.id];
      if (a && a.attempts > 0 && !a.lastCorrect) res.push({ sub, q });
    }));
    return res;
  }
  function daysToExam() {
    const u = S.get().user;
    const target = new Date(u.examDate || '2027-06-07');
    return Math.max(0, Math.ceil((target - new Date()) / 864e5));
  }

  /* ---------- роутер ---------- */
  function route() {
    const h = location.hash || '#/';
    const parts = h.slice(2).split('/');
    setTopTitle(); markNav();
    window.scrollTo(0, 0);
    if (parts[0] === 'subject' && SUBJ[parts[1]]) return renderSubject(parts[1]);
    if (parts[0] === 'session') return renderSession();
    if (parts[0] === 'test') return renderTest();
    if (parts[0] === 'stats') return renderStats();
    if (parts[0] === 'plan') return renderPlan();
    if (parts[0] === 'ai') return renderAI();
    if (parts[0] === 'settings') return renderSettings();
    return renderHome();
  }
  function setTopTitle() {
    const h = location.hash || '#/';
    const parts = h.slice(2).split('/');
    let t = 'Главная';
    if (parts[0] === 'subject' && SUBJ[parts[1]]) t = SUBJ[parts[1]].name;
    else if (parts[0] === 'test') t = 'Короткий вариант';
    else if (parts[0] === 'stats') t = 'Статистика';
    else if (parts[0] === 'plan') t = 'План подготовки';
    else if (parts[0] === 'ai') t = 'ИИ-репетитор';
    else if (parts[0] === 'settings') t = 'Настройки';
    else if (parts[0] === 'session') t = session && session.finished ? 'Итоги' : 'Тренировка';
    $('#top-title').textContent = t;
  }
  function markNav() {
    const h = location.hash || '#/';
    const parts = h.slice(2).split('/');
    let key = parts[0] || 'home';
    if (parts[0] === 'subject') key = 's:' + parts[1];
    if (parts[0] === 'session' && session) key = 's:' + session.sub;
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('data-r') === key));
  }
  function updateStreakChip() {
    const st = S.get();
    const el = $('#top-streak');
    if (el) el.textContent = '🔥 ' + (st.streak.last === todayStr() ? st.streak.count : 0);
  }
  function applyTheme() {
    const st = S.get();
    document.documentElement.setAttribute('data-theme', st.user.theme || 'light');
    const b = $('#top-theme');
    if (b) b.textContent = st.user.theme === 'dark' ? '☀️' : '🌙';
  }

  /* ---------- главная ---------- */
  function renderHome() {
    const st = S.get(), u = st.user;
    const tot = st.history.length;
    const corr = st.history.filter(h => h.correct).length;
    const acc = tot ? Math.round(100 * corr / tot) : 0;
    const rev = reviewList().length;
    const days = daysToExam();
    const months = Math.floor(days / 30.4);
    const week = st.history.filter(h => h.ts >= Date.now() - 7 * 864e5).length;
    const goal = u.weeklyGoal || 40;

    // день года → совет
    const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
    const tipSub = ORDER[doy % 4];
    const tip = (window.TIPS[tipSub] || [])[doy % 6];

    const last = st.history[st.history.length - 1];

    let subjCards = ORDER.map(sub => {
      const s = subState(sub);
      const wrong = reviewList().filter(r => r.sub === sub).length;
      const g = s.grade;
      return `<div class="card">
        <div class="row between wrap">
          <div class="row gap8"><span style="font-size:22px">${SUBJ[sub].icon}</span><b>${SUBJ[sub].name}</b></div>
          ${g ? `<span class="grade g${g}" style="width:40px;height:40px;font-size:18px">${g}</span>` : '<span class="chip">мало данных</span>'}
        </div>
        <div class="bar" style="margin-top:12px"><i style="width:${Math.round(100 * s.solved / Math.max(1, s.total))}%;background:${SUBJ[sub].color}"></i></div>
        <div class="row between small muted" style="margin-top:6px">
          <span>решено ${s.solved}/${s.total} · точность ${s.pct}%</span>
          <span>${s.attempts} ответов</span>
        </div>
        <div class="row gap8" style="margin-top:12px">
          <button class="btn btn-primary" style="flex:1" onclick="App.goSubject('${sub}')">Тренировать</button>
          ${wrong ? `<button class="btn" onclick="App.reviewStart('${sub}')" title="Последний ответ неверный">🔁 ${wrong}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // слабые темы
    const weak = [];
    ORDER.forEach(sub => TH[sub].forEach(t => {
      const ts = themeState(sub, t.id);
      if (ts.att >= 3 && ts.pct < 70) weak.push({ sub, t, ts });
    }));
    weak.sort((a, b) => a.ts.pct - b.ts.pct);
    const weakHtml = weak.slice(0, 5).map(w =>
      `<li style="margin:6px 0"><a href="#/subject/${w.sub}" style="text-decoration:none"><b>${SUBJ[w.sub].icon} ${E.themeName(w.sub, w.t.id)}</b></a> <span class="chip bad">${w.ts.pct}%</span></li>`
    ).join('') || '<li style="margin:6px 0" class="muted">Пока нет слабых тем — продолжай в том же духе!</li>';

    view().innerHTML = `
      <div class="row between wrap gap10">
        <div>
          <h1>Привет, ${u.name ? esc(u.name) : 'эка!'} 👋</h1>
          <div class="muted">До ОГЭ примерно <b>${months ? months + ' мес. ' : ''}${days} дн.</b> (дата настраивается в Настройках)</div>
        </div>
        <button class="btn btn-primary" onclick="App.continueLast()">▶ Продолжить</button>
      </div>

      <div class="grid g4" style="margin-top:18px">
        <div class="card stat"><span class="v">${tot}</span><span class="l">всего ответов</span></div>
        <div class="card stat"><span class="v" style="color:${acc >= 70 ? 'var(--ok)' : acc >= 50 ? 'var(--warn)' : 'var(--bad)'}">${tot ? acc + '%' : '—'}</span><span class="l">точность</span></div>
        <div class="card stat"><span class="v">${st.streak.last === todayStr() ? st.streak.count : 0}</span><span class="l">дней подряд 🔥</span></div>
        <div class="card stat"><span class="v">${rev}</span><span class="l">на разборе ошибок</span></div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="row between wrap">
          <b>Цель на неделю: ${goal} ответов</b>
          <span class="muted small">${week} из ${goal}</span>
        </div>
        <div class="bar" style="margin-top:10px"><i style="width:${Math.min(100, Math.round(100 * week / goal))}%"></i></div>
      </div>

      <h2>Предметы</h2>
      <div class="grid g2">${subjCards}</div>

      <div class="grid g2" style="margin-top:14px">
        <div class="card">
          <b>🎯 Слабые темы</b>
          <ul style="margin-top:8px;padding-left:18px">${weakHtml}</ul>
        </div>
        <div class="card">
          <b>💡 Совет дня <span class="chip">${SUBJ[tipSub].name}</span></b>
          <p style="margin-top:10px">${esc(tip || 'Регулярность важнее марафонов: лучше 30 минут каждый день, чем 4 часа раз в неделю.')}</p>
          ${last ? `<div class="muted small" style="margin-top:10px">Последнее: ${SUBJ[last.sub] ? SUBJ[last.sub].name : last.sub} · ${last.correct ? 'верно' : 'неверно'}</div>` : ''}
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <b>Как пользоваться</b>
        <ol style="margin-top:8px;padding-left:18px;line-height:1.9">
          <li>Открывай предмет → тему → решай задания. Ответы проверяются сразу, с разбором.</li>
          <li>Неправильные попадают в «разбор ошибок» — возвращайся к ним.</li>
          <li>Раз в неделю проходи «Короткий вариант» по таймеру — как на экзамене.</li>
          <li>Следуй «Плану» (от сентября до июня) и следи за «Статистикой».</li>
          <li>Застрял? «Спросить ИИ по заданию» — репетитор разберёт по шагам.</li>
        </ol>
      </div>`;
  }
  function continueLast() {
    const st = S.get();
    const last = st.history[st.history.length - 1];
    if (last && SUBJ[last.sub]) goSubject(last.sub);
    else go('#/subject/math');
  }
  function goSubject(sub) { go('#/subject/' + sub); }

  /* ---------- предмет ---------- */
  function renderSubject(sub) {
    const s = subState(sub);
    const g = s.grade;
    let notes = '';
    if (sub === 'russian') notes = '<div class="note">⚠️ Задание 1 (сжатое изложение) и задание 13 (сочинение) не проверяются автоматически — тренируй их на бумаге: изложение по схеме «аннотация → план → сжатый текст», сочинение — «комментарий (2 примера из текста) → проблема → вывод». Тестовые задания (2–12) и грамматика диктанта — прямо здесь.</div>';
    if (sub === 'informatics') notes = '<div class="note">⚠️ Практические задания на компьютере (файлы, презентации, программы) выполняются на экзамене в редакторе — здесь тренируй теорию, Python (в уме и на бумаге) и все письменные задания.</div>';

    const themes = TH[sub].map(t => {
      const ts = themeState(sub, t.id);
      return `<div class="card">
        <div class="row between">
          <b>${t.name}</b>
          <span class="chip ${ts.att === 0 ? '' : ts.pct >= 85 ? 'ok' : ts.pct >= 60 ? 'warn' : 'bad'}">${ts.att === 0 ? 'не начата' : ts.pct + '%'}</span>
        </div>
        <div class="bar" style="margin-top:10px"><i style="width:${ts.att ? ts.pct : 0}%;background:${SUBJ[sub].color}"></i></div>
        <div class="row between small muted" style="margin-top:6px"><span>${ts.solved} из ${ts.total} заданий · ${ts.att} ответов</span></div>
        <button class="btn" style="margin-top:10px;width:100%" onclick="App.startSession('${sub}','${t.id}')">Тренировать</button>
      </div>`;
    }).join('');

    view().innerHTML = `
      <div class="row between wrap gap10">
        <div>
          <h1>${SUBJ[sub].icon} ${SUBJ[sub].name}</h1>
          <div class="muted small">${SUBJ[sub].format}</div>
        </div>
        ${g ? `<span class="grade g${g}">${g}</span>` : '<span class="chip" title="Нужно хотя бы 5 ответов">оценка появится после 5 ответов</span>'}
      </div>

      <div class="grid g4" style="margin-top:16px">
        <div class="card stat"><span class="v">${s.solved}/${s.total}</span><span class="l">заданий решено</span></div>
        <div class="card stat"><span class="v">${s.pct}%</span><span class="l">точность</span></div>
        <div class="card stat"><span class="v">${s.attempts}</span><span class="l">ответов всего</span></div>
        <div class="card stat"><span class="v">${reviewList().filter(r => r.sub === sub).length}</span><span class="l">на разборе</span></div>
      </div>

      <div class="row gap8 wrap" style="margin-top:14px">
        <button class="btn btn-primary" onclick="App.startSession('${sub}',null)">🔀 Смешанная практика (10 заданий)</button>
        <button class="btn" onclick="App.startReal('${sub}')">📌 Реальные задания ОГЭ (${(D[sub] || []).filter(q => q.real).length})</button>
        <button class="btn" onclick="go('#/test')">📋 Короткий вариант по таймеру</button>
        ${reviewList().filter(r => r.sub === sub).length ? `<button class="btn" onclick="App.reviewStart('${sub}')">🔁 Разобрать ошибки</button>` : ''}
      </div>

      ${notes}
      <h2>Темы</h2>
      <div class="grid g2">${themes}</div>`;
  }

  /* ---------- тренировка ---------- */
  function startSession(sub, theme, fixedList) {
    let list;
    if (fixedList && fixedList.length) {
      list = fixedList;
    } else {
      const pool = (D[sub] || []).filter(q => !theme || q.theme === theme);
      list = E.shuffle(pool).slice(0, 10);
    }
    if (!list.length) { toast('В этой теме пока нет заданий'); return; }
    session = { sub, theme, list, idx: 0, sel: null, results: {}, ok: 0, checked: false, selfStage: false, pendingText: '', t0: Date.now(), finished: false };
    lastResults = null;
    go('#/session');
  }
  function curQ() { return session.list[session.idx]; }

  function inputHtml(q, opts) {
    if (q.type === 'choice') {
      return q.options.map((o, i) =>
        `<button class="opt${opts && opts.sel === i ? ' sel' : ''}" onclick="${opts && opts.test ? 'App.testSel(' + i + ')' : 'App.sel(' + i + ')'}">${esc(o)}</button>`
      ).join('');
    }
    if (q.type === 'number') {
      const val = opts && opts.value != null ? esc(opts.value) : '';
      const enter = opts && opts.test ? 'App.testEnter()' : 'App.checkClick()';
      return `<div class="row gap10">
        <input id="num-input" class="inp wide" inputmode="decimal" placeholder="Число. Напр.: 14, 0,7, −3, 1,2" value="${val}" onkeydown="if(event.key==='Enter'){event.preventDefault();${enter}}">
        ${opts && opts.test ? '' : '<button class="btn btn-primary" onclick="App.checkClick()">Проверить</button>'}
      </div>${opts && opts.test ? '<div class="muted small" style="margin-top:8px">Ответ — число (звёздочка в условии не нужна). Ответ сохранится при переходе к другому заданию. Enter — дальше.</div>' : '<div class="muted small" style="margin-top:8px">Enter — проверить</div>'}`;
    }
    const val = opts && opts.value != null ? esc(opts.value) : '';
    const enterTa = opts && opts.test ? 'App.testEnter()' : 'App.textSave()';
    return `<textarea id="text-input" class="inp" rows="4" placeholder="Запиши ответ…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();${enterTa}}">${val}</textarea>
      ${opts && opts.test ? '<div class="muted small" style="margin-top:8px">Ответ сохранится при переходе к другому заданию. Enter — дальше.</div>' : '<div class="row gap8 wrap" style="margin-top:8px"><button class="btn btn-primary" onclick="App.textSave()">Сохранить ответ</button><span class="muted small">Enter — сохранить</span></div>'}`;
  }

  function renderSession() {
    if (!session) { if (lastResults) return renderResults(); go('#/'); return; }
    if (session.finished) return renderResults();
    const q = curQ();
    const sub = session.sub;
    const i = session.idx, n = session.list.length;
    let body;
    if (session.selfStage) {
      body = `
        <div class="card" style="margin-top:14px">
          <b>Оцени себя честно</b>
          <p class="muted small" style="margin:6px 0 10px">Сравни свой ответ с образцом и выбери, насколько он совпадает.</p>
          <div class="row gap8 wrap">
            <button class="btn" onclick="App.selfGrade(0)">✗ Неверно (0)</button>
            <button class="btn" onclick="App.selfGrade(0.5)">~ Частично (0,5)</button>
            <button class="btn btn-primary" onclick="App.selfGrade(1)">✓ Верно (1)</button>
          </div>
        </div>`;
    } else if (session.checked) {
      const r = session.results[q.id];
      body = `
        <div class="feedback ${r.correct ? 'ok' : 'bad'}">${r.correct ? '✅ Верно!' : '❌ Неверно. Правильный ответ: <b>' + esc(dispAnswer(q)) + '</b>'}</div>
        <div class="explain"><b>Разбор:</b> ${esc(q.explanation || '—')}</div>
        <div class="row gap8 wrap" style="margin-top:14px">
          <button class="btn" onclick="App.askAI()">🤖 Спросить ИИ по заданию</button>
          <button class="btn btn-primary" style="flex:1" onclick="App.next()">${i + 1 < n ? 'Дальше →' : 'К итогам →'}</button>
        </div>`;
    } else {
      body = inputHtml(q, { sel: session.sel }) + `
        <div class="row gap8 wrap" style="margin-top:14px">
          ${q.type === 'choice' ? '<button class="btn btn-primary" onclick="App.checkClick()">Проверить</button>' : ''}
          <button class="btn" onclick="App.skip()">Не знаю — показать решение</button>
        </div>`;
    }

    view().innerHTML = `
      <div class="row between wrap gap10">
      <div class="row gap8 wrap">
        <span class="chip">${SUBJ[sub].icon} ${SUBJ[sub].name}</span>
        <span class="chip">${E.themeName(sub, q.theme)}</span>
        ${q.real ? '<span class="chip ok">📌 реальный ОГЭ</span>' : ''}
        ${q.diff >= 3 ? '<span class="chip bad">сложное</span>' : q.diff === 2 ? '<span class="chip warn">повышенное</span>' : ''}
      </div>
        <button class="btn btn-mini" onclick="App.quitSession()">✕ Завершить</button>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="bar"><i style="width:${Math.round(100 * i / n)}%"></i></div>
        <div class="muted small" style="margin-top:6px">Задание ${i + 1} из ${n}</div>
      </div>
      <div class="card qcard" style="margin-top:12px">
        <div class="qprompt">${esc(q.prompt)}</div>
        ${body}
      </div>`;
  }

  function sel(i) { session.sel = i; renderSession(); }
  function checkClick() {
    const q = curQ();
    if (q.type === 'choice') {
      if (session.sel == null) return toast('Сначала выбери вариант');
      finishCheck(q, String(session.sel), E.check(q, session.sel));
    } else if (q.type === 'number') {
      const v = $('#num-input').value;
      if (!v.trim()) return toast('Введи ответ');
      finishCheck(q, v.trim(), E.check(q, v));
    }
  }
  function textSave() {
    const q = curQ();
    const v = $('#text-input').value;
    if (!v.trim()) return toast('Сначала напиши ответ');
    if (q.accept) {
      finishCheck(q, v.trim(), E.check(q, v));
    } else {
      session.pendingText = v.trim();
      session.selfStage = true;
      renderSession();
    }
  }
  function selfGrade(g) {
    const q = curQ();
    finishCheck(q, session.pendingText, g === 1, g);
  }
  function skip() {
    const q = curQ();
    finishCheck(q, '—', false);
  }
  function finishCheck(q, val, correct, self) {
    session.results[q.id] = { q, val, correct, self };
    if (correct) session.ok++;
    S.recordAnswer(session.sub, q.id, q.theme, correct, Date.now() - session.t0, self);
    session.checked = true;
    session.selfStage = false;
    renderSession();
  }
  function next() {
    session.idx++;
    session.sel = null; session.checked = false; session.selfStage = false; session.pendingText = '';
    if (session.idx >= session.list.length) {
      session.finished = true;
      lastResults = {
        kind: 'practice', sub: session.sub,
        results: Object.values(session.results),
        ok: session.ok,
        pct: Math.round(100 * session.ok / session.list.length)
      };
      session = null;
    }
    renderSession();
  }
  function quitSession() {
    if (session && Object.keys(session.results).length) toast('Прогресс по решённым заданиям сохранён');
    session = null;
    go('#/');
  }
  function askAI() {
    const q = curQ();
    window.AI.setContext(Object.assign({}, q, { _sub: session.sub }));
    go('#/ai');
  }
  function startReal(sub) {
    const list = (D[sub] || []).filter(q => q.real);
    if (!list.length) return toast('Реальных заданий пока нет');
    startSession(sub, null, list);
  }
  function reviewStart(sub) {
    const list = reviewList().filter(r => (!sub || r.sub === sub) && r.sub === (sub || r.sub)).map(r => r.q);
    const withSub = reviewList().filter(r => !sub || r.sub === sub);
    if (!withSub.length) { toast('Ошибок нет — отлично!'); return; }
    if (sub) { startSession(sub, null, withSub.map(r => r.q)); return; }
    // без указания предмета — берём предмет с наибольшим числом ошибок
    const counts = {};
    withSub.forEach(r => counts[r.sub] = (counts[r.sub] || 0) + 1);
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    toast('Начинаем с: ' + SUBJ[top].name + ' (больше всего ошибок)');
    startSession(top, null, withSub.filter(r => r.sub === top).map(r => r.q));
  }

  /* ---------- короткий вариант ---------- */
  function buildTestList(sub) {
    const themes = E.shuffle(TH[sub].map(t => t.id));
    const byTheme = {};
    themes.forEach(t => byTheme[t] = E.shuffle((D[sub] || []).filter(q => q.theme === t)));
    const list = [];
    let added = true;
    while (list.length < TESTS[sub].n && added) {
      added = false;
      for (const t of themes) {
        if (byTheme[t].length) { list.push(byTheme[t].pop()); added = true; if (list.length >= TESTS[sub].n) break; }
      }
    }
    if (list.length < TESTS[sub].n) {
      const rest = E.shuffle((D[sub] || []).filter(q => !list.includes(q)));
      while (list.length < TESTS[sub].n && rest.length) list.push(rest.pop());
    }
    return E.shuffle(list);
  }
  function startTest(sub) {
    if (test) clearInterval(testTimer);
    test = { sub, list: buildTestList(sub), cur: 0, drafts: {}, sel: {}, timeLeft: TESTS[sub].min * 60, phase: 'run' };
    lastResults = null;
    go('#/test');
    renderTestRun();
    startTimer();
  }
  function renderTest() {
    if (test && test.phase === 'run') { renderTestRun(); return; }
    const cards = ORDER.map(sub => `
      <div class="card">
        <div class="row between"><b>${SUBJ[sub].icon} ${SUBJ[sub].name}</b><span class="chip">${TESTS[sub].n} заданий · ${TESTS[sub].min} мин</span></div>
        <p class="muted small" style="margin:8px 0">Задания берутся из всех тем. Таймер, без подсказок — как на экзамене.</p>
        <button class="btn btn-primary" style="width:100%" onclick="App.startTest('${sub}')">Старт</button>
      </div>`).join('');
    const variants = S.get().variants.slice(-5).reverse();
    const hist = variants.length ? `
      <h2>Последние варианты</h2>
      <div class="card"><table class="tbl">
        <tr><th>Дата</th><th>Предмет</th><th>Результат</th><th>Оценка</th></tr>
        ${variants.map(v => `<tr><td>${new Date(v.ts).toLocaleDateString('ru-RU')}</td><td>${SUBJ[v.sub].icon} ${SUBJ[v.sub].name}</td><td>${v.ok}/${v.total} (${v.pct}%)</td><td><b>${v.grade}</b></td></tr>`).join('')}
      </table></div>` : '';
    view().innerHTML = `
      <h1>📋 Короткий вариант</h1>
      <p class="muted">Тренировка в условиях экзамена: таймер, все темы, проверка после завершения. Если страница перезагрузится во время варианта, он не сохранится.</p>
      <div class="grid g2" style="margin-top:14px">${cards}</div>
      ${hist}`;
  }
  function renderTestRun() {
    const q = test.list[test.cur];
    const sub = test.sub;
    const nav = test.list.map((qq, i) => {
      let cls = 't-nav';
      if (i === test.cur) cls += ' cur';
      else if (test.drafts[qq.id] != null && String(test.drafts[qq.id]).trim() !== '') cls += ' done';
      return `<button class="${cls}" onclick="App.testGo(${i})">${i + 1}</button>`;
    }).join('');
    view().innerHTML = `
      <div class="row between wrap gap10">
        <div class="row gap8"><span class="chip">${SUBJ[sub].icon} ${SUBJ[sub].name}</span><span class="chip">короткий вариант</span></div>
        <div class="row gap8"><div class="timer" id="test-timer">--:--</div><button class="btn btn-danger btn-mini" onclick="App.testFinish()">Завершить</button></div>
      </div>
      <div class="card" style="margin-top:12px"><div class="t-nav-wrap">${nav}</div></div>
      <div class="card qcard">
        <div class="qtop"><span class="chip">${E.themeName(sub, q.theme)}</span>${q.real ? '<span class="chip ok">📌 реальный ОГЭ</span>' : ''}<span class="muted small">Задание ${test.cur + 1} из ${test.list.length}</span></div>
        <div class="qprompt">${esc(q.prompt)}</div>
        ${inputHtml(q, { test: true, sel: test.sel[qq_id(q)], value: test.drafts[q.id] != null ? test.drafts[q.id] : '' })}
        <div class="row between" style="margin-top:16px">
          <button class="btn" onclick="App.testGo(${Math.max(0, test.cur - 1)})" ${test.cur === 0 ? 'disabled' : ''}>← Назад</button>
          ${test.cur < test.list.length - 1
            ? `<button class="btn btn-primary" onclick="App.testGo(${test.cur + 1})">Дальше →</button>`
            : `<button class="btn btn-primary" onclick="App.testFinish()">Завершить ✓</button>`}
        </div>
      </div>`;
    updateTimerEl();
    function qq_id(q) { return q.id; }
  }
  function saveCurrentTestInput() {
    const q = test.list[test.cur];
    if (q.type === 'choice') {
      if (test.sel[q.id] != null) test.drafts[q.id] = String(test.sel[q.id]);
    } else {
      const el = q.type === 'number' ? $('#num-input') : $('#text-input');
      if (el) test.drafts[q.id] = el.value;
    }
  }
  function testGo(i) {
    if (i < 0 || i >= test.list.length) return;
    saveCurrentTestInput();
    test.cur = i;
    renderTestRun();
  }
  function testSel(i) {
    const q = test.list[test.cur];
    test.sel[q.id] = i;
    test.drafts[q.id] = String(i);
    renderTestRun();
  }
  function testEnter() {
    saveCurrentTestInput();
    if (test.cur < test.list.length - 1) testGo(test.cur + 1);
    else testFinish();
  }
  function startTimer() {
    clearInterval(testTimer);
    testTimer = setInterval(() => {
      if (!test || test.phase !== 'run') { clearInterval(testTimer); return; }
      test.timeLeft--;
      updateTimerEl();
      if (test.timeLeft <= 0) finishTest(true);
    }, 1000);
  }
  function updateTimerEl() {
    const el = $('#test-timer');
    if (!el || !test) return;
    const m = Math.floor(Math.max(0, test.timeLeft) / 60), s = Math.max(0, test.timeLeft) % 60;
    el.textContent = m + ':' + String(s).padStart(2, '0');
    el.className = 'timer' + (test.timeLeft < 120 ? ' danger' : '');
  }
  function testFinish() {
    saveCurrentTestInput();
    const unanswered = test.list.filter(q => test.drafts[q.id] == null || String(test.drafts[q.id]).trim() === '').length;
    if (unanswered > 0 && !confirm('Не отвечено заданий: ' + unanswered + '. Завершить вариант?')) return;
    finishTest();
  }
  function finishTest() {
    if (!test) return;
    clearInterval(testTimer);
    const sub = test.sub;
    const results = test.list.map(q => {
      const val = test.drafts[q.id];
      const ok = val != null && String(val).trim() !== '' && E.check(q, val);
      S.recordAnswer(sub, q.id, q.theme, ok, 0, null);
      return { q, val: val == null ? '—' : String(val), correct: ok };
    });
    const okc = results.filter(r => r.correct).length;
    const pct = Math.round(100 * okc / results.length);
    const grade = gradeOf(pct);
    const tb = {};
    results.forEach(r => { const k = r.q.theme; (tb[k] = tb[k] || { ok: 0, n: 0 }); tb[k].n++; tb[k].ok += r.correct ? 1 : 0; });
    const spent = TESTS[sub].min * 60 - test.timeLeft;
    S.addVariant({ ts: Date.now(), sub, ok: okc, total: results.length, pct, grade, spent });
    lastResults = { kind: 'test', sub, results, ok: okc, pct, grade, tb, spent };
    test = null;
    renderResults();
  }

  /* ---------- итоги ---------- */
  function renderResults() {
    const R = lastResults;
    if (!R) { go('#/'); return; }
    const sub = R.sub;
    const grade = R.grade != null ? R.grade : gradeOf(R.pct);
    const wrong = R.results.filter(r => !r.correct);
    const spent = R.spent != null ? Math.floor(R.spent / 60) + ' мин ' + (R.spent % 60) + ' с' : null;

    let tbHtml = '';
    if (R.tb) {
      tbHtml = `<h2>По темам</h2><div class="card"><table class="tbl"><tr><th>Тема</th><th>Результат</th></tr>
        ${Object.keys(R.tb).map(k => `<tr><td>${E.themeName(sub, k)}</td><td><b>${R.tb[k].ok}/${R.tb[k].n}</b></td></tr>`).join('')}
      </table></div>`;
    }

    const wrongHtml = wrong.length ? `
      <h2>Разбор ошибок (${wrong.length})</h2>
      ${wrong.map(r => `<div class="card" style="margin-bottom:12px">
        <div class="row gap8 wrap"><span class="chip">${E.themeName(sub, r.q.theme)}</span><span class="chip bad">неверно</span></div>
        <div class="qprompt" style="margin:10px 0 4px">${esc(r.q.prompt)}</div>
        <div class="small muted">Твой ответ: <b>${esc(r.val)}</b> · Верный: <b>${esc(dispAnswer(r.q))}</b></div>
        <div class="explain"><b>Разбор:</b> ${esc(r.q.explanation || '—')}</div>
      </div>`).join('')}` : '<div class="note ok">🎉 Без ошибок — отличная работа!</div>';

    view().innerHTML = `
      <div class="row gap14 wrap">
        <span class="grade g${grade}">${grade}</span>
        <div>
          <h1>${R.kind === 'test' ? 'Вариант завершён' : 'Тренировка завершена'}</h1>
          <div class="muted">${SUBJ[sub].icon} ${SUBJ[sub].name} · верно ${R.ok} из ${R.results.length} (${R.pct}%)${spent ? ' · время ' + spent : ''}</div>
          <div class="muted small" style="margin-top:4px">Оценка по точности: 90%+ → 5 · 70–89% → 4 · 50–69% → 3 · &lt;50% → 2</div>
        </div>
      </div>
      ${tbHtml}
      ${wrongHtml}
      <div class="row gap8 wrap" style="margin-top:16px">
        ${wrong.length ? `<button class="btn btn-primary" onclick="App.reviewStart('${sub}')">🔁 Тренировать ошибки</button>` : ''}
        <button class="btn" onclick="App.startSession('${sub}',null)">Ещё тренировка</button>
        ${R.kind === 'test' ? `<button class="btn" onclick="App.startTest('${sub}')">Ещё вариант</button>` : ''}
        <button class="btn" onclick="App.goSubject('${sub}')">К предмету</button>
        <button class="btn" onclick="App.toHome()">На главную</button>
      </div>`;
  }
  function toHome() { lastResults = null; go('#/'); }

  /* ---------- статистика ---------- */
  function renderStats() {
    const st = S.get();
    const tot = st.history.length;
    const corr = st.history.filter(h => h.correct).length;
    const acc = tot ? Math.round(100 * corr / tot) : 0;
    const rev = reviewList().length;
    const uniq = Object.keys(st.answers).length;

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const label = d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0');
      const n = st.history.filter(h => {
        const hd = new Date(h.ts);
        return hd.getFullYear() + '-' + String(hd.getMonth() + 1).padStart(2, '0') + '-' + String(hd.getDate()).padStart(2, '0') === key;
      }).length;
      days.push({ label, n });
    }

    const charts = ORDER.map(sub => {
      const items = TH[sub].map(t => {
        const ts = themeState(sub, t.id);
        return { label: t.name, value: ts.pct, color: SUBJ[sub].color };
      });
      return `<div class="card">
        <div class="row between"><b>${SUBJ[sub].icon} ${SUBJ[sub].name}</b><span class="muted small">мастерство по темам, %</span></div>
        <canvas id="ch-${sub}" class="chart" style="height:130px;margin-top:8px"></canvas>
        <div data-barchart="${sub}" data-items='${escAttr(items)}' hidden></div>
      </div>`;
    }).join('');

    const revItems = reviewList().slice(0, 30).map(r => `
      <tr>
        <td>${SUBJ[r.sub].icon}</td>
        <td>${E.themeName(r.sub, r.q.theme)}</td>
        <td style="max-width:340px">${esc(r.q.prompt.length > 110 ? r.q.prompt.slice(0, 110) + '…' : r.q.prompt)}</td>
        <td><button class="btn btn-mini" onclick="App.redoOne('${r.q.id}')">Решить ещё</button></td>
      </tr>`).join('');

    view().innerHTML = `
      <h1>📊 Статистика</h1>
      <div class="grid g4" style="margin-top:14px">
        <div class="card stat"><span class="v">${uniq}</span><span class="l">уникальных заданий</span></div>
        <div class="card stat"><span class="v">${tot}</span><span class="l">ответов всего</span></div>
        <div class="card stat"><span class="v">${acc}%</span><span class="l">точность</span></div>
        <div class="card stat"><span class="v">${rev}</span><span class="l">ошибок на разборе</span></div>
      </div>

      <h2>Активность за 14 дней</h2>
      <div class="card"><canvas id="ch1" class="chart"></canvas></div>

      <h2>Мастерство по темам</h2>
      <div class="grid g2">${charts}</div>

      <h2>Разбор ошибок ${rev ? `<button class="btn btn-primary" style="float:right" onclick="App.reviewStart()">Разобрать все</button>` : ''}</h2>
      ${rev ? `<div class="card"><table class="tbl">
        <tr><th></th><th>Тема</th><th>Задание</th><th></th></tr>
        ${revItems}
      </table></div>` : '<div class="note ok">Список ошибок пуст — всё под контролем!</div>'}

      <h2>Экспорт</h2>
      <div class="card">
        <div class="row gap8 wrap">
          <button class="btn" onclick="App.exportData()">⬇ Скачать прогресс (JSON)</button>
          <span class="muted small">Там вся история ответов, варианты и план — можно сохранить себе.</span>
        </div>
      </div>`;

    Engine.lineChart($('#ch1'), days.map(d => d.label), days.map(d => d.n));
    ORDER.forEach(sub => {
      const items = TH[sub].map(t => {
        const ts = themeState(sub, t.id);
        return { label: t.name, value: ts.pct, color: SUBJ[sub].color };
      });
      Engine.bars($('#ch-' + sub), items);
    });
  }
  function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }
  function redoOne(qid) {
    for (const sub of ORDER) {
      const q = (D[sub] || []).find(q => q.id === qid);
      if (q) { startSession(sub, null, [q]); return; }
    }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(S.get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pyaterochka-progress.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Файл сохранён');
  }

  /* ---------- план ---------- */
  function renderPlan() {
    const st = S.get();
    const today = todayStr();
    const u = st.user;
    const routine = (window.PLAN.routine || []).map(r => `<li style="margin:5px 0">${esc(r)}</li>`).join('');

    const phases = (window.PLAN.phases || []).map(p => {
      const isNow = today >= p.from && today <= p.to;
      const done = p.tasks.filter(t => st.plan[t.id]).length;
      const focusChips = ['math', 'russian', 'social', 'informatics'].map(s =>
        (p.focus[s] && p.focus[s].length) ? `<span class="chip" title="${SUBJ[s].name}">${SUBJ[s].icon} ${p.focus[s].join(', ')}</span>` : ''
      ).filter(Boolean).join(' ');
      return `<div class="card phase ${isNow ? 'now' : ''}">
        <div class="ph-h">
          <span style="font-size:24px">${p.icon}</span>
          <b style="font-size:16px">${p.name}</b>
          <span class="chip">${p.from.slice(8)}.${p.from.slice(5, 7)}.${p.from.slice(0, 4)} — ${p.to.slice(8)}.${p.to.slice(5, 7)}.${p.to.slice(0, 4)}</span>
          ${isNow ? '<span class="chip ok">сейчас</span>' : ''}
          <span class="muted small" style="margin-left:auto">${done}/${p.tasks.length} задач</span>
        </div>
        <p style="margin:8px 0" class="small"><b>Цель:</b> ${esc(p.goal)}</p>
        <div class="row gap8 wrap" style="margin:8px 0">${focusChips}</div>
        <div class="bar" style="margin:8px 0"><i style="width:${Math.round(100 * done / p.tasks.length)}%"></i></div>
        <div style="margin-top:6px">
          ${p.tasks.map(t => `
            <label class="task ${st.plan[t.id] ? 'done' : ''}">
              <input type="checkbox" ${st.plan[t.id] ? 'checked' : ''} onchange="App.togglePlan('${t.id}')">
              <span>${t.subj !== 'all' ? `<b class="small">${SUBJ[t.subj].icon}</b> ` : '⭐ '}${esc(t.text)}</span>
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');

    view().innerHTML = `
      <div class="row between wrap gap10">
        <div>
          <h1>🗓️ План подготовки</h1>
          <div class="muted">Сентябрь 2026 → ${esc((u.examDate || '2027-06-07').split('-').reverse().join('.'))} (до экзамена ${daysToExam()} дн.)</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <b>Еженедельный ритм</b>
        <ul style="margin-top:8px;padding-left:18px">${routine}</ul>
      </div>
      <h2>Этапы</h2>
      ${phases}`;
  }
  function togglePlan(id) {
    S.togglePlan(id);
    renderPlan();
  }

  /* ---------- ИИ ---------- */
  function renderAI() {
    view().innerHTML = `
      <div class="row between wrap gap10">
        <h1 style="margin-bottom:0">🤖 ИИ-репетитор</h1>
        <div class="row gap8">
          ${window.AI.hasKey() ? '<span class="chip ok">онлайн-режим</span>' : '<span class="chip">офлайн-режим</span>'}
          <button class="btn btn-mini" onclick="App.aiClear()">Очистить</button>
        </div>
      </div>
      <div class="card ai-wrap" style="margin-top:12px">
        <div id="ai-log" class="ai-log"></div>
        <div class="row gap8" style="padding:12px;border-top:1px solid var(--line)">
          <input id="ai-input" class="inp wide" placeholder="Спроси про задание, тему — или напиши свой ответ…">
          <button id="ai-send" class="btn btn-primary">→</button>
        </div>
      </div>
      <p class="muted small" style="margin-top:10px">Офлайн-режим: пошаговый разбор заданий из базы и поиск похожих задач. Онлайн-режим: подключи свой API (OpenAI-совместимый) в Настройках — ключ хранится только в твоём браузере.</p>`;
    window.AI.init(view());
  }
  function aiClear() { window.AI.clear(); }

  /* ---------- настройки ---------- */
  function renderSettings() {
    const u = S.get().user;
    const ai = u.ai || {};
    view().innerHTML = `
      <h1>⚙️ Настройки</h1>
      <div class="grid g2" style="margin-top:14px">
        <div class="card">
          <b>Ученик</b>
          <div style="margin-top:10px">
            <label class="small muted">Имя</label>
            <input id="s-name" class="inp" value="${esc(u.name || '')}" placeholder="Как тебя зовут?">
          </div>
          <div style="margin-top:10px">
            <label class="small muted">Дата экзамена (ОГЭ, основной период)</label>
            <input id="s-date" class="inp" type="date" value="${esc(u.examDate || '2027-06-07')}">
          </div>
          <div style="margin-top:10px">
            <label class="small muted">Цель на неделю (ответов)</label>
            <input id="s-goal" class="inp" type="number" min="5" max="500" value="${esc(String(u.weeklyGoal || 40))}">
          </div>
          <div style="margin-top:10px">
            <label class="small muted">Тема оформления</label>
            <select id="s-theme" class="inp">
              <option value="light" ${u.theme === 'light' ? 'selected' : ''}>Светлая</option>
              <option value="dark" ${u.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
            </select>
          </div>
        </div>
        <div class="card">
          <b>ИИ-репетитор (онлайн-режим)</b>
          <div style="margin-top:10px">
            <label class="small muted">Адрес API (OpenAI-совместимый, base URL)</label>
            <input id="s-ai-base" class="inp" value="${esc(ai.base || '')}" placeholder="https://api.openai.com/v1">
          </div>
          <div style="margin-top:10px">
            <label class="small muted">Ключ API</label>
            <input id="s-ai-key" class="inp" type="password" value="${esc(ai.key || '')}" placeholder="sk-…">
          </div>
          <div style="margin-top:10px">
            <label class="small muted">Модель</label>
            <input id="s-ai-model" class="inp" value="${esc(ai.model || '')}" placeholder="gpt-4o-mini">
          </div>
          <p class="muted small" style="margin-top:10px">Ключ хранится только в этом браузере (localStorage) и отправляется только на указанный тобой адрес. Онлайн-режим работает, когда у браузера есть интернет (например, дома, а не в песочнице).</p>
        </div>
      </div>
      <div class="row gap8 wrap" style="margin-top:16px">
        <button class="btn btn-primary" onclick="App.saveSettings()">Сохранить</button>
        <button class="btn btn-danger" onclick="App.resetAll()">Сбросить все данные</button>
      </div>`;
  }
  function saveSettings() {
    const st = S.get();
    st.user = {
      name: $('#s-name').value.trim(),
      theme: $('#s-theme').value,
      examDate: $('#s-date').value || '2027-06-07',
      weeklyGoal: Math.max(5, Number($('#s-goal').value) || 40),
      ai: {
        base: $('#s-ai-base').value.trim(),
        key: $('#s-ai-key').value.trim(),
        model: $('#s-ai-model').value.trim()
      }
    };
    S.save();
    applyTheme();
    toast('Сохранено');
    route();
  }
  function resetAll() {
    if (!confirm('Удалить ВСЮ статистику, историю и прогресс по плану? Это действие нельзя отменить.')) return;
    S.reset();
    applyTheme();
    session = null; lastResults = null;
    go('#/');
    route();
    toast('Данные сброшены');
  }
  function themeToggle() {
    const st = S.get();
    st.user.theme = st.user.theme === 'dark' ? 'light' : 'dark';
    S.save();
    applyTheme();
    const h = location.hash || '#/';
    if (!h.slice(2).startsWith('ai')) route();
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    updateStreakChip();
    window.addEventListener('hashchange', route);
    setInterval(updateStreakChip, 60000);
    route();
  });

  return {
    goSubject, startSession, startReal, sel, checkClick, textSave, selfGrade, skip, next, quitSession, askAI,
    reviewStart, redoOne, startTest, testGo, testSel, testEnter, testFinish,
    continueLast, toHome, exportData, togglePlan, aiClear,
    saveSettings, resetAll, themeToggle
  };
})();
