/**
 * Main.gs の動作確認（スモークテスト）。
 * SpreadsheetApp などを簡易的なモックに置き換え、シートの読み書き・バッチの中断と再開・通知の再試行を確認する。
 * 実際の Apps Script 環境の挙動（権限、実行時間、トリガーの発火）までは再現しない。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** 2次元配列で値と背景色を持つ簡易シート */
class FakeSheet {
  constructor(name) {
    this.name = name;
    this.values = [];
    this.bgs = [];
  }
  getName() { return this.name; }
  cell_(r, c) {
    while (this.values.length < r) { this.values.push([]); this.bgs.push([]); }
    return [r - 1, c - 1];
  }
  getLastRow() {
    for (let i = this.values.length - 1; i >= 0; i--) {
      if ((this.values[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() { return this.values.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return Math.max(this.values.length, 1000); }
  getRange(row, col, numRows, numCols) {
    const sheet = this;
    const nr = numRows || 1;
    const nc = numCols || 1;
    const range = {
      getRow: () => row,
      getLastRow: () => row + nr - 1,
      getSheet: () => sheet,
      getValues() {
        const out = [];
        for (let r = 0; r < nr; r++) {
          const line = [];
          for (let c = 0; c < nc; c++) {
            const v = (sheet.values[row - 1 + r] || [])[col - 1 + c];
            line.push(v === undefined ? '' : v);
          }
          out.push(line);
        }
        return out;
      },
      setValues(vals) {
        assert.equal(vals.length, nr, 'setValues の行数が範囲と一致');
        vals.forEach((line, r) => {
          assert.equal(line.length, nc, 'setValues の列数が範囲と一致');
          line.forEach((v, c) => {
            sheet.cell_(row + r, col + c);
            sheet.values[row - 1 + r][col - 1 + c] = v;
          });
        });
        return proxy;
      },
      setBackgrounds(colors) {
        assert.equal(colors.length, nr);
        colors.forEach((line, r) => {
          assert.equal(line.length, nc);
          line.forEach((v, c) => {
            sheet.cell_(row + r, col + c);
            sheet.bgs[row - 1 + r][col - 1 + c] = v;
          });
        });
        return proxy;
      },
    };
    // 書式系のメソッドはチェーンできれば十分
    const proxy = new Proxy(range, { get: (t, p) => (p in t ? t[p] : () => proxy) });
    return proxy;
  }
  appendRow(row) { this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]); }
  deleteRows(start, count) { this.values.splice(start - 1, count); this.bgs.splice(start - 1, count); }
  clear() { this.values = []; this.bgs = []; }
  setFrozenRows() {}
  autoResizeColumns() {}
}

function createContext(options) {
  const sheets = [];
  const props = {};
  const triggers = [];
  const posts = [];
  const mails = [];
  let fetchCodes = (options && options.fetchCodes) || [200];
  let clock = 0;

  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.push(s); return s; },
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    getSheets: () => sheets.slice(),
    getNumSheets: () => sheets.length,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/dummy',
    toast: () => {},
  };
  const chain = () => new Proxy({}, { get: () => () => chain() });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: chain, getUi: chain },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (handler) => {
        const b = new Proxy({}, {
          get: (_, p) => (p === 'create'
            ? () => { const t = { getHandlerFunction: () => handler }; triggers.push(t); return t; }
            : () => b),
        });
        return b;
      },
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        const code = fetchCodes.length > 1 ? fetchCodes.shift() : fetchCodes[0];
        posts.push({ url, body: JSON.parse(opt.payload), code });
        return { getResponseCode: () => code, getContentText: () => 'body' };
      },
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Utilities: { sleep() {}, formatDate: () => '2026/11/05 06:00' },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
    Date: class extends Date {
      static now() { return options && options.fastClock ? (clock += 3 * 60 * 1000) : Date.now(); }
    },
  };
  vm.createContext(ctx);
  ['Config.gs', 'Logic.gs', 'Main.gs'].forEach((f) => {
    // const の宣言はスクリプト間で共有されないため、var に置き換えて1つのグローバルに載せる
    const src = fs.readFileSync(path.join(__dirname, '../src', f), 'utf8').replace(/^const /gm, 'var ');
    vm.runInContext(src, ctx, { filename: f });
  });
  return { ctx, ss, props, triggers, posts, mails };
}

