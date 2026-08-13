# VERIFY.md

このプロジェクトで利用可能な検証・観測手段。
実装・修正時は、対象に適した方法をここから選ぶ。

推測による修正より、直接観測できる方法を優先する。

プリセットを追加・編集する際は、既存プリセットの書式と文量
（`## 名前` → **対象:** / **用途:** / **実行:** / **確認:** / **限界:** 各1〜2文）に合わせる。
調査経過や特定バグの原因・修正内容など、プリセット自体ではない記録は `WORKLOG.md` に書く。


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


## GitHub Release ノート確認

**対象:** GitHub Releaseとして公開するリリースノートの記載内容。

**用途:** リリース作成前に、今回のセッションでの作業だけでなく前回リリース以降の全変更が反映されているか確認する。

**実行:**  
`git log --oneline <前回タグ>..HEAD` で全コミットを列挙し、`WORKLOG.md`のRecent Commitsと突き合わせる。

**確認:**  
他セッション・Human分を含む前回リリース以降の全コミットがリリースノートに反映され、実機で無関係と分かった変更（開発環境限定の不具合など）は含めていないこと。

**限界:**  
`WORKLOG.md`のRecent Commitsは直近5件までしか保持しないため、リリース間隔が空いた場合は`git log`側の全件確認が必須。


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

**対象:** 実際のTauriウィンドウ上でのクリック・フォーカス・入力・スクロール・レイアウト崩れ。Browser previewはTauriの実行コンテキスト外でTitleBar.tsxが例外を出し使えないため、GUI変更を機械的に確認できる唯一の手段。

**用途:** GUI変更（フォーカス漏れ、クリックの奪取、スクロール、z-index等）の既定の検証手段。Human確認へ回す前にまずこれで再現・観測を試みる。

**実行:**  
`App/` でVite開発サーバーを起動後（`npm run dev`、または`.claude/launch.json`）、
`npm run test:e2e -- --spec e2e/specs/<対象スペック>.spec.js`
（`scripts/run-e2e.mjs`がtauri-driver/msedgedriverの残留プロセスを実行前後で自動終了するため、後片付けは不要）

**確認:**  
`X passing`/`X failing`に加え、観測用スペックは`console.log`の出力内容で判断する。

**限界:**  
デバッグビルド固定。初回はtauri-driver/msedgedriverの取得に数分かかる。
対象のGUI変更を確認するスペックが無ければ先に書く必要がある。


<!-- ここから実際の検証プリセット -->




# Human Verification

AIだけでは判断できない場合に使用する。

Humanへ確認を依頼する前に、利用可能な機械的検証を行う。
依頼時は「何を確認するか」「どうなれば成功か」を簡潔に示す。

- GUI変更では、まずTauriウィンドウ実機E2Eで変更箇所と周辺の重なり・クリック・スクロール・リサイズを確認し、見た目の良し悪しなど機械的に判定できない部分だけHumanへ依頼する。
- スキンや不透明度を扱う変更では、関係するライト・ダーク・浮遊系表示とWindows上の背面の見え方を確認する。
- BOOTHなど外部サイト依存の変更では、実際の対象URLで取得でき、失敗時に理由が画面へ出ることを確認する。


<!-- 必要ならプロジェクト固有のHuman確認方法を記録 -->

