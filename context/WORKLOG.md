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

> - **[opencode]** 改善ループの追記対応（Human指摘）。①**一時スペック方針の修正**: 使い捨てスペックをセッション内で即削除するのをやめ、`zz-temp-`プレフィックスでフルスイートから除外（`wdio.conf.js`に`exclude`追加）して**保持**し、適切なタイミング（次回検証・リリース前）に破棄する方式へ。VERIFY.mdの一時スペックルールを改訂。②**ui-auditの決定的化**: 共有E2E DBに先行スペックが残すデータ（`read_history`/`saved_articles`等）でbookmarks/historyがAMBIGUOUSになるのを、`seed-reader-data.mjs`に`clearE2eData()`（retry-on-locked付き全テーブル削除）を追加し、ui-auditの`before()`で清掃して解消。残データを入れた状態で検証し**CLEAR_FAIL=0 AMBIGUOUS=0**（bookmarks/history changed=0）を確認。③**search-focus.spec.jsの遅さ（単独1m36s）を計測調査**: 固定待ち（waitForClickable/waitForDisplayed）は約30msで即解決。実際はカーディナリティ（浮遊・vibrancy）スキン切替後のWebDriverコマンドのストール（`click()`約23秒、テスト間境界16〜39秒）が原因で、描画負荷由来のため待ち調整では直らず「許容」と判断（コード変更なし）。

> - **[opencode]** v0.2.10後の改善ループを実施（Human選定）。**A**: 挙動・操作感の要望も実装前に解釈確認する旨を共有`workflows/IMPLEMENTATION.md`§1へ追記（今回のマウスホイール誤解の再発防止）。**B**: 共有`workflows/DISCOVERY.md`§9に「技術的な説明と非エンジニア向けの噛み砕いた説明を併記する」ルールを追記（AGENTS.mdのHuman節にも併記）。**C**: 探すリーダーとTLリーダーの構造非対称（navStack内外）を`IDEAS_AND_HYPOTHESES.md`へ将来対応として記録。**D(E2E高速化)**: ①使い終わった調査用スペック4件を削除（`debug-probe`/`search-stacking-diagnose`/`search-layout-diagnose`/`search-focus-geometry`。本番の`search-focus.spec.js`とui-auditが同じ箇所をカバー）。②リロード後の固定`pause(2500〜3000)`を「`.app-filterbar`表示待ち`waitUntil`」へ置換（font-split/reader-race/reader-readability/scroll-keys）。結果: フルスイート9スペック全通過、実行時間**8分17秒→6分8秒**（約2分短縮）。`VERIFY.md`のui-auditには「局所的な微小差分(<0.5%)は再生成任意」を明記。

> - **[opencode]** v0.2.10をリリース公開（2026-08-20）。リリースノートは前回v0.2.9との差分ベースで起草し、バグ修正2件（探す検索の関連度・表示ブレ／探すリーダー表示）は`git show v0.2.9:App/src/components/DiscoverOverlay.tsx`で実在を確認してからHuman承認（バージョンはv0.2.10で決定）を得た。`npm run package:portable`で配布物（zip+単体exe）を生成し、`gh release create v0.2.10`（zip+exe添付、HEAD=21a3389にタグ）で公開。タグ位置は`git ls-remote`でHEADと一致を確認。URL: https://github.com/otakichi1985/Gyroscope/releases/tag/v0.2.10

> - **[opencode]** v0.2.9をリリース公開（2026-08-20）。リリースノートは「前回リリース版との差分」ベースで起草し、バグ修正2件（フォント分割が一部フォントで適用されない／全文取得の競合で前の記事の本文に置き換わる）は`git log -S`でv0.2.8に実在を確認してからHuman承認を得た。`npm run package:portable`で配布物を生成し、`gh release create v0.2.9`（zip+exe添付、HEAD=43b4673にタグ）で公開。タグ位置は`git ls-remote`でHEADと一致を確認。URL: https://github.com/otakichi1985/Gyroscope/releases/tag/v0.2.9

