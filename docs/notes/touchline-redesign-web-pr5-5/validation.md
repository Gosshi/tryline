# Touchline Web PR 5-5: 料金ページ

仕様: `specs/feat-touchline-redesign-web.md` の「PR 5: 残りのページ」。指示書: `docs/codex-prompts/feat-touchline-redesign-web.md`。仕様書・指示書は既存 main の内容を参照し、変更していない。

起点は #916 マージ後の最新 `origin/main`、`54feec12`。対象は `/pricing` の見た目だけ。料金ページの次の RWC ページは含めない。

## 見た目と判断

- 墨色の全幅の帯に明朝の見出しを置き、薄い斜めの面・円・既存 HeroTexture の線を重ねる。紙色の地と真鍮の罫線につなげる。新しい画像や JS は追加しない。
- 申込み欄を 1024px 以上では右側 320px、狭い画面では見出しと説明の下に置く。元の h1 の全文をそのまま 2 行に分け、スマホで助詞から行が始まらないようにした。
- 2 つの申込みボタンとサンプルリンクは個数・ラベル・送信先を保つ。課金条件の要約を 12px／半透明から 14px／明るい文字にし、申込み欄と同じ場所で読む。月額や無料期間の新しい直書きは追加しない。
- デモ／6 項目の Free・Premium 比較をデスクトップで横に並べ、スマホは元の順に縦に並べる。比較表は紙の一覧として罫線を付ける。淡すぎた「対象外」の記号を補助文字色にし、薄い背景上の Premium 見出しを墨色にして読みやすさを優先する。
- サンプルは抜粋・フェード・表示条件・申込みボタンを維持し、角丸 3px と真鍮の罫線を付ける。先頭の小見出しも含めて既存の抜粋をそのまま表示する。
- 既存のレビュー／質問の画面画像は、切り取らずデスクトップでは 2 列、スマホでは縦に並べる。画像の src・alt・寸法、デモの iframe の URL と属性は変更しない。
- FAQ の先頭回答を常に表示する作りと、残りの開閉・文言・順番を保ち、紙色・影なし・罫線・明朝 800 に揃える。回答と JSON-LD は同じ配列のまま。開いた状態でも名前・長文を折り返して読む。

## 内容・導線・SEO・計測の保持

変更前の実ページと変更後の実ページを同じ fixture で SSR し、次を比較した。

- metadata・features・createFaqs・pricingVideoJsonLd・createPricingFaqJsonLd の宣言が一致。
- サンプルの取得処理／sample がない場合の分岐が一致。
- PricingForm・TrackedLink・PricingFaq・PricingTrialBadge・PricingBillingSummary の className 以外の props が一致。analytics の全値、billingTerms、ラベル、サンプルリンクの条件を含む。
- Image・iframe・JSON-LD script・FeatureMark の className 以外の props が一致。
- SSR の全文（空白を除く）・h1・全リンク・フォーム action／method・FAQ ボタンの type／aria-controls／aria-expanded・画像と iframe の属性が一致。
- 公開画面の main と変更後 SSR の全文（空白を除く）・サンプルリンクが一致。`/matches/dcd576dd-f778-4690-b4e1-3d960bd664f1` のリンクは 1→1 で、変更後も JS なしのサーバー HTML に含まれる。
- `app/`・`components/` 全体の cta_id は 27→27、集合の差なし。
- `app/pricing/pricing-form.tsx`・`components/pricing-faq.tsx`・`lib/billing/terms.ts`・Stripe API の実装に差分なし。価格・7 日間の無料期間・プラン・認証と Checkout の処理は変更なし。
- h1 の文言、canonical・OGP、VideoObject／FAQPage、revalidate（追加なし）を維持。他ページの日程・有料部分・ニュースレター・iOS 案内・ネタバレ防止の処理は変更なし。追加 CSS は料金ページ専用クラスに限定。

## スクリーンショット

