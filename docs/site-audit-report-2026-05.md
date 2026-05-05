# Tryline サイト調査レポート（2026年5月）

## サマリー（3〜5文）

Tryline は、試合一覧・試合詳細・シーズン切替・順位表・得点経過・出場選手・LLM 生成レビューまで到達しており、当初の「試合中心」設計には沿っている。デザインはラグビーらしいチームカラー、国旗、スコア強調が入り、初期の汎用テンプレート感はかなり薄い。一方で、公開サイトの最初の印象はまだ「テキストと数字のデータビュー」であり、ターゲットユーザーが試合を見たくなる視覚的な入口、ハイライト動画、選手・会場・チームの写真が不足している。特に LLM コンテンツは日本語で読める価値があるが、具体的な根拠データとの接続や視覚情報が弱く、現状では再訪動機よりも確認用途に寄っている。

## スクリーンショット一覧

Playwright MCP でフルページスクリーンショットを撮影した。デスクトップは viewport 1440x1200、モバイルは viewport 375x900。

- `docs/site-audit-screenshots/2026-05/top-desktop.png`
- `docs/site-audit-screenshots/2026-05/top-mobile.png`
- `docs/site-audit-screenshots/2026-05/season-six-nations-2027-desktop.png`
- `docs/site-audit-screenshots/2026-05/season-six-nations-2027-mobile.png`
- `docs/site-audit-screenshots/2026-05/match-a-desktop.png`
- `docs/site-audit-screenshots/2026-05/match-a-mobile.png`
- `docs/site-audit-screenshots/2026-05/match-b-desktop.png`
- `docs/site-audit-screenshots/2026-05/match-b-mobile.png`
- `docs/site-audit-screenshots/2026-05/match-c-desktop.png`
- `docs/site-audit-screenshots/2026-05/match-c-mobile.png`

## A. デザイン品質 評価（○）

### 良い点

トップページのヒーローは `AI Rugby Analysis in Japanese`、大見出し、ラグビーボール風の線画背景により、サービスの提供価値はすぐ伝わる。試合カードと詳細ヘッダーではチームカラーの左右ストライプ、国旗、ショートコード、スコアの大きなタイポグラフィが使われ、ラグビーの試合情報としての視認性が上がっている。白地、淡いグレー、アクセントグリーンの使い方は落ち着いており、スポーツニュースというより分析アプリとしての品位がある。

### 改善が必要な点

全体の画面密度とカードの見た目が均質で、トップ、シーズン、試合詳細の情報階層がやや平坦に見える。ラグビー固有の臨場感はチームカラーと国旗に依存しており、写真・動画・グラウンド図・チームエンブレムがないため、特に初見では「本格的なラグビーメディア」より「よくできたデータ UI」に見える。見出しは serif で特徴がある一方、本文の長文コンテンツは淡々としており、戦術分析記事として読み進めるための小見出し、ハイライト引用、重要スタッツのサイドバーが不足している。

## B. UI/UX 評価（○）

### 良い点

トップページから最新シーズン、シーズン一覧、試合詳細への導線は素直で迷いにくい。シーズンページは大会ごとに複数年を横スクロールで切り替えられ、Round ごとの試合カードも理解しやすい。試合詳細ではパンくず、スコアヘッダー、得点経過、出場選手、プレビュー、レビューの順に並び、観戦後に確認したい情報の流れとして自然。

### 改善が必要な点

グローバルナビの `順位表` は `/#standings` 固定で、トップページに standings がない場合やシーズンページ閲覧中の文脈とずれる可能性がある。トップページの CTA は「最新シーズン」と「大会アーカイブ」が中心で、ターゲットユーザーが次に読むべき「今週の注目試合」「レビュー公開済み」「日本時間で見やすい試合」が分からない。データなし状態は簡潔だが、なぜ空なのか、次にどこへ行けばよいかまでは示していない。

