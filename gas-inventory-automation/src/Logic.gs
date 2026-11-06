/**
 * @fileoverview 業務ロジック（純粋関数）。
 * SpreadsheetApp などの Apps Script 固有 API を使わないため、Node.js で単体テストできる。
 * シートの読み書きは Main.gs 側が担当し、このファイルは「値を受け取り、結果を返す」処理だけを持つ。
 */

/** 1日のミリ秒 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 見出し行から「見出し名 → 列番号（0始まり）」の対応表を作る。
 * 必須の見出しが見つからない場合は、どの見出しが足りないかを含めて例外を投げる。
 * @param {Array<*>} headers 見出し行の値
 * @param {Array<string>} requiredNames 必須の見出し名
 * @return {Object<string, number>} 見出し名 → 列番号
 */
function buildColumnIndex(headers, requiredNames) {
  const index = {};
  headers.forEach((name, i) => {
    const key = String(name).trim();
    if (key && !(key in index)) index[key] = i;
  });
  const missing = (requiredNames || []).filter((name) => !(name in index));
  if (missing.length > 0) {
    throw new Error('見出しが見つかりません: ' + missing.join(', '));
  }
  return index;
}

/**
 * 1行分の配列を、見出し名をキーにしたオブジェクトに変換する。
 * @param {Array<*>} row 行の値
 * @param {Object<string, number>} colIndex buildColumnIndex の戻り値
 * @return {Object<string, *>} 見出し名 → 値
 */
function rowToRecord(row, colIndex) {
  const record = {};
  Object.keys(colIndex).forEach((name) => {
    record[name] = row[colIndex[name]];
  });
  return record;
}

/**
 * 空行かどうか（すべてのセルが空）を判定する。
 * @param {Array<*>} row 行の値
 * @return {boolean}
 */
function isBlankRow(row) {
  return row.every((v) => v === '' || v === null || v === undefined);
}

/**
 * セルの値を日付に変換する。Date、"2026/11/05"、"2026-11-05" を受け付ける。
 * 変換できない場合は null を返す。時刻は切り捨てる。
 * @param {*} value セルの値
 * @return {?Date}
 */
function parseDate(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  // 2026/02/30 のような存在しない日付を除外する
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

/**
 * 日付を "yyyy-MM-dd" 形式の文字列にする（ローカル時刻基準。Apps Script ではスクリプトのタイムゾーン）。
 * @param {Date} date
 * @return {string}
 */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * 2つの日付の差（日数）を返す。時刻とサマータイムの影響を受けないよう、年月日だけで計算する。
 * @param {Date} from 開始日
 * @param {Date} to 終了日
 * @return {number} to - from の日数
 */
function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * 金額セルの値を数値に変換する。"12,000" や "¥12,000" も受け付ける。
 * 空欄は null、数値にできない値は NaN を返す。
 * @param {*} value
 * @return {?number}
 */
function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[¥￥,\s円]/g, '');
  if (cleaned === '') return null;
  return Number(cleaned);
}

/**
 * 在庫として扱うステータスかどうか。
 * @param {string} status
 * @param {Object} statusDef CONFIG.STATUS
 * @return {boolean}
 */
function isInventoryStatus(status, statusDef) {
  return status === statusDef.IN_STOCK || status === statusDef.LISTED;
}

/**
 * 滞留日数を計算する。在庫・出品中の商品だけが対象で、それ以外（販売済・廃棄）や買取日不正は null。
 * @param {Object<string, *>} record rowToRecord の戻り値
 * @param {Date} today 基準日
 * @param {Object} statusDef CONFIG.STATUS
 * @return {?number}
 */
function calcStagnationDays(record, today, statusDef) {
  if (!isInventoryStatus(record['ステータス'], statusDef)) return null;
  const purchased = parseDate(record['買取日']);
  if (!purchased) return null;
  const days = daysBetween(purchased, today);
  return days >= 0 ? days : null;
}

/**
 * 滞留日数から区分を判定する。どの区分にも当たらなければ null。
 * @param {?number} days 滞留日数
 * @param {Array<{key:string, minDays:number, label:string, color:string}>} levels minDays の大きい順
 * @return {?{key:string, minDays:number, label:string, color:string}}
 */
function classifyStagnation(days, levels) {
  if (days === null || days === undefined) return null;
  for (let i = 0; i < levels.length; i++) {
    if (days >= levels[i].minDays) return levels[i];
  }
  return null;
}

