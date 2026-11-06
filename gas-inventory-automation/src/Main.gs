/**
 * @fileoverview シートの読み書き・トリガー・通知など、Apps Script の API を使う処理。
 * 計算や判定は Logic.gs の純粋関数に任せ、このファイルは「読む → Logic で処理 → まとめて書く」に徹する。
 *
 * パフォーマンス上の方針:
 * - セルを1つずつ読み書きせず、getValues / setValues / setBackgrounds で範囲ごとに処理する。
 * - 行数が多い処理は CONFIG.BATCH.CHUNK_SIZE 行ずつ進め、実行時間が上限に近づいたら続きを次回に回す。
 */

/** 滞留日数更新の続きを実行するトリガーの関数名 */
const CONTINUATION_HANDLER = 'continueStagnationUpdate';

/** 日次ジョブのトリガーの関数名 */
const DAILY_HANDLER = 'runDailyJob';

// ---------------------------------------------------------------------------
// メニュー
// ---------------------------------------------------------------------------

/**
 * スプレッドシートを開いたときにメニューを追加する（シンプルトリガー）。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('在庫自動化')
    .addItem('① 初期設定（シート作成）', 'setupSheets')
    .addItem('② 全件を検証', 'validateAll')
    .addItem('③ 滞留日数を更新', 'updateStagnation')
    .addItem('④ 前日分の日次集計を作成', 'createDailySummary')
    .addSeparator()
    .addItem('日次ジョブのトリガーを設定', 'setupTriggers')
    .addItem('トリガーをすべて削除', 'removeTriggers')
    .addItem('通知のテスト送信', 'sendTestNotification')
    .addToUi();
}

// ---------------------------------------------------------------------------
// 初期設定
// ---------------------------------------------------------------------------

/**
 * 買取台帳とエラーログのシートを作る。既にある場合は、足りない見出しだけを右端に追加する。
 * 既存のデータは消さない。
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledger = ss.getSheetByName(CONFIG.SHEETS.LEDGER) || ss.insertSheet(CONFIG.SHEETS.LEDGER);

  const lastCol = Math.max(ledger.getLastColumn(), 1);
  const current = ledger.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getValues()[0]
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
  const headers = current.length === 0
    ? CONFIG.HEADERS.slice()
    : current.concat(CONFIG.HEADERS.filter((h) => current.indexOf(h) === -1));
  ledger.getRange(CONFIG.HEADER_ROW, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1f3a5f')
    .setFontColor('#ffffff');
  ledger.setFrozenRows(CONFIG.HEADER_ROW);

  const colIndex = buildColumnIndex(headers, CONFIG.HEADERS);
  const dataRows = ledger.getMaxRows() - CONFIG.HEADER_ROW;
  const col = (name) => ledger.getRange(CONFIG.HEADER_ROW + 1, colIndex[name] + 1, dataRows, 1);

  // 選択肢の入力規則（一覧にない値は入力できない）
  const listRule = (values) => SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  col('ステータス').setDataValidation(listRule(Object.keys(CONFIG.STATUS).map((k) => CONFIG.STATUS[k])));
  col('カテゴリ').setDataValidation(listRule(CONFIG.CATEGORIES.slice()));
  col('状態ランク').setDataValidation(listRule(CONFIG.RANKS.slice()));

  // 日付・金額の表示形式
  ['買取日', '販売日'].forEach((name) => col(name).setNumberFormat('yyyy/mm/dd'));
  ['買取価格', '販売予定価格', '販売価格'].forEach((name) => col(name).setNumberFormat('#,##0'));
  col('更新日時').setNumberFormat('yyyy/mm/dd hh:mm');

  // スクリプトが書き込む列は色を変え、手入力しない列だと分かるようにする
  CONFIG.COMPUTED_HEADERS.forEach((name) => col(name).setBackground(CONFIG.COMPUTED_COLOR));

  getOrCreateErrorLogSheet_();
  notifyUser_('初期設定が完了しました');
}

// ---------------------------------------------------------------------------
// 入力チェック
// ---------------------------------------------------------------------------

/**
 * 編集された行だけを検証し、「検証結果」「更新日時」を書き込む（シンプルトリガー）。
 * 貼り付けで複数行が変わった場合も、1回の読み書きで処理する。
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEETS.LEDGER) return;

    const firstRow = Math.max(e.range.getRow(), CONFIG.HEADER_ROW + 1);
    const lastRow = e.range.getLastRow();
    if (lastRow < firstRow) return;

    const colIndex = getColumnIndex_(sheet);
    const numRows = lastRow - firstRow + 1;
    const lastCol = sheet.getLastColumn();
    const rows = sheet.getRange(firstRow, 1, numRows, lastCol).getValues();

    // 重複チェックのため、管理番号の列だけは全行を読む
    const ids = getColumnValues_(sheet, colIndex['管理番号']);
    const duplicates = findDuplicateIds(ids);
    const rules = buildRules_(todayDate_());
    const now = new Date();

    const results = [];
    const stamps = [];
    const colors = [];
    rows.forEach((row) => {
      if (isBlankRow(row)) {
        results.push(['']);
        stamps.push(['']);
        colors.push([CONFIG.COMPUTED_COLOR]);
        return;
      }
      const record = rowToRecord(row, colIndex);
      const errors = validateWithDuplicates_(record, rules, duplicates);
      results.push([errors.length ? errors.join(' / ') : 'OK']);
      stamps.push([now]);
      colors.push([errors.length ? CONFIG.ERROR_COLOR : CONFIG.COMPUTED_COLOR]);
    });

    const resultRange = sheet.getRange(firstRow, colIndex['検証結果'] + 1, numRows, 1);
    resultRange.setValues(results).setBackgrounds(colors);
    sheet.getRange(firstRow, colIndex['更新日時'] + 1, numRows, 1).setValues(stamps);
  } catch (err) {
    logError_('onEdit', err);
  }
}

/**
 * 台帳の全行を検証し、「検証結果」列を書き直す。
 * @return {{total: number, errorRows: number}} 処理件数とエラー行数
 */
