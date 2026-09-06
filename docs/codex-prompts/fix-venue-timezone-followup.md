**PR #775 への追加コミット**です。新しい PR を作らないでください。

仕様書 `specs/fix-venue-local-time-timezone.md` を**再読**してください。2026-09-06 に 2 箇所を追記・訂正しました（「2.5 脚注は数字だけではない」「3. カバレッジの取り扱い」）。受け入れ条件にも 2b・17・18 を足しています。

初回実装は正しく、レビューも通っています。本番プレビューで次を確認済みです。

```
Townsville:  現地 2026-08-15 (Sat) 15:00 GMT+10   ← 06:00 BST から修正済み
Twickenham:  現地 2026-02-21 (Sat) 14:10 GMT      ← 冬季の DST 判定も正しい
辞書なし / 日本会場 / venue=null: 現地行なし       ← 設計どおり
```

直すのは次の 2 点だけです。

## 1. 脚注の正規表現（私の仕様のバグです）

仕様に `/\[\d+\]/g` と書いたのが誤りでした。**実装は指示どおりで、実装側の欠陥ではありません。**

本番には英字脚注が **18 行 / 12 会場**あります。二重脚注もあります。

```
"Hnry Stadium, Wellington[42]"              ← 数字（現行で除去できる）
"Eden Park, Auckland[a]"                     ← 英字（除去できない）
"Navigation Homes Stadium, Pukekohe[e][f]"   ← 二重
"Churchill Park, Lautoka[e]" / "Four R Stadium, Ba[f]" / "HFC Bank Stadium, Suva[g]"
"McLean Park, Napier[c]" / "Rotorua International Stadium, Rotorua[d]"
"Sky Stadium, Wellington[c]" / "Bay Oval, Mount Maunganui[g]"
```

`normalizeVenue` の正規表現を **`/\[[^\]]*\]/g`** に変えてください。日本の会場は全角 `（）` と半角 `()` を使っており角括弧を含まないので、巻き込みません。

受け入れ条件 2b にテストを追加してください。

## 2. 辞書のカバレッジ

「154 会場の元一覧が無い」と報告していた件です。**用意しました。**

```
docs/venue-timezone-coverage-2026-09-06.md
```

本番から生成した **146 会場 / 669 試合**の一覧で、各行に試合数・大会・その会場をホームで使うチームが付いています。

現状の辞書 7 文字列では **669 試合中 32 試合（約 5%）**にしか現地行が出ません。**2026-01-01 以降の試合数が 5 以上の会場をすべて登録してください**（受け入れ条件 17）。

一覧の「表記ゆれ」節にある組は、**同一会場と判断できたものは両方の表記をキーとして登録**してください（例: `Ellis Park Stadium, Jo'burg` と `Ellis Park Stadium, Johannesburg`）。

### 罠: 同名スタジアムが 3 都市にあります

一覧を作って初めて分かりました。

| 文字列 | 大会 | home_teams |
|---|---|---|
| `Allianz Stadium, Sydney` | super-rugby-pacific-2026 | waratahs |
| `Allianz Stadium, London, England` | nations-championship-2026 | england |
| `Allianz Stadium, Turin, Italy` | nations-championship-2026 | italy |
| `Allianz Stadium` | premiership-2025-26 | harlequins |

**先頭語だけで照合しないでください。** キーは正規化後の文字列全体です。都市名を持たない `Allianz Stadium` は文字列だけでは決まらないので**登録しない**（`null` を返す）。受け入れ条件 18 にテストを追加してください。

### `home_teams` 列の使い方

**国を判断する材料であって、そこからタイムゾーンを導いてはいけません。** 中立会場では複数国が並びます（`North Queensland Stadium, Townsville` の home_teams は australia, chile, georgia, spain, tonga）。これは初回実装で撤去した推定そのものです。

**確信を持てない会場は登録しないでください。** 未登録は現地行が出ないだけで安全側に倒れます。**間違った値を入れることが、この仕様が直そうとしているバグそのものです。**

## やってはいけないこと

- **新しい PR を作ること。** #775 への追加コミットです
- `matches` テーブルへの `UPDATE` / `INSERT` / マイグレーション。脚注は DB から消さず表示側で吸収します
- `venue_timezone` 列や会場マスタの追加
- LLM で会場からタイムゾーンを推定すること
- `formatKickoffLocal` の出力形式変更、JST 表示の変更
- 現地行の代わりに「不明」等のプレースホルダを出すこと

## 略称の件は対象外です

プレビューで `現地 … 15:00 GMT+10` と出ます。`AEST` ではありません。時刻とオフセットは正しく、`Intl` の `timeZoneName: "short"` が `en-GB` ロケールで豪州の略称を持たないためです。**本 PR では直さないでください。** 仕様の「未解決の質問 3」に記録済みです。

## 完了の定義

受け入れ条件 1〜18 を満たすこと。追加分は特に:

- **2b**: `"Eden Park, Auckland[a]"` → `"eden park, auckland"`、`"Navigation Homes Stadium, Pukekohe[e][f]"` → `"navigation homes stadium, pukekohe"`
- **17**: 2026 年以降 5 試合以上の会場が全件辞書にある。PR 本文に辞書件数と、669 試合中いくつで現地行が出るようになったかを書く
- **18**: `Allianz Stadium, Sydney` が `Europe/London` にならない。`Allianz Stadium` は `null`

`pnpm lint` / `pnpm typecheck` / `pnpm test` の結果を PR 本文に貼ってください。
