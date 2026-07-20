const NGRAM_SIZE = 3;
export const RECENT_ARTICLE_LIMIT = 50;
export const STYLE_SIMILARITY_THRESHOLD = 0.7;

export const AI_STYLE_PHRASES = [
  "ことが浮き彫りになった",
  "という形となった",
  "と言えるだろう",
  "今後の戦いに注目したい",
  "目が離せない",
] as const;

export type RecentStyleArticle = {
  content: string;
  id: string;
};

export type StyleGuardShadowResult = {
  aiStylePhrases: string[];
  japaneseQualityIsThree: boolean;
  recentArticleCount: number;
  retryEquivalent: boolean;
  similarity: {
    comparedArticleId: string | null;
    maxScore: number;
    thresholdExceeded: boolean;
  };
};

function extractFinalParagraph(content: string) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.at(-1) ?? "";
}

function extractHeadings(content: string) {
  return content
    .split("\n")
    .filter((line) => /^#{1,6}\s+/.test(line))
    .join("\n");
}

export function buildStyleSignature(content: string) {
  return [
    content.slice(0, 200),
    extractHeadings(content),
    extractFinalParagraph(content),
  ]
    .join("\n")
    .replaceAll(/\s+/g, "")
    .trim();
}

export function calculateNgramJaccard(left: string, right: string) {
  const leftNgrams = new Set<string>();
  const rightNgrams = new Set<string>();

  for (let index = 0; index <= left.length - NGRAM_SIZE; index += 1) {
    leftNgrams.add(left.slice(index, index + NGRAM_SIZE));
  }
  for (let index = 0; index <= right.length - NGRAM_SIZE; index += 1) {
    rightNgrams.add(right.slice(index, index + NGRAM_SIZE));
  }

  if (leftNgrams.size === 0 || rightNgrams.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  for (const ngram of leftNgrams) {
    if (rightNgrams.has(ngram)) {
      intersectionCount += 1;
    }
  }

  return (
    intersectionCount / (leftNgrams.size + rightNgrams.size - intersectionCount)
  );
}

export function detectAiStylePhrases(content: string) {
  return AI_STYLE_PHRASES.filter((phrase) => content.includes(phrase));
}

export function evaluateStyleGuardShadow({
  content,
  japaneseQuality,
  recentArticles,
}: {
  content: string;
  japaneseQuality: number;
  recentArticles: RecentStyleArticle[];
}): StyleGuardShadowResult {
  const signature = buildStyleSignature(content);
  let comparedArticleId: string | null = null;
  let maxScore = 0;

  for (const article of recentArticles.slice(0, RECENT_ARTICLE_LIMIT)) {
    const score = calculateNgramJaccard(
      signature,
      buildStyleSignature(article.content),
    );

    if (score > maxScore) {
      comparedArticleId = article.id;
      maxScore = score;
    }
  }

  const aiStylePhrases = detectAiStylePhrases(content);
  const japaneseQualityIsThree = japaneseQuality === 3;
  const thresholdExceeded = maxScore >= STYLE_SIMILARITY_THRESHOLD;

  return {
    aiStylePhrases,
    japaneseQualityIsThree,
    recentArticleCount: recentArticles.slice(0, RECENT_ARTICLE_LIMIT).length,
    retryEquivalent:
      japaneseQualityIsThree || aiStylePhrases.length > 0 || thresholdExceeded,
    similarity: {
      comparedArticleId,
      maxScore,
      thresholdExceeded,
    },
  };
}
