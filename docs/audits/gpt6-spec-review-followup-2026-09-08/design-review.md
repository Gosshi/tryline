# デザイン追補レビュー — 2026-09-08

対象: `design.md` のdraft節、`docs/chatgpt-prompts/gpt6-design-surface-intent-review-2026-09-06.md`、ホーム・カレンダー・大会family・pricing・試合詳細の現行構造。コード基準 `682a98b`。

**判定: ブランドの方向は維持。「Brand / Data」をページ全体の二択として確定するのは避け、ブロックの役割とページの主要目的を分ける。** 既存の紙色・赤・丸ゴシック・角丸を変更する提案ではない。今回の見直し対象は情報の優先順と、データに到達するまでの量である。

先の再レビューは仕様・実装・テスト中心で、デザインの実画面評価を十分に扱っていなかった。本追補はそのうち、現コードと設計文書から判断できる部分を補う。ブラウザ操作は自動承認レビューで拒否されたため、今回のスクリーンショット・DOM座標・フォント読み込み後の見た目は取得できていない。9/5の591px・900pxを現在の計測値や合格基準として使わない。

## 現在の画面に対する評価

| 対象 | 確認できたこと | デザイン上の判断・残作業 |
|---|---|---|
| ホーム | [app/page.tsx:258](../../../app/page.tsx#L258)のheroは `py-16 sm:py-24`。コピーの後にHomeMatchdayBoardがあり、lg以上は並列、狭幅は縦積み。前回からheroやboardの配置を変える差分はない | **優先して検討するのはモバイルのコピー量と上下余白。** ボードは既にhero内にあるため「heroの後へボードを追加」では解決しない。ブランド導入を短くし、最初の主要カードへの到達を比較する。今も900pxと断定はしない |
| ホームの横スクロール | 前回の原因となった大会カード内 `sr-only` を除去する変更は反映済み。既存リンクにaccessible nameがある構造を維持 | 未修正のP1として再起票しない。ページ全体のはみ出し解消と、大会カード列の意図した横スクロール維持は、実画面で再確認が必要 |
| カレンダー | [page:165](../../../app/calendar/page.tsx#L165)はパンくず・英語ラベル・見出し・週範囲・週移動・大会リンク群の後にWeekSchedule。配置を変える差分はない。NewsletterSignupは既に日程の後 | **上部の説明と操作の階層整理が主対象。** 「ニュースレターを下げる」はここでは不要。必要な週移動は残し、大会リンク群や装飾ラベルの優先度を下げた案を比較する。欠落情報の注記は正しい解釈に必要なので無条件に隠さない |
| 大会family | [page:125](../../../app/c/[competition]/page.tsx#L125)は最新シーズンへのリンクをguide本文より先に置いている | `/c/<family>`を一律brandにしない。現在シーズンへの入口は既にあるので、それを維持する。長いガイドでシーズン一覧を探しにくくするかは現画面・利用目的で評価する |
| 大会season / RWC | 放送FAQ、収録件数、未確認情報の表現が修正された | 正確なラベルはデザイン上も改善。ただし余白・文字の折返しまで実画面で合格したとは言えない |
| 試合詳細 | 不整合イベントを隠す処理と本文の注記は実装済み。レビュー、記録、過去preview、チャットという異なる役割が同居 | **記事の読みやすさと記録の比較密度を別にする。** ページ全体をcompactにしない。前回提案のページ内移動導線は、今回の修正だけで実現したとは扱わない |
| Pricing | [page:135](../../../app/pricing/page.tsx#L135)のheroには価値説明・trial CTA・課金要約がある。条件文の共通化は反映済み | ブランド訴求だけの面ではなく、比較・申込みの面でもある。余白の自由度が月額・初回課金条件・CTAを押し下げる免罪符にならないようにする |

現時点で「全体のデザインを刷新する必要がある」とする根拠はない。優先案はホーム狭幅の導入量、カレンダー上部の整理、試合詳細の目的別導線の順。ただしこれは比較案の優先順であり、Ownerが承認した実装スコープではない。

## draft節に残る問題

1. **P2 — 分類単位が混在している。** [design.md:141](../../../design.md#L141)はevery surfaceを二択とする一方、例は「home hero」というブロックと「pricing」というページを混ぜている。同じホーム内のコピーと試合ボードへ、どちらの余白規則を適用すべきか決まらない。
2. **P2 — 最初の行と完結した単位が一致していない。** `first row of real data` だけなら、日付やチーム名の上端を数px見せるだけで達成できる。読者が対戦カード・状態・日時/結果を判断できる単位を定義する必要がある。週ボード全体を1単位として完全表示を要求するのも過剰。
3. **P2 — 新規・再設計だけへの適用が節自体に明記されていない。** 既存Layout節は適用範囲を限定するが、追加節の `Every surface declares` は全既存画面への即時適用に読める。文言・事実訂正の小さなPRが再設計を要求されないようにする。
4. **P2 — brand指定で主要タスクが後回しになりうる。** Pricingやnewsletterは、初期説明・入力・完了・エラーで目的が違う。ブランド面ならfold上に販促を置けるという規則だけでは、入力完了やエラー回復を優先できない。

補足: 冒頭の「既存ルールは全ての面へ一律適用」は強すぎる。Spacingは既に関連要素・グループ・セクションを区別し、LayoutのmaxEmptyRatioも対象が限定されている。欠けているのは**既存ルールそのものではなく、異なる目的のブロックが同居するときの優先順**と表現すると正確。

## 依頼された質問への回答

| 問い | 回答 |
|---|---|
| 二分法を採るか | brand/dataの違いは残す。ただしブロック単位で宣言し、ページには主要な読者タスクを記す。routeから自動的に二択へ振り分けない |
| 固定px・viewport比・ブロック数のどれか | **順序規則は先に採用し、pxと必要スクロール量を計測する。** 全ページ共通の数値上限はまだ確定しない。「brandは1ブロックまで」でも1枚の巨大heroを許すため、高さ予算の代わりにはならない |
| familyガイドの位置づけ | 大会を理解する本文はreading/brand、今季や過去シーズンへ行く部分はnavigation/data。最新シーズン導線を先に出す現構造は維持。family=brand、season=dataというURL規則は採らない |
| ホームに単一intentを持たせるか | 全ブロックを単一化しない。導入はbrand、MatchdayBoardはdata。狭幅で導入を短くしてから主要カードへ、広幅で並列という既存の骨格を使える。初見/再訪の判定や自動パーソナライズの新設は不要 |
| 強制可能な規則にするか | 新規・再設計のspecで、順序・対象単位・fixture・測定条件・Ownerが採用した予算をACにする。数値未確定のままグローバルなCI失敗条件にはしない |
| 過剰な規定にならないか | 適用対象を明示し、事実訂正や小さな保守を再設計とみなさない。既存面へ遡及せず、4pxスケール・max-w-6xl・maxEmptyRatio・WeekBoardを変更しない |
| 見落とした面はあるか | readingとtask/stateを補助の役割として加える。記事・legal・supportは本文を読む役割、newsletter入力/完了・404は操作や状態理解の役割。`/en`は言語でありintentではない |

補助の役割は新しい配色やトークン一式を作るためではない。記事を比較表の密度へ押し込まず、状態ページへ関係ない販促を挟まないための区別に留める。

## design.mdへ貼れる置換案

以下は `Surface Intent: Brand vs Data` 節全体の置換提案。既存文書は変更していない。**数値予算と採用の最終決定はOwnerに残し、未測定の値を規範にしていない。**

```markdown
## Block Intent and Primary Task

These rules apply only to new surfaces and explicitly scoped redesigns.
A factual correction or maintenance change does not, by itself, make an
existing surface a redesign. Existing pages are not required to adopt new
layout rules retroactively.

Keep the existing spacing scale, container conventions, breakpoints,
maxEmptyRatio rule, WeekBoard reference, and soft-modern brand direction.
This section governs priority and grouping, not a replacement visual system.

### Classify blocks, not URLs

A page's specification names its primary reader task. Each major block has
a role appropriate to that task:

- Brand: communicate the product's value and identity.
- Data: find or compare fixtures, scores, standings, and records.
- Reading: understand an article, guide, legal text, or explanation.
- Task/state: make a choice, submit a form, understand a result, or recover
  from an error.

These roles may coexist on one page and do not introduce new token sets.
A language route is not a role. Pricing, home, and competition hubs must not
be classified as brand-only simply because they contain a hero or imagery.

### Order around the primary task

For a data-first task, group the title and necessary context, task controls,
essential data-quality notices, and the first complete relevant data unit
before unrelated promotion or long-form introductory content.
Do not place a newsletter or subscription promotion between those controls
and that data unit. A direct path to the primary task may precede longer
explanations on a mixed-purpose page.

Use 12–20px steps between related data groups and 24–40px between larger
sections as already defined by Spacing. Reading blocks retain their own
paragraph and section rhythm. Do not compress the entire page because it
contains a table, or expand every block because it contains brand imagery.

### First complete data unit

The first complete data unit is the smallest visible, relevant record that
lets the reader understand the advertised information and identify its
associated action, when one exists. It is not a heading, count, skeleton,
decorative badge, or a few pixels of the next card.

- Fixture/result: the two teams, required competition/date context, match
  state, kickoff time or permitted result, and the route to match details.
- Standings: a complete team row with the labels needed to interpret rank
  and points. The entire standings table need not fit at once.
- Weekly board: one complete relevant match card with its day/time context,
  not the entire week's board.

Required labels may live in an adjacent group header if they remain visibly
associated with the record. Spoiler settings still apply: do not reveal a
hidden score in order to satisfy the layout rule.

For no-data, loading, or error states, evaluate the corresponding state
message and useful next action. Record the real-data metric as not applicable;
do not invent a record or count a skeleton as real data.

### Measurement and budgets

For new or redesigned data-first surfaces, the specification records the
target unit, fixed data fixture, viewport width and height, zoom/text size,
locale, login/spoiler state, and the selectors used to measure it.
Measure after fonts and relevant content have settled, from scroll position
zero with temporary menus closed. Record the unit's top and bottom in CSS
pixels and any persistent header or overlay that obstructs the usable area.

Record both the distance to the unit and the scroll needed to see the complete
unit. If the unit cannot fit within the unobstructed viewport, record that
condition separately. Do not hide labels, shrink essential text, or clip the
unit solely to pass a height budget.

No universal pixel or viewport-fraction limit is established by this section.
An individual redesign may adopt a numerical budget after comparing the
current and proposed layouts under the same fixtures and viewport conditions.
Once the Owner accepts that budget, include it in that specification's
acceptance criteria. Ordering and measurement requirements can be checked
before a global numerical budget exists.

The September 5 audit measurements are historical observations, not targets
or evidence of the current deployment's layout.
```

## 数値を決める前に測るもの

以下は**今後の検査計画**であり、今回の測定結果ではない。

| 面 | 固定する状態 | 比較する案 |
|---|---|---|
| ホーム | 通常週、1試合、今週0件で次戦あり、次戦もなし。長い正式チーム名 | 現行と、狭幅のコピー/上下余白を抑えた案。主要カードの日時・両チーム・記事/詳細導線までが見える量 |
| カレンダー | 通常週、1日だけ開催、試合最多の週、空週、欠落通知あり | 現行と、上部ラベル・大会リンク群を整理した案。週移動から最初の完全な試合カードまで |
| family/season | guide長文/なし、今季あり/なし、未確認放送 | 現在シーズンへの移動または最初の対象試合を見つけられるか |
| 試合詳細 | preview/recap、記録不一致、ログイン・spoiler状態 | 読み始め、記録へ移動、過去previewの時制が区別できるか |
| Pricing/state | trialあり、説明長文、入力エラー、完了状態 | CTAと必要条件が一緒に理解できるか。主要タスク前に関係ない販促がないか |

検査用viewport候補は320×568、375×812、768×1024、1024×768、1440×900。高さを記録せず「1440pxでfold内」とは判定しない。日本語フォント読み込み後、標準サイズと拡大した文字で確認する。

座標は対象単位の上端T・下端B、viewport高H、上部の固定占有高Oを記録する。単位の高さがH−O以下で、下部の固定物がない場合、全体を見るための最小下スクロール量は `max(0, B−H)`。収まらない場合は別扱いにする。pxだけでなく利用可能高さに対する比も比較資料にできるが、比が小さいだけで分かりやすいとは評価しない。

これに「今週の日本戦を見つけて開く」「翌週へ移る」「試合の記録からレビューへ戻る」などの短いタスク確認を合わせる。測定前に「591pxを500pxへ」等の値を確定させる根拠はない。

## 今回確認していないこと

現在の本番の描画・各幅の折返し・画像の読み込み・実DOMの座標・操作性。ブラウザのページ作成操作が `MCP tool call requires approval, but approval policy is never` で拒否されたため、別経路でその制限を回避していない。

コントラストとprefers-reduced-motionは依頼書の解決済み事項として扱い、再指摘しない。ダークモード・ブランド刷新・グローバルな余白変更・新しい計測実装は提案スコープへ追加していない。
