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
- 記事一覧（Phase 3）: `FilterBar`（フィード選択+表示モード切替+全既読+フィード管理ボタン）→
  `EntryList`（`@tanstack/react-virtual` で仮想スクロール、`entriesStore` の無限スクロール取得、
  `offset = entries.length` で次ページ取得）→ `EntryRow`（card/list/compactの3モードを1コンポーネントで
  出し分け）。フィード管理（`FeedManager`）は `uiStore` の `feedManagerOpen` で開閉するオーバーレイに格納し、
  オーバーレイを閉じるタイミングで `entriesStore.refresh()` を呼んで記事一覧を再同期する
  （フィード追加/削除がオーバーレイ内で起きるため）。既読/スターは楽観的ローカル更新
  （`feedsStore` の「操作後に毎回`refresh()`」規約とは意図的に異なる。行クリックのたびに
  無限スクロールで積み上げたページを`refresh()`で破棄するとスクロール位置が乱れるため）

## 依存関係の選定理由

- `tauri-plugin-tray` は Tauri v2 では存在せず、トレイ機能はコア (`tauri::tray`) に統合済みのため追加パッケージなしでコアAPIを使用
- デスクトップ貼り付け（最背面）モードは Tauri コアの `set_always_on_bottom` + `set_skip_taskbar` を使用。Windows には真の「壁紙レイヤー」概念がなく、Progman/WorkerW ハックは非公式かつ脆いため不採用（ベストエフォートのz-order最背面化に留める）
- ウィンドウ位置・サイズの保存/復元は `tauri-plugin-window-state`（マルチモニタ補正込みで実装済みのため自前実装しない）

## 既知の落とし穴

- フレームレス窓は Windows 11 でも自動的に角丸にならない（システム標準タイトルバー窓のみ自動）。
  CSS の `border-radius` だけでは Mica/Acrylic の描画（DWM がHWND全体に敷く）が四隅で角ばって見えるため、
  `DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND)` の明示呼び出しが必須
- CSP の `style-src 'self'`（`unsafe-inline` なし）は `@tanstack/react-virtual` の行位置決めをブロックしない
  ことを実機（`npm run tauri dev` + WebView2）で確認済み。React は `style` prop を CSSOM プロパティ代入
  （`el.style.transform = ...`）で適用しており、`setAttribute("style", ...)` や HTML内の `style=""` 属性
  とは扱いが異なるため、CSPの`style-src`制限の対象外（ブラウザ実装・CSP仕様ともに一貫した挙動）。よって
  変更不要
- Tauriのコマンド引数名は「トップレベルの引数名」と「構造体としてまとめて渡す引数の中身」で
  camelCase変換の扱いが違う。`#[tauri::command] fn f(id: i64, is_read: bool)` のように**個別の
  スカラー引数**として並んでいる場合、JS側は自動camelCase変換に従い `invoke("f", { id, isRead })`
  （snake_caseで渡すと `missing required key` エラーになる）。一方 `fn f(filter: EntriesFilter)` の
  ように**単一の構造体引数**として渡す場合、その中身（`feed_id`, `unread_only` 等）は
  `EntriesFilter` に `#[serde(rename_all = "camelCase")]` が無い限り、Rust側フィールド名そのまま
  （snake_case）で渡す必要がある（camelCaseで送るとエラーにならず黙って`None`になるだけなので気づきにくい）。
  `mark_entry_read`/`toggle_star`/`mark_all_read` は前者、`list_entries`の`filter`は後者
- 仮想リスト（`EntryList.tsx`）の行はカード/リスト/コンパクトいずれも `<div role="button" tabIndex={0}>`
  にしている（`<button>` にしない）。スター切替ボタンを内側に置くため、外側も`<button>`にすると
  `<button>`の入れ子という不正なHTMLになり、Reactのhydrationエラー・クリック挙動の不安定化を招く
  （実機テストで発見）
- CSP の `img-src` は `'self' data:` だけでは記事サムネイル（ほぼ全て `https://` の外部URL）が
  読み込めない。SPEC §2.3のサムネイル表示をデフォルトで機能させるため `https: http:` を追加済み
  （「外部画像を読み込まない」トグルはPhase 5の設定画面でのオプトアウトとして別途実装する）
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
