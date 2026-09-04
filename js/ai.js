// ИИ-репетитор: офлайн-режим (пошаговый разбор заданий из базы + поиск похожих)
// и онлайн-режим (свой OpenAI-совместимый API, ключ хранится в настройках)
window.AI = (function () {
  const S = Store, E = Engine;
  let log = null, input = null;
  let ctxQ = null;                 // задание, к которому привязан разговор
  let steps = [], stepIdx = 0, inSteps = false;
  let onlineMsgs = [];

  const SUBJ_NAME = s => ({ math: 'математика', russian: 'русский язык', social: 'обществознание', informatics: 'информатика' }[s] || s);

  function cfg() { const s = S.get(); return (s.user && s.user.ai) || {}; }
  function hasKey() { const c = cfg(); return !!(c.key && c.base); }

  function t(text) { return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }

  function bubble(who, html) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.innerHTML = html;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function answerText(q) {
    if (q.type === 'choice') return q.options[q.answer] != null ? q.options[q.answer] : String(q.answer);
    if (q.type === 'number') return (Array.isArray(q.answer) ? q.answer : [q.answer]).map(x => String(x).replace('.', ',')).join(' или ');
    return q.accept ? q.accept[0] : 'развёрнутый ответ (см. разбор)';
  }

  function splitSentences(str) {
    const parts = String(str).match(/[^.!?]+[.!?]*/g) || [String(str)];
    return parts.map(s => s.trim()).filter(Boolean);
  }

  function stepsFor(q) {
    if (q.steps && q.steps.length) return q.steps.slice();
    return splitSentences(q.explanation || '');
  }

  function searchBank(text) {
    const stop = new Set(['как', 'что', 'почему', 'надо', 'нужно', 'решить', 'решите', 'помоги', 'помощь', 'задание', 'это', 'в', 'на', 'с', 'и', 'а', 'о', 'у', 'не', 'по', 'за', 'от', 'из', 'до', 'про', 'для', 'чтобы', 'где', 'когда', 'какой', 'какая', 'какое', 'какие', 'было', 'быть', 'есть', 'был', 'была', 'были', 'хочу', 'хотел', 'объясни', 'расскажи', 'подскажи', 'поможешь', 'покажи']);
    const words = String(text).toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
    if (!words.length) return [];
    const res = [];
    for (const sub of ['math', 'russian', 'social', 'informatics']) {
      for (const q of (window.OGE_DATA[sub] || [])) {
        const hay = (q.prompt + ' ' + (q.explanation || '') + ' ' + E.themeName(sub, q.theme)).toLowerCase();
        let score = 0;
        words.forEach(w => { if (hay.includes(w)) score++; });
        if (score) res.push({ q, sub, score });
      }
    }
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, 3);
  }

  function showStepButtons() {
    const d = document.createElement('div');
    d.className = 'ai-btns';
    const b1 = mkBtn('Дальше шаг →', stepNext);
    const b2 = mkBtn('Повторить шаг', () => { if (ctxQ) bubble('ai', '«' + t(steps[stepIdx]) + '»'); });
    const b3 = mkBtn('Понятно ✓', () => {
      inSteps = false;
      bubble('ai', 'Отлично! Теперь найди похожее задание в тренажёре и реши сам — так знаний будет больше. Если споткнёшься — возвращайся, разберём снова.');
    });
    d.appendChild(b1); d.appendChild(b2); d.appendChild(b3);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function mkBtn(label, fn) {
    const b = document.createElement('button');
    b.className = 'btn btn-mini';
    b.textContent = label;
    b.onclick = fn;
    return b;
  }

  function startSteps() {
    steps = stepsFor(ctxQ); stepIdx = 0; inSteps = true;
    bubble('ai', 'Разбираем задание по шагам.<br><b>Задание:</b> ' + t(ctxQ.prompt) + '<br><br><b>Шаг 1.</b> ' + t(steps[0]));
    showStepButtons();
  }

  function stepNext() {
    stepIdx++;
    if (stepIdx >= steps.length) {
      inSteps = false;
      bubble('ai', '🎉 Разобрали полностью. Ответ: <b>' + t(answerText(ctxQ)) + '</b>');
      return;
    }
    bubble('ai', '<b>Шаг ' + (stepIdx + 1) + '.</b> ' + t(steps[stepIdx]));
    showStepButtons();
  }

  function offlineReply(text) {
    const low = text.toLowerCase();
    if (ctxQ) {
      if (/(объясн|разбер|подроб|по шагам|как реш)/.test(low)) { startSteps(); return; }
      const okAns = (ctxQ.type === 'choice' || ctxQ.type === 'number') && E.check(ctxQ, text);
      if (okAns) {
        bubble('ai', '✅ Верно! Молодец. ' + (ctxQ.explanation ? t(ctxQ.explanation) : ''));
        return;
      }
    }
    const res = searchBank(text);
    if (res.length) {
      let html = '';
      res.forEach(r => {
        html += '📌 <b>' + t(E.themeName(r.sub, r.q.theme)) + '</b>: ' + t(r.q.prompt) + '<br>Ответ: <b>' + t(answerText(r.q)) + '</b><br><span style="opacity:.8">' + t(r.q.explanation) + '</span><br><br>';
      });
      bubble('ai', 'Нашёл в базе похожие задания:<br><br>' + html + 'Открой тренажёр по этой теме и реши сам, а я подскажу, если что.');
      return;
    }
    bubble('ai', 'Я в офлайн-режиме: знаю то, что есть в базе заданий. Попробуй сформулировать запрос темой — «неравенства», «функции», «Н/НН», «ударения», «системы счисления», «векторы»… — и я найду похожие задания с разбором.<br><br>Хочешь, чтобы я отвечал на любые вопросы как настоящий репетитор? Подключи свой API в <b>Настройках</b> (ключ хранится только в твоём браузере).');
  }

  async function sendOnline(text) {
    const c = cfg();
    onlineMsgs.push({ role: 'user', content: text });
    const body = {
      model: c.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ты — репетитор, готовящий ученика 9 класса к ОГЭ по предмету: ' + (ctxQ && ctxQ._sub ? SUBJ_NAME(ctxQ._sub) : 'математика, русский язык, обществознание, информатика (определяй по контексту)').trim() + '. Отвечай по-русски, кратко и понятно, объясняй по шагам. Если ученик приводит свой ответ — проверь его.' },
        ...onlineMsgs.slice(-10)
      ]
    };
    const r = await fetch(c.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const answer = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '(пустой ответ)';
    onlineMsgs.push({ role: 'assistant', content: answer });
    return answer;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    bubble('user', t(text));
    if (hasKey()) {
      try {
        bubble('ai', t(await sendOnline(text)));
        return;
      } catch (e) {
        bubble('ai', '⚠️ Не удалось связаться с API (' + (e.message || 'ошибка') + '). Проверь адрес/ключ в Настройках и подключение к интернету. Отвечаю офлайн:<br><br>');
      }
    }
    offlineReply(text);
  }

  function greet() {
    if (hasKey()) {
      bubble('ai', 'Привет! Я подключён к ИИ-модели — спрашивай что угодно про ОГЭ: темы, задачи, как решать, как готовиться. ' + (ctxQ ? 'Сейчас в контексте задание: <b>' + t(ctxQ.prompt) + '</b>' : ''));
    } else {
      bubble('ai', 'Привет! Я ИИ-репетитор. Сейчас в офлайн-режиме: умею пошагово разбирать задания из базы и искать похожие задачи.<br><br>' + (ctxQ ? 'Нажми «объясни» — разберу это задание по шагам. Или напиши свой ответ — проверю. ' : 'Открой задание в тренажёре и нажми «Спросить ИИ по заданию» — я привяжу разговор к нему. ') + 'Для свободного режима ответов подключи свой API в <b>Настройках</b>.');
    }
  }

  function init(container, contextQ) {
    log = container.querySelector('#ai-log');
    input = container.querySelector('#ai-input');
    if (contextQ) ctxQ = contextQ;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    container.querySelector('#ai-send').onclick = submit;
    log.innerHTML = '';
    greet();
  }

  function setContext(q) { ctxQ = q; }
  function clear() { onlineMsgs = []; steps = []; stepIdx = 0; inSteps = false; if (log) { log.innerHTML = ''; greet(); } }

  return { init, setContext, clear, hasKey };
})();
