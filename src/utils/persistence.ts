import { useStore } from '../store';

const API_BASE = '/api';

export async function saveToServer() {
  const data = useStore.getState().getSerializableState();
  try {
    await fetch(`${API_BASE}/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn('Failed to save to server, saving to localStorage', e);
    localStorage.setItem('blockout-data', JSON.stringify(data));
  }
}

export async function loadFromServer() {
  try {
    const res = await fetch(`${API_BASE}/data`);
    if (res.ok) {
      const data = await res.json();
      if (data && Object.keys(data.tasks || {}).length > 0) {
        useStore.getState().loadData(data);
        return;
      }
    }
  } catch (e) {
    console.warn('Failed to load from server, trying localStorage', e);
  }

  // Fallback to localStorage
  const local = localStorage.getItem('blockout-data');
  if (local) {
    try {
      useStore.getState().loadData(JSON.parse(local));
    } catch (e) {
      console.warn('Failed to parse localStorage data', e);
    }
  }
}

// Auto-save with debounce
let saveTimeout: ReturnType<typeof setTimeout>;
export function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveToServer, 1000);
}