/**
 * 1件の入力内容を検証し、エラーメッセージの配列を返す（問題がなければ空配列）。
 * @param {Object<string, *>} record rowToRecord の戻り値
 * @param {{today: Date, idPattern: string, status: Object, ranks: Array<string>, categories: Array<string>}} rules
 * @return {Array<string>}
 */
function validateRecord(record, rules) {
  const errors = [];
  const id = String(record['管理番号'] || '').trim();
  if (!id) {
    errors.push('管理番号が未入力');
  } else if (!new RegExp(rules.idPattern).test(id)) {
    errors.push('管理番号の形式が不正（例: OS-00001）');
  }

  const purchased = parseDate(record['買取日']);
  if (record['買取日'] === '' || record['買取日'] === null || record['買取日'] === undefined) {
    errors.push('買取日が未入力');
  } else if (!purchased) {
    errors.push('買取日が日付ではない');
  } else if (daysBetween(rules.today, purchased) > 0) {
    errors.push('買取日が未来の日付');
  }

  if (!String(record['店舗'] || '').trim()) errors.push('店舗が未入力');
  if (!String(record['商品名'] || '').trim()) errors.push('商品名が未入力');

  const category = record['カテゴリ'];
  if (!category) {
    errors.push('カテゴリが未入力');
  } else if (rules.categories.indexOf(category) === -1) {
    errors.push('カテゴリが選択肢にない');
  }

  const rank = record['状態ランク'];
  if (rank && rules.ranks.indexOf(rank) === -1) errors.push('状態ランクが選択肢にない');

  const price = parseAmount(record['買取価格']);
  if (price === null) {
    errors.push('買取価格が未入力');
  } else if (isNaN(price) || price < 0 || !Number.isInteger(price)) {
    errors.push('買取価格は0以上の整数');
  }

  const planned = parseAmount(record['販売予定価格']);
  if (planned !== null && (isNaN(planned) || planned < 0)) {
    errors.push('販売予定価格は0以上の数値');
  }

  const statusValues = Object.keys(rules.status).map((k) => rules.status[k]);
  const status = record['ステータス'];
  if (!status) {
    errors.push('ステータスが未入力');
  } else if (statusValues.indexOf(status) === -1) {
    errors.push('ステータスが選択肢にない');
  }

  const soldDateRaw = record['販売日'];
  const soldDate = parseDate(soldDateRaw);
  const soldPrice = parseAmount(record['販売価格']);
  const hasSoldDate = !(soldDateRaw === '' || soldDateRaw === null || soldDateRaw === undefined);

  if (status === rules.status.SOLD) {
    if (!hasSoldDate) errors.push('販売済なのに販売日が未入力');
    if (soldPrice === null) errors.push('販売済なのに販売価格が未入力');
  } else if (hasSoldDate || soldPrice !== null) {
    errors.push('販売済以外で販売日・販売価格が入力されている');
  }
  if (hasSoldDate && !soldDate) errors.push('販売日が日付ではない');
  if (soldDate && purchased && daysBetween(purchased, soldDate) < 0) {
    errors.push('販売日が買取日より前');
  }
  if (soldPrice !== null && (isNaN(soldPrice) || soldPrice < 0)) {
    errors.push('販売価格は0以上の数値');
  }
  return errors;
}

/**
 * 管理番号の重複を調べ、重複している管理番号の集合を返す。空欄は対象外。
 * @param {Array<*>} ids 管理番号の配列
 * @return {Set<string>}
 */
function findDuplicateIds(ids) {
  const seen = new Set();
  const dup = new Set();
  ids.forEach((raw) => {
    const id = String(raw || '').trim();
    if (!id) return;
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  });
  return dup;
}

/**
 * 日次集計を作る。
 * - 買取・販売の件数と金額は targetDate（通常は前日）の1日分
 * - 在庫件数・在庫金額・滞留区分は asOf（集計日）時点
 * 検証エラーのある行は集計から外し、件数だけを「要確認」として数える。
 * @param {Array<Object<string, *>>} records 台帳の全レコード
 * @param {{targetDate: Date, asOf: Date, rules: Object, levels: Array<Object>}} options
 * @return {Object} 集計結果
 */