## C. 情報品質・情報量 評価（△）

### 良い点

試合詳細 C では、スコア、得点経過、出場選手、プレビュー・レビュー枠が揃っており、最低限の match centre として成立している。レビュー本文は日本語で一定量があり、海外リーグを日本語で読む価値は出ている。シーズンページには順位表があり、大会文脈を LLM に渡す設計とも整合している。

### 改善が必要な点

レビュー本文は「セットプレー」「ディフェンス」「流れを引き寄せた」など一般的な表現が多く、得点経過・ラインアウト成功率・ポゼッション・地域・タックル・ペナルティなどの具体データに十分紐づいていない。試合 A / B ではプレビューが未公開のままレビューだけあるため、公開状態として少し不自然に見える。選手名・MOM・戦術ポイントはあるが、根拠が UI 上で検証できないため、読者が「AI がそれらしく書いた」印象を持つリスクがある。

### ビジュアルコンテンツ欠如の影響分析

画像と動画がないため、試合詳細ページに到達しても「この試合を見たい」「ハイライトを確認したい」「選手を覚えたい」という感情的な入口が弱い。競合サイトはチームロゴ、選手写真、試合写真、動画、ライブテキスト、詳細スタッツを組み合わせ、事実確認と観戦欲求の両方を満たしている。Tryline は日本語ナラティブが差別化要素だが、その周囲に視覚的な文脈がないと、長文レビューの説得力と滞在時間が伸びにくい。

## D. コンテンツ戦略上の課題

Tryline の価値は「日本語で海外ラグビーを深掘りする」ことだが、現在のトップページではその深掘りの実例が見えない。レビューが存在する試合、得点経過が充実している試合、注目選手がいる試合をトップに露出しないと、初訪問者はアーカイブを辿る前に離脱しやすい。

また、LLM 生成コンテンツは試合単位キャッシュという設計に沿っているが、本文単体では再訪理由が弱い。再訪を促すには「次の試合の見どころ」「日本時間の観戦予定」「公開予定コンテンツ」「試合後に何が更新されたか」を明示する必要がある。

## 今後の改善ロードマップ案

### 短期（〜1ヶ月）

- トップページに「レビュー公開済み」「次に見るべき試合」「今週の注目カード」を追加する。
- 試合詳細の上部に、プレビュー / レビュー / 得点経過 / 出場選手の有無を示す小さなステータス列を置く。
- LLM レビュー内の各章に、根拠となる得点イベントやスタッツを 1〜3 個だけ添える。
- プレビュー未公開かつレビュー公開済みの試合では、プレビュー枠を非表示または「試合前プレビューは未生成」に変更する。
- モバイルの長文レビューに目次またはセクションジャンプを入れる。

### 中期（1〜3ヶ月）

- YouTube の公式ハイライト動画を `match_id` に紐付ける `match_videos` 相当のデータモデルを検討する。
- Wikimedia Commons / Wikipedia 由来のチーム画像・会場画像・エンブレム候補を、ライセンス確認済みメタデータ付きで保存する。
- RugbyPass 型の試合スタッツに近づけるため、ポゼッション、テリトリー、セットプレー、キャリー、タックル、ペナルティを取得できるデータソースを仕様化する。
- 選手プロフィールへの導線を作り、出場選手リストから「この試合の注目選手」へつなげる。
- トップページに大会横断の「日本時間カレンダー」を追加する。

### 長期（3ヶ月〜）

- 「試合前 48 時間」「試合後 1 時間」「週次まとめ」のコンテンツ公開リズムを明確化し、PWA 通知やメールと連動する。
- Premium の価値として、試合チャット、深掘りスタッツ、戦術用語解説、過去対戦比較を段階的に追加する。
- RWC 2027 に向けて、国別ページ、選手ページ、会場ページを整備し、試合単位コンテンツを大会体験へ拡張する。

## ビジュアルコンテンツ実現可能性メモ