function loadSample(env) {
  env.ctx.setupSheets();
  const csv = fs.readFileSync(path.join(__dirname, '../sample-data/purchase_ledger_sample.csv'), 'utf8');
  const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(',').map((v) => (/^\d+$/.test(v) ? Number(v) : v)));
  const sheet = env.ss.getSheetByName('買取台帳');
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return sheet;
}

test('初期設定 → 全件検証: エラー行だけに検証結果が付く', () => {
  const env = createContext();
  const sheet = loadSample(env);
  const result = env.ctx.validateAll();
  assert.equal(result.total, 40);
  assert.equal(result.errorRows, 2);
  const col = 12; // 検証結果（0始まり）
  assert.equal(sheet.values[1][col], 'OK');
  assert.match(sheet.values[39][col], /買取価格が未入力/);
  assert.ok(env.ss.getSheetByName('エラーログ'), 'エラーログシートが作られる');
});

test('滞留日数の更新: 時間上限で中断し、続きのトリガーで最後まで処理する', () => {
  const env = createContext({ fastClock: true });
  const sheet = loadSample(env);
  // 1行ずつ処理し、2チャンク目で時間切れになるように設定を差し替える
  env.ctx.CONFIG = Object.assign({}, env.ctx.CONFIG, {
    BATCH: { CHUNK_SIZE: 10, MAX_RUNTIME_MS: 5 * 60 * 1000, CONTINUE_AFTER_MS: 60000 },
  });
  const first = env.ctx.updateStagnation();
  assert.equal(first.done, false);
  assert.equal(env.props.STAGNATION_CURSOR, '10');
  assert.equal(env.triggers.filter((t) => t.getHandlerFunction() === 'continueStagnationUpdate').length, 1);

  let guard = 0;
  while (env.props.STAGNATION_CURSOR !== undefined && guard++ < 10) env.ctx.continueStagnationUpdate();
  assert.equal(env.props.STAGNATION_CURSOR, undefined, '最後まで終わったら再開位置を消す');
  assert.equal(env.triggers.length, 0, '続きのトリガーも消す');
  const filled = sheet.values.slice(1, 41).filter((r) => r[11] !== '').length;
  assert.ok(filled > 0, '在庫行に滞留日数が入る');
});

test('日次ジョブ: 集計シート作成、Slack は429のあと再試行で成功、メールも送る', () => {
  const env = createContext({ fetchCodes: [429, 200] });
  loadSample(env);
  env.props.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/DUMMY';
  env.props.NOTIFY_EMAIL = 'dummy@example.com';
  env.ctx.runDailyJob();
  const summarySheets = env.ss.getSheets().filter((s) => s.name.startsWith('日次集計_'));
  assert.equal(summarySheets.length, 1);
  assert.equal(env.posts.length, 2);
  assert.match(env.posts[1].body.text, /在庫日次レポート/);
  assert.equal(env.mails.length, 1);
  const log = env.ss.getSheetByName('エラーログ');
  assert.equal(log.getLastRow(), 1, 'エラーは記録されない');
});

test('通知: Slack が400を返したらエラーログに残し、メールは送る', () => {
  const env = createContext({ fetchCodes: [400] });
  loadSample(env);
  env.props.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/DUMMY';
  env.props.NOTIFY_EMAIL = 'dummy@example.com';
  env.ctx.runDailyJob();
  assert.equal(env.posts.length, 1, '400は再試行しない');
  assert.equal(env.mails.length, 1);
  const log = env.ss.getSheetByName('エラーログ');
  assert.match(String(log.values[1][2]), /HTTP 400/);
});

test('onEdit: 編集した行だけを検証し、重複も検出する', () => {
  const env = createContext();
  const sheet = loadSample(env);
  // 41行目（os-40）の管理番号を、既存の OS-00001 と重複する値に直したケース
  sheet.values[40][0] = 'OS-00001';
  env.ctx.onEdit({ range: sheet.getRange(41, 1, 1, 1) });
  assert.match(sheet.values[40][12], /管理番号が重複/);
  assert.ok(sheet.values[40][13] instanceof env.ctx.Date, '更新日時が入る');
  assert.equal(sheet.values[1][12], '', '編集していない行は触らない');
});
