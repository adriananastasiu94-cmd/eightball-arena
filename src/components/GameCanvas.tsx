"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BallState, MatchState, ShotInput } from "@/game/types";
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
  replay: { id: string; frames: BallState[][]; fps: number } | null;
  inputLocked?: boolean;
  lockLabel?: string | null;
  onReplayDone?: () => void;
};

type AimState = {
  active: boolean;
  angle: number;
  power: number;
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
  onReplayDone
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aim, setAim] = useState<AimState>({ active: false, angle: 0, power: 0.35 });
  const aimRef = useRef<AimState>(aim);
  const aimSyncRaf = useRef<number | null>(null);
  const rollAngleRef = useRef<Map<number, number>>(new Map());
  const rollDirRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const replayDoneRef = useRef<Props["onReplayDone"]>(onReplayDone);
  const lastFrameRef = useRef<number>(0);
  const [replayProgress, setReplayProgress] = useState(0);
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
    };
  }, []);

  useEffect(() => {
    if (!replay || replay.frames.length === 0) {
      setReplayProgress(0);
      return;
    }

    let raf = 0;
    let finished = false;
    const frameDurationMs = 1000 / Math.max(1, replay.fps);
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(replay.frames.length - 1, elapsed / frameDurationMs);
      setReplayProgress(progress);
      if (progress < replay.frames.length - 1) {
        raf = window.requestAnimationFrame(tick);
      } else if (!finished) {
        finished = true;
        window.setTimeout(() => replayDoneRef.current?.(), frameDurationMs);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [replay]);

  const interpolatedReplayBalls = useMemo(() => {
    if (!replay || replay.frames.length === 0) return null;
    const base = Math.floor(replayProgress);
    const next = Math.min(replay.frames.length - 1, base + 1);
    const alpha = Math.max(0, Math.min(1, replayProgress - base));
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
  }, [replay, replayProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor((rect.width * 0.58) * dpr);
      canvas.style.height = `${rect.width * 0.58}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const dt = lastFrameRef.current > 0 ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 1 / 60;
      lastFrameRef.current = now;
      const width = rect.width;
      const height = rect.width * 0.58;
      const scale = Math.min(width / state.table.width, height / state.table.height);
      const ox = (width - state.table.width * scale) / 2;
      const oy = (height - state.table.height * scale) / 2;
      const liveAim = aimRef.current;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, activeTable.bgTop);
      bg.addColorStop(1, activeTable.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      ctx.fillStyle = activeTable.rail;
      ctx.fillRect(0, 0, state.table.width, state.table.height);

      ctx.fillStyle = activeTable.felt;
      ctx.fillRect(
        state.table.rail,
        state.table.rail,
        state.table.width - state.table.rail * 2,
        state.table.height - state.table.rail * 2
      );

      const pocketColor = activeTable.pocket;
      const pockets = [
        [state.table.rail, state.table.rail],
        [state.table.width / 2, state.table.rail],
        [state.table.width - state.table.rail, state.table.rail],
        [state.table.rail, state.table.height - state.table.rail],
        [state.table.width / 2, state.table.height - state.table.rail],
        [state.table.width - state.table.rail, state.table.height - state.table.rail]
      ];

      for (const [x, y] of pockets) {
        ctx.beginPath();
        ctx.fillStyle = pocketColor;
        ctx.arc(x, y, state.table.pocketRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      const cue = state.balls.find((b) => b.kind === "cue" && !b.pocketed);
      if (cue && isMyTurn && liveAim.active && !state.ballInHand) {
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

      const renderBalls = interpolatedReplayBalls ?? state.balls;
      for (const ball of renderBalls) {
        if (ball.pocketed) continue;
        const baseColor = colorForBall(ball.number);
        const isCue = ball.kind === "cue";
        const isEight = ball.kind === "eight";
        const isStripe = ball.kind === "stripe";
        const speed = Math.hypot(ball.vel.x, ball.vel.y);
        const currentRoll = rollAngleRef.current.get(ball.id) ?? 0;
        const nextRoll = currentRoll + (speed * dt) / Math.max(1, ball.radius) * 0.9;
        rollAngleRef.current.set(ball.id, nextRoll);
        const prevDir = rollDirRef.current.get(ball.id) ?? { x: 1, y: 0 };
        const dir =
          speed > 0.01
            ? { x: ball.vel.x / speed, y: ball.vel.y / speed }
            : prevDir;
        rollDirRef.current.set(ball.id, dir);
        const perp = { x: -dir.y, y: dir.x };
        const spin = Math.sin(nextRoll);
        const wobble = Math.cos(nextRoll * 0.55);

        ctx.beginPath();
        ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = isCue ? ARENA_THEME.cue : isEight ? ARENA_THEME.eight : isStripe ? "#f3f8ff" : baseColor;
        ctx.fill();

        if (isStripe) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = baseColor;
          const bandH = ball.radius * 0.9;
          const bandOffset = spin * ball.radius * 0.22;
          ctx.save();
          ctx.translate(ball.pos.x + dir.x * bandOffset, ball.pos.y + dir.y * bandOffset);
          ctx.rotate(Math.atan2(dir.y, dir.x));
          ctx.fillRect(-ball.radius, -bandH / 2, ball.radius * 2, bandH);
          ctx.restore();
          ctx.restore();
        }

        if (!isCue) {
          const labelOffset = {
            x: dir.x * spin * ball.radius * 0.34 + perp.x * wobble * ball.radius * 0.11,
            y: dir.y * spin * ball.radius * 0.34 + perp.y * wobble * ball.radius * 0.11
          };
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ball.pos.x + labelOffset.x, ball.pos.y + labelOffset.y, Math.max(2.2, ball.radius * 0.42), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#11161f";
          ctx.font = `${Math.max(8, ball.radius * 0.95)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(ball.number), ball.pos.x + labelOffset.x, ball.pos.y + labelOffset.y + 0.5);
        }

        const rollR = ball.radius * 0.5;
        const rx = Math.cos(nextRoll) * rollR;
        const ry = Math.sin(nextRoll) * rollR;
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.arc(ball.pos.x + rx * 0.32, ball.pos.y + ry * 0.32, Math.max(1.2, ball.radius * 0.15), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(ball.pos.x - rx * 0.42, ball.pos.y - ry * 0.42);
        ctx.lineTo(ball.pos.x + rx * 0.42, ball.pos.y + ry * 0.42);
        ctx.stroke();

        const shine = ctx.createRadialGradient(ball.pos.x - 4, ball.pos.y - 4, 0, ball.pos.x, ball.pos.y, ball.radius);
        shine.addColorStop(0, "rgba(255,255,255,0.7)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [state, isMyTurn, assistStrength, interpolatedReplayBalls, displayPower, activeCue, activeTable]);

  const pointerToTable = (e: PointerEvent): { x: number; y: number } | null => {
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

  const onDown = (e: PointerEvent) => {
    if (!state || !isMyTurn || inputLocked) return;
    const p = pointerToTable(e);
    if (!p) return;

    if (state.ballInHand) {
      onPlaceCue(p.x, p.y);
      return;
    }

    const cue = state.balls.find((b) => b.kind === "cue" && !b.pocketed);
    if (!cue) return;
    const dx = p.x - cue.pos.x;
    const dy = p.y - cue.pos.y;
    const angle = Math.atan2(dy, dx);
    syncAim({ ...aimRef.current, active: true, angle });
  };

  const onMove = (e: PointerEvent) => {
    if (!state || !aimRef.current.active || !isMyTurn || inputLocked) return;
    const p = pointerToTable(e);
    if (!p) return;

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

  const onUp = () => {
    const liveAim = aimRef.current;
    if (!state || !isMyTurn || !liveAim.active || inputLocked) return;
    syncAim({ ...liveAim, active: false });
    onShoot({ angle: liveAim.angle, power: displayPower, spin: { x: 0, y: 0 } });
  };

  const syncAim = (next: AimState) => {
    aimRef.current = next;
    if (aimSyncRaf.current !== null) return;
    aimSyncRaf.current = window.requestAnimationFrame(() => {
      setAim(aimRef.current);
      aimSyncRaf.current = null;
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
        onPointerCancel={onUp}
      />
      <div className="absolute right-3 top-3 rounded-xl bg-black/45 px-3 py-2 text-xs text-white/90">
        Power: {Math.round(displayPower * 100)}%
      </div>
      {onShotPowerChange && (
        <div className="absolute bottom-3 right-3 rounded-xl border border-white/15 bg-black/45 px-2 py-2">
          <label className="mb-1 block text-center text-[10px] uppercase tracking-wide text-white/70">Force</label>
          <input
            aria-label="Shot power"
            type="range"
            min={0.08}
            max={1}
            step={0.01}
            value={displayPower}
            disabled={inputLocked || !isMyTurn}
            onChange={(e) => onShotPowerChange(Number(e.target.value))}
            className="h-28 w-4 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#d6b56f] [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]"
          />
        </div>
      )}
      {inputLocked && (
        <div className="absolute left-3 top-3 rounded-xl bg-black/55 px-3 py-2 text-xs text-white/90">
          {lockLabel || "Shot in progress..."}
        </div>
      )}
    </div>
  );
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
  const targetDir = { x: toTarget.x / l, y: toTarget.y / l };

  const proj = dir.x * targetDir.x + dir.y * targetDir.y;
  const cueOut = { x: dir.x - targetDir.x * proj, y: dir.y - targetDir.y * proj };
  const cueOutLen = Math.hypot(cueOut.x, cueOut.y);
  const cueDeflectDir = cueOutLen > 1e-4 ? { x: cueOut.x / cueOutLen, y: cueOut.y / cueOutLen } : null;

  return {
    target: best.ball,
    cueImpact,
    targetDir,
    cueDeflectDir
  };
}
