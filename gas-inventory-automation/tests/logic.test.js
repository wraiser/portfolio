/**
 * Logic.gs（純粋関数）の単体テスト。
 * 実行: npm test（TZ=Asia/Tokyo node --test tests/）
 * Apps Script の API には依存しないため、Node.js だけで実行できる。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CONFIG } = require('../src/Config.gs');
const L = require('../src/Logic.gs');

const rules = (today) => ({
  today: today,
  idPattern: CONFIG.ID_PATTERN,
  status: CONFIG.STATUS,
  ranks: CONFIG.RANKS,
  categories: CONFIG.CATEGORIES,
});

/** 正しい入力の基本形 */
const baseRecord = () => ({
  管理番号: 'OS-00001',
  買取日: '2026/10/01',
  店舗: '梅田店',
  カテゴリ: '時計',
  商品名: '自動巻き腕時計',
  状態ランク: 'A',
  買取価格: 30000,
  販売予定価格: 45000,
  ステータス: '在庫',
  販売日: '',
  販売価格: '',
});

const TODAY = new Date(2026, 10, 5); // 2026-11-05

test('buildColumnIndex: 見出し名から列番号を引ける／不足があれば例外', () => {
  const idx = L.buildColumnIndex(['管理番号', ' 買取日 ', '店舗'], ['管理番号', '買取日']);
  assert.equal(idx['買取日'], 1);
  assert.throws(() => L.buildColumnIndex(['管理番号'], ['管理番号', '販売日']), /販売日/);
});

test('parseDate: 形式の違い・存在しない日付・時刻付き', () => {
  assert.equal(L.toDateKey(L.parseDate('2026/1/5')), '2026-01-05');
  assert.equal(L.toDateKey(L.parseDate('2026-11-05')), '2026-11-05');
  assert.equal(L.parseDate('2026/02/30'), null);
  assert.equal(L.parseDate('不明'), null);
  assert.equal(L.parseDate(12345), null);
  assert.equal(L.toDateKey(L.parseDate(new Date(2026, 10, 5, 23, 59))), '2026-11-05');
});

test('daysBetween: 月・年またぎ', () => {
  assert.equal(L.daysBetween(new Date(2026, 9, 31), new Date(2026, 10, 1)), 1);
  assert.equal(L.daysBetween(new Date(2025, 11, 31), new Date(2026, 0, 1)), 1);
  assert.equal(L.daysBetween(new Date(2026, 10, 5), new Date(2026, 10, 1)), -4);
});

test('parseAmount: カンマ・円記号・空欄', () => {
  assert.equal(L.parseAmount('¥12,000'), 12000);
  assert.equal(L.parseAmount('12,000円'), 12000);
  assert.equal(L.parseAmount(''), null);
  assert.ok(Number.isNaN(L.parseAmount('abc')));
});

test('calcStagnationDays / classifyStagnation: 在庫だけを対象に区分する', () => {
  const r = baseRecord();
  r['買取日'] = '2026/08/01';
  const days = L.calcStagnationDays(r, TODAY, CONFIG.STATUS);
  assert.equal(days, 96);
  assert.equal(L.classifyStagnation(days, CONFIG.STAGNATION_LEVELS).key, 'critical');
  assert.equal(L.classifyStagnation(60, CONFIG.STAGNATION_LEVELS).key, 'alert');
  assert.equal(L.classifyStagnation(59, CONFIG.STAGNATION_LEVELS).key, 'warning');
  assert.equal(L.classifyStagnation(29, CONFIG.STAGNATION_LEVELS), null);
  assert.equal(L.classifyStagnation(null, CONFIG.STAGNATION_LEVELS), null);

  r['ステータス'] = '販売済';
  assert.equal(L.calcStagnationDays(r, TODAY, CONFIG.STATUS), null);
});

test('validateRecord: 正しい入力はエラーなし', () => {
  assert.deepEqual(L.validateRecord(baseRecord(), rules(TODAY)), []);
});

test('validateRecord: 必須・形式・選択肢・未来日', () => {
  const r = baseRecord();
  r['管理番号'] = 'os-1';
  r['買取日'] = '2026/12/01';
  r['カテゴリ'] = '自転車';
  r['買取価格'] = -100;
  r['ステータス'] = '';
  const errors = L.validateRecord(r, rules(TODAY));
  assert.ok(errors.includes('管理番号の形式が不正（例: OS-00001）'));
  assert.ok(errors.includes('買取日が未来の日付'));
  assert.ok(errors.includes('カテゴリが選択肢にない'));
  assert.ok(errors.includes('買取価格は0以上の整数'));
  assert.ok(errors.includes('ステータスが未入力'));
});

test('validateRecord: 販売済の整合性', () => {
  const r = baseRecord();
  r['ステータス'] = '販売済';
  let errors = L.validateRecord(r, rules(TODAY));
  assert.ok(errors.includes('販売済なのに販売日が未入力'));
  assert.ok(errors.includes('販売済なのに販売価格が未入力'));

  r['販売日'] = '2026/09/01'; // 買取日より前
  r['販売価格'] = 40000;
  errors = L.validateRecord(r, rules(TODAY));
  assert.deepEqual(errors, ['販売日が買取日より前']);

  const s = baseRecord();
  s['販売価格'] = 40000; // 在庫なのに販売価格あり
  assert.ok(L.validateRecord(s, rules(TODAY)).includes('販売済以外で販売日・販売価格が入力されている'));
});

