# Wikipedia を sourced facts の許可ドメインに追加する

## 背景

2026-08-07、規約違反ドメイン由来の sourced facts を除去する作業（`fix-sourced-facts-purge-prohibited-domains.md`）の dry-run を実行したところ、**`en.wikipedia.org` の9件が削除対象に含まれていた**。

```
Sourced fact purge targets: total=170 allowed=43 delete=127
  ...
  en.wikipedia.org: 9
  ...
Matches without allowed sourced facts: 11
```

Wikipedia が許可リストに含まれていないためだが、これは追加し忘れと考えられる。実際に9件が収集されている事実は、経路として機能していることを示している。

### Wikipedia を除外する理由がない

**Tryline は既に Wikipedia を主要データソースとして全面的に使っている。** `lib/scrapers/` には `wikipedia-*` のモジュールが20本以上あり、試合日程・結果・ラインナップ・順位表・選手情報を毎日 cron で取得している。2026-08-07 に追加したグレイテスト・ライバルリー・ツアーの取り込みも Wikipedia 由来である。

その Wikipedia を「sourced facts の供給源としては不許可」とするのは一貫していない。

**ライセンスと robots.txt の両面で、今回監査したどのドメインより条件が良い。**

- コンテンツは **CC BY-SA**。`spider` 禁止条項も「personal, non-commercial use」への限定もない
- robots.txt に **GPTBot / CCBot の禁止記述が存在しない**（2026-08-07 に `en.wikipedia.org/robots.txt` を実測、該当0件）

2026-08-07 に実施したラグビー公式サイトの監査では、World Rugby・スコットランド協会・ウェールズ協会・イングランド協会・オールブラックス・LNR の6件が `spider` / `scraping` / `text and data mining` を明示禁止していた。Wikipedia にはそれがない。

### 帰属表示が現状では不十分

CC BY-SA は帰属表示を求める。現在の `components/match-content-trust-strip.tsx` は「参照元3件」のように**件数のみを表示**しており、ドメイン名も URL も出していない。

```
sourcedFactCount > 0 ? `参照元${sourcedFactCount}件` : null,
```

Wikipedia を正式な供給源とするなら、ここを出典が分かる表示に変える必要がある。これは Wikipedia に限らず、他の許可ドメインにも同じく望ましい。

なお Tryline は設計不変条件として「スクレイプした生テキストは決して再配信しない。LLM で日本語に書き直してから配信する」を持ち、sourced facts のプロンプトも15語超の引用を禁じている。事実のみを扱い表現を複製しない運用のため、CC BY-SA のシェアアライク条項が記事本文に及ぶ場面は想定しにくい。ただしこれは法的判断であり、本 spec は帰属表示を行う方針を採ることでリスクを下げる。

## スコープ

対象:
- `wikipedia.org` を `SOURCED_FACT_ALLOWED_DOMAINS` に追加する
- sourced facts の出典を UI で表示できるようにする（件数のみ → ドメインと URL）

対象外:
- 他ドメインの追加・除去（`fix-sourced-facts-purge-prohibited-domains.md` の結果を維持する）
- Wikipedia からの取得ロジックの新規実装。既存の web 検索経路がそのまま使われる
- `lib/scrapers/` の各 `wikipedia-*` モジュールの変更（試合データ取り込みは別系統）
- 記事本文への出典脚注の埋め込み（プロンプト変更を伴うため別途）
- 削除スクリプトの変更

## データモデル変更

なし。`match_sourced_facts` は既に `source_domain` と `source_url` を保持している。

## API サーフェス

### 1. 許可ドメインの追加

`lib/llm/sourced-facts/allowlist.ts` に `wikipedia.org` を追加する。

既存の `domainMatches` は `domain === allowedDomain || domain.endsWith('.' + allowedDomain)` で判定するため、**`wikipedia.org` の1エントリで `en.wikipedia.org` と `ja.wikipedia.org` の両方が許可される**。言語別サブドメインを個別に列挙しないこと。

`isOfficialSourcedFactDomain` の扱いに注意すること。Wikipedia は公式サイトではないため、`confidence: high` の判定基準に影響しないか確認する。影響する場合は `MEDIA_DOMAINS` 側に置くなど、既存の信頼度設計に沿った配置を選ぶこと。

### 2. 出典表示

`components/match-content-trust-strip.tsx` を、件数だけでなく**出典ドメインを表示する**形に変える。

- 表示するのはドメイン名（例: `en.wikipedia.org`）。重複は排除する
- 各ドメインは対応する `source_url` へのリンクにする。複数 URL がある場合は代表1件でよい
- 外部リンクには `target="_blank"` と `rel="noopener noreferrer"` を付ける
- 出典が0件のときは従来どおり何も表示しない
- 既存の「ラインアップ確認済み」表示は維持する

呼び出し側（`components/match-content.tsx` など）に出典情報を渡す必要がある場合は、`sourcedFactCount` に加えて出典の配列を渡す形に拡張する。

## UI サーフェス

`MatchContentTrustStrip` の表示のみ。記事本文・見出し・レイアウトには手を入れない。

## LLM 連携

なし。プロンプト・モデル・QA 基準は変更しない。許可ドメインが増えることで収集される事実は増えるが、収集ロジック自体は既存のまま。

## 受け入れ条件

1. `SOURCED_FACT_ALLOWED_DOMAINS` に `wikipedia.org` が含まれる。
2. `isAllowedSourcedFactDomain("en.wikipedia.org")` と `isAllowedSourcedFactDomain("ja.wikipedia.org")` がいずれも `true` を返す。1エントリでサブドメインが許可されることをテストで担保する。
3. 除外済みの13ドメイン（`englandrugby.com` / `allblacks.com` / `lnr.fr` と、それ以前に除外された10件）が、いずれも許可されていない状態が維持されている。
4. `MatchContentTrustStrip` が出典ドメインを表示する。重複が排除されている。
5. 表示されたドメインが対応する `source_url` へのリンクになっており、`target="_blank"` と `rel="noopener noreferrer"` が付いている。
6. 出典が0件の場合に何も表示されない（既存の挙動を維持）。
7. 「ラインアップ確認済み」の表示が従来どおり出る。
8. `buildSearchPrompt` の推奨ソース記述に `wikipedia.org` が自動的に含まれる（`SOURCED_FACT_ALLOWED_DOMAINS` から導出しているため追加作業は不要なはず。実際に含まれることをテストで確認する）。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **本 spec の実施前に削除スクリプトを実行すると、`en.wikipedia.org` の9件が失われる。** 実行順序は「本 spec をマージ → 削除スクリプト実行」とすること。逆順にすると9件は戻らない。

2. **`confidence` の扱いが未確定。** 現在のプロンプトは「Use high only for official-source facts or facts confirmed by at least two sources」としている。Wikipedia を公式扱いにするかは判断が要る。百科事典として二次情報であることを踏まえると `medium` が妥当だが、既存の `isOfficialSourcedFactDomain` の実装を確認したうえで決めること。

3. **記事本文への出典明示は別途。** 本 spec は trust strip での表示に留める。本文中に「Wikipedia によると」のような記述を入れるかはプロンプト変更を伴うため、必要なら別 spec とする。

4. **Wikipedia は編集可能で、誤情報が混入しうる。** 試合データの取り込みでは既にこのリスクを受け入れているが、sourced facts では「負傷者情報」「選手の経歴」など検証しにくい記述が入る余地がある。`fix-sourced-facts-prompt-allowlist-drift.md` で導入した `unrelated_fixture` の検証は効くが、内容の真偽までは判定できない。運用しながら質を見ること。
