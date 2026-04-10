import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getSpecies } from '../store/monsterSlice';
import { getMonsterMood, getMoodLabel, xpForLevel, calcHp, calcStat } from '../utils/monsterMath';
import { MonsterSprite } from './MonsterSprite';
import type { OwnedMonster } from '../types/monsters';

const TYPE_COLORS: Record<string, string> = {
  fire: '#ff6b35', water: '#4a90d9', grass: '#5cb85c', electric: '#f0ad4e',
  dark: '#6f42c1', light: '#ffd700', earth: '#8b5e3c', wind: '#5bc0de',
  poison: '#9b59b6', psychic: '#e91e63',
};

function MonsterCard({ mon, isActive, onSelect }: {
  mon: OwnedMonster;
  isActive: boolean;
  onSelect: () => void;
}) {
  const species = getSpecies(mon.speciesId);
  const stageData = species?.stages.find(s => s.stage === mon.stage);
  const mood = getMonsterMood(mon);
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
        <MonsterSprite
          frames={stageData?.idleFrames ?? []}
          fallbackSprite={stageData?.sprite ?? undefined}
          fps={6} size={48}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>
          {mon.nickname ?? stageData?.name ?? species?.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            padding: '1px 5px', borderRadius: 3,
            background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44`,
          }}>{species?.type}</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Lv.{mon.level}</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Stage {mon.stage}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{getMoodLabel(mood)}</div>
      </div>
      {isActive && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(140,60%,50%)', flexShrink: 0 }} />
      )}
    </motion.div>
  );
}

function MonsterDetail({ mon }: { mon: OwnedMonster }) {
  const species = getSpecies(mon.speciesId);
  const stageData = species?.stages.find(s => s.stage === mon.stage);
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(mon.nickname ?? '');
  const nicknameMonster = useStore(s => s.nicknameMonster);
  const setActiveMonster = useStore(s => s.setActiveMonster);
  const startBattle = useStore(s => s.startBattle);
  const setShowBattle = useStore(s => s.setShowBattle);
  const monster = useStore(s => s.monster);

  if (!species) return null;

  const typeColor = TYPE_COLORS[species.type] ?? '#aaa';
  const evolveData = species.stages.find(s => s.stage === mon.stage);
  const nextStage = species.stages.find(s => s.stage === mon.stage + 1);
  const xpForNextLevel = xpForLevel(mon.level + 1);
  const xpThisLevel = xpForLevel(mon.level);
  const xpProgress = mon.level >= 100 ? 100 : Math.min(100, ((mon.xp - xpThisLevel) / (xpForNextLevel - xpThisLevel)) * 100);

  const hp = calcHp(species.baseStats.hp, mon.level);
  const atk = calcStat(species.baseStats.atk, mon.level);
  const def = calcStat(species.baseStats.def, mon.level);
  const spd = calcStat(species.baseStats.spd, mon.level);
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
      {/* Sprite + name */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', borderRadius: 16, padding: 16, marginBottom: 10 }}>
          <MonsterSprite
            frames={stageData?.idleFrames ?? []}
            fallbackSprite={stageData?.sprite ?? undefined}
            fps={8} size={96}
          />
        </div>

        {/* Nickname */}
        {editingNick ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
            <input
              value={nickInput}
              onChange={e => setNickInput(e.target.value)}
              autoFocus maxLength={16}
              style={{ fontSize: 14, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', width: 120 }}
              onKeyDown={e => {
                if (e.key === 'Enter') { nicknameMonster(mon.uid, nickInput); setEditingNick(false); }
                if (e.key === 'Escape') setEditingNick(false);
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => { nicknameMonster(mon.uid, nickInput); setEditingNick(false); }}>Save</button>
          </div>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}
            onDoubleClick={() => setEditingNick(true)} title="Double-click to rename">
            {mon.nickname ?? stageData?.name ?? species.name}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
          <span style={{ padding: '1px 7px', borderRadius: 10, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44`, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
            {species.type}
          </span>
          <span>Lv. {mon.level}</span>
          <span>Stage {mon.stage}/{species.stages.length}</span>
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            <span>XP</span>
            <span>{mon.xp - xpThisLevel} / {xpForNextLevel - xpThisLevel}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${xpProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), hsl(210,80%,65%))', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Evolution progress */}
        {nextStage && evolveData?.evolveAt && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            Evolves into <strong style={{ color: 'var(--text-primary)' }}>{nextStage.name}</strong> at Lv.{evolveData.evolveAt}
            {mon.level < evolveData.evolveAt && (
              <span style={{ color: 'hsl(210,70%,55%)' }}> ({evolveData.evolveAt - mon.level} levels away)</span>
            )}
          </div>
        )}
      </div>

      {/* Battle stats */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>Stats</div>
        {statBar('HP', hp, 'hsl(140,60%,50%)')}
        {statBar('ATK', atk, 'hsl(0,72%,55%)')}
        {statBar('DEF', def, 'hsl(210,70%,55%)')}
        {statBar('SPD', spd, 'hsl(50,80%,55%)')}
      </div>

      {/* Tamagotchi stats */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-tertiary)', marginBottom: 10 }}>Wellbeing</div>
        {statBar('Hunger', mon.hunger, 'hsl(30,80%,55%)')}
        {statBar('Happiness', mon.happiness, 'hsl(280,60%,60%)')}
        {statBar('Energy', mon.energy, 'hsl(210,70%,55%)')}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setActiveMonster(mon.uid)}>
          Set Active
        </button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => {
          const opponentUid = Object.keys(monster.collection).find(u => u !== mon.uid);
          if (opponentUid) { startBattle(mon.uid, opponentUid); setShowBattle(true); }
        }}>
          Battle
        </button>
      </div>
    </div>
  );
}

export function MonsterCollection() {
  const monster = useStore(s => s.monster);
  const setShowCollection = useStore(s => s.setShowCollection);
  const [selectedUid, setSelectedUid] = useState<string | null>(monster.activeMonsterUid);

  const monsters = Object.values(monster.collection);
  const selected = selectedUid ? monster.collection[selectedUid] : null;

  return (
    <AnimatePresence>
      {monster.showCollection && (
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
            {/* Header */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Monster Collection</h2>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {monsters.length} monster{monsters.length !== 1 ? 's' : ''} · {monster.totalBattlesWon}W / {monster.totalBattlesLost}L
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCollection(false)}>Close</button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* List */}
              <div style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {monsters.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>No monsters yet.</div>
                ) : (
                  monsters.map(mon => (
                    <MonsterCard
                      key={mon.uid}
                      mon={mon}
                      isActive={mon.uid === monster.activeMonsterUid}
                      onSelect={() => setSelectedUid(mon.uid)}
                    />
                  ))
                )}
              </div>

              {/* Detail */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {selected ? (
                  <MonsterDetail key={selected.uid} mon={selected} />
                ) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                    Select a monster to view details
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
