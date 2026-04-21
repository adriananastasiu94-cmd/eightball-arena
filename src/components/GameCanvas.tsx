"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BallState, MatchState, ShotInput } from "@/game/types";
import { predictCueObjectCollisionVectors } from "@/game/physics/engine";
import { PHYSICS } from "@/game/constants";
import { ARENA_THEME } from "@/game/rendering/theme";
import { CueStyle, TableSkin } from "@/game/rendering/customization";

type Props = {
  state: MatchState | null;
  myUserId: string | null;
  onShoot: (shot: ShotInput) => void;
  onPlaceCue: (x: number, y: number) => void;
  assistStrength: number;
  shotPower?: number;
  onShotPowerChange?: (nextPower: number) => void;
  cueStyle?: CueStyle;
  tableSkin?: TableSkin;
  replay: { id: string; frames: BallState[][]; fps: number; startAtMs?: number } | null;
  inputLocked?: boolean;
  lockLabel?: string | null;
  onReplayDone?: () => void;
  remotePresence?: { userId: string; active: boolean; angle: number; power: number; t: number } | null;
  onPresenceUpdate?: (payload: { active: boolean; angle: number; power: number }) => void;
};

type AimState = {
  active: boolean;
  angle: number;
  power: number;
};
type Vec3 = { x: number; y: number; z: number };
type BallPose = {
  u: Vec3;
  v: Vec3;
  w: Vec3;
  x: number;
  y: number;
};

const BG_GRAD = ["#081318", "#0d1b2a"];

