# fix-ai-label-product-naming

> GPT-6 監査 A-6 5（P2）。D（`project_ai_labeling`）で決めた「UI 文言から AI を外す」が、pricing とチャットに未適用のまま残っている。

## 背景

決定は「「AI解説」→「解説/プレビュー/レビュー」。敵は AI でなく間違い」（`project_ai_labeling`、コピーのみ後日対応）。**その後日対応が未着手**である。

実コードに残る表記は **13 箇所**（2026-09-09 実測。**初版は 10 箇所と書いたが誤りだった。後述**）。

```
app/pricing/page.tsx:38    { free: false, name: "試合 AI チャット", premium: true }
app/pricing/page.tsx:50    「…日本語レビュー全文・試合 AI チャットは Premium 限定です。」
app/pricing/page.tsx:80    VideoObject description 「…AI チャットが使える…」
app/pricing/page.tsx:153   「日本語レビューと試合 AI チャットで確認できます。」
app/pricing/page.tsx:270   「試合 AI チャットは Premium 限定です。」
app/pricing/page.tsx:294   「…試合データと公開レビューをもとに質問できるAIチャット。」
app/pricing/page.tsx:315   「試合 AI チャット」
app/pricing/page.tsx:319   alt="AI チャットの画面例"
components/match-chat.tsx:287                    AI CHAT
components/sample-recap-cta.tsx:46              「…試合 AI チャットも利用できます。」
lib/billing/terms.ts:37    pricingDescription（trialDays > 0 の分岐）
lib/billing/terms.ts:41    trialFaqAnswer
lib/billing/terms.ts:52    pricingDescription（trialDays === 0 の分岐）
```

表記も揺れている（`AI チャット` / `AIチャット` / `AI CHAT`）。

### `lib/billing/terms.ts` の 3 箇所が特に重要な理由

この 3 つは**リテラルが置かれている場所と、表示される場所が違う**。

| 定数 | 出力先 |
|---|---|
| `pricingDescription`（`:37` / `:52`） | `app/pricing/page.tsx:21` の `metadata.description` と `:23` | 
| `trialFaqAnswer`（`:41`） | `app/pricing/page.tsx:45` の FAQ 回答 → `createPricingFaqJsonLd` 経由で **FAQPage JSON-LD** |

**つまり検索結果に出る説明文と構造化データに「AI チャット」が残る。** 画面本文だけ置換すると、最も露出する場所が直らない。

**`:37` と `:52` は `trialDays > 0` と `trialDays === 0` の別分岐である。** 片方だけ直すと、トライアル設定を変えた瞬間に表記が食い違う。

### なぜ初版で見落としたか

`app/` と `components/` に絞り、さらに `--include='*.tsx'` を付けて grep した。`lib/billing/terms.ts` は **`lib/` 配下の `.ts`** で、2 つの条件の両方で除外される。その結果を「10 箇所」と断定した。

**絞り込んだ検索の結果を、網羅の証拠として書いた。** 本リポジトリの spec で Codex に繰り返し禁じている「grep の件数一致を網羅性の証拠にしない」を、spec を書く側が破った。Codex が実装を止めて指摘し、13 箇所に訂正した（2026-09-09）。

監査の指摘（原文）: 「AI CHAT、pricingの試合AIチャットが残る。商品名は「この試合について質問する」へ揃え、回答がAI生成で根拠/限界があることは利用箇所に明示する。**「AI」を消すことを透明性の削減にしない。**」

**最後の一文が本 spec の核心である。** 商品名から AI を外すのと、AI 生成であることを隠すのは別である。**後者になってはいけない。**

現状、チャット画面に「回答が生成物であり限界がある」旨の明示は無い。FAQ 的な文言に「記録された得点経過をもとに」「公開済みのレビューと試合データをもとに」（`components/match-chat.tsx:21,25`）はあるが、これは**回答範囲の説明であって、生成物であることの開示ではない**。

**つまり「AI」を機械的に置換すると、透明性が現状より下がる。** 置換と開示の追加はセットで行う。

## スコープ

対象:
- 商品名・ラベルの統一
- **回答が生成物であることの開示を、利用箇所に追加する**
- テスト

対象外:
- **チャット機能そのもの**（`components/match-chat.tsx` のロジック、`lib/chat/`）
- pricing の価格・プラン構成
- **`lib/billing/terms.ts` の課金条件の意味**。`trialDays` / 価格 / 支払時期 / サービス提供時期は変えない。同ファイルは `fix-billing-terms-consistency`（`f44ec12`）で**課金文言の単一の権威**になったもので、特商法表記と料金ページの整合がここに依存している。**触ってよいのは「AI チャット」という商品名の部分だけ**
- `app/pricing/page.tsx:84` の `uploadDate`（`fix-pricing-video-upload-date.md` が扱う）
- レビュー・プレビュー本文中の表現
- モバイルアプリ側（`tryline-mobile`）。**web と同時に変えると検証が分散する**

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

上記 10 箇所と、チャット利用箇所への開示追加。

**`app/pricing/page.tsx:80` は `VideoObject` の `description` で構造化データである。** 画面文言と同じ扱いで置換してよいが、他のプロパティを壊さないこと。

## LLM 連携

なし。コスト $0。**プロンプトテンプレートを変更しない。**

## 変更詳細

### 1. 商品名（2026-09-09 Owner 決定）

**位置によって形を使い分ける。** 一語で全部を賄おうとすると日本語が壊れる。