function aggregateDaily(records, options) {
  const targetKey = toDateKey(options.targetDate);
  const statusDef = options.rules.status;
  const summary = {
    targetDate: targetKey,
    asOf: toDateKey(options.asOf),
    purchased: { count: 0, amount: 0 },
    sold: { count: 0, sales: 0, cost: 0, grossProfit: 0 },
    inventory: { count: 0, cost: 0, plannedSales: 0 },
    stagnation: {},
    byCategory: {},
    byStore: {},
    stagnantItems: [],
    invalidCount: 0,
  };
  options.levels.forEach((lv) => {
    summary.stagnation[lv.key] = { label: lv.label, count: 0, cost: 0 };
  });

  records.forEach((r) => {
    if (validateRecord(r, Object.assign({}, options.rules, { today: options.asOf })).length > 0) {
      summary.invalidCount++;
      return;
    }
    const cost = parseAmount(r['買取価格']) || 0;
    const purchased = parseDate(r['買取日']);

    if (toDateKey(purchased) === targetKey) {
      summary.purchased.count++;
      summary.purchased.amount += cost;
    }

    if (r['ステータス'] === statusDef.SOLD && toDateKey(parseDate(r['販売日'])) === targetKey) {
      const sales = parseAmount(r['販売価格']) || 0;
      summary.sold.count++;
      summary.sold.sales += sales;
      summary.sold.cost += cost;
      summary.sold.grossProfit += sales - cost;
    }

    if (isInventoryStatus(r['ステータス'], statusDef) && daysBetween(purchased, options.asOf) >= 0) {
      const planned = parseAmount(r['販売予定価格']) || 0;
      summary.inventory.count++;
      summary.inventory.cost += cost;
      summary.inventory.plannedSales += planned;

      const cat = r['カテゴリ'];
      if (!summary.byCategory[cat]) summary.byCategory[cat] = { count: 0, cost: 0 };
      summary.byCategory[cat].count++;
      summary.byCategory[cat].cost += cost;

      const store = String(r['店舗']).trim();
      if (!summary.byStore[store]) summary.byStore[store] = { count: 0, cost: 0 };
      summary.byStore[store].count++;
      summary.byStore[store].cost += cost;

      const days = daysBetween(purchased, options.asOf);
      const level = classifyStagnation(days, options.levels);
      if (level) {
        summary.stagnation[level.key].count++;
        summary.stagnation[level.key].cost += cost;
        summary.stagnantItems.push({
          id: String(r['管理番号']).trim(),
          name: String(r['商品名']).trim(),
          store: store,
          days: days,
          cost: cost,
          levelKey: level.key,
        });
      }
    }
  });

  // 滞留日数の長い順（同じ日数なら金額の大きい順）
  summary.stagnantItems.sort((a, b) => b.days - a.days || b.cost - a.cost);
  return summary;
}

/**
 * 集計結果をシートに書き込むための2次元配列にする。
 * 行ごとに列数が違うと setValues でエラーになるため、最大列数にそろえて返す。
 * @param {Object} summary aggregateDaily の戻り値
 * @return {Array<Array<*>>}
 */
function summaryToRows(summary) {
  const rows = [];
  rows.push(['日次集計', '対象日 ' + summary.targetDate, '在庫は ' + summary.asOf + ' 時点']);
  rows.push([]);
  rows.push(['■ 前日の動き', '件数', '金額']);
  rows.push(['買取', summary.purchased.count, summary.purchased.amount]);
  rows.push(['販売（売上）', summary.sold.count, summary.sold.sales]);
  rows.push(['販売（粗利）', '', summary.sold.grossProfit]);
  rows.push([]);
  rows.push(['■ 在庫', '件数', '在庫金額（買取価格）', '販売予定金額']);
  rows.push(['在庫・出品中 合計', summary.inventory.count, summary.inventory.cost, summary.inventory.plannedSales]);
  rows.push([]);
  rows.push(['■ 滞留在庫', '件数', '在庫金額']);
  Object.keys(summary.stagnation).forEach((key) => {
    const s = summary.stagnation[key];
    rows.push([s.label, s.count, s.cost]);
  });
  rows.push([]);
  rows.push(['■ カテゴリ別在庫', '件数', '在庫金額']);
  Object.keys(summary.byCategory).sort().forEach((cat) => {
    rows.push([cat, summary.byCategory[cat].count, summary.byCategory[cat].cost]);
  });
  rows.push([]);
  rows.push(['■ 店舗別在庫', '件数', '在庫金額']);
  Object.keys(summary.byStore).sort().forEach((store) => {
    rows.push([store, summary.byStore[store].count, summary.byStore[store].cost]);
  });
  rows.push([]);
  rows.push(['要確認（検証エラーで集計外）', summary.invalidCount, '']);

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    const filled = r.slice();
    while (filled.length < width) filled.push('');
    return filled;
  });
}

/**
 * 通知メッセージ（Slack・メール共通の本文）を作る。
 * @param {Object} summary aggregateDaily の戻り値
 * @param {number} maxItems 載せる滞留在庫の最大件数
 * @param {string=} sheetUrl スプレッドシートのURL（任意）
 * @return {string}
 */
