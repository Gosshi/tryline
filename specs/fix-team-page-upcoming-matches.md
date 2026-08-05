# チームページの次戦表示と日本語チーム名

## 背景

11月に日本代表が Nations Championship でウェールズ（11/7）・イングランド（11/14）・スコットランド（11/21）と対戦する。日本語圏で最も検索需要が見込める3試合であり、集客上の最重要イベントである。

しかし `/teams/japan` は以下の状態にあり、この3試合をユーザーに届けられない。2026-08-06 に本番サイトの実物を確認して特定した。

1. **次戦が5件までしか表示されない。** `getTeamUpcomingMatches` の `limit = 5`（`lib/db/queries/teams.ts:268`）により、8/8 豪州・8/15 @豪州・9/5 カナダ・9/12 米国・10/24 フィジーで打ち切られ、**11月の欧州遠征3試合が表示されない**。日本代表の今後の予定試合は8件ある。

2. **次戦セクションが「直近の試合」の下にある。** ページタイトルは「日本 次戦・日程・結果」だが、次戦に到達するまでスクロールが必要（実測でホイール18ティック）。過去10試合を読み飛ばさないと次戦に着かない。

3. **H1・パンくず・フォローボタンが英語チーム名。** `generateMetadata` は `data.team.nameJa ?? data.team.name` を使う（`app/teams/[slug]/page.tsx:60-61`）のに、本文は `data.team.name` を直参照している（同 `108`, `130`, `141` 行）。`teams.name_ja` にはデータが入っており（title に「日本」と出ている）、単に本文で使われていない。結果として H1 が `Japan`、パンくずが `Tryline / Japan`、ボタンが `Japanを追う` と表示され、「ラグビー 日本代表」系の日本語クエリを取れない。

日本代表の2026年の試合は Nations Championship / Lipovitan Challenge Cup / PNC の3大会に分散しているため、大会ハブでは全日程を1ページで見せられない。チームページが唯一その役割を果たせる面である。

### 既存 spec との関係

`specs/fix-team-page-title-and-broadcast.md`（2026-07-21）は実装済みで、metadata の title/description と次戦セクションの放送バッジ描画、および `loadMatchesByTeamId` への `.gte("kickoff_at", ...)` 追加を完了させている。本 spec はその続きであり、同 spec の対象外だった3点（表示件数・セクション順序・本文の `nameJa`）のみを扱う。実装済み部分は変更しない。

## スコープ

対象:
- チームページ（`app/teams/[slug]/page.tsx`）の次戦セクションの表示件数とセクション順序
- チームページ本文での日本語チーム名（`nameJa`）の使用
- 上記に対応するクエリ（`lib/db/queries/teams.ts`）の上限変更

対象外:
- 放送情報（`match_broadcasts`）のデータ投入。現在テーブルには 2026-07-18 の NC 第3節6試合分（14行）しか存在せず、今後の試合の放送情報はゼロ件。描画ロジックは実装済みなので、これはデータ投入の作業であり本 spec では扱わない
- 会場名（`matches.venue`）の日本語化および Wikipedia 脚注（`Cardiff[9]`、`Tbilisi[19][31]`、`London, England[11]` 等）の除去
- 選手名の日本語表記、トップスコアラーの重複（`Seungsin Lee` と `Lee` が別行）の統合
- チームページの新規セクション追加（H2H、大会別成績など）
- 日本代表専用の新規ページ作成。既存のチームページで要件を満たす
- `components/match-card.tsx`・`TeamStatsPanel`・`TeamPlayersSection` の変更

## データモデル変更

なし。マイグレーション不要。`teams.name_ja` は既存カラムで、日本代表を含む主要チームに投入済み。`TeamRow` / `TeamDetail` への `nameJa` の伝播は `fix-team-page-title-and-broadcast.md` で実装済みのため、追加作業は不要。

## API サーフェス

新規ルートなし。既存関数の既定値変更のみ。

- `getTeamUpcomingMatches(teamId: string, limit = 5)` の既定値を `30` に変更する（`lib/db/queries/teams.ts:266-277`）
  - 本 spec 作成時点で upcoming が最も多いチームは11件（日本・イングランド・スコットランド・ウェールズ・アイルランド・フランス・イタリア）。30 は十分な余裕を持った上限であり、無制限にはしない
  - `getTeamPageDataBySlug` は引数を渡さず既定値を使っているため（`lib/db/queries/teams.ts:292`）、呼び出し側の変更は不要
  - `loadMatchesByTeamId` の絞り込み条件（`status`、`or(home_team_id, away_team_id)`、`gte(kickoff_at, afterIso)`）は変更しない

## UI サーフェス

`app/teams/[slug]/page.tsx` のみ。

