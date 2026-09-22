import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { DeviceEvent } from '@/api/devices';
import { useDeviceEvents, useDevices } from '@/api/devices';
import { useReverseGeocode } from '@/lib/geocode';
import { EmptyState } from '@/ui/composites/EmptyState';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { formatEventTime, getEventGlyph, getEventLabel, isAlertKind } from '@/lib/events';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './EventsScreen.styles';

type Styles = ReturnType<typeof createStyles>;

// Meta base sin posicion: #seq + bateria. El sitio fisico lo resuelve la fila.
function getBaseMeta(item: DeviceEvent): string {
  const parts: string[] = [`#${item.seq}`];
  if (item.payload?.batteryMv != null) {
    parts.push(`${(item.payload.batteryMv / 1000).toFixed(2)} V`);
  }
  return parts.join(' · ');
}

function EventRow({ item, styles, t }: { item: DeviceEvent; styles: Styles; t: TFunction }) {
  const pos = item.payload?.position ?? null;
  // Reverse geocode solo si hay posicion; react-query dedupe por coords (4 dec).
  const { data: geo, isLoading } = useReverseGeocode(pos?.lat, pos?.lon);

  const base = getBaseMeta(item);
  let place = '';
  if (pos) {
    place = isLoading
      ? t('common.loading')
      : [geo?.label, geo?.detail].filter(Boolean).join(', ') || t('map.addressUnknown');
  }
  const meta = [base, place].filter(Boolean).join(' · ');

  return (
    <View style={styles.timelineRow}>
      <View style={styles.rail}>
        <View style={[styles.glyphBox, isAlertKind(item.kind) && styles.glyphBoxAlert]}>
          <Text style={[styles.glyph, isAlertKind(item.kind) && styles.glyphAlert]}>
            {getEventGlyph(item.kind)}
          </Text>
        </View>
        <View style={styles.railLine} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[styles.kindText, isAlertKind(item.kind) && styles.kindTextAlert]}
            numberOfLines={1}
          >
            {getEventLabel(item.kind, t)}
          </Text>
          <Text style={styles.time}>{formatEventTime(item.observedAt)}</Text>
        </View>
        <Text style={styles.metaText} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

export function EventsScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: devices } = useDevices({ refetchInterval: 10_000 });
  const device = devices?.[0];
  const { data: events, isLoading, refetch } = useDeviceEvents(device?.id, 100, {
    refetchInterval: 10_000,
  });
  // Spinner solo en pull manual: el polling de 10s NO debe mostrar el indicador.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenFrame>
      <FlatList
        style={styles.canvas}
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.semantic.accent.warning}
            colors={[theme.semantic.accent.warning]}
            progressBackgroundColor={theme.semantic.bg.surface}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
            <View style={styles.headerBlock}>
              <Text style={styles.title}>{t('home.eventsTitle')}</Text>
              {device ? <Text style={styles.subtitle}>{device.name}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyWrap}>
              <ScreenLoader label={t('common.loading')} />
            </View>
          ) : (
            <EmptyState glyph="◦" title={t('home.noEvents')} hint={t('home.noEventsHint')} />
          )
        }
        renderItem={({ item }) => <EventRow item={item} styles={styles} t={t} />}
      />
    </ScreenFrame>
  );
}
