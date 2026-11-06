/**
 * @fileoverview 設定値をまとめたファイル。
 * シート名・列名・しきい値などの変更は、原則としてこのファイルだけで完結するようにしている。
 */

/**
 * アプリ全体の設定。
 * 列は「列番号」ではなく「見出し名」で参照するため、列の並び替えや追加をしても処理が壊れにくい。
 * @const
 */
const CONFIG = Object.freeze({
  /** シート名 */
  SHEETS: Object.freeze({
    LEDGER: '買取台帳',
    ERROR_LOG: 'エラーログ',
  }),

  /** 日次集計シートの名前の接頭辞（例: 日次集計_20261105） */
  SUMMARY_SHEET_PREFIX: '日次集計_',

  /** 日次集計シートを何日分残すか（古いものから削除） */
  SUMMARY_KEEP_COUNT: 14,

  /** 見出し行の行番号 */
  HEADER_ROW: 1,

  /** 買取台帳の見出し（この順でシートを作成する） */
  HEADERS: Object.freeze([
    '管理番号',
    '買取日',
    '店舗',
    'カテゴリ',
    '商品名',
    '状態ランク',
    '買取価格',
    '販売予定価格',
    'ステータス',
    '販売日',
    '販売価格',
    '滞留日数',
    '検証結果',
    '更新日時',
  ]),

  /** スクリプトが値を書き込む列（入力列と区別するため背景色を変える） */
  COMPUTED_HEADERS: Object.freeze(['滞留日数', '検証結果', '更新日時']),

  /** ステータスの選択肢 */
  STATUS: Object.freeze({
    IN_STOCK: '在庫',
    LISTED: '出品中',
    SOLD: '販売済',
    DISPOSED: '廃棄',
  }),

  /** 状態ランクの選択肢 */
  RANKS: Object.freeze(['S', 'A', 'B', 'C', 'D']),

  /** カテゴリの選択肢 */
  CATEGORIES: Object.freeze([
    'ブランドバッグ',
    '時計',
    '貴金属',
    'カメラ',
    '家電',
    'ゲーム',
    '衣類',
    'その他',
  ]),

  /** 管理番号の形式（例: OS-00001。英大文字2桁＋ハイフン＋数字5桁） */
  ID_PATTERN: '^[A-Z]{2}-\\d{5}$',

  /**
   * 滞留日数の区分。minDays の大きい順に並べる。
   * 在庫・出品中の商品だけが対象。
   */
  STAGNATION_LEVELS: Object.freeze([
    Object.freeze({ key: 'critical', minDays: 90, label: '90日以上', color: '#f4c7c3' }),
    Object.freeze({ key: 'alert', minDays: 60, label: '60〜89日', color: '#fce8b2' }),
    Object.freeze({ key: 'warning', minDays: 30, label: '30〜59日', color: '#fff8d6' }),
  ]),

  /** 検証エラーがあるセルの背景色 */
  ERROR_COLOR: '#f9d0d0',

  /** スクリプトが書き込む列の背景色 */
  COMPUTED_COLOR: '#eef3fb',

  /** バッチ処理の設定（Apps Script の実行時間上限6分を考慮） */
  BATCH: Object.freeze({
    /** 1回の読み書きで扱う行数 */
    CHUNK_SIZE: 500,
    /** この時間を超えたら処理を中断し、続きを次回実行に回す（ミリ秒） */
    MAX_RUNTIME_MS: 4.5 * 60 * 1000,
    /** 続きを実行するまでの待ち時間（ミリ秒） */
    CONTINUE_AFTER_MS: 60 * 1000,
  }),

  /** 日次ジョブを実行する時刻（時） */
  DAILY_TRIGGER_HOUR: 6,

  /** エラーログに残す最大行数（超えた分は古い順に削除） */
  ERROR_LOG_MAX_ROWS: 1000,

  /** 通知に載せる滞留在庫の最大件数 */
  NOTIFY_MAX_ITEMS: 10,

  /** Slack 送信の再試行回数 */
  NOTIFY_RETRY: 3,

  /** スクリプトプロパティのキー（URL・宛先はコードに書かない） */
  PROPS: Object.freeze({
    SLACK_WEBHOOK_URL: 'SLACK_WEBHOOK_URL',
    NOTIFY_EMAIL: 'NOTIFY_EMAIL',
    STAGNATION_CURSOR: 'STAGNATION_CURSOR',
  }),
});

// Node.js での単体テスト用。Apps Script 上では module が未定義のため実行されない。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG };
}
