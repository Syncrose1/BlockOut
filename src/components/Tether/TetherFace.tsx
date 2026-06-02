// Tether's "face" — the Syncratic logo, alive. The SVG is used as a CSS mask
// over an animated multi-colour gradient (so the mark gradients through colours),
// gently drifting within the bar and wobbling side-to-side on its axis. Pure CSS;
// base-path-safe via asset(). When Tether is working the motion speeds up.

import { useStore } from '../../store';
import { asset } from '../../utils/asset';

export function TetherFace({ size = 42 }: { size?: number }) {
  const status = useStore((s) => s.tetherStatus);
  const url = asset('/Syncratic-Logo-cropped.svg');
  const lively = status === 'working';

  const mask: React.CSSProperties = {
    width: '100%', height: '100%',
    WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  };

  return (
    <div className="tether-face-drift" style={{ width: size, height: size, animationDuration: lively ? '3.5s' : '7s' }}>
      <div className="tether-face-wobble" style={{ width: '100%', height: '100%', animationDuration: lively ? '1.6s' : '3.4s' }}>
        <div className="tether-face-mask" style={{ ...mask, animationDuration: lively ? '4s' : '8s' }} />
      </div>
    </div>
  );
}

// Inject the keyframes + masked-gradient style once.
if (typeof document !== 'undefined' && !document.getElementById('tether-face-kf')) {
  const el = document.createElement('style');
  el.id = 'tether-face-kf';
  el.textContent = `
    .tether-face-mask {
      background: linear-gradient(120deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6);
      background-size: 300% 300%;
      animation: tether-face-hue 8s ease-in-out infinite;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.12));
    }
    .tether-face-drift { animation: tether-face-drift 7s ease-in-out infinite; will-change: transform; }
    .tether-face-wobble { animation: tether-face-wobble 3.4s ease-in-out infinite; will-change: transform; }
    @keyframes tether-face-hue {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes tether-face-drift {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(4px, -3px); }
      50% { transform: translate(-3px, 2px); }
      75% { transform: translate(2px, 4px); }
    }
    @keyframes tether-face-wobble {
      0%, 100% { transform: rotate(-8deg); }
      50% { transform: rotate(8deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tether-face-drift, .tether-face-wobble, .tether-face-mask { animation: none !important; }
    }
  `;
  document.head.appendChild(el);
}
