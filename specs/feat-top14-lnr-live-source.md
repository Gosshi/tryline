# Top 14 2026-27 を lnr.fr から継続取り込みする（live source）

## 背景

**Top 14 の 2026-27 シーズンは 2026-09-05(土) に開幕するが、Tryline には1試合も入っていない。** DB 実測（2026-08-28）で `top-14-2026-27` は **0件**。URC（144件）・プレミアシップ（90件）が9/25開幕分まで揃っているのと対照的。

Top 14 のレギュラーシーズンは **26節 × 7試合 = 182試合**。

### 既存 spec との関係（重要）

**`specs/feat-top14-regular-season-backfill.md` が既に存在し、同じデータソースに到達している。** ただし成果物が違う。

| | 既存 spec | 本 spec |
|---|---|---|
| 成果物 | **CLI スクリプト**（`scripts/backfill-top14-regular-season.ts`） | **live source**（`LIVE_COMPETITION_SOURCES` への登録） |
| 対象 | **2025-26 / 2024-25**（過去シーズン） | **2026-27**（現行シーズン） |
| 実行 | Owner が手動で1回 | cron が継続的に |

**現行シーズンはスコアが毎週更新されるため、CLI の一括投入では追随できない。** 本 spec が先に必要。

**スクレイパー部分は共有する。** 既存 spec が `lib/scrapers/top14-lnr-results.ts` を想定しているので、**本 spec でそのモジュールを作り、既存 spec は後からそれを再利用する。**

### 既存 spec が保留していた点を本 spec で確定させる

既存 spec の未解決の質問はこうなっていた。

> チームslugの名寄せ（LNR公式サイトのチーム表記 ↔ Tryline内部のteam slug）は（中略）**無ければ本spec実装時に新規に確認する**

**2026-08-28 に実サイトと本番 DB の両方から取得して照合済み。** 後述の確定表を使うこと。**4チームが一致しない。**

### D016 決定5 を覆す

`docs/decisions.md` D016 決定5 は「Top 14 のレギュラーシーズンは Wikipedia では修復不能」とし、**「別ソースの確保（例: lnr.fr の規約監査）が必要で、本決定の範囲外」**としていた。本 spec がその監査を経た結論にあたる。

### 需要は実測で確認済み

D016 は「集客上の優先度は低い（GSC で Top 14 の検索需要は未確認）」と棚上げしていたが、この前提は覆っている。GSC 実測（28日、2026-08-27 取得）で `/c/top-14/2025-26` が **28インプレッション・掲載順位 6.6位**。ほぼ空のページで既に6.6位を取っている。

## 規約・robots.txt の監査結果（2026-08-28 実施）

**既存 spec は robots.txt しか確認していない。** `project_sourced_facts_domain_compliance` の教訓（robots.txt がクリーンでも規約で禁止の実例が allblacks.com にあった）に従い、規約も監査した。

| 観点 | 結果 |
|---|---|
| `www.lnr.fr/robots.txt` | 全16行。日程・結果ページは**禁止されていない** |
| `top14.lnr.fr/robots.txt` | **同一内容**（ホスト単位で別途確認済み） |
| AI ボット専用ブロック | **無し**（GPTBot / OAI-SearchBot / ChatGPT-User / CCBot いずれも記載なし） |
| CGU に scraping 禁止 | **無し**（全文22KB 中 `robot` の語が **0回**） |
| CGU に AI 利用禁止 | **無し** |
| CGU にデータベース権の主張 | **無し**（`base de données` / `extraction` / `réutilisation` すべて **0回**） |
| CGU 4.1条 | Contenu の複製を私的利用に限定 → **B型（著作権ベース）** |

robots.txt が禁止しているのは `/face-a-face/*`、`/videos/` 配下のクエリ、`/recherche?q=*`、`/inscription*`、`/connexion*`、`/social/*` のみ。

**A型（行為の禁止）に該当する条項が1つも無いため、2026-08-18 に Owner が定めた基準では許容。**

### EU データベース権への配慮（Owner 判断 2026-08-28）

CGU に主張は無いが、**フランスには法律上 sui generis データベース権があり「実質的な部分の抽出」が制限され得る**。182試合の一括取得は実質的な部分にあたる可能性がある。

**Owner の判断は「節単位で取る」。** 後述の設計制約を必須とする。

## スコープ

対象:
- `top14.lnr.fr` の節別ページから試合を取得するスクレイパーの新設
- それを使う live source の新設と `LIVE_COMPETITION_SOURCES` への登録
- **節単位フェッチ**（取得範囲の制御・上限・待機）

