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
<!-- ここから実際の記録 -->

> - **[opencode]** 全文抽出の失敗を減らすためJSON-LDフォールバックを追加。`fetch/article.rs`の`extract_article`で、DOMから本文コンテナを発見できないページ（JS描画・非セマンティックなマークアップ等）でも、`<script type="application/ld+json">`の`articleBody`（SEO目的で全文を埋め込むサイトが多い）から本文を取得できるようにした。`@graph`/配列などの構造を再帰的に探索し、最も長い`articleBody`を採用。HTML入りの`articleBody`はそのまま渡し（フロントのDOMPurifyが除去）、プレーンテキストは`\n`ごとに`<p>`化してエスケープ。DOM抽出が成功するページは従来どおり優先（画像・埋め込みを含む高品質なHTML）。検証: `cargo test`83件成功（JSON-LD単体テスト追加）、`cargo clippy`警告なし、ローカルサーバーの一時E2Eで「DOMコンテナなし＋JSON-LDのみのページ→全文取得成功」を実機確認後削除、フルスイート8ファイル22テスト全通過。

> - **[opencode]** ブックマークの「探す」由来の単体記事と、探すタブの記事の開き方を通常記事と同じ仕様に統一。①`EntryRow`の`handleOpen`で、保存記事（負のID）を無条件でシステムブラウザに飛ばしていた特別扱いを廃止し、通常記事と同じく`clickBehavior`に従うようにした（既定reader=アプリ内リーダーで開き、スニペットが短いので全文自動取得が走って本文に差し替わる。オプションはbrowser設定かリーダー内「ブラウザで開く」で既定ブラウザを開ける）。負IDの`markRead`はスキップ（読み状態が無いため。Rust側もno-op）。②`DiscoverOverlay`: 展開カードで「この記事の全文を読む」（アプリ内全文取得）をプライマリ動作にし、「元記事を開く」を「ブラウザで開く」に改名してオプションに。全文パネルのヘッダーにも常時「ブラウザで開く」ボタンを追加（従来はエラー時のみ）。検証: `npm run build`成功、ローカルHTTPサーバーの一時E2Eで「保存記事クリック→アプリ内リーダーが開き自動全文取得」を実機確認後削除、フルスイート8ファイル22テスト全通過。

> - **[opencode]** リーダーの「全文を取得して読む」ボタンを廃止し、記事を開いたら自動で全文を取得するようにした。`ReaderOverlay`で要約のみ配信の記事（本文400字未満のヒューリスティック）を開くと、フィード内容を即表示したまま裏で`fetch_article_full_text`を自動実行し、取得完了で差し替える（reader-firstは従来どおり）。失敗時は自動リトライループさせず「再取得」「ブラウザで開く」を表示（`fetchError`ガード）。ボタン消滅。検証: `npm run build`成功、ローカルHTTPサーバーを立てた一時E2Eで「要約のみフィード→記事を開く→自動で全文取得・差し替え・ボタン非表示」を実機確認後削除、フルスイート8ファイル22テスト全通過。

> - **[opencode]** 記事サムネを本文取得の仕組みで補完。RSSがサムネを提供しないサイトで、これまでfavicon/画像なしアイコンにフォールバックしていたのを、記事ページの`og:image`→`twitter:image`→`link[rel=image_src]`→最初の実画像の順で取得して表示するようにした。バックエンド: `fetch/article.rs`に`extract_article_image`(上記の優先順位で抽出、lazy-placeholder/data:はスキップ、相対URL解決)、`commands/article.rs`に`fetch_article_image`コマンド追加、`lib.rs`登録。フロント: `src/lib/articleThumb.ts`にURL単位のキャッシュ+in-flight重複防止を実装し、`EntryRow`のカードモードで`thumbnail_url`が無い行に限り、`IntersectionObserver`で可視になった時のみ遅延取得(仮想化のoverscan分を無駄にfetchしない)。表示は`entry.thumbnail_url || fetchedThumb`に統一し、取得失敗時は従来どおりfaviconへ。`blockImages`時は取得しない。検証: `cargo test`82件成功(og:image/最初の実画像の単体テスト追加)、`cargo clippy`警告なし、`npm run build`成功、実URLでコマンド確認(publickey1/gihyo/zennとも画像URL返却)、E2Eフルスイート8ファイル22テスト全通過。