> - **[opencode]** 探す画面の提供元URL可視化と全テーマでの見た目統一。カードの提供元ドメインをタイムラインと同じ`accent-text`強調(10px/opacity55→text-xs/無減光)へ。色の不整合(amberハードコード)をアクセント基調へ統一 — ☆・「記事を保存」・チェックボックス(`checkbox-input`新設)・検索欄のfocusリングを撤去。検索ボタンを`accent-bg accent-text`(ライトモードで同色=ほぼ不可視のバグ)から正規プライマリCTA(`accent-bg`+白文字)へ修正。「候補の状態」チップも兄弟チップと同じ`accent-bg-soft`へ。カードを`entry-card`化(タイムラインのガラスカードと同じ背景/ホバー/`active:scale-[0.98]`押下)し、フローティング/スタイル系スキン(カーディナリティ・オーディナリー等)でも見た目が統一されるようにした。配置は不変。RSSバッジの緑(成功=既読✓と同じセマンティック色)と提供元注記は維持。`npm run build`成功、E2E(`bookmark-store.spec.js`)通過。
> - **[opencode]** 探すタブのブックマーク保存をタイムラインのブックマーク一覧と統合。ユーザー要望4点を実装した。
>   1. **提供元の明示**: 検索画面下部に「検索結果は「はてなブックマーク」のデータを使用しています」を追加。
>   2. **保存場所の統一**: 新規 `saved_articles` テーブル(migration v6)に保存し、`list_entries`(ブックマーク絞り込み時)と`list_deleted_entries`へ**負のID**(`-saved_articles.id`)の合成Entryとしてマージ。負IDは`delete_entry`/`restore_entry`/`toggle_star`/`mark_entry_read`でsaved_articlesへルーティングし、ゴミ箱(30日保持)も通常ブックマークと同一経路。DiscoverOverlayの「記事を保存」と☆を`save_article`/`unsave_article`(URLでupsert、unsaveはゴミ箱へsoft delete)に統一し、旧localStorage保存(`gyroscope:discovered-bookmarks`/`discovered-stars`)は初回マウント時にDBへ移行して削除。探すタブ内の保存一覧ビューはタイムラインのブックマーク一覧が役割を担うため撤去。
>   3. **☆アイコンの探す画面からの直クリック**: FilterBarの星をdiscover画面でも有効化し、クリックで`goHome()`+ブックマーク絞り込みON。
>   4. **☆が機能しない問題**: カードの☆を保存トグルへ接続(2と同一動作)。
>   フロントは負ID(`id < 0`)で分岐 — EntryRowはリーダーではなくシステムブラウザで開き、EntryListはソース表示を「保存した記事」に。
>   `cargo build`/`npm run build` 成功。E2E(`bookmark-store.spec.js`): 保存→星アイコンでブックマーク一覧へ移動→保存記事表示→☆状態の永続→カード☆解除→ゴミ箱→復元→一覧へ復帰を実機確認。フルスイート9件通過。壊れていた一時診断スペック`zz-temp-discover-shot.spec.js`(predicateが常にfalseを返す)を削除。
> - **[opencode]** 「サイトを探す」の検索を見直し、見落とし3件を修正・実機E2E検証済み。
>   1. **登録済み判定の不具合**: 探すタブの結果は記事URL、登録済みはフィードURLで保持されており一致せず、「登録済みを隠す」や「登録済み」バッジが機能していなかった。ホスト名(www除去)照合に変更(`DiscoverOverlay.tsx`の`hostOf`)。
>   2. **「記事を保存」の行き止まり**: localStorageに保存するだけで閲覧場所がなかった。オーバーレイ内に保存済み記事一覧ビューを新設(ヘッダーの「保存済み記事 (N)」トグル、タイトル/ドメイン/保存日時/元記事を開く/削除)。保存形式は旧形式のURL列とも互換(読込時に正規化)。
>   3. **登録直後にカードが黙って消える**: 「登録済みを隠す」が既定ONのため消えて紛らわしかった。登録成功時に「◯◯をフィードに追加しました」の一時通知を追加(3秒で消える)。
>   E2E(`zz-temp-discover-fixes.spec.js`): 保存→一覧表示→削除→空状態、登録→通知、登録済みマーカーの表示を実機で確認。`npm run build` 成功。
> - **[opencode]** E2Eと人間の手動確認の競合を構造的に解消。`paths.rs` に `GYROSCOPE_DATA_DIR` 環境変数上書きを追加し、`run-e2e.mjs` がE2E起動時に専用DB(`%TEMP%\gyroscope-e2e-data`)を設定。E2Eのアプリインスタンスが人間の実DB(`%APPDATA%\com.noxrss.gyroscope`)を読み書きしないことを確認(実DBのタイムスタンプ不変、E2E側は空タイムライン)。既存E2EスペックはDBデータ非依存のため影響なし。VERIFY.mdに分離の説明を追記。
> - **[opencode]** E2Eのdevサーバー前提を構造的に解消。`scripts/run-e2e.mjs` がvite(port 1420)を未配信なら自動起動して応答を待ち、実行後に終了するようにした(配信中なら再利用して触らない)。配信判定はHTTP 200 + `<div id="root">`。自動起動/再利用の両パスを実機E2Eで確認し、`1 passing`。VERIFY.mdの実行手順もdevサーバー手動起動不要に更新。
> - **[opencode]** 「サイトを探す」GUI再設計を実機E2Eで一通り検証。初期表示(検索欄+ジャンルチップ+ヒント)、ジャンル閲覧(テクノロジー→14件+並び順/サイズ/登録済みを隠す/件数+記事の種類/候補の状態フィルタ)、カード展開(元記事を開く/RSSなし/記事を保存)を確認し、スクリーンショット3枚を`%TEMP%\opencode`へ保存。
> - **[opencode]** E2Eが「壊れている」ように見えた原因はコードではなく環境で、devサーバー(vite, port 1420)が落ちていたためアプリが接続拒否ページを表示していた。`npm run dev`再起動で解消。VERIFY.mdの「開発サーバー起動後」前提どおり。あわせて、日本語CSSセレクタはドライバ経由で文字化けするため、E2Eでは`\u`エスケープを埋めたexecute内評価に統一した。
> - **[opencode]** `DiscoverOverlay.tsx`をGUI配置の観点から全面的に再構成(機能はHuman要望のものをすべて維持)。モード切替(all/category)を廃止して検索欄+ジャンルチップを常時表示に統一、↕/▦の暗号アイコンを「並び順」「サイズ」ラベル付きセグメントへ置換、「すべて」チップをリセット動作に、結果ツールバーに「登録済みを隠す」チェックと件数表示を追加、初期ヒント文言を追加。カードから「記事保存可/済み」バッジ・「記事」アイブロー・「提供元:」プレフィックスを削除し、入れ子buttonを`div role="button"`へ修正。`npm run build` 成功。
> - **[opencode]** 「サイトを探す」の「記事保存可」フィルタが全件マッチしていた不具合を修正(常に`"article"`を返す定数が原因)。選択肢と`hidden`の死にセクションを削除し、型を`"all" | "feed" | "noFeed"`へ整理。`npm run build` 成功。
> - **[Codex]** 「サイトを探す」の第一段として、検索結果の件数表示、おすすめ/ブックマーク数/新着順の並び替え、最低ブックマーク数、登録済みサイトの非表示を追加。`npm run build` 成功、Rustテスト70件成功。実機GUIでの検索・絞り込み・登録確認はHuman確認待ち。
> - **[Codex]** 並び替えが見た目上変わらない原因を修正。検索候補に公開日時をRustからReactへ渡し、「新着順」を実日時の降順で比較するよう変更。`npm run build` とRustテスト70件成功。
> - **[Codex]** 「サイトを探す」のデフォルトを新着順に変更し、古い順を追加。候補カードで記事タイトルと提供元ドメインを明示的に分離表示した。`npm run build` 成功。
> - **[Codex]** 最低ブックマーク数の初期値を指定なし、登録済みサイトの初期状態を非表示へ変更。候補表示サイズを小/標準/大から切り替えられるようにした。`npm run build` 成功。
> - **[Codex]** 既存の推薦理由ラベルを使ったサイト種別絞り込み（個人ブログ、技術記事、学術・論文、技術Q&A、開発者一次情報、すべて）を追加。未分類サイトを誤分類せず、`npm run build` 成功。
> - **[Codex]** サイト探しの候補をRSS検出済み/未検出でも表示し、RSS登録可・記事保存可を色付きバッジで明示。フィード登録と記事保存を別ボタンに分離し、記事保存は当面この端末の画面状態へ保存。`npm run build` 成功、Rustテスト70件成功。
> - **[Codex]** 検索結果カードに通常タイムラインと同じ見た目の☆操作を追加し、展開時の「記事を保存」は維持。現在の☆状態は暫定的に端末内保存で、通常タイムラインの永続ブックマーク統合は次のDB対応が残る。`npm run build` 成功。
> - **[Codex]** 検索結果をカード単位で区切る境界・余白・背景を追加し、上部の並び順/絞り込み/表示条件をグループ化して視認性を改善。`npm run build` 成功。
> - **[Codex]** ウィンドウ幅が狭い場合もソート/絞り込みグループを1列のまま保持し、必要時だけ横スクロールするよう変更。`npm run build` 成功。
> - **[Codex]** 横スクロールを撤回し、狭い幅では操作グループが複数行へ自然に折り返すよう修正。ソート項目が隠れないことを優先した。`npm run build` 成功。
> - **[Codex]** ジャンル検索にもジャンル内キーワード絞り込みを追加し、記事種別フィルターを検索条件側へ移動。結果操作欄の孤立を解消した。`npm run build` 成功。
> - **[Codex]** 候補状態（すべて/RSS登録可/記事保存可/RSSなし）の絞り込みを追加し、画面上の「〇〇users以上ブックマーク」理由ラベルを非表示化。`npm run build` 成功。
> - **[Codex]** ジャンル/記事の種類/候補状態/並び順/最低ブクマ/表示サイズをセレクトからタグ選択へ変更。選択中の状態を色で明示し、`npm run build` 成功。
> - **[Codex]** 不要と判断した最低ブクマ条件のタグとクライアント側絞り込みを削除。`npm run build` 成功。
> - **[Codex]** 検索/タグ/表示を展開・折りたたみ可能な3セクションへ整理。候補状態タグをRSS=緑、記事保存=橙、RSSなし=グレーで色分けし、`npm run build` 成功。
> - **[Codex]** ソートの「人気」をおすすめへ統合して新着/古いとの3択に整理。RSSなし選択時は濃いグレーと枠線で選択状態を明示した。`npm run build` 成功。
> - **[Codex]** キーワード検索とジャンル検索を同じ検索セクションへ統合。検索範囲を「すべて/ジャンル」タグで切り替え、ジャンル時のみジャンル一覧とジャンル内キーワードを表示する構成にした。`npm run build` 成功。
> - **[Codex]** 「すべて/ジャンル」を検索窓の左側へ移動し、横長の検索範囲エリアを削除。検索欄と切り替えを同じ操作行へ統合した。`npm run build` 成功。
> - **[Codex]** 検索範囲の選択状態を白背景から既存のアクセント色表示へ戻し、選択中の判別性を改善。`npm run build` 成功。
> - **[Codex]** 検索入力/実行を最上位、記事タイトルを次点、提供元/理由タグを補助情報としてコントラスト・文字サイズ・背景を再配分。`npm run build` 成功。
> - **[Codex]** 検索/タグ/表示を縦並びアコーディオンから横並びのツールバーへ変更。選択中のパネルだけを開き、表示ソートとタグの概要をタブ上に出す構成にした。`npm run build` 成功。
> - **[Codex]** ジャンルを初期タブにし、上部を「ジャンル/検索/絞り込み/表示」に再構成。ジャンル直下のカテゴリタグを主導線にし、表示設定の説明ラベルを↕/▦アイコンへ簡略化した。`npm run build` 成功。
> - **[Codex]** 検索範囲タブを削除し、ジャンル検索を初期表示に統合。「すべて」をジャンルタグ先頭へ追加し、絞り込み/表示は小さなアイコン操作へ変更。`npm run build` 成功。
> - **[Codex]** パネル切り替え構造を撤去し、検索欄・ジャンルタグ・絞り込みタグを常時表示するフラットな構成へ変更。↕/▦はクリックで並び順/表示サイズを順送りする操作にした。`npm run build` 成功。
> - **[Codex]** 検索欄から離れて浮いていた↕/▦アイコンを検索入力行の右端へ移動。検索・並び順・表示サイズを同じ操作列に揃えた。`npm run build` 成功。

