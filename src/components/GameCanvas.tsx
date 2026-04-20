"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BallState, MatchState, ShotInput } from "@/game/types";
import { ARENA_THEME } from "@/game/rendering/theme";

type Props = {
  state: MatchState | null;
  myUserId: string | null;
  onShoot: (shot: ShotInput) => void;
  onPlaceCue: (x: number, y: number) => void;
  assistStrength: number;
  shotPower?: number;
  onShotPowerChange?: (nextPower: number) => void;
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
  replay,
  inputLocked = false,
  lockLabel = null,
  onReplayDone
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aim, setAim] = useState<AimState>({ active: false, angle: 0, power: 0.35 });
  const [replayProgress, setReplayProgress] = useState(0);
  const displayPower = shotPower ?? aim.power;

  const isMyTurn = useMemo(() => {
    if (!state || !myUserId) return false;
    return state.players[state.currentTurn]?.userId === myUserId;
  }, [state, myUserId]);

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
        window.setTimeout(() => onReplayDone?.(), frameDurationMs);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [replay, onReplayDone]);

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

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor((rect.width * 0.58) * dpr);
    canvas.style.height = `${rect.width * 0.58}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const draw = () => {
      const width = rect.width;
      const height = rect.width * 0.58;
      const scale = Math.min(width / state.table.width, height / state.table.height);
      const ox = (width - state.table.width * scale) / 2;
      const oy = (height - state.table.height * scale) / 2;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, BG_GRAD[0]);
      bg.addColorStop(1, BG_GRAD[1]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      ctx.fillStyle = ARENA_THEME.railWood;
      ctx.fillRect(0, 0, state.table.width, state.table.height);

      ctx.fillStyle = ARENA_THEME.tableFelt;
      ctx.fillRect(
        state.table.rail,
        state.table.rail,
        state.table.width - state.table.rail * 2,
        state.table.height - state.table.rail * 2
      );

      const pocketColor = ARENA_THEME.pocket;
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
      if (cue && isMyTurn && aim.active && !state.ballInHand) {
        const previewLen = 280 * assistStrength;
        ctx.strokeStyle = "rgba(255,255,255,0.48)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(cue.pos.x, cue.pos.y);
        ctx.lineTo(cue.pos.x + Math.cos(aim.angle) * previewLen, cue.pos.y + Math.sin(aim.angle) * previewLen);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = ARENA_THEME.cueStick;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cue.pos.x - Math.cos(aim.angle) * 26, cue.pos.y - Math.sin(aim.angle) * 26);
        ctx.lineTo(
          cue.pos.x - Math.cos(aim.angle) * (220 + displayPower * 40),
          cue.pos.y - Math.sin(aim.angle) * (220 + displayPower * 40)
        );
        ctx.stroke();
      }

      const renderBalls = interpolatedReplayBalls ?? state.balls;
      for (const ball of renderBalls) {
        if (ball.pocketed) continue;
        ctx.beginPath();
        if (ball.kind === "cue") ctx.fillStyle = ARENA_THEME.cue;
        else if (ball.kind === "eight") ctx.fillStyle = ARENA_THEME.eight;
        else if (ball.kind === "solid") ctx.fillStyle = ARENA_THEME.solid;
        else ctx.fillStyle = ARENA_THEME.stripe;

        ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();

        const shine = ctx.createRadialGradient(ball.pos.x - 4, ball.pos.y - 4, 0, ball.pos.x, ball.pos.y, ball.radius);
        shine.addColorStop(0, "rgba(255,255,255,0.7)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [state, aim, isMyTurn, assistStrength, interpolatedReplayBalls, displayPower]);

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
    setAim((prev) => ({ ...prev, active: true, angle }));
  };

  const onMove = (e: PointerEvent) => {
    if (!state || !aim.active || !isMyTurn || inputLocked) return;
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
      setAim((prev) => ({ ...prev, angle }));
    } else {
      setAim((prev) => ({ ...prev, angle, power: dragPower }));
    }
  };

  const onUp = () => {
    if (!state || !isMyTurn || !aim.active || inputLocked) return;
    setAim((prev) => ({ ...prev, active: false }));
    onShoot({ angle: aim.angle, power: displayPower, spin: { x: 0, y: 0 } });
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
