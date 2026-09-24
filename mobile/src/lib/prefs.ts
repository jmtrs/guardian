import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BatteryBucket } from '@/api/devices';

// Preferencias de UI del usuario, persistidas en AsyncStorage — mismo idiom de
// load/save-patch que ui/theme/store.ts. Recuerda la ultima granularidad y vista
// de energia elegidas para reabrir la pagina donde la dejo el usuario.
export type EnergyView = 'line' | 'list';

export type Prefs = {
  energyView: EnergyView;
  energyBucket: BatteryBucket;
};

export const DEFAULT_PREFS: Prefs = {
  energyView: 'line',
  energyBucket: 'day',
};

const ENERGY_VIEWS: EnergyView[] = ['line', 'list'];
const ENERGY_BUCKETS: BatteryBucket[] = ['hour', 'day', 'week'];

const STORAGE_KEY = 'guardian.prefs';

async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    // Sanea valores obsoletos/invalidos (p.ej. 'bars' de una version anterior).
    if (!ENERGY_VIEWS.includes(parsed.energyView)) parsed.energyView = DEFAULT_PREFS.energyView;
    if (!ENERGY_BUCKETS.includes(parsed.energyBucket))
      parsed.energyBucket = DEFAULT_PREFS.energyBucket;
    return parsed;
  } catch {
    return DEFAULT_PREFS;
  }
}

async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort: un persist fallido solo significa que no sobrevive al reinicio.
  }
}

// Store compartido (module-level): todas las pantallas leen el MISMO estado, asi
// un cambio en la pagina de Energia se propaga al instante a la card del
// dashboard (sin esperar a remontar). `hydrated` = ya cargado de disco.
type Snapshot = { prefs: Prefs; hydrated: boolean };

let snapshot: Snapshot = { prefs: DEFAULT_PREFS, hydrated: false };
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  for (const l of listeners) l();
}

function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  void loadPrefs().then((p) => {
    snapshot = { prefs: p, hydrated: true };
    emit();
  });
}

function setPatch(part: Partial<Prefs>) {
  snapshot = { prefs: { ...snapshot.prefs, ...part }, hydrated: true };
  void savePrefs(snapshot.prefs);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

export function useEnergyPrefs() {
  ensureLoaded();
  const s = useSyncExternalStore(subscribe, getSnapshot);
  return {
    hydrated: s.hydrated,
    energyView: s.prefs.energyView,
    energyBucket: s.prefs.energyBucket,
    setEnergyView: (v: EnergyView) => setPatch({ energyView: v }),
    setEnergyBucket: (b: BatteryBucket) => setPatch({ energyBucket: b }),
  };
}

// Wrapper para Settings (solo la vista por defecto).
export function useEnergyView() {
  const { energyView, setEnergyView } = useEnergyPrefs();
  return { energyView, setEnergyView };
}