function validateAll() {
  return withScriptLock_('validateAll', () => {
    const sheet = getLedgerSheet_();
    const colIndex = getColumnIndex_(sheet);
    const total = sheet.getLastRow() - CONFIG.HEADER_ROW;
    if (total <= 0) {
      notifyUser_('データ行がありません');
      return { total: 0, errorRows: 0 };
    }
    const values = sheet.getRange(CONFIG.HEADER_ROW + 1, 1, total, sheet.getLastColumn()).getValues();
    const duplicates = findDuplicateIds(values.map((row) => row[colIndex['管理番号']]));
    const rules = buildRules_(todayDate_());

    let errorRows = 0;
    const results = [];
    const colors = [];
    values.forEach((row) => {
      if (isBlankRow(row)) {
        results.push(['']);
        colors.push([CONFIG.COMPUTED_COLOR]);
        return;
      }
      const errors = validateWithDuplicates_(rowToRecord(row, colIndex), rules, duplicates);
      if (errors.length) errorRows++;
      results.push([errors.length ? errors.join(' / ') : 'OK']);
      colors.push([errors.length ? CONFIG.ERROR_COLOR : CONFIG.COMPUTED_COLOR]);
    });

    sheet.getRange(CONFIG.HEADER_ROW + 1, colIndex['検証結果'] + 1, total, 1)
      .setValues(results)
      .setBackgrounds(colors);
    notifyUser_('検証完了: ' + total + '行中 ' + errorRows + '行に要確認の項目があります');
    return { total: total, errorRows: errorRows };
  });
}

// ---------------------------------------------------------------------------
// 滞留日数（バッチ処理）
// ---------------------------------------------------------------------------