> - **[opencode]** 全文抽出のノイズ除去を強化＋ブクマが開けないバグを修正。①SNS/埋め込み/関連記事の除去: はてなブックマーク・note埋め込み・SNSアイコン・関連記事などの本文外要素を隠すため、`fetch/article.rs`の`NOISE_CLASS_MARKERS`/`NOISE_ID_MARKERS`を拡張(hatena/bookmark-button/note-embed/sns/twitter/facebook/related/recommend/entry-related/next-post/pager等)。単体テスト`strips_sns_embed_and_related_noise`追加。動画iframeは従来どおり許可リストで保持。②ブクマが開けないバグ: 保存記事(discoverで保存した負IDエントリ)の合成SQL `SAVED_ARTICLE_ENTRY_COLUMNS`で`link`列の位置に`NULL`が入っていた(列対応ズレ。`s.url`がauthor位置へ)ため、`handleOpen`の`entry.link`ガードで何もせず「開けない」。`s.url`をlink列へ正しく配置し修正。E2Eで`list_entries`の保存記事linkが非NULLになることを確認し、bookmark-store.spec.jsに回帰ガード(`savedEntryHasLink`)を追加。検証: `cargo test`81件成功、`cargo clippy`警告なし、E2Eフルスイート8ファイル22テスト全通過。

> - **[opencode]** 全文取得まわり3点を改善。①動画埋め込み対応: 抽出(`fetch/article.rs`)で`iframe`を一律除去せず、YouTube/Vimeo/Bilibili/ニコニコ等の既知プレイヤーに限り保持(それ以外のiframeは従来どおり除去)。フロントは共有サニタイズ`src/lib/sanitize.ts`を新設し、DOMPurifyでvideo/iframe/sourceを許可+afterSanitizeAttributesフックで非動画iframeを除去(セキュリティ維持)。CSPを`frame-src 'none'`→既知プレイヤー許可、`media-src`追加。`.reader-content iframe/video`のCSS追加(16:9, max-width100%)。②探すタブから全文読み: DiscoverOverlayのカードに「この記事の全文を読む」ボタンを追加し、fetch→その場で全文パネル表示(`panel-bg`のabsolute z-20、戻るボタン・リンクはopenUrl)。③一番上の画像しか出ない問題: lazy-load画像(`src`がplaceholder/data:のとき`data-src`等へフォールバック)+`srcset`解決を実装(これまで下の画像が透過プレースホルダのまま見えなかった)。検証: `cargo test`80件成功(動画iframe保持・lazy img・srcsetの単体テスト追加)、`cargo clippy`警告なし、`npm run build`成功、E2Eフルスイート8ファイル22テスト全通過(CSP変更でも回帰なし)、live抽出も従来どおり成功。→ 追補: ①SNS埋め込み(X/Twitter・Facebook・Instagram等)は動画プレイヤーの許可リスト外のため、抽出・DOMPurifyフックの両方で既に除外(動画対応後も混入しない)。②「リーダー表示を先に、その上で全文取得」: DiscoverOverlayの「全文を読む」を、取得中は空欄ではなく**先にタイトル・提供元・スニペットで読みやすいリーダー表示**を出し、取得完了で全文に差し替えるよう変更(reader状態にsnippet/domainを保持)。ビルド成功、Discover関連E2E(ui-fixes/bookmark-store)通過。

> - **[opencode]** 修正予定9件＋追加予定2件を一括実装。修正: ①ブクマ絞り込みを別タブ移動時に解除(FilterBarのNAV_ICONSで`setStarredOnly(false)`)、②探すの「元記事を開く」を既読履歴へ記録(`record_external_read`新コマンド+DiscoverOverlayでinvoke)、③ジャンル追加枠をdashed「＋」タグ入力へ変更しフィードURL入力と区別、④通知トグルを「通知ON/OFF」ラベル付きピルへ変更、⑤探すカードのタイトルをMarqueeTitle化、⑥リーダーのスクロール位置を記事切替時にリセット(`key`再マウント+useLayoutEffect scrollTo)、⑦「RSSなし」誤判定を検索パイプラインのサイトルートフォールバックで修正(`feed_url`を返すよう変更し登録時も実際のフィードURLを使用)。追加: ⑧探す検索窓に✕全消しボタン、⑨要約のみ配信サイトの全文表示(fetch/article.rsにscraperベースの本文抽出+`fetch_article_full_text`コマンド+リーダーに「全文を取得して読む」ボタン。実サイト3件で抽出成功確認)。検証: `cargo test`78件成功、`cargo clippy`警告なし、`npm run build`成功、E2Eフルスイート8ファイル19テスト全部通過。E2E補助で`tauri.conf.json`に`withGlobalTauri: true`を追加(テストから`window.__TAURI__.core.invoke`でコマンド直接呼び出し用。低リスク)。`search-stacking-diagnose.spec.js`の既存フレーク(stale element+空DBで`.entry-list-scroll`がnull)をexecuteベース再取得とnullガードで修正。恒久回帰スペック`ui-fixes.spec.js`を新設(ブクマ解除・✕ボタン・フィード管理UI)。




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

