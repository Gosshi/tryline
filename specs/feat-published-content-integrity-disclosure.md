# feat-published-content-integrity-disclosure

> 本 spec は `specs/fix-event-ingestion-identity-guard.md`（入口）/ `fix-generation-event-integrity-gate.md`（生成）/ `fix-contaminated-events-display-isolation.md`（イベント表示）/ `audit-published-recap-event-integrity.md`（棚卸し）が扱わない範囲を埋める。**既に公開されている本文そのもの**を対象とする。

## 背景

2026-09-05 のレビュー（`docs/audits/gpt6-spec-review-and-skill-update-2026-09-05/review.md` A-12）で、**上記 4 本をすべて実装しても、既に公開されている誤った本文は読者に出続ける**ことが指摘された。

| spec | 止めるもの | 止めないもの |
|---|---|---|
| 入口ガード | 新しい汚染の流入 | 既に入ったデータ |
| 生成ゲート | 新しい記事の生成 | 既に公開された記事 |
| 表示隔離 | グラフとイベント一覧 | **本文** |
| 棚卸し | （検出のみ） | すべて |

`/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` の recap は 2026-08-17 に公開され、**現在も読める**。イベント表示を止めても、本文の「5分、ハリー・ホッキングスのトライで0–5と先制」「34分のライリーのトライで14–17と逆転」は残る。

### 本文には、イベントとは独立した誤りもある

監査レポート D-1 の追加発見によれば、この本文は JRFU の公式記録とも食い違う。

| | 本文 | JRFU 公式記録 |
|---|---|---|
| 先制 | 5分 ホッキングス（日本） | 7分 ナッサー（オーストラリア） |
| ホッキングス | 5分 | 12分 |
| ライリー | 34分 | 33分 |

**イベントデータを直しても、この本文は正しくならない。** 本文の正しさは決定論では判定できず、Owner の目視に依存する。

### 既存の「published 温存」と混同してはならない

`specs/fix-regen-reject-preserves-published.md`（2026-07）は、**再生成が QA で reject されたときに既存の published を消さない**仕様である。目的は「一時的な失敗で本文を失わないこと」で、`lib/llm/pipeline.ts:769-770` に実装されている。

**本 spec が扱うのは逆の判断**で、「誤りだと分かっている本文を意図的に読者から隔離すること」である。**両者を同じ仕組みに混ぜない。**

## スコープ

対象:
- `components/match-content-trust-strip.tsx`: 本文の根拠が現在のデータと整合しない場合の**開示表示**を追加する
- 記事の撤回手順の仕様化（**既存の `match_content.status` を使う。新しい仕組みを作らない**）
- 撤回後のページ表示と、再生成との相互作用の定義

対象外:
- **本文の自動訂正・自動再生成**（本文の誤りは決定論で判定できない）
- **記事の自動 unpublish**（誤検知で正しい記事を消す危険がある。**判断は Owner**）
- 本文と公式記録の照合（Owner の目視。自動化しない）
- `match_events` の削除・修正
- イベント表示の隔離（`fix-contaminated-events-display-isolation.md`）
- 新しいスキーマ・新しいフラグ列の追加
- `lib/llm/pipeline.ts:769-770` の温存ロジックの変更

## データモデル変更

**なし。** 撤回には既存の `match_content.status` を使う。

`lib/db/queries/match-content.ts` は 3 箇所（L78 / L111 / L178）で `.eq("status", "published")` により絞り込んでいるため、**`status` を `draft` にすればページ・API・RSS のすべてから消える。** 新しい列は不要。

## API サーフェス

なし。`fix-contaminated-events-display-isolation.md` が追加する `event_integrity` を再利用する。

## UI サーフェス

`MatchContentTrustStrip` に状態を 1 つ追加する。**新しいバナーやモーダルを作らない。** 既に「この記事の根拠」を示している場所に、根拠が確認中であることを並べる。

| 条件 | 表示 |
|---|---|
| 現状（確定ラインアップ・出典あり） | 変更なし |
| **試合が `finished` かつイベント合計が最終スコアと不一致** | 「**得点経過を確認中**」を根拠の一覧に加える |

文言は「この記事の得点経過は現在の記録と一致していません。確認のうえ更新します。」を既定とする。

**書いてはならないこと**:
- 「この記事は誤っています」— 生成時点のデータは正しかった可能性があり、現在のデータでの照合結果でしかない
- 「AI が生成したため」— 原因はデータの取り込みであって生成モデルではない

デザイン: 既存の trust strip のトークン（`--color-rule` の上罫線、`text-xs font-semibold`、`--color-ink-muted`）に揃える。**`--color-accent-subtle` の丸バッジは「ラインアップ確認済み」等の肯定的な根拠に使われているため、確認中の表示には使わない。** 区別できる中立の見た目にする。**Owner の目視評価**を受け入れ条件に含める。

## LLM 連携

なし（コスト影響ゼロ）。**本文を LLM に読ませて正誤を判定しない。**

