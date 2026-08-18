# 大会ガイドを family 単位で生成できるようにし、greatest-rivalry を追加する

## 背景

2026-08-23〜09-13 に **南アフリカ vs ニュージーランドの 4 テストシリーズ**（Greatest Rivalry Tour 2026）がある。ツアー戦を含めて全 8 試合で、Tryline は既に 3 試合分の preview / recap を公開済み。

しかし大会ハブ `/competitions/greatest-rivalry-2026` を実際に開くと、**大会の説明文が一切表示されない**。

### 実測（2026-08-18、本番 DB）

`competition_guides` は **11 家族分が存在し、`greatest-rivalry` だけが無い**。

| family | 文字数 | updated_at |
|---|---|---|
| six-nations / premiership / urc / top-14 / super-rugby-pacific / rugby-championship / nations-championship / autumn-nations / pnc / league-one | 829〜1035 | 2026-06-25 |
| rwc | 992 | 2026-07-10 |
| **greatest-rivalry** | **無し** | — |

既存 11 本はすべて 2026-06-25 に生成されている。`greatest-rivalry` の competitions レコードは **2026-08-07 作成**なので、生成対象に入っていなかった。

### なぜハブが重要か

流入の実測では **Bing からの流入の 86% が大会ハブ**に着地し、ハブの滞在時間は 107 秒（試合ページは 3.6 秒）。**ハブが実質的な入口**であり、そこに大会の説明が無いのは取りこぼしになる。

このシリーズは特に説明が要る。ハブの日程表に **ストーマーズ・シャークス・ブルズ・ライオンズ**（南アフリカのフランチャイズ）と **南アフリカ代表**が同列に並んでおり、**訪問者はテスト戦とツアー戦の区別がつかない。**

### スクリプト側の問題

`tools/generate-competition-guides.ts` に 2 つ問題がある。

**1. `FAMILIES` がハードコードで `greatest-rivalry` が無い**（8-39 行）。

**2. `main()` が `FAMILIES` を全件ループする**（107-114 行）。引数で対象を絞る手段が無いため、**1 家族を追加したいだけでも 11 家族すべてを再生成し、`ON CONFLICT DO UPDATE` で既存ガイドを上書きする。**

```ts
for (const { family, nameJa, context } of FAMILIES) {
  const guide = await generateGuide(client, exa, family, nameJa, context);
  inserts.push(`INSERT INTO competition_guides ... ON CONFLICT (family) DO UPDATE SET guide_ja = EXCLUDED.guide_ja ...`);
}
```

これは過去の「全件再生成で 297 件が draft 化した事故」と**同じ構造**である。既存 11 本は内容が確認済みで本番稼働しており、**触る理由が無いものを触らせない**必要がある。

なお本スクリプトは SQL ファイルを書き出すだけで **DB には書き込まない**（116-125 行）。実行は Owner が Supabase ダッシュボードで行う。この設計は維持する。

## スコープ

対象:
- `tools/generate-competition-guides.ts` — 対象 family を引数で絞れるようにする
- 同ファイル — `FAMILIES` に `greatest-rivalry` を追加する
- 上記に対応するテスト

対象外:
- **既存 11 家族のガイド内容の再生成・変更**（触らない）
- `competition_guides` テーブルのスキーマ変更
- ハブページ側の表示ロジック（`app/competitions/[slug]/page.tsx`）。**テスト戦とツアー戦の区別表示は別 spec**
- `competitions.name_ja` の変更（別途 Owner が判断）
- 放送情報の投入（`tools/upsert-match-broadcasts.ts` の範囲。入力 JSON は作成済み）
- **スクリプトから DB へ直接書き込むようにすること**（SQL 出力方式を維持する）

## データモデル変更

**DB の変更なし。**

`competition_guides` の既存スキーマをそのまま使う。

```
family      text  (unique)
guide_ja    text
updated_at  timestamptz
verified_at timestamptz
source_url  text
```

## API サーフェス

**新規ルートなし。** CLI の引数のみ変更する。

```
# 全件（従来どおり。引数なし）
node --env-file=.env.production.local tools/run-ts.cjs tools/generate-competition-guides.ts

# 特定 family のみ（新規）
node --env-file=.env.production.local tools/run-ts.cjs tools/generate-competition-guides.ts greatest-rivalry
```

複数指定を許すかは Codex の判断でよい。**最低限、単一 family の指定ができること。**