2026-10-05 の公開 main `https://www.trylinerugby.com/pricing` を修正前として撮影。修正後は公開画面に表示された実際のサンプル（南アフリカ 対 ニュージーランド／Greatest Rivalry 2026）のデータを fixture にし、変更後の PricingPage・PricingForm・PricingFaq をそのまま SSR した静的 HTML と生成した Tailwind CSS で描画した。DB 取得のみ置き換え、共通ヘッダー・フッター・メタデータ・書体を保った。fixture／検証スクリプト／取得 HTML は一時ディレクトリにあり、コミットしていない。

Viewport は 1440×900 と 390×844。390px は端末 viewport のエミュレーションで innerWidth=390 を確認した。画面画像の読み込みを待ってページ全体を撮影。比較画像は左が公開 main、右がローカル SSR。これは実 Next.js プレビューの E2E 検証ではない。ローカルのフルページ画像で、画面外の YouTube iframe のサムネイルが空白になる場合がある。iframe の URL・属性を保ち、アクセシビリティツリーには動画のタイトルと再生ボタンがあることを確認した。動画再生操作は行っていない。

| 幅 | 修正前／修正後 |
| --- | --- |
| 1440px | [比較](pricing-comparison-1440.jpg) |
| 390px | [比較](pricing-comparison-390.jpg) |

## 表示確認

- 1440px／390px／768px で横スクロールなし（scrollWidth が viewport と一致）。
- 申込みボタンの上端: 1440px で 175px、390px で 449px。高さはヒーローの申込み 48px、サンプルの申込み 44px、FAQ 開閉 60px。サンプルリンクは 44px 以上。
- 見出し・FAQ の質問は Shippori Mincho B1 の 800。本文の色は既存の墨色／補助色、暗い帯の説明と課金条件は明るい紙色系。元の focus-visible を保持。
- 390px で全 FAQ の回答を開いた状態が横にはみ出さないことを確認。検証用 SSR に限り PricingFaq の初期状態を全開にして描画したもので、製品のコンポーネントは変更していない。
- 768px でサンプルなしのフォールバック、サンプルリンクの `/` への遷移先が維持されることを確認。

## 共通受け入れ条件と結果

1. `pnpm lint`: 成功。`pnpm typecheck`（tsc --noEmit）: 成功。`pnpm test`: 337 ファイル・2297 テスト成功。最後の見出し／装飾調整後に料金ページと Stripe Checkout の関連 2 ファイル・10 テストを再実行して成功。未ログイン時の認証表示、ログイン時のフォーム送信と計測、FAQ 開閉、サンプルなし、無料期間あり／なしの課金文言を含む。`pnpm build`: コンパイル成功（5.5秒）、ページデータ収集中にローカル DB `127.0.0.1:54321` の ECONNREFUSED で停止（`/c/[competition]/[season]/round/[round]`）。ダミー値とローカル URL を使い、本番の鍵や DB は使っていない。build 全体の成功は未確認。
2. サーバー HTML のリンク: ローカル SSR のサンプルリンク 1→1。対象外の試合日程の取得・描画は変更なし。外部プレビューと本番の生レスポンス比較は未実施。
3. 計測: cta_id 27→27、集合の差なし。cta_location・destination・label・match_id・is_sample も維持。
4. テストの削除／期待値の変更なし。新しい依存パッケージなし。
5. 1440×900／390×844 の修正前／修正後を添付。DB／認証を含む実 Next.js の E2E ではない。
6. 本番／Vercel プレビューの LCP・CLS は未測定。外部確認は Owner が行う方針に従い、Vercel は開いていない。新しい画像・JS・アニメーションを追加していないが、LCP 2.5秒未満／CLS 0.1未満は未確認。実 Stripe への送信・購入はしていない。

`git diff --check` 成功。仕様からの機能上の逸脱なし。検証方法と未確認項目は上記のとおり。
