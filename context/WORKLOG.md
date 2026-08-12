# WORKLOG.md

最近の開発状況をHumanとAIが短時間で復元するための作業記録。
詳細な履歴はGit / GitHubに任せ、現在に近い情報だけを保持する。

記録を追加する際は、各セクション（Current Work / Uncommitted Archive /
Recent Commits）に示された書式例に合わせる。コミットしたら該当する
Current Work の記録を Recent Commits へ圧縮する（末尾の Rotation を参照）。


# Current Work

現在進行中の未コミット作業を保持する。
重要な作業・確認・失敗・判断を原則1項目1文で記録し、最新を上に追加する。

肥大化してきた場合は、安全に区切れる地点でHumanへコミットを提案する。

書式例：
> - **[Claude Code / Sonnet]** Rust側の座標変換を次に調査する。
> - **[Human]** 実機上で表示のズレが残っていることを確認。
> - **[Claude Code / Opus相談]** DPI変換を調査すべきとの助言を得た。


<!-- ここから実際の記録 -->


# Uncommitted Archive

大規模な未コミット作業があり、Current Workを圧縮する必要がある場合のみ使用する。
まずコミットを提案し、まだコミットしない場合に意味のある変更単位でここへ退避する。
最新を上に追加する。

書式例：
> ## [変更のまとまり] — 未コミット
> **環境:** Claude Code / Sonnet
>
> **概要:** ここまで行った変更。
>
> **状態:** 確認済みのこと、未完了のこと、注意点。


<!-- ここから実際の記録 -->




# Recent Commits

直近のローカルGitコミットを最大5件保持する。
最新を上に追加し、5件を超えたら最も古い記録を削除する。

書式例：
> ## abc1234 — YYYY-MM-DD
> **環境:** Claude Code / Sonnet
>
> 変更内容と、後から知る必要があることを数行以内で記録。


<!-- ここから実際の記録 -->

## 155ae59 — 2026-08-13
**環境:** Claude Code / Sonnet

`.claude/launch.json`（Browserペイン用devサーバー起動設定）の再作成方法をVERIFY.mdへ記録し、
`.gitignore`へ追加してGit管理対象外に固定した。

## c9a0110 — 2026-08-13
**環境:** Claude Code / Sonnet

浮遊スキン（カーディナリティ/オーディナリー）で、検索欄を開いた直後は入力できるが再クリックすると
記事リストにクリックを奪われるバグを修正。原因は `.skin-cardinality > *` 等のブランケット
z-indexルールがタイムラインラッパーまで巻き込み、フィルターバーと同順位で並んでDOM順に負けていたこと。
WebdriverIO + tauri-driverによる実機E2E（`App/e2e/`）を新規導入し、実測で原因特定・修正確認まで行った。

## 0257a85 — 2026-08-13
**環境:** Git履歴から移行（Human / Codex）

アプリ本体を `App/` へ、旧資料を `context_archive/` へ移し、`context/` を正本とする
ディレクトリ再編をコミット。実装変更なし（build / cargo test 53件 / clippy 成功を確認済み）。

## 25a43b8 — 2026-08-12
**環境:** Git履歴から移行

開発時の終了経路をログへ残し、残留した開発ポートを起動前に整理する処理を追加。

## 302c8ea — 2026-08-12
**環境:** Git履歴から移行

作業途中だった別ウィンドウ型GUI編集ツールをrevertし、現行実装から除外。


# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- コミット → 該当する未コミット記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