function buildAlertMessage(summary, maxItems, sheetUrl) {
  const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
  const lines = [];
  lines.push('【在庫日次レポート】' + summary.targetDate);
  lines.push('買取 ' + summary.purchased.count + '件 ' + yen(summary.purchased.amount) +
    ' / 販売 ' + summary.sold.count + '件 ' + yen(summary.sold.sales) +
    '（粗利 ' + yen(summary.sold.grossProfit) + '）');
  lines.push('在庫 ' + summary.inventory.count + '件 ' + yen(summary.inventory.cost));
  const levelText = Object.keys(summary.stagnation)
    .map((k) => summary.stagnation[k].label + ' ' + summary.stagnation[k].count + '件')
    .join(' / ');
  lines.push('滞留: ' + levelText);
  if (summary.stagnantItems.length > 0) {
    lines.push('');
    lines.push('▼ 滞留日数の長い在庫（上位' + Math.min(maxItems, summary.stagnantItems.length) + '件）');
    summary.stagnantItems.slice(0, maxItems).forEach((it) => {
      lines.push('・' + it.id + ' ' + it.name + '（' + it.store + '）' + it.days + '日 ' + yen(it.cost));
    });
  }
  if (summary.invalidCount > 0) {
    lines.push('');
    lines.push('※ 入力内容の確認が必要な行が ' + summary.invalidCount + ' 件あります（集計対象外）');
  }
  if (sheetUrl) {
    lines.push('');
    lines.push(sheetUrl);
  }
  return lines.join('\n');
}

/**
 * データ行を一定行数ごとに区切る。startOffset 行目（0始まり）から処理を再開できる。
 * @param {number} totalRows データ行の総数
 * @param {number} chunkSize 1回に扱う行数
 * @param {number=} startOffset 再開位置
 * @return {Array<{offset:number, count:number}>}
 */
function planChunks(totalRows, chunkSize, startOffset) {
  if (chunkSize <= 0) throw new Error('chunkSize は1以上');
  const chunks = [];
  for (let offset = startOffset || 0; offset < totalRows; offset += chunkSize) {
    chunks.push({ offset: offset, count: Math.min(chunkSize, totalRows - offset) });
  }
  return chunks;
}

/**
 * 実行時間の上限に近づいたかどうか。
 * @param {number} startedAtMs 開始時刻（ミリ秒）
 * @param {number} nowMs 現在時刻（ミリ秒）
 * @param {number} maxRuntimeMs 上限（ミリ秒）
 * @return {boolean}
 */
function shouldYield(startedAtMs, nowMs, maxRuntimeMs) {
  return nowMs - startedAtMs >= maxRuntimeMs;
}

/**
 * 再試行の待ち時間（指数バックオフ）を返す。attempt は0始まり。
 * @param {number} attempt
 * @param {number=} baseMs
 * @param {number=} maxMs
 * @return {number}
 */
function backoffDelay(attempt, baseMs, maxMs) {
  const base = baseMs || 1000;
  const max = maxMs || 16000;
  return Math.min(base * Math.pow(2, attempt), max);
}

/**
 * HTTP ステータスコードから、再試行する価値があるかを判定する（429・5xx）。
 * @param {number} code
 * @return {boolean}
 */
function isRetryableStatus(code) {
  return code === 429 || (code >= 500 && code <= 599);
}

/**
 * 日次集計シートのうち、削除対象（新しい順に keepCount 件を残した残り）を返す。
 * 接頭辞に続く部分が yyyyMMdd 形式のシートだけを対象にする。
 * @param {Array<string>} sheetNames すべてのシート名
 * @param {string} prefix 接頭辞
 * @param {number} keepCount 残す件数
 * @return {Array<string>}
 */
function selectSummarySheetsToDelete(sheetNames, prefix, keepCount) {
  const pattern = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{8})$');
  const targets = sheetNames
    .filter((name) => pattern.test(name))
    .sort()
    .reverse();
  return targets.slice(keepCount);
}

// Node.js での単体テスト用。Apps Script 上では module が未定義のため実行されない。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildColumnIndex,
    rowToRecord,
    isBlankRow,
    parseDate,
    toDateKey,
    daysBetween,
    parseAmount,
    isInventoryStatus,
    calcStagnationDays,
    classifyStagnation,
    validateRecord,
    findDuplicateIds,
    aggregateDaily,
    summaryToRows,
    buildAlertMessage,
    planChunks,
    shouldYield,
    backoffDelay,
    isRetryableStatus,
    selectSummarySheetsToDelete,
  };
}
