# Codex 指示: 大会ハブのカレンダー購読導線を明確化・計測する

## 仕様書

`specs/feat-competition-hub-calendar-subscription.md` を全文読んでから着手すること。以下は実装時の補足であり、仕様書を置き換えない。

`AGENTS.md`、`docs/decisions.md`、`docs/growth-experiments.md` も確認すること。

## 何をするか

大会シーズンページのヒーローに既にある 2 つのカレンダーリンクを、用途が分かる表示に変え、それぞれのクリックを既存の `cta_click` で計測する。

| 現在 | 実装後 |
|---|---|
| `この大会を購読` | `この大会の日程をカレンダーに追加` |
| `大会iCal URL` | `iCal URL を開く` |

大会ハブは検索流入後の主な読まれる面である。一方でこの操作は、ログインやアプリを必要とせず、利用者が大会日程を自分のカレンダーに持ち帰るための既存導線である。

これは新しい購読機能を作る作業ではない。既存の webcal / iCal URL を維持し、クリックを判断可能にする作業である。

## 変更してよい範囲

- `app/c/[competition]/[season]/page.tsx` のヒーロー内カレンダー操作群
- 外部アンカーのクリック計測に必要な、小さな client component
- `lib/analytics.ts` の `CtaClickParams` に追加する optional なイベントパラメータ
- 対応するテスト

## 絶対に変えないこと

1. `getWebcalUrl(competitionCalendarFeedUrl)` と `competitionCalendarFeedUrl` の URL 生成・値・配信内容
2. 既存 `hub_hero_calendar`、ニュースレター、iOS CTA、Premium CTA の表示順、ID、送信パラメータ
3. ニュースレターの文言・配置・デザイン。`feat-newsletter-funnel-instrumentation` 後のデータと混ぜられなくなるため
4. `IosAppCta`、Smart App Banner、通知機能、ログイン、Premium、ペイウォール
5. 試合詳細・トップ・カレンダーページへの CTA 追加
6. SEO metadata、構造化データ、カレンダー API
7. 新規 npm 依存の追加

モーダル、ポップアップ、インタースティシャル、URL をコピーするためだけの新しい UI は追加しないこと。

## 実装要件

### 1. 外部リンクとして扱う

`TrackedLink` は `next/link` を使う内部リンク用のコンポーネントである。webcal と iCal は `<a>` としてレンダリングし、クリック時に `trackCtaClick` を呼ぶ小さな client component を作るか、同じ性質を安全に満たす最小の既存コンポーネント拡張をすること。

- href はサーバーで完成した文字列をそのまま描画する
- `preventDefault`、`window.open`、遅延後の手動遷移を使わない
- `window.gtag` が存在しない、または計測送信に失敗しても、アンカーの既定遷移を止めない
- JavaScript 無効時にも href を使えること
- `competition_slug` と `season` を URL 文字列から再解析しない。ページが既に持つ `competition` と `season` を props として渡す

### 2. 送るイベントを固定する

両方とも `trackCtaClick` 経由で `cta_click` を送る。次の値を変更しないこと。

| 操作 | `cta_id` | `cta_location` | `destination` | `label` |
|---|---|---|---|---|
| webcal 購読 | `hub_calendar_subscribe` | `hub_hero` | `calendar_subscription` | `この大会の日程をカレンダーに追加` |
| iCal URL | `hub_calendar_ical_url` | `hub_hero` | `calendar_ical_url` | `iCal URL を開く` |

さらに両方に `competition_slug: competition` と `season` を含める。

`CtaClickParams` に `competition_slug?: string` と `season?: string` を追加する場合、既存呼び出し元をすべて修正して必須化してはならない。既存 CTA の型と送信 payload を保つため optional にすること。

### 3. 画面の条件

- webcal は主ボタン、iCal は補助リンクとしての強さを保つ
- 新しい補助文を入れるなら短くし、ヒーローのカレンダー操作群の中に置く
- 幅 390px で横スクロール、文字の重なり、ボタンの画面外はみ出しを出さない
- 既存相当の `focus-visible` を維持する
- `IosAppCta`、ページ内ナビ、ニュースレターの位置は変えない

## テスト

次のすべてをテストで確認すること。

1. webcal CTA が正しい href と、仕様どおりの analytics payload で描画される
2. iCal CTA が正しい href と、仕様どおりの analytics payload で描画される
3. それぞれを 1 回クリックすると `trackCtaClick` が 1 回呼ばれる
4. `window.gtag` が未初期化の場合でも、クリックハンドラが `preventDefault` しない
5. 既存の `tests/lib/analytics-gtag-queue.test.ts` と `tests/components/tracked-link.test.tsx` が通る

テストの置き場は既存の `tests/components/` と `tests/lib/` の構成に合わせる。href とクリックイベントの両方を検証できる最小単位へ切り出し、巨大な大会ページのレンダリングをテストのためだけに複製しないこと。

## 検証

実装完了前に必ず実行すること。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

加えて Playwright で大会シーズンページを確認する。

- デスクトップ幅と 390px 幅で、2 リンクが見えて操作できる
- CTA 群に横スクロールや重なりがない
- webcal / iCal の href が期待した URL である
- コンソールエラーがない

実カレンダーでの購読完了はブラウザ自動テストでは判定しない。実装後の一次指標はリンククリックであり、Owner が GA4 で確認する。

## 完了の定義

- `specs/feat-competition-hub-calendar-subscription.md` の受け入れ条件 1〜10 を満たす
- 仕様外の面・機能・依存を追加していない
- 変更したファイル、イベント payload、テスト結果を PR 本文に記載する
- PR 本文に、`competition_slug` / `season` を GA4 探索で使うためには Owner がカスタムディメンション登録を行う必要があることを記載する
- 本番デプロイや GA4 管理画面の変更は行わない

仕様と既存実装が食い違う場合は、実装を止め、該当箇所と差異を Owner に報告すること。
