import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDeviceEvents, useDevices, useEndTrip, useStartTrip } from '@/api/devices';
import { LaneStripe } from '@/ui/assets/placeholders';
import { AlertPulse } from '@/ui/composites/AlertPulse';
import { EmptyState } from '@/ui/composites/EmptyState';
import { HUDButton } from '@/ui/composites/HUDButton';
import { Reveal } from '@/ui/composites/Reveal';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { useDashboardOrder, type DashboardCard } from '@/lib/dashboard-order';
import { formatEventTime, getEventGlyph, getEventLabel, isAlertKind } from '@/lib/events';
import { useReverseGeocode } from '@/lib/geocode';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './DashboardScreen.styles';

// Envoltorio de cada recuadro: long-press dispara el drag (reordenar).
// Tap solo navega en Ubicacion. El scale de "agarrado" lo pone ReorderableList
// (cellAnimations por defecto), suave y sin parpadeo.
function DashCard({
  onPress,
  style,
  children,
}: {
  onPress?: () => void;
  style: object;
  children: React.ReactNode;
}) {
  const drag = useReorderableDrag();
  return (
    <Pressable onPress={onPress} onLongPress={drag} delayLongPress={250} style={style}>
      {children}
    </Pressable>
  );
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { order, setOrder } = useDashboardOrder();

  // Polling: estado y eventos en vivo (alerta aparece sin recargar). Sin
  // pull-to-refresh: RefreshControl choca con el pan de la lista reordenable.
  const { data: devices, isLoading } = useDevices({ refetchInterval: 5_000 });
  const device = devices?.[0];
  const { data: events } = useDeviceEvents(device?.id, 5, { refetchInterval: 5_000 });
  const startTrip = useStartTrip(device?.id);
  const endTrip = useEndTrip(device?.id);

  const lastEvent = events?.[0];
  // Bateria: preferimos el valor denormalizado del dispositivo; caemos al ultimo
  // evento con lectura si aun no llego. Placeholder '—' evita el pop-in.
  const batteryMv =
    device?.lastBatteryMv ?? events?.find((e) => e.payload?.batteryMv != null)?.payload?.batteryMv ?? null;
  const isAlert = device?.state === 'ARMED' && lastEvent?.kind === 'suspected_movement';
  const isTrip = device?.state === 'TRIP';

  const statusText = isAlert
    ? t('home.statusAlert')
    : isTrip
      ? t('home.statusTrip')
      : t('home.statusArmed');

  const recentEvents = (events ?? []).slice(0, 3);
  const hasPosition = device?.lastLat != null && device?.lastLon != null;
  const { data: geo, isLoading: geoLoading } = useReverseGeocode(device?.lastLat, device?.lastLon);
  const placeText = !hasPosition
    ? t('home.mapNoPosition')
    : geoLoading
      ? t('common.loading')
      : geo?.label || t('map.addressUnknown');

  const wordmark = (
    <Reveal delay={0} style={styles.wordmarkRow}>
      <Text style={styles.wordmark}>{t('home.title')}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/(home)/settings')}
          hitSlop={12}
          accessibilityLabel={t('home.settings')}
          style={({ pressed }) => [styles.gearButton, pressed && styles.pressed]}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
      </View>
    </Reveal>
  );

  // Recuadros memoizados: referencia estable entre renders → al reordenar la
  // lista solo MUEVE nodos existentes (no reconstruye), lo que elimina el flash
  // de doble render al soltar. Se recalculan solo cuando cambian sus datos.
  const cardEls = useMemo<Record<DashboardCard, React.ReactNode> | null>(() => {
    if (!device) return null;
    return {
      location: (
        <View style={styles.mapCard}>
          <View style={styles.mapGlyphBox}>
            <Text style={styles.mapGlyph}>⌖</Text>
          </View>
          <View style={styles.mapBody}>
            <Text style={styles.mapLabel}>{t('home.map')}</Text>
            <Text style={styles.mapValue} numberOfLines={1}>
              {placeText}
            </Text>
            {hasPosition && geo?.detail ? (
              <Text style={styles.mapDetail} numberOfLines={1}>
                {geo.detail}
              </Text>
            ) : null}
          </View>
          <Text style={styles.mapArrow}>→</Text>
        </View>
      ),
      events: (
        <View style={styles.recentPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelHeaderText}>{t('home.events')}</Text>
          </View>
          {recentEvents.length > 0 ? (
            recentEvents.map((event, i) => (
              <View key={event.id} style={[styles.eventRow, i > 0 && styles.eventRowDivider]}>
                <View style={[styles.glyphBox, isAlertKind(event.kind) && styles.glyphBoxAlert]}>
                  <Text
                    style={[styles.eventGlyph, isAlertKind(event.kind) && styles.eventGlyphAlert]}
                  >
                    {getEventGlyph(event.kind)}
                  </Text>
                </View>
                <Text
                  style={[styles.eventLabel, isAlertKind(event.kind) && styles.eventLabelAlert]}
                  numberOfLines={1}
                >
                  {getEventLabel(event.kind, t)}
                </Text>
                <Text style={styles.eventTime}>{formatEventTime(event.observedAt)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyEventsRow}>
              <Text style={styles.emptyEventsText}>{t('home.noEvents')}</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.eventsLinkRow, pressed && styles.pressed]}
            onPress={() => router.push('/(home)/events')}
          >
            <Text style={styles.sectionLink}>{t('home.eventsTitle')} →</Text>
          </Pressable>
        </View>
      ),
      status: (
        <View
          style={[
            styles.statusPanel,
            isAlert && styles.statusPanelAlert,
            isTrip && styles.statusPanelTrip,
          ]}
        >
          {isAlert ? (
            <AlertPulse style={styles.statusOverlay} color={theme.semantic.accent.red} />
          ) : isTrip ? (
            <LaneStripe
              style={styles.statusOverlay}
              intensity="medium"
              color={theme.semantic.accent.warning}
            />
          ) : null}
          <Text style={styles.deviceName}>{device.name}</Text>
          <Text
            style={[
              styles.statusText,
              isAlert && styles.statusTextAlert,
              isTrip && styles.statusTextTrip,
            ]}
          >
            {statusText}
          </Text>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('home.lastSeen')}</Text>
              <Text style={styles.metaValue}>
                {device.lastSeenAt ? formatEventTime(device.lastSeenAt) : t('home.lastSeenNever')}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('home.battery')}</Text>
              <Text style={styles.metaValue}>
                {batteryMv != null ? `${(batteryMv / 1000).toFixed(2)} V` : '—'}
              </Text>
            </View>
          </View>
        </View>
      ),
    };
  }, [
    device,
    styles,
    theme,
    t,
    router,
    placeText,
    hasPosition,
    geo,
    recentEvents,
    isAlert,
    isTrip,
    statusText,
    batteryMv,
  ]);

  if (isLoading) {
    return (
      <ScreenFrame animated={false}>
        <ScreenLoader label={t('common.loading')} />
      </ScreenFrame>
    );
  }

  if (!device) {
    return (
      <ScreenFrame>
        <View style={styles.staticContent}>
          {wordmark}
          <EmptyState glyph="⚠" title={t('home.noDeviceTitle')} hint={t('home.noDeviceHint')} />
        </View>
      </ScreenFrame>
    );
  }

  // Tap en Ubicacion navega; long-press en cualquier card arrastra para reordenar.
  const onCardPress = (key: DashboardCard) => {
    if (key === 'location') router.push('/(home)/map');
  };

  const handleReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (from !== to) setOrder(reorderItems(order, from, to));
  };

  return (
    <ScreenFrame>
      <View style={styles.container}>
        {/* Cabecera fija: wordmark + engranaje. No scrollea. */}
        <View style={styles.header}>{wordmark}</View>

        <ReorderableList
          data={order}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <DashCard onPress={() => onCardPress(item)} style={styles.cardSlot}>
              {cardEls?.[item]}
            </DashCard>
          )}
          onReorder={handleReorder}
          style={styles.list}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.tokens.spacing['4'] }]}>
          <HUDButton
            label={isTrip ? t('home.endTrip') : t('home.startTrip')}
            variant={isTrip ? 'danger' : 'primary'}
            onPress={() => (isTrip ? endTrip.mutate() : startTrip.mutate())}
            loading={startTrip.isPending || endTrip.isPending}
            testID="trip-toggle"
          />
        </View>
      </View>
    </ScreenFrame>
  );
}