対象外:
- **`scripts/backfill-top14-regular-season.ts` の実装**（既存 spec の対象。本 spec のスクレイパーを再利用して後から行う）
- **過去シーズン（2025-26 / 2024-25）の取り込み**
- **決勝トーナメント（phases finales）**。現在6月の5〜6件は `wikipedia-top-14.ts` 由来。本 spec は **j1〜j26 のみ**
- `lib/ingestion/sources/wikipedia-top-14.ts` の変更・削除
- チームスタッツ（`feat-top14-team-stats.md` の対象）
- 得点イベント（`match_events`）
- `teams` / `competitions` への追加（**すべて登録済み**）
- `lib/llm/sourced-facts/allowlist.ts` の変更（**取り込み経路と sourced facts の allowlist は別系統**）
- Pro D2

## 取得元

```
https://top14.lnr.fr/calendrier-et-resultats/{season}/j{round}
例: https://top14.lnr.fr/calendrier-et-resultats/2026-2027/j1
```

**`www.lnr.fr/rugby-top-14` は `top14.lnr.fr` へ 301 リダイレクトする。最初から `top14.lnr.fr` を使う。**

### パス形式を使う。クエリ形式を使わない

`?weekName=J2` 形式は**機能しない**（実測で j1 が返る）。加えて robots.txt が `/videos/` 配下で `?weekName=*` を禁止しており紛らわしい。

### 節の範囲

**j1〜j26 がレギュラーシーズン。実測で j27 は0件。** 各節7試合。

## 期待される取得結果（検算用・2026-08-28 実測）

| 節 | 試合数 | 日付 |
|---|---:|---|
| j1 | 7 | samedi 05 septembre / dimanche 06 septembre |
| j2 | 7 | samedi 12 septembre / dimanche 13 septembre |
| j13 | 7 | samedi 26 décembre 前後 |
| j26 | 7 | samedi 05 juin 前後 |
| j27 | **0** | 存在しない |

**サーバーレンダリングの HTML で取得できる。JS レンダリング待ちは不要**（`project_official_stats_unreachable` の springboks.rugby とは異なる）。

## チーム名の対応表（最重要・実測確定）

**サイトの表記と `teams.name` は14チーム中4チームで一致しない。** 素直に名前照合すると1節7試合のうち最大4試合が黙って落ちる。

**これは Premiership で18試合が消えたニューカッスル改称と同じ構造の事故**（`project_wikitext_migration_followups`）。

| サイトの表示名 | `teams.slug` | 備考 |
|---|---|---|
| `ASM Clermont` | `clermont` | ❌ DB は `ASM Clermont Auvergne` |
| `Aviron Bayonnais` | `bayonne` | ✅ |
| `Castres Olympique` | `castres` | ✅ |
| `LOU Rugby` | `lyon` | ❌ DB は `Lyon OU`（**完全に別表記**） |
| `Montpellier Hérault Rugby` | `montpellier` | ✅ |
| `RC Toulon` | `toulon` | ✅ |
| `RC Vannes` | `vannes` | ✅ |
| `Racing 92` | `racing-92` | ✅ |
| `Section Paloise` | `pau` | ✅ |
| `Stade Français Paris` | `stade-francais` | ❌ DB は `Stade Français` |
| `Stade Rochelais` | `la-rochelle` | ✅ |
| `Stade Toulousain` | `toulouse` | ✅ |
| `USA Perpignan` | `perpignan` | ✅ |
| `Union Bordeaux-Bègles` | `bordeaux-begles` | ❌ DB は `Union Bordeaux Bègles`（ハイフンと空白） |

**14チームすべて `teams` に登録済みで `name_ja` もある。新規追加は不要。**

### URL スラッグからチームを判定しない

`feuille-de-match/2026-2027/j1/11820-bordeaux-begles-racing-92` のように**複数語のスラッグが連結されるため分割できない**。**表示名から判定する。**

### 未対応チームを黙って飛ばさない

対応表に無いチーム名が出たら、**その試合をスキップしたうえで件数と名前をログに出し、レスポンスにも件数を含める。** 昇降格でチームは毎年入れ替わるため、可視化が無いと翌シーズンに同じ事故が再発する（D016 未解決の質問でも同じ仕組みが要求されている）。

## 日時の扱い

### 年がページに無い

日付は `samedi 05 septembre` 形式で**年を含まない**。シーズン（`2026-2027`）から導出する。

- **9月〜12月 → 開始年（2026）**
- **1月〜6月 → 終了年（2027）**

### タイムゾーンは固定オフセットにしない

時刻は `19h05` 形式の**現地（フランス）時刻**。

**必ず IANA タイムゾーン `Europe/Paris` で UTC に変換する。固定オフセットを使ってはいけない。**

- 9月開幕時は **CEST（UTC+2）**
- 12月〜3月は **CET（UTC+1）**