export function GameCanvas({
  state,
  myUserId,
  onShoot,
  onPlaceCue,
  assistStrength,
  shotPower,
  onShotPowerChange,
  cueStyle,
  tableSkin,
  replay,
  inputLocked = false,
  lockLabel = null,
  onReplayDone,
  remotePresence = null,
  onPresenceUpdate
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aim, setAim] = useState<AimState>({ active: false, angle: 0, power: 0.35 });
  const aimRef = useRef<AimState>(aim);
  const aimSyncRaf = useRef<number | null>(null);
  const ballPoseRef = useRef<Map<number, BallPose>>(new Map());
  const replayDoneRef = useRef<Props["onReplayDone"]>(onReplayDone);
  const cuePlacementRaf = useRef<number | null>(null);
  const pendingCuePlacementRef = useRef<{ x: number; y: number } | null>(null);
  const aimingPointerRef = useRef<number | null>(null);
  const presenceRafRef = useRef<number | null>(null);
  const presencePendingRef = useRef<{ active: boolean; angle: number; power: number } | null>(null);
  const lastPresenceSentAtRef = useRef(0);
  const replayFinishTimerRef = useRef<number | null>(null);
  const displayPower = shotPower ?? aim.power;
  const activeCue = cueStyle ?? {
    id: "default",
    name: "Default",
    level: 1,
    price: 0,
    currency: "coins" as const,
    group: "standard" as const,
    countryTheme: "Arena",
    flagColors: ["#d04b42", "#f5f5f5", "#2e5fbd"] as [string, string, string],
    butt: ARENA_THEME.cueStick,
    shaft: "#e8d4a8",
    tip: "#4f5963",
    accent: "#f2cf7a"
  };
  const activeTable = tableSkin ?? {
    id: "default",
    name: "Default",
    felt: ARENA_THEME.tableFelt,
    rail: ARENA_THEME.railWood,
    pocket: ARENA_THEME.pocket,
    bgTop: BG_GRAD[0],
    bgBottom: BG_GRAD[1]
  };

  const isMyTurn = useMemo(() => {
    if (!state || !myUserId) return false;
    return state.players[state.currentTurn]?.userId === myUserId;
  }, [state, myUserId]);

  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);

  useEffect(() => {
    replayDoneRef.current = onReplayDone;
  }, [onReplayDone]);

  useEffect(() => {
    return () => {
      if (aimSyncRaf.current !== null) window.cancelAnimationFrame(aimSyncRaf.current);
      if (cuePlacementRaf.current !== null) window.cancelAnimationFrame(cuePlacementRaf.current);
      if (presenceRafRef.current !== null) window.cancelAnimationFrame(presenceRafRef.current);
      if (replayFinishTimerRef.current !== null) window.clearTimeout(replayFinishTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state?.ballInHand) return;
    aimingPointerRef.current = null;
  }, [state?.ballInHand]);

  useEffect(() => {
    ballPoseRef.current.clear();
  }, [state?.matchId]);

  useEffect(() => {
    if (replayFinishTimerRef.current !== null) {
      window.clearTimeout(replayFinishTimerRef.current);
      replayFinishTimerRef.current = null;
    }
    if (!replay || replay.frames.length === 0) return;

    const frameDurationMs = 1000 / Math.max(1, replay.fps);
    const warmupDelayMs = Math.max(0, (replay.startAtMs ?? Date.now()) - Date.now());
    const doneDelayMs = warmupDelayMs + frameDurationMs * replay.frames.length + 16;
    replayFinishTimerRef.current = window.setTimeout(() => {
      replayFinishTimerRef.current = null;
      replayDoneRef.current?.();
    }, doneDelayMs);

    return () => {
      if (replayFinishTimerRef.current !== null) {
        window.clearTimeout(replayFinishTimerRef.current);
        replayFinishTimerRef.current = null;
      }
    };
  }, [replay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = wrap.getBoundingClientRect();
      const logicalHeight = rect.width * 0.58;
      const nextWidth = Math.floor(rect.width * dpr);
      const nextHeight = Math.floor(logicalHeight * dpr);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.height = `${logicalHeight}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = logicalHeight;
      const scale = Math.min(width / state.table.width, height / state.table.height);
      const ox = (width - state.table.width * scale) / 2;
      const oy = (height - state.table.height * scale) / 2;
      const liveAim = aimRef.current;
      const remoteAim =
        remotePresence && Date.now() - remotePresence.t < 900 ? remotePresence : null;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, activeTable.bgTop);
      bg.addColorStop(1, activeTable.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      const railGrad = ctx.createLinearGradient(0, 0, 0, state.table.height);
      railGrad.addColorStop(0, brighten(activeTable.rail, 0.12));
      railGrad.addColorStop(0.5, activeTable.rail);
      railGrad.addColorStop(1, darken(activeTable.rail, 0.18));
      ctx.fillStyle = railGrad;
      ctx.fillRect(0, 0, state.table.width, state.table.height);

      const innerRailInset = 5;
      const railLight = ctx.createLinearGradient(0, 0, 0, state.table.height);
      railLight.addColorStop(0, "rgba(255,255,255,0.18)");
      railLight.addColorStop(0.25, "rgba(255,255,255,0.06)");
      railLight.addColorStop(0.8, "rgba(0,0,0,0.18)");
      railLight.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.strokeStyle = railLight;
      ctx.lineWidth = innerRailInset * 2;
      ctx.strokeRect(
        innerRailInset,
        innerRailInset,
        state.table.width - innerRailInset * 2,
        state.table.height - innerRailInset * 2
      );

      const feltX = state.table.rail;
      const feltY = state.table.rail;
      const feltW = state.table.width - state.table.rail * 2;
      const feltH = state.table.height - state.table.rail * 2;
      const feltGrad = ctx.createLinearGradient(feltX, feltY, feltX, feltY + feltH);
      feltGrad.addColorStop(0, brighten(activeTable.felt, 0.12));
      feltGrad.addColorStop(0.5, activeTable.felt);
      feltGrad.addColorStop(1, darken(activeTable.felt, 0.14));
      ctx.fillStyle = feltGrad;
      ctx.fillRect(feltX, feltY, feltW, feltH);

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.9;
      for (let i = 1; i <= 14; i += 1) {
        const y = feltY + (feltH * i) / 15;
        ctx.beginPath();
        ctx.moveTo(feltX, y);
        ctx.lineTo(feltX + feltW, y);
        ctx.stroke();
      }

      const headStringX = feltX + feltW * 0.26;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headStringX, feltY + 8);
      ctx.lineTo(headStringX, feltY + feltH - 8);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(headStringX, feltY + feltH * 0.5, 2.4, 0, Math.PI * 2);
      ctx.fill();

      const sights = [
        [state.table.width * 0.18, state.table.rail * 0.5],
        [state.table.width * 0.5, state.table.rail * 0.5],
        [state.table.width * 0.82, state.table.rail * 0.5],
        [state.table.width * 0.18, state.table.height - state.table.rail * 0.5],
        [state.table.width * 0.5, state.table.height - state.table.rail * 0.5],
        [state.table.width * 0.82, state.table.height - state.table.rail * 0.5],
        [state.table.rail * 0.5, state.table.height * 0.26],
        [state.table.rail * 0.5, state.table.height * 0.5],
        [state.table.rail * 0.5, state.table.height * 0.74],
        [state.table.width - state.table.rail * 0.5, state.table.height * 0.26],
        [state.table.width - state.table.rail * 0.5, state.table.height * 0.5],
        [state.table.width - state.table.rail * 0.5, state.table.height * 0.74]
      ];
      for (const [x, y] of sights) {
        ctx.fillStyle = "rgba(248,228,181,0.74)";
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const pocketColor = activeTable.pocket;
      const pocketDefs = getVisualPockets(state.table);
      const pocketProfile = getPocketVisualProfile(state.table);
      for (const pocket of pocketDefs) {
        const outerR = pocket.kind === "corner" ? state.table.pocketRadius * 0.98 : state.table.pocketRadius * 0.9;
        const innerR = outerR * 0.68;

        ctx.beginPath();
        const pocketGrad = ctx.createRadialGradient(
          pocket.x - 2,
          pocket.y - 2,
          outerR * 0.16,
          pocket.x,
          pocket.y,
          outerR
        );
        pocketGrad.addColorStop(0, brighten(pocketColor, 0.05));
        pocketGrad.addColorStop(1, pocketColor);
        ctx.fillStyle = pocketGrad;
        ctx.arc(pocket.x, pocket.y, outerR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.arc(pocket.x, pocket.y, innerR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, outerR, 0, Math.PI * 2);
        ctx.stroke();

        if (pocket.kind === "corner") {
          const jawOffset = pocketProfile.cornerCenterHalfOpen + state.table.ballRadius * 0.18;
          const jawA = { x: pocket.x + pocket.edgeX * jawOffset, y: pocket.y };
          const jawB = { x: pocket.x, y: pocket.y + pocket.edgeY * jawOffset };
          drawPocketJaw(ctx, jawA.x, jawA.y, pocketProfile.cornerJawRadius);
          drawPocketJaw(ctx, jawB.x, jawB.y, pocketProfile.cornerJawRadius);
        } else {
          const jawOffset = pocketProfile.sideCenterHalfOpen + state.table.ballRadius * 0.14;
          const jawL = { x: pocket.x - jawOffset, y: pocket.y };
          const jawR = { x: pocket.x + jawOffset, y: pocket.y };
          drawPocketJaw(ctx, jawL.x, jawL.y, pocketProfile.sideJawRadius);
          drawPocketJaw(ctx, jawR.x, jawR.y, pocketProfile.sideJawRadius);
        }
      }

      const cue = state.balls.find((b) => b.kind === "cue" && !b.pocketed);
      if (cue && isMyTurn && liveAim.active) {
        const previewLen = 280 * assistStrength;
        const prediction = predictFirstCollision(state.balls, cue, liveAim.angle);

        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(cue.pos.x, cue.pos.y);
        if (prediction) {
          ctx.lineTo(prediction.cueImpact.x, prediction.cueImpact.y);
        } else {
          ctx.lineTo(cue.pos.x + Math.cos(liveAim.angle) * previewLen, cue.pos.y + Math.sin(liveAim.angle) * previewLen);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        if (prediction) {
          ctx.strokeStyle = "rgba(255,255,255,0.65)";
          ctx.lineWidth = 1.75;
          ctx.setLineDash([6, 7]);
          ctx.beginPath();
          ctx.moveTo(prediction.target.pos.x, prediction.target.pos.y);
          ctx.lineTo(
            prediction.target.pos.x + prediction.targetDir.x * (150 * assistStrength),
            prediction.target.pos.y + prediction.targetDir.y * (150 * assistStrength)
          );
          ctx.stroke();

          if (prediction.cueDeflectDir) {
            ctx.strokeStyle = "rgba(183, 232, 255, 0.62)";
            ctx.beginPath();
            ctx.moveTo(prediction.cueImpact.x, prediction.cueImpact.y);
            ctx.lineTo(
              prediction.cueImpact.x + prediction.cueDeflectDir.x * (110 * assistStrength),
              prediction.cueImpact.y + prediction.cueDeflectDir.y * (110 * assistStrength)
            );
            ctx.stroke();
          }
          ctx.setLineDash([]);

          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(prediction.target.pos.x, prediction.target.pos.y, cue.radius * 1.45, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.strokeStyle = activeCue.butt;
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(cue.pos.x - Math.cos(liveAim.angle) * 26, cue.pos.y - Math.sin(liveAim.angle) * 26);
        ctx.lineTo(
          cue.pos.x - Math.cos(liveAim.angle) * (220 + displayPower * 40),
          cue.pos.y - Math.sin(liveAim.angle) * (220 + displayPower * 40)
        );
        ctx.stroke();

        ctx.strokeStyle = "#e8ebef";
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(cue.pos.x - Math.cos(liveAim.angle) * 30, cue.pos.y - Math.sin(liveAim.angle) * 30);
        ctx.lineTo(
          cue.pos.x - Math.cos(liveAim.angle) * (190 + displayPower * 30),
          cue.pos.y - Math.sin(liveAim.angle) * (190 + displayPower * 30)
        );
        ctx.stroke();

        ctx.strokeStyle = "#090d13";
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(cue.pos.x - Math.cos(liveAim.angle) * 170, cue.pos.y - Math.sin(liveAim.angle) * 170);
        ctx.lineTo(cue.pos.x - Math.cos(liveAim.angle) * 155, cue.pos.y - Math.sin(liveAim.angle) * 155);
        ctx.stroke();

        const flagBandStarts = [108, 124, 140];
        for (let i = 0; i < activeCue.flagColors.length; i += 1) {
          const start = flagBandStarts[i] ?? 98 + i * 16;
          const end = start + 16;
          ctx.strokeStyle = activeCue.flagColors[i];
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(cue.pos.x - Math.cos(liveAim.angle) * start, cue.pos.y - Math.sin(liveAim.angle) * start);
          ctx.lineTo(cue.pos.x - Math.cos(liveAim.angle) * end, cue.pos.y - Math.sin(liveAim.angle) * end);
          ctx.stroke();
        }
      }

      if (cue && !isMyTurn && remoteAim?.active && !state.shotInProgress) {
        ctx.strokeStyle = "rgba(110,215,255,0.56)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(cue.pos.x, cue.pos.y);
        ctx.lineTo(
          cue.pos.x + Math.cos(remoteAim.angle) * 230,
          cue.pos.y + Math.sin(remoteAim.angle) * 230
        );
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(230,247,255,0.72)";
        ctx.lineWidth = 4.8;
        ctx.beginPath();
        ctx.moveTo(
          cue.pos.x - Math.cos(remoteAim.angle) * 22,
          cue.pos.y - Math.sin(remoteAim.angle) * 22
        );
        ctx.lineTo(
          cue.pos.x - Math.cos(remoteAim.angle) * (178 + remoteAim.power * 48),
          cue.pos.y - Math.sin(remoteAim.angle) * (178 + remoteAim.power * 48)
        );
        ctx.stroke();
      }

      const renderBalls = sampleReplayBalls(replay, Date.now()) ?? state.balls;
      const poseMap = ballPoseRef.current;
      for (const ball of renderBalls) {
        if (ball.pocketed) continue;
        const baseColor = colorForBall(ball.number);
        const isCue = ball.kind === "cue";
        const isEight = ball.kind === "eight";
        const isStripe = ball.kind === "stripe";
        const pose = getOrCreateBallPose(poseMap, ball);
        advanceBallPose(pose, ball);

        const bodyColor = isCue ? "#f6f8fb" : isEight ? "#12161d" : isStripe ? "#f9fbfd" : baseColor;
        drawSphereBody(ctx, ball, bodyColor);
        if (isStripe) {
          drawStripeBand(ctx, ball, pose, baseColor);
        }
        if (!isCue) {
          drawNumberSpots(ctx, ball, pose, ball.number);
        }
        drawSpecular(ctx, ball);
      }

      ctx.restore();
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [
    state,
    isMyTurn,
    assistStrength,
    replay,
    displayPower,
    activeCue,
    activeTable,
    remotePresence
  ]);

  const pointerToTable = (e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    if (!state) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const scale = Math.min(width / state.table.width, height / state.table.height);
    const ox = (width - state.table.width * scale) / 2;
    const oy = (height - state.table.height * scale) / 2;

    return {
      x: (e.clientX - rect.left - ox) / scale,
      y: (e.clientY - rect.top - oy) / scale
    };
  };

  const queueCuePlacement = (x: number, y: number) => {
    pendingCuePlacementRef.current = { x, y };
    if (cuePlacementRaf.current !== null) return;
    cuePlacementRaf.current = window.requestAnimationFrame(() => {
      cuePlacementRaf.current = null;
      const placement = pendingCuePlacementRef.current;
      if (!placement) return;
      pendingCuePlacementRef.current = null;
      onPlaceCue(placement.x, placement.y);
    });
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (!state || !isMyTurn || inputLocked) return;
    const p = pointerToTable(e);
    if (!p) return;

    if (state.ballInHand) {
      queueCuePlacement(p.x, p.y);
      return;
    }

    const cue = state.balls.find((b) => b.kind === "cue" && !b.pocketed);
    if (!cue) return;
    const dx = p.x - cue.pos.x;
    const dy = p.y - cue.pos.y;
    const angle = Math.atan2(dy, dx);
    aimingPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    syncAim({ ...aimRef.current, active: true, angle });
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!state || !isMyTurn || inputLocked) return;
    const p = pointerToTable(e);
    if (!p) return;
    if (state.ballInHand) return;

    if (aimingPointerRef.current !== null && e.pointerId !== aimingPointerRef.current) return;
    if (!aimRef.current.active) return;
    const cue = state.balls.find((b) => b.kind === "cue" && !b.pocketed);
    if (!cue) return;
    const dx = p.x - cue.pos.x;
    const dy = p.y - cue.pos.y;
    const drag = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const dragPower = Math.min(1, Math.max(0.08, drag / 250));
    if (onShotPowerChange) {
      syncAim({ ...aimRef.current, angle });
    } else {
      syncAim({ ...aimRef.current, angle, power: dragPower });
    }
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (state?.ballInHand) {
      return;
    }

    const liveAim = aimRef.current;
    if (aimingPointerRef.current !== null && e.pointerId !== aimingPointerRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    aimingPointerRef.current = null;
    if (!state || !isMyTurn || !liveAim.active || inputLocked) return;
    syncAim({ ...liveAim, active: false });
    onShoot({ angle: liveAim.angle, power: displayPower, spin: { x: 0, y: 0 } });
  };

  const onCancel = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    aimingPointerRef.current = null;
    if (aimRef.current.active) {
      syncAim({ ...aimRef.current, active: false });
    }
  };

  const syncAim = (next: AimState) => {
    aimRef.current = next;
    queuePresence(next);
    if (aimSyncRaf.current !== null) return;
    aimSyncRaf.current = window.requestAnimationFrame(() => {
      setAim(aimRef.current);
      aimSyncRaf.current = null;
    });
  };

  const queuePresence = (next: AimState) => {
    if (!onPresenceUpdate || !state || !isMyTurn || state.ballInHand) return;
    presencePendingRef.current = {
      active: next.active,
      angle: next.angle,
      power: displayPower
    };
    if (presenceRafRef.current !== null) return;
    presenceRafRef.current = window.requestAnimationFrame((ts) => {
      presenceRafRef.current = null;
      const pending = presencePendingRef.current;
      if (!pending) return;
      if (ts - lastPresenceSentAtRef.current < 32) {
        queuePresence(next);
        return;
      }
      lastPresenceSentAtRef.current = ts;
      onPresenceUpdate(pending);
    });
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className={`w-full rounded-2xl shadow-glow touch-none ${inputLocked ? "opacity-95" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      />
      <div className="absolute right-3 top-3 rounded-xl bg-black/45 px-3 py-2 text-xs text-white/90">
        Power: {Math.round(displayPower * 100)}%
      </div>
      {inputLocked && (
        <div className="absolute left-3 top-3 rounded-xl bg-black/55 px-3 py-2 text-xs text-white/90">
          {lockLabel || "Shot in progress..."}
        </div>
      )}
    </div>
  );
}

type VisualPocket = {
  x: number;
  y: number;
  kind: "corner" | "side";
  edgeX: -1 | 0 | 1;
  edgeY: -1 | 1;
};

function getVisualPockets(table: MatchState["table"]): VisualPocket[] {
  return [
    { x: table.rail, y: table.rail, kind: "corner", edgeX: -1, edgeY: -1 },
    { x: table.width / 2, y: table.rail, kind: "side", edgeX: 0, edgeY: -1 },
    { x: table.width - table.rail, y: table.rail, kind: "corner", edgeX: 1, edgeY: -1 },
    { x: table.rail, y: table.height - table.rail, kind: "corner", edgeX: -1, edgeY: 1 },
    { x: table.width / 2, y: table.height - table.rail, kind: "side", edgeX: 0, edgeY: 1 },
    { x: table.width - table.rail, y: table.height - table.rail, kind: "corner", edgeX: 1, edgeY: 1 }
  ];
}

function getPocketVisualProfile(table: MatchState["table"]) {
  const unitsPerInch = (table.ballRadius * 2) / 2.25;
  const cornerMouth = PHYSICS.cornerPocketMouthInches * unitsPerInch;
  const sideMouth = PHYSICS.sidePocketMouthInches * unitsPerInch;
  return {
    cornerCenterHalfOpen: Math.max(
      table.ballRadius * 0.8,
      cornerMouth * 0.5 - table.ballRadius * PHYSICS.pocketNoseCenterClearance
    ),
    sideCenterHalfOpen: Math.max(
      table.ballRadius * 0.95,
      sideMouth * 0.5 - table.ballRadius * PHYSICS.pocketNoseCenterClearance
    ),
    cornerJawRadius: PHYSICS.cornerJawRadiusInches * unitsPerInch,
    sideJawRadius: PHYSICS.sideJawRadiusInches * unitsPerInch
  };
}

function drawPocketJaw(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const jawGrad = ctx.createRadialGradient(x - radius * 0.22, y - radius * 0.22, radius * 0.2, x, y, radius);
  jawGrad.addColorStop(0, "rgba(58,39,28,0.92)");
  jawGrad.addColorStop(1, "rgba(24,14,11,0.98)");
  ctx.fillStyle = jawGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function getOrCreateBallPose(store: Map<number, BallPose>, ball: BallState): BallPose {
  const existing = store.get(ball.id);
  if (existing) return existing;
  const pose: BallPose = {
    u: { x: 1, y: 0, z: 0 },
    v: { x: 0, y: 1, z: 0 },
    w: { x: 0, y: 0, z: 1 },
    x: ball.pos.x,
    y: ball.pos.y
  };
  store.set(ball.id, pose);
  return pose;
}

function advanceBallPose(pose: BallPose, ball: BallState) {
  const dx = ball.pos.x - pose.x;
  const dy = ball.pos.y - pose.y;
  const dist = Math.hypot(dx, dy);
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  pose.x = ball.pos.x;
  pose.y = ball.pos.y;
  if (dist < 1e-4) return;
  if (speed < 1.4 && dist < 0.06) return;
  if (dist > ball.radius * 2.6) return;

  const axis = vec3Norm({ x: -dy, y: dx, z: 0 });
  if (vec3Len(axis) < 1e-6) return;
  const angle = dist / Math.max(1, ball.radius);

  pose.u = vec3Rotate(pose.u, axis, angle);
  pose.v = vec3Rotate(pose.v, axis, angle);
  pose.w = vec3Rotate(pose.w, axis, angle);

  pose.w = vec3Norm(pose.w);
  pose.u = vec3Sub(pose.u, vec3Scale(pose.w, vec3Dot(pose.u, pose.w)));
  if (vec3Len(pose.u) < 1e-5) {
    pose.u = Math.abs(pose.w.x) < 0.9 ? vec3Cross({ x: 1, y: 0, z: 0 }, pose.w) : vec3Cross({ x: 0, y: 1, z: 0 }, pose.w);
  }
  pose.u = vec3Norm(pose.u);
  pose.v = vec3Norm(vec3Cross(pose.w, pose.u));
}

function drawSphereBody(ctx: CanvasRenderingContext2D, ball: BallState, color: string) {
  const grad = ctx.createRadialGradient(
    ball.pos.x - ball.radius * 0.42,
    ball.pos.y - ball.radius * 0.48,
    ball.radius * 0.1,
    ball.pos.x,
    ball.pos.y,
    ball.radius * 1.05
  );
  grad.addColorStop(0, brighten(color, 0.2));
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, darken(color, 0.28));

  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.85;
  ctx.stroke();
}

function drawStripeBand(ctx: CanvasRenderingContext2D, ball: BallState, pose: BallPose, color: string) {
  const axis = { x: pose.w.x, y: pose.w.y };
  const axisLen = Math.hypot(axis.x, axis.y);
  const bandAngle = axisLen > 1e-4 ? Math.atan2(axis.y, axis.x) + Math.PI / 2 : 0;
  const squash = Math.max(0.14, Math.abs(pose.w.z));

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(ball.pos.x, ball.pos.y);
  ctx.rotate(bandAngle);
  ctx.scale(1, squash);

  const stripeGrad = ctx.createLinearGradient(0, -ball.radius, 0, ball.radius);
  stripeGrad.addColorStop(0, brighten(color, 0.08));
  stripeGrad.addColorStop(0.5, color);
  stripeGrad.addColorStop(1, darken(color, 0.12));
  ctx.fillStyle = stripeGrad;
  ctx.fillRect(-ball.radius * 1.6, -ball.radius * 0.58, ball.radius * 3.2, ball.radius * 1.16);
  ctx.restore();
}

function drawNumberSpots(ctx: CanvasRenderingContext2D, ball: BallState, pose: BallPose, number: number) {
  drawSpotForNormal(ctx, ball, pose.w, number);
  drawSpotForNormal(ctx, ball, vec3Scale(pose.w, -1), number);
}

function drawSpotForNormal(ctx: CanvasRenderingContext2D, ball: BallState, normal: Vec3, number: number) {
  const front = normal.z;
  if (front < -0.1) return;

  const cx = ball.pos.x + normal.x * ball.radius * 0.56;
  const cy = ball.pos.y + normal.y * ball.radius * 0.56;
  const r = Math.max(5.4, ball.radius * (0.3 + Math.max(0, front) * 0.14));
  const alpha = Math.max(0.58, Math.min(1, (front + 0.1) / 1.1));

  ctx.save();
  ctx.globalAlpha = alpha;
  const spotGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.2, cx, cy, r);
  spotGrad.addColorStop(0, "#fffef8");
  spotGrad.addColorStop(1, "#ebe4d0");
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Keep glyph upright on screen for readability while the spot itself follows 3D roll.
  ctx.translate(cx, cy);
  ctx.fillStyle = "#0f141d";
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = Math.max(0.95, r * 0.1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.max(10.5, r * 1.24)}px sans-serif`;
  ctx.strokeText(String(number), 0, 0.2);
  ctx.fillText(String(number), 0, 0.2);
  ctx.restore();
}

function drawSpecular(ctx: CanvasRenderingContext2D, ball: BallState) {
  const shine1 = ctx.createRadialGradient(
    ball.pos.x - ball.radius * 0.36,
    ball.pos.y - ball.radius * 0.44,
    ball.radius * 0.05,
    ball.pos.x - ball.radius * 0.36,
    ball.pos.y - ball.radius * 0.44,
    ball.radius * 0.44
  );
  shine1.addColorStop(0, "rgba(255,255,255,0.48)");
  shine1.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine1;
  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(
    ball.pos.x + ball.radius * 0.12,
    ball.pos.y + ball.radius * 0.42,
    ball.radius * 0.26,
    ball.radius * 0.14,
    -0.35,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function vec3Len(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function vec3Norm(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const a = vec3Norm(axis);
  if (vec3Len(a) < 1e-8) return v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const term1 = vec3Scale(v, c);
  const term2 = vec3Scale(vec3Cross(a, v), s);
  const term3 = vec3Scale(a, vec3Dot(a, v) * (1 - c));
  return {
    x: term1.x + term2.x + term3.x,
    y: term1.y + term2.y + term3.y,
    z: term1.z + term2.z + term3.z
  };
}

function colorForBall(number: number): string {
  const n = number >= 9 ? number - 8 : number;
  switch (n) {
    case 1:
      return "#f8cf3d";
    case 2:
      return "#2f74df";
    case 3:
      return "#d4453e";
    case 4:
      return "#7b43c4";
    case 5:
      return "#ef8732";
    case 6:
      return "#2a8a4e";
    case 7:
      return "#7a1e1e";
    default:
      return ARENA_THEME.solid;
  }
}

function norm(v: { x: number; y: number }): { x: number; y: number } {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

function adjustHex(hex: string, amount: number): string {
  if (!hex.startsWith("#")) return hex;
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => `${c}${c}`).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return hex;
  const r = Math.min(255, Math.max(0, ((value >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((value >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (value & 0xff) + Math.round(255 * amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function brighten(hex: string, amount: number): string {
  return adjustHex(hex, Math.abs(amount));
}

function darken(hex: string, amount: number): string {
  return adjustHex(hex, -Math.abs(amount));
}

function sampleReplayBalls(
  replay: { frames: BallState[][]; fps: number; startAtMs?: number } | null,
  nowMs: number
): BallState[] | null {
  if (!replay || replay.frames.length === 0) return null;
  const startAtMs = replay.startAtMs ?? nowMs;
  const frameDurationMs = 1000 / Math.max(1, replay.fps);
  const progress = Math.max(0, Math.min(replay.frames.length - 1, (nowMs - startAtMs) / frameDurationMs));
  const base = Math.floor(progress);
  const next = Math.min(replay.frames.length - 1, base + 1);
  const alpha = Math.max(0, Math.min(1, progress - base));
  const a = replay.frames[base] ?? replay.frames[0];
  const b = replay.frames[next] ?? a;
  if (!a || !b) return null;

  return a.map((ball, idx) => {
    const nb = b[idx] ?? ball;
    return {
      ...ball,
      pocketed: nb.pocketed,
      pos: {
        x: ball.pos.x + (nb.pos.x - ball.pos.x) * alpha,
        y: ball.pos.y + (nb.pos.y - ball.pos.y) * alpha
      },
      vel: {
        x: ball.vel.x + (nb.vel.x - ball.vel.x) * alpha,
        y: ball.vel.y + (nb.vel.y - ball.vel.y) * alpha
      }
    };
  });
}

function predictFirstCollision(
  balls: BallState[],
  cue: BallState,
  angle: number
): {
  target: BallState;
  cueImpact: { x: number; y: number };
  targetDir: { x: number; y: number };
  cueDeflectDir: { x: number; y: number } | null;
} | null {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const radiusSum = cue.radius * 2;
  let best: { ball: BallState; distAlong: number } | null = null;

  for (const b of balls) {
    if (b.pocketed || b.id === cue.id) continue;
    const toTarget = { x: b.pos.x - cue.pos.x, y: b.pos.y - cue.pos.y };
    const t = toTarget.x * dir.x + toTarget.y * dir.y;
    if (t <= 0) continue;

    const closest = { x: cue.pos.x + dir.x * t, y: cue.pos.y + dir.y * t };
    const perp = Math.hypot(b.pos.x - closest.x, b.pos.y - closest.y);
    if (perp > radiusSum) continue;

    const reach = Math.sqrt(Math.max(0, radiusSum * radiusSum - perp * perp));
    const distAlong = t - reach;
    if (distAlong <= 0) continue;
    if (!best || distAlong < best.distAlong) best = { ball: b, distAlong };
  }

  if (!best) return null;
  const cueImpact = {
    x: cue.pos.x + dir.x * best.distAlong,
    y: cue.pos.y + dir.y * best.distAlong
  };
  const toTarget = { x: best.ball.pos.x - cueImpact.x, y: best.ball.pos.y - cueImpact.y };
  const l = Math.hypot(toTarget.x, toTarget.y) || 1;
  const n = { x: toTarget.x / l, y: toTarget.y / l };
  const vectors = predictCueObjectCollisionVectors(dir, n);
  if (!vectors) return null;
  const targetLen = Math.hypot(vectors.objectOut.x, vectors.objectOut.y);
  const cueOutLen = Math.hypot(vectors.cueOut.x, vectors.cueOut.y);
  const targetDir = targetLen > 1e-4 ? { x: vectors.objectOut.x / targetLen, y: vectors.objectOut.y / targetLen } : n;
  const cueDeflectDir =
    cueOutLen > 1e-4 ? { x: vectors.cueOut.x / cueOutLen, y: vectors.cueOut.y / cueOutLen } : null;

  return {
    target: best.ball,
    cueImpact,
    targetDir,
    cueDeflectDir
  };
}
