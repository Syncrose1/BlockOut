import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getSpecies } from '../store/synamonSlice';
import { getSynamonMood, getMoodLabel, xpForLevel } from '../utils/synamonMath';
import { SynamonSprite } from './SynamonSprite';
import { SynamonCollection } from './SynamonCollection';
import { BattleModal } from './BattleModal';

function StatBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const hue = pct > 50 ? color : pct > 25 ? 'hsl(40,80%,55%)' : 'hsl(0,72%,55%)';
  return (
    <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%', background: hue, borderRadius: 2,
        transition: 'width 0.4s ease, background 0.4s ease',
      }} />
    </div>
  );
}

function XpBar({ xp, level }: { xp: number; level: number }) {
  const thisLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const pct = level >= 100 ? 100 : Math.min(100, ((xp - thisLevelXp) / (nextLevelXp - thisLevelXp)) * 100);
  return (
    <div style={{ height: 3, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: 'linear-gradient(90deg, var(--accent), hsl(210,80%,65%))',
        borderRadius: 2, transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

export function SynamonWidget() {
  const synamonState = useStore(s => s.synamon);
  const catchSynamon = useStore(s => s.catchSynamon);
  const feedActiveSynamon = useStore(s => s.feedActiveSynamon);
  const playWithActiveSynamon = useStore(s => s.playWithActiveSynamon);
  const setSynamonWidgetOpen = useStore(s => s.setSynamonWidgetOpen);
  const setSynamonWidgetPosition = useStore(s => s.setSynamonWidgetPosition);
  const setShowCollection = useStore(s => s.setShowCollection);
  const setShowBattle = useStore(s => s.setShowBattle);
  const clearPendingXp = useStore(s => s.clearPendingXp);
  const confirmEvolution = useStore(s => s.confirmEvolution);
  const tickSynamonDecay = useStore(s => s.tickSynamonDecay);

  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startMouseX: number; startMouseY: number } | null>(null);
  const [xpFlash, setXpFlash] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    tickSynamonDecay();
    const interval = setInterval(tickSynamonDecay, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [tickSynamonDecay]);

  useEffect(() => {
    if (synamonState.pendingXpGain > 0) {
      setXpFlash(synamonState.pendingXpGain);
      const t = setTimeout(() => { setXpFlash(null); clearPendingXp(); }, 2000);
      return () => clearTimeout(t);
    }
  }, [synamonState.pendingXpGain, clearPendingXp]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      startX: synamonState.widgetX,
      startY: synamonState.widgetY,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
    };
    setIsDragging(true);
    e.preventDefault();
  }, [synamonState.widgetX, synamonState.widgetY]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startMouseX;
      const dy = e.clientY - dragRef.current.startMouseY;
      setSynamonWidgetPosition(
        dragRef.current.startX + dx,
        dragRef.current.startY + dy,
      );
    };
    const onMouseUp = () => { dragRef.current = null; setIsDragging(false); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [setSynamonWidgetPosition]);

  const activeSyn = synamonState.activeUid ? synamonState.collection[synamonState.activeUid] : null;
  const species = activeSyn ? getSpecies(activeSyn.speciesId) : null;
  const stageData = activeSyn && species ? species.stages.find(s => s.stage === activeSyn.stage) : null;
  const mood = activeSyn ? getSynamonMood(activeSyn) : null;

  const toggleBtn = (
    <motion.button
      className="synamon-widget-toggle"
      onClick={() => setSynamonWidgetOpen(!synamonState.widgetOpen)}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      title="Synamon"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', zIndex: 9000, fontSize: 22,
        color: 'var(--text-primary)',
      }}
    >
      {/* Pokéball-style icon */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="var(--bg-secondary)"/>
      </svg>
    </motion.button>
  );

  // Starter chooser
  if (!synamonState.starterChosen) {
    return (
      <>
        {toggleBtn}
        <AnimatePresence>
          {synamonState.widgetOpen && (
            <motion.div
              className="synamon-widget"
              style={{ left: synamonState.widgetX, top: synamonState.widgetY, width: 220 }}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Choose your starter!</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Your Synamon companion will grow alongside your productivity.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['cindrel', 'aquill', 'brezzet'].map(id => (
                  <button key={id} className="btn btn-ghost btn-sm"
                    style={{ textAlign: 'left' }}
                    onClick={() => { catchSynamon(id); }}>
                    {id.charAt(0).toUpperCase() + id.slice(1)}
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                      {id === 'cindrel' ? 'Ignis / Terra' : id === 'aquill' ? 'Aqua / Flying' : 'Ventus / Flying'}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 10 }}>
                More Synamon discovered as you complete tasks.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (!activeSyn || !species) return toggleBtn;

  return (
    <>
      {toggleBtn}

      {/* Evolution cutscene */}
      <AnimatePresence>
        {synamonState.showEvolution && synamonState.evolutionTarget && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ zIndex: 10010, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.3, 1], opacity: 1 }}
              transition={{ duration: 1.2, times: [0, 0.6, 1] }}
              style={{ textAlign: 'center' }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {activeSyn.nickname ?? stageData?.name} is evolving!
              </div>
              <div style={{
                width: 128, height: 128, margin: '0 auto 16px',
                background: 'white', borderRadius: '50%',
                animation: 'evolve-flash 1.5s ease-in-out infinite alternate',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SynamonSprite
                  frames={stageData?.idleFrames ?? []}
                  fallbackSprite={stageData?.sprite ?? undefined}
                  size={96}
                />
              </div>
              <button className="btn btn-primary" onClick={() => confirmEvolution(synamonState.evolutionTarget!.uid)}>
                Confirm Evolution
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main widget */}
      <AnimatePresence>
        {synamonState.widgetOpen && (
          <motion.div
            ref={widgetRef}
            className="synamon-widget"
            style={{ left: synamonState.widgetX, top: synamonState.widgetY, cursor: isDragging ? 'grabbing' : 'grab' }}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            onMouseDown={onMouseDown}
          >
            {/* Header */}
            <div className="synamon-widget-header">
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeSyn.nickname ?? stageData?.name ?? species.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Lv.{activeSyn.level} · {species.type}{species.secondaryType ? ` / ${species.secondaryType}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="synamon-widget-icon-btn" onClick={() => setShowCollection(true)} title="Collection">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3l-4 4-4-4"/>
                  </svg>
                </button>
                <button className="synamon-widget-icon-btn" onClick={() => setSynamonWidgetOpen(false)} title="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Sprite area */}
            <div className="synamon-widget-sprite-area">
              <SynamonSprite
                frames={stageData?.idleFrames ?? []}
                fallbackSprite={stageData?.sprite ?? undefined}
                fps={8}
                size={80}
              />
              <AnimatePresence>
                {xpFlash && (
                  <motion.div
                    className="synamon-xp-flash"
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -28 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8 }}
                  >
                    +{xpFlash} XP
                  </motion.div>
                )}
              </AnimatePresence>
              {mood && (
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {getMoodLabel(mood)}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="synamon-widget-stats">
              <div className="synamon-stat-row">
                <span>Hunger</span>
                <StatBar value={activeSyn.hunger} color="hsl(30,80%,55%)" />
              </div>
              <div className="synamon-stat-row">
                <span>Happy</span>
                <StatBar value={activeSyn.happiness} color="hsl(280,60%,60%)" />
              </div>
              <div className="synamon-stat-row">
                <span>Energy</span>
                <StatBar value={activeSyn.energy} color="hsl(210,70%,55%)" />
              </div>
              <div className="synamon-stat-row" style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>XP to {activeSyn.level + 1}</span>
                <XpBar xp={activeSyn.xp} level={activeSyn.level} />
              </div>
            </div>

            {/* Actions */}
            <div className="synamon-widget-actions">
              <button className="synamon-action-btn" onClick={feedActiveSynamon} title="Feed">
                🍖 Feed
              </button>
              <button className="synamon-action-btn" onClick={playWithActiveSynamon} title="Play">
                ⚡ Play
              </button>
              <button className="synamon-action-btn" onClick={() => {
                const uids = Object.keys(synamonState.collection).filter(u => u !== activeSyn.uid);
                if (uids.length > 0) setShowBattle(true);
              }} title="Battle">
                ⚔ Battle
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <SynamonCollection />
      <BattleModal />
    </>
  );
}
