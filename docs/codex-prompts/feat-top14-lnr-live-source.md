`/specs/feat-top14-lnr-live-source.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 急ぎです

**Top 14 の 2026-27 シーズンは 2026-09-05(土) 開幕**ですが、Tryline には1試合も入っていません。URC・プレミアシップ（9/25開幕）より3週間早いです。

## 先に読む既存 spec があります

**`specs/feat-top14-regular-season-backfill.md` が同じデータソースに到達済み**です（2026-07 作成、未実装）。成果物が違うので置き換えではありません。

| | 既存 spec | 本タスク |
|---|---|---|
| 成果物 | CLI（`scripts/backfill-top14-regular-season.ts`） | **live source** |
| 対象 | 2025-26 / 2024-25 | **2026-27** |

**スクレイパーは共有します。** 既存 spec が `lib/scrapers/top14-lnr-results.ts` を想定しているので、**その名前で作ってください。** 既存 spec は後からこれを再利用します。

**CLI スクリプトは今回作りません。**

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `specs/feat-top14-regular-season-backfill.md` | 既存の想定（モジュール名・`top14_lnr_id`） |
| `lib/ingestion/sources/league-one-live.ts` | **Wikipedia 以外の live source の前例**（`league-one.jp`）。構造の雛形 |
| `lib/ingestion/live-competitions.ts` | 登録の書き方 |
| `lib/scrapers/fetcher.ts` | `fetchWithPolicy`（robots.txt 準拠・レート制限） |
| `lib/ingestion/upsert.ts` | `external_ids` による同一試合判定 |

## 落とし穴が4つあります。全部踏むと静かに壊れます

**1. チーム名が14中4件、DB と一致しません**

spec の対応表を必ず使ってください。**2026-08-28 に実サイトと本番 DB の両方から取得して照合した確定表**です。

- `ASM Clermont` ≠ `ASM Clermont Auvergne`
- **`LOU Rugby` ≠ `Lyon OU`**（完全に別表記）
- `Stade Français Paris` ≠ `Stade Français`
- `Union Bordeaux-Bègles` ≠ `Union Bordeaux Bègles`（ハイフンと空白）

素直に名前照合すると、**1節7試合のうち最大4試合が黙って落ちます。** Premiership で18試合が消えたニューカッスル改称と同じ構造です。

**そして対応表に無いチームが出たら、件数と名前を必ずログとレスポンスに出してください。** 黙って `continue` しないこと。昇降格で毎年チームが入れ替わるので、可視化が無いと来季また同じ事故になります。

**2. URL スラッグからチームを判定できません**

`11820-bordeaux-begles-racing-92` は**どこで区切るか決められません**。**表示名から判定してください。** HTML には `Aviron Bayonnais` `RC Toulon` のように正式名称がそのまま入っています。

**3. 日付に年がありません**

`samedi 05 septembre` の形式です。シーズン `2026-2027` から導出してください。

- 9〜12月 → 2026
- 1〜6月 → 2027

**4. タイムゾーンを固定オフセットにしないでください**

時刻は `19h05` 形式のフランス現地時刻です。**IANA の `Europe/Paris` を使ってください。**

- 9月（開幕）は **CEST = UTC+2**
- 12月〜3月は **CET = UTC+1**

固定 `+02:00` で通すと**冬の試合が1時間ずれます**。`project_narrative_date_utc_leak` で日付が1日ずれる事故が既に起きている領域です。**秋と冬の両方をテストで押さえてください。**

## 節単位で取ってください（Owner 判断）

**全26節を一括で取らないでください。**

CGU にデータベース権の主張はありませんが、フランスには法律上 sui generis データベース権があり、182試合の一括取得は「実質的な部分の抽出」にあたる可能性があります。**Owner の判断で節単位に絞ります。**

- 取得対象の節を指定できるようにする
- 既定は「現在進行中の節とその前後」程度の狭い範囲（**全節ではない**）
- 1回の実行で取得する節数に**上限を定数で持つ**
- 節と節の間に**待機を入れる**

## パス形式を使ってください

```
https://top14.lnr.fr/calendrier-et-resultats/2026-2027/j1
```

**クエリ形式（`?weekName=J2`）は機能しません**（実測で j1 が返ります）。robots.txt が `/videos/` 配下で `?weekName=*` を禁止していて紛らわしいので、パス形式に統一してください。

`www.lnr.fr/rugby-top-14` は 301 リダイレクトします。**最初から `top14.lnr.fr` を使ってください。**

## 検算表（2026-08-28 実測）

| 節 | 試合数 | 日付 |
|---|---:|---|
| j1 | 7 | samedi 05 septembre / dimanche 06 septembre |
| j2 | 7 | samedi 12 septembre / dimanche 13 septembre |
| j13 | 7 | samedi 26 décembre 前後 |
| j26 | 7 | samedi 05 juin 前後 |
| **j27** | **0** | レギュラーシーズンは26節で確定 |

サーバーレンダリングの HTML です。**JS レンダリング待ちは不要**です。

## やってはいけないこと

- **`skipRobotsCheck` の使用。** 2026-08-12 に MediaWiki API で robots 違反を踏んだ前例があります
- `lib/ingestion/sources/wikipedia-top-14.ts` の変更・削除（6月の決勝5〜6件はここ由来）
- **決勝トーナメント（phases finales）の取り込み。** 本タスクは **j1〜j26 のみ**
- `teams` / `competitions` への INSERT・マイグレーション・シード追加（**14チームすべて登録済み**）
- `lib/llm/sourced-facts/allowlist.ts` の変更（**取り込み経路と sourced facts の allowlist は別系統**）
- CLI スクリプトの実装（既存 spec の対象）
- 過去シーズン（2025-26 / 2024-25）の取り込み
- 手作り HTML フィクスチャ（**実ページから取得したものを使う**）

## 完了の定義

spec の「受け入れ条件」22項目をすべて満たすこと。特に:

- **4件の不一致チームが正しく解決されるテスト**
- **未対応チームの件数と名前が出ることのテスト**
- **秋（CEST）と冬（CET）の両方で UTC 変換が正しいテスト**
- j1 の7試合が検算表どおりにパースできるテスト
- `git diff -- lib/ingestion/sources/wikipedia-top-14.ts` が**空**
- `git diff -- lib/llm/sourced-facts/allowlist.ts` が**空**
- `supabase/migrations/` と `supabase/seeds/` に新規ファイルが無い
- `grep -rn "skipRobotsCheck"` に新規の使用箇所が無い
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **パースできた j1 の7試合**（kickoff UTC・home・away）と検算表との一致
- **秋と冬で UTC オフセットが変わることの確認結果**（例: j1 と j13 の変換後の値）
- 1回の実行で取得する節数の上限（定数名と初期値）
- 未対応チームの可視化をどこに出したか
- `git diff --stat`
