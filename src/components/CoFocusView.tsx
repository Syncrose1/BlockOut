import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { getSpecies } from '../store/synamonSlice';
import { CoFocusParticipantHUD } from './CoFocusParticipantHUD';
import { CoFocusChat } from './CoFocusChat';
import { CoFocusScene } from './CoFocusScene';
import { CoFocusInviteModal } from './CoFocusInviteModal';
import { useIsMobile } from '../hooks/useIsMobile';
import * as audio from '../utils/coFocusAudio';
import { broadcastSceneChange } from '../utils/coFocusRealtime';
import type { AmbientLayerConfig, AmbientVariant } from '../utils/coFocusAudio';

// ─── Scene data type ────────────────────────────────────────────────────────
interface SceneOption {
  key: string;
  name: string;
  plate: string;
  audio?: AmbientLayerConfig[];
}

let scenesListCache: SceneOption[] | null = null;
async function loadScenesList(): Promise<SceneOption[]> {
  if (scenesListCache) return scenesListCache;
  const res = await fetch('/cofocus/scenes.json');
  const json = await res.json();
  scenesListCache = (json.scenes as any[]).map(s => ({
    key: s.key, name: s.name, plate: s.plate, audio: s.audio,
  }));
  return scenesListCache!;
}

export function CoFocusView() {
  const activeSessionId = useStore((s) => s.coFocus.activeSessionId);
  const isHost = useStore((s) => s.coFocus.isHost);
  const sessionTimerMode = useStore((s) => s.coFocus.sessionTimerMode);
  const sessionInviteCode = useStore((s) => s.coFocus.sessionInviteCode);
  const sessionSceneKey = useStore((s) => s.coFocus.sessionSceneKey);
  const sessionHostId = useStore((s) => s.coFocus.sessionHostId);
  const participants = useStore((s) => s.coFocus.participants);
  const chatOpen = useStore((s) => s.coFocus.chatOpen);
  const unreadCount = useStore((s) => s.coFocus.unreadCount);
  const myDisplayName = useStore((s) => s.coFocus.myDisplayName);
  const myInviteCode = useStore((s) => s.coFocus.myInviteCode);
  const friends = useStore((s) => s.coFocus.friends);

  // Audio state
  const audioNoiseType = useStore((s) => s.coFocus.audioNoiseType);
  const audioNoiseVolume = useStore((s) => s.coFocus.audioNoiseVolume);
  const audioAmbientOn = useStore((s) => s.coFocus.audioAmbientOn);
  const audioAmbientVolume = useStore((s) => s.coFocus.audioAmbientVolume);
  const noiseLowCut = useStore((s) => s.coFocus.noiseLowCut);
  const noiseHighCut = useStore((s) => s.coFocus.noiseHighCut);
  const setAudioNoiseType = useStore((s) => s.setAudioNoiseType);
  const setAudioNoiseVolume = useStore((s) => s.setAudioNoiseVolume);
  const setAudioAmbientOn = useStore((s) => s.setAudioAmbientOn);
  const setAudioAmbientVolume = useStore((s) => s.setAudioAmbientVolume);
  const setNoiseLowCut = useStore((s) => s.setNoiseLowCut);
  const setNoiseHighCut = useStore((s) => s.setNoiseHighCut);

  // Visual state
  const sceneBlur = useStore((s) => s.coFocus.sceneBlur);
  const creatureBlurEnabled = useStore((s) => s.coFocus.creatureBlurEnabled);
  const setSceneBlur = useStore((s) => s.setSceneBlur);
  const setCreatureBlurEnabled = useStore((s) => s.setCreatureBlurEnabled);

  // Task chain sharing
  const taskChainSharing = useStore((s) => s.coFocus.taskChainSharing);
  const setTaskChainSharing = useStore((s) => s.setTaskChainSharing);

  // Invites
  const pendingInvites = useStore((s) => s.coFocus.pendingInvites);
  const setShowInviteModal = useStore((s) => s.setShowInviteModal);
  const changeSessionTimerMode = useStore((s) => s.changeSessionTimerMode);

  const setShowSessionModal = useStore((s) => s.setShowSessionModal);
  const setShowFriendModal = useStore((s) => s.setShowFriendModal);
  const leaveSession = useStore((s) => s.leaveSession);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const updateCoFocusDisplayName = useStore((s) => s.updateCoFocusDisplayName);

  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [fadingOut, setFadingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });
  // Track selected audio variant per scene (persisted in localStorage)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cofocus-audio-variants') || '{}');
    } catch { return {}; }
  });

  const btnSize = isMobile ? 44 : 36;

  // Load scene list
  useEffect(() => {
    loadScenesList().then(setScenes);
  }, []);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({
          w: Math.round(e.contentRect.width),
          h: Math.round(e.contentRect.height),
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Sync name input when store changes
  useEffect(() => { setNameInput(myDisplayName); }, [myDisplayName]);

  // ─── Audio engine wiring ──────────────────────────────────────────────────
  useEffect(() => {
    audio.setNoiseType(audioNoiseType);
  }, [audioNoiseType]);

  useEffect(() => {
    audio.setNoiseVolume(audioNoiseVolume);
  }, [audioNoiseVolume]);

  useEffect(() => {
    audio.setNoiseParams({ lowCut: noiseLowCut, highCut: noiseHighCut });
  }, [noiseLowCut, noiseHighCut]);

  useEffect(() => {
    audio.setAmbientOn(audioAmbientOn);
  }, [audioAmbientOn]);

  useEffect(() => {
    audio.setAmbientVolume(audioAmbientVolume);
  }, [audioAmbientVolume]);

  // Load ambient audio for current scene (with variant overrides)
  useEffect(() => {
    const scene = scenes.find(s => s.key === sessionSceneKey);
    if (scene?.audio && audioAmbientOn) {
      // Apply selected variant overrides to sample layers
      const configs = scene.audio.map(cfg => {
        if (cfg.type === 'sample' && cfg.variants && cfg.variants.length > 0) {
          const selectedSrc = selectedVariants[sessionSceneKey];
          if (selectedSrc) {
            return { ...cfg, src: selectedSrc };
          }
        }
        return cfg;
      });
      audio.loadAmbientForScene(configs);
      audio.setAmbientVolume(audioAmbientVolume);
    } else {
      audio.loadAmbientForScene([]);
    }
  }, [sessionSceneKey, scenes, audioAmbientOn, selectedVariants]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { audio.cleanup(); };
  }, []);

  // ─── Tab close: untrack presence ──────────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId) return;
    const handleBeforeUnload = () => {
      import('../utils/coFocusRealtime').then(rt => rt.unsubscribeFromSession());
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeSessionId]);

  // ─── Mobile: mutual exclusion of sidebar/chat ────────────────────────────
  const toggleSidebar = useCallback(() => {
    if (!sidebarOpen && isMobile && chatOpen) setChatOpen(false);
    setSidebarOpen(o => !o);
  }, [sidebarOpen, isMobile, chatOpen, setChatOpen]);

  const toggleChat = useCallback(() => {
    if (!chatOpen && isMobile && sidebarOpen) setSidebarOpen(false);
    setChatOpen(!chatOpen);
  }, [chatOpen, isMobile, sidebarOpen, setChatOpen]);

  // Build creature data for the scene (with extended display info)
  const sceneCreatures = useMemo(() => {
    return Object.values(participants)
      .filter(p => p.synamonSpeciesId)
      .map(p => {
        const species = getSpecies(p.synamonSpeciesId!);
        const stage = p.synamonStage || 1;
        const animKey = `stage${stage}-idle`;
        const frames = species?.animations?.[animKey] || [];
        const staticSprite = species?.stages.find(s => s.stage === stage)?.sprite;
        return {
          slotIndex: p.slotIndex,
          framePaths: frames.length > 0 ? frames : (staticSprite ? [staticSprite] : []),
          stage,
          displayName: p.displayName,
          isRunning: p.isRunning,
          lastTaskCompletedAt: p.lastTaskCompletedAt,
        };
      })
      .filter(c => c.framePaths.length > 0);
  }, [participants]);

  const participantList = useMemo(() => {
    const list = Object.values(participants);
    list.sort((a, b) => a.slotIndex - b.slotIndex);
    return list;
  }, [participants]);

  const handleCopyCode = useCallback(() => {
    if (sessionInviteCode) {
      navigator.clipboard.writeText(sessionInviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }, [sessionInviteCode]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== myDisplayName) {
      await updateCoFocusDisplayName(trimmed);
    }
    setEditingName(false);
  }, [nameInput, myDisplayName, updateCoFocusDisplayName]);

  const handleSceneChange = useCallback((newKey: string) => {
    if (newKey === sessionSceneKey) return;
    setFadingOut(true);
    setTimeout(() => {
      useStore.setState(s => ({
        coFocus: { ...s.coFocus, sessionSceneKey: newKey },
      }));
      // Broadcast scene change to all participants
      broadcastSceneChange(newKey);
      setFadingOut(false);
    }, 600);
  }, [sessionSceneKey]);

  const pendingRequests = friends.filter(f => f.status === 'pending' && f.direction === 'incoming').length;

  const myUserId = useStore((s) => {
    for (const [, p] of Object.entries(s.coFocus.participants)) {
      if (p.displayName === s.coFocus.myDisplayName) return p.userId;
    }
    return null;
  });

  // ─── Section label helper ─────────────────────────────────────────────────
  const sectionLabel = (text: string) => (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600,
      color: 'var(--text-tertiary)', marginBottom: 6,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{text}</label>
  );

  // ─── Sidebar content (shared between desktop and mobile) ──────────────────
  const sidebarContent = (
    <div style={{
      flex: 1, overflow: 'auto',
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Display name */}
      <div>
        {sectionLabel('Display Name')}
        {editingName ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              maxLength={20}
              style={{
                flex: 1, padding: '6px 10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={handleSaveName}
              style={{
                padding: '6px 10px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'white', fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
              }}
            >Save</button>
          </div>
        ) : (
          <button
            onClick={() => { setNameInput(myDisplayName); setEditingName(true); }}
            style={{
              width: '100%', textAlign: 'left',
              padding: '6px 10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {myDisplayName || 'Set display name...'}
          </button>
        )}
      </div>

      {/* Session actions */}
      <div>
        {sectionLabel('Session')}
        {!activeSessionId ? (
          <button
            onClick={() => setShowSessionModal(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >Create or Join Session</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessionInviteCode && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Invite Code</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                    {sessionInviteCode}
                  </div>
                </div>
                <button
                  onClick={handleCopyCode}
                  style={{
                    padding: '4px 10px',
                    background: codeCopied ? 'hsl(142, 72%, 45%)' : 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: codeCopied ? 'white' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >{codeCopied ? 'Copied!' : 'Copy'}</button>
              </div>
            )}
            {/* Timer mode switcher */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              {(['shared', 'independent'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => changeSessionTimerMode(m)}
                  style={{
                    flex: 1, padding: '6px 8px',
                    background: sessionTimerMode === m ? 'var(--accent)' : 'var(--bg-primary)',
                    border: `1px solid ${sessionTimerMode === m ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: sessionTimerMode === m ? 'white' : 'var(--text-tertiary)',
                    fontSize: 10, fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >{m === 'shared' ? 'Shared' : 'Independent'}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Participants: {participantList.length}/5
            </div>
            <button
              onClick={leaveSession}
              style={{
                padding: '8px 16px',
                background: 'hsl(0, 40%, 20%)',
                border: '1px solid hsl(0, 40%, 35%)',
                borderRadius: 'var(--radius-md)',
                color: 'hsl(0, 72%, 70%)',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >{isHost ? 'End Session' : 'Leave Session'}</button>
          </div>
        )}
      </div>

      {/* Friends */}
      <div>
        {sectionLabel('Social')}
        <button
          onClick={() => setShowFriendModal(true)}
          style={{
            position: 'relative',
            width: '100%',
            padding: '10px 16px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Friends
          {pendingRequests > 0 && (
            <span style={{
              position: 'absolute', top: 8, right: 12,
              background: 'hsl(0, 72%, 55%)',
              color: 'white',
              fontSize: 9, fontWeight: 700,
              minWidth: 16, height: 16,
              borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px',
            }}>{pendingRequests}</span>
          )}
        </button>
        {/* Task chain sharing toggle */}
        <div style={{
          marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Share Task Chain</span>
          <button
            onClick={() => {
              const next = !taskChainSharing;
              setTaskChainSharing(next);
              localStorage.setItem('cofocus-taskchain-sharing', String(next));
            }}
            style={{
              padding: '3px 10px',
              background: taskChainSharing ? 'var(--accent)' : 'var(--bg-tertiary)',
              border: `1px solid ${taskChainSharing ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: taskChainSharing ? 'white' : 'var(--text-tertiary)',
              fontSize: 10, fontWeight: 600,
              cursor: 'pointer',
            }}
          >{taskChainSharing ? 'On' : 'Off'}</button>
        </div>
      </div>

      {/* Scene switcher */}
      <div>
        {sectionLabel('Environment')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {scenes.map(scene => (
            <button
              key={scene.key}
              onClick={() => handleSceneChange(scene.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                background: scene.key === sessionSceneKey ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: `1px solid ${scene.key === sessionSceneKey ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                color: scene.key === sessionSceneKey ? 'white' : 'var(--text-primary)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <img
                src={scene.plate}
                alt=""
                style={{
                  width: 48, height: 22,
                  objectFit: 'cover',
                  borderRadius: 3,
                  imageRendering: 'pixelated',
                  flexShrink: 0,
                }}
              />
              {scene.name}
            </button>
          ))}
        </div>
      </div>

      {/* Visual controls */}
      <div>
        {sectionLabel('Visual')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>
              Scene Blur ({sceneBlur.toFixed(1)}px)
            </div>
            <input
              type="range" min="0" max="5" step="0.1"
              value={sceneBlur}
              onChange={(e) => setSceneBlur(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Blur creatures</span>
            <button
              onClick={() => setCreatureBlurEnabled(!creatureBlurEnabled)}
              style={{
                padding: '3px 10px',
                background: creatureBlurEnabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: `1px solid ${creatureBlurEnabled ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: creatureBlurEnabled ? 'white' : 'var(--text-tertiary)',
                fontSize: 10, fontWeight: 600,
                cursor: 'pointer',
              }}
            >{creatureBlurEnabled ? 'On' : 'Off'}</button>
          </div>
        </div>
      </div>

      {/* Audio controls */}
      <div>
        {sectionLabel('Audio')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Noise type toggle */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Background Noise</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['off', 'white', 'pink', 'brown'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAudioNoiseType(t)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    background: audioNoiseType === t ? 'var(--accent)' : 'var(--bg-tertiary)',
                    border: `1px solid ${audioNoiseType === t ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: audioNoiseType === t ? 'white' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          {/* Noise volume + fine-grained controls — only when noise is enabled */}
          {audioNoiseType !== 'off' && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>Noise Volume</div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={audioNoiseVolume}
                  onChange={(e) => setAudioNoiseVolume(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                  Low Cut ({noiseLowCut}Hz)
                </div>
                <input
                  type="range" min="20" max="2000" step="10"
                  value={noiseLowCut}
                  onChange={(e) => setNoiseLowCut(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                  High Cut ({noiseHighCut >= 20000 ? '20k' : `${Math.round(noiseHighCut / 100) / 10}k`}Hz)
                </div>
                <input
                  type="range" min="200" max="20000" step="100"
                  value={noiseHighCut}
                  onChange={(e) => setNoiseHighCut(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
            </>
          )}
          {/* Scene sounds toggle + volume */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Scene Sounds</span>
            <button
              onClick={() => setAudioAmbientOn(!audioAmbientOn)}
              style={{
                padding: '3px 10px',
                background: audioAmbientOn ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: `1px solid ${audioAmbientOn ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: audioAmbientOn ? 'white' : 'var(--text-tertiary)',
                fontSize: 10, fontWeight: 600,
                cursor: 'pointer',
              }}
            >{audioAmbientOn ? 'On' : 'Off'}</button>
          </div>
          {audioAmbientOn && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>Scene Volume</div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={audioAmbientVolume}
                  onChange={(e) => setAudioAmbientVolume(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
              {/* Audio variant selector — show if current scene has sample layers with variants */}
              {(() => {
                const scene = scenes.find(s => s.key === sessionSceneKey);
                const sampleLayers = scene?.audio?.filter(
                  (a: AmbientLayerConfig) => a.type === 'sample' && a.variants && a.variants.length > 1
                ) || [];
                if (sampleLayers.length === 0) return null;
                const layer = sampleLayers[0];
                const variants = layer.variants!;
                const currentSrc = selectedVariants[sessionSceneKey] || layer.src || variants[0].src;
                return (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>Sound Variant</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {variants.map((v: AmbientVariant) => (
                        <button
                          key={v.src}
                          onClick={() => {
                            const next = { ...selectedVariants, [sessionSceneKey]: v.src };
                            setSelectedVariants(next);
                            localStorage.setItem('cofocus-audio-variants', JSON.stringify(next));
                          }}
                          style={{
                            flex: 1,
                            minWidth: 60,
                            padding: '5px 8px',
                            background: currentSrc === v.src ? 'var(--accent)' : 'var(--bg-tertiary)',
                            border: `1px solid ${currentSrc === v.src ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)',
                            color: currentSrc === v.src ? 'white' : 'var(--text-secondary)',
                            fontSize: 10, fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >{v.label}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* My invite code */}
      {myInviteCode && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11, color: 'var(--text-tertiary)',
        }}>
          <div style={{ marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Friend Code
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
            {myInviteCode}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'hsl(220, 20%, 6%)',
      }}
    >
      {/* Scene canvas — fills entire view */}
      <CoFocusScene
        sceneKey={sessionSceneKey}
        creatures={activeSessionId ? sceneCreatures : []}
        width={containerSize.w}
        height={containerSize.h}
        sceneBlur={sceneBlur}
        creatureBlurEnabled={creatureBlurEnabled}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: fadingOut ? 0 : 1,
          transition: 'opacity 0.6s ease',
        }}
      />

      {/* ─── HUD Overlays ───────────────────────────────────────────────────── */}

      {/* Top-left: Session info badge */}
      {activeSessionId && (
        <div style={{
          position: 'absolute',
          top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          padding: '8px 14px',
          borderRadius: 'var(--radius-md)',
          zIndex: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'hsl(142, 72%, 50%)',
            boxShadow: '0 0 8px hsl(142, 72%, 50%)',
            animation: 'focus-pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>
            {sessionTimerMode === 'shared' ? 'Shared' : 'Independent'}
          </span>
          {/* Hide scene name + invite code on mobile (available in sidebar) */}
          {!isMobile && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                {scenes.find(s => s.key === sessionSceneKey)?.name || sessionSceneKey}
              </span>
              {sessionInviteCode && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                  <button
                    onClick={handleCopyCode}
                    style={{
                      background: codeCopied ? 'hsl(142, 72%, 45%)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'white',
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    {codeCopied ? 'Copied!' : sessionInviteCode}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Top-right: Sidebar toggle + chat toggle + invite badge */}
      <div style={{
        position: 'absolute',
        top: 16, right: 16,
        display: 'flex', gap: 8,
        zIndex: 10,
      }}>
        {/* Golden invite badge (visible anytime there are pending invites) */}
        {pendingInvites.length > 0 && (
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              position: 'relative',
              width: btnSize, height: btnSize,
              background: 'linear-gradient(135deg, hsl(45, 90%, 50%), hsl(35, 90%, 45%))',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'hsl(45, 90%, 10%)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px hsla(45, 90%, 50%, 0.4)',
            }}
            title="Co-Focus invitations"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: 'hsl(0, 72%, 55%)',
              color: 'white',
              fontSize: 9, fontWeight: 700,
              minWidth: 16, height: 16,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px',
            }}>{pendingInvites.length}</span>
          </button>
        )}
        {/* Chat toggle */}
        {activeSessionId && (
          <button
            onClick={toggleChat}
            style={{
              position: 'relative',
              width: btnSize, height: btnSize,
              background: chatOpen ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Toggle chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadCount > 0 && !chatOpen && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'hsl(0, 72%, 55%)',
                color: 'white',
                fontSize: 9, fontWeight: 700,
                minWidth: 16, height: 16,
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>{unreadCount}</span>
            )}
          </button>
        )}

        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          style={{
            width: btnSize, height: btnSize,
            background: sidebarOpen ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-md)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Session settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Participant HUD (top-left widget with expand/pin) */}
      {activeSessionId && participantList.length > 0 && (
        <CoFocusParticipantHUD
          participants={participantList}
          myUserId={myUserId}
          sessionHostId={sessionHostId}
          isMobile={isMobile}
          boundsRef={containerRef}
        />
      )}

      {/* ─── No Session: Center overlay ─────────────────────────────────────── */}
      {!activeSessionId && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          zIndex: 10,
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(12px)',
            padding: isMobile ? '24px 20px' : '32px 48px',
            borderRadius: 'var(--radius-lg, 16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 16,
            maxWidth: isMobile ? 'calc(100vw - 32px)' : 360,
          }}>
            <h2 style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              color: 'white',
            }}>Co-Focus</h2>
            <p style={{
              margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)',
              textAlign: 'center', lineHeight: 1.5,
            }}>
              Start a focus session with friends. Everyone sees each other's timers and Synamon companions around the campfire.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowSessionModal(true)}
                style={{
                  padding: '10px 24px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Start or Join</button>
              {/* Golden invite button when pending invites exist */}
              {pendingInvites.length > 0 && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  style={{
                    position: 'relative',
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, hsl(45, 90%, 50%), hsl(35, 90%, 45%))',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'hsl(45, 90%, 10%)',
                    fontSize: 13, fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 0 16px hsla(45, 90%, 50%, 0.4)',
                    animation: 'focus-pulse 2s ease-in-out infinite',
                  }}
                >
                  Invites
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    background: 'hsl(0, 72%, 55%)',
                    color: 'white',
                    fontSize: 9, fontWeight: 700,
                    minWidth: 18, height: 18,
                    borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                  }}>{pendingInvites.length}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Chat panel ──────────────────────────────────────────────────────── */}
      {activeSessionId && chatOpen && (
        <div style={isMobile ? {
          // Mobile: full-width bottom sheet
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '60vh',
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(12px)',
          border: 'none',
          borderRadius: '16px 16px 0 0',
          overflow: 'hidden',
          zIndex: 25,
          display: 'flex', flexDirection: 'column',
        } : {
          // Desktop: floating panel
          position: 'absolute',
          bottom: 16,
          right: sidebarOpen ? 316 : 16,
          width: 320,
          height: 280,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          zIndex: 15,
          display: 'flex', flexDirection: 'column',
          transition: 'right 0.3s ease',
        }}>
          <CoFocusChat />
        </div>
      )}

      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <div style={isMobile ? {
        // Mobile: bottom sheet
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: '70vh',
        background: 'var(--bg-secondary)',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
        transform: sidebarOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 20,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      } : {
        // Desktop: right panel
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: 300,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 20,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
            Session Settings
          </h3>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', padding: 2,
            }}
          >&times;</button>
        </div>

        {sidebarContent}
      </div>

      {/* ─── Invite modal ──────────────────────────────────────────────────── */}
      <CoFocusInviteModal />
    </div>
  );
}
