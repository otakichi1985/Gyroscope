# VERIFY.md

このプロジェクトで利用可能な検証・観測手段。
実装・修正時は、対象に適した方法をここから選ぶ。

推測による修正より、直接観測できる方法を優先する。


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


## GUI / Tauriウィンドウ操作の自動検証（調査結果・2026-08-13時点）

実際のTauriウィンドウを開いてクリック・スクロール等を自動操作する手段として
Playwright / WebdriverIO / tauri-driver / WebView2 DevToolsを調査した。
**いずれも現時点ではインストール・追加セットアップ未実施で、即実行はできない。**
以下は次に導入する場合の前提情報であり、まだプリセットとして実行可能ではない。

**環境:**  
Windows 11、WebView2 Runtime 151.0.4129.78（Edge同梱・evergreen）、
Node v24.18.1 / npm 11.16.0、Rust 1.97.1 / cargo 1.97.1。

| ツール | 現状 | 追加セットアップ |
|---|---|---|
| Playwright | `App/package.json`に依存なし。ローカル・グローバルどちらにも未インストール。`%LOCALAPPDATA%\ms-playwright`にChromiumキャッシュがあるが本プロジェクトとは無関係（他用途で導入済みの可能性）。 | 通常のブラウザ自動化としては`npm install -D playwright`が必要。Tauriウィンドウ（WebView2）そのものを操作したい場合はブラウザ起動ではなく、`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`を設定してアプリを起動し、`chromium.connectOverCDP()`でCDP接続する方式になる。 |
| WebdriverIO | 未インストール（`App/package.json`に依存なし、node_modulesにも実体なし）。 | `npm install -D webdriverio` に加え、tauri-driverとmsedgedriverの両方が前提。 |
| tauri-driver | 未インストール。`cargo install --list`に存在せず、PATH上にも見つからない。 | `cargo install tauri-driver`。加えてWindowsではMicrosoft Edge WebDriver（msedgedriver.exe）をPATHに配置する必要があるが、これも未導入（`where msedgedriver`はヒットなし）。msedgedriverのバージョンは導入済みEdge/WebView2の151系に合わせる必要がある。 |
| WebView2 DevTools | 追加インストール不要。`npm run tauri dev`（デバッグビルド）ではTauriのデフォルト動作としてWebView2のDevToolsが有効で、ウィンドウ上で右クリック→検証 または F12で開ける。リリースビルドでは`src-tauri/Cargo.toml`のtauriに`devtools` featureを追加しない限り無効（現状のCargo.tomlには未追加）。 | 通常のdev検証は追加設定不要。自動操作の踏み台としてCDP経由で使う場合は上記Playwright欄と同じ`--remote-debugging-port`設定が必要。 |

**現時点の結論:**  
- 最短で自動GUI操作を試すなら「WebView2のリモートデバッグポート + Playwright(`connectOverCDP`)」の組み合わせが、tauri-driver/msedgedriverのインストールを待たずに検証できる可能性が高い。
- WebdriverIO経由のE2E（`tauri-driver`公式手順）はmsedgedriverの追加配置が必須で、セットアップ工数が最も大きい。
- 実際に導入する際は、Humanの許可を得たうえで`npm install`やcargo installを実行し、成功したらこのセクションを実行可能なプリセット（対象/用途/実行/確認/限界の形式）に書き換える。


### ケーススタディ：浮遊スキンの検索欄フォーカス調査で実際に突き当たった壁（2026-08-13）

「浮遊スキンで検索アイコンをクリックしたときにしか検索欄へ入力できない」バグの原因調査で、
上記ツール未導入のまま次の2経路を試し、どちらも原因の確定には届かなかった。

**試した経路1: 実機のTauriウィンドウをcomputer-use操作で調べる**  
`npm run tauri dev`でRustをビルドし実ウィンドウを起動、`request_access`で操作許可を要求したが、
`Gyroscope`はスタートメニュー未登録アプリのため候補に出ず、代替の確認手段（Git Bashへのアクセス要求）もユーザー不在のため`user_denied`で失敗。
実機のWebView2 DevTools（F12 / 右クリック検証）を人手を介さず開いて調べる手段が、現状ない。

**試した経路2: プレーンブラウザに疑似Tauri環境を注入してコードを直接検証**  
`window.__TAURI_INTERNALS__`を最小スタブしたデバッグ用HTMLをVite開発サーバー上に一時作成し、
Claude Browserペイン（Chromium、CDP経由）でカーディナリティ（浮遊）スキンへ切り替え、
検索アイコンのクリック〜`FilterBar.tsx`内`requestAnimationFrame(() => searchInputRef.current?.focus())`の発火を
DevTools相当（`read_console_messages`、`javascript_tool`でのDOM/フォーカス状態確認）で追跡した。
結果、`document.visibilityState`が`"hidden"`（Browserペインが表示されていないため）で、
スケジュールした`requestAnimationFrame`が一切発火しないことを確認した。
Chromiumは非表示タブの`requestAnimationFrame`を停止する仕様があり、これは検証環境固有の制約であって、
実機で本当に同じタイミング問題が起きているかどうかはこの経路だけでは判断できない。
（`FilterBar.tsx`の`toggleSearch`が`rAF`一回でフォーカスを当てている点、
および浮遊スキン専用の`useSyncFloatingMode`がスキン変更時にネイティブ側の背景合成を切り替える点は、
フォーカスが実機でも同様に阻害されうる有力な候補として残っている。）

