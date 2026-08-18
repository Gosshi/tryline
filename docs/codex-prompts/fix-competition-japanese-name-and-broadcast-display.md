# Codex 指示: 大会名の日本語表示と、ハブの視聴情報欠落を直す

## 仕様書

`specs/fix-competition-japanese-name-and-broadcast-display.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 3 つの問題（すべて本番で実測済み）

### 1. DB の `name_ja` を直しても cron が上書きする

Owner 承認のうえ `competitions.name_ja` を UPDATE し `returning` で確認したが、**約10分後に元の値へ戻っていた。**

原因は `lib/ingestion/live-competitions.ts:63-71` のハードコード。

```ts
competitionNameJa: "グレイテスト・ライバルリー・ツアー",
```

これが `lib/ingestion/live-ingest.ts:50-63` の upsert で書き戻される。`cron-live-pipeline` は **6時間ごと（00/06/12/18 UTC）**。UPDATE が 05:5x、上書きが 06:00 の回だった。

**DB を直すのは無意味。定数を直すこと。**

日本のファンが検索するのは「**オールブラックス 南アフリカ遠征**」。現在の値にこの語が無い。

### 2. 試合ページのタイトルが英語

```
南アフリカ 対 ニュージーランド — Greatest Rivalry 2026 | Tryline
                                  ^^^^^^^^^^^^^^^^^^^^
```

チーム名は日本語なのに大会名だけ `competitions.name`（英語）。

### 3. 11大会で視聴情報が毎回削除されている

ハブに「放送・配信情報は確認中です」と出る。`components/competition-viewing-guide.tsx:234` が、`verified_at` が null のとき `removeUnverifiedBroadcastBlocks`（同 `:164-201`）で「日本での視聴方法」セクションを丸ごと削除するため。

**本番実測:**

```
ガイドに「日本での視聴方法」が書かれている   12 / 12
verified_at が設定されている                1 / 12  （rwc のみ）
```

**LLM が全12大会で生成しているのに、11大会で毎回捨てられている。**

一方 `match_broadcasts` には**検証済みデータがある**（8/23 の試合ページには `J SPORTS 3` が正しく出ている）。ハブは `getMatchBroadcastPresenceForMatches` を既に呼んでおり（`app/c/[competition]/[season]/page.tsx:18, 336-341`）、有無は知っている。**中身を出せばよい。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/ingestion/live-competitions.ts:63-71` | `greatest-rivalry` の定義。ここを直す |
| `lib/ingestion/live-ingest.ts:50-63` | upsert が `name_ja` を書き戻すこと |
| `lib/format/competition.ts:13-29` | `getCompetitionDisplayName`。**これを使う** |
| 同 `:40-42` | `formatCompetitionTitle` が `displayName.includes(season)` で分岐すること |
| `components/competition-viewing-guide.tsx:164-201, 234` | `removeUnverifiedBroadcastBlocks`。**挙動を変えない** |
| `app/c/[competition]/[season]/page.tsx:18, 336-341` | ハブが既に放送有無を取っていること |
| `lib/db/queries/match-broadcasts.ts` | 既存クエリ。中身を返す関数が要る |

## 絶対にやってはいけないこと

1. **`competitions.name_ja` を DB で直す SQL を書かない。** cron に上書きされる
2. **`competitionNameJa` に「2026」を入れない。** `formatCompetitionTitle` が `includes(season)` で分岐するため、入れると season が付かず数字が文中に残る
3. **他 11 大会の `competitionNameJa` を変えない**
4. **`removeUnverifiedBroadcastBlocks` を削除・無効化しない。** #526 の安全機構。**LLM 生成の視聴情報を無検証で出す方向へ戻さない**
5. **試合ページのタイトルで英語名にフォールバックする実装にしない**（`name_ja` が null のときのフォールバックは別。それは必要）
6. **新しい表示名解決ロジックを書き起こさない。** `getCompetitionDisplayName` を使う
7. **取り込みを実際に走らせない。** upsert に渡るペイロードを検証するテストにする
8. ガイド生成プロンプト（`tools/generate-competition-guides.ts`）を触らない
9. `match_broadcasts` にデータを投入しない（3試合分は投入済み）

## 特に注意すべき点

**`generateMetadata` への依存追加は既存テストを壊す。** PR #636 で実際に発生している。同関数を呼ぶ既存テストのモック網羅を確認してから書くこと。

**ハブの表示では「サービス名の表示」と「確認中です」が同時に出ないこと。** 放送データがあるなら注意書きは出さない。

## テストで押さえる点

- `greatest-rivalry`（放送データあり）→ サービス名が出る
- **放送データ 0 件の大会 → 従来どおり注意書きが出る（回帰防止）**
- **`name_ja` が null の大会 → 試合ページのタイトルが英語名になる（フォールバック維持）**
- upsert に渡る `name_ja` が新しい値であること（**実 API・実取り込みなし**）

## 完了の定義

- `specs/fix-competition-japanese-name-and-broadcast-display.md` の受け入れ条件 1〜18 を満たす
- `pnpm test` と型チェックが green
- **本番での取り込み実行なし。** 受け入れ条件 19・20 は Owner が行う
- PR 本文に以下を書くこと:
  - `competitionNameJa` に設定した文字列の全文
  - ハブでサービス名をどう集約・表示したか（1行の例）
  - `generateMetadata` の変更で影響した既存テストがあれば、その対応内容
