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


## GitHub Release 実行

**対象:** `gh release create`でタグ・Releaseを公開する手順。

**用途:** タグが実際のリリースコミットを指すことを保証する。`main`未pushのまま`gh release create`すると、GitHubは存在しないタグをリモートのデフォルトブランチ先端（古いコミット）へ張ってしまう（v0.2.7で実発生日→手動でタグを付け直した）。

**実行:**  
リリース前に `git status --short` が空であることと、`git rev-parse HEAD` と `git rev-parse origin/main` が一致していること（一致しなければ先に `git push origin main`）を確認してから `gh release create` する。公開後、`git ls-remote --tags origin <タグ>` が `HEAD` と一致することを確認する。

**確認:**  
公開されたReleaseの`targetCommitish`（＝タグの指すコミット）が、ビルド元の`HEAD`と一致していること。

**限界:**  
タグ位置の取り違えを検知できるだけで自動では直せない。外れていた場合は`git tag <タグ> <正しいコミット>` → `git push --force origin <タグ>`で付け直す（Release本体とDiscord通知は再発火しない）。


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
`App/` で `npm run test:e2e -- --spec e2e/specs/<対象スペック>.spec.js`
（`scripts/run-e2e.mjs`が、devサーバー(vite, port 1420)を未配信なら自動起動・実行後に自動終了し、配信済みなら再利用。tauri-driver/msedgedriverの残留プロセスも実行前後で自動終了するため、devサーバーやドライバの起動・後片付けは不要）

**データ分離:**  
E2Eが起動するアプリは `GYROSCOPE_DATA_DIR`（`%TEMP%\gyroscope-e2e-data`）の専用DBを使用する（`src-tauri/src/paths.rs`）。人間の実データ（`%APPDATA%\com.noxrss.gyroscope`）は読み書きされないため、手動で開発版やポータブル版を同時に使っても競合しない。タイムラインに人間の記事が現れないのはこの分離の正常な結果。専用DBを初期化したい場合は `%TEMP%\gyroscope-e2e-data` を削除する。

**確認:**  
`X passing`/`X failing`に加え、観測用スペックは`console.log`の出力内容で判断する。
回帰テストとして残すスペックは恒久名（`zz-temp-`プレフィックスを付けない）で置き、診断用の一時スペック（`zz-temp-`）は確認が終わったら削除する。

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