/**
 * 在庫・出品中の商品の滞留日数を計算し、区分に応じて行に色を付ける。
 * CONFIG.BATCH.CHUNK_SIZE 行ずつ処理し、実行時間が上限に近づいたら
 * 処理位置をスクリプトプロパティに保存して、続きを1分後のトリガーに任せる。
 * @return {{done: boolean, processed: number}}
 */
function updateStagnation() {
  return withScriptLock_('updateStagnation', () => {
    const startedAt = Date.now();
    const props = PropertiesService.getScriptProperties();
    const sheet = getLedgerSheet_();
    const colIndex = getColumnIndex_(sheet);
    const total = sheet.getLastRow() - CONFIG.HEADER_ROW;
    if (total <= 0) {
      finishStagnationUpdate_(props);
      return { done: true, processed: 0 };
    }

    let cursor = Number(props.getProperty(CONFIG.PROPS.STAGNATION_CURSOR) || 0);
    if (!(cursor >= 0 && cursor < total)) cursor = 0;

    const today = todayDate_();
    const lastCol = sheet.getLastColumn();
    const chunks = planChunks(total, CONFIG.BATCH.CHUNK_SIZE, cursor);
    let processed = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (shouldYield(startedAt, Date.now(), CONFIG.BATCH.MAX_RUNTIME_MS)) {
        props.setProperty(CONFIG.PROPS.STAGNATION_CURSOR, String(chunk.offset));
        scheduleContinuation_();
        console.log('滞留日数の更新を中断: ' + chunk.offset + '行目から再開します');
        return { done: false, processed: processed };
      }

      const startRow = CONFIG.HEADER_ROW + 1 + chunk.offset;
      const range = sheet.getRange(startRow, 1, chunk.count, lastCol);
      const values = range.getValues();
      const daysOut = [];
      const backgrounds = [];

      values.forEach((row) => {
        if (isBlankRow(row)) {
          daysOut.push(['']);
          backgrounds.push(buildRowBackgrounds_(lastCol, colIndex, null, false));
          return;
        }
        const record = rowToRecord(row, colIndex);
        const days = calcStagnationDays(record, today, CONFIG.STATUS);
        const level = classifyStagnation(days, CONFIG.STAGNATION_LEVELS);
        const hasError = String(record['検証結果'] || '') !== '' && record['検証結果'] !== 'OK';
        daysOut.push([days === null ? '' : days]);
        backgrounds.push(buildRowBackgrounds_(lastCol, colIndex, level, hasError));
      });

      range.setBackgrounds(backgrounds);
      sheet.getRange(startRow, colIndex['滞留日数'] + 1, chunk.count, 1).setValues(daysOut);
      processed += chunk.count;
    }

    finishStagnationUpdate_(props);
    return { done: true, processed: processed };
  });
}

/**
 * 時間主導トリガーから呼ばれる、滞留日数更新の続き。
 */
function continueStagnationUpdate() {
  try {
    updateStagnation();
  } catch (err) {
    logError_(CONTINUATION_HANDLER, err);
  }
}

// ---------------------------------------------------------------------------
// 日次集計・通知
// ---------------------------------------------------------------------------

/**
 * 日次集計シート（例: 日次集計_20261105）を作成する。同じ日のシートがあれば作り直す。
 * 古い集計シートは CONFIG.SUMMARY_KEEP_COUNT 件を残して削除する。
 * @param {Date=} targetDate 対象日（省略時は前日）
 * @return {Object} aggregateDaily の集計結果
 */
