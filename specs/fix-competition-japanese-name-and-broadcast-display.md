# 大会名の日本語表示と、ハブの視聴情報欠落を直す

## 背景

2026-08-18、Greatest Rivalry Tour 2026（南アフリカ vs ニュージーランド 4 テストシリーズ）への対応中に、**日本語ユーザーが大会情報にたどり着けない問題が 3 つ見つかった。**いずれも本番で実測済み。

---

### 問題 1: `competitions.name_ja` を手で直しても cron が上書きする

日本のファンが実際に検索するのは「**オールブラックス 南アフリカ遠征**」だが、`name_ja` は「グレイテスト・ライバルリー・ツアー」で、この語を含まない（J SPORTS の正式表記は「グレイテスト・ライバルリー・ツアー 2026 オールブラックス 南アフリカ遠征」）。

Owner 承認のうえ `name_ja` を「グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征」に UPDATE し、`returning` で反映を確認した。**しかし約 10 分後に元の値へ戻っていた。**

原因は `lib/ingestion/live-competitions.ts:63-71` のハードコード。

```ts
{
  competitionName: "Greatest Rivalry 2026",
  competitionNameJa: "グレイテスト・ライバルリー・ツアー",   // ← ここ
  competitionSlug: "greatest-rivalry-2026",
  family: "greatest-rivalry",
  ...
}
```

これが `lib/ingestion/live-ingest.ts:50-63` の upsert で書き戻される。

```ts
.from("competitions").upsert({
  ...
  ...(source.competitionNameJa ? { name_ja: source.competitionNameJa } : {}),
}, { onConflict: "slug" })
```

`cron-live-pipeline` は **6 時間ごと（00/06/12/18 UTC）** に走る。UPDATE が 05:5x、上書きが 06:00 の回。

**構造的な帰結: `competitions.name_ja` の手動キュレーションは一切保持されない。**チーム名（`teams.name_ja`、91/91 整備済み）と違い、大会名は取り込み側の定数が権威を持つ。**DB を直すのは無意味で、コード側を直す必要がある。**

---

### 問題 2: 試合ページのタイトルが英語

```
南アフリカ 対 ニュージーランド — Greatest Rivalry 2026 | Tryline
                                  ^^^^^^^^^^^^^^^^^^^^ 英語のまま
```

チーム名は日本語化されているのに、**大会名だけ `competitions.name`（英語）を使っている。**問題 1 を直しても、ここは別途対応が必要。

日本語で検索するユーザーに対して、試合ページのタイトルに英語の大会名が出るのは取りこぼしになる。

---

### 問題 3: 11 大会で視聴情報が毎回削除されている

大会ハブの「大会ガイド」に、放送情報がこう表示される。

> 放送・配信情報は確認中です。最新の視聴方法は各配信サービスの公式案内を確認してください。

`components/competition-viewing-guide.tsx:234` で、`verified_at` が null のとき `removeUnverifiedBroadcastBlocks`（同 `:164-201`）が**「日本での視聴方法」セクションを丸ごと削除**し、上記の注意書きに差し替える。#526 で入った安全機構であり、**それ自体は妥当**。

しかし本番の実測はこうなっている。

| | 件数 |
|---|---|
| ガイドに「日本での視聴方法」が書かれている | **12 / 12** |
| `verified_at` が設定されている | **1 / 12**（`rwc` のみ） |

**LLM が全 12 大会で視聴方法を生成しているのに、11 大会で毎回捨てられている。**生成コストの無駄であり、ユーザーへの情報提供の機会損失でもある。

一方、**`match_broadcasts` には検証済みのデータがある。** 8/23 の試合ページには `放送 / J SPORTS 3` が正しく表示されている（J SPORTS の番組ページで個別に確認して投入したもの）。

**ハブは `getMatchBroadcastPresenceForMatches` を既に呼んでおり**（`app/c/[competition]/[season]/page.tsx:18, 336-341`）、放送情報の有無を知っている。**LLM 生成のガイド本文ではなく `match_broadcasts` から出せば、検証済みデータを確実に表示できる。**

ハブは Bing 流入の 86% が着地し滞在 107 秒の主要導線であり、**「どこで観るか」は日本のファンの最重要関心事**。ここが空白なのは大きい。

## スコープ

対象:
- `lib/ingestion/live-competitions.ts` — `greatest-rivalry` の `competitionNameJa` を検索語を含む表記に変更
- 試合ページの `generateMetadata` — 大会名に `name_ja` を使う
- 大会ハブの視聴情報表示 — `match_broadcasts` に基づく表示を追加
- 上記に対応するテスト