> - **[Codex]** portable版でDB更新後のフィード一覧が古いままになる原因を確認。`App.tsx`で起動時とウィンドウ再フォーカス時にフィード・ジャンルを再取得するよう修正し、`npm run build` 成功。
> - **[Codex]** `context/workflows` を `human-ai-foundation` 側の共通本体へつながるジャンクションに切り替えた。プロジェクト固有のcontext文書は従来どおり独立管理。
> - **[Codex]** `App/src-tauri/src/commands/feeds.rs` からURL検証とBOOTHショップ判定を `commands/feed_source.rs` へ分離。入力ルーティングの責務を独立させた。`cargo test` 70件成功。初回は移動前パスを残したtargetが原因で失敗したため、`src-tauri/target`のみ`cargo clean`して再検証。
> - **[Codex]** フィードの削除・名称・ジャンル・間隔・通知・並び順・タグ変更を `commands/feed_settings.rs` へ分離。Tauri登録先を新モジュールへ変更し、`cargo check` 成功。
> - **[Codex]** 起動時のfavicon補完処理を `commands/feed_maintenance.rs` へ分離。通常のフィード更新と起動時メンテナンスの責務を分け、`cargo check` 成功。
> - **[Codex]** 更新IPCの入口（単体更新・全体更新）を `commands/feed_refresh.rs` へ分離。内部更新エンジンはschedulerからも使うため `feeds.rs` に残し、IPCと内部処理の境界を明確化した。
> - **[Codex]** フィード一覧のDB参照ヘルパーを `commands/feed_queries.rs` へ分離。`feeds.rs` の登録・更新フローと読み取り整形の責務を分け、`cargo check` で確認。
> - **[Codex]** `feeds.rs` からジャンル管理を `commands/feed_genres.rs` へ分離。Tauriコマンドマクロは再エクスポート経由で登録できなかったため、`lib.rs`の登録先を新モジュールへ直接変更した。
> - **[Codex]** `App/src/components/SettingsOverlay.tsx` の設定状態・副作用（Zustand、テーマ判定、セクション開閉、システムフォント取得）を `useSettingsController.ts` へ分離。設定画面の描画責務と状態管理責務の境界を明確化した。`npm run build` 成功。既存の未コミット変更は保持。

