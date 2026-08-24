# 京介｜業務改善・Web Support ポートフォリオ

小規模な業務管理ツール、WordPress・Webサイトの修正保守、継続サポートを紹介する、**1ページ完結の静的ポートフォリオサイト**です。クラウドソーシングで納品したシフト管理アプリの制作事例、顧客・案件・期限を一元管理する自主制作MVPの操作デモ、既存業務を対象にした「7日間試作パック」、ROI簡易診断、FAQ、協業会社向けメニューを掲載しています。

お問い合わせボタンは、直接メール、ランサーズ、ココナラ、クラウドワークスへ接続しています。

## サイト概要

デザインは、Swiss International Styleと日本的ミニマリズムを組み合わせた「静謐なシステム設計」を採用しています。温かなオフホワイト、インクネイビー、正常稼働を表すティールを使い、課題の調査から正常化までを落ち着いた図解と明確な情報階層で表現しています。

| 項目 | 内容 |
|---|---|
| 構成 | プロフィール、納品実績、業務特化MVP、操作デモ、対応可能な業務、7日間試作パック、ROI簡易診断、FAQ、協業メニュー、お問い合わせ |
| 対応端末 | デスクトップ、タブレット、スマートフォン |
| 使用技術 | HTML5、CSS3、Vanilla JavaScript |
| 外部依存 | Google Fonts、画像CDN、一部ローカル画像 |
| アニメーション | Intersection Observerによる控えめなスクロール表示 |
| アクセシビリティ | セマンティックHTML、キーボードフォーカス、動きの低減設定に対応 |

## キャンペーン識別とプライバシー

`utm_source`、`utm_medium`、`utm_campaign`、`utm_content`を受け取ると、英数字・ピリオド・ハイフン・アンダースコアだけに制限し、同じタブの`sessionStorage`へ保存します。識別値は「メールで直接相談」の件名へ引き継ぎます。

第三者のアクセス解析、広告Cookie、外部Beaconは使用していません。CTAクリック時には`portfolio:conversion`というブラウザ内イベントだけを発行します。将来解析サービスを接続する場合は、利用サービス、送信項目、保持期間、オプトアウト、プライバシー表示を決めてから、このイベントの受信処理を別途追加してください。

## ファイル構成

GitHub Pagesで公開する際に必要な主要ファイルは次のとおりです。GitHub Pagesは、公開元の最上位にある`index.html`をエントリーファイルとして認識します。[1]

| ファイル | 役割 |
|---|---|
| `index.html` | 全セクションの本文、メタ情報、外部リンク |
| `style.css` | 配色、レイアウト、レスポンシブ表示、アニメーション |
| `script.js` | スクロール表示、固定ヘッダー、現在年、ROI、キャンペーン導線 |
| `business-tools.js` | ROI計算とキャンペーン値の無害化 |
| `assets/` | 公開ページで使用する画像 |
| `demos/`、`cases/` | 操作デモとケーススタディ |
| `package.json`、`tests/` | 構文検査と計算ロジックの自動テスト |
| `README.md` | 公開・編集・確認手順 |

このリポジトリでは、上記のファイルとフォルダをまとめて公開します。`script.js`はES Moduleとして`business-tools.js`を読み込むため、両方が必要です。

## 公開前の編集

### 依頼窓口のURLを確認する

`index.html`の問い合わせセクションには、直接メール、ランサーズ、ココナラ、クラウドワークスの本人窓口を設定しています。連絡先や公開URLを変更した場合は、4つのリンクを同時に更新してください。

```html
href="mailto:kyoduke98@gmail.com"
href="https://www.lancers.jp/profile/-K_H-"
href="https://coconala.com/services/2322056"
href="https://crowdworks.jp/public/employees/3921632"
```

### 文章や実績を更新する

プロフィール、実績、対応業務の文章はすべて`index.html`にあります。新しい実績を追加する場合は、既存の`<article class="work-card">`を複製し、案件名、概要、対応、成果、使用技術を変更してください。未確認の受注件数、評価、レビューなどは掲載せず、実際に確認できる内容だけを記載してください。

## GitHub Pagesで公開する手順

