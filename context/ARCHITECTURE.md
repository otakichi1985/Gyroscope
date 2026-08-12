# ARCHITECTURE.md

このプロダクトの現在の技術構造と役割分担を記録する。
過去の構造や変更履歴は残さない。


# Overview

画面表示と操作はReactが担当し、OS機能・情報源の取得・記事処理・保存はTauri経由のRustが担当する。ReactからRustのコマンドを呼び、RustがSQLiteやWeb、Windows機能とやり取りした結果を画面へ返す。


# Components

## React / TypeScript UI

**役割:**  
タイムライン、記事リーダー、フィード管理、履歴、ゴミ箱、設定など、Humanが操作する画面を表示する。

**担当範囲:**  
`App/src/` 配下。表示、入力、画面遷移、DOMPurifyによる記事HTMLの表示前サニタイズを担当する。

**接続先:**  
Zustandストア、Tauriコマンド、ブラウザのlocalStorage。


## Zustand Stores

**役割:**  
画面で共有する状態と、UIから行う操作をまとめる。

**担当範囲:**  
`App/src/stores/` 配下。フィード、記事、外観、履歴、ゴミ箱、更新状態を管理する。一部の表示設定はlocalStorageへ保存する。

**接続先:**  
Reactコンポーネント、Tauriコマンド、localStorage。


## Tauri Command Bridge

**役割:**  
Web画面からRust側の機能を安全に呼び出す入口。

**担当範囲:**  
`App/src-tauri/src/lib.rs` の登録と `App/src-tauri/src/commands/`。フィード、記事、OPML、設定、更新処理を公開する。

**接続先:**  
React / Zustand、Rustの取得・解析・DB・OS連携処理。


## Rust Feed / Source Processing

**役割:**  
RSS / AtomとBOOTHから情報を取得し、記事へ変換する。

**担当範囲:**  
`App/src-tauri/src/fetch/`、`parse/`、`scheduler.rs`。HTTP取得、フィード発見、解析、重複排除、本文テキスト化、サムネイル・favicon取得、定期更新を担当する。

**接続先:**  
外部Web、SQLite、Tauriイベント、通知。


## BOOTH WebView2 Scraper

**役割:**  
通常のHTTP取得だけでは扱えないBOOTHショップを、非表示WebView2で読み取る。

**担当範囲:**  
`App/src-tauri/src/fetch/booth.rs`。対象URLの判定、専用ウィンドウ、ページ内抽出、失敗分類を担当する。

**接続先:**  
BOOTH、Rustのフィード更新処理、SQLite。


## SQLite Data Store

**役割:**  
購読先、記事、ジャンル、設定、既読履歴を永続保存する。

**担当範囲:**  
`App/src-tauri/src/db/`。rusqliteを使い、`PRAGMA user_version` による段階的マイグレーションとFTS5全文検索を持つ。

**接続先:**  
Rustコマンド、取得・解析処理、データ保存先管理。


## Data Path / Portable Mode

**役割:**  
SQLiteなどのデータをどこへ保存するか決める。

**担当範囲:**  
`App/src-tauri/src/paths.rs`。通常のアプリデータ、ポータブル版の隣接 `data/`、Humanが指定した保存先を扱う。

**接続先:**  
SQLite、設定画面、更新・再起動処理。


## Windows / Tauri Integration

**役割:**  
デスクトップアプリとしてのウィンドウ、トレイ、通知、外部ブラウザ、ファイル選択を扱う。

**担当範囲:**  
`App/src-tauri/src/window/`、`tray.rs` とTauriプラグイン。透明・ぼかし・不透明度、最前面、位置とサイズの保存、終了動作を担当する。

**接続先:**  
Windows、React設定画面、Rustのスケジューラ。


## Update / Distribution

**役割:**  
アプリの配布物作成と、起動後の更新・ロールバックを扱う。

**担当範囲:**  
`App/scripts/make-portable.mjs`、Tauri build設定、`App/src-tauri/src/commands/update.rs`。GitHub Releasesから更新を確認し、実行ファイルを置換して1世代だけ戻せる。

**接続先:**  
GitHub Releases、設定画面、実行ファイル、SQLite。


# Data / Process Flow

Humanの操作または定期更新 → React / Zustand → Tauriコマンド → RustがRSS・Atom・BOOTHを取得・解析 → SQLiteへ保存 → 更新イベント → Zustandが再読込 → Reactがタイムラインやリーダーへ表示する。


# Important Boundaries

- UI表示とHuman操作はReact、外部取得・永続化・OS機能はRustが担当する。
- ReactとRustの境界はTauriコマンド、型の対応は `App/src/lib/types.ts` と `App/src-tauri/src/db/models.rs` に分かれている。
- 記事HTMLは第三者入力であり、Reactで表示する直前にDOMPurifyを通す。
- UI設定の一部はlocalStorage、プロダクトデータと一部設定はSQLiteに保存される。
- RSS / Atom取得とBOOTH取得は同じフィード更新の入口を共有するが、内部の取得方法は分離されている。
- 配布ビルドではRustの `custom-protocol` featureが必要で、開発用Viteサーバーへの依存を残さない。
