# VERIFY.md

このプロジェクトで利用可能な検証・観測手段。
実装・修正時は、対象に適した方法をここから選ぶ。

推測による修正より、直接観測できる方法を優先する。

プリセットを追加・編集する際は、既存プリセットの書式
（`## 名前` → **対象:** / **用途:** / **実行:** / **確認:** / **限界:**）に合わせる。
調査経過や特定バグの原因・修正内容など、プリセット自体ではない記録は
`WORKLOG.md` 側に書く。


# Verification Presets

## Frontend Production Build

**対象:** TypeScript型検査とReact / Viteの本番向け生成。

**用途:** フロントエンド変更、依存関係変更、出荷用画面コードの確認。

**実行:**  
`App/` で `npm run build`

**確認:**  
`tsc && vite build` が終了コード0で完了し、`dist/` に成果物が生成される。

**限界:**  
実際のTauriウィンドウ、Rust連携、見た目、操作感は確認できない。


## Rust Unit Tests

**対象:** フィード解析、重複排除、検索DB、OPML、BOOTH抽出などRust側のテスト対象。

**用途:** Rust変更、DB変更、取得・解析・検索処理の回帰確認。

**実行:**  
`App/src-tauri/` で `cargo test`

**確認:**  
全テストが成功し、failedが0件であること。2026-08-12時点では53件成功を確認済み。

**限界:**  
外部サイトの現在の応答、Tauri画面、Windows上の実操作は確認できない。


## Rust Clippy

**対象:** Rustコードの静的検査。

**用途:** Rust変更後の警告・問題候補の確認。

**実行:**  
`App/src-tauri/` で `cargo clippy -- -D warnings`

**確認:**  
終了コード0で完了する。

**限界:**  
機能がHumanの目的どおり動くことは確認できない。


## Portable Package Build

**対象:** フロント本番ビルド、Rust Releaseビルド、ポータブル配布物とZIPの生成。

**用途:** 配布経路、ディレクトリ変更、Tauri・portable生成スクリプト変更後の確認。

**実行:**  
`App/` で `npm run package:portable`

**確認:**  
終了コード0で完了し、`App/dist-portable/` に `.portable`、`data/`、`README.md`、`sample.opml`、`gyroscope.exe` が生成され、`App/gyroscope-portable-v{version}.zip` に同じ構成が入る。

**限界:**  
生成した実行ファイルのGUI操作、更新配信、別PCでの起動までは確認できない。


## Git Working Tree Inspection

**対象:** 今回の変更範囲、未追跡ファイル、意図しない変更。

**用途:** 作業前後、完了報告前、コミット前。

**実行:**  
プロジェクトルートで `git status --short` と `git diff --stat`。必要なファイルは `git diff -- <path>` で確認する。

**確認:**  
変更対象が依頼範囲内で、既存のHuman作業を上書きしていないこと。

**限界:**  
未追跡ファイルの中身やアプリ動作は自動では判断できない。


## Tauriウィンドウ実機E2E（WebdriverIO + tauri-driver）

**対象:** 実際のTauriウィンドウ（WebView2）上でのクリック・フォーカス・入力など、
プレーンブラウザのDevTools相当の観測では再現できない挙動。

**用途:** フォーカス漏れ、意図しない要素へのクリック奪取、ウィンドウの表示/フォーカス状態に
依存するタイミング問題など、実機でしか確定できない不具合の再現・観測。
大規模なE2Eスイートの整備が目的ではなく、個別の不具合を実機上で再現・観測するための最小手段。

**実行:**  
1. `App/` で Vite 開発サーバーを起動する（`npm run dev`、または `.claude/launch.json` の
   `gyroscope-dev` 設定）。デバッグビルド（`target/debug/`）は `devUrl: http://localhost:1420`
   を読みに行くため必須。起動していないと `ERR_CONNECTION_REFUSED` の白画面のまま全テストが失敗する。
2. `App/src-tauri/target/debug/gyroscope.exe` が存在することを確認する
   （なければ `npm run tauri dev` を一度実行してビルドさせる）。
3. `App/` で `npm run test:e2e -- --spec e2e/specs/<対象スペック>.spec.js`  
   （`--spec` 省略で `e2e/specs/**/*.spec.js` 全件）

**確認:**  
`X passing` / `X failing` がコンソールに出る。`App/e2e/specs/` の観測用スペックは
アサーションで合否を決め切らず、`console.log` で出力される状態
（フォーカス先、要素の矩形、`elementFromPoint` の結果など）を読んで判断するものが中心。

**限界:**  
- 初回はtauri-driverのcargo installとmsedgedriverの取得が走るため数分かかる。
- テスト対象はデバッグビルド固定（`target/debug/gyroscope.exe`）。リリースビルドを検証したい場合は
  `wdio.conf.js`の`appBinaryPath`/`application`を`target/release/...`に変更し、
  事前に`npm run tauri build`（または`cargo build --release`）が必要。
- `@wdio/tauri-plugin`（Rust側プラグイン）を入れていないため、`browser.tauri.execute()`などの
  Tauriコマンド実行・モックAPIは使えない。
- 実行のたびに`tauri-driver.exe`・`msedgedriver.exe`が新しいポートで起動し、テストランナー終了時に
  必ずしも全て終了しない。長時間放置せず、
  `Get-Process tauri-driver,msedgedriver | Stop-Process -Force`などで随時後片付けする。


<!-- ここから実際の検証プリセット -->




# Human Verification

AIだけでは判断できない場合に使用する。

Humanへ確認を依頼する前に、利用可能な機械的検証を行う。
依頼時は「何を確認するか」「どうなれば成功か」を簡潔に示す。

- GUI変更では、対象画面を実機で開き、変更箇所だけでなく周辺の重なり、読めること、クリック・スクロール・リサイズを確認する。
- スキンや不透明度を扱う変更では、関係するライト・ダーク・浮遊系表示とWindows上の背面の見え方を確認する。
- BOOTHなど外部サイト依存の変更では、実際の対象URLで取得でき、失敗時に理由が画面へ出ることを確認する。


<!-- 必要ならプロジェクト固有のHuman確認方法を記録 -->