出力先ファイル名は、対象を絞った場合に既存の全件版 `supabase/seeds/competition-guides.sql` を**上書きしないこと**（例: `competition-guides-greatest-rivalry.sql`）。全件版を消すと、次に全件生成したい時の参照が失われる。

## UI サーフェス

**変更なし。** 生成された `guide_ja` は既存のハブ表示ロジックがそのまま描画する（大会ガイドは `bd3fba1` で常時展開表示に変更済み。**collapsible に戻さないこと**）。

## LLM 連携

パイプラインとは独立した**単発の生成スクリプト**。

- モデル: `MODELS.NARRATIVE`（`lib/llm/models.ts` を参照。**モデル ID を直書きしない**）
- Exa で参照情報を検索（`searchContext`、41-49 行）
- **1 family あたり Exa 1 回 + OpenAI 1 回。** 対象を絞れるようにすることで、11 回 → 1 回にコストが下がる

`greatest-rivalry` には `context` を与えること。`nations-championship` / `autumn-nations` と同じ扱いで、以下の事実を渡す（**いずれも本番 DB とキックオフ時刻で確認済み**）:

- 2026 年 8〜9 月、**オールブラックスが南アフリカに遠征する全 8 試合のツアー**
- 内訳は**南アフリカ代表とのテストマッチ 4 戦**と、**南アフリカのフランチャイズとのツアー戦 4 戦**（ストーマーズ・シャークス・ブルズ・ライオンズ）
- **総合優勝チームという概念は無い**。テストシリーズの勝敗で争う
- 最終戦（第4テスト）は **米国ボルチモアの M&T Bank Stadium** で開催される
- 日本での視聴は **J SPORTS**

**「歴代王者」「優勝チーム一覧」を書かせないこと。**既存プロンプトの厳守事項（80 行）に既に含まれているが、この大会は特に誤りやすい。

## 受け入れ条件

### スクリプト

1. 引数なしで実行すると、従来どおり `FAMILIES` 全件を生成する（回帰なし）
2. `greatest-rivalry` を引数に渡すと、**その 1 家族だけ**を生成する
3. 対象を絞った実行で、**他の family に対する Exa / OpenAI の呼び出しが発生しない**
4. 存在しない family 名を渡した場合、**何も生成せずエラー終了する**（黙って全件生成にフォールバックしない）
5. `FAMILIES` に `greatest-rivalry` が追加されており、`nameJa` と `context` を持つ
6. 対象を絞った実行の出力先が、全件版 `supabase/seeds/competition-guides.sql` を上書きしない
7. **DB へ直接書き込まない**（SQL ファイル出力のみ。既存の設計を維持）

### テスト

8. 引数なしで全 family が対象になることのテスト
9. 単一 family 指定でその family のみが対象になることのテスト（**LLM / Exa クライアントはモックする。実 API を叩かない**）
10. 不正な family 名でエラー終了することのテスト
11. `pnpm test` と型チェックが通る

### 生成物の検品（Owner）

12. Codex は**生成を実行しない。** スクリプトの変更とテストまでで止めること
13. Owner が `greatest-rivalry` を生成した後、以下を目視確認する:
    - テスト 4 戦とツアー戦の区別が説明されている
    - 「歴代王者」「優勝一覧」が書かれていない
    - 参照情報に無いスコア・年号が書かれていない
    - 視聴方法に J SPORTS が含まれている
14. 検品通過後に Owner が Supabase ダッシュボードで SQL を実行する

## 未解決の質問

1. **`competitions.name_ja` が「グレイテスト・ライバルリー・ツアー」になっている。** J SPORTS の正式表記は「グレイテスト・ライバルリー・ツアー 2026 オールブラックス 南アフリカ遠征」で、**日本のファンが実際に検索するのは「オールブラックス 南アフリカ遠征」の側**。検索語を拾うために `name_ja` を変えるか、別途 alias を持つかは Owner が判断する。本 spec の対象外
2. `verified_at` / `source_url` が既存 11 本すべて null。ガイドの事実確認をいつ・どうやるかの運用が決まっていない（`#526` で事実誤りを修正した経緯がある）。本 spec では埋めないが、別途検討が必要
3. ツアー戦 4 試合のうち 3 試合は既に終了しており、NZ が 38-21 / 54-0 / 50-19 で 3 連勝している。**この結果をガイドに含めるとすぐ陳腐化する**ため、ガイドは evergreen に保ち、時点情報は preview / recap 側に任せる方針でよいか