function createDailySummary(targetDate) {
  const today = todayDate_();
  const target = targetDate instanceof Date ? parseDate(targetDate) : addDays_(today, -1);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledger = getLedgerSheet_();
  const colIndex = getColumnIndex_(ledger);
  const total = ledger.getLastRow() - CONFIG.HEADER_ROW;
  const values = total > 0
    ? ledger.getRange(CONFIG.HEADER_ROW + 1, 1, total, ledger.getLastColumn()).getValues()
    : [];
  const records = values.filter((row) => !isBlankRow(row)).map((row) => rowToRecord(row, colIndex));

  const summary = aggregateDaily(records, {
    targetDate: target,
    asOf: today,
    rules: buildRules_(today),
    levels: CONFIG.STAGNATION_LEVELS,
  });

  const name = CONFIG.SUMMARY_SHEET_PREFIX + toDateKey(target).replace(/-/g, '');
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(name, ss.getNumSheets());
  }

  const rows = summaryToRows(summary);
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.getRange(2, 3, rows.length - 1, Math.max(rows[0].length - 2, 1)).setNumberFormat('#,##0');
  rows.forEach((row, i) => {
    if (String(row[0]).indexOf('■') === 0) {
      sheet.getRange(i + 1, 1, 1, row.length).setFontWeight('bold').setBackground('#eef3fb');
    }
  });
  sheet.autoResizeColumns(1, rows[0].length);

  selectSummarySheetsToDelete(ss.getSheets().map((s) => s.getName()),
    CONFIG.SUMMARY_SHEET_PREFIX, CONFIG.SUMMARY_KEEP_COUNT)
    .forEach((oldName) => ss.deleteSheet(ss.getSheetByName(oldName)));

  notifyUser_(name + ' を作成しました');
  return summary;
}

/**
 * 毎朝トリガーで実行するジョブ。滞留日数の更新 → 日次集計 → 通知 の順に行う。
 * 1つの処理が失敗しても、エラーログに残して次の処理へ進む。
 */
function runDailyJob() {
  try {
    updateStagnation();
  } catch (err) {
    logError_('runDailyJob/updateStagnation', err);
  }
  let summary = null;
  try {
    summary = createDailySummary();
  } catch (err) {
    logError_('runDailyJob/createDailySummary', err);
  }
  if (summary) {
    try {
      sendDailyNotification_(summary);
    } catch (err) {
      logError_('runDailyJob/sendDailyNotification', err);
    }
  }
}

/**
 * 通知先が設定されているか確かめるため、テストメッセージを送る。
 */
function sendTestNotification() {
  const text = '【テスト】在庫自動化の通知設定を確認しています（' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') + '）';
  const sent = deliver_('【テスト】在庫自動化', text);
  notifyUser_(sent.length ? '送信しました: ' + sent.join(', ') : '通知先が設定されていません（スクリプトプロパティを確認）');
}

/**
 * 日次集計の内容を Slack とメールに送る。
 * @param {Object} summary aggregateDaily の戻り値
 * @private
 */
function sendDailyNotification_(summary) {
  const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const text = buildAlertMessage(summary, CONFIG.NOTIFY_MAX_ITEMS, url);
  deliver_('在庫日次レポート ' + summary.targetDate, text);
}

/**
 * スクリプトプロパティに設定された宛先へ送る。未設定の宛先は飛ばす。
 * 片方の送信に失敗しても、もう片方は送る。
 * @param {string} subject メール件名
 * @param {string} text 本文
 * @return {Array<string>} 送信できた宛先の種類
 * @private
 */
function deliver_(subject, text) {
  const props = PropertiesService.getScriptProperties();
  const webhook = props.getProperty(CONFIG.PROPS.SLACK_WEBHOOK_URL);
  const email = props.getProperty(CONFIG.PROPS.NOTIFY_EMAIL);
  const sent = [];

  if (webhook) {
    try {
      postToSlack_(webhook, text);
      sent.push('Slack');
    } catch (err) {
      logError_('postToSlack', err);
    }
  }
  if (email) {
    try {
      MailApp.sendEmail({ to: email, subject: subject, body: text });
      sent.push('メール');
    } catch (err) {
      logError_('sendEmail', err);
    }
  }
  if (!webhook && !email) console.log('通知先が未設定のため送信をスキップしました');
  return sent;
}

