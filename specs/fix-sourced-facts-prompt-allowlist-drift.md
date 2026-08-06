# sourced facts のプロンプトと許可ドメインの齟齬、および対象試合の検証

## 背景

2026-08-06、8/8 日本×オーストラリア戦（`/matches/2c276057-bb3a-4617-a5b1-b7742e65f034`）のプレビューに外部情報の反映が一切ないことから調査したところ、2つの独立した欠陥が見つかった。

### 欠陥1: プロンプトが禁止ドメインを推奨し続けている（収集量の問題）

`specs/fix-sourced-facts-allowlist-compliance.md` は、利用規約で AI 学習・データマイニングを明示的に禁止している10ドメインを許可リストから除外した。同 spec 自身がこう記録している。

> 特に `rugbypass.com` は本番の `match_sourced_facts` 全143件中47件(33%)を占める最大の情報源

除外は正しく実施され、`lib/llm/sourced-facts/allowlist.ts` に `rugbypass.com` / `planetrugby.com` は存在しない。**しかし検索プロンプトが更新されていない。**

`lib/llm/sourced-facts/fetch.ts:160`

```
"- Prefer official competition/club sources and RugbyPass/Planet Rugby/RugbyAsia247.",
```

モデルは指示どおり RugbyPass と Planet Rugby を優先して fact を返す。返ってきた fact は `lib/llm/sourced-facts/allowlist.ts:135-141` で許可ドメイン判定に落ち、**`return null` で黙って破棄される**。`db_authoritative` 系の却下と異なり `rejected` 配列にも積まれないため、ログにも記録にも残らない。

結果として、検索とトークンを消費しながら成果が0件になる試合が大量に発生している。2026-08-06 時点で `match_sourced_facts` に preview の fact を持つ試合は **DB 全体で15試合のみ**（Nations Championship 11 / Premiership 2 / League One 1 / Lipovitan Challenge Cup 1）。`lib/cron/orchestrate.ts:269` はプレビュー生成のたびに毎回 `fetchSourcedFacts` を呼んでいるため、呼ばれていないのではなく、呼ばれた結果が捨てられている。

### 欠陥2: 対象試合と無関係な fact が通る（関連性の問題）

上記 8/8 戦に保存されていた fact 2件は、いずれも**同じ大会の別カード**のものだった。

| ソース | 内容 |
|---|---|
| `rugby-japan.jp` | 2026年6月25日、リポビタンDチャレンジカップ2026の**マオリ・オールブラックス戦**に出場する JAPAN XV の登録メンバー発表 |
| `rugby-rp.com` | 2026年6月26日、名古屋で**マオリ・オールブラックス戦**に向けたキャプテンズラン |

プロンプトには `match: 日本 vs オーストラリア` と `kickoff_date: 2026-08-08` が渡っている（`fetch.ts:150-156`）にもかかわらず、6月の別カードの情報が保存された。

却下理由は `lib/llm/sourced-facts/types.ts:13-15` に2種類しか定義されておらず、いずれも対象試合との関連性を見ていない。

```
export type SourcedFactRejectionReason =
  | "db_authoritative_score"
  | "db_authoritative_relative_recency";
```

なお、この2件はプレビュー本文には使われていない（生成側が統計のみで記事を構成した）。捏造ガード自体は機能している。ただし「ガードが働いた結果、書くことが無くなった」状態であり、公開中のプレビューは691文字と薄い。

## スコープ

対象:
- 検索プロンプトの推奨ソース記述を許可ドメインと一致させる
- ドメイン不許可による破棄を観測可能にする
- 対象試合と無関係な fact の却下

対象外:
- **許可ドメインの追加・復活**。`rugbypass.com` 等は利用規約違反を理由に意図的に除外されており、本 spec では触れない。プロンプト側を allowlist に合わせるのであって、逆ではない
- `lib/llm/prompts/generate-preview.ts`（記事生成側）の変更。本 spec は入力である sourced facts の品質のみを扱う
- プレビューの文字数・構成・見出しの変更
- recap 固有の調整（却下ルールは共通なので影響は及ぶが、recap 向けの追加変更はしない）
- `match_sourced_facts` のスキーマ変更
- 既存の誤った fact の削除・バックフィル（未解決の質問に回す）

## データモデル変更

なし。マイグレーション不要。