## 91c6dfa — 2026-08-14
**環境:** opencode

UIの見た目規約を`context/UI_CONVENTIONS.md`として新設（配色システム・意味色・レシピ・実装手順・決定済み判断・共通化候補）。AGENTS.mdのContextにルーティング追加、共有`IMPLEMENTATION.md`(#2 Inspect)に「UI変更時は`../UI_CONVENTIONS.md`を参照し既存色システム/共通クラスを流用、直書き・独自装飾をしない」を追記（ジャンクション経由で共有本体へ反映）。
グローバル層は独立文書/skill化せず、共有ワークフローの一文として埋め込む形にし、共通化候補の昇格は2つ目のプロジェクトでの実証後とする。

## 4df6e05 — 2026-08-14
**環境:** opencode

開発基盤の改善チェック候補A〜Dを適用。A: `VERIFY.md`へ「GitHub Release 実行」プリセットを追加（v0.2.7でタグが古いコミットに張られた事故の再発防止）。B: 恒久回帰テストを`bookmark-store.spec.js`へ改名、診断用`zz-temp-`スペックを削除し「使い捨て=zz-temp名・残す回帰テストは恒久名」をE2Eプリセットへ追記。C: 共有`IMPLEMENTATION.md`(#1 Understand)へ「曖昧なUI要望はHumanへ確認してから実装」を追記。D: `effective_data_dir`を`#[cfg(debug_assertions)]`限定にしreleaseビルドの`dead_code`警告を解消。
`cargo check --release`で警告なし、E2Eフルスイート7件通過。

## 191d72c — 2026-08-14
**環境:** opencode

v0.2.7としてリリース（`package.json`/`tauri.conf.json`/`Cargo.toml`のバージョン更新、ロックファイル同期）。
ポータブル版をビルドし、GitHub Releaseに`gyroscope-portable-v0.2.7.zip`と単体`gyroscope.exe`を添付して公開。Discord通知は`discord-release-notify.yml`ワークフローが自動投稿（成功確認済み）。
`gh release create`がリモートデフォルトブランチ先端(87a0a67)へタグを張ってしまった不具合を検知し、タグを実際のリリースコミット(191d72c)へ付け直した（mainもpush済み）。添付物は新コードでビルド済みだったため成果物は当初から正しい。

> - **[opencode]** 「サイトを探す」のUI積み重ねで生じた不具合を修正。全件マッチして機能していなかった「記事保存可」フィルターは、全候補が記事保存可能なため選択肢ごと削除（すべて/RSS登録可/RSSなしの3択へ）。`hidden`で隠されたまま残っていた死にセクション（並び順・登録済み非表示・表示サイズ）を削除し、登録済み非表示は固定動作として維持。`npm run build` 成功、実機E2E（DOMプローブ）で死にセクション消滅と候補状態3択化を確認。

## 6805aba — 2026-08-14
**環境:** Claude Code / Sonnet

改善ループAを実施：UNKNOWN_DOMAIN.mdの「Observability」に、外部サイト/APIの挙動は実装前にcurl等で直接確認する旨を追記し、正本`human-ai-foundation`側にも手動で反映。
将来ニーズとして「workflowsの自動反映の仕組み」「開発版起動時に自分用TLのDBが壊れる件」を`IDEAS_AND_HYPOTHESES.md`へ記録。

## 189a55c — 2026-08-14
**環境:** Claude Code / Sonnet

WORKLOG振り返りから改善ループを実施。GUI変更が毎回Human確認待ちになる件を`scripts/run-e2e.mjs`（driver残留プロセスを実行前後で自動終了）で解消し、`VERIFY.md`のE2Eプリセットを既定の検証手段として格上げ。
実機で確認（成功/失敗どちらのケースもdriverプロセスが残らないこと、失敗時の終了コードが正しく伝播することを確認済み）。


# Rotation

- `Current Work` が肥大化 → まずHumanへコミットを提案
- まだコミットしない → 古い部分を `Uncommitted Archive` へ圧縮
- 現行版のバグ修正・新機能追加 → `Unreleased Changes` に記録し、コミット後もリリースまで残す
- リリース → リリースノートへ転記してから、リリース済み項目を `Unreleased Changes` から削除
- その他の一時的な作業記録をコミット → 該当する記録を `Recent Commits` へ圧縮
- `Recent Commits` → 最大5件
- それ以前 → Git / GitHubを参照
