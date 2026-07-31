# fix-mobile-ios-audit-findings-batch4: iOSオンボーディング診断まわりのUI不具合(束4)

対象リポジトリ: **tryline-mobile**。`fix-mobile-ios-audit-findings-batch1`〜`batch3`の後続(依存なし、いつでも着手可)。API・データモデル変更は不要、すべてクライアント側で完結する。

## 背景

2026-07-24、外部GPTによるiOS実機(iPhone 17 Pro / iOS 26.2、Expo Go)監査で、オンボーディングのチーム診断機能(`app/onboarding.tsx` / `app/onboarding/quiz.tsx`)まわりに複数の不具合が見つかった。ソースコードで裏取りが取れた5件をまとめて修正する。

以下は監査で指摘されたが今回のスコープに**含めない**:
- チーム選択候補が0件になる問題([[project_mobile_team_candidate_bug]]。Owner が設問設計とセットで別途対応する意向のため、本specでは触らない)
- 設定タブ未ログイン時「チームを選ぶ」ボタンが反応しないように見える件(`FavoritesEditor.tsx`のコードは`router.push("/onboarding")`で正しく遷移する。実際には遷移先の候補チップが0件のため「反応していない」ように見えているだけで、上記の候補ロジックバグと同一原因。候補ロジック修正を待つ)

## スコープ

対象:

1. **診断結果画面・オンボーディング画面がSafe Area未対応でスクロールもできない(P0)**: `app/onboarding.tsx`と`app/onboarding/quiz.tsx`の全画面(初期選択画面・完了画面・設問画面・結果画面)は、`SafeAreaView`も`ScrollView`も使わない`<View style={styles.page}>`(`flex:1, justifyContent:"center"`)で構成されている。Dynamic Island端末で見出しが欠ける、結果画面で選択肢(次点候補等)が多いとボタンが画面外に出て操作できない
2. **「一覧から直接選ぶ」「診断をスキップして一覧から選ぶ」から戻れない(P1)**: `app/onboarding/quiz.tsx`の104行目・133行目は`router.replace("/onboarding" as never)`を使っている。`replace`は遷移元画面をナビゲーションスタックから削除するため、戻るジェスチャーも含めて診断結果/設問画面に戻る手段が原理的に存在しない
3. **チーム詳細ページがSafariへ離脱する(P1)**: `app/onboarding/quiz.tsx`の`openTeamPage`(52〜56行目)は`Linking.openURL`でOS標準ブラウザ(Safari)を開く。オンボーディングの流れの途中でアプリ外に出るため、選択の文脈が失われる
4. **完了画面と診断経由の遷移が非対称(デザイン・P1)**: 一覧経由(`app/onboarding.tsx`の`finish()`)は`done`分岐の完了画面(74〜95行目)を挟むが、診断経由(`app/onboarding/quiz.tsx`の`selectTeam`)は完了画面を経由せず`router.replace("/(tabs)")`で直接ホームへ遷移する。診断結果画面ではすでに推薦理由とチーム確定ボタンを表示済みのため、その後の完了画面は確認の重複になる。Owner方針(2026-07-24)により、両経路とも完了画面を廃止して直接ホームへ遷移し、ホーム到着時に追加したチーム名の一時メッセージとお気に入り区画の強調で成功フィードバックを出す
5. **初回チーム選択画面に診断への導線がない(P1)**: `app/onboarding.tsx`の初期画面(97〜129行目)には「選んで続ける」「あとで選ぶ」の二択のみがあり、`app/onboarding/quiz.tsx`(診断)への導線が一切ない。診断はStack.Screenとして登録されているだけでディープリンクでしか到達できず、実質発見不可能な機能になっている

対象外:
- チーム選択候補ロジック(前述、Owner対応待ち)
- 設定タブ(`FavoritesEditor.tsx`)のUI変更(上記のとおり原因は候補ロジック側)
- 診断の設問・配点・タイブレークロジック([[feat-mobile-onboarding-team-quiz-content]]で確定済み、変更しない)

## UI サーフェス(修正内容)

