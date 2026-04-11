import { useEffect, useRef, useState } from 'react';

interface SynamonSpriteProps {
  frames: string[];
  fallbackSprite?: string;
  fps?: number;
  size?: number;
  pixelated?: boolean;
  style?: React.CSSProperties;
}

export function SynamonSprite({
  frames,
  fallbackSprite,
  fps = 8,
  size = 64,
  pixelated = true,
  style,
}: SynamonSpriteProps) {
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
      alt="synamon"
      style={imgStyle}
      draggable={false}
    />
  );
}