対象外:
- **`competitions.name_ja` を DB で直すこと**（cron に上書きされるため無意味）
- **`removeUnverifiedBroadcastBlocks` の削除・無効化。** #526 の安全機構であり、**LLM 生成の視聴情報を無検証で出す方向には戻さない**
- 他 11 大会の `competitionNameJa` の見直し（別途。今回は `greatest-rivalry` のみ）
- `competition_guides.verified_at` を埋める運用の仕組み化（未解決の質問を参照）
- `match_broadcasts` のデータ投入（既に 3 試合分投入済み）
- ガイド生成プロンプトの変更

## データモデル変更

**DB の変更なし。**

既存テーブルをそのまま使う。

```
competitions.name_ja            text
competition_guides.verified_at  timestamptz
match_broadcasts                match_id uuid / service_name text / url text
                                kind 'tv'|'streaming' / display_order integer
```

## API サーフェス

**新規ルートなし。**

ハブが `match_broadcasts` の中身（`service_name` / `url` / `kind`）を必要とするため、既存の `getMatchBroadcastPresenceForMatches`（有無だけを返す）に加えて、**大会内の放送サービス一覧を取得する関数**が要る。既存クエリの拡張か新規追加かは Codex の判断でよい。

## UI サーフェス

### 試合ページ

`generateMetadata` のタイトルで、大会名に `name_ja` を使う。表示名の解決には既存の `getCompetitionDisplayName`（`lib/format/competition.ts:13-29`）を使うこと。**新しい解決ロジックを書き起こさない。**

```
（現在）  南アフリカ 対 ニュージーランド — Greatest Rivalry 2026 | Tryline
（変更後）南アフリカ 対 ニュージーランド — グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征 2026 | Tryline
```

**タイトルが長くなりすぎる場合の扱いは Codex の判断でよい**が、**英語名へフォールバックしないこと**。

#### フォールバックの段数を減らさないこと（重要）

> **2026-08-18 追記。** 初版の受け入れ条件 6 は「`name_ja` が null なら英語名にフォールバック（従来動作）」と書いていたが、**「従来動作」の記述が誤りだった**。PR #707 でこの穴が実際に踏まれたため明文化する。

`getCompetitionDisplayName`（`lib/format/competition.ts:13-29`）は **3 段階**でフォールバックする。

```ts
if (language === "en") return competition.name;          // ← "en" を渡すと即座に英語名
const family = competition.family ?? inferCompetitionFamilyFromSlug(competition.slug);
return competition.nameJa
  ?? (family ? JAPANESE_COMPETITION_NAMES_BY_FAMILY[family] : undefined)
  ?? competition.name;
```

**`language` に `"en"` を渡すと 2 段目の家族マップを飛ばして英語名になる。**`nameJa` の有無で `"ja"` / `"en"` を切り替える実装にしてはならない。**引数を渡さず既定の `"ja"` を使うこと。**

`JAPANESE_COMPETITION_NAMES_BY_FAMILY`（`lib/format/japanese-names.ts:82-95`）には **12 家族分の日本語名が登録済み**であり、`name_ja` が null でもここで日本語になる大会がある。

**本番実測（2026-08-18）: `name_ja` が null の大会は 4 件で、全件の family がマップに存在する。**

| 大会 | family | マップの日本語名 | 試合数 |
|---|---|---|---|
| `premiership-2026-27` | premiership | プレミアシップ | **90** |
| `nations-championship-2026` | nations-championship | ネーションズチャンピオンシップ | **36** |
| `top-14-2026-27` | top-14 | トップ14 | 0 |
| `urc-2026-27` | urc | ユナイテッド・ラグビー・チャンピオンシップ | 0 |

**`"en"` を渡す実装にすると、この 126 試合のページタイトルが日本語から英語に変わる。**

なお `greatest-rivalry` のタイトルが英語だったのは、**この family がマップに無いため**であり、マップに載っている大会は変更前から日本語で表示されていた。

### 大会ハブ

視聴情報の表示を、`match_broadcasts` に基づくものに変える。要件は以下。

1. **その大会の試合に紐づく放送サービス名を表示する**（重複は集約する。例: 8 試合すべてが J SPORTS 3 なら「J SPORTS 3」と 1 回）
2. **リンクを張る**（`match_broadcasts.url`）
3. `match_broadcasts` が 0 件の大会では、**従来どおり「確認中です」の注意書きを出す**
4. **ガイド本文の「日本での視聴方法」セクションは、`verified_at` が null なら従来どおり削除する。** #526 の安全機構は維持する
5. 上記 1 の表示と、4 の注意書きが**同時に出ないこと**（放送データがあるなら「確認中です」は出さない）

