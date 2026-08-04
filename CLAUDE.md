# CLAUDE.md

このファイルは実装の進行に合わせて随時更新する（SPEC.md §6.6）。

## 概要

Windows 11 デスクトップに常駐する半透明フローティングパネル型の RSS/Atom リーダー。
Tauri v2 (Rust) + React/TypeScript/Vite。詳細仕様は `SPEC.md`、実装計画は
`.claude/plans/fluffy-toasting-crayon.md`（このセッションで承認されたもの）を参照。

## ビルド手順

```sh
npm install
npm run tauri dev      # 開発起動（Vite + cargo run を同時に実行）
npm run build           # tsc の型検査 + vite build（フロントのみ）
cargo build              # src-tauri/ で Rust 側のみビルド
cargo test                # src-tauri/ で Rust 単体テスト
cargo clippy -- -D warnings  # src-tauri/ で lint
npm run tauri build      # インストーラ (MSI/NSIS) 生成
```

## ディレクトリ構成

- `src/` — React フロントエンド
- `src-tauri/` — Rust バックエンド（Tauri）
- `src-tauri/capabilities/` — 権限（capabilities）定義。必要最小限のみ許可

## アーキテクチャ概要（進行に応じて追記）

- フィード取得・パース・永続化はすべて Rust 側で行う（WebView の CORS 制約回避、SPEC §2.2）
- HTMLサニタイズはフロント側で DOMPurify（Rust の ammonia は不使用。描画層と同じ言語で完結させるため）
- 状態管理は Zustand
- フレームレス窓: `decorations: false` + `transparent: true` + CSS `rounded-2xl overflow-hidden`。
  Windows 11 では Mica、失敗時は Acrylic、それも失敗したら不透明単色（`src-tauri/src/window/vibrancy.rs`）。
  どちらかの適用に成功した場合のみ `DWMWA_WINDOW_CORNER_PREFERENCE` で HWND 自体も丸める
  （フレームレス窓は自動では丸くならないため）。適用結果はコマンド `get_vibrancy_mode` でフロントに渡す
- 外観設定（不透明度スライダー+スキン）: パネルの配色（`src/lib/skins.ts`のRGB）と「ウィンドウ全体の
  不透明度」は別レイヤーの別メカニズム。配色は`App.tsx`がCSSカスタムプロパティ（`--panel-rgb-light`/
  `-dark`）として渡し、`src/styles/index.css`の`.panel-bg`が`prefers-color-scheme`で出し分ける
  （常に不透明な単色）。不透明度は`src-tauri/src/window/opacity.rs`の`set_window_opacity`コマンドが
  `WS_EX_LAYERED`+`SetLayeredWindowAttributes`でHWNDそのものに掛ける、正真正銘のウィンドウレベルの
  透過（`vibrancy.rs`と同じ「生のWin32 APIを直接叩く」流儀）。CSS側の`background-color`にalphaを
  持たせるだけでは、Mica/Acrylicが敷いている固定のぼかしテクスチャに対して自分の色を混ぜるだけで、
  ウィンドウの背後にある本当のデスクトップ/他アプリには一切透けない（実機で「色が薄くなるだけで
  透けない」と指摘されて判明）。`vibrancy==="none"`のときは不透明度を強制的に100%にする
  （デスクトップ用の質感が無い状態でさらに薄くすると素っ気ない見た目になるため）。
  Windowsはウィンドウ最大化などのサイズ変更でレイヤードウィンドウのアルファを勝手にリセットすることが
  あるため、`opacity::LastOpacity`（`app.manage`）に最後に設定したバイト値を保持し、
  `lib.rs`の`window.on_window_event`で`WindowEvent::Resized`を受けるたびに`opacity::apply`で
  再適用している（実機で「最大化すると不透明度が100%に戻る」と指摘されて発覚）