/**
 * Slack の Incoming Webhook に送信する。429・5xx の場合は待ち時間を延ばしながら再試行する。
 * @param {string} webhookUrl
 * @param {string} text
 * @private
 */
function postToSlack_(webhookUrl, text) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true,
  };
  let lastMessage = '';
  for (let attempt = 0; attempt <= CONFIG.NOTIFY_RETRY; attempt++) {
    const res = UrlFetchApp.fetch(webhookUrl, options);
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return;
    lastMessage = 'HTTP ' + code + ': ' + res.getContentText().slice(0, 200);
    if (!isRetryableStatus(code) || attempt === CONFIG.NOTIFY_RETRY) break;
    Utilities.sleep(backoffDelay(attempt));
  }
  throw new Error('Slack への送信に失敗しました（' + lastMessage + '）');
}

// ---------------------------------------------------------------------------
// トリガー
// ---------------------------------------------------------------------------

/**
 * 日次ジョブのトリガーを設定する。同じ関数のトリガーは先に削除し、重複して動かないようにする。
 */
function setupTriggers() {
  deleteTriggersByHandler_(DAILY_HANDLER);
  ScriptApp.newTrigger(DAILY_HANDLER)
    .timeBased()
    .atHour(CONFIG.DAILY_TRIGGER_HOUR)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
  notifyUser_('毎日 ' + CONFIG.DAILY_TRIGGER_HOUR + '時台に日次ジョブを実行するよう設定しました');
}

/**
 * このプロジェクトが作ったトリガーをすべて削除する。
 */
function removeTriggers() {
  deleteTriggersByHandler_(DAILY_HANDLER);
  deleteTriggersByHandler_(CONTINUATION_HANDLER);
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROPS.STAGNATION_CURSOR);
  notifyUser_('トリガーを削除しました');
}

/**
 * 指定した関数名のトリガーを削除する。
 * @param {string} handler
 * @private
 */
function deleteTriggersByHandler_(handler) {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === handler)
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/**
 * 滞留日数更新の続きを、1回だけ実行するトリガーで予約する。
 * @private
 */
function scheduleContinuation_() {
  deleteTriggersByHandler_(CONTINUATION_HANDLER);
  ScriptApp.newTrigger(CONTINUATION_HANDLER)
    .timeBased()
    .after(CONFIG.BATCH.CONTINUE_AFTER_MS)
    .create();
}

/**
 * 滞留日数の更新が最後まで終わったときの後片付け。
 * @param {GoogleAppsScript.Properties.Properties} props
 * @private
 */
function finishStagnationUpdate_(props) {
  props.deleteProperty(CONFIG.PROPS.STAGNATION_CURSOR);
  deleteTriggersByHandler_(CONTINUATION_HANDLER);
}

// ---------------------------------------------------------------------------
// エラーログ
// ---------------------------------------------------------------------------

/**
 * エラーを「エラーログ」シートに記録する。ログの書き込み自体が失敗しても処理は止めない。
 * 行数が CONFIG.ERROR_LOG_MAX_ROWS を超えたら古い行から削除する。
 * @param {string} where 発生した処理名
 * @param {*} err エラー
 * @private
 */
function logError_(where, err) {
  const message = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? String(err.stack).slice(0, 2000) : '';
  console.error('[' + where + '] ' + message);
  try {
    const sheet = getOrCreateErrorLogSheet_();
    sheet.appendRow([new Date(), where, message, stack]);
    const excess = sheet.getLastRow() - 1 - CONFIG.ERROR_LOG_MAX_ROWS;
    if (excess > 0) sheet.deleteRows(2, excess);
  } catch (logErr) {
    console.error('エラーログの書き込みに失敗: ' + logErr);
  }
}

