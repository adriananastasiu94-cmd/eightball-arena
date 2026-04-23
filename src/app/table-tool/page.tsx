"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TableConfig } from "@/game/types";
import { TABLE_SKINS } from "@/game/rendering/customization";
import type { TableArtworkAlignment } from "@/lib/tableConfigStore";

type ConfigResponse = {
  config: TableConfig;
  artwork?: TableArtworkAlignment;
  canEdit?: boolean;
};

const FALLBACK_CONFIG: TableConfig = {
  width: 1024,
  height: 512,
  rail: 36,
  pocketRadius: 28,
  ballRadius: 11
};
const FALLBACK_ARTWORK: TableArtworkAlignment = {
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0
};

const BOUNDS = {
  rail: { min: 18, max: 120, step: 0.25 },
  pocketRadius: { min: 12, max: 72, step: 0.25 },
  ballRadius: { min: 8, max: 24, step: 0.25 },
  artworkScale: { min: 0.72, max: 1.35, step: 0.005 },
  artworkScaleX: { min: 0.72, max: 1.35, step: 0.005 },
  artworkScaleY: { min: 0.72, max: 1.35, step: 0.005 },
  artworkOffsetX: { min: -220, max: 220, step: 1 },
  artworkOffsetY: { min: -160, max: 160, step: 1 }
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sanitizeConfig(config: TableConfig): TableConfig {
  const width = Math.round(config.width);
  const height = Math.round(config.height);
  const ballRadius = clamp(config.ballRadius, BOUNDS.ballRadius.min, BOUNDS.ballRadius.max);
  const maxRail = Math.max(BOUNDS.rail.min, Math.min(BOUNDS.rail.max, Math.min(width, height) / 2 - ballRadius - 2));
  const rail = clamp(config.rail, BOUNDS.rail.min, maxRail);
  const pocketRadius = clamp(config.pocketRadius, BOUNDS.pocketRadius.min, Math.min(BOUNDS.pocketRadius.max, rail - 1));
  return { width, height, rail, pocketRadius, ballRadius };
}

function sanitizeArtwork(input: TableArtworkAlignment): TableArtworkAlignment {
  const legacy = clamp(input.scale, BOUNDS.artworkScale.min, BOUNDS.artworkScale.max);
  return {
    scale: legacy,
    scaleX: clamp(input.scaleX ?? legacy, BOUNDS.artworkScaleX.min, BOUNDS.artworkScaleX.max),
    scaleY: clamp(input.scaleY ?? legacy, BOUNDS.artworkScaleY.min, BOUNDS.artworkScaleY.max),
    offsetX: clamp(input.offsetX, BOUNDS.artworkOffsetX.min, BOUNDS.artworkOffsetX.max),
    offsetY: clamp(input.offsetY, BOUNDS.artworkOffsetY.min, BOUNDS.artworkOffsetY.max)
  };
}

function pocketCenters(cfg: TableConfig): Array<{ x: number; y: number; label: string }> {
  return [
    { x: cfg.rail, y: cfg.rail, label: "TL" },
    { x: cfg.width / 2, y: cfg.rail, label: "TM" },
    { x: cfg.width - cfg.rail, y: cfg.rail, label: "TR" },
    { x: cfg.rail, y: cfg.height - cfg.rail, label: "BL" },
    { x: cfg.width / 2, y: cfg.height - cfg.rail, label: "BM" },
    { x: cfg.width - cfg.rail, y: cfg.height - cfg.rail, label: "BR" }
  ];
}

export default function TableToolPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skinImgRef = useRef<HTMLImageElement | null>(null);
  const [config, setConfig] = useState<TableConfig>(FALLBACK_CONFIG);
  const [savedConfig, setSavedConfig] = useState<TableConfig>(FALLBACK_CONFIG);
  const [artwork, setArtwork] = useState<TableArtworkAlignment>(FALLBACK_ARTWORK);
  const [savedArtwork, setSavedArtwork] = useState<TableArtworkAlignment>(FALLBACK_ARTWORK);
  const [skinId, setSkinId] = useState<string>(TABLE_SKINS[0]?.id ?? "table_1");
  const [skinImageReady, setSkinImageReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSkin = useMemo(
    () => TABLE_SKINS.find((skin) => skin.id === skinId) ?? TABLE_SKINS[0] ?? null,
    [skinId]
  );
  const dirty = useMemo(() => {
    return (
      JSON.stringify(config) !== JSON.stringify(savedConfig) ||
      JSON.stringify(artwork) !== JSON.stringify(savedArtwork)
    );
  }, [config, savedConfig, artwork, savedArtwork]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<ConfigResponse>("/api/admin/table-config")
      .then((res) => {
        if (cancelled) return;
        const normalized = sanitizeConfig(res.config);
        setConfig(normalized);
        setSavedConfig(normalized);
        const visual = sanitizeArtwork(res.artwork ?? FALLBACK_ARTWORK);
        setArtwork(visual);
        setSavedArtwork(visual);
        setCanEdit(Boolean(res.canEdit));
      })
      .catch(() => {
        if (cancelled) return;
        setMessage("Unable to load server table config. Showing local fallback.");
        setConfig(FALLBACK_CONFIG);
        setSavedConfig(FALLBACK_CONFIG);
        setArtwork(FALLBACK_ARTWORK);
        setSavedArtwork(FALLBACK_ARTWORK);
        setCanEdit(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = selectedSkin?.artwork;
    if (!url) {
      skinImgRef.current = null;
      setSkinImageReady(false);
      return;
    }
    let canceled = false;
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (canceled) return;
      skinImgRef.current = img;
      setSkinImageReady(true);
    };
    img.onerror = () => {
      if (canceled) return;
      skinImgRef.current = null;
      setSkinImageReady(false);
    };
    img.src = url;
    setSkinImageReady(false);
    return () => {
      canceled = true;
    };
  }, [selectedSkin?.artwork]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const cssWidth = config.width;
    const cssHeight = config.height;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#071521";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const drawW = cssWidth;
    const drawH = cssHeight;
    const originX = 0;
    const originY = 0;
    const rail = config.rail;
    const pocketRadius = config.pocketRadius;

    ctx.fillStyle = "#4a3528";
    ctx.fillRect(originX, originY, drawW, drawH);

    const skinImage = skinImgRef.current;
    if (skinImageReady && skinImage) {
      const overlayW = drawW * artwork.scaleX;
      const overlayH = drawH * artwork.scaleY;
      const dx = (drawW - overlayW) * 0.5 + artwork.offsetX;
      const dy = (drawH - overlayH) * 0.5 + artwork.offsetY;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(skinImage, dx, dy, overlayW, overlayH);
      ctx.restore();
    }

    const feltX = originX + rail;
    const feltY = originY + rail;
    const feltW = drawW - rail * 2;
    const feltH = drawH - rail * 2;
    ctx.fillStyle = "rgba(7,16,31,0.38)";
    ctx.fillRect(feltX, feltY, feltW, feltH);
    ctx.strokeStyle = "rgba(158, 219, 182, 0.28)";
    ctx.lineWidth = 1;
    for (let x = feltX + 24; x < feltX + feltW; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, feltY);
      ctx.lineTo(x, feltY + feltH);
      ctx.stroke();
    }
    for (let y = feltY + 24; y < feltY + feltH; y += 24) {
      ctx.beginPath();
      ctx.moveTo(feltX, y);
      ctx.lineTo(feltX + feltW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#9edbb6";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(originX + rail, originY + rail, drawW - rail * 2, drawH - rail * 2);
    ctx.setLineDash([]);

    const pockets = pocketCenters(config);
    for (const p of pockets) {
      const cx = originX + p.x;
      const cy = originY + p.y;
      ctx.beginPath();
      ctx.arc(cx, cy, pocketRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, pocketRadius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffcb6b";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#facc7d";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(p.label, cx - 8, cy - pocketRadius - 10);
    }

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.fillText(`Playable bounds: x [${config.rail}, ${Math.round(config.width - config.rail)}]`, 12, drawH - 30);
    ctx.fillText(
      `Skin scaleX ${artwork.scaleX.toFixed(3)} | scaleY ${artwork.scaleY.toFixed(3)} | offset (${Math.round(artwork.offsetX)}, ${Math.round(artwork.offsetY)})`,
      12,
      drawH - 12
    );
  }, [config, artwork, skinImageReady]);

  const setField = (key: keyof TableConfig, value: number) => {
    setConfig((prev) => sanitizeConfig({ ...prev, [key]: value }));
  };
  const setArtworkField = (key: keyof TableArtworkAlignment, value: number) => {
    setArtwork((prev) => sanitizeArtwork({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ ok: boolean; config: TableConfig; artwork: TableArtworkAlignment }>("/api/admin/table-config", {
        method: "POST",
        body: JSON.stringify({
          table: config,
          artwork
        })
      });
      const normalized = sanitizeConfig(res.config);
      setConfig(normalized);
      setSavedConfig(normalized);
      const visual = sanitizeArtwork(res.artwork ?? artwork);
      setArtwork(visual);
      setSavedArtwork(visual);
      setMessage("Saved. New matches will use this table geometry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(savedConfig);
    setArtwork(savedArtwork);
    setMessage(null);
  };

  const fields: Array<{ key: "rail" | "pocketRadius" | "ballRadius"; label: string }> = [
    { key: "rail", label: "Rail Inset" },
    { key: "pocketRadius", label: "Pocket Radius" },
    { key: "ballRadius", label: "Ball Radius" }
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1300px] px-4 py-6 text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Table Geometry Tool</h1>
          <p className="text-sm text-white/70">
            Edit cushions and pockets, then save server-wide defaults for all new matches.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-md bg-white/10 px-4 py-2 text-sm"
          >
            Back To Game
          </button>
          <button
            disabled={!dirty || saving || !canEdit}
            onClick={handleSave}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#052311] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save For Everyone"}
          </button>
        </div>
      </div>

      {loading && <div className="mb-4 rounded-lg border border-white/15 bg-white/5 p-3 text-sm">Loading config...</div>}
      {!canEdit && !loading && (
        <div className="mb-4 rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Your account can view this tool but cannot save. Add your email to `ADMIN_TABLE_EDITOR_EMAILS` (or `ADMIN_COIN_GRANT_EMAILS`) on Render to enable save.
        </div>
      )}
      {message && <div className="mb-4 rounded-lg border border-white/15 bg-white/5 p-3 text-sm">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section className="rounded-xl border border-white/10 bg-[#0d1b30] p-4">
          <h2 className="mb-3 text-base font-semibold">Config</h2>
          <div className="mb-3 rounded border border-white/15 bg-black/20 p-2 text-xs text-white/75">
            Fixed field size: {config.width} x {config.height}
          </div>
          <div className="space-y-3">
            {fields.map((field) => {
              const bounds = BOUNDS[field.key];
              return (
                <label key={field.key} className="block">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{field.label}</span>
                    <input
                      type="number"
                      value={config[field.key]}
                      min={bounds.min}
                      max={bounds.max}
                      step={bounds.step}
                      disabled={!canEdit}
                      onChange={(event) => setField(field.key, Number(event.target.value))}
                      className="w-24 rounded border border-white/20 bg-black/30 px-2 py-1 text-right text-xs text-white disabled:opacity-60"
                    />
                  </div>
                  <input
                    type="range"
                    value={config[field.key]}
                    min={bounds.min}
                    max={bounds.max}
                    step={bounds.step}
                    disabled={!canEdit}
                    onChange={(event) => setField(field.key, Number(event.target.value))}
                    className="w-full"
                  />
                </label>
              );
            })}
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Skin Overlay Alignment</h3>
          <label className="mb-3 block">
            <div className="mb-1 text-sm">Table Skin</div>
            <select
              value={skinId}
              onChange={(event) => setSkinId(event.target.value)}
              className="w-full rounded border border-white/20 bg-black/30 px-2 py-2 text-sm text-white"
            >
              {TABLE_SKINS.map((skin) => (
                <option key={skin.id} value={skin.id}>
                  {skin.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 block">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Skin Width (Scale X)</span>
              <input
                type="number"
                value={artwork.scaleX}
                min={BOUNDS.artworkScaleX.min}
                max={BOUNDS.artworkScaleX.max}
                step={BOUNDS.artworkScaleX.step}
                disabled={!canEdit}
                onChange={(event) => setArtworkField("scaleX", Number(event.target.value))}
                className="w-24 rounded border border-white/20 bg-black/30 px-2 py-1 text-right text-xs text-white disabled:opacity-60"
              />
            </div>
            <input
              type="range"
              value={artwork.scaleX}
              min={BOUNDS.artworkScaleX.min}
              max={BOUNDS.artworkScaleX.max}
              step={BOUNDS.artworkScaleX.step}
              disabled={!canEdit}
              onChange={(event) => setArtworkField("scaleX", Number(event.target.value))}
              className="w-full"
            />
          </label>
          <label className="mb-3 block">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Skin Height (Scale Y)</span>
              <input
                type="number"
                value={artwork.scaleY}
                min={BOUNDS.artworkScaleY.min}
                max={BOUNDS.artworkScaleY.max}
                step={BOUNDS.artworkScaleY.step}
                disabled={!canEdit}
                onChange={(event) => setArtworkField("scaleY", Number(event.target.value))}
                className="w-24 rounded border border-white/20 bg-black/30 px-2 py-1 text-right text-xs text-white disabled:opacity-60"
              />
            </div>
            <input
              type="range"
              value={artwork.scaleY}
              min={BOUNDS.artworkScaleY.min}
              max={BOUNDS.artworkScaleY.max}
              step={BOUNDS.artworkScaleY.step}
              disabled={!canEdit}
              onChange={(event) => setArtworkField("scaleY", Number(event.target.value))}
              className="w-full"
            />
          </label>
          <label className="mb-3 block">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Skin Offset X</span>
              <input
                type="number"
                value={artwork.offsetX}
                min={BOUNDS.artworkOffsetX.min}
                max={BOUNDS.artworkOffsetX.max}
                step={BOUNDS.artworkOffsetX.step}
                disabled={!canEdit}
                onChange={(event) => setArtworkField("offsetX", Number(event.target.value))}
                className="w-24 rounded border border-white/20 bg-black/30 px-2 py-1 text-right text-xs text-white disabled:opacity-60"
              />
            </div>
            <input
              type="range"
              value={artwork.offsetX}
              min={BOUNDS.artworkOffsetX.min}
              max={BOUNDS.artworkOffsetX.max}
              step={BOUNDS.artworkOffsetX.step}
              disabled={!canEdit}
              onChange={(event) => setArtworkField("offsetX", Number(event.target.value))}
              className="w-full"
            />
          </label>
          <label className="mb-3 block">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Skin Offset Y</span>
              <input
                type="number"
                value={artwork.offsetY}
                min={BOUNDS.artworkOffsetY.min}
                max={BOUNDS.artworkOffsetY.max}
                step={BOUNDS.artworkOffsetY.step}
                disabled={!canEdit}
                onChange={(event) => setArtworkField("offsetY", Number(event.target.value))}
                className="w-24 rounded border border-white/20 bg-black/30 px-2 py-1 text-right text-xs text-white disabled:opacity-60"
              />
            </div>
            <input
              type="range"
              value={artwork.offsetY}
              min={BOUNDS.artworkOffsetY.min}
              max={BOUNDS.artworkOffsetY.max}
              step={BOUNDS.artworkOffsetY.step}
              disabled={!canEdit}
              onChange={(event) => setArtworkField("offsetY", Number(event.target.value))}
              className="w-full"
            />
          </label>
          <button
            onClick={handleReset}
            disabled={!dirty}
            className="mt-4 rounded-md bg-white/10 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Revert Unsaved
          </button>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#0d1b30] p-4">
          <h2 className="mb-3 text-base font-semibold">Wall And Pocket Overlay</h2>
          <p className="mb-2 text-xs text-white/70">Skin is shown at 50% transparency over alignment grid (this screen only).</p>
          <div className="overflow-auto rounded-lg border border-white/10 bg-[#071521] p-2">
            <canvas ref={canvasRef} />
          </div>
        </section>
      </div>
    </main>
  );
}