## API サーフェス

### 1. プロンプトの推奨ソースを allowlist から生成する

`lib/llm/sourced-facts/fetch.ts:160` のハードコードされた行を、`SOURCED_FACT_ALLOWED_DOMAINS` から動的に組み立てる形に変える。将来ドメインを増減しても再び齟齬が生じないようにするため、**ドメイン名をプロンプト側に直接書かない**こと。

あわせて「許可ドメイン以外のソースは採用されないので返さないこと」という趣旨の指示を追加する。無駄な検索結果を減らす目的。

### 2. ドメイン不許可の破棄を観測可能にする

`SourcedFactRejectionReason` に `domain_not_allowed` を追加し、`lib/llm/sourced-facts/allowlist.ts:135-141` で許可外ドメインを理由に落とす際に `rejected` へ積む。

`fact` 全文を記録する必要はないが、**どのドメインで何件落ちたか**が分かる形にする。`fetchSourcedFactsForMatch` の戻り値または `console.info` で、ドメイン別の破棄件数を出力する。

### 3. 対象試合との関連性検証

`SourcedFactRejectionReason` に `unrelated_fixture` を追加し、次のいずれかに該当する fact を却下する。

- fact（`fact` と `fact_ja` のいずれか）に、対戦2チームのどちらの名称も含まれない
- fact に、キックオフ日から **前後14日を超えて離れた日付**が含まれる

チーム名の照合には `teams` の `name` と `name_ja` の両方を使う。表記揺れ（「日本」と「日本代表」、`Japan` と `JAPAN XV` 等）を吸収するため部分一致とし、独自の別名辞書は作らない。判定に迷う場合は却下側に倒す（誤った文脈を記事に持ち込むより、facts が0件で統計ベースの記事になるほうが安全）。

日付の抽出は決定論的に行い、LLM を使わない。

## UI サーフェス

なし。

## LLM 連携

検索プロンプト（`buildSearchPrompt`）の文言のみ変更する。使用モデルは変更しない。却下判定はすべて決定論的なコードで行い、LLM に判断させない。

## 受け入れ条件

1. `buildSearchPrompt` の出力に `rugbypass.com` / `planetrugby.com` など許可されていないドメイン名が含まれない。
2. `buildSearchPrompt` の推奨ソース記述が `SOURCED_FACT_ALLOWED_DOMAINS` から導出されており、ドメイン名がプロンプト内にハードコードされていない。allowlist を1件増減させるとプロンプト出力も変わることをテストで担保する。
3. 許可外ドメインの fact が `domain_not_allowed` として `rejected` に記録される。破棄件数がドメイン別に出力される。
4. 対戦2チームのいずれの名称も含まない fact が `unrelated_fixture` として却下される。
5. キックオフ日から前後14日を超えて離れた日付を含む fact が `unrelated_fixture` として却下される。
6. 背景に挙げた実データ2件（マオリ・オールブラックス戦の登録メンバー発表／キャプテンズラン）が、8/8 日本×オーストラリア戦に対して却下されることをテストで確認する。
7. 対戦チーム名の表記揺れ（`Japan` / `日本` / `日本代表`）で誤って却下されないことをテストで確認する。
8. 却下判定に LLM 呼び出しが含まれない。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **既存の誤った fact をどうするか。** 8/8 戦の2件は現在も DB に残っている。プレビュー本文には使われていないため実害は出ていないが、再生成時に参照される可能性がある。削除するかは Owner 判断。件数が少ないため手動で対応できる。

2. **本 spec だけで収集量が回復するかは未検証。** 許可ドメインは公式9件＋メディア4件（`rugbyasia247.com` / `rugby-rp.com` / `onrugby.it` / `therugbypaper.co.uk`）と限定的で、Six Nations や Premiership の英語ニュースを継続的にカバーできるかは不明。プロンプト修正後に収集量を再計測し、依然として不足するなら「規約上問題のないドメインの追加」を別 spec で検討する。

3. **プレビューの文字数逓減との関係は未確認。** `preview@1.9.0` の平均1,155文字に対し `preview@3.9.0` は平均715文字と4割縮んでいる。sourced facts の枯渇が原因の一部である可能性はあるが、プロンプト側の変更による意図的な引き締めかもしれない。本 spec の効果測定と合わせて確認する。
