import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { getSpecies } from '../store/synamonSlice';
import { getSynamonMood, getMoodLabel, xpForLevel } from '../utils/synamonMath';
import { SynamonScene } from './SynamonScene';
import type { OwnedSynamon } from '../types/synamon';

const DEFAULT_ZONE = 'aureum-basin';
const SYNAMON_APP_URL = '/synamon/';

function getTimeOfDay(): 'day' | 'dusk' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export function SynamonPanel() {
  const panelOpen = useStore((s) => s.synamon.panelOpen);
  const activeUid = useStore((s) => s.synamon.activeUid);
  const collection = useStore((s) => s.synamon.collection);
  const pendingEvents = useStore((s) => s.synamon.pendingEvents);
  const pendingXpGain = useStore((s) => s.synamon.pendingXpGain);
  const dailyXp = useStore((s) => s.synamon.dailyXp);
  const setSynamonPanelOpen = useStore((s) => s.setSynamonPanelOpen);
  const feedActiveSynamon = useStore((s) => s.feedActiveSynamon);
  const playWithActiveSynamon = useStore((s) => s.playWithActiveSynamon);
  const petActiveSynamon = useStore((s) => s.petActiveSynamon);
  const clearPendingXp = useStore((s) => s.clearPendingXp);
  const computePendingEvents = useStore((s) => s.computePendingEvents);
  const tickSynamonDecay = useStore((s) => s.tickSynamonDecay);

  const synamon = activeUid ? collection[activeUid] as OwnedSynamon | undefined : undefined;
  const species = synamon ? getSpecies(synamon.speciesId) : undefined;
  const stageData = species?.stages.find(s => s.stage === synamon?.stage);

  // Compute pending events on open + tick decay
  useEffect(() => {
    if (panelOpen && synamon) {
      computePendingEvents();
      tickSynamonDecay();
    }
  }, [panelOpen, synamon?.level, synamon?.stage]);

  // Clear XP flash after 2s
  const [showXpFlash, setShowXpFlash] = useState(false);
  useEffect(() => {
    if (pendingXpGain > 0) {
      setShowXpFlash(true);
      const t = setTimeout(() => { setShowXpFlash(false); clearPendingXp(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [pendingXpGain]);

  // Get creature frame paths for the scene
  const creatureFramePaths = useMemo(() => {
    if (!species || !synamon) return [];
    const mood = getSynamonMood(synamon);
    const animKey = `stage${synamon.stage}-${mood}`;
    const frames = species.animations?.[animKey];
    if (Array.isArray(frames) && frames.length) return frames;
    // Fallback to idle
    const idleKey = `stage${synamon.stage}-idle`;
    const idleFrames = species.animations?.[idleKey];
    if (Array.isArray(idleFrames) && idleFrames.length) return idleFrames;
    // Fallback to static sprite
    if (stageData?.sprite) return [stageData.sprite];
    return [];
  }, [species, synamon?.stage, synamon?.hunger, synamon?.happiness, synamon?.energy]);

  if (!synamon || !species) return null;

  const mood = getSynamonMood(synamon);
  const moodLabel = getMoodLabel(mood);
  const name = synamon.nickname || stageData?.name || species.name;
  const zoneKey = synamon.zoneKey || DEFAULT_ZONE;

  // XP progress
  const currentLevelXp = xpForLevel(synamon.level);
  const nextLevelXp = xpForLevel(synamon.level + 1);
  const xpProgress = nextLevelXp > currentLevelXp
    ? (synamon.xp - currentLevelXp) / (nextLevelXp - currentLevelXp) : 1;

  const todayTotal = dailyXp.blockout + dailyXp.synamon;

  return (
    <>
      {/* Backdrop */}
      {panelOpen && (
        <div
          onClick={() => setSynamonPanelOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 9990,
          }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: '50vh',
        maxHeight: 450,
        minHeight: 320,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
        zIndex: 9991,
        transform: panelOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'row',
        overflow: 'hidden',
      }}>
        {/* Close button */}
        <button
          onClick={() => setSynamonPanelOpen(false)}
          style={{
            position: 'absolute', top: 12, right: 16,
            background: 'rgba(0,0,0,0.3)',
            border: 'none', borderRadius: '50%',
            width: 28, height: 28,
            color: 'white', fontSize: 16,
            cursor: 'pointer', zIndex: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          &times;
        </button>

        {/* Pending event banner — spans full width at top */}
        {pendingEvents.length > 0 && (
          <a
            href={SYNAMON_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'block',
              background: 'linear-gradient(135deg, hsl(35, 92%, 45%), hsl(25, 85%, 40%))',
              color: 'white',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              zIndex: 2,
            }}
          >
            {pendingEvents[0].message} →
          </a>
        )}

        {/* XP flash overlay */}
        {showXpFlash && pendingXpGain > 0 && (
          <div style={{
            position: 'absolute', top: pendingEvents.length > 0 ? 48 : 12, left: '50%',
            transform: 'translateX(-50%)',
            background: 'hsl(142, 72%, 50%)',
            color: 'white',
            padding: '4px 14px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            zIndex: 3,
            animation: 'xpFlash 2s ease-out forwards',
            pointerEvents: 'none',
          }}>
            +{pendingXpGain} XP
          </div>
        )}

        {/* Left: Scene — takes ~55% width, full height */}
        <div style={{ flex: '0 0 55%', position: 'relative', overflow: 'hidden' }}>
          <SynamonScene
            zoneKey={zoneKey}
            speciesId={synamon.speciesId}
            stage={synamon.stage}
            timeOfDay={getTimeOfDay()}
            width={Math.round(window.innerWidth * 0.55)}
            height={450}
            showParticles
            showHero
            creatureFramePaths={creatureFramePaths}
          />
        </div>

        {/* Right: Stats + Actions — takes ~45% */}
        <div style={{
          flex: '1 1 45%', padding: '16px 24px',
          overflow: 'auto',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          gap: 10,
        }}>
          {/* Name + Level row */}
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {name}
              </span>
              <span style={{
                fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8,
              }}>
                Stage {synamon.stage} / {species.stages.length}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                Lv. {synamon.level}
              </span>
            </div>
          </div>

          {/* XP bar */}
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3,
            }}>
              <span>XP</span>
              <span>{todayTotal}/150 today</span>
            </div>
            <div style={{
              height: 6, background: 'var(--bg-tertiary)',
              borderRadius: 3, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, xpProgress * 100)}%`,
                height: '100%',
                background: 'hsl(210, 80%, 60%)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          {/* Stat bars — vertical stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StatBar label="Hunger" value={synamon.hunger} color="hsl(35, 92%, 52%)" />
            <StatBar label="Happiness" value={synamon.happiness} color="hsl(340, 72%, 60%)" />
            <StatBar label="Energy" value={synamon.energy} color="hsl(142, 72%, 52%)" />
          </div>

          {/* Mood */}
          <div style={{
            textAlign: 'center',
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            Mood: <span style={{ fontWeight: 600, color: moodColor(mood) }}>{moodLabel}</span>
          </div>

          {/* Care action buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <CareButton label="Feed" icon="🍎" onClick={feedActiveSynamon} />
            <CareButton label="Pet" icon="✋" onClick={petActiveSynamon} />
            <CareButton label="Play" icon="⚽" onClick={playWithActiveSynamon} />
          </div>
        </div>
      </div>

      {/* XP flash animation keyframes */}
      <style>{`
        @keyframes xpFlash {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          70% { opacity: 1; transform: translateX(-50%) translateY(-10px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
      `}</style>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3,
      }}>
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div style={{
        height: 5, background: 'var(--bg-tertiary)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, value)}%`,
          height: '100%',
          background: value < 20 ? 'hsl(0, 72%, 55%)' : color,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function CareButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 18px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-primary)';
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-tertiary)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  );
}

function moodColor(mood: string): string {
  switch (mood) {
    case 'happy': return 'hsl(142, 72%, 55%)';
    case 'content': return 'hsl(210, 60%, 60%)';
    case 'hungry': return 'hsl(35, 92%, 52%)';
    case 'sad': return 'hsl(210, 50%, 50%)';
    case 'exhausted': return 'hsl(0, 60%, 55%)';
    default: return 'var(--text-secondary)';
  }
}
