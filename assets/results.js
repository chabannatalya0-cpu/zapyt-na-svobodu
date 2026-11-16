// Сторінка результатів: три вкладки, автооновлення
(function () {
  const { CFG, DEMO, normWord, isBad, getJSON, setJSON, results } = window.ZNS;
  const $ = (id) => document.getElementById(id);
  const PALETTE = ['#16224a', '#e0261b', '#0057b7', '#f28c28', '#2b3a6b', '#c98a00', '#1f8a4c'];
  const PROPER = { 'україна': 'Україна', 'європа': 'Європа', 'київ': 'Київ', 'майдан': 'Майдан', 'зсу': 'ЗСУ', 'українці': 'Українці' };
  let DATA = null, TAB = '1', FILTER = '', REVEAL = false, MOD = false, FINAL = false;
  let hidden = new Set(getJSON('zns_hidden', []));
  let lastCloudSig = '', lastWallIds = new Set();

  if (DEMO) $('demo').classList.remove('hidden');

  // ---------- шапка ----------
  CFG.CLASSES.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('filter').appendChild(o); });
  $('filter').onchange = (e) => { FILTER = e.target.value; lastCloudSig = ''; render(); };

  const studentUrl = new URL('./', location.href).href.replace(/results\.html.*$/, '');
  $('join-url').textContent = studentUrl.replace(/^https?:\/\//, '');
  try {
    const qr = qrcode(0, 'M'); qr.addData(studentUrl); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) { $('qr').classList.add('hidden'); }
  $('btn-qr').onclick = () => {
    const j = $('join'); j.classList.toggle('hidden');
    $('btn-qr').classList.toggle('active', !j.classList.contains('hidden'));
  };
  $('btn-fs').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
  };

  // ---------- вкладки ----------
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      TAB = t.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      ['1', '2', '3'].forEach((n) => $('tab' + n).classList.toggle('hidden', n !== TAB));
      lastCloudSig = ''; render();
    };
  });
  $('btn-reveal').onclick = () => { REVEAL = !REVEAL; $('btn-reveal').textContent = REVEAL ? 'Сховати правильні відповіді' : 'Показати правильні відповіді'; render(); };
  $('btn-mod').onclick = () => {
    MOD = !MOD; $('btn-mod').classList.toggle('active', MOD);
    $('btn-mod').textContent = MOD ? 'Модерація: клацніть на слово' : 'Модерація: вимк.';
    $('cloud').classList.toggle('mod', MOD);
  };
  $('btn-final').onclick = () => { FINAL = !FINAL; $('btn-final').classList.toggle('active', FINAL); $('btn-final').textContent = FINAL ? 'Фінал: увімкнено' : 'Фінал: показати 100 %'; render(); };
  $('btn-unhide').onclick = () => { hidden = new Set(); setJSON('zns_hidden', []); lastCloudSig = ''; render(); };

  // ---------- дані ----------
  const byClass = (rows) => (FILTER ? rows.filter((r) => r[0] === FILTER) : rows);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); };

  async function tick() {
    try {
      const d = await results();
      if (!d || d.ok === false) throw new Error(d && d.error);
      DATA = d;
      $('dot').className = 'dot on';
      $('upd').textContent = (DEMO ? 'демо · ' : 'оновлено ') + new Date().toLocaleTimeString('uk-UA');
      render();
    } catch (e) {
      $('dot').className = 'dot err';
      $('upd').textContent = 'немає зв’язку, повторюю…';
    }
  }

  function render() {
    if (!DATA) return;
    $('n-join').textContent = byClass(DATA.join).length;
    if (TAB === '1') renderQuiz();
    if (TAB === '2') renderCloud();
    if (TAB === '3') renderAccepted();
  }

  // ---------- 1. Правда чи фейк ----------
  function renderQuiz() {
    const rows = byClass(DATA.quiz);
    const grid = $('q-grid'); grid.innerHTML = '';
    CFG.STATEMENTS.forEach((s, i) => {
      const t = rows.filter((r) => r[i + 1] === 'true').length;
      const f = rows.filter((r) => r[i + 1] === 'fake').length;
      const n = t + f, pt = pct(t, n), pf = n ? 100 - pt : 0;
      const right = s.answer === 'true' ? t : f;
      const row = document.createElement('div'); row.className = 'q-row';
      row.innerHTML = `
        <p class="qt"><span class="num">${i + 1}.</span>${s.text}</p>
        <div class="split">${n ? `
          <div class="t" style="flex-basis:${pt}%">ПРАВДА ${pt}%</div>
          <div class="f" style="flex-basis:${pf}%">ФЕЙК ${pf}%</div>` : '<div style="flex-basis:100%;color:var(--muted)">Чекаємо на відповіді…</div>'}
        </div>
        <div class="q-meta">
          <span>Відповідей: ${n} · правда — ${t}, фейк — ${f}</span>
          <span class="answer-badge ${REVEAL ? '' : 'hide-ans'}" title="Натисніть, щоб показати">Правильна відповідь: ${s.answer === 'fake' ? 'ФЕЙК' : 'ПРАВДА'} · ${pct(right, n)}% учнів відповіли правильно</span>
        </div>`;
      row.querySelector('.answer-badge').onclick = () => { if (!REVEAL) $('btn-reveal').click(); };
      grid.appendChild(row);
    });
    // підсумок
    const allRight = rows.filter((r) => CFG.STATEMENTS.every((s, i) => r[i + 1] === s.answer)).length;
    const perClass = CFG.CLASSES.map((c) => {
      const rr = DATA.quiz.filter((r) => r[0] === c);
      const ok = rr.reduce((a, r) => a + CFG.STATEMENTS.filter((s, i) => r[i + 1] === s.answer).length, 0);
      return { c, n: rr.length, p: rr.length ? ok / (rr.length * CFG.STATEMENTS.length) : -1 };
    }).filter((x) => x.n >= 3).sort((a, b) => b.p - a.p);
    const best = perClass[0];
    $('q-sum').innerHTML = `
      <div class="sum-card"><div class="v">${rows.length}</div><div class="k">учнів відповіли</div></div>
      <div class="sum-card"><div class="v">${pct(allRight, rows.length)}%</div><div class="k">відповіли правильно на всі ${CFG.STATEMENTS.length} твердження</div></div>
      <div class="sum-card"><div class="v">${best && REVEAL ? best.c : '—'}</div><div class="k">${best && REVEAL ? 'найточніший клас (' + Math.round(best.p * 100) + '% правильних)' : 'найточніший клас — після показу відповідей'}</div></div>`;
  }

  // ---------- 2. Хмара слів ----------
  function renderCloud() {
    const counts = new Map();
    byClass(DATA.word).forEach((r) => {
      const w = normWord(r[1]);
      if (!w || isBad(w) || hidden.has(w)) return;
      counts.set(w, (counts.get(w) || 0) + 1);
    });
    const items = [...counts.entries()].map(([w, c]) => ({ w, c })).sort((a, b) => b.c - a.c || a.w.localeCompare(b.w, 'uk'));
    const total = items.reduce((a, x) => a + x.c, 0);
    $('cloud-n').textContent = `Слів надіслано: ${total} · різних: ${items.length}`;
    $('cloud-top').textContent = items.length ? 'Найчастіше: ' + items.slice(0, 3).map((x) => `${PROPER[x.w] || x.w} (${x.c})`).join(', ') : '';
    $('btn-unhide').classList.toggle('hidden', hidden.size === 0);
    $('btn-unhide').textContent = `Повернути приховані (${hidden.size})`;
    const el = $('cloud');
    const sig = JSON.stringify(items) + el.clientWidth + 'x' + el.clientHeight;
    if (sig === lastCloudSig) return;
    lastCloudSig = sig;
    document.fonts.ready.then(() => layoutCloud(el, items.slice(0, 90)));
  }
  const measure = document.createElement('canvas').getContext('2d');
  function layoutCloud(el, items) {
    el.innerHTML = '';
    if (!items.length) { el.innerHTML = '<div class="empty">Чекаємо на перші слова…<br>Свобода — це…</div>'; return; }
    const W = el.clientWidth, H = el.clientHeight;
    const max = items[0].c, min = items[items.length - 1].c;
    const maxF = Math.max(40, Math.min(132, H / 3.6, W / 7)), minF = Math.max(18, maxF / 5);
    const placed = [];
    items.forEach((it, i) => {
      const label = PROPER[it.w] || it.w;
      let f = min === max ? maxF * 0.62 : minF + (maxF - minF) * Math.sqrt((it.c - min) / (max - min));
      for (let tries = 0; tries < 4; tries++) {
        measure.font = `800 ${f}px "Roboto Condensed", sans-serif`;
        const w = measure.measureText(label).width + f * 0.3, h = f * 1.08;
        const pos = findSpot(W, H, w, h, placed);
        if (pos) {
          placed.push({ x: pos.x, y: pos.y, w, h });
          const s = document.createElement('span');
          s.textContent = label; s.title = `${label}: ${it.c}`;
          s.style.cssText = `left:${pos.x + f * 0.15}px;top:${pos.y}px;font-size:${f}px;color:${PALETTE[i % PALETTE.length]}`;
          s.onclick = () => { if (!MOD) return; hidden.add(it.w); setJSON('zns_hidden', [...hidden]); lastCloudSig = ''; render(); };
          el.appendChild(s);
          return;
        }
        f *= 0.8; // не вмістилося — зменшуємо
      }
    });
  }
  function findSpot(W, H, w, h, placed) {
    const cx = W / 2, cy = H / 2, rx = W / H > 1 ? W / H : 1;
    const maxR = Math.hypot(W, H) / 2;
    for (let t = 0, r = 0; r < maxR; t += 0.09) {
      r = 3.2 * t;
      const x = cx + r * Math.cos(t) * rx * 0.9 - w / 2, y = cy + r * Math.sin(t) * 0.9 - h / 2;
      if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) continue;
      let hit = false;
      for (const p of placed) { if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) { hit = true; break; } }
      if (!hit) return { x, y };
    }
    return null;
  }
  window.addEventListener('resize', () => { lastCloudSig = ''; if (TAB === '2') renderCloud(); });

  // ---------- 3. Запит прийнято ----------
  function renderAccepted() {
    const req = byClass(DATA.request), joins = byClass(DATA.join);
    const n = req.length, base = Math.max(joins.length, n), p = FINAL ? 100 : pct(n, base);
    $('acc-n').innerHTML = `${n}<small>${FILTER ? 'запитів від ' + FILTER : 'запитів на свободу прийнято'}${base ? ' · з ' + base + ' учасників' : ''}</small>`;
    $('acc-bar').style.width = p + '%';
    $('acc-pct').textContent = p + ' %';
    $('acc-title').textContent = (p >= 100 && n > 0) || FINAL ? 'Запит на свободу прийнято' : 'Запит обробляється…';

    const classes = [...new Set([...CFG.CLASSES, ...DATA.request.map((r) => r[0])])];
    const rows = classes.map((c) => ({ c, n: DATA.request.filter((r) => r[0] === c).length, j: DATA.join.filter((r) => r[0] === c).length }))
      .filter((x) => x.n || x.j);
    const top = Math.max(1, ...rows.map((x) => x.n));
    $('cls-bars').innerHTML = rows.length ? rows.map((x) => `
      <div class="cls-bar ${x.n === top && x.n > 0 ? 'lead' : ''}">
        <span>${x.c}</span>
        <span class="track"><i style="width:${pct(x.n, top)}%"></i></span>
        <span class="v">${x.n}${x.j ? ' / ' + Math.max(x.j, x.n) : ''}</span>
      </div>`).join('') : '<p class="hint">Поки що немає запитів.</p>';

    const latest = req.slice().sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 48);
    const ids = new Set(latest.map((r) => r[0] + r[1]));
    $('wall').innerHTML = latest.map((r) => `<span class="chip" style="${lastWallIds.has(r[0] + r[1]) ? 'animation:none' : ''}">✓ ${r[0]} <span style="color:var(--muted);font-weight:600">${fmtTime(r[1])}</span></span>`).join('');
    lastWallIds = ids;
  }

  // пряме посилання на вкладку: results.html?tab=2
  const startTab = new URLSearchParams(location.search).get('tab');
  if (['1', '2', '3'].includes(startTab)) document.querySelector(`.tab[data-tab="${startTab}"]`).click();

  tick();
  setInterval(tick, Math.max(3000, CFG.REFRESH_MS || 5000));
})();
