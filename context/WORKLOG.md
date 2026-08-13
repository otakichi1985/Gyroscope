# WORKLOG.md

最近の開発状況をHumanとAIが短時間で復元するための作業記録。
詳細な履歴はGit / GitHubに任せ、現在に近い情報だけを保持する。

記録を追加する際は、各セクションの書式例と文量に合わせる。
コミットしたら該当するCurrent Workの記録をRecent Commitsへ圧縮する（末尾のRotationを参照）。


# Current Work

現在進行中の未コミット作業を保持する。
重要な作業・確認・失敗・判断を原則1項目1文で記録し、最新を上に追加する。

肥大化してきた場合は、安全に区切れる地点でHumanへコミットを提案する。

書式例：
> - **[Claude Code / Sonnet]** Rust側の座標変換を次に調査する。
> - **[Human]** 実機上で表示のズレが残っていることを確認。
> - **[Claude Code / Opus相談]** DPI変換を調査すべきとの助言を得た。


<!-- ここから実際の記録 -->
- **[Claude Code / Sonnet]** フィード管理画面のスクロール不可バグを修正：`FeedManagerOverlay`が`overflow-hidden`で`FeedManager`を包み内側の`overflow-y-auto`を無効化していたため、他画面と同じ「直下の子に`min-h-0 flex-1 overflow-y-auto`」構造に統一。
- **[Claude Code / Sonnet]** 検索速度対策として`hatena:bookmarkcount`（feed-rsが読まない拡張タグ、生XMLから自前抽出）でドメイン重複排除・候補の事前絞り込み・フィード発見を並列化（`tokio::sync::Semaphore`、同時5件）、実測で1クエリ約2〜2.5秒に短縮。`?sort=popular`はRSS版で無視される（実機確認済み）ため並び替えは全てクライアント側。ブックマーク数を`policy::bookmark_boost`でスコアへ反映済み。

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

## bdac41a — 2026-08-13
**環境:** Claude Code / Sonnet

サイト検索登録機能を追加。当初DuckDuckGo案は実機検証で画像CAPTCHAブロックを確認（SearXNG・Marginalia Web UIも同様に不採用）、
はてなブックマーク検索RSSへ切替（キー不要・robots.txt許可・コミュニティ選別済み）。
フィード発見を通過したドメインのみ独自ポリシーでスコアリングして表示し、既存のadd_feed経路で登録する。

## 155ae59 — 2026-08-13
**環境:** Claude Code / Sonnet

`.claude/launch.json`の再作成方法をVERIFY.mdへ記録し、`.gitignore`へ追加した。

## c9a0110 — 2026-08-13
**環境:** Claude Code / Sonnet

浮遊スキンで検索欄を再クリックすると記事リストにクリックを奪われるバグを修正。
WebdriverIO実機E2E（`App/e2e/`）を新規導入し、原因特定・修正確認に使った。

## 0257a85 — 2026-08-13
**環境:** Git履歴から移行（Human / Codex）

アプリ本体を `App/` へ、旧資料を `context_archive/` へ移すディレクトリ再編をコミット。

## 25a43b8 — 2026-08-12
**環境:** Git履歴から移行

開発時の終了経路をログへ残し、残留した開発ポートを起動前に整理する処理を追加。


# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- コミット → 該当する未コミット記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
