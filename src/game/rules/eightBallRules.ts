import { MatchState, ShotOutcome } from "../types";

type OutcomeInput = {
  pocketed: number[];
  firstContact: number | null;
  scratched: boolean;
  cushionHits: number;
  isBreakShot: boolean;
};

function groupOfBall(n: number): "solids" | "stripes" | null {
  if (n >= 1 && n <= 7) return "solids";
  if (n >= 9 && n <= 15) return "stripes";
  return null;
}

function ballsRemaining(state: MatchState, group: "solids" | "stripes"): number {
  return state.balls.filter((b) => !b.pocketed && groupOfBall(b.number) === group).length;
}

function assignGroups(state: MatchState, pocketed: number[]) {
  if (!state.breakDone) return;
  const turnPlayer = state.players[state.currentTurn];
  const oppPlayer = state.players[1 - state.currentTurn];
  if (turnPlayer.group) return;

  const solidHit = pocketed.some((n) => n >= 1 && n <= 7);
  const stripeHit = pocketed.some((n) => n >= 9 && n <= 15);
  if (solidHit && !stripeHit) {
    turnPlayer.group = "solids";
    oppPlayer.group = "stripes";
  }
  if (stripeHit && !solidHit) {
    turnPlayer.group = "stripes";
    oppPlayer.group = "solids";
  }
}

export function adjudicateShot(state: MatchState, input: OutcomeInput): ShotOutcome {
  const turnPlayer = state.players[state.currentTurn];
  const opponent = state.players[1 - state.currentTurn];
  const pocketed = input.pocketed;
  const scratched = input.scratched;
  const firstContact = input.firstContact;
  const isBreakShot = input.isBreakShot;
  const cushionHits = input.cushionHits;

  assignGroups(state, pocketed);

  const expectedFirst = turnPlayer.group === null ? null : turnPlayer.group === "solids" ? "solids" : "stripes";
  const firstGroup = firstContact === null ? null : groupOfBall(firstContact);

  let foul = false;
  let reason = "";

  if (scratched) {
    foul = true;
    reason = "Scratch";
  }

  if (!foul && firstContact === null) {
    foul = true;
    reason = "No object ball hit";
  }

  if (!foul && expectedFirst && firstGroup && expectedFirst !== firstGroup && firstContact !== 8) {
    foul = true;
    reason = "Wrong first contact";
  }

  if (!foul && firstContact === 8 && turnPlayer.group && ballsRemaining(state, turnPlayer.group) > 0) {
    foul = true;
    reason = "Illegal first contact on 8-ball";
  }

  if (!foul && isBreakShot && pocketed.length === 0 && cushionHits < 4) {
    foul = true;
    reason = "Illegal break";
  }

  const pocketedOwn = turnPlayer.group
    ? pocketed.some((n) => groupOfBall(n) === turnPlayer.group)
    : pocketed.some((n) => n !== 8);

  let winnerUserId: string | null = null;
  let legalEight = false;

  if (pocketed.includes(8)) {
    const ownGroupClear = turnPlayer.group ? ballsRemaining(state, turnPlayer.group) === 0 : false;
    legalEight = ownGroupClear && !foul;
    winnerUserId = legalEight ? turnPlayer.userId : opponent.userId;
  }

  const turnContinues = !foul && pocketedOwn && !winnerUserId;

  return {
    foul,
    scratched,
    pocketed,
    firstContact,
    turnContinues,
    winnerUserId,
    legalEight,
    reason
  };
}

export function applyOutcomeToTurn(state: MatchState, outcome: ShotOutcome): void {
  state.lastOutcome = outcome;
  if (outcome.winnerUserId) {
    state.phase = "round_end";
    return;
  }

  if (outcome.foul) {
    state.ballInHand = true;
    state.currentTurn = 1 - state.currentTurn;
    if (!state.breakDone) state.phase = "playing";
    state.breakDone = true;
    return;
  }

  state.ballInHand = false;
  if (!outcome.turnContinues) state.currentTurn = 1 - state.currentTurn;
  state.breakDone = true;
  if (state.phase === "breaking") state.phase = "playing";
}
