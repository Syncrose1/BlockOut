import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getSpecies } from '../store/synamonSlice';
import { getSynamonMood, getMoodLabel, xpForLevel, calcHp, calcStat } from '../utils/synamonMath';
import { SynamonSprite } from './SynamonSprite';
import type { OwnedSynamon } from '../types/synamon';

const TYPE_COLORS: Record<string, string> = {
  Ignis: '#ff6b35', Aqua: '#4a90d9', Terra: '#8b5e3c', Ventus: '#5bc0de',
  Umbra: '#6f42c1', Lux: '#ffd700', Sonus: '#e91e63', Arcanus: '#9b59b6',
  Flying: '#87ceeb', Ferrous: '#aaa', Venom: '#5cb85c', Natura: '#4caf50',
};

function SynamonCard({ syn, isActive, onSelect }: {
  syn: OwnedSynamon;
  isActive: boolean;
  onSelect: () => void;
}) {
  const species = getSpecies(syn.speciesId);
  const stageData = species?.stages.find(s => s.stage === syn.stage);
  const mood = getSynamonMood(syn);
  const typeColor = TYPE_COLORS[species?.type ?? ''] ?? '#aaa';

  return (
    <motion.div
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{
        padding: 12, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        background: isActive ? 'hsla(210,80%,55%,0.1)' : 'var(--bg-tertiary)',
        border: `1px solid ${isActive ? 'hsla(210,80%,55%,0.4)' : 'transparent'}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{ flexShrink: 0, background: 'var(--bg-primary)', borderRadius: 8, padding: 4 }}>
        <SynamonSprite
          frames={stageData?.idleFrames ?? []}
          fallbackSprite={stageData?.sprite ?? undefined}
          fps={6} size={48}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>
          {syn.nickname ?? stageData?.name ?? species?.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            padding: '1px 5px', borderRadius: 3,
            background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44`,
          }}>{species?.type}</span>
          {species?.secondaryType && (
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              padding: '1px 5px', borderRadius: 3,
              background: `${TYPE_COLORS[species.secondaryType] ?? '#aaa'}22`,
              color: TYPE_COLORS[species.secondaryType] ?? '#aaa',
              border: `1px solid ${TYPE_COLORS[species.secondaryType] ?? '#aaa'}44`,
            }}>{species.secondaryType}</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Lv.{syn.level}</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Stage {syn.stage}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{getMoodLabel(mood)}</div>
      </div>
      {isActive && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(140,60%,50%)', flexShrink: 0 }} />
      )}
    </motion.div>
  );
}

