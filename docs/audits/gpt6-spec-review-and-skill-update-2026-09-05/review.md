# Tryline — 仕様レビューとスキル改稿案（2026-09-05）

依頼: [指定プロンプト](../../../docs/chatgpt-prompts/gpt6-spec-review-and-skill-update-2026-09-05.md)。基準コード: [53caceeccb552ff98a7b4c37d6960a1eda37b665](https://github.com/Gosshi/tryline/commit/53caceeccb552ff98a7b4c37d6960a1eda37b665)。ローカルHEADと公開GitHubのcommit APIを2026-09-05に照合した。レビュー対象の11仕様・11指示書はローカルの未コミット文書を全文確認した。2026-09-05の再集計は追跡済みspec 484本、今回の未追跡草案11本を含む検索対象495本（git ls-filesと作業ツリーを分けて集計）。既存スキル26本・エージェント3本も全文確認した。

**判定は差し戻し7本・条件付き承認4本。実装に入る前に仕様を改訂する必要がある。** 原文の仕様・指示書・有効な.claudeファイルは変更していない。以下はレビューと貼り替え用文案であり、Ownerの方針決定や本番操作を代行するものではない。

PR #756（火曜再生成）、#758（失敗伝播・分割/並列制限）、#757（D027のニュース収集停止）は完了済みとして扱い、F#8/9/10を新しい実行計画から除外した。F#11は#758後にも残る結果分類/対象IDの問題に限定する。

Windowsの前回訂正は読者構成とセッション構成を混同していた。今回の基準は**ユーザー基準65% / セッション基準49%**（Ownerが2026-09-05に提供したGA4、2026-08-08〜09-04、operatingSystem）。読者構成はユーザー基準を使う。Macの高いセッション比だけで全MacユーザーをOwnerと証明することはできない。OS行のユーザー合計と全体の重複排除人数も混ぜない。

## A. spec レビュー

### A-0 マージ順序と衝突

最初に本レビューの契約矛盾をClaude Code + Ownerが解消し、同名promptへ反映する。以下はその後の実装順序案である。現文面のまま11本を一斉投入しない。

| 系列 | マージ順 | 理由 |
|---|---|---|
| イベント | #1を共通純関数の切出しと入口ガード本体に分ける → 共通部分 → #3表示 → #2生成 → #4棚卸しツール → #1入口本体 | 表示/新規生成の封じ込めを、複雑な同一性設計や本番全件棚卸しの完了まで待たせない。切出しは仕様改訂に明記する。 |
| 課金 | #8 → #9（実条件確認後） | #8は表示条件の確認待ちに依存しない。#9はCheckoutも共通化対象に含める。 |
| 大会 | #5 → #6 → #7 | #5/#6が共通viewing guideを変更する場合は直列。#7の読取ツールは独立して進めてよい。 |
| 監視・H2H | #10は定義改訂後、#11は次回条件修正後に独立実装 | #10の単純status集約だけを先行させるなら、仕様上の分割を先に確定する。 |

系列間はファイルが分離する部分のみ並行可能。マージ直前に同じbaseへ整合させる。#4の本番監査結果を待たず#2を導入することは妥当であり、不正根拠から新規記事を生成し続ける理由にはならない。

| 組合せ | 衝突箇所・確認点 |
|---|---|
| #1/#2 | lib/llm/stages/assemble.ts、整合関数のimport、lib/llm/notify.ts |
| #1/#3/#4 | 共通の純関数・変換型。audit.tsのprivate関数を各層からimportする形は不可 |
| #2/#3 | 元イベントを空にする前の判定結果と、未終了/null/0件の意味 |
| #1/#2/#8 | notify.tsのhelper追加・安全な通知・通知失敗時の扱い |
| #5/#6 | components/competition-viewing-guide.tsxを変更する案を採る場合。専用RWC pageと汎用season page自体は別 |
| #8/#9 |直接のファイル競合はないが、権限/trial条件は統合試験で確認 |
| #2/#10 | stage success、QA通過、公開保存、skippedの意味。コード競合より契約の依存 |
| #11 | 他10本と対象pageが独立 |

得点の既存単一実装は [pointsForMatchEvent](https://github.com/Gosshi/tryline/blob/53caceeccb552ff98a7b4c37d6960a1eda37b665/lib/format/match-event-points.ts#L10)。`computeScoreTimeline`をDB依存ごとUIへimportせず、この純関数を共有する。既存入力型の変換も明示的に定義する。

共通の検証条件: 新しいテストは関連するtests/fixtures/型を変更範囲に含める。`pnpm test`の実行だけでは[除外設定](https://github.com/Gosshi/tryline/blob/53caceeccb552ff98a7b4c37d6960a1eda37b665/vitest.config.ts#L16)内のpipeline/assemble/health/DBテストは走らない。LLMとDBをモック化した安全な回帰テスト、またはlocal DB専用実行を明記する。今回の成果物は文書のみなのでアプリのlint/build/実課金・本番DB検証を実行したとは報告しない。

### A-1 fix-event-ingestion-identity-guard

**判定: 差し戻し。** [仕様](../../../specs/fix-event-ingestion-identity-guard.md) / [指示書](../../../docs/codex-prompts/fix-event-ingestion-identity-guard.md)

1. **観点1**: AC3の56–17対32–35は有効。AC1/2のgrep件数は別名呼び出し・ローカル同名関数を扱えず、経路網羅の証拠にならない。AC7はV2～V4違反まで正常扱いする文になっている。
2. **観点2**: 「未解決なし」は成立しない。source fixture識別子のキー・namespace・欠損時・日付粒度、V3の正規化と誤検知、入力のチーム同一性を確定させる必要がある。D025の独立した基準という原則を適用する。
3. **観点3**: 実行中の既存データ修復禁止は妥当。一方、現行events.tsはdelete→insertなのでAC13の「既存行を1行も削除・更新しない」と通常取り込みが衝突する。拒否時は書き込みゼロと、今回本番操作を行わないことを分ける。
4. **観点4**: match_events.player_name列はない。metadata.player_nameを使う。共通関数は存在するがNC版は引数が別型で単なるimport置換にならない。既存のpointsForMatchEventが換算の正である。
5. **観点5**: fix-contaminated-match-eventsの共通入口除外、fix-live-ingest-event-key-collisionの保存前ガード・日付キー、feat-nations-championship-event-sourceと整合が必要。既存ソース照合の保護を共通化時に落とさない。
6. **観点6**: match_id・キャッシュ・LLM groundingを強める方向。ただしV2はteamSideから割り当てたIDを同じhome/away集合で検査するだけでは常に合格し、第三チームの入力検証にならない。
7. **観点7**: 新規LLM呼び出しは不要。V3の既存イベント照合はDB読出し・egress・時間を増やすので総コストゼロではない。全件読み出しをイベント1行ごとのループに置かない。
8. **観点8**: #2/#3/#4が共通計算を利用する。純関数の切り出しだけ先行し、取り込み修正本体を待たせず表示・生成の封じ込めを進める。assemble.ts、audit.ts、notify.tsで衝突する。
9. **観点9**: 得点一致/過不足/PT7点/第三チーム/同じID別namespace/別試合で同一短署名/欠損名/同点反転/DB例外を含める。拒否後も元行が残り、各cronが失敗を伝播することまでモックで確認する。
10. **観点10**: V4は既知の別matchへのID重複だけを検出する。誤った新規ID、同一fixture内のhome/away逆転、正しいIDに誤イベントを載せる場合を防げない。完全な同一性には出典側のチーム識別・試合日とDBの独立照合が必要。加えて共通関数を経由しないインポータとdelete→insertの非原子性が残る。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-event-ingestion-identity-guard.md:60`

> match_events: match_id, team_id, minute, type, player_name

置き換え文:

```text
match_events: match_id, team_id, minute, type, metadata（player_name / is_penalty_try）。得点換算は lib/format/match-event-points.ts の pointsForMatchEvent を使う。
```

`specs/fix-event-ingestion-identity-guard.md:105`

> **対称スコア（例: 24–24）では反転を V1 で検出できない。** この限界を既知として受け入れ、V4 の fixture 同一性で補う。

置き換え文:

```text
V4 は既に別 match_id に登録された同一 source namespace・fixture ID の重複を検出する。対称スコアでのチーム帰属反転は V4 でも一般には検出できず、本仕様では未解決として残す。完全に防ぐ変更は、出典側のチーム識別子と試合日を入力契約へ追加して照合する別仕様で定める。「同一性を保証した」と完了報告しない。
```

`specs/fix-event-ingestion-identity-guard.md:121`

> 7. **正常系が壊れていないこと**: イベント合計が最終スコアと一致する試合、および `status` が `finished` でない（スコア未確定の）試合では、従来どおり書き込みが成功することを検証するテストがある

置き換え文:

```text
7. V1適用時はスコアが完全一致し、V2～V4にも違反しない入力だけを正常系とする。未終了試合はV1だけを省略し、他の判定は省略しない。
```

`specs/fix-event-ingestion-identity-guard.md:127`

> 13. **本 spec の実装で、既存の `match_events` 行が 1 行も削除・更新されない**こと（差分に DELETE / UPDATE が現れない）

置き換え文:

```text
13. 拒否・検証読出し失敗時はmatch_eventsへの変更がゼロで、既存行が保持される。正常な既存取り込みの置換動作と、今回行わない本番データ修復を区別する。正常時のdelete→insertの途中失敗への原子性対応は別途明示し、このガードだけで解決済みとしない。
```

`specs/fix-event-ingestion-identity-guard.md:31`

> **11 経路のうちガードがあるのは 2 経路だけで、しかも判定基準が違う。** 汚染はガードの無い経路から入った。

置き換え文:

```text
共通関数の直接呼び出し11箇所に加え、Nations ChampionshipのupsertEvents別名経由1箇所を検証する。World Rugby/League Oneの独立した同名保存関数は別経路として列挙する。呼び出し一覧とガード一覧をACに固定し、単純な文字列件数を網羅性の判定に使わない。
```

`specs/fix-event-ingestion-identity-guard.md:99`

> V3 は署名列が 3 件以下の試合では偶然一致しうるため、**4 件以上のときのみ適用**する。3 件以下は V1 / V2 / V4 に委ねる。

置き換え文:

```text
V3はイベントを安定ソートした多重集合として比較し、重複数を保持する。名前はmetadataの文字列へNFKC・空白正規化を適用し、欠損名を空文字だけで同一人物とみなさない。4件閾値は暫定の候補抽出基準であり汚染確定ではない。自動拒否の採否は正常試合の反例テストを確認してOwnerが仕様改訂時に確定する。
```

**参照確認:** 存在しない参照: specs/fix-data-integrity-alert-actionability.md（本spec L37）。新規予定と明記すること。lib/ingestion/event-integrity.tsは明記された新規作成先なので誤参照ではない。

**同じ領域の既存仕様:** [fix-contaminated-match-events](../../../specs/fix-contaminated-match-events.md)、[fix-live-ingest-event-key-collision](../../../specs/fix-live-ingest-event-key-collision.md)、[feat-nations-championship-event-source](../../../specs/feat-nations-championship-event-source.md)、[p1-match-events-ingestion](../../../specs/p1-match-events-ingestion.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 経路数の説明と「触るファイル」を別名経由/独立保存関数を含む一覧へ置換する。parser対象外のまま完全なチーム同一性を保証しない。拒否時の保存ゼロと通常置換を分け、関連テストを許可する。

### A-2 fix-generation-event-integrity-gate

**判定: 差し戻し。** [仕様](../../../specs/fix-generation-event-integrity-gate.md) / [指示書](../../../docs/codex-prompts/fix-generation-event-integrity-gate.md)

1. **観点1**: 生成前の停止というACは検証可能。ただしassembleが先にeventsを空にするとpipelineのlength>0判定に入らず、指定のstage0失敗ログ・通知を満たせない。
2. **観点2**: 未終了・スコアnull・イベント0・キャッシュヒットの判定順を確定する。eventTotalsMatchFinalScore自身はstatusを受け取らないため、未終了を自動で除外するとの説明は不正確。
3. **観点3**: 既存公開本文・DB行の変更と再生成を除外する点は妥当。内部入力型と純関数の追加、関連テストの変更を指示書の許可ファイルへ明記する。
4. **観点4**: assemble.ts:276の関数、pipeline.ts:204のlength条件、notify.tsは実在する。関数のfalseは得点不一致専用ではなくtimeline/score nullも含む。
5. **観点5**: fix-score-event-integrity-checkのwarn-onlyとfix-derived-stats-event-integrity-gateのtimeline対象外を明示的に上書きする説明は良い。p3-recap-require-eventsとfix-regen-reject-preserves-publishedも保持する。
6. **観点6**: 不正な根拠を渡さず、既存groundingゲートも維持する方向は適合。整合性確認をLLM任せにしてはいけない。
7. **観点7**: 判定自体はLLM不要で不一致試合の課金を減らす。再現テストはLLMをモック化し、抽出・生成・QAのいずれも呼ばれないことを確認する。
8. **観点8**: 棚卸し完了を待たず導入するのが妥当。不正入力による新しい公開を継続する理由にならない。#3と封じ込めを先行し、#4で対象件数を別途測る。#1の全取り込み修正は前提にしない。
9. **観点9**: 空配列化後にも元の差分32–35対56–17がstage0へ残る統合テストが必要。既存pipeline/assembleテストは標準Vitest除外対象なので専用コマンドか安全な新規単体テストを指定する。
10. **観点10**: 公開済み本文は残る。さらに整合性理由のskippedを単なる対象外と同じ成功に集計すると監視が再び緑になる。結果理由を保持してF#11の集計へ渡す契約が必要。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-generation-event-integrity-gate.md:38`

> なし。書き込みは既存の `pipeline_runs` ログのみ。

置き換え文:

```text
データスキーマの変更はない。内部の集約結果にはeventIntegrity（判定、元イベント数、期待値、実測値、差分、理由）を保持する。DB・UIの公開型には不用意に露出させない。
```

`specs/fix-generation-event-integrity-gate.md:89`

> ## 未解決の質問
> なし。

置き換え文:

```text
## 判定順序（未解決なしとする前に確定する）
recapかつfinishedかつ両スコア確定時に、空配列化の前の入力で判定する。不一致はeventIntegrityへ証拠を保存し、events=[] / score_timeline=null / derived_stats=nullとする。pipelineはevents.lengthで再判定せずeventIntegrityを使い、stage0 failedとmatch_id付き通知を出して、全LLM呼び出し前に理由付きskippedを返す。未終了・スコア未確定・eventsなしは別理由とする。既存公開記事の内容・statusは変更しない。
```

**参照確認:** 存在しないパスは確認されない。問題は既存関数の意味と適用順序。標準実行から除外されたtests/llm/pipeline.test.ts、tests/llm/stages/assemble.test.tsをpnpm testのみで検証済みとしない。

**同じ領域の既存仕様:** [fix-score-event-integrity-check](../../../specs/fix-score-event-integrity-check.md)、[fix-derived-stats-event-integrity-gate](../../../specs/fix-derived-stats-event-integrity-gate.md)、[p3-recap-require-events](../../../specs/p3-recap-require-events.md)、[fix-regen-reject-preserves-published](../../../specs/fix-regen-reject-preserves-published.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 入力型と純関数の対象を追加し、空配列化前の整合結果をpipelineへ渡す判定順を記載する。既存warning-only仕様の上書き範囲と理由付きskippedの集計契約も反映する。

### A-3 fix-contaminated-events-display-isolation

**判定: 差し戻し。** [仕様](../../../specs/fix-contaminated-events-display-isolation.md) / [指示書](../../../docs/codex-prompts/fix-contaminated-events-display-isolation.md)

1. **観点1**: APIのverified/mismatch/unavailableはテスト可能。ただしUIへstatusもnullable scoreも渡せない制約でACが達成不能。空イベント・0–0の優先順位も明記する。
2. **観点2**: 未解決なしの前に、variantごとの注記回数、unfinishedの非表示、本文が残ることを確定する。verifiedという名前はスコア一致のみを指し、イベント真正性の保証ではない。
3. **観点3**: DB修正・記事の自動unpublish・別リポジトリのモバイル変更を除外する点は良い。必要なページprops変更まで禁止している点を改訂する。
4. **観点4**: components/match-events-section.tsx:20–31にstatus/awayTeamIdはなく、final scoreはnumber。app/matches/[id]/page.tsx:462等はnullを0に変換している。lib/api/v1/types.tsは実在。toScoreEventはaudit.ts:117の非export関数。
5. **観点5**: feat-match-page-redesign、feat-mobile-score-progression-graph、fix-nations-championship-event-contaminationと重なる。既存のplayer links、言語切替、APIの他フィールドは保持する。
6. **観点6**: 不正イベントの描画・API配信を止める方針は適合。点数の合計が一致しても選手名・帰属の捏造がないとは言えない。UIからDBクライアントを含むassembleをimportしない。
7. **観点7**: 新規LLM呼び出しなし。既存取得結果から計算すれば追加DB読出しも避けられる。DB側の補正や再生成は不要。
8. **観点8**: #2とは共通計算で衝突するため純関数契約を先行。表示封じ込めを優先し#4全件監査待ちは不要。#2のみでは公開ページは直らない。
9. **観点9**: 56–17対32–35で要点・グラフ・一覧がすべて消えること、注記が1回だけ出ること、未終了・null・0件・正常PTのケースをSSR/レンダリング/APIで確認する。
10. **観点10**: APIのevents=[]は旧クライアントにも有効だが既公開本文は残る。本文の根拠も確認中だと分かる表示、またはOwnerによる対象記事の公開停止判断が別に要る。キャッシュの旧events応答が残る期間も確認する。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-contaminated-events-display-isolation.md:51`

> `components/match-events-section.tsx` の描画条件を次のように変える。props は現状のまま（`finalHomeScore` / `finalAwayScore` を既に受け取っているため、**呼び出し側 `app/matches/[id]/page.tsx:458, 473, 501, 518` の 4 箇所は変更不要**）。

置き換え文:

```text
MatchEventsSectionへstatus、awayTeamId、nullableな最終スコアを渡すため、app/matches/[id]/page.tsxの4呼び出し箇所のprops変更を対象に含める。nullを0へ変換して整合判定しない。
```

`specs/fix-contaminated-events-display-isolation.md:104`

> ## 未解決の質問
> なし。判定基準・表示条件・API 契約・スコープ境界は本 spec で確定している。

置き換え文:

```text
## 判定と表示の補足
unavailableを先に判定する（未終了、スコアnull、イベント0）。次に当該2チーム以外のIDを拒否し、残りで得点整合を判定する。verifiedは得点整合のみを意味する。mismatchの注記はhighlights側の1箇所に表示し、timeline側は空描画にする。「試合結果のみ掲載。得点経過は確認中です」と表示する。既存本文は未訂正であることを本変更の限界としてPRに明記する。
```

**参照確認:** reference/api-types.tsはspec内で存在しないと明記された除外例であり新たな誤参照ではない。toScoreEvent（本spec L79）は存在するがprivateなのでimport不可。lib/data-integrity/audit.ts:173は呼び出し付近で、定義は117。

**同じ領域の既存仕様:** [feat-match-page-redesign](../../../specs/feat-match-page-redesign.md)、[feat-mobile-score-progression-graph](../../../specs/feat-mobile-score-progression-graph.md)、[fix-nations-championship-event-contamination](../../../specs/fix-nations-championship-event-contamination.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** L26のprivate toScoreEventのimport指示を削除し、先行純関数を使う。ページ4箇所のstatus/nullable score/awayTeamId伝達とテストを対象に追加する。

### A-4 audit-published-recap-event-integrity

**判定: 差し戻し。** [仕様](../../../specs/audit-published-recap-event-integrity.md) / [指示書](../../../docs/codex-prompts/audit-published-recap-event-integrity.md)

1. **観点1**: 出力形式と回帰例は具体的。しかし存在しないDB列、private関数import、正常な第1戦もconfirmedになり得る分類で、ACを満たす正しい実装が作れない。
2. **観点2**: 署名の正規化・同分イベント順・名前欠損・言語別複数記事・複数相手・0件の優先度・全件取得の完全性を確定する。閾値4は証明済みの安全境界ではない。
3. **観点3**: 読取専用・自動修復なしは適切。source文字列のinsert/update禁止だけでは間接RPCやimport副作用を防げず、テストでDB書込みゼロを確認する。指示書にtests変更を許可する。
4. **観点4**: match_content.created_at/updated_at、match_events.player_name、matches.kickoff_utcはDB列に存在しない。toScoreEventはprivate。CSVのcompetition_slug等を得るteams/competitionsのJOINも必要。
5. **観点5**: fix-contaminated-match-eventsのplayer_id署名からmetadata.player_nameへ移る判断は良い。feat-data-integrity-weekly-audit、audit-published-entity-grounding、fix-live-ingest-event-key-collisionの監査と定義を揃える。
6. **観点6**: 現在のデータに基づく監査と生成時点の根拠を区別する点は適合。C4だけで一方を汚染元、他方を被害側と断定すると正常記事の停止を誘発する。
7. **観点7**: LLMコストは$0でよい。DB/転送コストまでゼロではない。署名ハッシュ後の実列比較で衝突を排除し、ページング・IN句分割の上限を定義する。
8. **観点8**: 共通純関数の確定後、#2/#3と並行してツールを作れる。本番での読取監査は許可された接続経路でOwnerが行う。修復と再生成はその結果後。
9. **観点9**: 第1戦はC1=falseだが対称なC4関係には入り得る点をテストする。相手がpreview-only/コンテンツなし、4つのnull名、同分順違い、部分反転、空データ、途中読出し失敗、複数言語記事も加える。
10. **観点10**: 4件未満・署名の一部欠損・片側のみ誤名・同点・未登録donorを見逃す。公開recap群だけで相互比較すると群外の汚染元も見逃す。全件監査は検出対象の列挙であり汚染率ゼロの証明ではない。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/audit-published-recap-event-integrity.md:38`

> match_content: match_id, content_type, status, prompt_version, created_at, updated_at

置き換え文:

```text
match_content: id, match_id, content_type, status, language, prompt_version, generated_at
match_events: match_id, team_id, minute, type, metadata
matches: id, home_team_id, away_team_id, home_score, away_score, status, kickoff_at, competition_id, external_ids
teams/competitionsを実際の外部キーでJOINし表示名とcompetition_slugを得る。CSVの日時列はrecap_generated_at/kickoff_atとする。
```

`specs/audit-published-recap-event-integrity.md:96`

> | `confirmed` | C4 に該当（対戦カード一致・署名一致・帰属全件反転）。第2戦と同型 |

置き換え文:

```text
| confirmed | 現在スナップショット内でC4に加え、その試合自身のC1/C2または独立した出典照合で不正が確認できる場合。C4のみはsuspectとし、相互一致から汚染の方向を断定しない。 |
```

`specs/audit-published-recap-event-integrity.md:108`

> **読み取り専用なので `--confirm-owner-approved` は不要**（LLM コストが発生しないため。`audit-entity-grounding.ts` がフラグを要求するのは LLM 課金があるから）。実行開始時に対象件数を表示する。

置き換え文:

```text
LLM実行承認フラグは不要だが、機密ファイルやgitignore対象へのアクセスを許すものではない。本番のenvファイルを読むコマンドはOwner本人用の運用例とする。Codexの検証は合成fixtureとモックで行い、本番監査は許可された読取専用接続でOwnerが実施する。
```

`specs/audit-published-recap-event-integrity.md:125`

> ## 未解決の質問
> なし。検査の定義・分類・出力形式・実行方法は本 spec で確定している。

置き換え文:

```text
## 監査の完全性と共通関数
対象match_idは公開recapを持つ試合に限定し、署名/fixture重複の比較先はコンテンツの有無を問わないイベント保有試合に広げる。ページングを末尾まで実行し、途中失敗は非ゼロ終了・incomplete reportとする。toScoreEventはprivateなので直接importしない。先行PRで切り出した純関数とpointsForMatchEventを使う。CSVは複数相手IDと言語別記事情報を配列として保持し、CSV quotingを適用する。
```

**参照確認:** DB列の誤参照は本spec L38–41。toScoreEventのimport要求はC1/AC7（定義はlib/data-integrity/audit.ts:117、private）。新規toolsファイルと出力先は予定なので非存在自体は問題なし。

**同じ領域の既存仕様:** [feat-data-integrity-weekly-audit](../../../specs/feat-data-integrity-weekly-audit.md)、[fix-contaminated-match-events](../../../specs/fix-contaminated-match-events.md)、[audit-published-entity-grounding](../../../specs/audit-published-entity-grounding.md)、[fix-live-ingest-event-key-collision](../../../specs/fix-live-ingest-event-key-collision.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** L39のprivate importと、ツール以外一切変更不可という範囲を改訂する。関連テストを許可し、C4のみで両試合をconfirmedにしない。envコマンドはOwner本人用と明記する。

### A-5 fix-rwc2027-match-count-and-broadcast-claims

**判定: 条件付き承認。** [仕様](../../../specs/fix-rwc2027-match-count-and-broadcast-claims.md) / [指示書](../../../docs/codex-prompts/fix-rwc2027-match-count-and-broadcast-claims.md)

1. **観点1**: 大会総数52と掲載件数Nを分けるACは検証可能。AC2の「同じ数字として提示されていない」はN=52で誤って不合格になるため意味の区別へ修正する。
2. **観点2**: 放送未発表の扱いは決定済み。guideの一部をどう隠すか、古いverified_atで2027全試合断定を再表示しないことをACに固定する。
3. **観点3**: ページ限定・DB/LLM再生成禁止は明確。page-only変更を優先できるが必要なら共通コンポーネント変更と専用テストを許可する範囲を先に定める。
4. **観点4**: PreTournamentBanner、getCompetitionGuide('rwc')、CompetitionViewingGuideはいずれも実在。L84–90は概ね原因付近である。guideはfamily単位で2027専用レコードではない。
5. **観点5**: fix-competition-guide-factual-errors-and-broadcast-verificationのguide全体verified_atだけでは個別の放送権を保証できない。feat-rwc2027-hub-seo-enhancement等の総数・出場数表現と揃え、旧大会のガイドを書き換えない。
6. **観点6**: 事実の範囲を限定し、欠損日程をLLMで補わないので適合。大会総数を取得済みNから導かない点はD025に沿う。
7. **観点7**: LLM追加コストなし。キャッシュ済みguideの表示加工だけで実現し、新しい生成ジョブを追加しない。
8. **観点8**: #6と共通CompetitionViewingGuideを触る場合は#5→#6の直列。ページ内だけなら独立。#7はread-onlyなので機能上の前提ではない。
9. **観点9**: N=0/36/52、guide null、verified_atありだが放送断定が古いケースを確認。DOMとJSON-LDの情報が同じで、配信サービス名が残存しないことを検査する。
10. **観点10**: このページの矛盾は解消できる。familyハブやモバイルAPIのguide本文、他年の放送権、試合自体の収録漏れは残るため完了範囲を限定する。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-rwc2027-match-count-and-broadcast-claims.md:64`

> 2. 同ページに大会全体が 52 試合であることと、Tryline の収録件数が別々に表示され、**どちらも同じ数字として提示されていない**

置き換え文:

```text
2. 大会総数52とTryline掲載件数Nは別ラベルで表示される。N=52のときは同じ数値になってよい。Nが0・36・52の各fixtureで検証する。
```

`specs/fix-rwc2027-match-count-and-broadcast-claims.md:73`

> ## 未解決の質問
> なし。52 試合・2027年10月1日〜11月13日は公式発表値であり、Codex は追加調査なしに実装できる。

置き換え文:

```text
## 追加の受け入れ条件
RWC2027の放送断定はguide.verified_atの有無に関係なく、2027年の当該放送権の出典が確認されるまで表示しない。DBのfamily共通guideは更新しない。旧大会の視聴案内・他ページには本変更の効果を外挿しない。
```

**参照確認:** 存在しない参照は確認されない。新しい手動定数の出典・確認日はspec記載の大会公式情報を保持する。

**同じ領域の既存仕様:** [fix-rwc2027-hub-route-shadowed](../../../specs/fix-rwc2027-hub-route-shadowed.md)、[feat-rwc2027-hub-seo-enhancement](../../../specs/feat-rwc2027-hub-seo-enhancement.md)、[fix-competition-guide-factual-errors-and-broadcast-verification](../../../specs/fix-competition-guide-factual-errors-and-broadcast-verification.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 掲載N=52を正常とするAC、古いverified_atでも2027放送断定を戻さないfixture、関連テストの変更許可を追記する。

### A-6 fix-season-faq-broadcast-hardcoding

**判定: 条件付き承認。** [仕様](../../../specs/fix-season-faq-broadcast-hardcoding.md) / [指示書](../../../docs/codex-prompts/fix-season-faq-broadcast-hardcoding.md)

1. **観点1**: 未登録→未確認、登録あり→実データからFAQを生成する方向は検証可能。visibleとJSON-LDの出力内容一致も確認する。
2. **観点2**: 1試合のverified broadcastを大会全体の視聴契約とみなす穴、確認日の古さ、過去シーズンの文脈をACで制限する。単なるservice_name一覧では判断材料が落ちる。
3. **観点3**: DB更新なし・放送権の調査を別にする方針は妥当。現行サービス集約がsource_url/verified_atを落とすため、queryの追加対象かpageで既存詳細関数を使うことを明記する。
4. **観点4**: season page:611の固定文は実在。lib/db/queries/match-broadcasts.tsのgetMatchBroadcastServicesForMatchesは確認日・出典・対応match_idを返さない。詳細はgetMatchBroadcastsForMatchesで取得できる。
5. **観点5**: feat-match-broadcasts、fix-competition-japanese-name-and-broadcast-display、fix-competition-guide-factual-errors-and-broadcast-verification、feat-season-page-search-answer-blocksと整合を取る。D025の取得データを全体と誤認する失敗を繰り返さない。
6. **観点6**: 根拠のある個別情報から作る方針は適合。ただし1件から「大会が視聴できる」と一般化しない。scrape生テキストの配信や新ソース収集は不要。
7. **観点7**: LLM不要。existing match_broadcastsを一括で取得すれば試合ごとの追加クエリを避けられる。インフラコストゼロの保証まではしない。
8. **観点8**: #5とshared viewing guideを触ると競合。#7は読取ツールなので並行可能。ルート影のあるRWC2027専用pageは#5の担当。
9. **観点9**: 放送1試合のみ、複数サービス、未確認、guideだけに古い断定があるケースを使う。FAQの同一関数利用だけでなく、実際の表示とJSON-LDの文を比較する。
10. **観点10**: 固定FAQの誤情報は解消可能。guide本文に残る放送断定とseasonを跨ぐ権利の違いを同時に検査しなければページ全体は一貫しない。FAQ rich resultをSEO効果の根拠にしない。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-season-faq-broadcast-hardcoding.md:66`

> ## 未解決の質問
> なし。分岐条件と文言方針は本 spec で確定している。

置き換え文:

```text
## 表示範囲の契約
match_broadcastsに登録された対象試合と確認日・出典を根拠にする。1試合以上あるだけでは「大会全試合を視聴できる」と書かない。回答は「掲載中の一部試合に視聴情報があります。対象試合の案内をご確認ください」とし、確認済み対象だけにサービス名を添える。未登録は視聴不可の断定ではなく未確認とする。過去シーズンの記録を現行放送権の根拠にしない。
```

`specs/fix-season-faq-broadcast-hardcoding.md:11`

> これは `seasonFaqs` に入り、**FAQPage の JSON-LD として全大会・全シーズンに出力される**。検索結果のリッチリザルトにも載りうる。

置き換え文:

```text
FAQの構造化データは表示本文と事実の整合を保つために更新する。GoogleのFAQリッチリザルト露出を改善効果として約束しない。
```

**参照確認:** 存在しないパスは確認されない。取得関数の返却型が検証に必要な情報を落とす点を修正する。Google公式Search更新履歴ではFAQ rich resultは2026-05-07以降表示されない。

**同じ領域の既存仕様:** [feat-match-broadcasts](../../../specs/feat-match-broadcasts.md)、[fix-competition-japanese-name-and-broadcast-display](../../../specs/fix-competition-japanese-name-and-broadcast-display.md)、[fix-competition-guide-factual-errors-and-broadcast-verification](../../../specs/fix-competition-guide-factual-errors-and-broadcast-verification.md)、[feat-season-page-search-answer-blocks](../../../specs/feat-season-page-search-answer-blocks.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 検索結果露出の期待を削り、1試合の放送情報を大会全体へ一般化しない回答を指定する。source/verifiedAtを残した取得関数と表示一致テストを許可する。

### A-7 fix-competition-guide-participant-verification

**判定: 差し戻し。** [仕様](../../../specs/fix-competition-guide-participant-verification.md) / [指示書](../../../docs/codex-prompts/fix-competition-guide-participant-verification.md)

1. **観点1**: 参加候補名の列挙はテスト可能。しかし対象テーブル・列・出力schemaが曖昧で、そのままでは再現可能な監査契約にならない。
2. **観点2**: family共通guideをどのseasonと比べるか、standings不足時の集合Aの完全性、単なる過去対戦への言及と参加断定の差を確定する必要がある。
3. **観点3**: 読み取りツールのみ・本文修正なしは明確。命名のfixに反して記事自体は直らないことをタイトル/完了説明でも明示する。
4. **観点4**: competition_guidesにはfamily/guide_ja/source_url/verified_at/updated_atがあり、competition_id・body・statusはない。standingsではなくcompetition_standings。teamsはname/english_nameで、name_ja/name_enではない。
5. **観点5**: feat-generate-competition-guide-per-family、feat-evergreen-competition-guidesとfamily/seasonの粒度を揃える。fix-competition-guide-factual-errors-and-broadcast-verificationの出典確認を置き換えない。
6. **観点6**: LLMなしで候補を絞ることは適合。ただし取得済みチーム集合を完全な参加国一覧とみなすとD025の反例になる。absenceを不参加確定としない。
7. **観点7**: LLM費用なし。名前別のDB検索をせず、必要な集合を一括取得する。出力は記事全文を再配信せず、Owner判定に必要な短い周辺文に絞る。
8. **観点8**: #5/#6と独立して作成できる。guide修正文書/手動更新は監査後のOwner判断であり、本specの完了に混ぜない。
9. **観点9**: NC2026の誤参加国候補に加え、過去大会の言及、同名・別名・部分一致、未開幕で順位表0行、途中までの順位表、family複数season、読出し失敗をテストする。
10. **観点10**: ジョージア等の誤参加断定そのものは残る。決定論でできる候補検出の限界を示し、本文の訂正担当・対象URLをOwnerへ渡す。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-competition-guide-participant-verification.md:35`

> competition_guides（または大会ガイドを保持する既存テーブル）: competition_id / family, body, status

置き換え文:

```text
competition_guidesはfamily, guide_ja, source_url, verified_at, updated_atを読む。competition_standingsとmatchesからcompetition_id単位で対象チームを得て、teams.name/english_nameと管理済み別名で照合する。存在しないbody/status/teams.name_ja/name_en列を使わない。
```

`specs/fix-competition-guide-participant-verification.md:78`

> ## 未解決の質問
> なし。検査方法・出力・スコープは確定している。

置き換え文:

```text
## 対象と出力の確定
対象familyと比較するseasonを引数で明示する。順位表と試合データの取得範囲が不完全ならcoverage=incompleteとし、集合にない名前を不参加と断定しない。出力JSON/CSVにはfamily、season、guide_updated_at、coverage、候補名、短い周辺文、照合元、理由、確認先URL、取得時刻を持たせる。過去の対戦相手への言及は参加断定と別分類にする。
```

**参照確認:** 本spec L35–38の仮定的スキーマが誤参照。tools/audit-competition-guide-facts.tsは明記された新規作成先であり、非存在自体は問題ではない。

**同じ領域の既存仕様:** [feat-generate-competition-guide-per-family](../../../specs/feat-generate-competition-guide-per-family.md)、[feat-evergreen-competition-guides](../../../specs/feat-evergreen-competition-guides.md)、[fix-competition-guide-factual-errors-and-broadcast-verification](../../../specs/fix-competition-guide-factual-errors-and-broadcast-verification.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 実テーブルと列、family/season・coverageの契約、JSON/CSVスキーマを指定する。『fix』は検出ツールまでであり本文修正完了ではないと明記する。

### A-8 fix-stripe-webhook-db-error-propagation

**判定: 条件付き承認。** [仕様](../../../specs/fix-stripe-webhook-db-error-propagation.md) / [指示書](../../../docs/codex-prompts/fix-stripe-webhook-db-error-propagation.md)

1. **観点1**: DB error時5xxと正常200、署名400のACは明確。userId欠落時に通知失敗まで200にするか、UUID不正、update対象0行を追加する。
2. **観点2**: 欠落メタデータを200で受ける判断は、恒久的な入力不備として修復キューを確実に残す条件で妥当。通知も失敗して失踪する経路は未解決なのでACにする。
3. **観点3**: 価格・署名・スキーマ・本番設定を変えない点は適切。通知helperと関連モックテストは変更許可へ追加。重複排除を新設しないこととイベント順序問題がないことは別である。
4. **観点4**: Stripe route:78/92のDB戻り値破棄を確認。RevenueCatはprofile error/upsert error/TRANSFERのerrorをthrowしており、同種のDB error握り潰しは確認されない。
5. **観点5**: feat-premium-entitlement-refactor、feat-ios-in-app-purchase、fix-free-trialを維持し、StripeとAppleの権限競合を変えない。fix-ga4-purchase-event-fires-at-trial-startは別の計測問題。
6. **観点6**: サービスキー・顧客情報を公開しない方針は適合。生のDB errorにはPIIが入り得るのでerror.message丸ごとのログは禁止し、安全な分類コードのみ残す。
7. **観点7**: LLMなし。Discordリトライ/Stripe再送の運用コストは発生し得るが、正しい失敗応答が優先される。実課金APIはテストでも不要でモック可能。
8. **観点8**: #9とはWebhookと表示/Checkoutなので独立。#1/#2とnotify.ts helperを触る場合は最後に統合する。RevenueCatに不要な変更はしない。
9. **観点9**: created/updated/deletedそれぞれDB error、throw、0行update、未対応eventにuserIdがないケース、通知失敗、同一event再送と順不同を区別したfixtureが必要。
10. **観点10**: DB errorの200握り潰しは直せる。upsertは同じスナップショットの再適用に限って冪等で、古いupdatedがdeleted後に届く権限復活を防がない。順序問題と欠落userIdの実復旧は別課題として残す。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-stripe-webhook-db-error-propagation.md:37`

> - 冪等性キーの新設・イベント重複排除の仕組み（**upsert は既に冪等**。再送で壊れない）

置き換え文:

```text
- 冪等性キー・イベント重複排除の新設は対象外。同一内容のupsert再適用と、異なるイベントの順不同は別問題であり、upsertだけで全再送が安全とは主張しない。順序逆転による権限上書きは別途Ownerへ報告する。
```

`specs/fix-stripe-webhook-db-error-propagation.md:72`

> 1. `console.error` に `event.id` / `event.type` / `userId` / エラー内容を出す

置き換え文:

```text
1. ログにはevent.id・event.type・検証済みuserIdと安全なエラー分類コードを残す。Supabaseのmessage/details/hintやイベント本文は記録しない。
```

`specs/fix-stripe-webhook-db-error-propagation.md:58`

> **`userId` 欠落で 5xx を返してはならない。** メタデータが無いイベントは何度再送されても成立せず、Stripe の再送上限まで無駄に叩き続けることになる。通知して 200 で受け切る。

置き換え文:

```text
対応対象のsubscriptionイベントでuserIdが欠落する場合は、event.id付きの永続的な運用ログと通知試行を残して200とする。通知の失敗も監視可能なログに残す。未対応event.typeはuserId検査より前に200とし、不要な欠落通知を出さない。Ownerがevent.idから調査・修復する運用を受け入れ条件に含める。
```

**参照確認:** 主要コードのパスはすべて実在。RevenueCatは「確認済み・同種の戻り値破棄なし」でよい。UUID形式検証前に任意metadata文字列をログへ出さない。

**同じ領域の既存仕様:** [feat-premium-entitlement-refactor](../../../specs/feat-premium-entitlement-refactor.md)、[feat-ios-in-app-purchase](../../../specs/feat-ios-in-app-purchase.md)、[fix-free-trial](../../../specs/fix-free-trial.md)、[fix-ga4-purchase-event-fires-at-trial-start](../../../specs/fix-ga4-purchase-event-fires-at-trial-start.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** L47の『upsertは再送で壊れない』を限定する。未対応typeの先行分岐、安全なログ分類、通知失敗/0行更新の扱いを追記する。

### A-9 fix-billing-terms-consistency

**判定: 差し戻し。** [仕様](../../../specs/fix-billing-terms-consistency.md) / [指示書](../../../docs/codex-prompts/fix-billing-terms-consistency.md)

1. **観点1**: 単一定数と表示同期のテストは可能。ただし「どちらの条件も選べる」構造試験だけで、実際のCheckoutリクエストと一致することを検証していない。
2. **観点2**: 実条件のOwner確認を前提にすること自体は妥当。質問の対象が誤っている。本番Priceの設定だけでもテスト環境だけでも本番Checkoutの実条件は確認できない。
3. **観点3**: 表示修正と本番設定変更の分離は良い。現在のtrial_period_daysを共通定数へ移すならCheckout routeも範囲に追加し、値・挙動を変えないと明記する。
4. **観点4**: app/api/stripe/checkout/route.ts:27–34でtrial_period_days:7を指定している。既存fix-free-trialは実際の機能実装を扱い、背景の『これらは表示とイベント』は事実と違う。
5. **観点5**: fix-free-trial（トライアル実装）と古いfix-pricing-faq-trial（当時トライアルなし）には時系列の差がある。後者を最新の仕様として混ぜず、現行実装を基準にsupersede範囲を示す。
6. **観点6**: 事実に基づいた開示と実挙動の同期は適合。Ownerに代わって無料期間・取消効力・価格を決めない。本番のキー・個人の契約内容は取得しない。
7. **観点7**: LLMなし。Checkoutリクエストのモックで検証でき、実課金は不要。テスト環境での事例確認と本番条件の証明は分ける。
8. **観点8**: #8と独立。Ownerから非機密の条件確認を受けるまで条件確定は保留だが、今回のレビュー/差し替え案は完成させられる。実装が必要な時だけこの前提を適用する。
9. **観点9**: 7日設定に対してCheckout送信値、pricingの本文/CTA/metadata/OG/FAQ JSON-LD、特商法/termsが同時に一致することをテストする。取消と更新タイミングも同じ出典へ遡れることを確認する。
10. **観点10**: 現行3ページ以外にもトライアル表現が残る可能性がある。定数を作ってもCheckout直書きを残せば再び乖離する。税・支払方法・再登録資格等はOwnerの実条件確認に含め、法令適合をこの変更だけで保証しない。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-billing-terms-consistency.md:13`

> 特商法表記は法定の開示であり、**販売ページと食い違っていること自体が問題**。どちらが実際の Stripe の設定と一致しているかは、コードからは判定できない。

置き換え文:

```text
現行Checkoutコードはsubscription_data.trial_period_days: 7を指定する。コード上は7日間トライアルを要求している。Ownerは本番に同じコードが配備され、実際のCheckout Session/Subscriptionのtrial開始・終了、初回請求、更新・解約条件が表示と一致することを、秘密値や個人情報を渡さず確認する。
```

`specs/fix-billing-terms-consistency.md:73`

> **Stripe の本番 Product / Price に無料トライアルが設定されているか。設定されている場合は日数。**

置き換え文:

```text
Ownerが確認するのは、現行の本番Checkout経路に適用される無料期間・初回課金タイミング・価格/税込区分・更新周期・解約方法/効力・トライアル対象条件である。Price画面だけを根拠にしない。テスト環境の結果は本番の同一条件を証明しない。
```

`specs/fix-billing-terms-consistency.md:52`

> **各ページで文言を直書きしないこと。** 現在の矛盾は直書きが 2 箇所にあることから生じている。

置き換え文:

```text
各ページの本文・CTA・metadata・Open Graph・FAQ JSON-LDを共通の課金条件から生成する。app/api/stripe/checkout/route.tsのtrial_period_daysも同じ定義を参照する範囲に追加し、Owner確認済みの7日という現行挙動を変更しない。条件変更の実験は行わない。
```

**参照確認:** 指定ファイルと新規候補lib/billing/terms.tsは問題なし。『fix-free-trialは表示だけ』という意味上の誤参照あり。Stripe公式Checkout free-trialsもSessionにtrial_period_daysを設定する設計を説明している。

**同じ領域の既存仕様:** [fix-free-trial](../../../specs/fix-free-trial.md)、[fix-pricing-faq-trial](../../../specs/fix-pricing-faq-trial.md)、[fix-ga4-purchase-event-fires-at-trial-start](../../../specs/fix-ga4-purchase-event-fires-at-trial-start.md)、[fix-ios-subscription-disclosure](../../../specs/fix-ios-subscription-disclosure.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** L5の質問を本番Checkout/Subscriptionの実適用条件へ置換する。現在コードは7日を要求していること、Checkout定数共有と表示全箇所のテストを追記する。

### A-10 fix-health-endpoint-status-and-llm-monitoring

**判定: 差し戻し。** [仕様](../../../specs/fix-health-endpoint-status-and-llm-monitoring.md) / [指示書](../../../docs/codex-prompts/fix-health-endpoint-status-and-llm-monitoring.md)

1. **観点1**: supabase障害→503など真理値表は明確。最終生成成功の定義が未確定のためgeneration ACは不十分。
2. **観点2**: 48時間という値だけを固定しても、対象0件・全件キャッシュ・閑散期・cron未起動を区別できない。対象がない正常運転をerrorにする懸念を『運用で調整』へ逃がしている。
3. **観点3**: 課金生成API禁止・公開応答の秘密値排除は適切。last successの読出し権限・タイムアウト・DBエラーを定義し、RLSを緩和しない。公開ポーリングごとの重い全件走査も避ける。
4. **観点4**: pipeline_runsにstage/status/output/created_atはあるが、run全体の完了時刻ではない。pipeline.ts:489はQA verdict=rejectでもstatus=successを記録し、stage1もsuccessになる。単純なMAX(created_at WHERE status='success')は誤り。
5. **観点5**: p1-observability、feat-data-integrity-weekly-audit、PR#758後のrefresh結果契約と整合する。Actions失敗伝播を再実装しない方針は正しい。
6. **観点6**: LLMを呼ばず監視することは適合。ただしAPI接続性・過去の生成成功・現在の課金能力を同一視して『生成可能』と断言しない。
7. **観点7**: healthからchat.completions/responsesを呼ばなければ追加生成課金はない。models.listとDB問い合わせのレート/応答時間・公開endpointの負荷は別に管理する。
8. **観点8**: #2で整合性skipが増えるためgeneration監視の意味を先に決める。#10のstatus集約部分だけを独立して先行可能。48時間の監視追加を一緒に実装させる前に定義を修正する。
9. **観点9**: stage1 successのみ、QA rejectがsuccess記録、QA publish後の保存失敗、最後の成功後にquota失敗、48h境界、履歴0件、DB読出し失敗、対象0件を固定時計で試験する。tests/health.test.tsは標準Vitest除外なので実行経路を明示する。
10. **観点10**: 直近成功から48時間以内の残高ゼロは検出できず、閑散期は誤警報になる。公開HTTP200 degradedはHTTPコードしか見ない監視に気づかれない。現在の成功能力と鮮度監視のどちらを達成する仕様なのかを分ける必要がある。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-health-endpoint-status-and-llm-monitoring.md:39`

> なし。最終生成成功時刻は既存の `pipeline_runs` から読む。

置き換え文:

```text
既存pipeline_runsだけで分かるのは段階別実行結果であり、公開保存まで完了したrun全体の成功ではない。stage=4、output.qa.verdict='publish'等の定義を採る場合は名称を『最終QA通過』とし、最終公開保存成功とは区別する。公開保存成功を監視するなら既存match_content.generated_atと対応づける契約、または保存完了ログの追加を仕様として定める。
```

`specs/fix-health-endpoint-status-and-llm-monitoring.md:94`

> **`checks.generation` の閾値の初期値**は、既存 cron の実行間隔から導く。`cron-live-pipeline` は 1 日 4 回（`0 0,6,12,18 * * *`）なので、**48 時間**を初期値とする。閑散期（8月等）に誤検知しうるが、`fix-retire-news-link-pipeline` で通知の総量が下がっているため、誤検知 1 件は埋もれない。運用して調整する前提で定数にしておく。

置き換え文:

```text
48時間は生成鮮度の暫定閾値であり、生成能力・残高切れを即時検出するSLAではない。対象なし/キャッシュのみ/履歴なしをunknownまたはnot_applicableとして区別し、成功扱いにも障害扱いにも自動で寄せない。最新の失敗が過去成功より新しい場合の扱い、予定された対象があるのにrunがない場合の判定元をOwnerが仕様改訂時に確定する。まずstatus集約のみを独立変更として先行してよい。
```

`specs/fix-health-endpoint-status-and-llm-monitoring.md:57`

> HTTP ステータスコードは **`ok` / `degraded` で 200、`error` で 503** とする。

置き換え文:

```text
HTTPはok/degraded=200、error=503という契約を維持する場合、監視側がJSONのstatus/checksまで読むことを受け入れ条件にする。HTTP200だけでは生成監視を完了と判定しない。
```

**参照確認:** 主要パスは実在する。『最後に成功した生成』という列/単一run概念は現スキーマにない。checks.generationにunknown等を採るならAPI表・prompt・テストを同時改訂する必要があり、実装者の裁量へ残さない。

**同じ領域の既存仕様:** [p1-observability](../../../specs/p1-observability.md)、[feat-data-integrity-weekly-audit](../../../specs/feat-data-integrity-weekly-audit.md)、[fix-refresh-workflow-scale-and-failure-visibility](../../../specs/fix-refresh-workflow-scale-and-failure-visibility.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** L33の『pipeline_runs最終成功』を具体的な段階/判定/保存時点へ置換する。48時間と対象0件の状態契約を仕様改訂後に同期し、生成能力の即時監視だとは説明しない。

### A-11 fix-h2h-latest-vs-next-match

**判定: 条件付き承認。** [仕様](../../../specs/fix-h2h-latest-vs-next-match.md) / [指示書](../../../docs/codex-prompts/fix-h2h-latest-vs-next-match.md)

1. **観点1**: 直近/最新の重複解消と境界テストは具体的。次回をfinished以外と定義するとAC4の未来最寄り保証と矛盾する。
2. **観点2**: ラベルを一つにする方針は確定している。最新終了済みだがfuture timestamp、不正日付、同時刻の安定選択をACに加えれば実装判断の幅が減る。
3. **観点3**: H2Hの追加・削除・noindex・通算戦績を対象外とする点は適切。既存review CTAを消す変更が混入しないよう明示する。
4. **観点4**: data.matches[0]をMetricで使う箇所はpage.tsx:169に実在。最新終了済み/次回の変数も102/105にある。query本体はlib/db/queries/matches.tsである。
5. **観点5**: feat-h2h-latest-match-ctaは既存Metric不変更を対象外としており、本specでその一点を上書きすると明記する。次回は既存のscheduledかつkickoff>=nowを維持する。
6. **観点6**: 収録分の限定注記とCTAを維持すれば適合。未来のデータを過去実績として扱わない。LLM・DB変更は不要。
7. **観点7**: LLMなし。既存取得配列を絞りソートするだけで済み、新規クエリを追加しない。
8. **観点8**: 他10本とは実装ファイルが分離しており独立。UI検証にはD018/D020～D023の適用範囲を守り、ページ全体の無関係な刷新はしない。
9. **観点9**: 固定したnowで過去finished、未来scheduled、過去scheduled、cancelled/postponed、未来finished、不正日付、空配列、未ソート配列を確認する。hasRecapとTrackedLink属性も保持する。
10. **観点10**: 最新/次回の混同は解消可能。入力DBの日付誤りや全対戦の欠落は解決しない。Owner目視は実装者のスクリーンショット提出後のレビュー条件として区別する。

**修正箇所と貼り替え文**（以下の引用は基準ファイルの原文。関連するAC/未解決節に同じ旧指示が残らないよう、節全体と対応promptも同期する）。

`specs/fix-h2h-latest-vs-next-match.md:50`

> | 次回対戦 | `status` が `finished` でない試合のうち、キックオフが最も近いもの |

置き換え文:

```text
| 次回対戦 | status === 'scheduled'かつ有効なkickoffAt >= 固定した現在時刻のうち最も近いもの。cancelled/postponed/live/過去scheduledは除く。比較はDateのepoch値で行う。 |
```

`specs/fix-h2h-latest-vs-next-match.md:52`

> **「直近の対戦」と「最新の対戦」は同じものを指している。** 現状は前者が未来、後者が過去を指すため別物に見えているだけで、正しく直すと重複する。**片方に統合し、ラベルを 1 つにする。**

置き換え文:

```text
最新の対戦カードを『直近の対戦』へ統合し、上部Metricの重複日付を除く。スコアと日時、hasRecapの場合のreview CTA、TrackedLinkのh2h_latest_review/h2h_next_matchとmatch_idを維持する。feat-h2h-latest-match-ctaの『既存Metric不変更』のみを本specで上書きする。
```

**参照確認:** 存在しない参照は確認されない。主な欠陥は次回条件の既存specとの意味上の衝突。

**同じ領域の既存仕様:** [feat-h2h-latest-match-cta](../../../specs/feat-h2h-latest-match-cta.md)、[feat-discovery-pages-round-h2h](../../../specs/feat-discovery-pages-round-h2h.md)、[fix-matchup-title-ja-connector](../../../specs/fix-matchup-title-ja-connector.md)。これらの対象/対象外と後続の変更を照合した。追跡済み484仕様と今回の未追跡草案11本を合わせた495ファイルを全文読んだという意味ではなく、対象パスで全体を検索して関連文書を追跡した。

**対応するCodex指示書の改訂:** 次回=scheduledかつnow以降を維持する。既存review CTA/TrackedLinkを残す統合位置を指定し、将来日時・中止/延期のfixtureを加える。

### A-12 spec 群全体としての穴

- **公開済み本文の訂正・隔離が実施範囲にない。** #2は新規生成停止、#3はイベント可視化停止、#4は棚卸し。3本がgreenでも既公開本文は残る。Ownerへ影響URLと根拠を渡し、表示注記/個別の公開停止/根拠補充後の再生成を別に決める。通常のreject時に旧公開版を保持する仕様と、誤情報を隔離する判断を混ぜない。
- **全入口の同一性保証は未完。** 11という数字は直接の呼出し箇所を数えたもの。NCのupsertEvents別名も含めて共通入口へ到達する実装は12箇所、さらにWorld Rugby/League Oneに独立した同名保存関数がある（この基準HEADで検索）。外部IDの重複だけでは同点の帰属反転を止めない。イベント元の試合日/チームの独立照合が別に必要。
- **保存の原子性と競合は未解決。** 共通入口はdelete→insert。ガード通過後のplayer解決/insert失敗や同時取り込みの競合は防げない。DB変更を許す設計が要るなら別仕様とOwner判断へ分ける。
- **検出後の担当・期限・再通知の設計がない。** 通知は以前から動いていたというOwner提供の運用証拠を採用する。件数だけのnotifyDataIntegrityReportは現コードでも確認した。#1の拒否通知追加だけでは既存汚染の再検出が行動可能にならない。参照先fix-data-integrity-alert-actionability.mdは未作成であり、作成済みと扱わない。
- **#7は参加国誤記を修正しない。** 検出後の対象guide・出典・修正文・確認日の引き渡しが必要。#5/#6の表示修正も他ルートやAPIのguideを自動で直すものではない。
- **課金の再送順序・ゼロ行更新・欠落userIdの復旧は残る。** #8はerror伝播の修正。#9は表示条件の同期。両者の完了を契約から権限までの全面保証と呼ばない。
- **healthの鮮度は現在の生成能力ではない。** QAのpublish判定後に保存が失敗する場合もある。最後の成功、直近失敗、予定された仕事、実行された仕事を分ける。公開endpointの負荷・timeout・キャッシュ方針も必要。
- **運用実行とコード完成を分離する。** 機密envを読むコマンドをCodexの必須受け入れ条件にせず、合成fixtureでコードを検証する。本番の棚卸し/修復はOwnerが対象・条件を判断する。今回の依頼では実行していない。

外部仕様の確認（2026-09-05）: [Stripe Checkoutのtrial指定](https://docs.stripe.com/payments/checkout/free-trials)、[Stripe Webhookの再送・順序](https://docs.stripe.com/webhooks?lang=node)、[Google SearchのFAQ rich result廃止](https://developers.google.com/search/updates)。それぞれA-9の条件確認、A-8の冪等性の限界、A-6の露出期待の訂正を支持する。法的適合を本レビューだけで保証するものではない。

## B. スキル更新

### B-1 個別所見（26本）

**改稿24本、維持1本、統合1本。** 表の削除行は現行ファイルから逐語引用した代表箇所であり、実際の貼り替えは同梱の全文を使う。細かな旧ルールを残したまま末尾へ追記する方式は採らない。維持のimage-genは原文と同じ全文を同梱した。

| スキル | 判定 | 理由 | 削除する行（原文） | 追加する行（貼付文）/全文 |
|---|---|---|---|---|
| backlink-outreach | 改稿 | 旧CTAと『機能中』の断定を除き、打診前の根拠品質確認を加える。 | L12: <code>1. **自前チャネルからのリンク**: note 記事→Tryline の内部リンク（既に機能中。`note-weekly` スキルの送客3点セット）、X bio・note プロフィールの URL 確認</code> | noteのCTAは主CTA＋カレンダー。B型停止/C型保留を維持し、リンク効果は同期間の実ユーザーで確認する。 [全文](proposed/.claude/skills/backlink-outreach/SKILL.md) |
| biz-strategy | 改稿 | 流通だけが問題という古い結論と固定費用を外す。 | L14: <code>- **現状**: 実ユーザーほぼゼロ（GA4 約4〜5セッション/日）。ボトルネックは製品ではなく**発見（distribution）**</code> | 発見・信頼性・記事価値・再訪・課金を現在の実測で切り分け、投資配分はOwnerが判断する。 [全文](proposed/.claude/skills/biz-strategy/SKILL.md) |
| codex-handoff | 改稿 | テスト/補助型まで許可ファイルへ含め、指示書とACの矛盾を防ぐ。 | L27: <code>- 受け入れ条件に対するテストを書く（`tests/` 配下の既存構成に倣う）</code> | 対象ファイルには必要なテスト・fixture・型を含め、標準テスト除外と専用実行コマンドを明記する。 [全文](proposed/.claude/skills/codex-handoff/SKILL.md) |
| codex-review | 改稿 | grepや報告だけのgreenを防ぎ、段階成功と全体成功を分ける。 | L15: <code>4. **テスト・品質確認**: 受け入れ条件に対するテストがあるか。`pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` の結果（自分で実行するか、Owner/CI の出力）を確認。</code> | vitest.config.tsの除外と実行コマンドを確認し、ACごとに実行証拠を付ける。DB error/部分失敗/キャッシュも追う。 [全文](proposed/.claude/skills/codex-review/SKILL.md) |
| competitor-watch | 改稿 | 公開ページの一律取得を許可・robots条件に限定する。 | L32: <code>- WebFetch で対象サイトの公開ページを見る（ログイン・課金が必要な領域は Owner に確認）</code> | 公式/二次という分類と機械取得の許可を分け、読めない資料は未確認として報告する。 [全文](proposed/.claude/skills/competitor-watch/SKILL.md) |
| content-plan | 改稿 | ガイド保存先の誤りと固定在庫・需要の断定を訂正する。 | L19: <code>- 大会ガイド（`competitions` テーブルの guide、`feat-competition-guides.md`）— 全大会に概要・見どころ・視聴方法あり</code> | competition_guidesのfamily/guide_jaと実routesを確認する。BWT/GSCの需要と根拠の整合を確認して企画する。 [全文](proposed/.claude/skills/content-plan/SKILL.md) |
| content-qa | 改稿 | allowedEntityCount=0を捏造確定にしない。汚染済みDBを真実として採点しない。 | L26: <code>   - 結果は `allowedEntityCount` で層別すること: **0件＝ほぼ確実に本物の捏造**（最優先で確認）。**1件以上＝実データはある状態での違反**で、チーム名・大会名の誤検出（照合精度の偽陽性）や、事件性の低い言及の可能性も高いため個別に本文を読んで判断する</code> | allowlist違反は候補として、表記差・根拠範囲・入力汚染を検証する。現在値の照合と生成時点の再現を分ける。 [全文](proposed/.claude/skills/content-qa/SKILL.md) |
| content-regen | 改稿 | 公開版保持と誤情報隔離の例外、停止条件、権限境界を明文化する。 | L20: <code>3. **全件実行**: 検品 OK 後にのみ全件。実行後、published 件数が減っていないか SQL で確認する。</code> | 対象manifest・入力hash・費用・停止条件を先に定め、小数検品後に承認範囲だけ実行する。汚染入力では再生成しない。 [全文](proposed/.claude/skills/content-regen/SKILL.md) |
| decision-log | 改稿 | 個人メモリ依存を外し、採用/提案/保留と影響先を分ける。 | L40: <code>- メモリ（`~/.claude` 配下）は Claude 個人の作業記憶、decisions.md はプロジェクトの公式記録。**Owner・Codex も読む判断は必ず decisions.md 側に**</code> | 正式な判断はdecisionsと実装履歴から確認する。停止/限定例外は影響する全スキルの実行手順へ反映する。 [全文](proposed/.claude/skills/decision-log/SKILL.md) |
| discord-ops | 改稿 | D026/D027に沿って残る入力/通知と引退経路を分ける。 | L12: <code>- **自動通知**: recap 公開時の通知は `app/api/cron/notify-discord` が担う（X 自動投稿を停止した際にこちらへ一本化。`specs/fix-disable-x-auto-post.md`）。この cron の挙動変更は spec 経由で Codex へ</code> | ニュース収集・通知・コンテキストメニューは停止済み。recap通知/ops通知/Ownerスラッシュ入力は別に維持する。 [全文](proposed/.claude/skills/discord-ops/SKILL.md) |
| funnel-audit | 改稿 | GA4と契約・購読確認・配信の意味を分離する。 | L17: <code>&#124; 4 &#124; pricing → トライアル開始 &#124; Stripe Checkout 遷移、`checkout-success-tracker.tsx` が成功時イベント送信 &#124;</code> | Checkout遷移、trial、実課金、Premium権限を別段として計測する。GA4のpurchaseだけで契約有無を判定しない。 [全文](proposed/.claude/skills/funnel-audit/SKILL.md) |
| growth-analysis | 改稿 | 7月の診断とnote referral成功の固定前提がD017/D019に反する。 | L29: <code>- **チャネル戦略**: SEO（大会ハブ集中）+ X 運用（毎日10分 reply + データ画像）+ note（週次まとめ + 月1エバーグリーン。note 8 &gt; X 3 セッション/28日で唯一機能している referral）。海外リーグの英語化はやらない</code> | 読者構成はユーザー基準、セッションは併記する。Bingの実クエリを取得し、過去の診断は取得日付きの比較資料にする。 [全文](proposed/.claude/skills/growth-analysis/SKILL.md) |
| hub-audit | 改稿 | 固定開幕表とGSCだけの需要を現在のseason/取得範囲へ置き換える。 | L8: <code>検索の着地点・回遊の起点である大会ハブページを、**大会開幕の3〜4週間前**に監査する。根拠: GSC 実測で流入が発生しているのは大会ページのみ（平均順位10.4位・PNC 2026 でクリック発生。`docs/marketing-strategy-2026-07-06.md` §2・§4）。検索需要は「いま試合がある大会」に発生するため、開幕前の整備が最も費用対効果が高い。</code> | 大会年・公式総数・収録範囲・放送の出典/確認日を分け、D025の独立した基準で収録不足を検査する。 [全文](proposed/.claude/skills/hub-audit/SKILL.md) |
| image-gen | 維持 | 画像プロンプトと実物検品という責務は今回の方針変更と衝突しない。実績を記した過去日付も保たれている。 | 削除なし（全文維持） | 追加なし。現行全文を同梱し、生成API実行やブランド刷新の権限を拡大しない。 [全文](proposed/.claude/skills/image-gen/SKILL.md) |
| incident-postmortem | 改稿 | 再発原因を『ガードなし』だけに縮めず、検出から行動まで追う。 | L22: <code>2. **タイムライン**: 混入 → 検知 → 復旧の各時点。検知が遅れた理由も</code> | 混入・初回検出・再検出・通知・Owner認知・封じ込め・復旧を分け、各対策に担当と再現試験を付ける。 [全文](proposed/.claude/skills/incident-postmortem/SKILL.md) |
| note-weekly | 改稿 | C型の実行テンプレとKPI、B型の残存手順、URL返信の無条件指示を除く。 | L59: <code>### C. 月1エバーグリーン／独自データ企画（交互に実施）</code> | A型だけを実行手順に置く。B型停止/C型保留とnote内交流終了を維持し、告知URLは返信の可視性に応じて配置する。 [全文](proposed/.claude/skills/note-weekly/SKILL.md) |
| pr-merge | 改稿 | マージ許可に付随するブランチ削除・ローカル差分破棄を除く。 | L23: <code>gh pr merge &lt;番号&gt; --merge --delete-branch</code> | マージは明示依頼の対象だけをmerge commit方式で行い、ブランチ削除・ローカル差分破棄を自動で行わない。 [全文](proposed/.claude/skills/pr-merge/SKILL.md) |
| prod-investigation | 改稿 | 古い充足率を現在値にせず、表記/時点/監査完全性を確認する。 | L28: <code>- **URC / SRP**: 2026-06 時点では events が薄い既知ギャップがあったが、`specs/feat-urc-srp-match-events.md` 等のPRで解消済み（2026-07-13実測: URC 145/157件・SRP 160/166件の終了試合でevents保有、いずれも9割超）。現役の注意点はイベント汚染（`specs/fix-contaminated-match-events.md`）とURCノックアウトラウンドの取りこぼし</code> | 現行型・取得範囲・対象時刻を確認し、現在データと生成時点を区別する。修復は具体的対象のOwner判断へ渡す。 [全文](proposed/.claude/skills/prod-investigation/SKILL.md) |
| rugby-news | 改稿 | 公式/大手メディアなら取得可という読みを防ぎ、手動事実と自動取得を分ける。 | L12: <code>1. **一次情報を優先**: 大会公式（premiershiprugby.com、sixnationsrugby.com、super.rugby 等）、クラブ公式、World Rugby。二次（RugbyPass、BBC Sport 等）は補助</code> | 機械取得は現行allowlist/robots/規約に従う。D026はDiscordのURL存在検証だけの例外で、本文取得へ広げない。 [全文](proposed/.claude/skills/rugby-news/SKILL.md) |
| rwc2027 | 改稿 | 既存ハブの再起票と保留中note Cの月次実行を除く。 | L18: <code>2. **note 連載「RWC2027への道」**（月1本、執筆規約は `note-weekly` に従う）:</code> | note C型連載は保留のまま。月次は公式情報とハブ/検索需要の差分を確認し、完了済み機能を新設扱いしない。 [全文](proposed/.claude/skills/rwc2027/SKILL.md) |
| site-audit | 改稿 | 2幅の画像だけでは週ボードや横はみ出し・SSR/DOM差を評価できない。 | L12: <code>- viewport: desktop 1440x900 / mobile 375x812</code> | SSR/実DOM/RSCを分け、指定幅と状態で要素矩形・scrollWidth・画像読込みを測る。D018/D020～D023を現行基準とする。 [全文](proposed/.claude/skills/site-audit/SKILL.md) |
| spec-writing | 改稿 | 存在確認を型/列/依存/失敗順まで拡張しD025をACへ落とす。 | L27: <code>- [ ] specで参照するファイルパス・関数名・コマンドは、実際に存在するか `grep`/`ls` 等で確認してから書く（存在しない参照は Codex の実装を誤らせる）</code> | 参照の存在・引数・返却型・export・DB列を確認し、null/空配列/失敗/キャッシュの期待結果と実行される回帰テストを定める。 [全文](proposed/.claude/skills/spec-writing/SKILL.md) |
| today | 改稿 | 唯一の司令塔にまとめ、古い曜日ルーチンと不要な再承認待ちを除く。 | L28: <code>&#124; 金 &#124; routine「週末ニュースダイジェスト」（金曜 18:00 JST 発火）の `draft:` PR を検品（出典・確度ラベル必須） &#124; ダイジェストをマージするか / reply ネタとして採用するか &#124;</code> | 承認済みの収集・下書きは進める。B停止/C保留、D027後の調査締切、データ/課金/配信の未解決事項だけを現在状態から整理する。 [全文](proposed/.claude/skills/today/SKILL.md) |
| weekly-ops | 統合 | todayとの二重司令塔がB/C型とX旧KPIを再導入するため、週次トリガーをtodayへ集約する。 | L13: <code>- [ ] 今週の note を判定する: **日本代表戦がある週 → A**（試合翌朝の深掘り。B は休止）/ **ない週 → B**（テーマ型、2〜3試合に絞る。テーマが立たない週は公開なしでよい）/ **月1回 → C**（エバーグリーン・独自企画、別枠最大3h。月初の /today が拾う）</code> | 日次・週次の起動語とチェックリストをtodayへ統合する。weekly-opsのSKILL.mdは統合適用時に登録対象から外し、別の実行規則を残さない。 [統合先today全文](proposed/.claude/skills/today/SKILL.md) |
| x-post | 改稿 | 古い数値、可視性例外とURL常時返信の衝突、未実証の因果断定を解消する。 | L71: <code>- **元が記事 URL だけなら本文完結**にし、URL は 1st reply に置く（本文にリンクを入れると露出が落ちる。@rugbykuronekoya が本文に URL を貼れるのはフォロワー15,930で露出が自力で足りるため。Tryline は露出がボトルネックなので同じ形は取れない）</code> | 全投稿形式で返信可視性を先に判定する。不可視/未確認なら本文URL、確認済みなら返信URL。数値と効果は出典・取得日・検証状態を示す。 [全文](proposed/.claude/skills/x-post/SKILL.md) |
| x-reply | 改稿 | D019の役割とイベント整合チェック、告知返信の可視性を補う。 | L21: <code>   - 該当試合の得点経過（`match_events`）</code> | 得点経過は整合確認済みのイベントだけを使う。Xは信頼/試合日接点/ニュース応答として評価し、返信URLの可視性を確認する。 [全文](proposed/.claude/skills/x-reply/SKILL.md) |

### B-2 重複の解消

統合するのはweekly-ops→todayのみ。統合後の全文は [today/SKILL.md](proposed/.claude/skills/today/SKILL.md)。日次/週次の起動語、週次の計測/リンク保守、A型の試合後対応、月次と10月判断を一つにした。weekly-opsを残して転送だけする二重ルールは作らず、適用時に旧スキルの登録を外す。今回、実ファイルの削除は行っていない。

| 領域 | 責務境界 |
|---|---|
| growth-analysis / funnel-audit / biz-strategy / today | 流入の実測 / サイト内の段差 / Ownerの投資判断材料 / 日次週次の振り分け。数字を4箇所へ複製しない。 |
| content-qa / content-regen / content-plan | 既公開本文の根拠監査 / 対象と費用を限定した復旧準備 / 新しいコンテンツの需要と根拠の企画。QAが勝手にregenしない。 |
| site-audit / hub-audit / performance-rum | DOM/画面の実測 / 大会年・放送・収録範囲の事実 / 実ユーザー性能。画面バグとRUMを混ぜない。 |
| production-data-integrity / prod-investigation / incident-postmortem | 定期検出と対応一覧 / 個別原因の追跡 / 発生から復旧までの仕組みの振り返り。 |
| rugby-news / discord-ops / x-post / x-reply / note-weekly | 出典調査 / 事実入力と通知文 / 自発投稿 / 返信 / A型本文。取得、入力、生成、公開の許可を跨いで継承しない。 |

横断ルールと出典付き測定基準は [operating-baseline.md](proposed/.claude/skills/today/references/operating-baseline.md) に置く。長い歴史を毎回読む必要を減らす補助ファイルであり、本文取得の許可や本番操作の権限を新設しない。各新規スキルは必要な境界を自身の本文にも持つ。

### B-3 陳腐化の検出

D017/D019は冒頭に追記されていても、下の実行手順が旧方針のままなら未反映と判定する。特にnote-weekly/x-postは全文置換する。

- **D017 / weekly-ops L13**

  > - [ ] 今週の note を判定する: **日本代表戦がある週 → A**（試合翌朝の深掘り。B は休止）/ **ない週 → B**（テーマ型、2〜3試合に絞る。テーマが立たない週は公開なしでよい）/ **月1回 → C**（エバーグリーン・独自企画、別枠最大3h。月初の /today が拾う）

  置き換え: 日本代表戦後のA型だけを候補にする。日本代表戦がない週にB型へ切り替えず、月初にC型を起動しない。

- **D017 / today L32**

  > | 月初（当月最初の月曜） | `rwc2027` の月次チェック（RWC 系クエリ順位・note 連載進捗）＋ note エバーグリーン今月分のテーマ候補（`docs/marketing-strategy-2026-07-06.md` §7.2 のタイトル案から） | RWC 施策を進めるか / 今月のエバーグリーンを書くか |

  置き換え: 月次はRWC情報とBWT/GSCの差分を確認する。note C型は保留なので執筆テーマを承認キューへ自動追加しない。

- **D017 / note-weekly L59**

  > ### C. 月1エバーグリーン／独自データ企画（交互に実施）

  置き換え: C型は保留。型・執筆カレンダー・KPIは実行手順から外す。A型のみの本文と計測を残す。

- **D017/D019 / note-weekly L32**

  > C（月1エバーグリーン）は時間的切迫が無いため、この即時ブリーフは必須としない（従来通りテーマ確認から始めてよい）。

  置き換え: A型の既存ブリーフを使用し、不足する論点・一次情報・未確定事項だけを確認する。保留中のC型の開始手順は置かない。

- **D019 / note-weekly L123**

  > 2. note 公開直後、親投稿への返信で「記事で新たに分かったこと＋URL」を投稿

  置き換え: note告知URLは返信可視性の確認結果に従う。不可視/未確認なら親投稿本文に置く案へ変更する。

- **D019 / note-weekly L156**

  > - C（月次）: 直近5本の C の **30日ビュー中央値の2倍**（C が5本未満の間は全記事の30日中央値で代用）、または UTM referral **3件以上**

  置き換え: C型KPIは実行中の評価表から外す。D017で保留したセッション目標は復活させず、A型のユーザー/ビュー/工数を記録する。

- **D019 / growth-analysis L29**

  > - **チャネル戦略**: SEO（大会ハブ集中）+ X 運用（毎日10分 reply + データ画像）+ note（週次まとめ + 月1エバーグリーン。note 8 > X 3 セッション/28日で唯一機能している referral）。海外リーグの英語化はやらない

  置き換え: note B型停止/C型保留、Xの信頼担保・試合日接点・ニュース応答を現行方針とする。過去のreferralセッション数を成功の証拠にしない。

- **D019 / x-post L71**

  > - **元が記事 URL だけなら本文完結**にし、URL は 1st reply に置く（本文にリンクを入れると露出が落ちる。@rugbykuronekoya が本文に URL を貼れるのはフォロワー15,930で露出が自力で足りるため。Tryline は露出がボトルネックなので同じ形は取れない）

  置き換え: 記事URLもnote告知も同じ可視性ルールを適用する。常に1st replyという指示を削除する。

- **D019 / x-post L92**

  > 金曜プレビュー投稿（型2、H2H→キーマッチアップ→勝敗予想の3連ツリー）で立てた予想は、次の月曜まとめ投稿（型1 or 6）で必ず答え合わせをする。「金曜に予想した◯試合中◯試合的中」のように的中率を一言添える。的中率の積み上げが「続きものとして追う理由」を作り、フォローの動機になる。数字は実際の予想内容と結果から算出したものだけを使う（水増し・後付け解釈禁止）。

  置き換え: 予想と結果の照合は正確に行う。的中率の提示がフォローを増やすかは未検証で、投稿別の実測で判断する。

- **D019 / x-post L10**

  > ## X の位置づけ（2026-08-28 実測で確定）

  置き換え: 役割の決定はD019を維持する。現状値は期間/出典/取得日付きでgrowth-analysisから取得し、過去のWindows値を現在の根拠へ流用しない。

- **D026 / rugby-news L12**

  > 1. **一次情報を優先**: 大会公式（premiershiprugby.com、sixnationsrugby.com、super.rugby 等）、クラブ公式、World Rugby。二次（RugbyPass、BBC Sport 等）は補助

  置き換え: 公式/大手という属性と機械取得許可は別。allowlist/robots/規約を確認する。Owner提供の手動事実は別経路として扱う。

- **D026 / content-qa L25**

  > 1. **人名捏造は全件機械監査が可能**（他の観点と違いサンプリング不要）: `node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts --confirm-owner-approved`。公開済み全件を照合し `tmp/entity-audit/entity-grounding-audit-*.json` にレポート出力（件数・コスト見積もりは実行時にログ出力されるので、固定値を書き写さずそちらを見る。`tmp/` 配下は `.gitignore` 対象なので本番由来レポートが誤ってコミットされる心配はない）

  置き換え: 手動事実の出典経路を確認する。自動allowlist外というだけで無効にしない。全件監査でもLLM費用/機密アクセスの承認境界は別に守る。

- **D027 / today L28**

  > | 金 | routine「週末ニュースダイジェスト」（金曜 18:00 JST 発火）の `draft:` PR を検品（出典・確度ラベル必須） | ダイジェストをマージするか / reply ネタとして採用するか |

  置き換え: 旧週末ニュースdraft routineを定例検品しない。docs/chatgpt-prompts/README.mdの木・金・火の調査/入力締切と最新の実施状況を確認する。

- **D027 / discord-ops L12**

  > - **自動通知**: recap 公開時の通知は `app/api/cron/notify-discord` が担う（X 自動投稿を停止した際にこちらへ一本化。`specs/fix-disable-x-auto-post.md`）。この cron の挙動変更は spec 経由で Codex へ

  置き換え: 引退したニュース通知と、残るrecap通知/ops通知/スラッシュ入力を区別する。DISCORD_WEBHOOK_OPSをニュース停止と一緒に消さない。

- **D018/D020～D023 / site-audit L12**

  > - viewport: desktop 1440x900 / mobile 375x812

  置き換え: 対象specの指定を優先し、週ボードの幅・正式名折返し・1日開催・SSR/DOM差を確認する。古いdesign方向へ戻さない。

- **D018/D020～D023 / hub-audit L21**

  > ## 理想形チェックリスト（1ハブにつき）

  置き換え: 大会データの真偽と、現行のブランド/週ボード/適用対象のレイアウト基準を分けて検証する。既存全面への空白率基準の遡及適用はしない。

D026/D027を記載していないこと自体は直ちに矛盾ではない。上記の一部は新決定の欠落であり、既存の個別通知まで誤って停止しないための補足である。D019でも「X全面停止」は決まっていない。

**Xの判定値も分離する。** 依頼文§3.2は「現在12・目標20超」と要約しているが、D019本文の決定5は継続判定の10+/28日と、役割の再検討条件の20超を分けている。今回の文案はD019の正式決定を参照し、期間が付いていない「現在12」を固定値として書き込まない。10月判定前に同じ期間/定義で取り直す。

**取得境界の区別:** D026で許可されたのはOwner起点のDiscord interactionsの存在確認だけ。ニュース本文の取得へ例外を広げない。一方でOwnerが手動提供した出典を、自動取得allowlist外だからという理由だけで禁止しない。

### B-4 新規スキル（全文）

以下5本はいずれも本文・frontmatterを含む完成ファイルを同梱した。要約だけの提案ではない。起動語、入力/実施手順、検証、出力、権限境界を各ファイルに記載している。

| 新規スキル全文 | 埋める反復作業の穴 |
|---|---|
| [bing-webmaster-analysis](proposed/.claude/skills/bing-webmaster-analysis/SKILL.md) | 最大流入元Bingのquery/pageとGA4着地を照合する。GSCで代用しない。 |
| [email-delivery-qa](proposed/.claude/skills/email-delivery-qa/SKILL.md) | cron→受付→受信→解除を別段で検品する。PR #734の修正を繰り返さない。 |
| [billing-monitor](proposed/.claude/skills/billing-monitor/SKILL.md) | 契約/支払/Webhook/DB/Premiumを突合する。GA4 purchaseを課金台帳にしない。 |
| [performance-rum](proposed/.claude/skills/performance-rum/SKILL.md) | LCP/INP/CLSの実ユーザー計測とラボ測定を分離する。 |
| [production-data-integrity](proposed/.claude/skills/production-data-integrity/SKILL.md) | 検出済み項目をmatch_id/URL/担当/次の行動付きで継続管理する。 |

新規スキル追加は新しい本番SDK・DB監視ジョブ・課金API・送信処理の実装許可ではない。既存データとOwner提供の証拠から回す運用文書である。

### B-5 エージェント3本

| エージェント | 判定と変更 | 全文 |
|---|---|---|
| tryline-site-auditor | 改稿。本番の公開URLの監査には使える。プレビューSSO拒否は本番可否と別。Bashと共有browser_closeを外し、DOM読取と撮影に限定。 | [完成ファイル](proposed/.claude/agents/tryline-site-auditor.md) |
| tryline-spec-checker | 改稿。ACの存在だけでなく実行除外・型/export・失敗経路を検査。Bashは読取git/gh/検索に限定し、「マージ可」を許可の代行にしない。 | [完成ファイル](proposed/.claude/agents/tryline-spec-checker.md) |
| tryline-web-researcher | 改稿。無条件の公式/大手取得をやめ、許可経路・D026の限定・Owner提供事実の区別を明記。 | [完成ファイル](proposed/.claude/agents/tryline-web-researcher.md) |

ツール名は現行エージェントが使用しているものを基準にした。Claude Code側でインストール済みのPlaywright MCPが同じ名前を公開しているかは適用時に確認する。今回このAPIセッションでエージェントを起動したわけではない。特にBashやbrowser_evaluateは宣言だけで技術的にread-onlyになるわけではなく、利用先の権限設定も必要である。

SSOが必要なプレビューを無理に開く代わりに、認可済みのブラウザで確認できる担当へ渡し、公開本番で独立に確認できることを進める。SSO拒否をアプリ障害として記録しない。

### B-6 ユーザーレベル/プラグインの整理

56本/数百本という在庫数はOwner提供情報であり、今回はホームや他プロジェクトを読んで再棚卸ししていない。以下はTrylineでの有効範囲を絞る提案で、グローバルファイル削除の提案ではない。

| 区分 | Trylineでの扱い |
|---|---|
| Kotlin/Laravel/Django/C++/Dart/Spring Bootと、その専用デプロイ/ORM/テスト技能 | このプロジェクトでは自動起動を無効化。元の言語プロジェクトでは残す。 |
| 一般的なSNS大量投稿・ニュース自動収集・SEO量産・他LLMプロバイダの技能 | D017/D019/D026/D027と衝突する自動起動を無効化。明示依頼時もリポジトリ制約を優先。 |
| Next.js/TypeScript/React、SQL読取、テスト、ブラウザ、Gitレビュー、公式資料参照 | 必要なときだけ有効にする。汎用の実装技能がClaude Codeの役割制限を上書きしない。 |
| iOS/Swift等の隣接プロジェクト技能 | 今回はWeb repoだけが対象。別リポジトリを読む入口にしない。明示的な別タスクまで起動しない。 |
| today/weekly-opsと競合する一般司令塔、汎用content/SNS管理 | Tryline用のtodayへ集約し、同じトリガーの二重起動を避ける。 |

具体的なdisable操作は使用中のClaude Code/plugin設定で可能なプロジェクト単位のスコープを確認してから行う。存在を確認していない設定キーや一括削除コマンドは提示しない。Ownerに必要なのは、スキル/プラグイン名・起動トリガー・プロジェクト適用範囲の非機密一覧である。

### B-7 適用順序

1. 現行29ファイルのバージョンを記録し、同梱manifestと差を確認する。差があれば本案をそのまま上書きせず該当差分だけ整合する。
2. 共通operating-baseline、todayの統合版を適用し、weekly-opsを登録対象から外す。todayに日次/週次の起動語が入ったことを確認する。
3. note-weekly/x-post/x-reply/rwc2027/growth-analysisを置換し、B停止/C保留・返信可視性・指標の区別を揃える。
4. rugby-news/discord-ops/content-qaとweb-researcherを置換し、D026/D027の境界を揃える。
5. production-data-integrity/prod-investigation/content-regen/incident-postmortem、billing-monitor/email-delivery-qaを適用し、通知から具体的な対応へつなぐ。
6. spec-writing/codex-handoff/codex-review/spec-checker/pr-merge/decision-logを適用し、仕様の矛盾・検証漏れ・権限の混同を防ぐ。
7. site-audit/hub-audit/site-auditor/performance-rum/bing-webmaster-analysisと残る企画系を適用する。image-genは維持。
8. 下記の起動ケースと矛盾チェックを行い、最後に無関係なグローバル技能のプロジェクト内自動起動を絞る。

適用時の確認例（期待する振り分けであり、今回の実エージェント実行結果ではない）:

| 入力 | 期待する結果 |
|---|---|
| 月曜、代表戦なしで「今週のnote」 | B/Cを執筆せず、停止/保留の現在方針とAの予定だけ示す |
| 「ニュースURLを投稿」、返信の可視性未確認 | 本文URLの案を作り、勝手に投稿しない |
| Owner提供のallowlist外出典を事実入力したい | 手動入力と自動本文取得を分け、D026を他経路へ拡張しない |
| 「healthは200だが生成が止まった」 | checks/段階/最新失敗/予定対象を切り分ける |
| 「スコア不一致が3週間残っている」 | 検出の有無と通知/対応を分け、対象ID・公開URL・次の行動を返す |
| 「問題なければマージして」 | 対象headと必須checksを確認してマージ。branch削除・ローカル差分破棄はしない |
| previewがSSO拒否 | 環境制約として記録し、公開本番の独立確認を進める |

## C. 未spec項目への助言

### C-1 Ownerが出すと仕様化できる情報（依頼§4.1）

| F# | 必要な情報（1行） |
|---|---|
| 6 | 本番で使われるCheckout経路・配備版と、実際のtrial日数/対象条件・初回請求・月額/税込区分・更新/解約効力を秘密値なしで確認した結果。Price画面やテスト環境だけでは不十分。 |
| 20 | GA4のプロパティ/期間/TZ/指標/フィルタ、Ownerのテストアクセス条件と除外設定、OS・チャネルの単一ディメンション集計を揃えた非機密エクスポート。 |
| 23 | 同期間のBWT/GSC query×page・表示/クリック/順位・国/端末条件・取得日・欠落範囲を含むエクスポートまたは認可済み読取接続。 |
| 38 | 2026年10月第1週時点のt.coユーザー数/28日、X投稿別CSV、Owner工数、継続/縮小と役割再検討をD019の別基準で評価する結果。 |
| 39 | A型をnote継続かサイト主体にするかの選択、受け皿の要件、既存記事の扱い、CTA/公開担当/工数の上限（B停止/C保留は別途維持）。 |
| 41 | どの読者にどの観戦判断を助けるか、使ってもらう対象試合・質問・根拠素材、協力者/接触方法、Owner時間枠、継続/停止を判断する観測。 |
| 45 | 実際の収集項目・送信先・目的・保存期間・同意/解除/削除・委託先・担当者のデータフロー一覧と、現行privacy/termsとの差分確認結果。 |

これらは新しい判断を求めるための不足情報一覧である。今回のレビューや文案作成を止める質問ではない。既にセッションで確認済みの項目は再提出を求めない。

### C-2 測定できれば仕様化できること（依頼§4.2）

| F# | 測るもの（1行） |
|---|---|
| 16 | 各会場の場所・公式kickoff・IANA timezone/DST・UTC・JSTと現表示を、中立会場/海外開催を含む同一試合で照合し、チームのtimezone代用による誤差を出す。 |
| 17 | 同じhomeの状態を複数幅で開き、body/clientWidth/scrollWidthと原因要素の矩形・フォント読込み前後を測り、意図したcarouselとページ全体のoverflowを分ける。 |
| 11 | #758後のplan/各chunk/集計結果から対象ID・0件・欠落artifact・HTTP200内skipped/draft/preserved/failed・打切り対象・所要時間を突合し、既存summaryに欠けるフィールドだけを特定する。 |
| 31 | CIの実コマンドとVitest include/exclude、実行されたsuite/test件数を対応づけ、重要なDB/health/pipelineケースの未実行範囲とlocal Supabaseの起動費用/時間を測る。 |
| 32 | Supabase/Vercelの実測egressをURL/クエリ/レスポンスbyte/呼出数/期間へ分解し、公開APIの読取増とSSR/ISR/キャッシュmissの寄与を推定誤差付きで示す。 |
| 33 | 匿名/認証状態ごとのCache-Control・Vary・実際のhit/miss・TTL/revalidationと本文差を確認し、古いイベントの残存時間と私的応答の共有混入がないかを測る。 |
| 47 | URL種別・端末・release・期間・母数別にLCP/INP/CLSのRUM p75を取り、CrUX/ラボ測定と区別する。母数不足は未判定として計測仕様から作る。 |

### C-3 深みの供給: F#24〜27、43

**F#25/F#26はpilotの対象試合やOwnerの時間配分を待たず、コード上の不備に対する仕様案を作れる。** ただし現行契約の変更まで「Owner判断不要」とは言えない。現実の本文の価値検証、根拠の供給量、取得先への投資を決めるpilotとは分ける。

現コードの根拠: [extract-facts.ts](https://github.com/Gosshi/tryline/blob/53caceeccb552ff98a7b4c37d6960a1eda37b665/lib/llm/stages/extract-facts.ts#L28)は配列件数だけを検査し、イベントは先頭40、順位表は先頭10へ切る。両チームの根拠や終盤が失われる可能性は合成fixtureで検証できる。数字は基準HEADで2026-09-05にコード確認した値で、推奨する新しい予算ではない。

**F#25仕様案の骨子（正式specへの採用はClaude Code + Owner）**

- 背景: tactical_pointsはdownstreamへ渡っているが、どの根拠に対応するかが構造として保証されず、同じ平均値の反復や根拠がない論点を検出しにくい。
- 対象: 現在のassemble→extract→narrative/QAにおける根拠の対応。対象試合の入力から決定論で根拠IDを作り、各論点に既存入力のID参照と観測事実/条件付き解釈を対応づける。DBイベントの同一性ゲートは前提にし、LLMにIDを新設・補完させない。
- 対象外: 新しい公式stats取得、Ownerの手動調査量の増加、全件再生成、QA/groundingの弱体化、記事公開基準の黙った変更。
- ACの要点: 存在しない根拠ID・別試合/期間の参照・型違い・空の参照を拒否する。正常根拠は抽出からnarrative/QAまで保持する。同一根拠を言い換えただけの論点を監査できるようにする。入力不足を架空の数字で埋めず、判断不能を返す。
- **決定が必要な箇所:** 現行の「2〜5件」から「0件も可」への変更、根拠0件時に記事をskipするか、非戦術的な事実要約を許すかは出力契約/公開方針の変更である。pilot完了は不要だが、正式specでOwnerが選び、extract件数spec・narrative・QA・型・version/cacheを同時に整合させる。今回のレビューが0件公開を決定したとは扱わない。
- 費用/検証: 合成入力とLLMモックで構造試験を先に行う。promptを変更するなら現行MODELSと最大試行回数から増分token/費用を見積もり、未承認の実LLM試行は行わない。

**F#26仕様案の骨子（F#25と分離して着手可能な部分）**

- 背景: JSONをFactExtractionResultへcastした後の件数チェックしかなく、内部の必須文字列・enum・配列要素の構造が保証されない。先頭切り捨ては当該両チームと終盤の根拠を落とす。
- 対象A: 現行FactExtractionResult/TacticalPointの契約どおりに必須項目・型・enum・配列・境界を検証する。新依存を追加せず、現在の最大2試行を増やさない。これは新しい読者施策の判断を待たず仕様化できる。
- 対象B: trimで情報を落とした事実を明示する。両チームの順位を必須保持し、決定論で算出した全試合の得点要約と時系列根拠を保つ。入力順に依存せず選択し、上限を超える必須根拠を無言で捨てない。どのデータを優先するか・上限token・残余の扱いは具体的なACで確定してから委譲する。
- 対象外: stats取得先の拡張、全コンテンツの再生成、2〜5件契約の変更（F#25の正式決定後に同期）、人名/統計の自由な補完。
- ACの要点: 40件超で決定的な終盤がある試合、順位表10位以下の両チーム、同分イベント、PT、空/不正JSON、内部項目不足、enum不正、過大な入力をfixture化する。trim前後の保持/省略範囲と選択の安定性、失敗伝播、LLM呼出上限を検査する。必須根拠が予算内へ収まらなければ明示的に停止し、完全データとして渡さない。
- 検証順: まず構造バリデーションを独立修正し、次に決定済みのtrim契約を実装する。本文の深さの改善は別途F#24/27の評価で測り、型検査が通ったことを価値改善の証明にしない。

F#24は対象試合・根拠供給・Owner工数のpilot、F#27はPremium深掘りQA4の採点分布・publish率・費用への影響評価（データ不足のまま閾値だけ上げない）、F#43は必要な指標に絞った当季公式statsの取得可否/許可/粒度/費用の確認として残す。F#25/26の機械的な改善の前提にpilot全体を置く必要はないが、逆にこの2件だけで根拠供給や価値検証が済んだとも扱わない。

## D. 成果物と検証範囲

- 本書: 11仕様×10観点、対応promptの改訂指示、原文の引用/貼り替え文、26スキル/3エージェントの所見、未spec項目の助言。
- [skill-drafts.md](skill-drafts.md): 統合後の既存25本＋新規5本＋エージェント3本の全文を一括で読める貼付用文書。
- [proposed/](proposed/): 同じ全文を配置先どおりの個別ファイルで収録。weekly-opsの削除は実行していない。
- [source-manifest.json](source-manifest.json): 基準ファイルのSHA-256、コードHEAD、取得日。適用前の競合確認用。
- [related-spec-index.json](related-spec-index.json): 対象パスをspecs全体で検索した関連箇所の一覧。
- [validation.json](validation.json): 網羅性、引用と原文の一致、ファイル/リンク、frontmatterと原文保全の静的検証結果。

実アプリ・本番DB・Stripe・LLM・Discord/X/メール送信には変更を加えていない。アプリのテスト合格、Claude Code上のスキル実行試験、Ownerの目視評価が済んだとは主張しない。今回の確認は文案の網羅性・構造・原文/参照整合の検証である。