- カードサイズ/間隔（`appearanceStore`の`cardSize`/`cardGap`）: サイズはcardモードのみ対象
  （`EntryRow.tsx`のサムネイル寸法・文字サイズ・行クランプ数を切替）。間隔は表示モード共通で
  `EntryList.tsx`の仮想化された行ラッパーに`paddingBottom`として付与する方式（`margin`だと
  `virtualizer.measureElement`の計測に含まれず行の位置がズレるため、必ず`padding`側に乗せる）
- ネイティブ`<select>`のドロップダウン一覧はページのTailwindクラスをほとんど無視してブラウザ既定
  （ライト）でレンダリングされるが、文字色だけはページから継承されるため、ダークモード時に
  「白背景+白文字」で読めなくなっていた（実機で指摘されて発覚）。`src/styles/index.css`の
  `html`に`color-scheme: light dark;`を付けるだけで解決する（ネイティブフォームコントロール全般に
  `prefers-color-scheme`を追従させる標準的な仕組み。option個別のスタイリングやJS判定は不要）。
  ただし`<select>`要素自体に`color-scheme`や固定の文字色を付けると、今度は閉じた状態の表示（選択中の値）
  がその固定色を使ってしまい、パネル背景に対して読めなくなる（実機で指摘され二度目の修正で判明）。
  閉じた状態の表示は`<select>`自身の`color`（テーマ追従のまま）、ポップアップ一覧の文字色は
  各`<option>`に直接`color`を指定する方式で分離する（Chromiumのネイティブポップアップは
  option単位のcolor/background-colorを尊重し、それは開いた一覧にしか影響せず閉じた表示には及ばない）
- ウィンドウの位置固定（`appearanceStore`の`positionLocked`）は、`data-tauri-drag-region`属性の
  有無を切り替えるだけ（Tauriにドラッグを個別に無効化するAPIは無い）。タイトルバーを隠した場合
  （`titleBarVisible=false`）のフォールバックとして`FilterBar.tsx`自体にも同じ属性を条件付きで
  付与し、位置固定オフかつタイトルバー非表示のときだけドラッグの入口を残す
- 常に最前面（`appearanceStore`の`alwaysOnTop`）は独自コマンド不要。Tauriコア標準の
  `getCurrentWindow().setAlwaysOnTop()`（`@tauri-apps/api/window`）をJS側から直接呼ぶだけで、
  `core:window:allow-set-always-on-top`のcapability追加のみで完結する
- ウィンドウの閉じる/最小化ボタンは自作タイトルバー（`src/components/TitleBar.tsx`）から
  `@tauri-apps/api/window` の `getCurrentWindow()` を呼ぶ。ドラッグ移動は `data-tauri-drag-region` 属性のみで実現
- DB: `rusqlite::Connection` 1本を `Mutex` で包んで `app.manage`（`src-tauri/src/db/mod.rs`）。
  マイグレーションは `PRAGMA user_version` ベースで `db/migrations.rs` に追記していく方式
- フィード取得〜保存の流れ: `fetch::discovery::discover`（サイトURLなら`<link rel=alternate>`探索）→
  `parse::feed::parse_feed`（feed-rsで統一パース、重複排除キーは自前実装 = `parse::dedupe`）→
  `db::upsert_entries`（`ON CONFLICT(feed_id, guid) DO UPDATE`で本文更新しつつ既読/スター状態は保持）
- Tauriの capabilities/permissions は `#[tauri::command]` で自作したコマンド（feeds/entries/opml）には不要
  （ACLはTauri組み込みプラグインのコマンド用。自作コマンドは `invoke_handler` 登録のみで呼び出せる）
- 自作コマンドのエラーは `error::AppError`（thiserror）を文字列にシリアライズしてフロントに渡す。
  `refresh_feed` はエラー時もコマンド自体は失敗させず、`feeds.last_error` に格納して返す
  （SPEC §7: フィード横の警告アイコン表示に使うため、エラーを握りつぶさない）
