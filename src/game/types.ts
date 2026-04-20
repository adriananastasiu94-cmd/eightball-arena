export type Vec2 = { x: number; y: number };

export type BallKind = "cue" | "solid" | "stripe" | "eight";

export type BallState = {
  id: number;
  number: number;
  kind: BallKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  pocketed: boolean;
};

export type PlayerGroup = "solids" | "stripes" | null;

export type PlayerState = {
  userId: string;
  username: string;
  group: PlayerGroup;
  wins: number;
  profile?: {
    wins: number;
    losses: number;
    matchesPlayed: number;
    level: number;
    region: string;
  };
};

export type ShotInput = {
  angle: number;
  power: number;
  spin?: Vec2;
};

export type ShotOutcome = {
  foul: boolean;
  scratched: boolean;
  pocketed: number[];
  firstContact: number | null;
  turnContinues: boolean;
  winnerUserId: string | null;
  legalEight: boolean;
  reason?: string;
};

export type TableConfig = {
  width: number;
  height: number;
  rail: number;
  pocketRadius: number;
  ballRadius: number;
};

export type GamePhase = "lobby" | "breaking" | "playing" | "round_end";

export type PhysicsFrame = {
  t: number;
  balls: BallState[];
};

export type MatchState = {
  matchId: string;
  players: [PlayerState, PlayerState];
  currentTurn: number;
  shotCount: number;
  turnDeadlineMs: number | null;
  timeoutStrikes: [number, number];
  phase: GamePhase;
  table: TableConfig;
  balls: BallState[];
  ballInHand: boolean;
  shotInProgress: boolean;
  breakDone: boolean;
  lastOutcome: ShotOutcome | null;
};
