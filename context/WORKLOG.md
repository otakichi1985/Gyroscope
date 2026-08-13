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

## 6805aba — 2026-08-14
**環境:** Claude Code / Sonnet

改善ループAを実施：UNKNOWN_DOMAIN.mdの「Observability」に、外部サイト/APIの挙動は実装前にcurl等で直接確認する旨を追記し、正本`human-ai-foundation`側にも手動で反映。
将来ニーズとして「workflowsの自動反映の仕組み」「開発版起動時に自分用TLのDBが壊れる件」を`IDEAS_AND_HYPOTHESES.md`へ記録。

## 189a55c — 2026-08-14
**環境:** Claude Code / Sonnet

WORKLOG振り返りから改善ループを実施。GUI変更が毎回Human確認待ちになる件を`scripts/run-e2e.mjs`（driver残留プロセスを実行前後で自動終了）で解消し、`VERIFY.md`のE2Eプリセットを既定の検証手段として格上げ。
実機で確認（成功/失敗どちらのケースもdriverプロセスが残らないこと、失敗時の終了コードが正しく伝播することを確認済み）。

## 390bc35 — 2026-08-14
**環境:** Claude Code / Sonnet

v0.2.6のリリースノートに前回リリース以降の全変更を反映し忘れていた件（`c9a0110`のクリック奪取バグ修正が漏れ、開発環境限定の変更2件が誤って記載）をHumanの指摘で修正。
`gh release edit`でノートを訂正し、再発防止のプリセットを`VERIFY.md`へ追加。

## c7f7855 — 2026-08-14
**環境:** Claude Code / Sonnet

v0.2.6としてリリース（`package.json`/`tauri.conf.json`/`Cargo.toml`のバージョン更新、ロックファイル同期）。
ポータブル版をビルドし、GitHub Releaseに`gyroscope-portable-v0.2.6.zip`と単体`gyroscope.exe`を添付して公開。

## fea7436 — 2026-08-14
**環境:** Claude Code / Sonnet

「ゲーム」タブに漫画記事が混ざる件を調査、Hatenaの`game`スラッグの公式タイトルが「アニメとゲーム」と判明しラベルを修正（`economics`も同様）。
検索結果が少ない件を段階別に計測し独自ポリシーの足切りはほぼ影響なしと確認、主因のMAX_CANDIDATES上限を15→30へ引き上げ。


# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- コミット → 該当する未コミット記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