**結論:** DevTools相当の手段（コンソール／DOM検査）だけでは、実際のTauriウィンドウ上での
再現・原因確定に至らなかった。原因候補（`rAF`一回だけのフォーカス、浮遊モード切り替え時の
ネイティブウィンドウ再合成とのタイミング競合）はコードから絞り込めているが、確定にはどちらかが必要:
- 実機のWebView2 DevTools（F12）を人の手で開いて再現を見る（Human確認）
- または、下記のいずれかを導入して自動化する
  - **tauri-driver + WebdriverIO**: 実ウィンドウのフォーカス/イベントを実機のまま自動操作・検証できる。今回のような「ウィンドウの表示状態やOSフォーカスに依存するタイミング問題」を再現するには最も確実。
  - **Playwright（WebView2へCDP接続）**: セットアップは軽いが、`connectOverCDP`接続自体が実ウィンドウの可視性/フォーカス状態にどこまで影響するかは未検証。

→ 上記の理由により、tauri-driver（+ WebdriverIO）または Playwright の少なくとも一方を、
Humanの許可を得たうえで導入することを改めて提案する。

**追記（2026-08-13、続報）:** 上記提案を受けてHumanの許可のもとWebdriverIO + `@wdio/tauri-service`を
実際に導入した。下の「Tauriウィンドウ実機E2E（WebdriverIO + tauri-driver）」プリセットとして
確立済みで、このケーススタディが指していた「実機のフォーカス/クリックのタイミングを観測する手段」は
now available。この経路で同じ検索欄バグを実機上で再現し、原因の当たりまで付けられた
（詳細はプリセット内の「わかったこと」を参照）。


## Tauriウィンドウ実機E2E（WebdriverIO + tauri-driver）

**対象:** 実際のTauriウィンドウ（WebView2）上でのクリック・フォーカス・入力・OS/ウィンドウの
表示状態に依存する挙動。プレーンブラウザのDevTools相当の観測では再現できない
（`requestAnimationFrame`の停止など、非表示タブ特有の制約を受ける）類のバグに使う。

**用途:** フォーカス漏れ、クリックが意図しない要素に吸われる、ウィンドウの表示/フォーカス状態に
依存するタイミング問題など、実機でしか確定できない不具合の再現・観測。
大規模なE2Eスイートの整備が目的ではなく、個別の不具合を実機上で再現・観測するための最小手段。

**セットアップ済みの内容:**
- devDependencies に `@wdio/cli` `@wdio/tauri-service` `@wdio/local-runner`
  `@wdio/mocha-framework` `@wdio/spec-reporter` を追加済み（`App/package.json`）。
- `App/e2e/wdio.conf.js` … `driverProvider: 'external'`（tauri-driver + msedgedriver）を明示指定。
  デフォルトの`'embedded'`プロバイダは`tauri-plugin-wdio-webdriver`をCargo.toml・Rustエントリポイントに
  追加する必要がある（本番コードへの依存追加）ため、あえて避けた。`external`ならRust側は無変更。
  `autoInstallTauriDriver: true` / `autoDownloadEdgeDriver: true` により、tauri-driver（cargo install）と
  msedgedriverの取得・バージョン整合はサービスが自動で行う。
- `App/e2e/specs/` … 観測用スペック一式（`debug-probe.spec.js`、`search-focus.spec.js`、
  `search-focus-geometry.spec.js`）。アサーションで合否を決め切るテストではなく、
  `console.log`で状態を記録する観測目的のスペックが中心。

**実行:**  
1. `App/` で Vite 開発サーバーを起動しておく（`npm run dev`、または既存のプレビュー機構）。
   デバッグビルド（`target/debug/`）は `devUrl: http://localhost:1420` を読みに行くため必須。
   Viteを起動せずに実行すると `ERR_CONNECTION_REFUSED` の白画面のまま全テストが失敗する
   （実際に一度踏んだ失敗）。
2. `App/src-tauri/target/debug/gyroscope.exe` が存在することを確認する
   （なければ `npm run tauri dev` を一度実行してビルドさせる）。
3. `App/` で `npm run test:e2e -- --spec e2e/specs/<対象スペック>.spec.js`  
   （`--spec`省略で`e2e/specs/**/*.spec.js`全件）

**確認:**  
`X passing` / `X failing` がコンソールに出る。観測目的のスペックは、アサーション失敗ではなく
`console.log`で出力される状態（`activeIsSearchInput`、要素の矩形、`elementFromPoint`の結果など）を読んで判断する。

