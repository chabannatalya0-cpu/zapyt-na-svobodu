/**
 * Інтерактив «Запит на свободу прийнято» — збір відповідей учнів у Google Таблицю.
 * Вставте цей код у Розширення → Apps Script таблиці та розгорніть як веб-застосунок
 * (Виконувати від імені: Я; Доступ: Усі). Докладно — у README.md репозиторію.
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

  let row;
  const now = new Date();
  if (type === 'join') {
    row = [now, cls, id];
  } else if (type === 'quiz') {
    const a = [0, 1, 2].map((i) => ((d.answers || [])[i] === 'true' ? 'true' : 'fake'));
    const right = a.filter((x, i) => x === CORRECT[i]).length;
    row = [now, cls].concat(a.map((x) => (x === 'true' ? 'Правда' : 'Фейк'))).concat([right, id]);
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
    const idCol = SHEETS[type].head.length;
    const last = sh.getLastRow();
    if (last > 1) {
      const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === id) {
          if (type === 'join') sh.getRange(i + 2, 1, 1, row.length).setValues([row]); // учень змінив клас
          CacheService.getScriptCache().remove('results');
          return out_({ ok: true, duplicate: type !== 'join' });
        }
      }
    }
    sh.appendRow(row);
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
  rows_('join').forEach((r) => res.join.push([String(r[1])]));
  rows_('quiz').forEach((r) => res.quiz.push([String(r[1])].concat([2, 3, 4].map((k) => (r[k] === 'Правда' ? 'true' : 'fake')))));
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
