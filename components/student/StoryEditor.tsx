"use client";

/**
 * Story editor (#1 beta feature): Instagram/Facebook-style compose step
 * between picking an image and publishing. The photo fills the screen;
 * on top of it you can add a caption, flip the image, or draw over it with
 * a color pen before posting. Cancel discards; Publish hands the (possibly
 * modified) canvas back to the caller as a File.
 */

import { useEffect, useRef, useState } from "react";
import { registerBackHandler } from "@/lib/nativeBackHandler";

const PEN_COLORS = ["#ffffff", "#141214", "#9ea7b3", "#c98f8f", "#f2c94c", "#7fb069"];

export function StoryEditor({
  file,
  publishing,
  onCancel,
  onPublish,
}: {
  file: File;
  publishing: boolean;
  onCancel: () => void;
  onPublish: (file: File, caption: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [penColor, setPenColor] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<{ color: string; points: { x: number; y: number }[] }[]>([]);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Hardware back = cancel (same contract as the shared Modal).
  useEffect(() => {
    return registerBackHandler(() => {
      onCancel();
      return true;
    });
  }, [onCancel]);

  /** Redraw base image + all strokes onto the canvas. */
  function render() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (flipped) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // Strokes were captured in canvas space (already flip-aware at input time).
    for (const stroke of strokesRef.current) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    if (flipped) x = canvas.width - x;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!penColor) return;
    const p = canvasPoint(e);
    if (!p) return;
    drawingRef.current = true;
    strokesRef.current.push({ color: penColor, points: [p] });
    dirtyRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    if (!p) return;
    strokesRef.current[strokesRef.current.length - 1]?.points.push(p);
    render();
  }

  function onPointerUp() {
    drawingRef.current = false;
  }

  async function publish() {
    const canvas = canvasRef.current;
    if (!canvas || !dirtyRef.current) {
      // No edits - hand the original file straight through.
      onPublish(file, caption.trim());
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
    );
    if (!blob) {
      onPublish(file, caption.trim());
      return;
    }
    const edited = new File([blob], file.name.replace(/\.\w+$/, "") + "-edited.jpg", { type: "image/jpeg" });
    onPublish(edited, caption.trim());
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0f0f11]">
      {/* Canvas stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt="Story draft"
            className="absolute h-full w-full object-contain opacity-0"
            onLoad={(e) => {
              const img = e.currentTarget;
              imgRef.current = img;
              const canvas = canvasRef.current;
              if (canvas) {
                // Cap the working canvas so toBlob stays fast on phones.
                const maxDim = 1280;
                const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                render();
              }
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          className={`max-h-full max-w-full rounded-[10px] object-contain ${penColor ? "cursor-crosshair" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!penColor && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
            Pick a pen color to draw on your story
          </p>
        )}
      </div>

      {/* Caption (top overlay, like IG text) */}
      <div className="px-4 pt-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption..."
          maxLength={120}
          className="w-full rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-white/40"
        />
      </div>

      {/* Tools */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Pen ${color}`}
              onClick={() => setPenColor((c) => (c === color ? null : color))}
              className={`h-7 w-7 rounded-full border-2 transition ${
                penColor === color ? "scale-110 border-white" : "border-white/30"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setFlipped((f) => !f);
              requestAnimationFrame(render);
            }}
            aria-label="Flip photo"
            title="Flip photo"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 transition hover:border-white/40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18" />
              <path d="M8 7 4 12l4 5" />
              <path d="m16 7 4 5-4 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              strokesRef.current = [];
              dirtyRef.current = strokesRef.current.length > 0;
              render();
            }}
            aria-label="Clear drawings"
            title="Clear drawings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/90 transition hover:border-white/40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/90 transition hover:border-white/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={publishing}
            className="flex items-center gap-2 rounded-full bg-[#9ea7b3] px-5 py-2 text-xs font-bold text-[#141214] transition hover:opacity-90 disabled:opacity-60"
          >
            {publishing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {publishing ? "Publishing..." : "Share story"}
          </button>
        </div>
      </div>
    </div>
  );
}