## 変更詳細

### 1. 開示表示

判定は `fix-contaminated-events-display-isolation.md` と同一の関数を使う。`lib/format/match-event-points.ts` の `pointsForMatchEvent` を基礎とし、`fix-event-ingestion-identity-guard.md` が `lib/ingestion/event-integrity.ts` へ切り出した純関数を共有する。**判定を書き起こさない。**

`MatchContentTrustStrip` の props に整合状態を渡す。**呼び出し側 4 箇所（`app/matches/[id]/page.tsx:411, 454, 497, 551`）の props 変更を対象に含める。**

preview 側の trust strip には出さない。**recap 側のみ**（preview は終了後のイベントを根拠にしないため）。

### 2. 撤回の手順（Owner 向け。コード変更なし）

`audit-published-recap-event-integrity.md` が出す `findings.csv` を見て、Owner が個別に判断する。

1. `url` 列を開いて本文を読む
2. 誤りが確認できた記事は `match_content.status` を `draft` にする
3. ページから消えたことを確認する

**この UPDATE は本番 DB への書き込みであり、CLAUDE.md の規定に従う。** Claude Code が実行する場合は対象行と条件を事前に提示し、その都度 Owner の明示的承認を得る。

### 3. 再生成との相互作用

Owner が `draft` にした記事について、次のことを **spec として明示し、実装で担保する**。

| 状況 | 期待する挙動 |
|---|---|
| イベントが不整合のまま再生成が走る | `fix-generation-event-integrity-gate.md` により `skipped`。**draft のまま維持される** |
| イベントが修正された後に再生成が走り QA を通る | `published` に戻る。**これは正しい**（根拠が回復したため） |
| 再生成が QA で reject される | `pipeline.ts:769-770` の温存ロジックは「既存が published のとき」に働く。**既存が draft の場合は draft のまま**。Owner の撤回が黙って覆らない |

### 4. キャッシュ

試合ページは prerender され `x-nextjs-stale-time: 300` を返す。**撤回が読者に反映されるまでの遅延を受け入れる**が、`specs/fix-content-pipeline-revalidate-outside-request.md` の既存の revalidate 経路が撤回時にも働くかを確認し、働かない場合は手順に revalidate を含める。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts:16` の `exclude` により `tests/db/**` 等を実行しない。本 spec のテストは (a) DB をモックした除外外の新規ファイルに置く、または (b) 除外を外した実行コマンドを用意する、のいずれかで**実際に実行されること**を条件とする。**PR 本文に実行コマンドと結果を貼ること。**

1. `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` の recap に「得点経過を確認中」相当の開示が出る
2. 同ページの preview 側の trust strip には出ない
3. イベント合計が最終スコアと一致する試合（例: `2c276057-bb3a-4617-a5b1-b7742e65f034`）では出ない
4. 試合前（`status !== "finished"`）およびスコアが null の試合では出ないことを検証するテストがある
5. イベント 0 件の finished 試合では出ないことを検証するテストがある（**イベントが無いことと、イベントが矛盾していることは別**）
6. 開示文に「誤っています」「AI が生成した」に相当する断定が含まれない
7. `MatchContentTrustStrip` の既存表示（「ラインアップ確認済み」・出典ドメイン）が壊れていない
8. `match_content.status` を `draft` にすると、試合ページ・`/api/v1/matches/[id]/content`・`/rss.xml` のすべてから当該 recap が消えることを検証するテストがある
9. 既存が `draft` の状態で QA reject の再生成が走っても `published` に戻らないことを検証するテストがある
10. 判定に `pointsForMatchEvent` を使っており、得点換算が新規に書き起こされていない
11. **`match_events` / `match_content` への DELETE / UPDATE がコード差分に含まれない**（撤回は Owner の運用であってコードの機能ではない）
12. `pnpm typecheck` が green。テストは上記「テスト実行の条件」を満たすこと
13. **Owner の目視評価**: 開示が「不具合の告知」ではなく「根拠を確認中」として読め、記事の読書体験を分断していないこと。320 / 768 / 1440px で確認する

## 未解決の質問

**Owner が決めること。**

1. **`f01f68e2` の recap を今すぐ撤回するか、開示表示だけで公開を続けるか。** 本文には公式記録との差異という独立した誤りがあり、開示表示だけでは「得点経過が確認中」としか伝わらない
2. **棚卸しの結果 `confirmed` が多数だった場合の方針。** 個別判断が現実的でない件数なら、大会・期間単位での一括撤回を別途決める

**本 spec で解決しないと明示するもの**:

- **本文だけの誤りは検出できない。** 開示表示はイベント整合を条件にするため、イベントが一致していて本文だけが間違っている記事（`f01f68e2` の先制シーンのような誤り）には出ない。**これを「本文を検証した」と呼ばない**
- **開示は生成時点の正しさを判定していない。** 現在のデータとの照合結果でしかない
