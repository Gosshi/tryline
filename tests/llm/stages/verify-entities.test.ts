import { describe, expect, it, vi } from "vitest";

import { UNGROUNDED_ENTITY_ISSUE } from "@/lib/content/fabrication-guard";
import { applyEntityGroundingQaGuard } from "@/lib/llm/stages/qa";
import { verifyNarrativeEntities } from "@/lib/llm/stages/verify-entities";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const fixtureA = `# この試合の核心
日本の平均得失点差-17.6対イタリアの-7.6——どちらがネーションズチャンピオンシップで流れを変えられるか。

## 攻防の要点

日本とイタリアの対戦は、ネーションズチャンピオンシップの中でも注目される一戦です。日本は最近の試合で苦しい戦いを強いられていますが、ホームでのアドバンテージを活かしたいところです。イタリアは直近の5試合で2勝を挙げており、日本よりも戦績が良い。得点力では両チームともに大きな差はないですが、日本のホームでの得点力が試合の鍵となるでしょう。観客の応援を背に、日本はどのように試合を展開するのかが見どころです。

## 両チームの動向と戦術

日本はウェールズ戦で僅か1点差で敗れ、ジョージアには競り勝ったものの、南アフリカやアイルランドには大差で敗北。平均得点は16点で、失点が33.6点と守備に課題が残ります。日本のリーダーシップを担うのはキャプテンのハルミチ・タテカワで、チームをまとめ上げる責任が重い。

一方、イタリアはウェールズやフランスに敗れながらも、イングランドに勝利するという安定感を見せています。平均得点は15.8ですが、失点も23.4点と日本に比べ守備が向上。スクラムハーフのアレッサンドロ・ガルビジがゲームメイクの中心となり、試合を進めることが期待されます。どちらのチームが先にペースを掴むかが試合の行方を左右するでしょう。

## キープレイヤーとマッチアップ

日本の注目選手はシンノスケ・フジワラ、彼の迅速な判断と的確なキックで試合の流れを変えられるかが重要です。一方、イタリアではフルバックのアンジェ・カプオッツォが攻守に渡って存在感を示すでしょう。彼のスピードとフィールドビジョンが、試合の流れを左右する要因となることが期待されます。また、日本のタテカワとイタリアのガルビジのゲームメイク対決も見逃せません。この二人の対決は試合の勝敗を大きく左右することになるでしょう。`;

const fixtureB = `# 日本対イタリアのプレビュー

## 攻撃力の対比と試合の鍵

日本とイタリアの得点力は互角で、接戦が予想されます。日本の直近5試合の平均得点は16点、イタリアは15.8点と非常に接近しています。特に注目すべきは、どちらが先に得点を重ねるかです。日本はホームでのプレッシャーを受けつつも、攻撃力を活かして守備の改善が求められます。試合データによると、日本は最近の試合でジョージアに25-23で勝利し、攻撃の可能性を示しました。一方、イタリアはイングランドを23-18で下し、勢いを持っています。早期得点が試合の流れを左右するでしょう。

## 直近フォームとチームの勢い

日本は直近5試合で1勝4敗と低調な結果に終わっており、特に守備面での課題が浮き彫りになっています。特に南アフリカ戦では61-7と大敗し、守備の脆弱さが露呈しました。一方、イタリアは2勝3敗で安定したパフォーマンスを見せており、ウェールズ戦での17得点が示すように、攻撃の選択肢が豊富です。イタリアは直近の勝率が0.4と、日本の0.2を上回っており、勢いを感じています。日本はホームの利を活かし、ディフェンスラインの修正が急務です。

## 規律と反則が勝敗を左右

両チームともに直近の試合で反則がなく、試合の流れをスムーズに展開できる状態です。規律が保たれていることは、試合のテンポアップに寄与しますが、一方でミスが試合の行方を大きく左右する可能性があります。特に、勝負所でのペナルティやミスを避けることが、今回の試合の勝敗を決定づける要因となるでしょう。イタリアのスクラムハーフ、アレッサンドロ・ガルビジがどのように試合を組み立てるかにも注目です。

## 戦術ポイント

- 得点力の対比: 両チームの得点力がほぼ同等で、接戦が予想されます。どちらが先に得点を重ねるかが鍵です。
- 直近フォーム: イタリアの方が直近の勝率が高く、勢いがあります。日本はホームでのプレッシャーにさらされる中、どのように立ち向かうかが試されます。
- 規律と反則傾向: 両チームとも反則がないため、流れを作りやすい状況です。ミスが勝敗を左右する可能性が高いです。

この試合は、攻守のバランスと規律が試される一戦です。日本は守備の修正が急務で、イタリアはその勢いをどのように攻撃に結び付けるかが見どころです。Chichibunomiya Rugby Stadiumでの試合は、観客の声援を受けた日本がどのようにプレッシャーを克服するかが鍵となります。`;