- 記事一覧（Phase 3）: `FilterBar`（フィード選択+表示モード切替+全既読+フィード管理ボタン）→
  `EntryList`（`@tanstack/react-virtual` で仮想スクロール、`entriesStore` の無限スクロール取得、
  `offset = entries.length` で次ページ取得）→ `EntryRow`（card/list/compactの3モードを1コンポーネントで
  出し分け）。フィード管理（`FeedManager`）は `uiStore` の `feedManagerOpen` で開閉するオーバーレイに格納し、
  オーバーレイを閉じるタイミングで `entriesStore.refresh()` を呼んで記事一覧を再同期する
  （フィード追加/削除がオーバーレイ内で起きるため）。既読/スターは楽観的ローカル更新
  （`feedsStore` の「操作後に毎回`refresh()`」規約とは意図的に異なる。行クリックのたびに
  無限スクロールで積み上げたページを`refresh()`で破棄するとスクロール位置が乱れるため）
- 自動更新・トレイ・通知・OPML（Phase 4）:
  - `refresh_feed_inner`（`commands/feeds.rs`）がフェッチ→パース→upsert→通知判定の唯一の実装で、
    手動更新コマンド `refresh_feed` とバックグラウンドスケジューラの両方から呼ばれる
    （`refresh_feed`のdocコメントに元から明記されていた設計）
  - `scheduler.rs`: 60秒ごとのtickで`interval_min`（未設定ならデフォルト30分）を過ぎたフィードを
    抽出し、`tokio::sync::Semaphore`で同時実行数を6に制限しつつ一括更新。手動更新は更新のたびに
    `"feeds-updated"`イベントを1回発火、バッチ更新（スケジューラ/トレイの「更新」/`refresh_all_feeds`）は
    バッチ全体の完了後に1回だけ発火（N件更新でN回イベントが飛ぶのを防ぐため）
  - `db::upsert_entries`は新規挿入されたエントリのみを`Vec<NewEntry>`で返すよう変更
    （`ON CONFLICT DO UPDATE`は常に1件変更と報告するため`changes()`では新規/更新を区別できず、
    upsert前に既存guid集合をSELECTしてから差分を取る方式にした）。これを使って
    `notify_enabled`なフィードに新着があった場合だけ`tauri_plugin_notification`で通知する
  - トレイ（`tray.rs`）: メニューは「表示/非表示」「更新」「終了」の3項目。「終了」は
    `MenuBuilder::quit_with_text`（muda組み込み項目）ではなく素の`text()`+`app.exit(0)`にしている
    （組み込みitemがネイティブ側で何をするか不明瞭で、閉じる=非表示化と衝突する可能性を避けるため）
  - 閉じるボタン→トレイに格納: `TitleBar.tsx`側は無改造。`lib.rs`の`.setup()`でメインウィンドウに
    `on_window_event`を登録し`WindowEvent::CloseRequested`を`api.prevent_close()`+`window.hide()`で
    横取りしている（×ボタンの`appWindow.close()`もこのイベント経路を通るため、フロント側の変更は不要）
  - OPMLインポート/エクスポートはファイルパスを扱う新コマンド`import_opml_from_path`/
    `export_opml_to_path`を追加（既存の文字列ベース`import_opml`/`export_opml`はそのまま）。
    ファイルピッカーは`tauri-plugin-dialog`のみ追加し、`tauri-plugin-fs`は追加していない
    （自作コマンド内の`std::fs`はTauriのACL対象外なので、パスさえダイアログで取得できれば
    スコープ付きのfsプラグイン権限は不要という判断）
- 既読表示と既読履歴（Phase 4後の追加要望）:
  - 記事一覧の既読状態は行全体のopacity減光ではなく、行末の✓チェックマーク（クリックで既読/未読の
    手動トグルも可能）で表現する（`EntryRow.tsx`）。ユーザーからの「減光は見づらい」というフィードバックで
    途中から変更した経緯があるため、既読/未読の見た目を再度変える際はこの理由を踏まえること
  - `read_history`テーブル（`db/migrations.rs` v2）は`entries`/`feeds`への外部キーを持たない
    非正規化スナップショット（`feed_title`, `entry_guid`, `title`, `link`, `read_at`）。
    SPEC通り既読記事は30日で自動削除される・フィードごと削除されることもあるため、「読んだという
    事実」だけは記事本体と切り離して残す設計。`mark_entry_read`（true化時）と`mark_all_read`から
    `(feed_title, entry_guid)`をユニークキーに`ON CONFLICT DO NOTHING`で書き込む
    （既読↔未読を繰り返しても最初に読んだ時刻を上書きしない）
  - 履歴の閲覧は`HistoryOverlay.tsx`（`FeedManagerOverlay`と同じ「絶対配置オーバーレイ」パターン）。
    `FilterBar`の履歴アイコンから開く（画面遷移の仕組みは後述の「画面遷移モデル」参照）