test('findDuplicateIds: 空欄は無視し、重複だけを返す', () => {
  const dup = L.findDuplicateIds(['OS-00001', 'OS-00002', ' OS-00001', '', '']);
  assert.deepEqual([...dup], ['OS-00001']);
});

test('aggregateDaily: 前日の買取・販売、在庫、滞留区分、要確認件数', () => {
  const rec = (over) => Object.assign(baseRecord(), over);
  const records = [
    rec({ 管理番号: 'OS-00001', 買取日: '2026/11/04', 買取価格: 10000 }), // 前日買取・在庫
    rec({ 管理番号: 'OS-00002', 買取日: '2026/10/01', 買取価格: 20000, ステータス: '販売済', 販売日: '2026/11/04', 販売価格: 26000 }),
    rec({ 管理番号: 'OS-00003', 買取日: '2026/07/01', 買取価格: 5000, ステータス: '出品中', カテゴリ: 'カメラ', 店舗: '難波店' }), // 127日
    rec({ 管理番号: 'OS-00004', 買取日: '2026/09/01', 買取価格: 7000 }), // 65日
    rec({ 管理番号: 'BAD', 買取日: '2026/11/04', 買取価格: 99999 }), // 検証エラー
  ];
  const s = L.aggregateDaily(records, {
    targetDate: new Date(2026, 10, 4),
    asOf: TODAY,
    rules: rules(TODAY),
    levels: CONFIG.STAGNATION_LEVELS,
  });
  assert.deepEqual(s.purchased, { count: 1, amount: 10000 });
  assert.deepEqual(s.sold, { count: 1, sales: 26000, cost: 20000, grossProfit: 6000 });
  assert.equal(s.inventory.count, 3);
  assert.equal(s.inventory.cost, 22000);
  assert.equal(s.stagnation.critical.count, 1);
  assert.equal(s.stagnation.alert.count, 1);
  assert.equal(s.stagnation.warning.count, 0);
  assert.equal(s.invalidCount, 1);
  assert.equal(s.byStore['難波店'].count, 1);
  assert.deepEqual(s.stagnantItems.map((i) => i.id), ['OS-00003', 'OS-00004']);

  const rows = L.summaryToRows(s);
  const width = rows[0].length;
  assert.ok(rows.every((r) => r.length === width), 'setValues 用に列数がそろっている');

  const msg = L.buildAlertMessage(s, 1, 'https://example.com/sheet');
  assert.match(msg, /OS-00003/);
  assert.doesNotMatch(msg, /OS-00004/, '件数上限を超えた分は載せない');
  assert.match(msg, /確認が必要な行が 1 件/);
});

test('planChunks / shouldYield: 再開位置からの分割と時間判定', () => {
  assert.deepEqual(L.planChunks(1200, 500, 0), [
    { offset: 0, count: 500 },
    { offset: 500, count: 500 },
    { offset: 1000, count: 200 },
  ]);
  assert.deepEqual(L.planChunks(1200, 500, 1000), [{ offset: 1000, count: 200 }]);
  assert.deepEqual(L.planChunks(0, 500, 0), []);
  assert.throws(() => L.planChunks(10, 0, 0));
  assert.equal(L.shouldYield(0, 269999, 270000), false);
  assert.equal(L.shouldYield(0, 270000, 270000), true);
});

test('backoffDelay / isRetryableStatus', () => {
  assert.deepEqual([0, 1, 2, 3, 5].map((a) => L.backoffDelay(a)), [1000, 2000, 4000, 8000, 16000]);
  assert.equal(L.isRetryableStatus(429), true);
  assert.equal(L.isRetryableStatus(503), true);
  assert.equal(L.isRetryableStatus(400), false);
});

test('selectSummarySheetsToDelete: 新しい順に残し、対象外の名前は触らない', () => {
  const names = ['買取台帳', '日次集計_20261101', '日次集計_20261103', '日次集計_20261102', '日次集計_メモ'];
  assert.deepEqual(L.selectSummarySheetsToDelete(names, '日次集計_', 2), ['日次集計_20261101']);
});

test('サンプルCSV: 全件読み込み、意図的な入力ミス2件だけが検出される', () => {
  const csv = fs.readFileSync(path.join(__dirname, '../sample-data/purchase_ledger_sample.csv'), 'utf8');
  const lines = csv.trim().split(/\r?\n/).map((l) => l.split(','));
  const idx = L.buildColumnIndex(lines[0], CONFIG.HEADERS);
  const records = lines.slice(1).map((row) => L.rowToRecord(row.map((v) => (/^\d+$/.test(v) ? Number(v) : v)), idx));
  assert.equal(records.length, 40);
  const invalid = records.filter((r) => L.validateRecord(r, rules(TODAY)).length > 0);
  assert.deepEqual(invalid.map((r) => r['管理番号']), ['OS-00039', 'os-40']);
  assert.equal(L.findDuplicateIds(records.map((r) => r['管理番号'])).size, 0);
});
