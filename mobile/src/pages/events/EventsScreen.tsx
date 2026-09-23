import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import type { DeviceEvent } from '@/api/devices';
import { deviceKeys, useDeviceEventsInfinite, useDevices } from '@/api/devices';
import { useReverseGeocode } from '@/lib/geocode';
import { EmptyState } from '@/ui/composites/EmptyState';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { formatEventTime, getEventGlyph, getEventLabel, isAlertKind } from '@/lib/events';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './EventsScreen.styles';

type Styles = ReturnType<typeof createStyles>;

// Meta base sin posicion: #seq + energia (rail que alimenta ahora). El sitio
// fisico lo resuelve la fila. En reserva sin lectura de reserva no se enseña
// el rail del vehiculo: seria mentir sobre 13.6V con la de ~4V alimentando.
function getBaseMeta(item: DeviceEvent): string {
  const parts: string[] = [`#${item.seq}`];
  const power = item.payload?.power;
  if (power) {
    const mv =
      power.source === 'reserve'
        ? power.reserveMv ?? null
        : power.vehicleMv;
    if (mv != null) {
      parts.push(`${(mv / 1000).toFixed(2)} V`);
    }
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

  const PAGE_SIZE = 20;
  const queryClient = useQueryClient();
  const { data: devices } = useDevices({ refetchInterval: 10_000 });
  const device = devices?.[0];
  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDeviceEventsInfinite(device?.id, PAGE_SIZE);
  // Aplana las paginas cargadas en una sola lista para el FlatList.
  const events = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Scroll al final: pide la siguiente pagina (lazy load), nunca en paralelo.
  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  // Pull-to-refresh = "busca si hay algo nuevo": descarta las paginas extra y
  // recarga SOLO la primera (los mas recientes arriba), sin volver a bajar todo
  // lo que ya se habia paginado.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (device?.id) {
        queryClient.setQueryData<{ pages: DeviceEvent[][]; pageParams: unknown[] }>(
          [...deviceKeys.events(device.id), 'infinite', PAGE_SIZE],
          (prev) =>
            prev ? { pages: prev.pages.slice(0, 1), pageParams: prev.pageParams.slice(0, 1) } : prev,
        );
      }
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
        // Lista vacia: flex para que el EmptyState centre en pantalla (igual
        // que el mapa sin posicion), no cuelgue arriba bajo el titulo.
        contentContainerStyle={[styles.content, events.length === 0 && styles.contentEmpty]}
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
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyWrap}>
              <ScreenLoader label={t('common.loading')} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState glyph="◦" title={t('home.noEvents')} hint={t('home.noEventsHint')} />
            </View>
          )
        }
        // Lazy load: al acercarse al final pide la siguiente pagina.
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        initialNumToRender={PAGE_SIZE}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={theme.semantic.accent.warning} />
            </View>
          ) : null
        }
        renderItem={({ item }) => <EventRow item={item} styles={styles} t={t} />}
      />
    </ScreenFrame>
  );
}
