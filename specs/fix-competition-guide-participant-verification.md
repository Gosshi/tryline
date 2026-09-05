# fix-competition-guide-participant-verification

## 背景

Nations Championship 2026 のシーズンページ `/c/nations-championship/2026` で、**大会ガイドの参加国と、同一ページの順位表・日程が食い違っている**（2026-09-05 実測）。

| ページ内の出現回数 | |
|---|---|
| ジョージア | 1 回（大会ガイドの参加国として） |
| フィジー | 7 回（順位表・日程） |

フィジー協会は公式にフィジーの参加を発表している（<https://www.fijirugby.com/fiji-rugby-joins-historic-nations-championship-a-new-era-for-fiji-and-the-world-game/>）。**ガイドが誤っている。**

大会ガイドは `feat-generate-competition-guide-per-family` / `feat-evergreen-competition-guides` で生成された恒久コンテンツで、**一度作られると試合データの更新では直らない**。参加国・開催周期・現行年度といった、後から変わる事実を含んでいる。

イベントやコンテンツ本文には検証ゲートがあるが（`feat-entity-grounding-gate` 等）、**大会ガイドには DB の実データと突き合わせる検証が無い**。監査レポート A-4 はこれを P0 として挙げている。

## スコープ

対象:
- `tools/audit-competition-guide-facts.ts`（新規）: **読み取り専用**。公開中の大会ガイドに含まれる参加チーム名を抽出し、当該大会シーズンの実データ（`standings` / `matches` に現れるチーム）と突き合わせ、不一致を報告する
- 出力レポート: `tmp/competition-guide-audit/`

対象外:
- **ガイド本文の自動修正・自動再生成**（1 行も書き込まない。修正は Owner が `content-regen` 運用または手動で行う）
- 参加国以外の事実（開催周期・優勝回数・歴史的記述）の検証（**LLM でも決定論でも自動判定できない**。本 spec は DB と突き合わせられる項目だけを扱う）
- ガイド生成プロンプトの変更
- NC 2026 ガイドの実際の修正（本 spec はツールまで。修正は Owner）

## データモデル変更

なし。**読み取りのみ。**

```
competition_guidesはfamily, guide_ja, source_url, verified_at, updated_atを読む。competition_standingsとmatchesからcompetition_id単位で対象チームを得て、teams.name/english_nameと管理済み別名で照合する。存在しないbody/status/teams.name_ja/name_en列を使わない。
standings: competition_id, team_id
matches:   competition_id, home_team_id, away_team_id
teams:     id, name, name_ja, name_en, slug
```

実装前に、大会ガイドの実際の保存先を `lib/db/types.ts` と `specs/feat-evergreen-competition-guides.md` で確認すること。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

**なし。コスト $0。**

チーム名の抽出は `teams` の `name` / `name_ja` / `name_en` を辞書とした文字列マッチで行う。**LLM に「参加国を列挙して」と尋ねない**（それ自体が捏造の経路になる）。

## 変更詳細

各大会シーズンについて:

1. 実データ側のチーム集合 A を作る。`standings` に行があればそれを使い、無ければ当該シーズンの `matches` の home/away チームの和集合を使う
2. ガイド本文から、`teams` の名称辞書に一致する文字列を抽出して集合 B を作る
3. **B に含まれるが A に無いチーム**（ガイドにだけ登場＝誤りの疑い）と、**A に含まれるが B に無いチーム**（実データにあるがガイドが触れていない）を報告する

**「A に無い」ことだけで自動的に誤りと断定しない。** 過去大会の優勝国や歴史的記述として正しく登場する場合がある。レポートには**該当箇所の前後の文**を添え、Owner が判断できるようにする。

## 受け入れ条件

1. `tools/audit-competition-guide-facts.ts` が存在し、`node --env-file=.env.production.local tools/run-ts.cjs tools/audit-competition-guide-facts.ts` で実行できる
2. **書き込みが 1 件も無い**。ソース中に `.insert(` / `.update(` / `.upsert(` / `.delete(` が現れない
3. **Nations Championship 2026 について、ジョージアが「ガイドにあるが実データに無い」として報告される**
4. 同大会について、フィジーが「実データにある」側に分類される
5. レポートに、指摘されたチーム名の**前後の文（前後 60 文字程度）**が含まれ、Owner が文脈を見て判断できる
6. LLM 呼び出しが 1 回も無い（ソース中に `getOpenAIClient` / `MODELS` が現れない）
7. 出力に「実データに無い＝誤りとは限らない」旨の注記が含まれる
8. `pnpm test` と `pnpm typecheck` が green

## 対象と出力の確定
対象familyと比較するseasonを引数で明示する。順位表と試合データの取得範囲が不完全ならcoverage=incompleteとし、集合にない名前を不参加と断定しない。出力JSON/CSVにはfamily、season、guide_updated_at、coverage、候補名、短い周辺文、照合元、理由、確認先URL、取得時刻を持たせる。過去の対戦相手への言及は参加断定と別分類にする。

**NC 2026 ガイドの実際の修正は本 spec の対象外。** ツールで全大会の状況を把握してから、Owner が修正範囲を決める。1 件だけ手で直しても他の大会に同種の誤りが残る。
