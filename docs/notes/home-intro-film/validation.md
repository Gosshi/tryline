# ホーム紹介動画の実装・検証

2026-10-05。最新origin/main `3a2cd947` から `codex/feat-home-intro-film` を作成。
仕様: `specs/feat-home-intro-film.md`、指示書: `docs/codex-prompts/feat-home-intro-film.md`。文書は変更なし。

## 実装

- 指定の素材をpublic/videosへコピー。元のdocs素材は既にmainにあり、変更・移動・削除せず、PRの差分にも含めない。1080p版とsourceの未追跡ファイルも対象外。
- 動画: 1,194,970 bytes、H.264、1280×720、31.5秒、音声ストリームなし。ポスター: 19,148 bytes。元ファイルとバイト一致。MP4のmoovがmdatより先にありfaststartを保持。
- HomeIntroFilmはサーバーHTMLでwidth=1280 / height=720 / poster / preload=noneのvideoだけを描き、srcとsource要素は出さない。媒体の面はaspect-video / object-containで、映像を切り抜かない。fetchpriority、lazy、動画preloadリンクは追加なし。
- window.load後（既にcompleteなら直後）、min-width:701px、Reduce Motionオフのときにだけsrcを付ける。700px以下やReduce Motionはsrcなし。条件が変われば再生を止めてsrcを外し、loadでメディアを解放。
- muted / playsInline / autoplay / loop。一時停止・再生ボタンは44px以上、文言とaria-pressedで状態を表示。ボタンに新しい計測は付けない。
- 読み込みエラーはvideoを同寸法のポスター画像へ戻し、エラー文言・操作ボタンは出さない。ブラウザが自動再生を拒否した場合は再生ボタンを残す。
- キャプションをINTRODUCTION FILM／サイトとアプリの紹介（音なし）へ変更。figureのaria-labelはTryline の紹介動画。
- デスクトップの枠の幅だけclamp(300px,28vw,420px)へ変更し、映像を薄くしないよう枠全体のopacity=0.85を削除。キャプションは映像の下に置いて映像を隠さない。枠の面が16:9で、figureにはこの面とキャプションを含める。
- 紹介枠以外のHomePageのコードは同一（置換箇所とimportを除いた比較で一致）。データ、見出し、日程、ティッカー、既存の動き、CTA、SEO、spoilerに変更なし。

## 自動テスト

- 新規home-intro-film.test.tsxの12件: SSRでsrcなし、390/700px、Reduce Motion、701/1440px、load待ち、停止／再生、条件変更、エラーのポスター表示、自動再生拒否、アンマウント時の解除。
- 既存HomePageテスト1件の4:3線画ポスターの期待値を、16:9面・動画ポスター・新文言へ更新。ほかの既存assertは変更なし。
- 関連テスト37件成功。
- pnpm lint: 成功。
- pnpm typecheck（tsc --noEmit）: 成功。
- pnpm test: 338ファイル・2,309件成功。
- pnpm build: コンパイル成功（4.7秒）。明示的なダミー設定・ローカルDB URLで実行。ページデータ収集で127.0.0.1:54321へのECONNREFUSED、/c/[competition]/[season]/round/[round]で停止。ビルド全体の成功・CIは未確認。秘密ファイルを読んでいない。
- cta_id: 27→27、差なし。git diff --check成功。

## ローカル実ブラウザでの確認

公開中のトップHTMLの紹介枠だけ、実装コンポーネントのSSRと同じReactコンポーネントのhydrationに置き換えた検証ページを使用。CSSは実装のTailwind、動画・ポスターは実際のpublic素材。データ取得・LLMの呼び出しなし。新規依存は追加せず既存Viteのesbuildを検証用バンドルに使用。トップ全体のNext.js hydrationやログインのE2Eではない。

Playwright MCPはブラウザが既に使用中というエラー。コード実行ツールは「承認が必要だがapproval policyがnever」で拒否され、Node側のPlaywright読み込みもモジュールエラーとなったため、Playwrightによる確認は未実施。Chrome DevToolsで以下を確認した。

| 状態 | 結果 |
|---|---|
| 1440×900 | srcあり、paused=false、muted=true、loop=true、playsInline=true、autoplay=true、readyState=4 |
| ループ | 終端の0.15秒前へシークし、0.7秒後のcurrentTime=0.697649秒。先頭へ戻り継続再生 |
| 一時停止 | paused=true、currentTimeが安定、文言「再生」、aria-pressed=true |
| 再生 | paused=falseへ戻る |
| 390×844（読み込み前に設定） | srcなし、mp4リクエスト0件、操作ボタンなし |
| 700×900（読み込み前に設定） | srcなし、mp4リクエスト0件 |
| 701pxへ拡大 | srcあり、paused=false、mp4リクエスト1件 |
| 700pxへ戻す | src属性なし、srcプロパティ空、paused=true、readyState=0、networkState=0 |
| 1440px、Reduce Motion条件 | 初期matchMediaにreduce=trueを注入して条件を検証。srcなし、mp4リクエスト0件、操作ボタンなし。OS／CSSの実際のreduceエミュレーションは未確認 |
| クライアントスクリプトなし | 同一コンポーネントのSSRのみ。srcなし、mp4リクエスト0件、ポスター表示、面403.2×226.8px。Next.js全体でJavaScriptを無効にした確認は未実施 |
| 動画404 | ローカルで存在しない動画URLに変更してエラーを発生。videoと操作ボタンが消え、1280×720のポスター画像に戻る。エラー文言なし |

mp4通信0件はPerformance Resource TimingとChromeのmediaリクエスト一覧の両方で確認。読み込み前から狭い幅／reduce条件にした新しいコンテキストを使用。

枠の面: 1440pxで403.2×226.8、1024pxで300×168.75、390pxで358×201.375。いずれも16:9。横はみ出しなし、見出し・説明・ボタンと重ならず、映像を切らずに表示。

## スクリーンショット

ローカルの実コンポーネントを載せたトップ。ページ先頭、DPR=1。1440/1024は再生中のフレーム、390は静止ポスター。

- [1440×900](after-1440.jpg)
- [1024×900](after-1024.jpg)
- [390×844](after-390.jpg)

## 性能・未確認

LCP／CLSの本番（PR前）・プレビューの3回中央値は未測定。静的HTML＋検証用バンドルは実際のNext.jsの取得・hydration経路と異なるので、性能値の代用にはしない。以前のOwner方針「確認はこちらで以後やる」に従ってVercelを開いていない。Ownerのプレビュー確認が必要。

性能条件（CLS<0.1、LCPが本番より0.5秒以上悪化しない）の充足は未確認。合格したとは扱わない。メディア寸法はSSRから固定し、動画の取得はload後、700px以下／reduce条件ではsrc自体を付けない。Playwrightの実環境確認、Next.jsのJavaScript無効、ビルド全体、CIも上記のとおり未確認。