### セクション順序

現在: ヒーロー → チームスタッツ → 直近の試合 → 次戦 → 選手

変更後: ヒーロー → チームスタッツ → **次戦** → **直近の試合** → 選手

次戦セクションの JSX（現行 177〜216 行）を、直近の試合セクション（現行 156〜175 行）より前に移動する。各セクションの中身は変更しない。放送バッジの描画ロジック（現行 189〜211 行）もそのまま移動する。

### 次戦セクションの空状態

現在は `upcomingMatches.length > 0` のときだけセクション全体を描画している。この条件分岐は維持する（予定試合がないチームで空見出しを出さない）。

### 日本語チーム名

以下3箇所で `data.team.name` を `data.team.nameJa ?? data.team.name` に変更する。

| 行（現行） | 箇所 | 変更前の表示 | 変更後の表示 |
|---|---|---|---|
| 108 | パンくず末尾 | `Japan` | `日本` |
| 130 | H1 | `Japan` | `日本` |
| 141 | `FavoriteTeamFollowButton` の `teamName` | `Japanを追う` | `日本を追う` |

`nameJa` が null のチームでは従来どおり `name` が表示される（フォールバック維持）。

`TeamBadge` の `shortCode`（121〜124行）と `data.team.country`（133行）は変更しない。`toMatchCardItem` 内の `shortCode` フォールバック（28〜46行）も変更しない。

## LLM 連携

なし。本 spec は表示層のみで、コンテンツ生成パイプラインに影響しない。

## 受け入れ条件

1. `/teams/japan` の次戦セクションに、11/7 ウェールズ戦・11/14 イングランド戦・11/21 スコットランド戦を含む今後の全予定試合が表示される（本 spec 作成時点で8件）。
2. 次戦セクションが「直近の試合」セクションより前に描画される。ブラウザで `/teams/japan` を開いたとき、直近の試合セクションより上に次戦セクションが存在する。
3. `/teams/japan` の H1 が `日本`、パンくず末尾が `日本`、フォローボタンのラベルが `日本を追う` になる。
4. `name_ja` が null のチームのページで、H1・パンくず・フォローボタンが従来どおり英語名で表示され、クラッシュしない。
5. `getTeamUpcomingMatches` の既定 limit が 30 になっている。`status = 'scheduled'` と `kickoff_at >= 現在時刻` の絞り込み条件は変更されていない。
6. 予定試合が0件のチームのページで、次戦セクションの見出しが描画されない（既存の挙動を維持）。
7. 放送情報バッジの描画ロジックが次戦セクションの移動後も従来どおり動作し、`<a>` 要素のネストが発生していない。
8. `generateMetadata` の title / description は変更されていない（`fix-team-page-title-and-broadcast.md` の成果を維持）。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

本 spec の対象外だが、2026-08-06 の `/teams/japan` 実物監査で見つかった問題。それぞれ別 spec を切るかを Owner が判断する。

1. **放送情報がゼロ件**（優先度: 高）。`match_broadcasts` には 2026-07-18 の6試合分（14行）しかなく、8/8 の日本×オーストラリアを含む今後の全試合に放送情報がない。「日本 オーストラリア ラグビー 放送」は日本語圏で最も強い検索意図のひとつで、現状これを取れていない。描画側は実装済みなので、データ投入だけで解決する。

2. **会場名の Wikipedia 脚注が残存**（優先度: 中）。`Mikheil Meskhi Stadium, Tbilisi[19][31]`、`Millennium Stadium, Cardiff[9]`、`Wembley Stadium, London, England[11]`、`Japan National Stadium, Tokyo[7]` など、過去試合のほぼ全件。スクレイパーのクリーンアップ漏れ。

3. **会場名の言語が混在**（優先度: 中）。9/5「デンカビッグスワンスタジアム」に対し 9/12「Hanazono Rugby Stadium, Higashiōsaka」、8/15「North Queensland Stadium, Townsville」。同一ページ内で日英が混ざる。

4. **選手名が英語表記**（優先度: 中）。`Akito Okui`、`Amato Fakatava`、`Asaeli Ai Valu`、`Atsushi Sakate`。過去に日本代表選手の漢字表記バックフィルを実施しているが、チームページの選手セクションとトップスコアラーには反映されていない。

5. **トップスコアラーの選手重複**（優先度: 中）。`Seungsin Lee`（130点）と `Lee`（43点）が別行で並んでおり、同一選手が分裂している疑いがある。

6. **7/11 日本×アイルランドの会場が `Newcastle Stadium, Newcastle｜Awabakal-Worimi, Australia`**（優先度: 要確認）。日本のホーム戦のはずが豪州の会場になっている。データ汚染の可能性があり、事実確認が必要。
