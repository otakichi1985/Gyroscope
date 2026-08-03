# Claude Code 用プロンプト: Windows 11 デスクトップRSSウィジェット

以下をそのまま Claude Code に貼るか、リポジトリ直下に `SPEC.md` として置いて
「SPEC.md を読んで実装して」と指示する。

---

## 0. 役割とゴール

あなたは Windows デスクトップアプリの実装を担当するシニアエンジニアです。
**Windows 11 上で動く、複数のRSS/Atomフィードを購読・表示するデスクトップ常駐型ウィジェットアプリ**をゼロから実装してください。

「ウィジェット」とは Windows 11 標準のウィジェットボード（Widgets Board）に載せるものではなく、
**デスクトップ上に常時浮かべておける半透明・角丸のフローティングパネル**を指します。
Widgets Board 向けの MSIX + Adaptive Cards 実装は**やらないこと**。

## 1. 技術スタック（固定）

- **Tauri v2**（Rust バックエンド + Web フロントエンド）
- フロントエンド: **React + TypeScript + Vite**
- スタイル: **Tailwind CSS**（v4系。設定は最小限に）
- 状態管理: Zustand（軽量なので。他を使うなら理由を提示すること）
- フィード取得: Rust側で `reqwest`
- フィード解析: Rust側で `feed-rs`（RSS 2.0 / RDF / Atom / JSON Feed を統一的に扱う）
- 永続化: SQLite（`rusqlite` の `bundled` feature）
- HTMLサニタイズ: フロント側で `dompurify`（Rust側で `ammonia` を使う案でも可、その場合は理由を書く）

**着手前に必ず各クレート/パッケージの最新安定版をWeb検索または `cargo search` / `npm view` で確認し、
バージョンを固定した上で `Cargo.toml` / `package.json` に記載すること。**
学習データ内のバージョン記憶を信用しないこと。API が変わっている前提で公式ドキュメントを参照する。

## 2. 機能要件

### 2.1 フィード管理
- URL を入力してフィードを追加。**サイトのトップURLを入れた場合は `<link rel="alternate" type="application/rss+xml">` を辿って自動検出**する
- フィードの削除・並び替え・リネーム
- フォルダ／タグによるグルーピング（1フィードに複数タグ可）
- フィードごとの更新間隔の上書き設定（デフォルトはグローバル設定に従う）
- **OPML のインポート／エクスポート**（既存リーダーからの移行用。ここは必須）

### 2.2 取得・更新
- Rust 側で取得する（WebViewのCORS制約を回避するため。フロントから直接 fetch しないこと）
- `ETag` / `Last-Modified` による条件付きGET、304 を正しく処理して無駄なトラフィックを避ける
- gzip/brotli 対応、タイムアウト 15秒、失敗時は指数バックオフで最大3回リトライ
- 同時取得数を制限（デフォルト6並列）
- User-Agent を明示（例: `RssWidget/0.1 (+https://github.com/<user>/<repo>)`）
- バックグラウンドで定期更新（デフォルト30分）。手動更新ボタンも用意
- 記事の重複排除キーは `guid` → `link` → `title+published` のフォールバック順

### 2.3 表示
- 全フィード横断のタイムライン表示（新着順）／フィード単位表示の切り替え
- 表示モード3種: **カード（サムネイル大）／リスト（1行）／コンパクト（タイトルのみ）**
- サムネイル抽出優先順: `media:thumbnail` → `enclosure` → 本文HTML内の最初の `<img>` → og:image（任意、追加リクエストになるので設定でON/OFF）
- 既読／未読、スター付き、「すべて既読にする」
- タイトル・本文の全文検索（SQLite FTS5）
- 100件を超えるリストは**仮想スクロール**で描画（`@tanstack/react-virtual` など）
- 記事クリック時の挙動を設定で選択: 既定ブラウザで開く（`tauri-plugin-opener`）／アプリ内リーダーペインで開く
- アプリ内リーダーは**必ず DOMPurify でサニタイズ**してから描画。`<script>`, `on*` 属性, `iframe` は除去

### 2.4 ウィジェットらしい見た目・振る舞い
- フレームレスウィンドウ（`decorations: false`）＋ 角丸 ＋ 自作のドラッグ領域
- **Mica / Acrylic 背景**（Tauri v2 の `window-vibrancy` クレート、または Tauri の `windowEffects` 設定を使用。Windows 11 でのみ有効化し、失敗時は単色背景にフォールバック）
- ライト／ダークをOS設定に追従（手動固定も可能）
- 常に最前面（always on top）のトグル
- **デスクトップ貼り付けモード**: タスクバーに出さない（`skipTaskbar`）＋ 最背面に配置。実現方法は調査して選ぶこと
- 全体の不透明度スライダー（0.5〜1.0）
- ウィンドウ位置・サイズを終了時に保存し、次回復元。マルチモニタで画面外に出た場合は補正する
- システムトレイ常駐（`tauri-plugin-tray`）: 表示/非表示、更新、終了
- 新着通知（`tauri-plugin-notification`）。デフォルトOFF、フィードごとにON可