**具体的な見せ方は Codex の判断でよい。**

## LLM 連携

**なし。** LLM 呼び出しは発生しない。

ただし問題 3 の結果として、**ガイド生成プロンプトが作る「日本での視聴方法」セクションの位置づけが変わる。**`match_broadcasts` が権威になるなら、ガイド側の同セクションは不要になりうる。**本 spec では生成側を変更しない**（未解決の質問を参照）。

## 受け入れ条件

### 問題 1

1. `lib/ingestion/live-competitions.ts` の `greatest-rivalry` の `competitionNameJa` が、**「オールブラックス」と「南アフリカ遠征」の両方を含む**表記になっている
2. 「2026」を**含まない**（`formatCompetitionTitle`、`lib/format/competition.ts:40-42` が `displayName.includes(season)` で分岐するため、含めると season が付かず数字が文中に残る）
3. 他 11 大会の `competitionNameJa` が変更されていない
4. 取り込み実行後に `competitions.name_ja` がこの値になることのテスト（**実際の取り込みは走らせない。upsert に渡るペイロードを検証する**）

### 問題 2

5. 試合ページの `generateMetadata` が大会名に `name_ja` を使う
6. **`getCompetitionDisplayName` に `language` 引数を渡さない**（既定の `"ja"` を使う）。`nameJa` → `JAPANESE_COMPETITION_NAMES_BY_FAMILY` → 英語名、の**3 段階フォールバックをすべて通すこと**
6b. **`name_ja` が null でも、family が日本語名マップにある大会は日本語名が出る**（下記「フォールバックの段数」参照）
7. 表示名の解決に既存の `getCompetitionDisplayName` を使っている
8. `generateMetadata` に依存を足したことで**既存テストが壊れていない**（過去に PR #636 で実際に発生。同関数を呼ぶ既存テストのモック網羅を確認すること）

### 問題 3

9. 大会ハブに、その大会の `match_broadcasts` に基づく放送サービス名が表示される
10. サービス名が重複排除されている
11. `match_broadcasts.url` へのリンクが張られている
12. `match_broadcasts` が 0 件の大会では、従来どおり「確認中です」の注意書きが出る
13. 放送データがある大会で「確認中です」が**出ない**
14. **`removeUnverifiedBroadcastBlocks` の挙動を変えていない**（`verified_at` が null ならガイド本文の視聴方法セクションは削除されたまま）

### テスト

15. `greatest-rivalry`（放送データあり）でサービス名が表示されることのテスト
16. 放送データが 0 件の大会で注意書きが出ることのテスト（**回帰防止**）
17. **`name_ja` が null で family が日本語名マップにある大会**（例: `premiership`）で、試合ページのタイトルが**日本語名になる**ことのテスト（**回帰防止。ここが英語になったら失敗**）
17b. `name_ja` が null で family がマップにも無い大会で、英語名になることのテスト（最終フォールバック）
18. `pnpm test` と型チェックが通る

### 検証（Owner）

19. デプロイ後、`/c/greatest-rivalry/2026` に **J SPORTS 3** が表示されることを確認
20. 次の `cron-live-pipeline`（00/06/12/18 UTC）実行後に、`competitions.name_ja` が新しい値のまま**戻っていない**ことを確認

## 未解決の質問

1. **`competition_guides.verified_at` を誰がいつ埋めるのか**が未定（12 件中 11 件が null）。本 spec は `match_broadcasts` で視聴情報を出すため当面は回避できるが、**ガイド本文の事実確認という論点は残る**。`#526` で事実誤りを修正した経緯もあり、運用の仕組み化を別途検討したい
2. `match_broadcasts` が権威になるなら、**ガイド生成プロンプトの「日本での視聴方法」セクション自体が不要**になりうる。ただし全 12 大会に `match_broadcasts` が揃っているわけではない。**削除は時期尚早**とみて本 spec では触らない
3. 他 11 大会の `competitionNameJa` にも同種の検索語ギャップがある可能性がある。**`teams.name_ja` は 91/91 整備済みだが、大会名は未点検。**本 spec 完了後に棚卸しする価値がある
4. 問題 1 の根本は「取り込み側の定数が DB のキュレーションを上書きする」構造。**将来 `name_ja` を DB で運用したくなった場合、upsert から `name_ja` を外す判断が要る。**今回は定数を直す最小対応にとどめる
