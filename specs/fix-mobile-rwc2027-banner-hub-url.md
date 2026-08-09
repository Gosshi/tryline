# fix-mobile-rwc2027-banner-hub-url: RWC2027バナーの遷移先URLが404

対象リポジトリ: **tryline-mobile** のみ。

## 背景

`feat-mobile-rwc2027-countdown`(PR #28)で実装したホーム画面のRWC2027バナーは、タップ時に`/c/rwc-2027`(`competitions.slug`列の値をそのまま1セグメントのパスとして使用)へ遷移するが、Web側(`tryline`リポジトリ)の実際のルートは`app/c/rwc/2027/page.tsx`のみ存在し、`app/c/rwc-2027`というルートは存在しない。`/c/rwc-2027`は`/c/[competition]/page.tsx`(family単体のダイナミックルート)に一致し、`competition = "rwc-2027"`をfamilyとして`listSeasonsByFamily("rwc-2027")`を呼ぶが、実際のfamily値は`"rwc"`(seasonが`"2027"`)であるため該当が無く404になる。spec作成時にURLを検証せずに書いた誤り。

## スコープ

対象:
- `src/home/Rwc2027Banner.tsx`のタップ遷移先URLを`/c/rwc-2027`から`/c/rwc/2027`に修正する

対象外:
- URLをAPI(`competitions.family`/`season`)から動的に組み立てる一般化(本機能はRWC2027専用の常設枠であり、既にコンポーネント名・spec名含め2027決め打ちのため、URLの決め打ち修正で十分)

## UI サーフェス

- `src/home/Rwc2027Banner.tsx`の`hubUrl`算出を`new URL("/c/rwc/2027", appConfig.apiBaseUrl).toString()`に変更する

## 受け入れ条件

1. バナータップで`Linking.openURL`に渡されるURLが`https://www.trylinerugby.com/c/rwc/2027`(または`appConfig.apiBaseUrl`ベース)になることを確認するテスト(既存の`__tests__/rwc2027-banner.test.tsx`の期待値を更新する)
2. TypeScript strict・lint・test green
3. **Owner 目視**: 実機またはSimulatorでバナーをタップし、Web版のRWC2027ハブ(`/c/rwc/2027`)が正しく開くことを確認する

## 未解決の質問

なし。