YouTube Data API v3 の `search.list` は動画検索に使えるが、1 回あたり quota cost が 100 units と重い。公式チャンネル（World Rugby、Six Nations Rugby、Premiership Rugby 等）に限定し、チャンネル ID + 試合名 + 日付で候補を絞り、結果を `match_id` 単位でキャッシュする前提なら実現可能。埋め込み自体は YouTube の iframe URL（`https://www.youtube.com/embed/VIDEO_ID`）で可能で、公式ドキュメント上も iframe embed が案内されている。Next.js 実装は、軽量に始めるならクリック後に iframe を出す自前コンポーネント、依存追加を許すなら `react-lite-youtube-embed` または `lite-youtube-embed` が候補。

YouTube API / embed のリスクは、API Terms と Developer Policies への継続的な準拠が必要な点。動画そのものを再配布せず、YouTube の公式埋め込みで表示する限り実装リスクは比較的低いが、API Data の保存期間、表示要件、停止時の削除義務、第三者権利侵害回避は設計に入れる必要がある。

Wikimedia Commons は自由ライセンスまたはパブリックドメインのメディアを扱うため、チーム・会場・選手写真の候補元として有力。ただし、各ファイルごとに作者、ライセンス、出典、改変有無を表示する必要があり、Wikimedia Foundation もライセンス情報の正確性を再利用者側で確認するよう求めている。MediaWiki Action API の `imageinfo` + `iiprop=extmetadata` で URL、作者、ライセンス名、ライセンス URL を取得できるが、`extmetadata` は高コスト扱いなので少数ずつ取得しキャッシュすべき。

チームエンブレムは特に注意が必要。Commons にあっても商標権・ロゴ利用制限が残る可能性があり、単純な「自由ライセンス画像」として扱うのは危険。短期は国旗・チームカラー・自前の抽象的なチームパターンで補い、中期以降にライセンス確認済みの画像のみ採用するのが安全。

参考:

- YouTube Data API `search.list`: https://developers.google.com/youtube/v3/docs/search/list
- YouTube embedded player parameters: https://developers.google.com/youtube/player_parameters
- YouTube API Services Terms: https://developers.google.com/youtube/terms/api-services-terms-of-service
- YouTube Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- Wikimedia Commons reuse guidance: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- Wikimedia Commons licensing policy: https://commons.wikimedia.org/wiki/Commons:Licensing
- MediaWiki API `imageinfo`: https://www.mediawiki.org/wiki/API:Imageinfo

## 競合比較メモ

ESPN の rugby match page は、Summary / Report / Commentary / Match Stats / Player Stats / Lineups / Table のタブ構成で、試合の基本情報からデータ検証まで移動しやすい。Tryline は得点経過と出場選手は近づいているが、Match Stats / Player Stats に相当する具体的な数値が不足している。

BBC Sport の live page は、スコア、得点者、会場、ライブレポート、ラインアップ、要約を 1 ページで見せ、写真も挟む。Tryline は日本語レビューで差別化できるが、ライブ文脈や試合写真がないため、試合の熱量を伝える力では劣る。

RugbyPass は fixtures / results、ニュース、動画、ロングリード、チーム・選手導線を組み合わせ、さらに match stats では carries、line breaks、tackles、turnovers、territory、possession、set plays などを出している。Tryline が正面から同じデータ量で競うのはコストが高いので、短期は「日本時間」「日本語の戦術整理」「公式ハイライトへの導線」に絞って差別化するのが現実的。

参考:

- ESPN match example: https://www.espn.com/rugby/match/_/gameId/603126/league/244293
- BBC Sport live match example: https://www.bbc.co.uk/sport/rugby-union/live/cvgn4zeqx0qt
- RugbyPass app coverage description: https://www.rugbypass.com/join/
- RugbyPass match stats example: https://www.rugbypass.com/live/reds-vs-waratahs/stats/
