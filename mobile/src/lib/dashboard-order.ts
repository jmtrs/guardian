import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Orden de los recuadros del dashboard, reordenable por el usuario (long-press).
// Persistido en AsyncStorage (mismo idiom que el store de tema).
export type DashboardCard = 'location' | 'events' | 'status' | 'battery';

export const DEFAULT_ORDER: DashboardCard[] = ['location', 'events', 'status', 'battery'];

const STORAGE_KEY = 'guardian.dashboardOrder';

// Sanea lo guardado: mantiene solo claves validas y garantiza que estan todas
// (si en el futuro se añade un card nuevo, aparece al final).
function normalize(raw: unknown): DashboardCard[] {
  const saved = Array.isArray(raw) ? raw.filter((k): k is DashboardCard =>
    DEFAULT_ORDER.includes(k as DashboardCard),
  ) : [];
  const missing = DEFAULT_ORDER.filter((k) => !saved.includes(k));
  return [...saved, ...missing];
}

export function useDashboardOrder() {
  const [order, setOrder] = useState<DashboardCard[]>(DEFAULT_ORDER);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (alive && raw) setOrder(normalize(JSON.parse(raw)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: DashboardCard[]) => {
    setOrder(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  return { order, setOrder: persist };
}
