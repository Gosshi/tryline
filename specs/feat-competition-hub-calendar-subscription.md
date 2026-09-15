# 大会ハブのカレンダー購読導線を明確化・計測する

## 背景

2026-08-26 の実測では、大会ハブは検索流入後に読まれる主要ページであり、試合詳細ページより滞在と直帰率が明確に良い。2026-08-25 以降のハブ刷新後も、この構図は変わっていない。

2026-08-18〜09-14 の GA4 実測（直近 28 日）では、Bing organic が 160 セッションで最大の流入元になった。特に以下の大会シーズンページが検索流入の受け皿になっている。

| 着地ページ | Bing organic セッション | エンゲージメント率 |
|---|---:|---:|
| `/c/greatest-rivalry/2026` | 50 | 88% |
| `/c/pnc/2026` | 43 | 79% |
| `/c/lipovitan-challenge-cup/2026` | 14 | 100% |

この流入の大半はデスクトップである。一方、ハブにある `IosAppCta` は iPhone・iPad 利用者だけに価値があり、検索で大会日程を調べる全訪問者の継続利用導線にはならない。

各ハブのヒーローには、既に webcal URL を開く「この大会を購読」リンクがある。これはログイン・アプリ・メールアドレスを必要とせず、Google Calendar、Apple カレンダー等で大会日程を購読できる継続利用の入口である。しかし、次の問題がある。

- 「この大会を購読」だけでは、カレンダーに何が起きる操作かが分かりにくい
- このリンクと隣の `大会iCal URL` は `Link` であり、GA4 の `cta_click` を送っていない
- そのため、検索流入した人が日程を持ち帰る行動を取ったか、どの大会で起きたかを判断できない

本仕様は、新しい登録手段を増やさず、既存のカレンダー購読を明確にし、次の改善判断に必要なクリック計測を追加する。

## 目標

1. 大会ハブを訪れた人が、クリック前に「大会日程を自分のカレンダーへ追加する」導線だと理解できる。
2. 大会別・導線別に、カレンダー購読リンクのクリック数とクリック率を GA4 で確認できる。
3. カレンダー購読を、iOS アプリ・ニュースレター・Premium の代替や強制導線として扱わない。

## スコープ

### 対象

- `app/c/[competition]/[season]/page.tsx` のヒーロー内にある既存の webcal 購読リンク
- 同じヒーロー内にある既存の iCal URL リンク
- 上記 2 リンクの `cta_click` 計測
- リンクの意図を明確にする文言・補助文
- 単体テストまたはコンポーネントテスト

### 対象外

- ニュースレターの露出箇所、文言、デザインの変更
- `IosAppCta`、Smart App Banner、App Store URL の変更
- 新しいメール通知、Web Push、ログイン、オンボーディング、モーダルの追加
- カレンダー購読後の成否をサーバー側で記録する機能
- Premium の価格、ペイウォール、決済導線の変更
- 試合詳細ページ・トップページ・カレンダーページへの同一 CTA の追加
- SEO の title、description、構造化データの変更

## データモデル変更

なし。

## API サーフェス

なし。

webcal / iCal URL の生成方法、URL 形式、配信内容は変更しない。

## UI サーフェス

対象は `app/c/[competition]/[season]/page.tsx` のヒーロー内にあるカレンダー操作群だけとする。

### 購読リンク

既存の webcal リンクを、ボタンを見た人が用途を理解できる文言に変える。

- 主ラベル: `この大会の日程をカレンダーに追加`
- 補助文を置く場合は、同じ操作群の中で短くする。例: `Google カレンダー・Apple カレンダーなどで購読できます`
- `getWebcalUrl(competitionCalendarFeedUrl)` を href として使い続ける
- リンク先、色、主ボタンである視覚的優先度は維持する

### iCal URL リンク

既存の iCal URL を必要とする利用者向けの補助操作として残す。

- ラベルは `iCal URL を開く` とする
- `competitionCalendarFeedUrl` を href として使い続ける
- 主 CTA より視覚的に強くしない

### レイアウトとアクセシビリティ

- 新しいモーダル、ポップアップ、インタースティシャルを使わない
- モバイル幅 390px で横スクロールを発生させない
- リンクはキーボードで到達・操作でき、既存と同等の focus-visible 表示を持つ
- iOS CTA、ニュースレター、シーズン切替、シーズンサマリーの順序を変えない