const fixtureC = `# 日本の平均得失点差-17.6とイタリアの-7.6——どちらの守備が試合の流れを左右するか

### 日本とイタリアの得点力と守備力の対比

この試合の見どころは、日本とイタリアの攻撃力と守備力の対比です。日本は直近の試合で平均16得点を記録していますが、失点が33.6と高く、守備に課題を抱えています。特に南アフリカ戦では61失点を喫するなど、防御の脆弱性が露呈しています。一方、イタリアは平均15.8得点で、失点は23.4に抑えており、全体的に守備が安定しています。イタリアはイングランド戦で23対18と勝利し、強豪相手にも競り勝つ力を示しています。両チームとも得点力は拮抗しており、試合の結果は得点機会をいかに活かせるかにかかっています。特に、試合終盤の攻防が鍵となるでしょう。

### 直近の試合結果から見る心理的優位性

日本は最近の試合で1勝4敗と苦戦しており、特にアイルランド戦では10対41と大差で敗れました。これに対し、イタリアはここ5試合で2勝を挙げ、特にイングランド戦での勝利が心理的な自信につながっている可能性があります。この心理的な優位性が試合にどのように影響するかが注目です。規律面では、両チームともペナルティがないため、流れる試合展開になることが予想され、戦術的なプレーがより重要になるでしょう。

### 戦術的なアプローチが試合の行方を決定

試合の行方は、どちらのチームが戦術的に優れたアプローチを取るかにかかっています。日本はホームの利を活かし、観客の声援を力に変えたいところです。特に、ジョージア戦での接戦勝利（25対23）は、ホームでの戦い方に自信を与える材料となるでしょう。一方、イタリアは試合の流れをコントロールし、リズムを掴むことで勝機を見出そうとしています。特に、セットプレーやカウンターアタックを効果的に活用し、得点チャンスを確実にものにすることが勝利の鍵となります。

### プロジェクションとスターティングメンバー

イタリアの予想スターティングメンバーには、スクラムハーフのアレッサンドロ・ガルビジやフライハーフのレオナルド・マリンが含まれています。これらの選手は、試合の流れを作るための重要な役割を担っています。対する日本は、強力なバックロー陣によるディフェンスの改善が求められます。特に、ベテランのピーター・ラブスカフニがディフェンスラインを引き締め、イタリアの攻撃を封じることが期待されます。

### 結論

この試合は、日本とイタリアの戦術的な駆け引きが勝敗を決する鍵となります。日本は守備の改善を図りつつ、イタリアは安定した守備を武器に試合を優位に進めることを目指します。両チームの得点力が拮抗しているため、どちらが先にリズムを掴むかが勝利への道筋を決定づけるでしょう。`;

const passingScores = {
  factual_grounding: 4,
  information_density: 4,
  japanese_quality: 4,
  tactical_depth: 4,
};