# Unreleased Changes

現行版に対するバグ修正・新機能追加を、リリースノートへ反映するまで保持する。
コミット済みでも削除せず、リリースノート作成後にリリース済み項目だけ削除する。削除前の内容はGitに残る。
リリースノートへ転記するのはエンドユーザーに見える変更のみ。開発工程のみの変更（E2E整備・テスト設定・開発版バッジなど）は転記しない。記述の基準は前回リリース版で、リリース間で新設→撤廃された開発中のUIへの言及もしない（原因・再発防止策は`VERIFY.md`の「GitHub Release ノート確認」参照）。

書式: 1エントリを「**概要:** 短い見出し＋段落（複数行）」で書く。1行の長文にしない（編集の破損・リリース転記の取り回しが難しくなるため）。バグ修正エントリは「前回リリースで実在」の有無を明記する（`VERIFY.md`の再発防止③と連動。開発中のみで発生・修正されたものはリリースノート対象外）。
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

> - **[opencode]** 追加要望5件を実装。①探すタブから他タブへの移動: E2Eで「既に可能」であることを確認(ナビアイコンは最前面で覆われておらず履歴・設定へ遷移成功。検索フォーム無しでも)。「できない」と感じる原因は戻る/進むの操作手段が無いことと判断し、④のサイドボタンで補完。②✕全消しボタン: 共通`ClearableInput`コンポーネントを新設し、FilterBar検索・Discover検索・FeedManager URL・ジャンル名・FontPickerフォント検索の全テキスト入力欄に実装。③ジャンル追加枠の＋誤認: 「＋」チップ+ダッシュ枠を廃止し、両フォームに「フィードを追加」「ジャンルを追加」の明示ラベルを付ける方式へ変更。④マウスサイドボタン: `uiStore`にナビゲーション履歴スタック(`navStack`/`navIndex`+`goBack`/`goForward`)を追加し、`App.tsx`の`auxclick`(button3=戻る、4=進む)で画面遷移。⑤開発版の識別: タイトルバー(表示時)+ウィンドウタイトル`Gyroscope (開発版)`+常時表示のFilterBarに「開発版」バッジ(タイトルバーは既定で非表示のためFilterBarにも追加)。検証: `npm run build`成功、E2Eフルスイート8ファイル22テスト全通過(ui-fixes.spec.jsにクリアボタン・ジャンル枠・サイドボタン・開発版バッジの回帰テストを追加)。診断用zz-tempは削除。


