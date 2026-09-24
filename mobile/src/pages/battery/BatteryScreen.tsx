import React, { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { BatteryBucket, BatteryPoint } from '@/api/devices';
import { useBatteryHistory, useDevices } from '@/api/devices';
import { EmptyState } from '@/ui/composites/EmptyState';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { BatteryChart, formatBucketLabel } from '@/ui/composites/BatteryChart';
import { useEnergyPrefs, type EnergyView } from '@/lib/prefs';
import { useUITheme } from '@/ui/theme';

import { createStyles, type BatteryStyles } from './BatteryScreen.styles';

const BUCKETS: BatteryBucket[] = ['hour', 'day', 'week'];
const VIEWS: EnergyView[] = ['line', 'list'];

const volts = (mv: number | null | undefined) =>
  mv == null ? '—' : `${(mv / 1000).toFixed(2)} V`;

function PillRow<T extends string>({
  label,
  options,
  active,
  onSelect,
  labelOf,
  styles,
}: {
  label?: string;
  options: T[];
  active: T;
  onSelect: (value: T) => void;
  labelOf: (value: T) => string;
  styles: BatteryStyles;
}) {
  return (
    <View style={styles.selectorBlock}>
      {label ? <Text style={styles.selectorLabel}>{label}</Text> : null}
      <View style={styles.pillRow}>
        {options.map((opt) => {
          const isActive = opt === active;
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={({ pressed }) => [
                styles.pill,
                isActive && styles.pillActive,
                pressed && styles.pillPressed,
              ]}
            >
              <Text style={[styles.pillLabel, isActive && styles.pillLabelActive]}>
                {labelOf(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ListView({
  points,
  bucket,
  styles,
}: {
  points: BatteryPoint[];
  bucket: BatteryBucket;
  styles: BatteryStyles;
}) {
  // Solo buckets con lecturas: un hueco no es una fila (se ve en la vista Linea).
  const rows = points.filter((p) => p.samples > 0);
  return (
    <FlatList
      style={styles.body}
      data={rows}
      keyExtractor={(p) => p.bucketStart}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator
      renderItem={({ item: p, index: i }) => {
        // Promedio como cifra principal; rango min-max solo si hay dispersion
        // (con 1 muestra min=avg=max, no repetir el mismo valor 3 veces).
        const spread = p.vehicleMvMin !== p.vehicleMvMax;
        return (
          <View style={[styles.listRow, i > 0 && styles.listRowDivider]}>
            <Text style={styles.listBucket} numberOfLines={1}>
              {formatBucketLabel(p.bucketStart, bucket)}
            </Text>
            <View style={styles.listValueBlock}>
              <Text style={styles.listValueMain}>{volts(p.vehicleMvAvg)}</Text>
              <Text style={styles.listValueSub}>
                {spread
                  ? `${volts(p.vehicleMvMin)}–${volts(p.vehicleMvMax)} · ×${p.samples}`
                  : `×${p.samples}`}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

export function BatteryScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Ultima granularidad + vista elegidas (persistidas). Se espera a `hydrated`
  // antes de consultar para no pedir con el default y luego refetch con lo guardado.
  const { hydrated, energyView, energyBucket, setEnergyView, setEnergyBucket } = useEnergyPrefs();
  const bucket = energyBucket;
  const view = energyView;

  const { data: devices } = useDevices({ refetchInterval: 30_000 });
  const device = devices?.[0];
  const { data, isLoading } = useBatteryHistory(hydrated ? device?.id : undefined, bucket, {
    refetchInterval: 30_000,
  });

  const points = useMemo(() => data?.points ?? [], [data]);
  const hasData = points.some((p) => p.samples > 0);

  // Resumen de la ventana: min/max sobre buckets con dato + suma de muestras.
  const summary = useMemo(() => {
    let min: number | null = null;
    let max: number | null = null;
    let samples = 0;
    for (const p of points) {
      if (p.vehicleMvMin != null) min = min == null ? p.vehicleMvMin : Math.min(min, p.vehicleMvMin);
      if (p.vehicleMvMax != null) max = max == null ? p.vehicleMvMax : Math.max(max, p.vehicleMvMax);
      samples += p.samples;
    }
    return { min, max, samples };
  }, [points]);

  // Energia actual: lo que alimenta AHORA (misma semantica que el dashboard).
  const currentMv =
    device?.lastPowerSource === 'reserve'
      ? (device?.lastReserveMv ?? null)
      : (device?.lastVehicleMv ?? null);
  const sourceText =
    device?.lastPowerSource === 'vehicle'
      ? t('home.powerVehicle')
      : device?.lastPowerSource === 'reserve'
        ? t('home.powerReserve')
        : '—';

  const bucketLabel = (b: BatteryBucket) =>
    b === 'hour' ? t('battery.hour') : b === 'week' ? t('battery.week') : t('battery.day');
  const viewLabel = (v: EnergyView) =>
    v === 'line' ? t('battery.viewLine') : t('battery.viewList');

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backIcon}>←</Text>
      </Pressable>
      <Text style={styles.title}>{t('battery.title')}</Text>
    </View>
  );

  if (!hydrated || isLoading) {
    return (
      <ScreenFrame>
        <View style={[styles.container, styles.contentEmpty]}>
          {header}
          <View style={styles.emptyWrap}>
            <ScreenLoader label={t('common.loading')} />
          </View>
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <View style={styles.container}>
        {header}

        <PillRow
          options={BUCKETS}
          active={bucket}
          onSelect={setEnergyBucket}
          labelOf={bucketLabel}
          styles={styles}
        />

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('battery.current')}</Text>
            <Text style={styles.summaryValue}>{volts(currentMv)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('battery.windowRange')}</Text>
            <Text style={styles.summaryValue}>{`${volts(summary.min)} – ${volts(summary.max)}`}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('battery.source')}</Text>
            <Text style={styles.summaryValue}>{sourceText}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('battery.samples')}</Text>
            <Text style={styles.summaryValue}>{summary.samples}</Text>
          </View>
        </View>

        <PillRow
          options={VIEWS}
          active={view}
          onSelect={setEnergyView}
          labelOf={viewLabel}
          styles={styles}
        />

        <View style={styles.body}>
          {!hasData ? (
            <View style={styles.emptyWrap}>
              <EmptyState glyph="◦" title={t('battery.empty')} hint={t('battery.emptyHint')} />
            </View>
          ) : view === 'list' ? (
            <ListView points={points} bucket={bucket} styles={styles} />
          ) : (
            <View style={styles.chartWrap}>
              <BatteryChart points={points} bucket={bucket} />
            </View>
          )}
        </View>
      </View>
    </ScreenFrame>
  );
}
