# CLAUDE.md

このファイルは実装の進行に合わせて随時更新する（SPEC.md §6.6）。

## 概要

Windows 11 デスクトップに常駐する半透明フローティングパネル型の RSS/Atom リーダー。
Tauri v2 (Rust) + React/TypeScript/Vite。詳細仕様は `SPEC.md`、実装計画は
`.claude/plans/fluffy-toasting-crayon.md`（このセッションで承認されたもの）を参照。

## ビルド手順

```sh
npm install
npm run tauri dev      # 開発起動（Vite + cargo run を同時に実行）
npm run build           # tsc の型検査 + vite build（フロントのみ）
cargo build              # src-tauri/ で Rust 側のみビルド
cargo test                # src-tauri/ で Rust 単体テスト
cargo clippy -- -D warnings  # src-tauri/ で lint
npm run tauri build      # インストーラ (MSI/NSIS) 生成
```

## ディレクトリ構成

- `src/` — React フロントエンド
- `src-tauri/` — Rust バックエンド（Tauri）
- `src-tauri/capabilities/` — 権限（capabilities）定義。必要最小限のみ許可

## アーキテクチャ概要（進行に応じて追記）

- フィード取得・パース・永続化はすべて Rust 側で行う（WebView の CORS 制約回避、SPEC §2.2）
- HTMLサニタイズはフロント側で DOMPurify（Rust の ammonia は不使用。描画層と同じ言語で完結させるため）
- 状態管理は Zustand
- フレームレス窓: `decorations: false` + `transparent: true` + CSS `rounded-2xl overflow-hidden`。
  Windows 11 では Mica、失敗時は Acrylic、それも失敗したら不透明単色（`src-tauri/src/window/vibrancy.rs`）。
  どちらかの適用に成功した場合のみ `DWMWA_WINDOW_CORNER_PREFERENCE` で HWND 自体も丸める
  （フレームレス窓は自動では丸くならないため）。適用結果はコマンド `get_vibrancy_mode` でフロントに渡し、
  `App.tsx` がパネル背景の不透明度（mica/acrylic=半透明、none=不透明）を切り替える
- ウィンドウの閉じる/最小化ボタンは自作タイトルバー（`src/components/TitleBar.tsx`）から
  `@tauri-apps/api/window` の `getCurrentWindow()` を呼ぶ。ドラッグ移動は `data-tauri-drag-region` 属性のみで実現
- DB: `rusqlite::Connection` 1本を `Mutex` で包んで `app.manage`（`src-tauri/src/db/mod.rs`）。
  マイグレーションは `PRAGMA user_version` ベースで `db/migrations.rs` に追記していく方式
- フィード取得〜保存の流れ: `fetch::discovery::discover`（サイトURLなら`<link rel=alternate>`探索）→
  `parse::feed::parse_feed`（feed-rsで統一パース、重複排除キーは自前実装 = `parse::dedupe`）→
  `db::upsert_entries`（`ON CONFLICT(feed_id, guid) DO UPDATE`で本文更新しつつ既読/スター状態は保持）
- Tauriの capabilities/permissions は `#[tauri::command]` で自作したコマンド（feeds/entries/opml）には不要
  （ACLはTauri組み込みプラグインのコマンド用。自作コマンドは `invoke_handler` 登録のみで呼び出せる）
- 自作コマンドのエラーは `error::AppError`（thiserror）を文字列にシリアライズしてフロントに渡す。
  `refresh_feed` はエラー時もコマンド自体は失敗させず、`feeds.last_error` に格納して返す
  （SPEC §7: フィード横の警告アイコン表示に使うため、エラーを握りつぶさない）

## 依存関係の選定理由

- `tauri-plugin-tray` は Tauri v2 では存在せず、トレイ機能はコア (`tauri::tray`) に統合済みのため追加パッケージなしでコアAPIを使用
- デスクトップ貼り付け（最背面）モードは Tauri コアの `set_always_on_bottom` + `set_skip_taskbar` を使用。Windows には真の「壁紙レイヤー」概念がなく、Progman/WorkerW ハックは非公式かつ脆いため不採用（ベストエフォートのz-order最背面化に留める）
- ウィンドウ位置・サイズの保存/復元は `tauri-plugin-window-state`（マルチモニタ補正込みで実装済みのため自前実装しない）

## 既知の落とし穴

- フレームレス窓は Windows 11 でも自動的に角丸にならない（システム標準タイトルバー窓のみ自動）。
  CSS の `border-radius` だけでは Mica/Acrylic の描画（DWM がHWND全体に敷く）が四隅で角ばって見えるため、
  `DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND)` の明示呼び出しが必須
- CSP は `style-src` に `unsafe-inline` を含めていない。Phase 3 で `@tanstack/react-virtual` を組み込む際、
  同ライブラリは要素位置決めに inline `style` 属性を使うため、ブラウザに inline style attribute がブロックされないか
  要検証（ブロックされる場合は仮想リスト行の位置指定方法を見直すか、CSPのその部分だけ緩和して理由を明記する）
- `feed-rs` の既定 `id_generator` は `<guid>`/`<id>` が無い場合に自動でハッシュ値を補完してしまい、
  `Entry::id` が常に非空になる（＝spec通りの「guid→link→title+published」の段階的フォールバックを後段で
  再現できなくなる）。そのため `parse::feed::parse_feed` は `Builder::id_generator` を空文字列を返す関数で
  上書きし、guidが無いことを自前の `dedupe_key` が検出できるようにしている
- OPMLの `folder` はDBスキーマ上は単一文字列（階層なし）。ネストした `<outline>` フォルダがある入力は
  最も内側のフォルダ名だけを採用する（`opml::parse_opml` 参照）
- サムネイル抽出は `media:thumbnail` → 画像タイプの enclosure(`media:content`) → 本文内最初の `<img>` まで。
  `og:image`（追加リクエストが要る任意タイア）は未実装（設定画面ができるPhase 5以降でON/OFFトグルと合わせて追加）
- favicon（`feeds.icon_path`）はまだ未取得。列だけ用意してあり、値は常にNULL

## バージョン固定方針

各依存はセットアップ時点で `npm view <pkg> version` / `cargo search` で確認した最新安定版を
`package.json` / `Cargo.toml` に固定値（キャレット無し）で記載している。更新する際は同様に確認すること。
