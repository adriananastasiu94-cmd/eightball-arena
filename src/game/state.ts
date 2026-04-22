import { TABLE } from "./constants";
import { BallState, MatchState, PlayerState, TableConfig } from "./types";

const rackOffsets = [
  [0, 0],
  [1, -0.5], [1, 0.5],
  [2, -1], [2, 0], [2, 1],
  [3, -1.5], [3, -0.5], [3, 0.5], [3, 1.5],
  [4, -2], [4, -1], [4, 0], [4, 1], [4, 2]
] as const;

const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];

export function createInitialBalls(table: TableConfig = TABLE): BallState[] {
  const balls: BallState[] = [];
  balls.push({
    id: 0,
    number: 0,
    kind: "cue",
    pos: { x: table.width * 0.25, y: table.height * 0.5 },
    vel: { x: 0, y: 0 },
    radius: table.ballRadius,
    pocketed: false
  });

  const apexX = table.width * 0.72;
  const apexY = table.height * 0.5;
  const spacing = table.ballRadius * 2.08;

  rackOrder.forEach((number, i) => {
    const [col, row] = rackOffsets[i];
    const kind = number === 8 ? "eight" : number <= 7 ? "solid" : "stripe";
    balls.push({
      id: number,
      number,
      kind,
      pos: {
        x: apexX + col * spacing,
        y: apexY + row * spacing
      },
      vel: { x: 0, y: 0 },
      radius: table.ballRadius,
      pocketed: false
    });
  });

  return balls;
}

export function createMatchState(
  matchId: string,
  players: [PlayerState, PlayerState],
  tableConfig: TableConfig = TABLE
): MatchState {
  const table = { ...tableConfig };
  return {
    matchId,
    players,
    currentTurn: 0,
    shotCount: 0,
    turnDeadlineMs: Date.now() + 30000,
    timeoutStrikes: [0, 0],
    phase: "breaking",
    table,
    balls: createInitialBalls(table),
    ballInHand: false,
    shotInProgress: false,
    breakDone: false,
    lastOutcome: null
  };
}
