# feat-mobile-rwc2027-countdown: RWC2027カウントダウン＋日本代表ランキング常設枠

対象リポジトリ: **tryline(API) + tryline-mobile(UI)**。2段階(API→UI)で、Codexプロンプトも2本に分ける。`feat-mobile-match-detail-related-news`・`feat-mobile-recap-next-read-links`とは独立(並行実装可)。

## 背景

2026-07-23のFable監査(グロース提案⑤)で、主要KPI(RWC2027までの有料購読者数)に最も直結する「代表戦を見逃したくない」という動機を毎回想起させる常設枠が提案された。

DB実測: `competitions`テーブルの`rwc-2027`(family: `rwc`, season: `2027`)は`start_date: null` / `end_date: null`(2026-07-23時点、公式日程未確定)。カウントダウンの正確な残り日数は現時点では出せない。一方、`teams.world_ranking`(+`world_ranking_updated_at`)列は既に存在し定期取り込み済み(`lib/ingestion/world-rankings.ts`)なので、ランキング表示は今すぐ実装できる。

## スコープ

対象:
1. **(tryline / API)** 軽量な新規エンドポイント `GET /api/v1/rwc2027-status` を追加。レスポンス: `{ kickoff_date: string | null, japan_ranking: number | null, japan_ranking_updated_at: string | null }`。`kickoff_date`は`competitions`の`rwc-2027`(family=`rwc`, season=`2027`)の`start_date`をそのまま返す(現状null)。`japan_ranking`は`teams`テーブルで`slug = 'japan'`相当のチームの`world_ranking`を返す
2. **(tryline-mobile / UI)** ホーム画面(`app/(tabs)/index.tsx`)に常設の「RWC2027まで」枠を追加。`kickoff_date`がある場合は残り日数、nullの場合は日数を出さず「2027年開催予定」のような大まかな表示にフォールバックする。`japan_ranking`があれば「日本代表 世界{n}位」も併記
3. **(tryline)** `rwc-2027`の`start_date`が確定した際にOwnerが値を入れられるよう、既存のcompetitions更新経路(通常のシード/管理フロー)で対応可能であることを確認する(新規の入力UIは作らない)

対象外:
- カウントダウン専用の新しいデータ入力画面・管理画面の作成(既存のcompetitions更新経路を使う)
- 日本代表以外の国のランキング表示
- 大会そのものの特設ページ・プール表(既存の`fix-rwc2027-*`系specの範疇)

## データモデル変更

なし(既存カラムの参照のみ)。

## API サーフェス(tryline)

- 新規: `GET /api/v1/rwc2027-status`
  - `kickoff_date: string | null`(`competitions.start_date` where `family = 'rwc' and season = '2027'`)
  - `japan_ranking: number | null` / `japan_ranking_updated_at: string | null`(`teams.world_ranking` / `world_ranking_updated_at` where `slug = 'japan'`)
  - キャッシュ: `PUBLIC_CACHE_CONTROL`相当(頻繁に変わらないデータのため長めのTTLでよい。既存の他エンドポイントのキャッシュ設定を参考にする)
- `lib/api/v1/types.ts` に `V1Rwc2027StatusData` を追加

## UI サーフェス(tryline-mobile)

- `app/(tabs)/index.tsx`のヘッダー(週送りナビゲーションの上、または`MatchStoriesSection`の上)に、常設のバナー的な枠を追加(新規コンポーネント`src/home/Rwc2027Banner.tsx`目安)
- `kickoff_date`がある場合: 「RWC2027まであとN日」(日数計算はクライアント側、JST基準)
- `kickoff_date`がnullの場合: 「Rugby World Cup 2027 開催予定」のように日数を出さない表現にフォールバックする(存在しない情報を捏造しない)
- `japan_ranking`がある場合: 「日本代表 世界{n}位」を併記。ない場合は省略
- タップで`/c/rwc-2027`相当のWeb版ハブへ遷移(`Linking.openURL`で`SITE_URL`ベースのURLを開く。モバイルアプリ内に専用画面は作らない)
- エディトリアル路線(紙・インク・赤アクセント最小限)を踏襲し、派手な演出は入れない

## 受け入れ条件

1. **(tryline)** `/api/v1/rwc2027-status`が`kickoff_date`・`japan_ranking`・`japan_ranking_updated_at`を返すことを確認するテスト
2. **(tryline)** `start_date`がnullの競技会データに対しては`kickoff_date: null`を返すことを確認するテスト(現状のRWC2027はこのケース)
3. **(tryline-mobile)** `kickoff_date`がある場合に正しい残り日数が表示されることを確認するテスト(日付を差し替えたテストデータで)
4. **(tryline-mobile)** `kickoff_date`がnullの場合、日数を出さないフォールバック表示になることを確認するテスト
5. **(tryline-mobile)** `japan_ranking`がある/ない両方のケースの表示を確認するテスト
6. **(tryline-mobile)** バナータップで正しいURLが`Linking.openURL`/ブラウザに渡されることを確認するテスト
7. 両リポジトリで TypeScript strict・lint・test green
8. **Owner 目視**: ホーム画面のRWC2027枠の見た目・タップ動作を確認する

## 未解決の質問

- `kickoff_date`が現状null(公式日程未確定)であるため、**このspec実装後もカウントダウンの日数表示は当面出せない**。日本代表ランキング枠のみが実質的に機能する状態からスタートする。日程が確定次第、既存のcompetitions更新経路で`start_date`を入れればカウントダウンが自動的に動き出す設計にしている
- バナーの正確な設置位置(ヘッダー上/MatchStoriesSectionの上)はCodexの裁量、既存レイアウトとの馴染みを見て判断する
