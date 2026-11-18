/**
 * Інтерактив «Запит на свободу прийнято» — збір відповідей учнів у Google Таблицю.
 * Вставте цей код у Розширення → Apps Script таблиці та розгорніть як веб-застосунок
 * (Виконувати від імені: Я; Доступ: Усі). Докладно — у README.md репозиторію.
 *
 * Вправа 1: кожне твердження учень надсилає окремо — { q: 0/1/2, answer: 'true'|'fake' }.
 * Відповіді одного пристрою збираються в один рядок аркуша «Правда чи фейк».
 */

const SHEETS = {
  join:    { name: 'Учасники',       head: ['Час', 'Клас', 'ID пристрою'] },
  quiz:    { name: 'Правда чи фейк', head: ['Час', 'Клас', 'Твердження 1', 'Твердження 2', 'Твердження 3', 'Правильних', 'ID пристрою'] },
  word:    { name: 'Хмара слів',     head: ['Час', 'Клас', 'Слово', 'Приховано', 'ID пристрою'] },
  request: { name: 'Запит прийнято', head: ['Час', 'Клас', 'Текст', 'ID пристрою'] },
};
const CORRECT = ['fake', 'fake', 'fake'];   // правильні відповіді вправи 1 (як у config.js)
const BAD_ROOTS = ['хуй', 'хуя', 'хує', 'хуе', 'хуї', 'хуи', 'хуло', 'пізд', 'пизд', 'бляд', 'блят', 'бляха', 'їба', 'йоба', 'йобн', 'єба', 'еба', 'ёба', 'заєб', 'заеб', 'наєб', 'наеб', 'уєб', 'уеб', 'ебан', 'єбан', 'ебат', 'єбат', 'ебал', 'єбал', 'сучк', 'сучар', 'мудак', 'мудил', 'гандон', 'підар', 'пидар', 'підор', 'пидор', 'педик', 'шлюх', 'курв', 'гівн', 'говн', 'срак', 'сран', 'жоп', 'дебіл', 'дебил', 'чмо', 'нахуй', 'відсос', 'отсос', 'порн', 'секс', 'fuck', 'shit', 'bitch', 'dick', 'porn', 'sex'];

/** Запустіть один раз вручну (кнопка «Виконати»), щоб створити аркуші й надати дозволи. */
function setup() {
  Object.keys(SHEETS).forEach(sheet_);
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  const type = String(d.type || '');
  if (!SHEETS[type]) return out_({ ok: false, error: 'bad type' });
  const cls = clean_(d.cls, 30);
  const id = clean_(d.id, 64);
  if (!cls || !id) return out_({ ok: false, error: 'no class or id' });

  const now = new Date();
  if (type === 'quiz') return saveQuiz_(d, now, cls, id);

  let row;
  if (type === 'join') {
    row = [now, cls, id];
  } else if (type === 'word') {
    const w = normWord_(d.word);
    if (!w) return out_({ ok: false, error: 'empty word' });
    row = [now, cls, w, isBad_(w) ? 'так' : '', id];
  } else {
    row = [now, cls, 'Запит на свободу прийнято', id];
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, retry: true, error: 'busy' });
  try {
    const sh = sheet_(type);
    const r = findRow_(sh, type, id);
    if (r > 0) {
      if (type === 'join') sh.getRange(r, 1, 1, row.length).setValues([row]); // учень змінив клас
      CacheService.getScriptCache().remove('results');
      return out_({ ok: true, duplicate: type !== 'join' });
    }
    sh.appendRow(row);
    CacheService.getScriptCache().remove('results');
    return out_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Вправа 1. Нова сторінка надсилає одне твердження: { q: 0..2, answer: 'true'|'fake' }.
 * Стара сторінка надсилала всі три разом: { answers: [...] } — теж приймаємо.
 * Відповідь на твердження, яке вже записане, не перезаписується.
 */
function saveQuiz_(d, now, cls, id) {
  const n = CORRECT.length;
  const incoming = [];                              // 'true' | 'fake' | '' для кожного твердження
  for (let i = 0; i < n; i++) incoming.push('');
  if (d.q !== undefined && d.q !== null && d.q !== '') {
    const q = Number(d.q);
    if (!(q >= 0 && q < n) || Math.floor(q) !== q) return out_({ ok: false, error: 'bad q' });
    incoming[q] = d.answer === 'true' ? 'true' : 'fake';
  } else {
    for (let i = 0; i < n; i++) incoming[i] = (d.answers || [])[i] === 'true' ? 'true' : 'fake';
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, retry: true, error: 'busy' });
  try {
    const sh = sheet_('quiz');
    const r = findRow_(sh, 'quiz', id);
    const cells = r > 0 ? sh.getRange(r, 3, 1, n).getValues()[0].map((v) => String(v)) : incoming.map(() => '');
    let changed = false;
    incoming.forEach((a, i) => {
      if (a && !cells[i]) { cells[i] = a === 'true' ? 'Правда' : 'Фейк'; changed = true; }
    });
    if (!changed) return out_({ ok: true, duplicate: true });
    const right = cells.filter((v, i) => v && (v === 'Правда' ? 'true' : 'fake') === CORRECT[i]).length;
    if (r > 0) sh.getRange(r, 3, 1, n + 1).setValues([cells.concat([right])]);
    else sh.appendRow([now, cls].concat(cells).concat([right, id]));
    CacheService.getScriptCache().remove('results');
    return out_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('results');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

  const res = { ok: true, updated: new Date().toISOString(), join: [], quiz: [], word: [], request: [] };
  const ans = (v) => (v === 'Правда' ? 'true' : v === 'Фейк' ? 'fake' : '');   // порожня клітинка — ще не відповів
  rows_('join').forEach((r) => res.join.push([String(r[1])]));
  rows_('quiz').forEach((r) => res.quiz.push([String(r[1])].concat([2, 3, 4].map((k) => ans(r[k])))));
  rows_('word').forEach((r) => { if (String(r[3]).trim() === '') res.word.push([String(r[1]), String(r[2])]); });
  rows_('request').forEach((r) => res.request.push([String(r[1]), r[0] instanceof Date ? r[0].toISOString() : String(r[0])]));

  const s = JSON.stringify(res);
  try { cache.put('results', s, 3); } catch (err) { /* великий обсяг — без кешу */ }
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

// ---------- допоміжне ----------
function sheet_(type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = SHEETS[type];
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) {
    sh = ss.insertSheet(cfg.name);
    sh.appendRow(cfg.head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cfg.head.length).setFontWeight('bold').setBackground('#dce6f2');
  }
  return sh;
}
/** Номер рядка з цим ID пристрою або 0, якщо такого ще немає. */
function findRow_(sh, type, id) {
  const idCol = SHEETS[type].head.length;
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}
function rows_(type) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[type].name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, SHEETS[type].head.length).getValues();
}
function clean_(s, max) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, max); }
function normWord_(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[ʼ'`´‘]/g, '’')
    .replace(/[^a-zа-яіїєґё’\-]/gi, '')
    .replace(/^[-’]+|[-’]+$/g, '')
    .slice(0, 25);
}
function isBad_(w) {
  const map = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', i: 'і', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };
  const n = String(w || '').toLowerCase();
  const cyr = n.replace(/[a-z]/g, (ch) => map[ch] || ch);
  if (/^(бля|сук[аиуіо]?|сукою|лох[иау]?|даун[иа]?)$/.test(cyr)) return true;
  return BAD_ROOTS.some((r) => n.indexOf(r) >= 0 || cyr.indexOf(r) >= 0);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
