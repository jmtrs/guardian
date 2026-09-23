import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  useAcknowledgeIncident,
  useClaimDevice,
  useDeviceCommands,
  useDeviceEvents,
  useDevices,
  useEndTrip,
  useIncidents,
  useRequestLocate,
  useStartTrip,
} from '@/api/devices';
import { LaneStripe } from '@/ui/assets/placeholders';
import { AlertPulse } from '@/ui/composites/AlertPulse';
import { EmptyState } from '@/ui/composites/EmptyState';
import { HUDButton } from '@/ui/composites/HUDButton';
import { Reveal } from '@/ui/composites/Reveal';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';
import { useDashboardOrder, type DashboardCard } from '@/lib/dashboard-order';
import {
  formatCountdown,
  formatEventTime,
  getEventGlyph,
  getEventLabel,
  isAlertKind,
} from '@/lib/events';
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

// Alta por presencia (software): sin dispositivos, el dueño teclea el codigo de
// claim que imprimio el banco/placa. El reto BLE real queda diferido a firmware.
function ClaimDeviceForm({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const theme = useUITheme();
  const claim = useClaimDevice();
  // El guion del formato XXXX-XXXX lo inserta el input, no el usuario: sin
  // esto es facil teclear mal o creer que el guion hay que ponerlo a mano.
  // (El backend normaliza igual; esto es solo UX.)
  const formatCode = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  };
  const submit = () => {
    const trimmed = code.trim();
    if (trimmed.length > 0 && !claim.isPending) {
      claim.mutate(trimmed, { onSuccess: () => setCode('') });
    }
  };
  // 429 (rate-limit tras varios intentos) tiene mensaje propio; el resto es el
  // caso comun: codigo invalido o caducado (mensaje localizado).
  const isRateLimited =
    (claim.error as { response?: { status?: number } } | null)?.response?.status === 429;
  const errorText = isRateLimited ? t('errors.RATE_LIMIT_EXCEEDED') : t('home.claimError');
  return (
    <View style={styles.claimForm}>
      <TextInput
        style={styles.claimInput}
        value={code}
        onChangeText={(v) => setCode(formatCode(v))}
        placeholder={t('home.claimPlaceholder')}
        placeholderTextColor={theme.semantic.fg.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        editable={!claim.isPending}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <HUDButton
        label={t('home.claimAction')}
        onPress={submit}
        disabled={claim.isPending || code.trim().length === 0}
      />
      {claim.isError ? <Text style={styles.claimError}>{errorText}</Text> : null}
    </View>
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
  const { data: incidents } = useIncidents(device?.id, { refetchInterval: 5_000 });
  const { data: commands } = useDeviceCommands(device?.id, { refetchInterval: 5_000 });
  const startTrip = useStartTrip(device?.id);
  const endTrip = useEndTrip(device?.id);
  const acknowledge = useAcknowledgeIncident(device?.id);
  const locate = useRequestLocate(device?.id);

  // Energia: lo que alimenta AHORA — si la fuente es la reserva, el voltaje
  // util es el de la reserva. Reserva sin lectura: '—', nunca el rail del
  // vehiculo (mostrar 13.6V miente si la de ~4V esta alimentando).
  const effectiveMv =
    device?.lastPowerSource === 'reserve'
      ? device?.lastReserveMv ?? null
      : device?.lastVehicleMv ?? null;
  const powerSourceText =
    device?.lastPowerSource === 'vehicle'
      ? t('home.powerVehicle')
      : device?.lastPowerSource === 'reserve'
        ? t('home.powerReserve')
        : null;
  const batteryText =
    effectiveMv != null
      ? `${(effectiveMv / 1000).toFixed(2)} V${powerSourceText ? ` · ${powerSourceText}` : ''}`
      : '—';

  // LOCATE_NOW: el estado se deriva del ULTIMO comando, no del mutacion local —
  // el ACK solo existe cuando el dispositivo manda el gnss_fix con commandId.
  // La lista viene fresca (el backend expira los PENDING caducados al leer).
  const latestLocate = commands?.find((c) => c.type === 'LOCATE_NOW') ?? null;
  const locateWaiting = latestLocate?.status === 'PENDING';
  const locateLabel = locate.isPending
    ? t('common.loading')
    : locateWaiting
      ? t('home.locateWaiting')
      : latestLocate?.status === 'ACKED' && latestLocate.ackedAt
        ? t('home.locateUpdated', { time: formatEventTime(latestLocate.ackedAt) })
        : latestLocate?.status === 'EXPIRED'
          ? t('home.locateExpired')
          : device?.lastFixAt
            ? t('home.locateWithFix', { time: formatEventTime(device.lastFixAt) })
            : t('home.locate');

  // La ALERTA es un incidente persistente, NO el ultimo evento: un heartbeat
  // posterior ya no la oculta y power_lost la enciende. Prioridad por estado,
  // no por fecha: OPEN = rojo pulsante; ACKNOWLEDGED = revisado (sigue
  // activo, sin pulso, NO desarma). Un OPEN antiguo nunca queda tapado por
  // un incidente mas reciente ya revisado.
  const activeIncident =
    incidents?.find((i) => i.state === 'OPEN') ??
    incidents?.find((i) => i.state === 'ACKNOWLEDGED') ??
    null;
  const isAlert = Boolean(activeIncident);
  const isOpenAlert = activeIncident?.state === 'OPEN';
  const isTrip = device?.state === 'TRIP';
  const isWorkshop = device?.state === 'WORKSHOP';
  const isRequesting = isTrip && device?.tripState === 'REQUESTED';
  const workshopCountdown = isWorkshop ? formatCountdown(device?.workshopUntil ?? null) : null;

  // Prioridad visual: alerta abierta > alerta revisada > taller > viaje > armado.
  const statusText = isOpenAlert
    ? t('home.statusAlert')
    : isAlert
      ? t('home.statusAcknowledged')
      : isWorkshop
        ? t('home.statusWorkshop')
        : isTrip
          ? isRequesting
            ? t('home.tripRequesting')
            : t('home.statusTrip')
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
            {/* Sin label "Ubicacion del vehiculo": la direccion ES la tarjeta.
                Valor protagonista (hasta 2 lineas), detalle debajo, y un pie
                separado por linea divisoria: fix y boton cada uno en su linea,
                sin repartirse una fila estrecha. */}
            <Text style={styles.mapValue} numberOfLines={2}>
              {placeText}
            </Text>
            {hasPosition && geo?.detail ? (
              <Text style={styles.mapDetail} numberOfLines={1}>
                {geo.detail}
              </Text>
            ) : null}
            <View style={styles.mapFooter}>
              {/* Pedir fix ahora. El estado es del ULTIMO comando: PENDING espera
                  el fix real; EXPIRED avisa; ACKED enseña cuando llego. Sin falsos
                  "ubicado" — el ACK lo da el dispositivo, no el boton. */}
              <Pressable
                style={({ pressed }) => [styles.locateRow, pressed && styles.pressed]}
                onPress={() => locate.mutate()}
                disabled={locate.isPending || locateWaiting}
                accessibilityLabel={t('home.locate')}
                testID="locate-now"
              >
                <Text
                  style={[
                    styles.locateText,
                    locateWaiting && styles.locateTextMuted,
                    latestLocate?.status === 'EXPIRED' && styles.locateTextAlert,
                  ]}
                  numberOfLines={1}
                >
                  {locateLabel}
                </Text>
              </Pressable>
            </View>
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
            isOpenAlert && styles.statusPanelAlert,
            isAlert && !isOpenAlert && styles.statusPanelAck,
            !isAlert && isWorkshop && styles.statusPanelWorkshop,
            !isAlert && isTrip && styles.statusPanelTrip,
          ]}
        >
          {isOpenAlert ? (
            <AlertPulse style={styles.statusOverlay} color={theme.semantic.accent.red} />
          ) : !isAlert && (isTrip || isWorkshop) ? (
            <LaneStripe
              style={styles.statusOverlay}
              intensity="medium"
              color={theme.semantic.accent.warning}
            />
          ) : null}
          <Text
            style={[
              styles.statusText,
              isOpenAlert && styles.statusTextAlert,
              isAlert && !isOpenAlert && styles.statusTextAck,
              !isAlert && isWorkshop && styles.statusTextWorkshop,
              !isAlert && isTrip && styles.statusTextTrip,
            ]}
          >
            {statusText}
          </Text>
          {/* Subline segun el estado activo: incidente / taller. */}
          {isAlert && activeIncident ? (
            isOpenAlert ? (
              <Pressable
                style={({ pressed }) => [styles.ackButton, pressed && styles.pressed]}
                onPress={() => acknowledge.mutate(activeIncident.id)}
                disabled={acknowledge.isPending}
                accessibilityLabel={t('home.acknowledge')}
              >
                <Text style={styles.ackButtonText}>{t('home.acknowledge')}</Text>
              </Pressable>
            ) : (
              <Text style={[styles.incidentSub, styles.statusTextAck]}>
                {getEventLabel(activeIncident.kind, t)}
              </Text>
            )
          ) : isWorkshop && workshopCountdown ? (
            <Text style={styles.incidentSub}>
              {t('home.workshopCountdown', { time: workshopCountdown })}
            </Text>
          ) : null}
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('home.lastSeen')}</Text>
              <Text style={styles.metaValue}>
                {device.lastSeenAt ? formatEventTime(device.lastSeenAt) : t('home.lastSeenNever')}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('home.battery')}</Text>
              <Text style={styles.metaValue}>{batteryText}</Text>
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
    isOpenAlert,
    isTrip,
    isWorkshop,
    workshopCountdown,
    activeIncident,
    acknowledge,
    statusText,
    batteryText,
    locate,
    locateLabel,
    locateWaiting,
    latestLocate,
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
          <ClaimDeviceForm styles={styles} />
        </View>
      </ScreenFrame>
    );
  }

  // Tap en Ubicacion navega; long-press en cualquier card arrastra para reordenar.
  // El mapa llega acotado al hecho vigente: ALERTA abierta -> rastro desde el
  // incidente; VIAJE activo -> rastro del viaje; si no, historial completo. La
  // alerta manda sobre el viaje (un movimiento durante un viaje sigue siendo lo
  // urgente que mirar). El backend rechaza ids ajenos, asi que es seguro.
  const activeTripId = device?.trips?.[0]?.id;
  const onCardPress = (key: DashboardCard) => {
    if (key === 'location') {
      const params =
        isOpenAlert && activeIncident
          ? { incidentId: activeIncident.id }
          : isTrip && activeTripId
            ? { tripId: activeTripId }
            : undefined;
      router.push(params ? { pathname: '/(home)/map', params } : '/(home)/map');
    }
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
