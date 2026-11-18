// Сторінка учня: вибір класу і три вправи
(function () {
  const { CFG, DEMO, getJSON, setJSON, normWord, isBad, phraseOk, post } = window.ZNS;
  const $ = (id) => document.getElementById(id);
  const ST = getJSON('zns_state', {});           // { cls, quiz: [..], word: '...', request: true }
  const save = () => setJSON('zns_state', ST);

  if (DEMO) $('demo').classList.remove('hidden');

  // ---------- сповіщення ----------
  let toastTimer;
  function toast(text) {
    $('toast-text').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.innerHTML = '<span class="spin"></span> Надсилаємо…'; btn.disabled = true; }
    else { btn.textContent = label || btn.dataset.label; btn.disabled = false; }
  }
  function markDone(n) {
    const s = $('ex' + n + '-status');
    s.textContent = '✓ Прийнято'; s.className = 'tag done';
  }

  // ---------- клас ----------
  CFG.CLASSES.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cls-btn' + (c.length > 6 ? ' wide' : ''); b.textContent = c;
    b.onclick = () => chooseClass(c);
    $('classes').appendChild(b);
  });
  function chooseClass(c) {
    ST.cls = c; save();
    post({ type: 'join', cls: c }).catch(() => {});
    render();
    toast('Клас ' + c + ' — вітаємо!');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('change-cls').onclick = () => { $('step-class').classList.remove('hidden'); $('step-class').scrollIntoView({ behavior: 'smooth' }); };

  // ---------- вправа 1: кожне твердження надсилається окремо ----------
  const N = CFG.STATEMENTS.length;
  if (!Array.isArray(ST.quiz)) ST.quiz = null;
  const sent = (i) => !!(ST.quiz && ST.quiz[i]);
  const picks = CFG.STATEMENTS.map((s, i) => (sent(i) ? ST.quiz[i] : null)); // вибір, ще не надісланий
  $('ex1-send').classList.add('hidden');                                     // спільна кнопка більше не потрібна
  const ex1Sub = document.querySelector('#ex1 .sub');
  if (ex1Sub) ex1Sub.textContent = 'Познач, правда це чи фейк, і надішли відповідь під кожним твердженням окремо.';

  function renderStatements() {
    const box = $('stmts'); box.innerHTML = '';
    CFG.STATEMENTS.forEach((s, i) => {
      const done = sent(i);
      const d = document.createElement('div'); d.className = 'stmt';
      d.innerHTML = `<p><span class="num">${i + 1}.</span>${s.text}</p>
        <div class="stamps">
          <button type="button" class="stamp t" data-v="true">ПРАВДА</button>
          <button type="button" class="stamp f" data-v="fake">ФЕЙК</button>
        </div>`;
      let send = null;
      if (!done) {
        send = document.createElement('button');
        send.type = 'button'; send.className = 'primary'; send.style.marginTop = '12px';
        send.textContent = 'Надіслати відповідь';
        send.disabled = !picks[i];
        const err = document.createElement('p'); err.className = 'err';
        send.onclick = () => sendOne(i, send, err);
        d.appendChild(send); d.appendChild(err);
      }
      d.querySelectorAll('.stamp').forEach((b) => {
        if (picks[i] === b.dataset.v) b.classList.add('sel');
        b.disabled = done;
        b.onclick = () => {
          picks[i] = b.dataset.v;
          d.querySelectorAll('.stamp').forEach((x) => x.classList.toggle('sel', x === b));
          if (send) send.disabled = false;
        };
      });
      if (done) {
        const ok = ST.quiz[i] === s.answer;
        const v = document.createElement('div'); v.className = 'verdict ' + (ok ? 'ok' : 'no');
        v.innerHTML = `<b>${ok ? '✓ Правильно!' : '✗ Не зовсім.'} Це ${s.answer === 'fake' ? 'фейк' : 'правда'}.</b> ${s.explain}`;
        d.appendChild(v);
      }
      box.appendChild(d);
    });
    const n = CFG.STATEMENTS.filter((s, i) => sent(i)).length;
    if (n === N) {
      const right = CFG.STATEMENTS.filter((s, i) => ST.quiz[i] === s.answer).length;
      $('ex1-score').classList.remove('hidden');
      $('ex1-score').textContent = `Твій результат: ${right} з ${N}. Відповіді прийнято ✓`;
      markDone(1);
    } else if (n > 0) {
      const st = $('ex1-status');
      st.textContent = `Надіслано ${n} з ${N}`; st.className = 'tag';
    }
  }
  async function sendOne(i, btn, err) {
    if (!picks[i] || sent(i)) return;
    err.textContent = '';
    busy(btn, true);
    try {
      await post({ type: 'quiz', cls: ST.cls, q: i, answer: picks[i] });
      if (!ST.quiz) ST.quiz = CFG.STATEMENTS.map(() => null);
      ST.quiz[i] = picks[i]; save();
      renderStatements(); toast(`Відповідь на твердження ${i + 1} прийнято`);
    } catch (e) { busy(btn, false); err.textContent = 'Не вдалося надіслати. Перевір інтернет і спробуй ще раз.'; }
  }

  // ---------- вправа 2 ----------
  function renderWord() {
    if (!ST.word) return;
    $('ex2-form').classList.add('hidden');
    $('ex2-done').classList.remove('hidden');
    $('ex2-done-text').textContent = `Твоє слово «${ST.word}» вже летить у хмару ✓`;
    markDone(2);
  }
  $('ex2-send').onclick = async () => {
    const raw = $('word').value; const w = normWord(raw.split(/\s+/)[0]);
    $('ex2-err').textContent = '';
    if (!w || w.length < 2) { $('ex2-err').textContent = 'Напиши одне слово.'; return; }
    if (raw.trim().split(/\s+/).length > 1) { $('ex2-err').textContent = 'Лише одне слово, будь ласка.'; return; }
    if (isBad(w)) { $('ex2-err').textContent = 'Це слово не пройде модерацію. Спробуй інше.'; return; }
    const btn = $('ex2-send'); busy(btn, true);
    try {
      await post({ type: 'word', cls: ST.cls, word: w });
      ST.word = w; save(); renderWord(); toast('Слово прийнято');
    } catch (e) { busy(btn, false); $('ex2-err').textContent = 'Не вдалося надіслати. Спробуй ще раз.'; }
  };
  $('word').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ex2-send').click(); });

  // ---------- вправа 3 ----------
  function renderRequest(animate) {
    if (!ST.request) return;
    $('ex3-form').classList.add('hidden');
    $('ex3-done').classList.remove('hidden');
    markDone(3);
    const bar = $('ex3-bar'), pct = $('ex3-pct'), title = $('ex3-title');
    if (!animate) { bar.style.width = '100%'; pct.textContent = '100 %'; title.textContent = 'Запит на свободу прийнято'; return; }
    let p = 0; title.textContent = 'Запит обробляється…';
    requestAnimationFrame(() => { bar.style.width = '100%'; });
    const t = setInterval(() => {
      p = Math.min(100, p + 4); pct.textContent = p + ' %';
      if (p >= 100) { clearInterval(t); title.textContent = 'Запит на свободу прийнято'; }
    }, 60);
  }
  $('ex3-send').onclick = async () => {
    $('ex3-err').textContent = '';
    if (!phraseOk($('phrase').value)) { $('ex3-err').textContent = 'Напиши саме цю фразу: «Запит на свободу прийнято».'; return; }
    const btn = $('ex3-send'); busy(btn, true);
    try {
      await post({ type: 'request', cls: ST.cls });
      ST.request = true; save(); renderRequest(true);
    } catch (e) { busy(btn, false); $('ex3-err').textContent = 'Не вдалося надіслати. Спробуй ще раз.'; }
  };
  $('phrase').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ex3-send').click(); });

  // ---------- відображення ----------
  function render() {
    const has = !!ST.cls;
    $('step-class').classList.toggle('hidden', has);
    ['who', 'ex1', 'ex2', 'ex3'].forEach((id) => $(id).classList.toggle('hidden', !has));
    if (has) $('who-cls').textContent = ST.cls;
  }
  render(); renderStatements(); renderWord(); renderRequest(false);
})();
