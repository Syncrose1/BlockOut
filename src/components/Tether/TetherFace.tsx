// Tether's "face" — the Syncratic logo as a CSS mask over a blue→purple gradient
// (cyans, blues, navys, purples, magentas, pinks). NO rotation.
//   variant 'badge' (title bar): static + colourful, no movement.
//   variant 'hero'  (empty chat): large, centred, hovers along an infinity (∞)
//                    path while the gradient drifts through the palette.

import { asset } from '../../utils/asset';

export function TetherFace({ size = 42, variant = 'badge' }: { size?: number; variant?: 'badge' | 'hero' }) {
  const url = asset('/Syncratic-Logo-cropped.svg');
  const mask: React.CSSProperties = {
    width: '100%', height: '100%',
    WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  };
  return (
    <div className={variant === 'hero' ? 'tether-face tether-face-hero' : 'tether-face'} style={{ width: size, height: size }}>
      <div className="tether-face-mask" style={mask} />
    </div>
  );
}

// Inject styles once.
if (typeof document !== 'undefined' && !document.getElementById('tether-face-kf')) {
  const el = document.createElement('style');
  el.id = 'tether-face-kf';
  el.textContent = `
    /* Blue→purple→pink spectrum only (cyan, blue, indigo, violet, magenta, pink). */
    .tether-face-mask {
      width: 100%; height: 100%;
      background: linear-gradient(120deg, #22d3ee, #3b82f6, #4f46e5, #7c3aed, #a21caf, #db2777, #22d3ee);
      background-size: 100% 100%;
      filter: drop-shadow(0 1px 3px rgba(40, 20, 90, 0.16));
    }
    /* Hero: drift the gradient through the palette + hover along an infinity path.
       LINEAR timing so the motion is continuous (ease-in-out decelerated at every
       waypoint, which read as a jerky step-stop-step). */
    .tether-face-hero { animation: tether-face-infinity 7s linear infinite; will-change: transform; }
    .tether-face-hero .tether-face-mask {
      background-size: 280% 280%;
      animation: tether-face-hue 9s ease-in-out infinite;
    }
    @keyframes tether-face-hue {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    /* Smooth lemniscate (∞): 16 sampled points of x=A·sin t, y=-A·sin t·cos t so
       the constant-speed (linear) sweep traces a curve, not an octagon. No rotation. */
    @keyframes tether-face-infinity {
      0%     { transform: translate(0px, 0px); }
      6.25%  { transform: translate(11px, -10px); }
      12.5%  { transform: translate(20px, -14px); }
      18.75% { transform: translate(26px, -10px); }
      25%    { transform: translate(28px, 0px); }
      31.25% { transform: translate(26px, 10px); }
      37.5%  { transform: translate(20px, 14px); }
      43.75% { transform: translate(11px, 10px); }
      50%    { transform: translate(0px, 0px); }
      56.25% { transform: translate(-11px, -10px); }
      62.5%  { transform: translate(-20px, -14px); }
      68.75% { transform: translate(-26px, -10px); }
      75%    { transform: translate(-28px, 0px); }
      81.25% { transform: translate(-26px, 10px); }
      87.5%  { transform: translate(-20px, 14px); }
      93.75% { transform: translate(-11px, 10px); }
      100%   { transform: translate(0px, 0px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tether-face-hero, .tether-face-hero .tether-face-mask { animation: none !important; }
    }
  `;
  document.head.appendChild(el);
}