1. **Safe Area / スクロール対応**: `app/onboarding.tsx`・`app/onboarding/quiz.tsx`の各画面ルートを`SafeAreaView`(`react-native-safe-area-context`、`edges={["top"]}`)+`ScrollView`(`contentContainerStyle`に`padding: spacing.lg`, `paddingBottom: spacing.xxl`)でラップする。`src/components/Screen.tsx`が同じ技術(SafeAreaView+ScrollView)を既に実装しているので、そのまま流用できる箇所は流用してよい(流用する場合、`eyebrow`は`"YOUR RUGBY"`、`title`は各画面の見出しに対応させる)。ただし`Screen`の`subtitle`は`title`の**下**に描画されるため、`quiz.tsx`の設問画面で現在`title`より**上**にある進捗表示(`N / 5`)をそのまま`Screen`の`subtitle`に置き換えると表示順が変わる。表示順を変えたくない場合は`Screen`を使わず、同じSafeAreaView+ScrollViewの構成を画面側で直接組んでよい。どちらの実装を選んでも受け入れ条件を満たせばよい
2. **戻り導線の修復**: `app/onboarding/quiz.tsx`の`router.replace("/onboarding" as never)`(104行目・133行目)を`router.push("/onboarding" as never)`に変更する(`as never`が実際に必要かは`.expo/types/router.d.ts`を確認して判断する)。加えて`app/onboarding.tsx`の初期画面に、`router.canGoBack()`がtrueのときだけ表示する「戻る」ボタン(`variant="ghost"`、`onPress={() => router.back()}`)を追加する。初回起動時(`_layout.tsx`からの直接遷移)は`canGoBack()`がfalseになるため表示されず、診断結果から遷移してきた場合のみ表示される
3. **チーム詳細をアプリ内で開く**: `expo-web-browser`(既存の依存パッケージ、追加インストール不要)の`WebBrowser.openBrowserAsync`を使い、`Linking.openURL`を置き換える。ボタン文言は現状の「◯◯のページを開く」のまま変更しない(アプリ内モーダルで開くため、離脱の問題自体が解消される)
4. **完了画面の廃止・ホーム直接遷移+到着時フィードバック**:
   - `app/onboarding.tsx`の`done`state・`done`分岐のJSX(74〜95行目)・それだけのために使っている`calendarQuery`と`suggestions`の計算・関連import(`getJstWeekRange`等)を削除する。`finish()`は`savePendingFavoriteSlugs`(既存)呼び出し後、`selected.length > 0`のときだけ選択したチームの表示名配列を`saveJustAddedTeamNames`(新規、下記)で保存し、`completeOnboarding()`のあと`setDone(true)`ではなく`router.replace("/(tabs)")`で直接ホームへ遷移する
   - `app/onboarding/quiz.tsx`の`selectTeam`は、既存の`savePendingFavoriteSlugs([team.id])`に加えて`saveJustAddedTeamNames([team.name])`を呼んでから`completeOnboarding()`→`router.replace("/(tabs)")`する(遷移先は変更なし)
   - `src/onboarding/pendingFavoritesStore.ts`に`saveJustAddedTeamNames(names: string[])`(SecureStoreへJSON配列で保存)と`getAndClearJustAddedTeamNames()`(読み取り後に同キーを削除して返す、1回限り表示するため)を追加する。既存の`PENDING_FAVORITES_KEY`等と同じスタイルで実装する
   - `app/(tabs)/index.tsx`のマウント時に`getAndClearJustAddedTeamNames()`を呼び、結果が1件以上あれば「{名前を「・」で連結}を追加しました」という一時メッセージを画面上部(週送りボタンの直下)に表示し、約3秒後に自動で消す。同じ状態を使って、`sections`内の`section.title === "お気に入り"`のセクションに強調スタイル(例: `colors.accent`の左ボーダー)を、メッセージ表示中と同じ期間だけ付与する。お気に入り区画がその週に存在しない場合(該当する試合がない)は、メッセージのみ表示し区画強調は何もしない
   - スキップ(`finish(true)`)または未選択のまま「選んで続ける」を押した場合は`saveJustAddedTeamNames`を呼ばない(ホームに何のメッセージも出ない、通常のホーム表示のまま)
5. **診断への導線追加**: `app/onboarding.tsx`の初期画面に、既存の本文(`最大{MAX_FAVORITES}件まで選べます。あとから変更できます。`)の直後・チーム一覧チップの直前に、診断への案内文とボタンを追加する。
   - 案内文: `5問の診断で、あなたに合いそうな代表チームも提案します。`
   - ボタン: `variant="secondary"`、title「5問で診断してみる(約1分)」、`onPress={() => router.push("/onboarding/quiz" as never)}`

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `app/onboarding.tsx`・`app/onboarding/quiz.tsx`の全画面でコンテンツがSafeAreaView配下にあり、画面高さを超える内容がスクロール可能であることを確認するテスト、または実装がScrollView/SafeAreaViewでラップされていることのコンポーネントテスト
2. `router.replace`が`router.push`に置き換わっていることを確認するテスト(モックした`router.push`が`/onboarding`で呼ばれる)
3. `app/onboarding.tsx`初期画面で、`router.canGoBack()`がtrueの場合のみ「戻る」ボタンが描画されることを確認するテスト
4. `openTeamPage`が`Linking.openURL`ではなく`WebBrowser.openBrowserAsync`を呼ぶことを確認するテスト
5. `finish()`が`selected.length > 0`のときだけ`saveJustAddedTeamNames`を呼び、`router.replace("/(tabs)")`で遷移すること(`setDone`や完了画面のJSXがコードベースに残っていないこと)を確認するテスト。`quiz.tsx`の`selectTeam`も同様に`saveJustAddedTeamNames`を呼ぶことを確認する
6. `app/(tabs)/index.tsx`がマウント時に`getAndClearJustAddedTeamNames()`を呼び、結果が非空なら一時メッセージが表示され、一定時間後に消えることを確認するテスト。「お気に入り」セクションが存在する場合に強調スタイルが付与されることも確認する
7. 初期画面に診断への案内文とボタンが表示され、ボタン押下で`/onboarding/quiz`へ遷移することを確認するテスト
8. TypeScript strict・lint・test green
9. **Owner目視**: iOS Simulatorまたは実機で、Dynamic Island端末での結果画面表示・診断からの「一覧から選ぶ」→戻る・チーム詳細のアプリ内表示・一覧経由/診断経由どちらもホームへ直接遷移し到着時メッセージとお気に入り区画強調が出ること・初期画面からの診断導線を確認する

## 未解決の質問

なし。項目4(完了画面と診断経由の非対称)はOwner方針(2026-07-24)により「両経路とも完了画面を廃止し、ホーム到着時の一時メッセージ+区画強調に統一する」で解決済み。