- デザイン洗練（`.claude/skills/redesign-existing-projects`スキル適用、外観設定完成後の追加要望）:
  - オーバーレイ3種（`FeedManagerOverlay`/`HistoryOverlay`/`SettingsOverlay`）の外枠は元々
    `bg-white dark:bg-neutral-900`という固定の不透明背景で、メインパネルの半透明スキン
    （`.panel-bg`）から浮いて見えていた。CSSカスタムプロパティ（`--panel-rgb-light`/`-dark`）は
    `App.tsx`ルートdivから子孫へ自然に継承されるため、3つとも`.panel-bg`クラスに差し替えるだけで
    メインパネルと同じ質感に統一できた（追加の配線不要）
  - 絵文字アイコン（🕘⚙🎨×🔔🔕⚠⟳☆★）はOS/フォント依存で見た目が揺れ、`TitleBar.tsx`の
    最小化/閉じるボタンだけが持っていた細いストロークのSVGスタイルと統一感が無かった。
    `src/components/icons.tsx`に同じ流儀（`viewBox 0 0 16 16`, `strokeWidth 1.25`,
    `stroke="currentColor"`）のアイコン一式を集約し、チェスや既読チェック（✓）以外の
    アイコン全てを置き換えた。新しいアイコンを追加する際もこのファイルに追加してスタイルを揃えること
  - `SettingsOverlay.tsx`の`ToggleRow`は「オン/オフ」のテキストラベルボタンから、トラック+つまみの
    スイッチ見た目（`translate-x`で位置を切り替え）に変更。クリックハンドラのロジックは変更なし
  - ホバー/押下のフィードバックが瞬間切り替えだった箇所（行・ボタン全般）に
    `transition-colors duration-150`と`active:bg-black/10 dark:active:bg-white/10`系のクラスを
    追加。仮想リスト内の行は`measureElement`の計測に影響するため`scale`変形は使わず、
    背景色の変化のみで押下フィードバックを表現している
- 常に最前面トグルで不透明度が100%に戻るバグの修正（実機報告）:
  - `getCurrentWindow().setAlwaysOnTop()`（Tauriコア標準）は内部でWin32の`SetWindowPos`
    (`HWND_TOPMOST`/`HWND_NOTOPMOST`)を叩いており、これが`WindowEvent::Resized`とは別種の
    DWM再合成を起こしてレイヤードウィンドウのアルファをリセットしてしまう
    （既存の「`WindowEvent::Resized`のたびに`opacity::apply`で再適用」ロジックはResizedしか
    見ていないため、このケースを取りこぼしていた）。`opacity.rs`に自作コマンド
    `set_always_on_top`を追加し、「Tauri標準のalways-on-top設定→直後に`LastOpacity`を
    再適用」を1コマンドにまとめて解決。もう`getCurrentWindow().setAlwaysOnTop()`をJSから
    直接呼ばないため、`core:window:allow-set-always-on-top`は`capabilities/default.json`
    から削除した
