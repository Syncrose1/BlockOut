import { useEffect, useRef, useState } from 'react';

interface MonsterSpriteProps {
  frames: string[];          // array of image paths (idle or attack frames)
  fallbackSprite?: string;   // static sprite if no frames
  fps?: number;              // animation speed (default 8)
  size?: number;             // rendered size in px (default 64)
  pixelated?: boolean;
  style?: React.CSSProperties;
}

/**
 * Renders a pixel art monster sprite with frame animation.
 * Falls back to a placeholder if no frames are available (not yet generated).
 */
export function MonsterSprite({
  frames,
  fallbackSprite,
  fps = 8,
  size = 64,
  pixelated = true,
  style,
}: MonsterSpriteProps) {
  const [frameIdx, setFrameIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasFrames = frames.length > 1;
  const displaySrc = hasFrames
    ? frames[frameIdx]
    : frames[0] ?? fallbackSprite ?? null;

  useEffect(() => {
    if (!hasFrames) return;
    const ms = Math.round(1000 / fps);
    intervalRef.current = setInterval(() => {
      setFrameIdx(i => (i + 1) % frames.length);
    }, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [frames, fps, hasFrames]);

  const imgStyle: React.CSSProperties = {
    width: size,
    height: size,
    objectFit: 'contain',
    imageRendering: pixelated ? 'pixelated' : 'auto',
    ...style,
  };

  if (!displaySrc) {
    // Placeholder when sprite hasn't been generated yet
    return (
      <div style={{
        width: size, height: size, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-tertiary)', borderRadius: 8,
        fontSize: size * 0.4, userSelect: 'none',
        ...style,
      }}>
        ?
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt="monster"
      style={imgStyle}
      draggable={false}
    />
  );
}