> - **[Codex]** `App/src/components/SettingsOverlay.tsx` の設定状態・副作用（Zustand、テーマ判定、セクション開閉、システムフォント取得）を `useSettingsController.ts` へ分離。設定画面の描画責務と状態管理責務の境界を明確化した。`npm run build` 成功。既存の未コミット変更は保持。




# Recent Commits

直近のローカルGitコミットを最大5件保持する。
最新を上に追加し、5件を超えたら最も古い記録を削除する。

書式例：
> ## abc1234 — YYYY-MM-DD
> **環境:** Claude Code / Sonnet
>
> 変更内容と、後から知る必要があることを数行以内で記録。


<!-- ここから実際の記録 -->

## 21a3389 — 2026-08-20
**環境:** opencode

v0.2.10リリースのバージョン番号バンプ。`package.json`/`Cargo.toml`/`Cargo.lock`/`tauri.conf.json`を0.2.10へ変更。

## d98390c — 2026-08-20
**環境:** opencode

v0.2.10向け一括実装（Human実機確認・ノート承認済み）。①探す検索を関連度順に・二重フィルタ廃止で表示ブレ解消、全文リーダーにタイトル/公開日表示、リーダー中のサイドボタン(戻る)で閉じて結果へ戻る。②更新通知の自動化（起動時+6h確認、通知ポップアップ、自動更新モード3種、「更新はありません」表示）。③一番上に戻るボタン＋Home/End/PageUp/PageDownキー（スクロール対象レジストリ`lib/scrollTarget.ts`/`usePageScrollKeys`/`ScrollToTopButton`）。④設定タブ化＋歯車アイコン＋アップデートタブのバッジ＋文字設定の✕閉じ。⑤なめらかスクロール既定OFF化。検証: `npm run build`/`cargo test`(83件)成功、E2E13スペック全通過（`scroll-keys.spec.js`新設）、ui-auditベースライン再生成（CLEAR_FAIL=0 AMBIGUOUS=0）。