- フォント全種対応（`src-tauri/src/window/fonts.rs`の`list_system_fonts`コマンド）:
  - Win32 GDIの`EnumFontFamiliesExW`でインストール済みフォントファミリー名を列挙
    （`vibrancy.rs`/`opacity.rs`と同じ「生のWin32 APIを直接叩く」流儀）。縦書きバリアント
    （`@`始まりの名前、CJKフォントに付随することが多い）は除外。`windows-sys`のこのAPI周りの
    型（`LPARAM`は tupleではなく`isize`のtype alias、`DEFAULT_CHARSET`は既に`u8`など）は
    実際に`cargo build`のエラーを見ながら確定させた
  - これに伴い`appearanceStore`の`fontId`の意味が変わった: 5種類の固定IDの1つではなく、
    実際のシステムフォントのファミリー名そのもの（空文字列 = 既定/上書きなし）。
    マシンごとに変わる動的リストなので読み込み時のバリデーションは「文字列であること」のみ。
    固定リストだった`src/lib/fonts.ts`は削除済み。`SettingsOverlay.tsx`のフォント欄は
    数百件規模になり得るためボタングリッドではなく`<select>`（`FilterBar`のフィード選択と
    同じ「popup側は`text-black`固定、closed box側はテーマ追従の`color`のまま」という
    コントラスト対策を踏襲）
- 画面遷移モデルの刷新（バグ報告「設定パネルが画面に写っていなくてもクリックで展開できる」+
  要望「画面が切り替わるような動作にしたい」）:
  - 原因は`uiStore`が`feedManagerOpen`/`historyOpen`/`settingsOpen`という3つの独立した
    booleanを持っていたこと。3つとも独立にtrueにできるため、後から開いた方が`z-10`で上に
    重なるだけで先に開いた方は非表示のままDOM上に存在し続けていた。`uiStore`を
    `activeScreen: "timeline" | "feedManager" | "history" | "settings"`という単一state +
    `toggleScreen`/`goHome`に置き換えて構造的に解消（同じアイコンを押すと`"timeline"`
    （ホーム）に戻る、別のアイコンを押すと重ねずに直接差し替わる）
  - 3つのオーバーレイ（`FeedManagerOverlay`/`HistoryOverlay`/`SettingsOverlay`）は
    `App.tsx`で条件付きレンダリングするのをやめ、常時マウントしたまま自分自身で
    `activeScreen`を購読し、非アクティブなら`opacity-0 translate-x-3 pointer-events-none`
    + `inert`属性を付ける方式にした。これにより「アンマウント時の退出アニメーション」を
    別途組まずにCSS transitionだけでスライド+フェードの画面遷移が実現できる。`inert`は
    `pointer-events-none`が防げないキーボードtabフォーカス/スクリーンリーダーからの
    到達もまとめて防ぐ
  - `FeedManagerOverlay`が持っていた「閉じたら`entriesStore.refresh()`」の副作用は、
    ×ボタン以外の離脱経路（同アイコン再クリック、別画面への直接切り替え）でも起こる
    必要があるため、`useRef`で直前の`activeScreen === "feedManager"`を保持し
    `useEffect`で「アクティブ→非アクティブに変わった瞬間」を検出して発火する方式に変更
- スキンのアクセント色（所感「味気ない」「各スキンにコントラストを意識した配色を」への対応）:
  - `Skin`型（`lib/skins.ts`）に`accentLight`/`accentDark`を追加。`App.tsx`が
    `--panel-rgb-*`と同じ配線パターンで`--accent-rgb-light`/`-dark`をCSSカスタム
    プロパティとして渡し、`index.css`に`.panel-bg`と同じ`prefers-color-scheme`切り替え
    パターンで`.accent-text`/`.accent-border`/`.accent-bg`（ベタ塗り、トグルON用）/
    `.accent-bg-soft`（15%不透明度、選択中タブ用）を追加した。表示モードタブ・カード
    サイズ/間隔の選択中セグメント・スキン選択枠・トグルON状態・スター済みアイコンの色を
    グレー一辺倒からこのアクセント色に置き換え、スキンを変えるとこれらの「選択中」表現の
    色も連動して変わるようにした。モノクロスキンだけは意図的に無彩色のアクセント
    （色相を持たせない）。既読チェック（✓）の緑色は「既読=緑」という意味的な固定色として
    アクセント化の対象外にした（選択中を示すアクセントと役割が違うため）