固定 `+02:00` で通すと冬の試合が**1時間ずれる**。`project_narrative_date_utc_leak` で日付が1日ずれる事故が既に起きている領域。

### フランス語の月名

`janvier` / `février` / `mars` / `avril` / `mai` / `juin` / `juillet` / `août` / `septembre` / `octobre` / `novembre` / `décembre`。アクセント付き文字の正規化に注意する。

## 節単位フェッチの設計（Owner 判断）

**全26節を毎回取得しない。**

- 取得対象の節を指定できるようにする
- 指定が無い場合の既定は「**現在進行中の節とその前後**」程度の狭い範囲にする（全節ではない）
- 過去の確定済みの節を毎回取り直さない
- **1回の実行で取得する節数に上限を設ける**（定数として持つ）
- **節と節の間にレート制限の待機を入れる**

初回の全件投入は、Owner が節を指定して複数回に分けて実行する運用とする。

## データモデル変更

なし。`top-14-2026-27` は既存、`family` は `top-14` で hero 画像・アクセント色も既存。

## external_ids

**LNR の試合 ID を保持する。** URL `feuille-de-match/2026-2027/j1/11819-bayonne-toulon` の `11819`。

`lib/ingestion/upsert.ts` は `external_ids` で同一試合を判定するため、これが無いと再取得のたびに重複する恐れがある。**キー名は既存 spec が想定する `top14_lnr_id` に揃える**（既存 spec `:31` および `feat-top14-team-stats.md` が将来これを使う前提）。

## API サーフェス

既存の `/api/cron/ingest-live-competitions` が `LIVE_COMPETITION_SOURCES` を反復する。**新しいエンドポイントは作らない。**

## UI サーフェス

なし。既存のカレンダー・大会ハブ・試合詳細に自動的に現れる。

## LLM 連携

変更なし。取り込み後、既存のプレビュー／レビュー生成が他大会と同じ経路で動く。

## 受け入れ条件

1. `top14.lnr.fr` の節別ページを取得するスクレイパーが新設されている（既存 spec が想定する `lib/scrapers/top14-lnr-results.ts` の名前に揃える）
2. それを使う live source が新設され、`LIVE_COMPETITION_SOURCES` に登録されている
3. 取得先が `https://top14.lnr.fr/calendrier-et-resultats/{season}/j{round}`（**パス形式**）
4. **クエリ形式（`?weekName=`）を使っていない**
5. `fetchWithPolicy` を使い、**`skipRobotsCheck` を使っていない**
6. **上記14チームの対応表が実装され、4件の不一致（ASM Clermont / LOU Rugby / Stade Français Paris / Union Bordeaux-Bègles）が正しく解決される**
7. **チーム名は表示名から判定している**（URL スラッグを分割していない）
8. **対応表に無いチームが出た場合、件数と名前がログとレスポンスに出る**（黙って飛ばさない）
9. 日付の年がシーズンから導出される（9〜12月＝開始年、1〜6月＝終了年）
10. **タイムゾーン変換に IANA `Europe/Paris` を使っている**（固定オフセットでない）
11. **秋（j1・CEST）と冬（j13 前後・CET）の両方で正しく UTC 変換されることをテストで確認している**
12. 1回の実行で取得する節数に**上限があり、定数として定義されている**
13. **既定で全26節を取得しない**
14. 節と節の間に待機がある
15. `external_ids` に `top14_lnr_id` が入る
16. 保存された HTML フィクスチャに対し、**j1 の7試合が実測表どおりにパースできる**ことをテストで固定している（日付・時刻・ホーム/アウェー）
17. フィクスチャが**実ページ由来**である（手作り HTML を使わない）
18. **`lib/ingestion/sources/wikipedia-top-14.ts` に差分が無い**
19. **既存の6月の試合（決勝トーナメント）を重複登録・破壊しない**
20. **`teams` / `competitions` への INSERT・マイグレーション・シードを追加していない**
21. `lib/llm/sourced-facts/allowlist.ts` に差分が無い
22. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- **初回の全件投入の運用。** 節単位の制約下で182試合をどう入れるか（Owner が節を指定して複数回実行する想定だが、回数と間隔は実装後に決める）
- **決勝トーナメントの統合。** lnr.fr にも決勝の日程があるはずで、`wikipedia-top-14.ts` と二重になる。統合するかは別途判断
- **過去シーズンのバックフィル。** `specs/feat-top14-regular-season-backfill.md` の対象。本 spec のスクレイパーを再利用する。**その spec の未解決の質問「チームslugの名寄せ」は本 spec の対応表で解決済み**
- **EU データベース権。** CGU に主張は無いが法律上は存在する。節単位・キャッシュ・出典保持で配慮するが、**法的な最終判断は Owner に委ねる**
- **放送情報。** 日本での Top 14 放送があるかは未調査