## 43b4673 — 2026-08-20
**環境:** opencode

v0.2.9リリースのバージョン番号バンプ。`package.json`/`Cargo.toml`/`Cargo.lock`/`tauri.conf.json`を0.2.9へ変更。

## 9ca12bc — 2026-08-20
**環境:** opencode

WORKLOG圧縮。コミット済みのリーダー作業エントリをCurrent Workから除去し、Recent Commitsを直近5件へ整理。

## e0a6cd3 — 2026-08-20
**環境:** opencode

リーダー一括改善（本バッチ本体、Human実機確認済み）。①グローバルフォント分割の不具合修正の一般解: `src:local()`はファミリー名でなく**face名（フルネーム/PostScript名）**とマッチするためYu系・ユーザー導入フォントで黙って無視されていた問題を、fontdb@0.24の新コマンド`list_font_face_names`（システム+ユーザーFonts直スキャンで各faceのPostScript名=nameID 6をfamily名ごとに集約）→`src/lib/systemFonts.ts`（キャッシュ付き）→App.tsxが起動時に`@font-face src`をface名で動的展開する方式で解消（静的`FONT_LOCAL_ALIASES`は撤去）。font-split.spec.js（Yu 3シナリオ+SAO UI）で実機確認。②全文取得の競合バグ修正: 要約のみ記事Aの取得が遅れて戻ったとき前の記事の本文で今見ている記事Bが上書きされる問題を、取得対象ID/URLのref照合で古い応答を破棄するガードで修正（ReaderOverlay/DiscoverOverlay）。決定的回帰E2E `reader-race.spec.js`（ローカルHTTPサーバでAの応答を遅延）を追加し、バグ版で失敗→修正版で成功を確認。③リーダー読みやすさ（先行未コミット分を回収）: 記事内書体（本文/コード）、要素ごとのテーマ適応配色プリセット、リンクをコピー、文字設定パネル/設定のリーダーセクション、組版改善（sanitize/index.css）。検証: `npm run build`/`cargo build`成功、フルスイート12ファイル29テスト全通過。

# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- 現行版のバグ修正・新機能追加 → `Unreleased Changes` に記録し、コミット後もリリースまで残す
- `Current Work` をコミットして `Recent Commits` へ圧縮するとき、コミット内容にユーザーに見える変更（バグ修正・新機能）が含まれていれば、同時に `Unreleased Changes` へも転記する（リリースノートの拾い漏れ防止。`VERIFY.md`「GitHub Release ノート確認」の再発防止①と連動）
- リリース → リリースノートへ転記してから、リリース済み項目を `Unreleased Changes` から削除
- その他の一時的な作業記録をコミット → 該当する記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
