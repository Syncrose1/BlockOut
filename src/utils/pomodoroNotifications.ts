// Pomodoro notification and sound utilities

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission === 'denied') {
    return false;
  }
  
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function sendPomodoroNotification(mode: 'work' | 'break' | 'longBreak'): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  
  const title = mode === 'work' ? 'Break Time!' : 'Focus Time!';
  const body = mode === 'work' 
    ? 'Great job! Take a well-deserved break.' 
    : 'Time to get back to work and stay focused!';
  
  new Notification(title, {
    body,
    icon: '/bo-logo-v3.png',
    badge: '/bo-logo-v3.png',
    tag: 'pomodoro-complete',
    requireInteraction: false,
  });
}

// Play a pleasant chime sound through speakers
export function playCompletionSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillator for a pleasant chime
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant chime frequencies (major chord)
    const now = audioContext.currentTime;
    
    // Play a sequence of notes
    const playNote = (freq: number, startTime: number, duration: number, volume: number = 0.3) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.frequency.setValueAtTime(freq, startTime);
      osc.type = 'sine';
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    // Play a pleasant major chord arpeggio
    playNote(523.25, now, 0.8, 0.25); // C5
    playNote(659.25, now + 0.15, 0.8, 0.25); // E5
    playNote(783.99, now + 0.3, 1.0, 0.25); // G5
    playNote(1046.50, now + 0.45, 1.2, 0.2); // C6
    
  } catch (error) {
    console.error('Failed to play completion sound:', error);
  }
}