| 位置 | 形 | 例 |
|---|---|---|
| CTA・見出し・機能一覧の項目名・主語 | **「この試合について質問する」** | `app/pricing/page.tsx:38` / `:270` / `:315`、`components/match-chat.tsx` の `<h2>` |
| 文中で名詞が要る位置 | **「試合Q&A」** | `lib/billing/terms.ts:37` / `:52`、`app/pricing/page.tsx:80` / `:153` |
| 装飾の英語見出し | `MATCH Q&A` | `components/match-chat.tsx:287` |

確定文（`lib/billing/terms.ts` の `pricingDescription`。`app/pricing/page.tsx:21` 経由で **`metadata.description` として検索結果に出る**）。**テンプレートリテラルの補間を含む全文である。**

```ts
// trialDays > 0（:37）
`見逃した海外ラグビーを日本語レビューと試合Q&Aで深く追える Tryline Premium。${trialHeroLabel}、その後 ${monthlyPriceLabel}。`

// trialDays === 0（:52）
`見逃した海外ラグビーを日本語レビューと試合Q&Aで深く追える Tryline Premium。${monthlyPriceLabel}。`
```

**接尾辞の `${trialHeroLabel}` / `${monthlyPriceLabel}` を落とさないこと。** 落とすと検索結果の説明文から「7日間無料」と「¥980/月」が消え、さらに 2 分岐が同一文字列になってトライアル設定が description に反映されなくなる。

**2026-09-09 の事故**: 本 spec の初版はここに前半の言い回しだけを「確定文」と書き、接尾辞を落としていた。PR #794 はそのとおり実装し、価格情報が消えた。**部分文字列を「確定文」と書かないこと。** 補間を含む全文を書く。

表記揺れ（`AI チャット` / `AIチャット` / `AI CHAT`）も同時に解消する。

**監査からの意図的な逸脱**: 監査 A-6 5 は「商品名は『この試合について質問する』へ揃え」と書いている。しかし**これは動詞句であり、文中で名詞が要る位置には入らない。** PR #794 の初版で機械的に置換したところ、`app/pricing/page.tsx:294` が「質問できる『この試合について質問する』」という循環表現になり、`metadata.description` も「日本語レビューと『この試合について質問する』で深く追える」という読めない文になった。**Owner 判断で名詞形を別に立てる**（2026-09-09）。次に読んだ人が監査の文言へ戻さないこと。

### 2. 開示（これを省くと本 spec は失敗）

**置換だけを行い開示を足さないのは、透明性の削減である。** 回答が生成物であること、根拠の範囲、限界が、**チャットの利用箇所で読める**ようにする。

既存の `components/match-chat.tsx:21,25` は回答範囲の説明であり、開示ではない。**これを開示とみなさないこと。**

D の「敵は AI でなく間違い」に照らすと、**開示は「AI だから間違うかも」ではなく「何をもとに答えており、何は答えられないか」**であるべきである。

## 受け入れ条件

1. **上記 13 箇所すべて**で商品名が統一されている
1-a. **CTA・見出し・主語の位置は「この試合について質問する」、文中の名詞位置は「試合Q&A」**になっている
1-b. **名詞が要る位置に動詞句が置かれていない。** 「質問できる『この試合について質問する』」のような重複・循環表現が無い
1-c. **`metadata.description` と VideoObject `description` の全文が PR 本文にあり、日本語として読める**
1-d. **`pricingDescription` の両分岐に `${monthlyPriceLabel}` が含まれ、`trialDays > 0` の分岐には `${trialHeroLabel}` も含まれる**
1-e. **2 つの分岐の `pricingDescription` が同一文字列にならない**
2. 表記揺れ（`AI チャット` / `AIチャット` / `AI CHAT`）が解消している
3. **チャットの利用箇所に、回答が生成物であることの開示がある**ことを検証するテストがある
4. **開示に、何をもとに答えているかの範囲が含まれる**ことを検証するテストがある
5. `components/match-chat.tsx:21,25` の既存文言を開示として流用していない
6. `app/pricing/page.tsx` の `VideoObject` で、`description` 以外のプロパティに差分が無い
6-a. **`metadata.description`（`app/pricing/page.tsx:21`）に「AI チャット」が残っていない**ことを検証するテストがある
6-b. **FAQPage JSON-LD に「AI チャット」が残っていない**ことを検証するテストがある
6-c. **`lib/billing/terms.ts:37` と `:52` の両分岐**（`trialDays > 0` / `=== 0`）が同じ商品名になっていることを検証するテストがある
6-d. **`lib/billing/terms.ts` の課金条件（`trialDays` / 価格 / `paymentTiming` / `serviceProvisionTiming`）に差分が無い**
6-e. 既存の `tests/app/pricing-page.test.tsx` が green である（必要なら期待値を更新する）
7. **チャット機能のロジック（`lib/chat/`）に差分が無い**
8. プロンプトテンプレートに差分が無い
9. 価格・プラン構成に差分が無い
10. `tryline-mobile` に差分が無い
11. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/app/` と `tests/components/` 配下（`exclude` 非該当。確認済み）。

## 未解決の質問

**Owner が決めること（実装をブロックしない。Codex が案を出して PR 本文に書けばよい）**:

1. 商品名を監査の推奨どおり「この試合について質問する」にするか、別の名前にするか
2. 開示の文言

**本 spec で解決しないと明示するもの**:

- **モバイルアプリ側は変わらない。** web とモバイルで商品名が一時的に食い違う
- **これはコピーの統一であって、チャットの品質改善ではない**
