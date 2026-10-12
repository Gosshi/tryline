"use client";

import { useState } from "react";

import type {
  OpsFactPreview,
  OpsFactSaveRow,
  OpsRegenerationResult,
} from "@/lib/ops/facts";

async function post<T>(path: string, input: object): Promise<T> {
  const response = await fetch(`/api/ops/facts/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(`処理に失敗しました（HTTP ${response.status}）。`);
  return response.json() as Promise<T>;
}

const skippedLabels = {
  note: "注記",
  too_long: "300字超",
  outside_source: "出典ブロック外",
};
export function BulkFactPasteForm() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<OpsFactPreview | null>(null);
  const [saved, setSaved] = useState<OpsFactSaveRow[] | null>(null);
  const [regeneration, setRegeneration] = useState<
    Record<string, OpsRegenerationResult>
  >({});
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function readPaste() {
    setBusy(true);
    setError(null);
    setSaved(null);
    setComplete(false);
    setPreview(null);
    try {
      setPreview(await post<OpsFactPreview>("preview", { text }));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "読み取りに失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePaste() {
    setBusy(true);
    setError(null);
    setComplete(false);
    setRegeneration({});
    try {
      const { results } = await post<{ results: OpsFactSaveRow[] }>("save", {
        text,
      });
      setSaved(results);
      const jobs = results.filter(
        (row) =>
          row.matchId && row.savedCount > 0 && row.regeneration !== "none",
      );
      setRegenerating(jobs.length > 0);
      let nextJob = 0;
      // Existing pipeline costs about $0.05 per match; 18 matches cost about $0.90.
      // At most three requests run at once, with one request per newly saved match.
      await Promise.all(
        Array.from({ length: Math.min(3, jobs.length) }, async () => {
          while (nextJob < jobs.length) {
            const row = jobs[nextJob++]!;
            const matchId = row.matchId!;
            setRegeneration((current) => ({
              ...current,
              [matchId]: { status: "none", message: "作り直し中…" },
            }));
            let result: OpsRegenerationResult;
            try {
              result = await post<OpsRegenerationResult>("regenerate", {
                matchId,
              });
            } catch (error) {
              result = {
                status: "failed",
                message:
                  error instanceof Error
                    ? error.message
                    : "作り直しに失敗しました。",
              };
            }
            setRegeneration((current) => ({ ...current, [matchId]: result }));
          }
        }),
      );
      setComplete(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
      setRegenerating(false);
    }
  }

  const outcomes = Object.values(regeneration);
  const counts = { published: 0, draft: 0, skipped: 0, failed: 0 };
  for (const outcome of outcomes) {
    if (outcome.status === "none") counts.skipped++;
    else counts[outcome.status]++;
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label htmlFor="research-paste" className="block font-semibold">
          ChatGPT の調査結果（100,000字まで）
        </label>
        <textarea
          id="research-paste"
          className="min-h-64 w-full rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] p-4 text-sm"
          value={text}
          maxLength={100000}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
            setSaved(null);
            setComplete(false);
          }}
        />
        <button
          type="button"
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={busy || !text.trim()}
          onClick={() => void readPaste()}
        >
          読み取る
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[var(--color-accent)]">
          {error}
        </p>
      )}
      {preview && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">読み取り結果の確認</h2>
          {preview.linesBeforeFirstHeading > 0 && (
            <p>冒頭で読み飛ばした行: {preview.linesBeforeFirstHeading}行</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "見出し",
                    "DB の試合 / キックオフ JST",
                    "種類",
                    "事実",
                    "出典",
                    "状態",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border-b border-[var(--color-rule)] px-3 py-2"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.blocks.map((block, index) => (
                  <tr
                    key={index}
                    className={block.reason ? "text-[var(--color-accent)]" : ""}
                  >
                    <td className="max-w-sm break-words border-b border-[var(--color-rule)] px-3 py-3">
                      {block.heading}
                    </td>
                    <td className="min-w-48 border-b border-[var(--color-rule)] px-3 py-3">
                      {block.match ? (
                        <>
                          {block.match.home_team.name_ja ??
                            block.match.home_team.name}{" "}
                          対{" "}
                          {block.match.away_team.name_ja ??
                            block.match.away_team.name}
                          <br />
                          {new Intl.DateTimeFormat("ja-JP", {
                            timeZone: "Asia/Tokyo",
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(block.match.kickoff_at))}
                          <br />
                          {block.match.status}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-[var(--color-rule)] px-3 py-3">
                      {block.contentType === "preview"
                        ? "プレビュー"
                        : block.contentType === "recap"
                          ? "レビュー"
                          : "—"}
                    </td>
                    <td className="border-b border-[var(--color-rule)] px-3 py-3">
                      {block.factCount}
                    </td>
                    <td className="border-b border-[var(--color-rule)] px-3 py-3">
                      {block.sourceCount}
                    </td>
                    <td className="border-b border-[var(--color-rule)] px-3 py-3">
                      {block.reason ?? "保存できます"}
                      {block.skippedLines.length > 0 && (
                        <p className="mt-2 text-xs">
                          読み飛ばし:{" "}
                          {block.skippedLines
                            .map(
                              (line) =>
                                `${line.lineNumber}行目（${skippedLabels[line.reason]}）`,
                            )
                            .join("、")}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={
              busy ||
              saved !== null ||
              !preview.blocks.some((block) => !block.reason)
            }
            onClick={() => void savePaste()}
          >
            保存する
          </button>
        </section>
      )}
      {saved && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">保存結果と作り直し</h2>
          {regenerating && (
            <p role="status">
              作り直しが終わるまでこのページを閉じないでください（閉じた試合は作り直されません。事実は保存済みです）
            </p>
          )}
          {saved.map((row, index) => (
            <div
              key={index}
              className="rounded-md border border-[var(--color-rule)] p-4"
            >
              <p className="break-words font-semibold">{row.heading}</p>
              <p>
                保存: {row.savedCount}件 / 重複スキップ: {row.duplicateCount}件
              </p>
              {row.reason && (
                <p className="text-[var(--color-accent)]">{row.reason}</p>
              )}
              {row.rejectedSources.map((source) => (
                <p
                  key={source.sourceUrl}
                  className="break-words text-[var(--color-accent)]"
                >
                  保存しなかった出典: {source.sourceUrl}（{source.reason}）
                </p>
              ))}
              <p>
                {row.matchId
                  ? (regeneration[row.matchId]?.message ??
                    (row.regeneration === "none"
                      ? "作り直しなし"
                      : "作り直し待ち"))
                  : ""}
              </p>
            </div>
          ))}
          {complete && (
            <p role="status">
              完了: 公開 {counts.published} / QA 不合格 {counts.draft} / 見送り{" "}
              {counts.skipped} / 失敗 {counts.failed}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
