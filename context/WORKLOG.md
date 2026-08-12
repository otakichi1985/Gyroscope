# WORKLOG.md

最近の開発状況をHumanとAIが短時間で復元するための作業記録。
詳細な履歴はGit / GitHubに任せ、現在に近い情報だけを保持する。


# Current Work

現在進行中の未コミット作業を保持する。
重要な作業・確認・失敗・判断を原則1項目1文で記録し、最新を上に追加する。

肥大化してきた場合は、安全に区切れる地点でHumanへコミットを提案する。

書式例：
> - **[Claude Code / Sonnet]** Rust側の座標変換を次に調査する。
> - **[Human]** 実機上で表示のズレが残っていることを確認。
> - **[Claude Code / Opus相談]** DPI変換を調査すべきとの助言を得た。


<!-- ここから実際の記録 -->

- **[Human / Codex]** 共同開発ルールの唯一の正本をルート `AGENTS.md` へ移し、`CLAUDE.md` は `@AGENTS.md` を読む入口へ統一した。
- **[Human / Codex]** リポジトリ外側のディレクトリ名を `rss-widget` から `Gyroscope` へ変更し、プロダクト名と揃える。
- **[Codex]** 旧Claude設定内の認証情報がアーカイブと一緒にコミットされないよう、`context_archive/.claude/settings.local.json` だけをGit対象外にした。
- **[Codex]** `App/` 移動後にフロントビルド、Rust 53テスト、Clippy、ポータブル版とZIP生成がすべて成功した。
- **[Codex]** 移動前の絶対パスを持つCargoキャッシュが初回テストを妨げたため、再生成可能な `App/src-tauri/target` だけを `cargo clean` し、新パスで再構築した。
- **[Codex]** Git管理されていたアプリ・旧資料112ファイルが移動前のGit blobと完全一致し、内容変更がないことを確認した。
- **[Codex]** 旧資料を `context_archive/`、アプリ本体を `App/` へ移し、ルートを共同開発の入口と正本中心に整理した。
- **[Codex]** GitHubがルート配置を要求する `.github/` と、リポジトリ共通の `.vscode/`・`.gitignore` はルートに維持した。
- **[Codex]** 実装を変更せず、コード・Git・現在設定を優先して新しい `context/` 正本へ移行した。
- **[Codex]** `npm run build`、`cargo test`（53件）、`cargo clippy -- -D warnings` の成功を確認した。
- **[Codex]** 旧 `context_archive/BACKLOG.md` の記事ソート未実装記述が現在のコードと矛盾するため、新正本へ未実装事項として移さなかった。
- **[Codex]** 作業開始前から `.claude/` が未追跡で、`settings.local.json` に認証情報を含むコマンド履歴があることを確認したが、変更していない。
- **[Human]** 旧コンテキストを参考資料とし、コード・Git・現在状態を優先し、不明点を推測で埋めない方針を指定した。


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

## 25a43b8 — 2026-08-12
**環境:** Git履歴から移行

開発時の終了経路をログへ残し、残留した開発ポートを起動前に整理する処理を追加。

## 302c8ea — 2026-08-12
**環境:** Git履歴から移行

作業途中だった別ウィンドウ型GUI編集ツールをrevertし、現行実装から除外。

## cdf69c9 — 2026-08-08
**環境:** Git履歴から移行

浮遊系スキンのリサイズと記事ソートの操作感を調整し、v0.2.5へ更新。

## 4fd34c4 — 2026-08-08
**環境:** Git履歴から移行

開発専用ツール由来のTailwind utilityが出荷CSSへ混入しないよう修正。

## d695013 — 2026-08-08
**環境:** Git履歴から移行

GitHub Release公開時のDiscord通知をCIへ追加。


# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- コミット → 該当する未コミット記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
