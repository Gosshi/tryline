# feat-lipovitan-challenge-cup-2026: リポビタンDチャレンジカップ2026の取り込み

## 背景

2026-07-21、WOWOWの告知投稿から8月の日本×オーストラリア戦の存在が分かり、DB実測で2026年8月の試合が全大会通じて0件だったことから調査を開始した。当初「日豪単発2試合シリーズ」とスコープした仕様書（`feat-japan-australia-test-series-2026.md`、本specに置き換え）を書いたが、**Ownerの指摘により対象がオーストラリア戦だけでないことが判明した**。

日本語版Wikipedia「[リポビタンDチャレンジカップ2026](https://ja.wikipedia.org/wiki/%E3%83%AA%E3%83%9D%E3%83%93%E3%82%BF%E3%83%B3D%E3%83%81%E3%83%A3%E3%83%AC%E3%83%B3%E3%82%B8%E3%82%AB%E3%83%83%E3%83%972026)を2026-07-21に確認したところ、これは大正製薬冠スポンサーの**日本代表2026年国内開催テストマッチシリーズ**で、以下4試合から成る:

| # | 日付 | 対戦カード | 会場 | キックオフ | 結果 |
|---|------|-----------|------|-----------|------|
| 1 | 2026-06-27 | JAPAN XV vs マオリ・オールブラックス | パロマ瑞穂スタジアム（愛知県名古屋市） | 19:05 JST | 31-38（既に終了） |
| 2 | 2026-08-08 | 日本代表 vs オーストラリア代表 | 花園ラグビー場（大阪府東大阪市） | 19:05 JST | 未定 |
| 3 | 2026-09-05 | 日本代表 vs カナダ代表 | デンカビッグスワンスタジアム（新潟県新潟市） | 14:50 JST | 未定 |
| 4 | 2026-10-24 | 日本代表 vs フィジー代表（日本協会100周年記念試合） | 秩父宮ラグビー場（東京都港区） | 14:50 JST | 未定 |

さらに、英語版Wikipedia「[2026 Australia–Japan rugby union test series](https://en.wikipedia.org/wiki/2026_Australia%E2%80%93Japan_rugby_union_test_series)」によれば、オーストラリア戦はホーム&アウェーの2試合シリーズで、上表の8/8（日本開催）に加えて **2026-08-15、North Queensland Stadium（Townsville, Australia）でオーストラリア開催の2nd Test（アウェー）が別途存在する**。この試合はリポビタンDチャレンジカップのブランディング上は含まれない（同カップは日本開催試合の冠スポンサー名のため）が、同じ対オーストラリア2連戦の一部である。

DB実測（`teams`テーブル）: `japan`は既存。`JAPAN XV`・`マオリ・オールブラックス`・`カナダ`・`フィジー`のうち、`Canada`・`Fiji`は既存チームとして存在するはずだが未確認、`JAPAN XV`・`Maori All Blacks`はチームとして存在しない（要確認・要新規追加判断）。

## スコープ

対象:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` を新規作成し、`lib/scrapers/wikipedia-autumn-nations-results.ts` と同じ構造で、日本語版Wikipedia「リポビタンDチャレンジカップ2026」記事から試合の日程・会場・スコアを抽出する
- `scripts/import-lipovitan-challenge-cup-results.ts` を新規作成し、`scripts/import-autumn-nations-results.ts` と同じ構造で以下の値を使う:
  - `family`: `lipovitan-challenge-cup`
  - `slug`: `lipovitan-challenge-cup-2026`
  - `name`: `Lipovitan-D Challenge Cup 2026`
  - `name_ja`: `リポビタンDチャレンジカップ2026`
  - `season`: `2026`
- 対象試合（v1）: 上表の **#2（対オーストラリア・ホーム）・#3（対カナダ）・#4（対フィジー）の3試合**。チームは既存の `japan` / `australia` / `canada` / `fiji`（`canada`・`fiji`の存在をCodexが実装時に確認し、なければ新規追加する）
- オーストラリア戦アウェー（2026-08-15、Townsville）は同じ`lipovitan-challenge-cup-2026`大会に含めて表示する（Owner判断: ブランディング上は別だが、ファン体験としては同一の日豪シリーズとして1つのハブにまとめる）。この試合は英語版Wikipedia「2026 Australia–Japan rugby union test series」を追加の情報源として使う
- `lib/format/competition.ts` の `FAMILY_DISPLAY_NAMES` に `"lipovitan-challenge-cup": "リポビタンDチャレンジカップ"` を追加する
- `app/c/[competition]/page.tsx` の `COMPETITION_DESCRIPTIONS` に `"lipovitan-challenge-cup"` のエントリを追加する（内容例: 「リポビタンDチャレンジカップは大正製薬冠スポンサーの日本代表国内開催テストマッチシリーズ。2026年はオーストラリア・カナダ・フィジー代表と対戦します。」）

対象外（v1）:
- **JAPAN XV vs マオリ・オールブラックス戦（#1、2026-06-27）**: `JAPAN XV`・`マオリ・オールブラックス`という新規チームエンティティの追加が必要になり、かつ日本代表（フルキャップの`japan`チーム）の試合ではないため、本カップの主対象からは切り離す。既に終了した試合でもあり、Owner判断で別途対応するかを決める（未解決の質問に記載）
- `getCompetitionHeroImage` への専用ヒーロー画像追加（デフォルトフォールバックで十分）
- `getCompetitionFamilyColor` への専用色追加（デフォルト色で十分）
- 自動cron化（`autumn-nations`と同様、手動実行のCLIスクリプトのままでよい）
- `rugby-championship-2026`（0試合のまま残る既存競技行）の扱い — 別途Owner判断

## データモデル変更

なし。既存の `competitions` / `teams` / `matches` テーブルへの行追加のみ（スキーマ変更なし）。`canada` / `fiji` チームが未登録の場合のみ `teams` への新規行追加が発生する。

## API サーフェス

なし。新規HTTP APIは追加しない。

## LLM連携

なし。スクレイピング・DB書き込みのみで、LLM呼び出しは発生しない。

## 受け入れ条件

1. `pnpm tsx scripts/import-lipovitan-challenge-cup-results.ts 2026` を実行すると、`competitions` テーブルに `slug=lipovitan-challenge-cup-2026`・`family=lipovitan-challenge-cup`・`name_ja=リポビタンDチャレンジカップ2026` の行が作成される
2. 同スクリプト実行後、`matches` テーブルに3試合（2026-08-08 花園・対オーストラリア、2026-09-05 デンカビッグスワン・対カナダ、2026-10-24 秩父宮・対フィジー）に加え、2026-08-15 Townsville・対オーストラリア（アウェー）の計4試合が存在する
3. 各試合のキックオフ時刻はCodexが一次情報（Wikipedia本文・JRFU公式・Rugby Australia公式）で確認した正確な値が入っている（本specに記載の時刻を裏取りなしにそのまま転記しない）
4. `canada` / `fiji` チームが `teams` テーブルに存在しない場合、正しい `name` / `slug` / `name_ja` で新規追加される
5. `/c/lipovitan-challenge-cup-2026` にアクセスすると404にならず、4試合が表示される（順位表を持たない大会のため、順位表セクションが空でもエラーにならない）
6. `formatFamilyName("lipovitan-challenge-cup")` が `"リポビタンDチャレンジカップ"` を返す
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. 本番DBへの実際の書き込み（スクリプト実行）はOwner承認後に別途行う。本specの実装自体はスクリプト・スクレイパー・表示設定の実装とテストまでで完了とする

## 未解決の質問

- JAPAN XV vs マオリ・オールブラックス戦（2026-06-27、既に終了）を別途取り込むかはOwner判断。取り込む場合は `JAPAN XV`・`Maori All Blacks` を新規チームとして追加する必要があり、「日本代表の試合」という前提を崩すため別specとするのが妥当
- オーストラリア戦アウェー（Townsville）を同一大会に含める設計（本specで採用）でよいか最終確認。ブランディング上厳密には別物という点をOwnerが把握した上での判断であることを完了報告で明記する
- このシリーズにプレビュー/レビュー（LLM生成コンテンツ）を通常大会と同様に生成するかは別途Owner判断
- `rugby-championship-2026` の空競技行をどう扱うか（本specの対象外、別途判断）