/**
 * エラーログシートを取得する。なければ作る。
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getOrCreateErrorLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.ERROR_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.ERROR_LOG);
    sheet.getRange(1, 1, 1, 4).setValues([['日時', '処理', 'メッセージ', '詳細']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// 共通の補助関数
// ---------------------------------------------------------------------------

/**
 * 同時実行を防ぐため、スクリプトロックを取ってから処理する。
 * ロックが取れない場合は何もせずに終わる（別の実行が動いているため）。
 * 処理中の例外はエラーログに残してから呼び出し元へ投げ直す。
 * @param {string} name 処理名（ログ用）
 * @param {function(): *} fn 処理
 * @return {*} fn の戻り値
 * @private
 */
function withScriptLock_(name, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) {
    console.warn(name + ': 別の処理が実行中のためスキップしました');
    return null;
  }
  try {
    return fn();
  } catch (err) {
    logError_(name, err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 買取台帳シートを取得する。見つからない場合は分かりやすいメッセージで例外を投げる。
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function getLedgerSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.LEDGER);
  if (!sheet) throw new Error('シート「' + CONFIG.SHEETS.LEDGER + '」がありません。メニューの「初期設定」を実行してください');
  return sheet;
}

/**
 * 見出し行から列の対応表を作る。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {Object<string, number>}
 * @private
 */
function getColumnIndex_(sheet) {
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  return buildColumnIndex(headers, CONFIG.HEADERS);
}

/**
 * 指定列のデータ行の値を1次元配列で返す。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIdx 列番号（0始まり）
 * @return {Array<*>}
 * @private
 */
function getColumnValues_(sheet, colIdx) {
  const total = sheet.getLastRow() - CONFIG.HEADER_ROW;
  if (total <= 0) return [];
  return sheet.getRange(CONFIG.HEADER_ROW + 1, colIdx + 1, total, 1).getValues().map((r) => r[0]);
}

/**
 * 検証ルールを組み立てる。
 * @param {Date} today
 * @return {Object}
 * @private
 */
function buildRules_(today) {
  return {
    today: today,
    idPattern: CONFIG.ID_PATTERN,
    status: CONFIG.STATUS,
    ranks: CONFIG.RANKS,
    categories: CONFIG.CATEGORIES,
  };
}

/**
 * 1件の検証に、管理番号の重複チェックを加える。
 * @param {Object<string, *>} record
 * @param {Object} rules
 * @param {Set<string>} duplicates
 * @return {Array<string>}
 * @private
 */
function validateWithDuplicates_(record, rules, duplicates) {
  const errors = validateRecord(record, rules);
  const id = String(record['管理番号'] || '').trim();
  if (id && duplicates.has(id)) errors.push('管理番号が重複');
  return errors;
}

/**
 * 1行分の背景色を作る。滞留区分の色を行全体に付け、
 * スクリプトが書き込む列と、検証エラーのある「検証結果」セルは別の色にする。
 * @param {number} width 列数
 * @param {Object<string, number>} colIndex
 * @param {?{color: string}} level 滞留区分
 * @param {boolean} hasError 検証エラーがあるか
 * @return {Array<?string>}
 * @private
 */
function buildRowBackgrounds_(width, colIndex, level, hasError) {
  const row = new Array(width).fill(level ? level.color : null);
  CONFIG.COMPUTED_HEADERS.forEach((name) => {
    row[colIndex[name]] = level ? level.color : CONFIG.COMPUTED_COLOR;
  });
  if (hasError) row[colIndex['検証結果']] = CONFIG.ERROR_COLOR;
  return row;
}

/**
 * 今日の日付（時刻なし、スクリプトのタイムゾーン基準）。
 * @return {Date}
 * @private
 */
function todayDate_() {
  return parseDate(new Date());
}

/**
 * 日付に日数を足す。
 * @param {Date} date
 * @param {number} days
 * @return {Date}
 * @private
 */
function addDays_(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * 画面右下に短いメッセージを出す。トリガー実行時など画面がない場合はログに出すだけにする。
 * @param {string} message
 * @private
 */
function notifyUser_(message) {
  console.log(message);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, '在庫自動化', 5);
  } catch (e) {
    // 画面がない実行環境では何もしない
  }
}
