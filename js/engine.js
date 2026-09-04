// Движок: проверка ответов, перемешивание, графики (canvas без библиотек)
window.Engine = (function () {
  function norm(v) { return String(v).trim().replace(/\s+/g, '').replace(',', '.'); }

  function check(q, val) {
    if (q.type === 'choice') return Number(val) === Number(q.answer);
    if (q.type === 'number') {
      if (Array.isArray(q.answer)) {
        const parts = String(val).split(/[;,\s]+/).map(norm).filter(Boolean);
        if (parts.length !== q.answer.length) return false;
        const set = new Set(parts);
        return q.answer.every(a => set.has(norm(a)));
      }
      const a = norm(val), b = norm(q.answer);
      if (a === b) return true;
      const na = parseFloat(a), nb = parseFloat(b);
      return !isNaN(na) && !isNaN(nb) && Math.abs(na - nb) < 1e-6;
    }
    if (q.type === 'text') {
      if (q.accept) {
        const clean = s => String(s).toLowerCase().replace(/[\s.,;:!?"'`\-()]/g, '');
        const v = clean(val);
        return q.accept.some(a => clean(a) === v);
      }
      return true; // развёрнутый ответ — самооценка
    }
    return false;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function themeName(sub, theme) {
    const t = (window.THEMES[sub] || []).find(t => t.id === theme);
    return t ? t.name : theme;
  }

  /* ---------- графики ---------- */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

  function prep(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 320, h = cv.clientHeight || 150;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function lineChart(cv, labels, values) {
    if (!cv) return;
    const { ctx, w, h } = prep(cv);
    const padL = 26, padB = 20, padT = 10, padR = 10;
    const max = Math.max(1, ...values);
    const X = i => padL + (w - padL - padR) * (labels.length <= 1 ? 0.5 : i / (labels.length - 1));
    const Y = v => padT + (h - padT - padB) * (1 - v / max);
    const muted = cssVar('--muted'), line = cssVar('--line'), accent = cssVar('--accent');
    ctx.font = '10px sans-serif';
    for (let g = 0; g <= 3; g++) {
      const y = padT + (h - padT - padB) * g / 3;
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText(String(Math.round(max - max * g / 3)), 4, y + 3);
    }
    // область под линией
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
    ctx.lineTo(X(values.length - 1), h - padB);
    ctx.lineTo(X(0), h - padB);
    ctx.closePath();
    ctx.fillStyle = accent + '26'; ctx.fill();
    // линия
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    // точки и подписи
    const step = Math.max(1, Math.ceil(labels.length / 8));
    values.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(v), 2.5, 0, 7); ctx.fillStyle = accent; ctx.fill();
      if (labels[i] && (i % step === 0 || i === labels.length - 1)) {
        ctx.fillStyle = muted;
        ctx.fillText(labels[i], Math.max(2, Math.min(X(i) - 12, w - 36)), h - 6);
      }
    });
  }

  function bars(cv, items) {
    if (!cv) return;
    const { ctx, w, h } = prep(cv);
    if (!items.length) return;
    const max = Math.max(1, ...items.map(it => it.value));
    const bw = (w - 30) / items.length;
    ctx.font = '10px sans-serif';
    items.forEach((it, i) => {
      const bh = Math.max(3, (h - 36) * (it.value / max));
      const x = 26 + i * bw, y = h - 24 - bh;
      ctx.fillStyle = it.color || cssVar('--accent');
      roundRect(ctx, x + 2, y, Math.max(4, bw - 6), bh, 4); ctx.fill();
      ctx.fillStyle = cssVar('--muted');
      const lbl = it.label.length > 7 ? it.label.slice(0, 6) + '…' : it.label;
      ctx.fillText(lbl, x + 2, h - 10);
      if (it.value) {
        ctx.fillStyle = cssVar('--text');
        ctx.fillText(String(it.value), x + 2, Math.max(8, y - 4));
      }
    });
  }

  return { check, shuffle, themeName, lineChart, bars };
})();
