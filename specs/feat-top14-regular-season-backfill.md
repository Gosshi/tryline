# Top14 レギュラーシーズンの試合データをバックフィルする

## 背景

2026-07-08〜09 の集客・データ品質分析で、Top14 の試合カバレッジが極端に薄いことが判明した。本番DB実測:

| シーズン | 試合数 | 期間 |
|------|---:|------|
| 2025-26 | 5 | 2026-06-13 〜 2026-06-27（プレーオフのみ） |
| 2024-25 | 6 | 2025-06-13 〜 2025-06-28（プレーオフのみ） |

Top14 は14チームによる2回総当たり（レギュラーシーズン26節・182試合）+プレーオフの構成だが、**レギュラーシーズンの試合が1件もDBに存在しない**。

原因は既存の取り込みスクリプト `scripts/import-top-14-results.ts` にある。このスクリプトは `EXPECTED_MIN_MATCH_COUNT = 5`（12行目）というプレーオフ想定の閾値を持ち、データソース `lib/scrapers/wikipedia-top-14-results.ts` の `SECTION_ROUNDS`（24-28行目）も `Relegation_play-off`・`Semi-final_Qualifiers`・`Semi-finals`・`Final` のみをマッピングしている。つまり**このスクリプトは意図的にプレーオフのみを対象に作られており、レギュラーシーズンは元から対象外**だった。

Wikipedia側（`https://en.wikipedia.org/wiki/{season}_Top_14_season`）を実際に確認したところ、レギュラーシーズンは URC・Six Nations のような「Round N」個別セクションではなく、**対戦マトリックス（Match grid）形式**で結果が一覧されており、個々の試合の日付・会場情報が含まれない。SRPで存在した「List of matches」形式の補助ページも Top14 には存在しない（404確認済み）。**Wikipedia経由でのレギュラーシーズン全試合バックフィルは、日付・会場データの欠如により困難**と判断した。

一方、既存の `specs/feat-top14-team-stats.md`（未実装、スタッツ追加のみが対象）の事前調査で、**Top14公式サイト（top14.lnr.fr）が全ラウンドの試合一覧を機械的に列挙できる**ことが既に確認されている:
- `https://top14.lnr.fr/calendrier-et-resultats/{season}/{roundSlug}` が200を返し、該当ラウンドの全試合（対戦カード・日付・会場・スコア・`feuille-de-match` リンク）をSSR HTMLで取得できる
- レギュラーシーズンは `j1`〜`j26`、プレーオフは `demi-finales`/`finale` 等のslugで機械的に列挙可能
- `robots.txt` は `/calendrier-et-resultats` を Disallow していない（`feat-top14-team-stats.md` で確認済み）

本specは、この既に検証済みのLNR公式サイトのラウンド一覧ページを使い、**レギュラーシーズン全試合の基本情報（対戦カード・日付・会場・スコア）**をバックフィルする。

## スコープ

対象:
- `lib/scrapers/top14-lnr-results.ts`（新規）: `top14.lnr.fr/calendrier-et-resultats/{season}/{roundSlug}` から各ラウンドの試合一覧（対戦カード・日付・会場・スコア）を取得する読み取り専用スクレイパー
- `scripts/backfill-top14-regular-season.ts`（新規）: 2025-26・2024-25シーズンの j1〜j26 全ラウンドを取得し `matches` テーブルにバックフィルするCLI（`--dry-run`・Owner承認ゲート必須）
- 取得した試合の `external_ids` に `top14_lnr_id`（`feat-top14-team-stats.md` が今後スタッツ紐付けに使う想定のID）を保存し、将来の team-stats spec 実装時にそのまま使えるようにする

対象外:
- チームスタッツ（ポゼッション率・テリトリー率等）の取得（`feat-top14-team-stats.md` の対象。本specはあくまで試合の基本情報のみ）
- 試合イベント（トライ・得点経過等、`match_events`）の取得。LNRの `feuille-de-match` ページに詳細情報がある可能性はあるが、本specは一覧ページの基本情報に限定する（イベント取得は既存の `scripts/backfill-top14-match-events.ts` の対象範囲を確認し、必要なら別spec）
- 過去シーズン（2024-25より前）の遡及バックフィル。まず直近2シーズンで動作確認してから拡張判断する
- recap/preview の生成・再生成（バックフィル後、通常のコンテンツ生成パイプラインが対象試合を自然に処理する）

## データモデル変更

なし（既存 `matches` テーブル、`external_ids` JSONBへの新規キー追加のみ）。

## API サーフェス

なし。

## スクレイピング / コンプライアンス

- 取得は `top14.lnr.fr` のみ。`lib/scrapers/fetcher.ts` の `fetchWithPolicy`（robots.txt準拠・レート制限）を必ず経由する
- `feat-top14-team-stats.md` で確認済みの robots.txt 許可範囲（`/calendrier-et-resultats`・`/feuille-de-match`）を超えない
- 26ラウンド×2シーズン=52ページ相当のリクエストになるため、レート制限を守り、既存の同種バックフィルスクリプト（`scripts/backfill-standings.ts` 等）と同じ作法（`--dry-run` で対象件数を確認してから実行、Owner承認ゲート）を踏襲する

## LLM 連携

なし。

## 受け入れ条件

1. `node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-top14-regular-season.ts --season=2025-26 --dry-run` で、レギュラーシーズン26節相当（182試合前後）の取り込み対象件数が表示される
2. 実行後、`matches` テーブルの Top14 2025-26 シーズンの試合数が5件から180件超に増える（プレーオフとの重複なし、重複防止のupsert条件を既存スクリプトと同様に設定する）
3. 各試合に対戦カード・日付・会場・最終スコアが正しく格納されている（サンプル数件を実データと突き合わせて確認する）
4. 既存のプレーオフ試合（5件/6件）が重複登録・上書き破壊されない
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番DBへの実書き込みはOwner承認後に別途実施する。本spec自体はコード実装・テスト・`--dry-run`確認までで完了とする

## 未解決の質問

- チームslugの名寄せ（LNR公式サイトのチーム表記 ↔ Tryline内部のteam slug）は `feat-top14-team-stats.md` で調査済みの対応表があれば流用し、無ければ本spec実装時に新規に確認する
- `feuille-de-match` ページに試合詳細（得点経過等）が含まれる場合、将来の `match_events` 取得（別spec）でこのバックフィルのデータ（`top14_lnr_id`等）をそのまま再利用できる設計にしておくことが望ましい。実装時に軽く考慮する程度でよく、本spec内での実装は不要
