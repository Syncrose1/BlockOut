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
    /* Smooth lemniscate (∞): 48 sampled points of x=28·sin(2πs), y=-14·sin(4πs)
       so the constant-speed (linear) sweep traces a clean curve. No rotation. */
    @keyframes tether-face-infinity {
      0% { transform: translate(0.00px, -0.00px); }
      2.0833% { transform: translate(3.65px, -3.62px); }
      4.1667% { transform: translate(7.25px, -7.00px); }
      6.25% { transform: translate(10.72px, -9.90px); }
      8.3333% { transform: translate(14.00px, -12.12px); }
      10.4167% { transform: translate(17.05px, -13.52px); }
      12.5% { transform: translate(19.80px, -14.00px); }
      14.5833% { transform: translate(22.21px, -13.52px); }
      16.6667% { transform: translate(24.25px, -12.12px); }
      18.75% { transform: translate(25.87px, -9.90px); }
      20.8333% { transform: translate(27.05px, -7.00px); }
      22.9167% { transform: translate(27.76px, -3.62px); }
      25% { transform: translate(28.00px, -0.00px); }
      27.0833% { transform: translate(27.76px, 3.62px); }
      29.1667% { transform: translate(27.05px, 7.00px); }
      31.25% { transform: translate(25.87px, 9.90px); }
      33.3333% { transform: translate(24.25px, 12.12px); }
      35.4167% { transform: translate(22.21px, 13.52px); }
      37.5% { transform: translate(19.80px, 14.00px); }
      39.5833% { transform: translate(17.05px, 13.52px); }
      41.6667% { transform: translate(14.00px, 12.12px); }
      43.75% { transform: translate(10.72px, 9.90px); }
      45.8333% { transform: translate(7.25px, 7.00px); }
      47.9167% { transform: translate(3.65px, 3.62px); }
      50% { transform: translate(0.00px, 0.00px); }
      52.0833% { transform: translate(-3.65px, -3.62px); }
      54.1667% { transform: translate(-7.25px, -7.00px); }
      56.25% { transform: translate(-10.72px, -9.90px); }
      58.3333% { transform: translate(-14.00px, -12.12px); }
      60.4167% { transform: translate(-17.05px, -13.52px); }
      62.5% { transform: translate(-19.80px, -14.00px); }
      64.5833% { transform: translate(-22.21px, -13.52px); }
      66.6667% { transform: translate(-24.25px, -12.12px); }
      68.75% { transform: translate(-25.87px, -9.90px); }
      70.8333% { transform: translate(-27.05px, -7.00px); }
      72.9167% { transform: translate(-27.76px, -3.62px); }
      75% { transform: translate(-28.00px, -0.00px); }
      77.0833% { transform: translate(-27.76px, 3.62px); }
      79.1667% { transform: translate(-27.05px, 7.00px); }
      81.25% { transform: translate(-25.87px, 9.90px); }
      83.3333% { transform: translate(-24.25px, 12.12px); }
      85.4167% { transform: translate(-22.21px, 13.52px); }
      87.5% { transform: translate(-19.80px, 14.00px); }
      89.5833% { transform: translate(-17.05px, 13.52px); }
      91.6667% { transform: translate(-14.00px, 12.12px); }
      93.75% { transform: translate(-10.72px, 9.90px); }
      95.8333% { transform: translate(-7.25px, 7.00px); }
      97.9167% { transform: translate(-3.65px, 3.62px); }
      100% { transform: translate(-0.00px, 0.00px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tether-face-hero, .tether-face-hero .tether-face-mask { animation: none !important; }
    }
  `;
  document.head.appendChild(el);
}
