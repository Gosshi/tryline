export type PhantomScoringEvent = {
  isPenaltyTry?: boolean;
  minute: number | null;
  type: string;
};

export type PhantomReconciliationStatus =
  | "needs_review"
  | "ok"
  | "reconciled";

export type PhantomReconciliationResult<TEvent extends PhantomScoringEvent> = {
  actual: number | null;
  afterImplied: number;
  implied: number;
  remove: TEvent[];
  status: PhantomReconciliationStatus;
};

export function pointsForPhantomEvent(event: PhantomScoringEvent): number {
  if (event.type === "try") {
    return event.isPenaltyTry === true ? 7 : 5;
  }

  if (event.type === "conversion") {
    return 2;
  }

  if (event.type === "drop_goal" || event.type === "penalty_goal") {
    return 3;
  }

  return 0;
}

function findExactRemovalSubsets<TEvent extends PhantomScoringEvent>(
  candidates: TEvent[],
  targetPoints: number,
): TEvent[][] {
  const solutions: TEvent[][] = [];

  function visit(index: number, sum: number, selected: TEvent[]) {
    if (solutions.length > 1) {
      return;
    }

    if (sum === targetPoints) {
      solutions.push([...selected]);
      return;
    }

    if (sum > targetPoints || index >= candidates.length) {
      return;
    }

    for (let nextIndex = index; nextIndex < candidates.length; nextIndex += 1) {
      const candidate = candidates[nextIndex]!;
      selected.push(candidate);
      visit(
        nextIndex + 1,
        sum + pointsForPhantomEvent(candidate),
        selected,
      );
      selected.pop();
    }
  }

  visit(0, 0, []);
  return solutions;
}

export function reconcilePhantomNullMinuteScoringEvents<
  TEvent extends PhantomScoringEvent,
>(
  events: TEvent[],
  actualScore: number | null,
): PhantomReconciliationResult<TEvent> {
  const implied = events.reduce(
    (sum, event) => sum + pointsForPhantomEvent(event),
    0,
  );

  if (actualScore === null || implied <= actualScore) {
    return {
      actual: actualScore,
      afterImplied: implied,
      implied,
      remove: [],
      status: "ok",
    };
  }

  const excess = implied - actualScore;
  const nullMinuteScoringEvents = events.filter(
    (event) => event.minute === null && pointsForPhantomEvent(event) > 0,
  );
  const removalSubsets = findExactRemovalSubsets(
    nullMinuteScoringEvents,
    excess,
  );

  if (removalSubsets.length !== 1) {
    return {
      actual: actualScore,
      afterImplied: implied,
      implied,
      remove: [],
      status: "needs_review",
    };
  }

  const remove = removalSubsets[0]!;

  return {
    actual: actualScore,
    afterImplied:
      implied -
      remove.reduce((sum, event) => sum + pointsForPhantomEvent(event), 0),
    implied,
    remove,
    status: "reconciled",
  };
}
