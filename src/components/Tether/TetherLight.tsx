// The Tether status light — one shared dot used in the Topbar launch button and
// the panel header. Theme-independent fixed colours per the spec:
//   unconfigured → grey (no endpoint)
//   ready        → blue (steady)
//   working      → blue, flashing
//   error        → red, flashing (needs the user to intervene)
// Confirmation / action-required flows are intrusive modals, so the light does
// not signal those.

import { useStore } from '../../store';

const COLORS = {
  unconfigured: '#9ca3af', // grey
  ready: '#3b82f6',        // blue
  working: '#3b82f6',      // blue
  error: '#ef4444',        // red
} as const;

export function TetherLight({ size = 9 }: { size?: number }) {
  const status = useStore((s) => s.tetherStatus);
  const color = COLORS[status];
  const flashing = status === 'working' || status === 'error';
  return (
    <span
      title={`Tether: ${status}`}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: flashing ? 'tether-flash 1s ease-in-out infinite' : 'none',
      }}
    />
  );
}

// Keyframes injected once.
if (typeof document !== 'undefined' && !document.getElementById('tether-light-kf')) {
  const el = document.createElement('style');
  el.id = 'tether-light-kf';
  el.textContent = '@keyframes tether-flash { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }';
  document.head.appendChild(el);
}
