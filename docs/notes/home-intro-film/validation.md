# ホーム紹介動画の実装・検証

2026-10-05。origin/main `3a2cd947` から作成した `codex/feat-home-intro-film`、PR #919へのレビュー修正を含む記録。
仕様: `specs/feat-home-intro-film.md`、指示書: `docs/codex-prompts/feat-home-intro-film.md`。文書の改訂なし。

## 実装とレビューへの対応

- 指定素材をpublic/videosへコピー。元のdocs素材はmainにあり、変更・移動・削除なし。1080p版とsourceの未追跡ファイルは対象外。
- 動画: 1,194,970 bytes、H.264、1280×720、31.5秒、音声ストリームなし。ポスター: 19,148 bytes。元ファイルとバイト一致、moovがmdatより先のfaststartを保持。レビュー修正では素材を変更していない。
- SSRはwidth=1280 / height=720 / poster / preload=noneのvideoを描き、src・source要素は出さない。aspect-video / object-containで映像を切り抜かない。fetchpriority、lazy、動画preloadリンクは追加なし。
- 自動取得はwindow.load後（completeなら直後）、701px以上、Reduce Motionオフのみ。条件が変われば停止・src解除・loadでメディアを解放。muted / playsInline / autoplay / loop、一時停止・再生ボタンは44px以上、aria-pressedで状態を表示。
- Ownerの追加レビューに従い、デスクトップを拡大前の配置に戻した。見出しは72〜96px、最終spanだけ改行し2行。ヒーローは最小670px、上120px・下76px。動画は右側の独立した枠、幅clamp(390px,32vw,460px)。390pxでも本文と重ならないよう説明文の右側に32pxの余裕を確保し、枠の位置を見出しの1行目より下へ調整。1024px未満の配置は維持。
- 「拡大して見る」はスマホとReduce Motionでも表示。JSがないSSRでは無効、hydration後に有効。native dialogのshowModalで背景をinertにし、閉じるボタンへフォーカス。閉じるボタンまたはEsc由来のcancelでcloseし、実際に開いたボタンへfocus({ preventScroll: true })でフォーカスを戻す。
- 動画面にaria-label「紹介動画を拡大して見る」のnative buttonを重ね、マウスとキーボードの両方で開けるようにした。中央の四隅の矢印はhover／focus-visible時だけ表示。一時停止ボタンは別の兄弟要素として上の層に置き、独立した操作を維持。枠のポスター表示中・エラー時も拡大できる。
- ダイアログ動画は開いたときだけ描画・src設定。controls / muted / playsInline / autoplay、ループなし。最大1100pxのダイアログ内で16:9表示。閉じると動画を取り除き、停止・src解除・loadでメディアを解放。
- 拡大中は背面の動画を停止。閉じると、拡大前に再生中で今も自動再生の条件を満たす場合だけ再開。利用者が先に停止していた場合は停止を維持。
- インライン・拡大表示それぞれの読み込みエラーは、同寸法のポスター画像へ復帰。閉じる操作は残る。インラインの自動再生拒否は再生ボタンを残す。
- ダイアログ名はaria-labelledbyで提供し、既存ページのh1/h2階層は変更しない。新しい計測なし、cta_idは27→27。紹介枠の置換・importとヒーローのoverflow-clipへの変更を除きHomePageのソースは同一。

### Ownerが指定した仕様の読み替え

レビューの指示に従い「700px以下とReduce Motionでは取得しない」は「自動では取得しない。利用者が拡大ボタンを押したときだけ取得」に読み替えた。ダイアログ内の再生は明示操作後のみ。仕様書自体は編集していない。

## 自動検証

