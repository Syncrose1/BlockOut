import type { CoFocusParticipant } from '../types/coFocus';

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const modeColors: Record<string, string> = {
  work: 'hsl(0, 72%, 55%)',
  break: 'hsl(142, 72%, 50%)',
  longBreak: 'hsl(210, 72%, 55%)',
};

export function CoFocusParticipantCard({
  participant,
  isHost,
}: {
  participant: CoFocusParticipant;
  isHost?: boolean;
}) {
  const color = modeColors[participant.timerMode] || 'var(--text-tertiary)';

  return (
    <div style={{
      flex: '0 0 auto',
      width: 130,
      padding: '10px 12px',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column',
      gap: 6,
    }}>
      {/* Name + host badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 12, fontWeight: 600,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        {participant.displayName || 'Anonymous'}
        {isHost && (
          <span style={{
            fontSize: 9, padding: '1px 5px',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: 4, fontWeight: 700,
            flexShrink: 0,
          }}>HOST</span>
        )}
      </div>

      {/* Timer ring + time */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {/* Mini timer indicator */}
        <div style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: participant.isRunning ? color : 'var(--border)',
          boxShadow: participant.isRunning ? `0 0 6px ${color}` : 'none',
          transition: 'all 0.3s',
        }} />
        <span style={{
          fontSize: 16, fontWeight: 700,
          color: participant.isRunning ? color : 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatTime(participant.timeRemaining)}
        </span>
      </div>

      {/* Mode label */}
      <div style={{
        fontSize: 10, color: 'var(--text-tertiary)',
        textTransform: 'capitalize',
      }}>
        {participant.timerMode === 'longBreak' ? 'Long Break' : participant.timerMode}
        {participant.isRunning ? '' : ' (paused)'}
      </div>

      {/* Sessions today */}
      {participant.sessionsCompletedToday > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {participant.sessionsCompletedToday} sessions today
        </div>
      )}

      {/* Synamon mood */}
      {participant.synamonMood && (
        <div style={{
          fontSize: 10, color: 'var(--text-tertiary)',
          fontStyle: 'italic',
        }}>
          {participant.synamonMood}
        </div>
      )}

      {/* Task chain progress */}
      {participant.taskChainVisible && participant.taskChainSteps && (
        <div style={{ marginTop: 2 }}>
          {participant.taskChainSteps.slice(0, 4).map((step, i) => (
            <div key={i} style={{
              fontSize: 10,
              color: step.completed ? 'hsl(142, 60%, 50%)' : 'var(--text-tertiary)',
              textDecoration: step.completed ? 'line-through' : 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}>
              {step.completed ? '\u2713' : '\u25CB'} {step.title}
            </div>
          ))}
          {participant.taskChainSteps.length > 4 && (
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              +{participant.taskChainSteps.length - 4} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
