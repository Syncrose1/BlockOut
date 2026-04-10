import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getSpecies } from '../store/monsterSlice';
import { MonsterSprite } from './MonsterSprite';
import type { BattleParticipant } from '../types/monsters';

const TYPE_COLORS: Record<string, string> = {
  fire: '#ff6b35', water: '#4a90d9', grass: '#5cb85c', electric: '#f0ad4e',
  dark: '#6f42c1', light: '#ffd700', earth: '#8b5e3c', wind: '#5bc0de',
  poison: '#9b59b6', psychic: '#e91e63',
};

function BattlerCard({ participant, isPlayer, shaking }: {
  participant: BattleParticipant;
  isPlayer: boolean;
  shaking: boolean;
}) {
  const species = getSpecies(participant.speciesId);
  const stageData = species?.stages.find(s => s.stage === participant.stage);
  const hpPct = Math.max(0, (participant.currentHp / participant.maxHp) * 100);
  const hpColor = hpPct > 50 ? 'hsl(140,60%,50%)' : hpPct > 25 ? 'hsl(40,80%,55%)' : 'hsl(0,72%,55%)';
  const typeColor = TYPE_COLORS[participant.type] ?? '#aaa';

  return (
    <motion.div
      animate={shaking ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
      style={{
        flex: 1, padding: 14, borderRadius: 'var(--radius-sm)',
        background: isPlayer ? 'hsla(210,80%,55%,0.06)' : 'hsla(0,72%,55%,0.06)',
        border: `1px solid ${isPlayer ? 'hsla(210,80%,55%,0.15)' : 'hsla(0,72%,55%,0.15)'}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {isPlayer ? 'Your Monster' : 'Opponent'}
      </div>

      <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', borderRadius: 12, padding: 10, marginBottom: 8 }}>
        <MonsterSprite
          frames={stageData?.attackFrames?.length ? stageData.attackFrames : (stageData?.idleFrames ?? [])}
          fallbackSprite={stageData?.sprite ?? undefined}
          fps={10} size={64}
          style={{ transform: isPlayer ? 'scaleX(1)' : 'scaleX(-1)' }}
        />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
        {participant.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, background: `${typeColor}22`, color: typeColor }}>
          {participant.type}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Lv.{participant.level}</span>
      </div>

      {/* HP bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>
          <span>HP</span>
          <span>{participant.currentHp}/{participant.maxHp}</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${hpPct}%`, height: '100%', background: hpColor, borderRadius: 4, transition: 'width 0.4s ease, background 0.4s ease' }} />
        </div>
      </div>

      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
        <span>ATK {participant.atk}</span>
        <span>DEF {participant.def}</span>
        <span>SPD {participant.spd}</span>
      </div>
    </motion.div>
  );
}

export function BattleModal() {
  const monster = useStore(s => s.monster);
  const setShowBattle = useStore(s => s.setShowBattle);
  const executeBattleTurn = useStore(s => s.executeBattleTurn);
  const endBattle = useStore(s => s.endBattle);
  const startBattle = useStore(s => s.startBattle);
  const activeMonsterUid = monster.activeMonsterUid;

  const [opponentUid, setOpponentUid] = useState<string | null>(null);
  const [shakingUid, setShakingUid] = useState<string | null>(null);
  const [autoFight, setAutoFight] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const battle = monster.battle;
  const opponents = Object.keys(monster.collection).filter(u => u !== activeMonsterUid);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log.length]);

  // Auto-fight
  useEffect(() => {
    if (!autoFight || battle.outcome !== 'ongoing' || !battle.isActive) {
      if (autoRef.current) clearInterval(autoRef.current);
      return;
    }
    autoRef.current = setInterval(() => {
      executeBattleTurn();
    }, 900);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoFight, battle.outcome, battle.isActive, executeBattleTurn]);

  // Shake on damage
  useEffect(() => {
    const lastEvent = battle.log[battle.log.length - 1];
    if (lastEvent?.type === 'attack' || lastEvent?.type === 'super_effective' || lastEvent?.type === 'not_very_effective') {
      setShakingUid(lastEvent.targetUid);
      const t = setTimeout(() => setShakingUid(null), 450);
      return () => clearTimeout(t);
    }
  }, [battle.log.length]);

  const setupPhase = !battle.isActive;

  return (
    <AnimatePresence>
      {monster.showBattle && (
        <>
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (battle.outcome !== 'ongoing') { endBattle(); } else setShowBattle(false); }}
          />
          <motion.div
            className="modal" style={{ maxWidth: 560, width: '90vw', padding: 0, overflow: 'hidden' }}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {setupPhase ? 'Choose Opponent' : battle.outcome === 'ongoing' ? `Turn ${battle.turn}` : battle.outcome === 'player_win' ? 'Victory!' : 'Defeated!'}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => { endBattle(); }}>Close</button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Setup: pick opponent */}
              {setupPhase ? (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Choose a monster to battle against:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {opponents.map(uid => {
                      const mon = monster.collection[uid];
                      const sp = getSpecies(mon.speciesId);
                      const sd = sp?.stages.find(s => s.stage === mon.stage);
                      return (
                        <div key={uid}
                          onClick={() => setOpponentUid(uid)}
                          style={{
                            padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            border: `1px solid ${opponentUid === uid ? 'var(--accent)' : 'var(--border)'}`,
                            background: opponentUid === uid ? 'hsla(210,80%,55%,0.08)' : 'var(--bg-tertiary)',
                            display: 'flex', alignItems: 'center', gap: 12,
                          }}
                        >
                          <MonsterSprite frames={sd?.idleFrames ?? []} fallbackSprite={sd?.sprite ?? undefined} fps={6} size={40} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{mon.nickname ?? sd?.name ?? sp?.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Lv.{mon.level} · {sp?.type}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {opponents.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
                      You need at least 2 monsters to battle. Catch more!
                    </div>
                  )}
                  {opponentUid && (
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}
                      onClick={() => { if (activeMonsterUid && opponentUid) startBattle(activeMonsterUid, opponentUid); }}>
                      Start Battle!
                    </button>
                  )}
                </div>
              ) : (
                /* Battle in progress / result */
                <div>
                  {/* Battlers */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    {battle.player && (
                      <BattlerCard
                        participant={battle.player}
                        isPlayer
                        shaking={shakingUid === battle.player.uid}
                      />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 18, fontWeight: 700, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      vs
                    </div>
                    {battle.opponent && (
                      <BattlerCard
                        participant={battle.opponent}
                        isPlayer={false}
                        shaking={shakingUid === battle.opponent.uid}
                      />
                    )}
                  </div>

                  {/* Battle log */}
                  <div ref={logRef} style={{
                    height: 120, overflowY: 'auto', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                    marginBottom: 14,
                  }}>
                    {battle.log.length === 0 && (
                      <span style={{ color: 'var(--text-tertiary)' }}>Battle begins!</span>
                    )}
                    {battle.log.map((event, i) => (
                      <div key={i} style={{
                        color: event.type === 'fainted' ? 'hsl(0,72%,55%)' :
                               event.type === 'super_effective' ? 'hsl(40,80%,55%)' :
                               'var(--text-secondary)',
                      }}>
                        {event.message}
                      </div>
                    ))}
                  </div>

                  {/* Controls */}
                  {battle.outcome === 'ongoing' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={executeBattleTurn}>
                        Attack
                      </button>
                      <button
                        className={`btn btn-ghost`}
                        style={{ minWidth: 90, background: autoFight ? 'hsla(210,80%,55%,0.15)' : undefined }}
                        onClick={() => setAutoFight(f => !f)}
                      >
                        {autoFight ? 'Stop Auto' : 'Auto'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: 15, fontWeight: 700, marginBottom: 8,
                        color: battle.outcome === 'player_win' ? 'hsl(140,60%,50%)' : 'hsl(0,72%,55%)',
                      }}>
                        {battle.outcome === 'player_win' ? `You won! +${battle.xpReward} XP` : `You lost! +${Math.floor(battle.xpReward * 0.3)} XP consolation`}
                      </div>
                      <button className="btn btn-primary" onClick={endBattle}>Continue</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