GitHub公式ドキュメントでは、リポジトリの**Settings → Pages**から公開元を設定し、特定のブランチとフォルダを指定して公開できます。[2] このサイトはビルド不要のため、`main`ブランチのルートをそのまま公開元にする方法が最も簡単です。

### 1. GitHubにリポジトリを作成する

GitHubへログインし、新しいリポジトリを作成します。リポジトリ名は`portfolio`など任意の名前で構いません。ユーザーサイトとして公開したい場合は、`GitHubユーザー名.github.io`という名前を使用できます。既存の公開環境では`wraiser/portfolio`の`main`ブランチを使用しています。

### 2. ファイルをリポジトリへ追加する

Web画面からアップロードする場合は、主要ファイルに加えて`business-tools.js`、`assets/`、`demos/`、`cases/`を同じ構成で追加します。

Gitを使用する場合は、ターミナルでこのディレクトリへ移動し、次のコマンドを実行します。`YOUR_USERNAME`と`YOUR_REPOSITORY`は実際の値へ置き換えてください。

```bash
cd portfolio
git init
git add index.html style.css script.js business-tools.js assets demos cases README.md
git commit -m "Add freelance portfolio site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

すでにGitリポジトリとして初期化されている場合は、`git init`や`git remote add origin`を重複して実行する必要はありません。

### 3. GitHub Pagesを有効にする

リポジトリの**Settings**を開き、左側の**Pages**を選択します。**Build and deployment**で、**Source**を`Deploy from a branch`に設定します。続いてブランチを`main`、フォルダを`/(root)`に設定し、**Save**を押します。この選択手順はGitHubの公式手順に沿っています。[2]

| 設定項目 | 選択値 |
|---|---|
| Source | `Deploy from a branch` |
| Branch | `main` |
| Folder | `/(root)` |

### 4. 公開サイトを確認する

デプロイ処理が完了すると、**Settings → Pages**に公開URLが表示されます。**Visit site**からサイトを開き、デスクトップとスマートフォンの両方で表示を確認してください。GitHub Pagesは公開元の最上位から`index.html`を読み込みます。[1]

通常のプロジェクトリポジトリであれば、URLは概ね次の形式です。

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

`YOUR_USERNAME.github.io`という名前のユーザーサイト用リポジトリでは、次の形式になります。

```text
https://YOUR_USERNAME.github.io/
```

## ローカルで確認する方法

`script.js`はES Moduleとして読み込まれるため、ファイルを直接ダブルクリックするのではなく、簡易HTTPサーバーを使用すると確実です。

```bash
cd portfolio
python3 -m http.server 8000
```

ブラウザで`http://localhost:8000/`を開いて確認します。終了する場合は、ターミナルで`Ctrl + C`を押してください。VS Codeを使用している場合は、Live Server拡張機能でも確認できます。

## 更新時の確認項目

| 確認箇所 | 確認内容 |
|---|---|
| 外部リンク | 直接メールと各クラウドソーシング窓口が正しい宛先へ移動するか |
| ROI | 0件・負数・削減率100%超でも表示が破綻しないか |
| キャンペーン | 許可文字だけが保存され、相談メール件名へ引き継がれるか |
| 実績 | 課題、対応、成果、使用技術が事実に基づいているか |
| スマートフォン | 見出しが不自然に切れず、ボタンを押しやすいか |
| 画像 | ヒーロー、実績2点、業務一覧の画像が表示されるか |
| キーボード操作 | `Tab`キーでリンクへ移動し、フォーカス位置が分かるか |
| GitHub Pages | リポジトリのルートに`index.html`が存在するか |

## カスタマイズの基本

配色は`style.css`冒頭のCSSカスタムプロパティで管理しています。ブランドカラーを変更する場合は、特に次の変数を調整します。

```css
:root {
  --paper: #f4f3ee;
  --ink: #121a22;
  --teal: #12b8a6;
}
```

Google Fontsは`index.html`の`<head>`内で読み込んでいます。現在は日本語本文に`Noto Sans JP`、英数字見出しに`Space Grotesk`、ラベルに`Space Mono`を使用しています。

## References

[1]: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site "Creating a GitHub Pages site - GitHub Docs"
[2]: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site "Configuring a publishing source for your GitHub Pages site - GitHub Docs"