**限界:**  
- 初回はtauri-driverのcargo installとmsedgedriverの取得が走るため数分かかる。
- テスト対象はデバッグビルド固定（`target/debug/gyroscope.exe`）。リリースビルドを検証したい場合は
  `wdio.conf.js`の`appBinaryPath`/`application`を`target/release/...`に変更し、
  事前に`npm run tauri build`（または`cargo build --release`）が必要。
- `@wdio/tauri-plugin`（Rust側プラグイン）を入れていないため、`browser.tauri.execute()`などの
  Tauriコマンド実行・モックAPIは使えない。今回のようなDOM/フォーカス/クリック位置の観測だけなら
  この範囲で十分だった。
- 実行のたびに`tauri-driver.exe`・`msedgedriver.exe`が新しいポートで起動し、テストランナー終了時に
  必ずしも全て終了しない（実際に複数プロセスが残留した）。長時間放置せず、
  `Get-Process tauri-driver,msedgedriver | Stop-Process -Force`などで随時後片付けする。

**わかったこと（2026-08-13、検索欄バグの実機観測結果と修正 — 修正済み）:**  
カーディナリティ（浮遊）スキンで検索アイコンをクリックした直後は、`document.activeElement`が
正しく検索`<input>`になっており（フォーカスは成功）、直後の`keys()`入力も実際に値へ反映される。
問題が起きるのは**その後、検索欄をもう一度クリックし直したとき**: WebDriverが
`element click intercepted`エラーを返し、クリックは`<input>`ではなく背後の
`.entry-list-scroll`（記事リスト）が受け取っていた。`getBoundingClientRect()`で両要素の矩形を
実測すると、検索`<input>`の下端よりも`.entry-list-scroll`の上端の方が上にあり、実際に約14〜19px
重なっていた（既定サイズ420x680で再計測した際は約19px）。`elementFromPoint`も`.entry-list-scroll`を
返す。アイコン経由の1回目のクリックは`.focus()`をプログラムから直接呼んでいるためこの重なりの
影響を受けず、2回目以降の「検索欄を直接クリックし直す」操作だけがこの重なりに阻まれていた。

**原因（実測で特定）:** `App/src/styles/index.css`の`.skin-cardinality > *`と
`.skin-ordinary > :not(.ordinary-hud)`が、ルート直下の**全ての**直接の子要素へ無差別に
`position: relative; z-index: 1;`を与えていた。本来この`z-index:1`が必要なのはタイトルバー・
フィルターバー・ツールバーの「ガラス板」チラムだけ（別の専用ルールで既にカバー済み）だが、
このブランケットルールのせいで、記事リスト全体を包むラッパー（`App/src/App.tsx`の
`<FilterBar/>`の次の兄弟div）まで`z-index:1`になり、フィルターバーと同じ順位で並んでいた。
同順位のタイブレークはDOM順で決まり、このラッパーはフィルターバーより後にあるため勝ち、
かつ`.entry-list-scroll`はツールバーの下へ滑り込ませる意図的な`-64px`のsink（`.skin-floating
.entry-list-scroll`のSINK_PXコメント参照）を持つため、その一部がフィルターバー内の検索欄の
上に被さっていた。`document.elementsFromPoint`でも実際に記事リストが検索欄より前面にあることを
確認した。

**修正:** `App/src/App.tsx`の該当ラッパーに`app-content`クラスを追加し、上記2つのCSSルールを
`:not(.app-content)`で除外した（`App/src/styles/index.css`）。フィルターバー・ツールバー自身の
`z-index:1`（トースト埋没修正の対象）はそのまま維持されるため、無関係の副作用はない。

**修正後の実機E2E確認結果（すべて成功、`App/e2e/specs/`）:**  
- 検索アイコンから正常に展開できる
- 展開直後に入力できる（"test"）
- 検索欄を再クリックできる（`element click intercepted`が発生しなくなった）
- 再クリック後も入力できる（"testmore"）
- クリックが`.entry-list-scroll`に奪われない（`elementFromPoint`・`elementsFromPoint`とも検索欄自身を返す）
- カーディナリティの「更新はありません」トーストが記事リストに埋もれない（既存の別修正が健在）
- オーディナリースキンでも同じ重なりが再発していない
- モノクロ（非浮遊）スキンは元々このCSSの対象外で無影響
- `npm run build`・`cargo test`（53件成功）とも問題なし


<!-- ここから実際の検証プリセット -->




# Human Verification

AIだけでは判断できない場合に使用する。

Humanへ確認を依頼する前に、利用可能な機械的検証を行う。
依頼時は「何を確認するか」「どうなれば成功か」を簡潔に示す。

- GUI変更では、対象画面を実機で開き、変更箇所だけでなく周辺の重なり、読めること、クリック・スクロール・リサイズを確認する。
- スキンや不透明度を扱う変更では、関係するライト・ダーク・浮遊系表示とWindows上の背面の見え方を確認する。
- BOOTHなど外部サイト依存の変更では、実際の対象URLで取得でき、失敗時に理由が画面へ出ることを確認する。


<!-- 必要ならプロジェクト固有のHuman確認方法を記録 -->