- アイコンの再選定（「機能に対して連想しづらい」というフィードバック、`icons.tsx`）:
  - フィード管理用に使っていた`GearIcon`（汎用の歯車）は「設定全般」を指す記号として
    外観設定と意味が衝突し、「フィード管理」を連想させなかったため削除し、RSSの定番グリフ
    （左下起点の同心円弧2本+ドット）の`RssIcon`に差し替え
  - 外観設定用の`SlidersIcon`（汎用の環境設定っぽい3本スライダー）も同様の理由で削除し、
    パレット（輪郭+塗り分けの丸）を模した`PaletteIcon`に差し替え。ただし最初の実装は
    輪郭が丸すぎて顔（目+口）に見えてしまったため、輪郭を扁平にし親指穴を非対称の位置に
    ずらし、ドットを目のような対になる配置ではなく弧に沿って並べる形に修正した
    （16pxという小さいキャンバスでは対称な2点+曲線がすぐ「顔」に見えてしまう点に注意）
  - 履歴用の`ClockIcon`は単なる時計文字盤だと「スケジュール/時刻」と誤読されやすいため、
    反時計回りの矢印（多くのブラウザの履歴アイコンと同じ意匠）を追加した
  - `FeedManager.tsx`の削除ボタンは`CloseIcon`（×）の流用をやめ専用の`TrashIcon`
    （ゴミ箱）にした。×は「閉じる/取り消し」、ゴミ箱は「（永続的な）削除」という
    役割分担を明確にするため

## 依存関係の選定理由

- `tauri-plugin-tray` は Tauri v2 では存在せず、トレイ機能はコア (`tauri::tray`) に統合済みのため追加パッケージなしでコアAPIを使用
  （ただし`tauri`の`tray-icon` Cargo featureは既定で無効なので`features = ["tray-icon"]`を明示する必要がある）
- OPMLインポート/エクスポート用に`tauri-plugin-dialog`（ネイティブOpen/Saveダイアログ）を追加。
  `tauri-plugin-fs`は追加しない理由は上記アーキテクチャ概要を参照
- デスクトップ貼り付け（最背面）モードは Tauri コアの `set_always_on_bottom` + `set_skip_taskbar` を使用。Windows には真の「壁紙レイヤー」概念がなく、Progman/WorkerW ハックは非公式かつ脆いため不採用（ベストエフォートのz-order最背面化に留める）
- ウィンドウ位置・サイズの保存/復元は `tauri-plugin-window-state`（マルチモニタ補正込みで実装済みのため自前実装しない）

## 既知の落とし穴

- フレームレス窓は Windows 11 でも自動的に角丸にならない（システム標準タイトルバー窓のみ自動）。
  CSS の `border-radius` だけでは Mica/Acrylic の描画（DWM がHWND全体に敷く）が四隅で角ばって見えるため、
  `DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND)` の明示呼び出しが必須
- CSP の `style-src 'self'`（`unsafe-inline` なし）は `@tanstack/react-virtual` の行位置決めをブロックしない
  ことを実機（`npm run tauri dev` + WebView2）で確認済み。React は `style` prop を CSSOM プロパティ代入
  （`el.style.transform = ...`）で適用しており、`setAttribute("style", ...)` や HTML内の `style=""` 属性
  とは扱いが異なるため、CSPの`style-src`制限の対象外（ブラウザ実装・CSP仕様ともに一貫した挙動）。よって
  変更不要
- Tauriのコマンド引数名は「トップレベルの引数名」と「構造体としてまとめて渡す引数の中身」で
  camelCase変換の扱いが違う。`#[tauri::command] fn f(id: i64, is_read: bool)` のように**個別の
  スカラー引数**として並んでいる場合、JS側は自動camelCase変換に従い `invoke("f", { id, isRead })`
  （snake_caseで渡すと `missing required key` エラーになる）。一方 `fn f(filter: EntriesFilter)` の
  ように**単一の構造体引数**として渡す場合、その中身（`feed_id`, `unread_only` 等）は
  `EntriesFilter` に `#[serde(rename_all = "camelCase")]` が無い限り、Rust側フィールド名そのまま
  （snake_case）で渡す必要がある（camelCaseで送るとエラーにならず黙って`None`になるだけなので気づきにくい）。
  `mark_entry_read`/`toggle_star`/`mark_all_read` は前者、`list_entries`の`filter`は後者