- レビューの追加要件のテストを先に追加し、未実装状態で失敗を確認してから修正。
- HomeIntroFilmの24件: SSR、390/700px、701/1440px、Reduce Motion、load待ち、停止／再生、条件変更、エラー、自動再生拒否、解除、明示拡大での取得、controls/muted、閉じる・cancel・フォーカス復帰、背面停止と再開、先に停止していた状態の維持、ダイアログ内のポスター復帰。追加レビューでは動画面からの拡大と元の動画面へのフォーカス復帰（390px・1440px・Reduce Motion）、一時停止ボタンの独立操作を4件追加。
- HomePageの既存25件を含むHomePageとの関連テスト49件、TouchlineMotionを含む65件成功。既存のポスター期待値1件のみ初回実装で更新し、横スクロール修正ではヒーローのoverflow-clip／overflow-hiddenなしを既存テストに追加。両方の拡大ボタンへのフォーカス復帰がpreventScroll:trueを渡すテストを2件追加。修正前に3件の失敗を確認。
- pnpm lint: 成功。
- pnpm typecheck（tsc --noEmit）: 成功。
- pnpm test: 338ファイル・2,321件成功。
- pnpm build: コンパイル成功（5.2秒）。秘密ファイルを読まず、明示的なダミー設定とローカルDB URLで実行。ページデータ収集でECONNREFUSED 127.0.0.1:54321、/c/[competition]/[season]/standingsで停止。ビルド全体は未完了。
- cta_id集合: 27→27、差なし。仕様書・指示書・元素材の一致確認、git diff --check成功。新規依存なし。

## ローカル実ブラウザでの確認

公開中トップのHTMLの紹介枠だけ、実装したHomeIntroFilmのSSRと同じReactコンポーネントのhydrationに置き換えたローカルページを使用。実装のTailwind CSSと実際の動画・ポスターを使用。データ取得・LLM呼び出しなし、既存Viteのesbuildで検証用バンドルを作成。トップ全体のNext.js hydrationやログインのE2Eではない。Vercelを開いていない。

| 幅・状態 | 確認結果 |
|---|---|
| 1440×900 | 映像460×258.75px、figure下端643.9px、h1=91.44px。見出し・CTA・映像が1画面目に収まり、横はみ出しなし |
| 1024×900 | 映像390×219.375px、figure下端596.1px、h1=72px。2つのCTAの下端はともに532.1px、重なり・横はみ出しなし |
| 390×844 | 映像358×201.375px、figure下端754px。srcなし・mp4通信0件、拡大ボタンは有効、横はみ出しなし |
| 拡大・1440px | ダイアログ1100×693.625px、映像1066×599.625px。muted/controls=true、背面は停止、閉じると背面を再開し拡大ボタンへフォーカス復帰 |
| 拡大・1024px | ダイアログ992×632.875px、映像958×538.875px。cancelイベントで閉じ、動画がDOMから消え、フォーカス復帰 |
| 拡大・390px | ダイアログ358×276.25px、映像324×182.25px。押した後だけmp4通信1件、muted/controls=true、再生中。閉じると動画を除去しフォーカス復帰。インラインのsrcは引き続きなし |
| Reduce Motion条件・1440px | 初期matchMediaにreduce=trueを注入。押す前はsrcなし・mp4通信0件、押した後だけ1件。閉じると動画を除去しフォーカス復帰、インラインのsrcはなし。OS／CSSの実際のreduce設定は未確認 |
| ダイアログの背景フォーカス | 開いている間、背景CTAへfocus()しても移らず、閉じるボタンに留まる。標準showModalのinertによる制限を確認 |
| 動画面の拡大・1024px／390px | 動画面のbuttonからダイアログを開き、controls/muted=true。閉じると動画面へフォーカス復帰。390pxは操作前0件、操作後1件のmp4通信。インラインはsrcなしを維持 |
| 拡大アイコン・1440px／1024px | 動画面をfocus()し、focus-visible=true、中央アイコンのopacity=1を確認。hoverは同じCSS宣言を使用。実マウスのhover操作は未確認 |
| 一時停止の重なり | 一時停止ボタン中央をelementFromPointで取得し、動画面ボタンより上の操作対象であることを確認。独立した停止・再生は単体テストで確認 |
| インラインを先に停止 | 停止してから拡大し、閉じてもpaused=trueを維持 |

初回実装時に確認した内容: 1440pxの音なしループ（終端へシーク後先頭へ戻る）、停止・再生、700pxの通信0件、700→701pxの取得開始と701→700pxの解除、クライアントスクリプトなしのSSRポスター、存在しない動画URLによるポスター復帰。これらの挙動のコードはレビュー修正でも維持し、自動テストで再確認した。