### 2.5 その他
- キーボードショートカット: `j`/`k` 記事移動、`o` 開く、`m` 既読切替、`r` 更新、`/` 検索、`Esc` 閉じる
- 日本語UIをデフォルトに、英語も切り替え可能な i18n 構成（辞書ファイル分離）
- 設定・DBの保存先は `%APPDATA%\<AppName>\`（Tauri の `app_data_dir` を使用。パスをハードコードしない）

## 3. やらないこと（Non-goals）

- クラウド同期、アカウント機能
- Windows 11 Widgets Board への統合
- モバイル / macOS / Linux 対応（コードが自然に移植可能ならそれでよいが、対応工数は割かない）
- 有料APIへの依存

## 4. データモデル（叩き台。改善案があれば提案してから変更すること）

```
feeds(id, url, site_url, title, custom_title, icon_path, folder, interval_min,
      etag, last_modified, last_fetched_at, last_error, created_at)
entries(id, feed_id, guid, title, link, author, summary, content_html,
        thumbnail_url, published_at, fetched_at, is_read, is_starred)
tags(id, name) / feed_tags(feed_id, tag_id)
settings(key, value)
```
- `entries` は `(feed_id, guid)` に UNIQUE 制約
- 古い既読記事の自動削除（既定: 30日以上前かつ未スター）
- マイグレーションの仕組みを最初から入れておく（`user_version` PRAGMA ベースで可）

## 5. セキュリティ要件

RSSの中身は**信用できない第三者の入力**として扱うこと。

- Tauri の CSP を明示設定し、`unsafe-inline` / `unsafe-eval` を使わない
- 記事HTMLは必ずサニタイズ。リンクは `target="_blank" rel="noopener noreferrer"`
- 「外部画像を読み込まない」設定（トラッキングピクセル対策）を用意し、その旨をUIに説明表示
- Tauri の capabilities/permissions は必要最小限のみ許可。`shell:allow-execute` は使わない
- ユーザー入力URLは `http`/`https` のみ許可（`file://`, `javascript:` を弾く）

## 6. 進め方

1. **まず実装計画を提示して、承認を得てからコードを書き始めること。**
   計画には: 選定した各ライブラリの最新バージョン、ディレクトリ構成、フェーズ分割、
   不確実性が高い箇所（Mica、最背面配置あたり）の検証方法を含める。
2. 以下のフェーズごとに区切り、**各フェーズ終わりに必ず `cargo build` と `npm run tauri dev` が通ることを確認**してから次へ進む。
   - Phase 1: プロジェクト雛形 + フレームレス窓 + Mica + 位置記憶
   - Phase 2: SQLite スキーマ + フィード追加/削除 + Rust側取得・パース
   - Phase 3: 記事一覧UI（3表示モード）+ 既読管理 + 外部ブラウザで開く
   - Phase 4: 自動更新 + トレイ + 通知 + OPML
   - Phase 5: 検索、リーダーペイン、i18n、設定画面、仕上げ
3. 各フェーズごとに Git コミットを分ける。コミットメッセージは Conventional Commits。
4. 仕様に迷いが出たら**勝手に決めずに質問する**。ただし些細な命名や内部実装は自分で決めてよい。
5. 依存を追加するときは、なぜ必要かを一行で説明すること。
6. `CLAUDE.md` を作り、ビルド手順・アーキテクチャ概要・既知の落とし穴を随時更新する。

## 7. 品質基準

- TypeScript は `strict: true`。`any` を使う場合はコメントで理由を書く
- Rust は `cargo clippy -- -D warnings` が通ること
- Rustのフィードパース・重複排除・サムネイル抽出には単体テストを書く（`cargo test`）
- ネットワークエラー、パース失敗、フィードが空、記事0件、初回起動の各状態でUIが壊れないこと
- **エラーはユーザーに見える形で出す**（フィード横に警告アイコン＋理由のツールチップ）。握りつぶさない
- 起動時間 2秒以内、フィード100件・記事1万件でもスクロールがカクつかないこと

## 8. 完了条件

- `npm run tauri build` で MSI/NSIS インストーラが生成できる
- README に: スクリーンショット、機能一覧、ビルド手順、設定ファイルの場所、既知の制限
- 実際に日本語のフィード（例: ITmedia、Publickey、はてなブックマークの人気エントリ）と
  英語のフィード（例: The Verge、Hacker News）を混在させて正常表示できることを確認する
