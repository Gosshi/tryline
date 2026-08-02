# RWC2027ハブページのSEO強化（開催都市・視聴方法・FAQ構造化データ）

## 背景

`docs/growth-audit-2026-07-01.md`・`[[rwc2027]]`スキルの実測（2026-07）で、「ラグビーワールドカップ 2027 日程」等の実検索需要がGSCに存在するにもかかわらず、`/c/rwc/2027`の平均順位が29〜58位・クリック0と低迷していることが判明していた。

`fix-rwc2027-hub-page-gate.md`（マージ済み）で「Coming Soon」誤表示は解消済みだが、`app/c/rwc/2027/page.tsx`は他の大会ハブが使っている汎用テンプレート`app/c/[competition]/[season]/page.tsx`とは別の独自実装（プール分け・ブラケット表示のため2026年前半に個別作成）であり、汎用テンプレートには後から追加されたSEO機能が backport されていない。具体的に欠けているのは以下の3点（コード調査で確認済み、`app/c/rwc/2027/page.tsx`に該当箇所なし）:

1. **開催都市・会場一覧**: `matches`テーブルの`venue`列は既に全36試合分（プールステージ）に投入済み（8会場、DB実測で確認済み: Adelaide Oval等）。表示側の実装が無いだけ
2. **視聴方法（大会ガイド）**: `competition_guides`テーブルに`family='rwc'`の行が既に存在し、`guide_ja`（Markdown）・`source_url`（`https://www.rugbyworldcup.com/2027/en`）・`verified_at`（2026-07-09）まで投入済み（DB実測で確認済み）。汎用テンプレートが使う`getCompetitionGuide`＋`CompetitionViewingGuide`コンポーネントを呼んでいないだけ
3. **FAQPage構造化データ**: 汎用テンプレート（`app/c/[competition]/[season]/page.tsx:481-515`）には計算済みデータ（開催期間・次戦日程・順位表有無）から自動生成するFAQPage JSON-LDが既にあるが、RWC2027ページには無い

つまり**新規データ収集は不要**で、既存データ・既存コンポーネント・既存パターンを`/c/rwc/2027`に配線するだけの作業。

## スコープ

対象:
- `app/c/rwc/2027/page.tsx`に以下を追加する
  1. **開催都市セクション**: 既にページ内で取得済みの`matches`（`listMatchesForCompetition("rwc-2027")`の戻り値、`MatchListItem.venue`を含む）から一意な会場を抽出し、簡潔なグリッド/リストで表示する。新規クエリは不要（`[...new Set(matches.map(m => m.venue).filter(Boolean))]`のような抽出で足りる）。見出し例:「開催都市・会場」
  2. **視聴方法（大会ガイド）セクション**: `getCompetitionGuide("rwc")`を呼び、`components/competition-viewing-guide.tsx`の`CompetitionViewingGuide`コンポーネントをそのまま使って表示する（他の大会ハブと同一パターン、`app/c/[competition]/[season]/page.tsx`の該当箇所を参照）
  3. **FAQPage構造化データ**: `app/c/[competition]/[season]/page.tsx:481-515`の`seasonFaqs`/`seasonFaqJsonLd`パターンを踏襲し、RWC2027向けに以下のFAQを生成する（すべて既存の計算済みデータから動的生成、ハードコードしない）:
     - 「ラグビーワールドカップ2027はいつ開催されますか？」→ 試合日程の最小・最大kickoff日時から算出（`lib/format/kickoff.ts`の`formatKickoffJstDate`を利用）
     - 「ラグビーワールドカップ2027はどこで開催されますか？」→ 開催都市数・国（オーストラリア）を回答に含める
     - 「ラグビーワールドカップ2027はどこで見られますか？」→ 視聴方法セクションの内容から要約（生成タイミングでの厳密な放送局名列挙が難しい場合は、既存の汎用テンプレートと同様の一般的な文言で可）
     - 「日本代表の次の試合はいつですか（日本時間）？」→ 既存の次戦計算ロジック（`listMatchesForCompetition`の結果から日本代表が絡む次の未消化試合を抽出。既存の汎用テンプレートに近い実装があれば参照する）
     - JSON-LDは`<script type="application/ld+json">`でページ内に埋め込む（既存パターンと同じ配置方法に従う）

対象外:
- `competition_guides`・`matches.venue`データの新規投入・修正（既に完備、参照のみ）
- ノックアウトブラケットページ（`app/c/rwc/2027/bracket/page.tsx`）の変更
- 汎用テンプレート`app/c/[competition]/[season]/page.tsx`自体の変更（RWC2027ページ側だけを直す。将来的に両ページの重複を統合するかはOwner判断の別タスク）
- 開催都市の詳細情報（アクセス方法・座席数等）の追加。会場名・都市名の一覧表示のみ

## データモデル変更

なし。既存の`matches.venue`・`competition_guides`を参照するのみ。

## API サーフェス

なし。サーバーコンポーネントページの表示変更のみ。

## UI サーフェス

`app/c/rwc/2027/page.tsx`:
- 現在のヘッダー（大会タイトル・ブラケットリンク）とプール順位表・試合一覧セクションの構成は維持
- 「開催都市・会場」セクションを試合一覧セクションの前後いずれか適切な位置に追加
- 「視聴方法」（`CompetitionViewingGuide`）セクションを追加。既存の大会ハブ（例: `/c/nations-championship/2026`）と一貫した見た目・トーンにする（デザイン方向は既存トークン`app/globals.css`のCSS変数を使う。新しい配色・独自コンポーネントは作らない）
- FAQPage JSON-LDは`<head>`相当の埋め込みで、画面上のFAQ表示（アコーディオン等）は本spec範囲外（構造化データのみで良い。表示UIが必要かはOwner判断、まずは構造化データのみで様子を見る）

## LLM 連携

なし。

## 受け入れ条件

1. `/c/rwc/2027`にアクセスすると、既存の36試合の`venue`から重複排除した会場一覧（8件）が画面に表示される
2. `/c/rwc/2027`に`family='rwc'`の`competition_guides`データを使った「視聴方法」セクションが表示され、`verified_at`・`source_url`が既存の大会ハブと同じ形式で表示される
3. `/c/rwc/2027`のHTMLソースに`FAQPage`型のJSON-LD（`<script type="application/ld+json">`）が含まれ、Google の Rich Results Test（またはスキーマバリデータ）で有効と判定される
4. 既存のプール順位表・ブラケットリンク・試合一覧表示に回帰がないこと（既存テストがあれば通ること、無ければ簡易なスナップショット/レンダリングテストを追加する）
5. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が通る
6. Ownerによる目視確認: 既存の大会ハブページ（`/c/nations-championship/2026`等）と並べて、デザイントーンが不自然に浮いていないこと

## 未解決の質問

- 「日本代表の次の試合」FAQの算出ロジックについて、汎用テンプレート側に完全一致する既存関数が無い場合、Codexは実装前に既存の類似ロジック（例: `getNextMatchForTeamSlug`、ホームページのnext-kickoffロジック）を確認し、無理に新規ロジックを作らず既存関数を再利用できないか検討すること。判断に迷う場合は実装を止めてOwnerに確認する
- FAQPageの表示UI（アコーディオン等）を今回追加するかは対象外としたが、構造化データのみで十分なSEO効果があるかは次回のGSC観測（2〜3週間後）で判断する
