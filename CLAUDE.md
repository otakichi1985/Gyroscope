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

## 依存関係の選定理由

- `tauri-plugin-tray` は Tauri v2 では存在せず、トレイ機能はコア (`tauri::tray`) に統合済みのため追加パッケージなしでコアAPIを使用
- デスクトップ貼り付け（最背面）モードは Tauri コアの `set_always_on_bottom` + `set_skip_taskbar` を使用。Windows には真の「壁紙レイヤー」概念がなく、Progman/WorkerW ハックは非公式かつ脆いため不採用（ベストエフォートのz-order最背面化に留める）
- ウィンドウ位置・サイズの保存/復元は `tauri-plugin-window-state`（マルチモニタ補正込みで実装済みのため自前実装しない）

## 既知の落とし穴

- (随時追記)

## バージョン固定方針

各依存はセットアップ時点で `npm view <pkg> version` / `cargo search` で確認した最新安定版を
`package.json` / `Cargo.toml` に固定値（キャレット無し）で記載している。更新する際は同様に確認すること。
