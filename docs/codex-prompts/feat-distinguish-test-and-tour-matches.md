# Codex 指示: 代表チームとクラブを区別し、テストマッチとツアー戦を判別する

## 仕様書

`specs/feat-distinguish-test-and-tour-matches.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

`teams` に**代表チームとクラブを区別するカラムが無い**ため、大会ハブの日程表で**南アフリカ代表とのテストマッチ 4 戦と、南アフリカのフランチャイズとのツアー戦 4 戦が完全に同列に並んでいる。**

## 実際に何が見えているか

Greatest Rivalry Tour 2026 に登場する 6 チームの本番実測値。

```
south-africa  南アフリカ      ZAF  ranking 1     🇿🇦
new-zealand   ニュージーランド NZL  ranking 2     🇳🇿
bulls         ブルズ          ZAF  ranking null  🇿🇦
lions         ライオンズ      ZAF  ranking null  🇿🇦
sharks        シャークス      ZAF  ranking null  🇿🇦
stormers      ストーマーズ    ZAF  ranking null  🇿🇦
```

**4 フランチャイズすべてに南アフリカ国旗が付いている。** 代表と並ぶと見分けがつかない。

## world_ranking を判定に使ってはいけない

`world_ranking is not null` で代表を判定したくなるが、**やらないこと。**

この値は `scripts/ingest-world-rankings.ts` が入れるもので、**ワールドランキングに載らない代表チームは null**、取り込みが失敗しても null になる。**「ランキングが無い代表」を club と誤分類する。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/db/queries/competitions.ts` | ハブが team をどう取得しているか |
| `app/competitions/[slug]/page.tsx` | 日程表の描画 |
| `lib/format/competition.ts:51-62` | `COMPETITION_FAMILY_COLORS`。**`greatest-rivalry` が無く既定値 `#1e293b` に落ちている** |
| `lib/db/types.ts` | 型の再生成が必要 |
| `supabase/migrations/` | 既存マイグレーションの書き方 |

## 分類は「2つの明示リスト」で行う（PR #705 でここを踏んだ）

**代表大会リストとクラブ大会リストの両方を列挙し、それぞれへの出場で判定すること。**

```
代表大会: six-nations / nations-championship / autumn-nations / pnc / rwc
          rugby-championship / lipovitan-challenge-cup
クラブ大会: premiership / urc / top-14 / super-rugby-pacific / league-one
```

**「代表大会リストに無い大会への出場」を club の判定根拠にしてはならない。**

`greatest-rivalry` は**代表とフランチャイズが混在する大会**で、どちらのリストにも入らない。消去法で判定すると、**この大会に出ている南アフリカとニュージーランドが「クラブ出場あり」と誤カウントされ `ambiguous` に落ちる** → `kind` がデフォルトの `'club'` のまま残る → **テストマッチ4戦がすべて「ツアー戦」と表示される。**

**2026-08-18 の本番実測（正しい方法での期待値）**

```
代表大会にのみ出場                    25 件  → national
クラブ大会にのみ出場                  62 件  → club
両方の明示リストに出場                  0 件  ← 曖昧なチームは存在しない
試合が 1 件もない                      4 件  → デフォルトの club のまま（lyon / rebels / vannes / us-montauban）
                                     ----
                                      91 件（club 合計 66 件）
```

**期待値をコメントに書くだけでは不十分。クエリを本番で実行した実際の出力を PR 本文に貼ること。**

**バーバリアンズ・U20・A 代表・招待チームは 1 件も存在しない。** `'national' | 'club'` の 2 値で破綻しないことは確認済み。

試合ゼロの 4 件はデフォルト `'club'` がそのまま正解なので、個別対応は不要。

**それでも一覧の提示は省略しないこと。** 適用は Owner が行う。

## やること

1. `teams.kind text not null default 'club' check (kind in ('national','club'))` を追加するマイグレーション
2. 既存 91 チームの分類**一覧を出力する**（適用はしない）
3. ハブの日程表でテスト戦とツアー戦を区別して表示
4. `COMPETITION_FAMILY_COLORS` に `greatest-rivalry` を追加

## 絶対にやってはいけないこと

1. **`world_ranking` を代表判定の根拠にしない**（上記の理由）
2. **バックフィルを実行しない。** 一覧の提示までで止める。適用は Owner
3. **`matches` にカラムを足さない。** 種別はチーム側の属性
4. **`flag_code` の値を変更しない。** 別途判断が必要
5. **他大会のハブの見た目を変えない。** 全 `national` の大会（シックスネイションズ）と全 `club` の大会（プレミアシップ）は**従来どおりラベルなし**
6. **色だけで区別しない。** テキストラベルを併用する
7. **ラベル文言は「ツアー戦」で確定**（Owner 判断、2026-08-18）。**「親善試合」は公式なツアーマッチなので誤り。使わないこと**
8. 試合詳細・選手・チームページを触らない
9. コンテンツ生成側（`lib/llm/`）を触らない

## マイグレーションの順序（過去に事故あり）

**新カラムを読むページコードをマージする前に、本番へマイグレーションを適用すること。** #577 等で複数回、順序を逆にして本番が落ちている。

PR 本文に「マイグレーション適用が先」と明記し、Owner が適用したことを確認してからマージする。

## テストで押さえる点

**回帰防止が核心。ここが壊れると全大会に影響する。**

- 混在する大会（greatest-rivalry）でテスト戦とツアー戦が区別される
- **全 `national` の大会でラベルが出ない**
- **全 `club` の大会でラベルが出ない**
- 本大会の 6 チームが正しく分類される（`south-africa` / `new-zealand` = national、他 4 件 = club）

## 完了の定義

- `specs/feat-distinguish-test-and-tour-matches.md` の受け入れ条件 1〜13 を満たす
- 変更ファイル: マイグレーション、`lib/db/types.ts`、ハブのクエリと描画、`lib/format/competition.ts`、対応するテスト
- `pnpm test` と型チェックが green
- **バックフィル未実行。** 受け入れ条件 14・15 は Owner が行う
- PR 本文に以下を書くこと:
  - 代表チームをどう洗い出したか（**クエリを載せること**）
  - 分類一覧（91 件。`national` と判定したものを明示）
  - 曖昧だったチームがあれば、判断せずに列挙する
  - ツアー戦のラベル文言と、色以外の区別方法