## 計測

### イベント

既存の `trackCtaClick` / `cta_click` を使う。イベント名や既存 CTA の ID を変更しない。

2 つのリンクは、それぞれ次の必須パラメータで送る。

| 操作 | `cta_id` | `cta_location` | `destination` | `label` |
|---|---|---|---|---|
| webcal 購読 | `hub_calendar_subscribe` | `hub_hero` | `calendar_subscription` | `この大会の日程をカレンダーに追加` |
| iCal URL を開く | `hub_calendar_ical_url` | `hub_hero` | `calendar_ical_url` | `iCal URL を開く` |

大会別に分けるため、上記の両イベントには `competition_slug` と `season` を追加する。値は URL パスと同じ既存の `competition` / `season` から取得し、表示名を使わない。

`CtaClickParams` を拡張する場合、既存の呼び出し元は引き続きコンパイルできなければならない。`competition_slug` と `season` はこの 2 操作だけで必須にするのではなく、既存 CTA との互換性を保つ optional なイベントパラメータとして扱う。

### 実装方針

`TrackedLink` は Next.js の内部リンク用として残す。webcal と iCal URL は外部プロトコル・外部 URL であるため、`<a>` に `trackCtaClick` を接続する小さな既存パターンに沿った client component を用意する、または既存コンポーネントを外部 URL に安全に対応できる形へ最小限拡張する。

次を満たすこと。

- クリック時に 1 回だけ `cta_click` を送る
- 計測送信の有無で href 遷移を止めない
- JavaScript が無効でもリンク先 URL は利用できる
- `competition_slug` / `season` を URL からパースしない。ページが既に持つ値を渡す

## GA4 側の確認方法（Owner）

実装後 28 日間は、GA4 のイベントレポートで `cta_click` を次の軸で確認する。

- `cta_id = hub_calendar_subscribe` と `hub_calendar_ical_url` のイベント数
- `competition_slug` と `season` ごとのイベント数
- `hub_hero_calendar` と比較したクリック数

この計測で分かるのは「購読リンクをクリックしたこと」であり、各カレンダーアプリ内で購読が完了したことではない。完了率として解釈しない。

GA4 で `competition_slug` / `season` を探索レポートに使うには、Owner がイベントスコープのカスタムディメンションとして登録する。実装は GA4 の管理画面を変更しない。

## LLM 連携

なし。LLM 呼び出し、コンテンツ生成、DB キャッシュは追加しない。

## 受け入れ条件

1. 大会シーズンページの既存 webcal リンクは `この大会の日程をカレンダーに追加` と表示され、既存と同じ webcal URL を開く。
2. iCal URL の既存リンクは `iCal URL を開く` と表示され、既存と同じ iCal URL を開く。
3. webcal 購読クリックで `cta_click` が 1 回送られ、表に定めた `cta_id`、`cta_location`、`destination`、`label`、`competition_slug`、`season` を含む。
4. iCal URL クリックで `cta_click` が 1 回送られ、表に定めた `cta_id`、`cta_location`、`destination`、`label`、`competition_slug`、`season` を含む。
5. 既存の `hub_hero_calendar`、ニュースレター、iOS CTA、Premium CTA のイベント名・パラメータ・表示順が変わらない。
6. 計測の送信失敗や `window.gtag` 未初期化時でも、リンク遷移が阻害されない。
7. JavaScript が無効でも、2 つのリンクは正しい href を持つ。
8. 390px 幅とデスクトップ幅でヒーローの横スクロール・重なり・レイアウトシフトがない。
9. キーボード操作で 2 つのリンクに到達でき、操作できる。
10. `pnpm lint`、`pnpm typecheck`、関連テスト、`pnpm build` が通る。

## テスト

- カレンダー購読 CTA が webcal href と正しい分析パラメータを持って描画されるテスト
- iCal URL CTA が既存 iCal href と正しい分析パラメータを持って描画されるテスト
- 両 CTA のクリックで `trackCtaClick` がそれぞれ 1 回呼ばれるテスト
- `window.gtag` がない場合でもアンカーのデフォルト遷移を妨げないテスト
- 既存の大会ハブと `lib/analytics.ts` 関連テストが通ること

## 未解決の質問

なし。カレンダー登録の完了をブラウザ側で確定できないため、本施策の一次指標はクリック数とする。