function SynamonDetail({ syn }: { syn: OwnedSynamon }) {
  const species = getSpecies(syn.speciesId);
  const stageData = species?.stages.find(s => s.stage === syn.stage);
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(syn.nickname ?? '');
  const nicknameSynamon = useStore(s => s.nicknameSynamon);
  const setActiveSynamon = useStore(s => s.setActiveSynamon);
  const startBattle = useStore(s => s.startBattle);
  const setShowBattle = useStore(s => s.setShowBattle);
  const synamonState = useStore(s => s.synamon);

  if (!species) return null;

  const typeColor = TYPE_COLORS[species.type] ?? '#aaa';
  const evolveData = species.stages.find(s => s.stage === syn.stage);
  const nextStage = species.stages.find(s => s.stage === syn.stage + 1);
  const xpForNextLevel = xpForLevel(syn.level + 1);
  const xpThisLevel = xpForLevel(syn.level);
  const xpProgress = syn.level >= 100 ? 100 : Math.min(100, ((syn.xp - xpThisLevel) / (xpForNextLevel - xpThisLevel)) * 100);

  const hp = calcHp(species.baseStats.hp, syn.level);
  const atk = calcStat(species.baseStats.atk, syn.level);
  const def = calcStat(species.baseStats.def, syn.level);
  const spd = calcStat(species.baseStats.spd, syn.level);
  const maxStat = Math.max(hp, atk * 2, def * 2, spd * 2, 1);

  const statBar = (label: string, value: number, color: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: 'var(--text-secondary)' }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(value / maxStat) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', borderRadius: 16, padding: 16, marginBottom: 10 }}>
          <SynamonSprite
            frames={stageData?.idleFrames ?? []}
            fallbackSprite={stageData?.sprite ?? undefined}
            fps={8} size={96}
          />
        </div>

        {editingNick ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
            <input
              value={nickInput}
              onChange={e => setNickInput(e.target.value)}
              autoFocus maxLength={16}
              style={{ fontSize: 14, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: 120 }}
              onKeyDown={e => {
                if (e.key === 'Enter') { nicknameSynamon(syn.uid, nickInput); setEditingNick(false); }
                if (e.key === 'Escape') setEditingNick(false);
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => { nicknameSynamon(syn.uid, nickInput); setEditingNick(false); }}>Save</button>
          </div>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}
            onDoubleClick={() => setEditingNick(true)} title="Double-click to rename">
            {syn.nickname ?? stageData?.name ?? species.name}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
          <span style={{ padding: '1px 7px', borderRadius: 10, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44`, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
            {species.type}
          </span>
          {species.secondaryType && (
            <span style={{ padding: '1px 7px', borderRadius: 10, background: `${TYPE_COLORS[species.secondaryType] ?? '#aaa'}22`, color: TYPE_COLORS[species.secondaryType] ?? '#aaa', border: `1px solid ${TYPE_COLORS[species.secondaryType] ?? '#aaa'}44`, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
              {species.secondaryType}
            </span>
          )}
          <span>Lv. {syn.level}</span>
          <span>Stage {syn.stage}/{species.stages.length}</span>
        </div>

        {/* Dex entry */}
        {species.dexEntry && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, textAlign: 'left', fontStyle: 'italic' }}>
            {species.dexEntry}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            <span>XP</span>
            <span>{syn.xp - xpThisLevel} / {xpForNextLevel - xpThisLevel}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${xpProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), hsl(210,80%,65%))', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>

        {nextStage && evolveData?.evolveAt && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            Evolves into <strong style={{ color: 'var(--text-primary)' }}>{nextStage.name}</strong> at Lv.{evolveData.evolveAt}
            {syn.level < evolveData.evolveAt && (
              <span style={{ color: 'hsl(210,70%,55%)' }}> ({evolveData.evolveAt - syn.level} levels away)</span>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>Stats</div>
        {statBar('HP', hp, 'hsl(140,60%,50%)')}
        {statBar('ATK', atk, 'hsl(0,72%,55%)')}
        {statBar('DEF', def, 'hsl(210,70%,55%)')}
        {statBar('SPD', spd, 'hsl(50,80%,55%)')}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>Wellbeing</div>
        {statBar('Hunger', syn.hunger, 'hsl(30,80%,55%)')}
        {statBar('Happiness', syn.happiness, 'hsl(280,60%,60%)')}
        {statBar('Energy', syn.energy, 'hsl(210,70%,55%)')}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setActiveSynamon(syn.uid)}>
          Set Active
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => {
          const opponentUid = Object.keys(synamonState.collection).find(u => u !== syn.uid);
          if (opponentUid) { startBattle(syn.uid, opponentUid); setShowBattle(true); }
        }}>
          Battle
        </button>
      </div>
    </div>
  );
}

export function SynamonCollection() {
  const synamonState = useStore(s => s.synamon);
  const setShowCollection = useStore(s => s.setShowCollection);
  const [selectedUid, setSelectedUid] = useState<string | null>(synamonState.activeUid);

  const synamon = Object.values(synamonState.collection);
  const selected = selectedUid ? synamonState.collection[selectedUid] : null;

  return (
    <AnimatePresence>
      {synamonState.showCollection && (
        <>
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCollection(false)} />
          <motion.div
            className="modal" style={{ maxWidth: 680, width: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Synamon Collection</h2>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {synamon.length} Synamon · {synamonState.totalBattlesWon}W / {synamonState.totalBattlesLost}L
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCollection(false)}>Close</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {synamon.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>No Synamon yet.</div>
                ) : (
                  synamon.map(syn => (
                    <SynamonCard
                      key={syn.uid}
                      syn={syn}
                      isActive={syn.uid === synamonState.activeUid}
                      onSelect={() => setSelectedUid(syn.uid)}
                    />
                  ))
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {selected ? (
                  <SynamonDetail key={selected.uid} syn={selected} />
                ) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                    Select a Synamon to view details
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