### ダイアログを閉じる際の横スクロール修正

ヒーローはoverflow-hiddenからoverflow-clipへ変更。外側のティッカーもoverflow:clipへ変更した。JavaScriptなしで利用する内側のtl-ticker-windowのoverflow-x:auto、および強化後の内側のクリッピングは維持し、試合リンクを読む操作を変えていない。

同じローカル実コンポーネントでヒーローのclassを実際のapp/page.tsxから取得して確認。装飾面が幅からはみ出している状態で測定した。

| 幅 | clientWidth / scrollWidth | 動画面から開閉後のscrollLeft | 各リンク・ボタンへ順にfocus()後のscrollLeft |
|---|---|---|---|
| 1440px | 1440 / 2087 | 0 | 5要素すべて0 |
| 1024px | 1024 / 1679 | 0 | 5要素すべて0 |
| 390px | 390 / 972 | 0 | 4要素すべて0（自動再生の停止ボタンなし） |

1440pxでは下の「拡大して見る」から開閉した後も0。両方とも押したボタンへフォーカス復帰。computed overflowはヒーロー・ティッカーともclip。hero.scrollLeft=449を試みても0のままで、スクロールコンテナーにならないことを確認した。実キーTabによる移動の代用とは扱わない。

#### 実キーTabの確認手順

1. Chromeでトップを1440px幅で開き、DevToolsのLive Expressionに `document.querySelector('section.tl-home-hero').scrollLeft` を登録する。初期値0を確認。
2. 動画面の「紹介動画を拡大して見る」を押してダイアログを開き、閉じるボタンとEscの両方で閉じる。毎回0、押したボタンへのフォーカス復帰、見出しと背景の位置が変わらないことを確認。同様に下の「拡大して見る」でも確認。
3. ページ先頭からTab／Shift+Tabで「今週の試合を見る」「Premium無料体験」「紹介動画を拡大して見る」「紹介動画を一時停止」「拡大して見る」を順にたどる。毎回0を維持し、左側の見出しが切れないことを確認。
4. 1024px、390px、Reduce Motion設定でも同じ手順を繰り返す。390px／Reduce Motionでは一時停止ボタンはなく、明示操作でのみ動画を取得する。

### ブラウザ操作の制限

Playwrightはブラウザ使用中・コード実行の承認制限・Node側のモジュールエラーで利用できず、Chrome DevToolsで代替した。キーボード送信も「MCP tool call requires approval, but approval policy is never」で拒否されたため、実キーのTab/Shift+Tab・Escは未確認。Escが発生させるnative cancelの閉じる処理は単体テストと実ブラウザへのcancelイベント送信で確認した。フォーカス保持は標準dialogのshowModalと上記の背景focus確認に基づき、実キー検証に成功したとは扱わない。

## スクリーンショット

ローカルの実コンポーネントを載せたトップ、ページ先頭、DPR=1。通常表示の1440/1024pxは再生中、390pxは静止ポスター。1440pxは動画面のfocus-visible状態で中央の拡大アイコンも表示。拡大表示はすべて明示操作後の再生画面。

| 幅 | 通常表示 | 拡大表示 |
|---|---|---|
| 1440×900 | [通常](after-1440.jpg) | [ダイアログ](dialog-1440.jpg) |
| 1024×900 | [通常](after-1024.jpg) | [ダイアログ](dialog-1024.jpg) |
| 390×844 | [通常](after-390.jpg) | [ダイアログ](dialog-390.jpg) |

## 性能・未確認

本番／プレビューのLCP・CLSの3回中央値は未測定。性能条件（CLS<0.1、LCPが本番より0.5秒以上悪化しない）の充足は未確認。静的HTML＋検証用バンドルは実際のNext.jsの取得・hydration経路と異なるため性能値の代用にはしない。SSRからメディア寸法を固定し、自動取得はload後、700px以下／reduce条件は明示操作までsrcなしを維持。Playwright、実キー操作、OSのReduce Motion、Next.js全体のJavaScript無効状態、ビルド全体の完了・CIも未確認として分ける。