describe("verifyNarrativeEntities", () => {
  it.each([
    ["fixture A", fixtureA, ["ハルミチ・タテカワ", "アレッサンドロ・ガルビジ"]],
    ["fixture B", fixtureB, ["アレッサンドロ・ガルビジ"]],
    [
      "fixture C",
      fixtureC,
      ["アレッサンドロ・ガルビジ", "レオナルド・マリン", "ピーター・ラブスカフニ"],
    ],
  ])(
    "detects ungrounded person entities in %s with an empty allowlist",
    async (_, narrative, surfaces) => {
      openAIMock.createTextResponse.mockResolvedValueOnce({
        model: "gpt-4o-mini-2024-07-18",
        text: JSON.stringify({
          mentions: surfaces.map((surface) => ({
            matched_entity: null,
            surface,
          })),
        }),
        usage: { inputTokens: 3_000, outputTokens: 150 },
      });

      const response = await verifyNarrativeEntities({
        allowedEntities: [],
        narrative,
        sourcedFacts: [],
      });
      const guarded = applyEntityGroundingQaGuard(
        {
          issues: [],
          scores: passingScores,
          verdict: "publish",
        },
        {
          contentType: "preview",
          entityViolations: response.result.ungroundedSurfaces,
          retryCount: 0,
        },
      );

      expect(response.result.ungroundedSurfaces).toEqual(surfaces);
      expect(guarded.issues).toContain(UNGROUNDED_ENTITY_ISSUE);
      expect(guarded.verdict).not.toBe("publish");
    },
  );

  it("allows katakana variants when the verifier maps them to allowed entities", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini-2024-07-18",
      text: JSON.stringify({
        mentions: [
          { surface: "ワーナー・ディアンズ", matched_entity: "Warner Dearns" },
          { surface: "ガルビジ", matched_entity: "Alessandro Garbisi" },
        ],
      }),
      usage: { inputTokens: 900, outputTokens: 90 },
    });

    const response = await verifyNarrativeEntities({
      allowedEntities: [
        { name: "Warner Dearns", source: "lineup" },
        { name: "Alessandro Garbisi", source: "lineup" },
      ],
      narrative: "ワーナー・ディアンズとガルビジの出来が焦点になる。",
      sourcedFacts: [],
    });

    expect(response.result.ungroundedSurfaces).toEqual([]);
  });

  it("treats sourced_facts-only matched entities as grounded", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini-2024-07-18",
      text: JSON.stringify({
        mentions: [
          { surface: "選手X", matched_entity: "選手X" },
          { surface: "未確認選手", matched_entity: null },
        ],
      }),
      usage: { inputTokens: 900, outputTokens: 90 },
    });

    const response = await verifyNarrativeEntities({
      allowedEntities: [],
      narrative: "選手Xは負傷離脱。未確認選手の状態は不明。",
      sourcedFacts: [
        {
          confidence: "high",
          fact: "選手Xが負傷離脱",
          source_domain: "example.com",
          source_url: "https://example.com/injury",
        },
      ],
    });

    expect(response.result.ungroundedSurfaces).toEqual(["未確認選手"]);
    expect(response.promptVersion).toBe("entity-verification@1.0.1");
  });

  it("keeps sourced_facts absent entities ungrounded", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini-2024-07-18",
      text: JSON.stringify({
        mentions: [{ surface: "選手Y", matched_entity: "選手Y" }],
      }),
      usage: { inputTokens: 900, outputTokens: 90 },
    });

    const response = await verifyNarrativeEntities({
      allowedEntities: [],
      narrative: "選手Yが先発する。",
      sourcedFacts: [
        {
          confidence: "high",
          fact: "選手Xが負傷離脱",
          source_domain: "example.com",
          source_url: "https://example.com/injury",
        },
      ],
    });

    expect(response.result.ungroundedSurfaces).toEqual(["選手Y"]);
  });

  it("does not ground very short matched_entity values by accidental fact substring", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      model: "gpt-4o-mini-2024-07-18",
      text: JSON.stringify({
        mentions: [{ surface: "Aki", matched_entity: "Aki" }],
      }),
      usage: { inputTokens: 900, outputTokens: 90 },
    });

    const response = await verifyNarrativeEntities({
      allowedEntities: [],
      narrative: "Akiが鍵になる。",
      sourcedFacts: [
        {
          confidence: "medium",
          fact: "Takizawa is unavailable",
          source_domain: "example.com",
          source_url: "https://example.com/team-news",
        },
      ],
    });

    expect(response.result.ungroundedSurfaces).toEqual(["Aki"]);
  });

  it("fails closed when the verifier cannot return valid JSON", async () => {
    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        model: "gpt-4o-mini-2024-07-18",
        text: "not-json",
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        model: "gpt-4o-mini-2024-07-18",
        text: "not-json",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    await expect(
      verifyNarrativeEntities({
        allowedEntities: [],
        narrative: fixtureB,
        sourcedFacts: [],
      }),
    ).rejects.toThrow("entity verification failed");
  });
});