- 仮想リスト（`EntryList.tsx`）の行はカード/リスト/コンパクトいずれも `<div role="button" tabIndex={0}>`
  にしている（`<button>` にしない）。スター切替ボタンを内側に置くため、外側も`<button>`にすると
  `<button>`の入れ子という不正なHTMLになり、Reactのhydrationエラー・クリック挙動の不安定化を招く
  （実機テストで発見）
- CSP の `img-src` は `'self' data:` だけでは記事サムネイル（ほぼ全て `https://` の外部URL）が
  読み込めない。SPEC §2.3のサムネイル表示をデフォルトで機能させるため `https: http:` を追加済み
  （「外部画像を読み込まない」トグルはPhase 5の設定画面でのオプトアウトとして別途実装する）
- `feed-rs` の既定 `id_generator` は `<guid>`/`<id>` が無い場合に自動でハッシュ値を補完してしまい、
  `Entry::id` が常に非空になる（＝spec通りの「guid→link→title+published」の段階的フォールバックを後段で
  再現できなくなる）。そのため `parse::feed::parse_feed` は `Builder::id_generator` を空文字列を返す関数で
  上書きし、guidが無いことを自前の `dedupe_key` が検出できるようにしている
- OPMLの `folder` はDBスキーマ上は単一文字列（階層なし）。ネストした `<outline>` フォルダがある入力は
  最も内側のフォルダ名だけを採用する（`opml::parse_opml` 参照）
- サムネイル抽出は `media:thumbnail` → 画像タイプの enclosure(`media:content`) → 本文内最初の `<img>` まで。
  `og:image`（追加リクエストが要る任意タイア）は未実装（設定画面ができるPhase 5以降でON/OFFトグルと合わせて追加）
- favicon（`feeds.icon_path`）はまだ未取得。列だけ用意してあり、値は常にNULL
- `TrayIconBuilder::build()`の戻り値（`TrayIcon`）を変数で受けずに`;`で捨てると、Windows版
  `tray-icon`crateの`Drop`実装が即座に`Shell_NotifyIcon(NIM_DELETE)`を呼んでしまい、アイコンが
  生成直後に消える。`app.manage(tray)`でアプリと同じ寿命を持たせる必要がある（実機で発見・修正済み）
- **【未解決の既知の問題】** 上記を修正した上でも、この開発環境ではトレイアイコンが常時表示・
  オーバーフローどちらにも視覚的に現れないことがある。`tray-icon`crateの`register_tray_icon`は
  `Shell_NotifyIcon(NIM_ADD)`が失敗しても`Explorer/taskbar may not be ready yet`という理由で
  静かに握りつぶす実装になっており（crateのソースコメントに明記）、こちらのコードにはエラーが
  一切出ない。`.setup()`内でのトレイ構築を`tauri::async_runtime::spawn`+500ms遅延に変更し
  レースコンディションの緩和を試みたが、再現性のある形で直ったかは確認できていない
  （デバッグセッション中の何十回ものプロセス強制終了・Explorer再起動でデスクトップの状態が
  荒れていた影響と、その後発生したこの端末上でのマウス/ウィンドウ入力全般の不安定化の影響が
  絡み合っており、切り分けきれなかった）。次回はクリーンな再起動後の環境で再検証すること
- Rustのコマンド引数として`AppHandle`を追加すると（例: `refresh_feed(app: AppHandle, ...)`）、
  Tauriが自動で注入してくれるため、フロント側のinvoke呼び出しに新しい引数は不要
  （既存の`{ id }`等の呼び出しはそのまま変更なしで動く）

## バージョン固定方針

各依存はセットアップ時点で `npm view <pkg> version` / `cargo search` で確認した最新安定版を
`package.json` / `Cargo.toml` に固定値（キャレット無し）で記載している。更新する際は同様に確認すること。
