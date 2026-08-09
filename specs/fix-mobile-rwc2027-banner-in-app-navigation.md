# fix-mobile-rwc2027-banner-in-app-navigation: RWC2027バナーをアプリ内遷移に変更

対象リポジトリ: **tryline-mobile**のみ。API・データモデル変更は不要。

## 背景

`src/home/Rwc2027Banner.tsx`はタップ時に`Linking.openURL`でWeb版のRWC2027ハブ(`https://www.trylinerugby.com/c/rwc/2027`)を開く。これは`feat-mobile-rwc2027-countdown`(2026-07時点)で「モバイルアプリ内に専用画面は作らない」という判断のもとに決めた設計だが、当時はまだ大会詳細画面(`app/(tabs)/competitions/[slug].tsx`)が存在しなかった。

現在は大会詳細画面が実装済みで、本番APIで確認したところ`rwc-2027`は既に試合数36件・6プールのデータを持っている(2026-07-26時点)。空の画面にはならず、他の大会と同じ体験を提供できる。

Owner から「RWC2027バナーだけブラウザに飛ぶのは他画面と一貫性がなく不自然では」と指摘があった。アプリ内の他の大会カード・共有・試合詳細はすべてアプリ内遷移で完結しており、このバナーだけが例外的にSafariへ離脱する。

## スコープ

対象:
- `src/home/Rwc2027Banner.tsx`のタップ時の遷移を、`Linking.openURL`(Web版ハブを開く)から`router.push`(アプリ内の大会詳細画面`/competitions/rwc-2027`へ遷移)に変更する

対象外:
- Web版のRWC2027ハブページ自体の変更
- 大会詳細画面のUI変更(既存のまま、順位表/試合日程セクションがそのまま使われる)

## UI サーフェス

- `Rwc2027Banner.tsx`の`onPress`を`() => { void Linking.openURL(hubUrl); }`から`() => router.push("/(tabs)/competitions/rwc-2027")`に変更する
- `accessibilityRole`は`"link"`から他の大会カードと同じ`"button"`に変更する(遷移先がアプリ内画面になるため)
- `Linking`のimportが他で使われていなければ削除する

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. バナー押下で`router.push`が`/(tabs)/competitions/rwc-2027`で呼ばれ、`Linking.openURL`が呼ばれないことを確認するテスト(既存の`__tests__/rwc2027-banner.test.tsx`を更新する)
2. `accessibilityRole`が`"button"`になっていることを確認する
3. TypeScript strict・lint・test green
4. **Owner目視**: TestFlightビルドでバナーをタップし、Safariに離脱せずアプリ内でRWC2027の大会詳細(順位表・試合日程)が表示されることを確認する

## 未解決の質問

なし。
