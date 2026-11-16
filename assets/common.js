// Спільна логіка: зв'язок із Google Apps Script, демо-режим, нормалізація і фільтр слів
(function () {
  const CFG = window.APP_CONFIG;
  const PHRASE = 'запит на свободу прийнято';
  const DEMO = !CFG.API_URL || new URLSearchParams(location.search).has('demo');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- ідентифікатор пристрою (анонімно) ----------
  function deviceId() {
    let id = safeGet('zns_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      safeSet('zns_id', id);
    }
    return id;
  }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватний режим */ } }
  function getJSON(k, d) { try { return JSON.parse(safeGet(k)) ?? d; } catch (e) { return d; } }
  function setJSON(k, v) { safeSet(k, JSON.stringify(v)); }

  // ---------- нормалізація ----------
  const LAT2CYR = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', i: 'і', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };
  function normWord(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[ʼ'`´‘]/g, '’')
      .replace(/[^a-zа-яіїєґё’\-]/gi, '')
      .replace(/^[-’]+|[-’]+$/g, '')
      .slice(0, 25);
  }
  const BAD_ROOTS = ['хуй', 'хуя', 'хує', 'хуе', 'хуї', 'хуи', 'хуло', 'пізд', 'пизд', 'бляд', 'блят', 'бляха', 'їба', 'йоба', 'йобн', 'єба', 'еба', 'ёба', 'заєб', 'заеб', 'наєб', 'наеб', 'уєб', 'уеб', 'ебан', 'єбан', 'ебат', 'єбат', 'ебал', 'єбал', 'сучк', 'сучар', 'мудак', 'мудил', 'гандон', 'підар', 'пидар', 'підор', 'пидор', 'педик', 'шлюх', 'курв', 'гівн', 'говн', 'срак', 'сран', 'жоп', 'дебіл', 'дебил', 'чмо', 'нахуй', 'відсос', 'отсос', 'порн', 'секс', 'fuck', 'shit', 'bitch', 'dick', 'porn', 'sex'];
  function isBad(w) {
    const n = String(w || '').toLowerCase();
    const cyr = n.replace(/[a-z]/g, (ch) => LAT2CYR[ch] || ch);
    if (/^(бля|сук[аиуіо]?|сукою|лох[иау]?|даун[иа]?)$/.test(cyr)) return true;
    return BAD_ROOTS.some((r) => n.includes(r) || cyr.includes(r));
  }
  function normPhrase(s) {
    return String(s || '').toLowerCase().replace(/[^a-zа-яіїєґё ]/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  function levenshtein(a, b) {
    const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function phraseOk(s) { return levenshtein(normPhrase(s), PHRASE) <= 4; }

  // ---------- демо-режим ----------
  const DEMO_KEY = 'zns_demo_db';
  function demoPost(d) {
    const db = getJSON(DEMO_KEY, { join: [], quiz: [], word: [], request: [] });
    const now = new Date().toISOString();
    const list = db[d.type];
    const idx = list.findIndex((r) => r.id === d.id);
    if (d.type === 'join') { if (idx >= 0) list[idx].cls = d.cls; else list.push({ id: d.id, cls: d.cls }); }
    else if (idx >= 0) return { ok: true, duplicate: true };
    else if (d.type === 'quiz') list.push({ id: d.id, cls: d.cls, a: d.answers });
    else if (d.type === 'word') list.push({ id: d.id, cls: d.cls, w: normWord(d.word), bad: isBad(d.word) });
    else if (d.type === 'request') list.push({ id: d.id, cls: d.cls, t: now });
    setJSON(DEMO_KEY, db);
    return { ok: true, demo: true };
  }
  function demoSeed() {
    // стабільні «учасники» для перегляду результатів до підключення таблиці
    let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const words = ['воля', 'вибір', 'гідність', 'Україна', 'мир', 'дім', 'право', 'незалежність', 'єдність', 'відповідальність', 'повага', 'майбутнє', 'мрія', 'небо', 'родина', 'правда', 'голос', 'сміливість', 'життя', 'вільність'];
    const weights = [9, 8, 7, 7, 6, 5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1];
    const pool = []; words.forEach((w, i) => { for (let k = 0; k < weights[i]; k++) pool.push(w); });
    const res = { join: [], quiz: [], word: [], request: [] };
    const sizes = [18, 14, 20, 17, 19, 21, 22, 15, 19, 20, 6];
    CFG.CLASSES.forEach((cls, ci) => {
      const n = sizes[ci % sizes.length];
      for (let k = 0; k < n; k++) {
        res.join.push([cls]);
        if (rnd() < 0.85) res.quiz.push([cls, rnd() < 0.85 ? 'fake' : 'true', rnd() < 0.7 ? 'fake' : 'true', rnd() < 0.8 ? 'fake' : 'true']);
        if (rnd() < 0.8) res.word.push([cls, pool[Math.floor(rnd() * pool.length)]]);
        if (rnd() < 0.75) res.request.push([cls, new Date(Date.now() - Math.floor(rnd() * 600000)).toISOString()]);
      }
    });
    return res;
  }
  function demoGet() {
    const seed = demoSeed();
    const db = getJSON(DEMO_KEY, { join: [], quiz: [], word: [], request: [] });
    seed.join.push(...db.join.map((r) => [r.cls]));
    seed.quiz.push(...db.quiz.map((r) => [r.cls, ...r.a]));
    seed.word.push(...db.word.filter((r) => !r.bad).map((r) => [r.cls, r.w]));
    seed.request.push(...db.request.map((r) => [r.cls, r.t]));
    return { ok: true, demo: true, updated: new Date().toISOString(), ...seed };
  }

  // ---------- мережа ----------
  async function post(data) {
    const body = { ...data, id: deviceId() };
    if (DEMO) { await sleep(400); return demoPost(body); }
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body) });
        let j = { ok: true };
        try { j = await r.json(); } catch (e) { /* відповідь без JSON — вважаємо надісланим */ }
        if (j.ok !== false) return j;
        if (!j.retry) throw new Error(j.error || 'Помилка сервера');
        lastErr = new Error(j.error);
      } catch (e) { lastErr = e; }
      await sleep(900 * (i + 1) + Math.random() * 900);
    }
    throw lastErr || new Error('Немає зв’язку');
  }
  async function results() {
    if (DEMO) return demoGet();
    const r = await fetch(CFG.API_URL + (CFG.API_URL.includes('?') ? '&' : '?') + 'action=results&t=' + Date.now());
    return r.json();
  }

  window.ZNS = { CFG, DEMO, PHRASE, deviceId, getJSON, setJSON, normWord, isBad, phraseOk, post, results };
})();
