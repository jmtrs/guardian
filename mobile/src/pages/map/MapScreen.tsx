import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDevicePositions, useDevices } from '@/api/devices';
import { useReverseGeocode } from '@/lib/geocode';
import { EmptyState } from '@/ui/composites/EmptyState';
import { HUDButton } from '@/ui/composites/HUDButton';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './MapScreen.styles';

// Estilo dark libre de OpenFreeMap (vector, sin API key, sin CARTO).
// String estable: evita el flash del estilo demo (MapTiler "API key required").
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export function MapScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: devices } = useDevices({ refetchInterval: 10_000 });
  const device = devices?.[0];
  // Rastro acotado por un hecho concreto, nunca "los ultimos 100 puntos
  // mezclados": con ?incidentId=... el backend devuelve posiciones desde que
  // abrio el incidente; con ?tripId=... las del viaje (entre start/end). El
  // dashboard navega con incidente si hay alerta abierta, si no con el viaje
  // activo. Sin params, historial completo. incidentId manda sobre tripId.
  const { incidentId, tripId } = useLocalSearchParams<{ incidentId?: string; tripId?: string }>();
  const scope = incidentId ? { incidentId } : tripId ? { tripId } : undefined;
  const scopeSubtitle = incidentId
    ? t('map.trailFromAlert')
    : tripId
      ? t('map.trailFromTrip')
      : null;
  const { data: positions } = useDevicePositions(device?.id, 100, { refetchInterval: 10_000 }, scope);
  // Tapa oscura hasta que el estilo carga: evita el flash blanco de MapLibre.
  const [mapReady, setMapReady] = useState(false);
  // Fallback: si el callback no llega, no dejar la tapa pegada.
  useEffect(() => {
    const id = setTimeout(() => setMapReady(true), 2500);
    return () => clearTimeout(id);
  }, []);
  const { data: geo, isLoading: geoLoading } = useReverseGeocode(device?.lastLat, device?.lastLon);

  const hasPosition = device?.lastLat != null && device?.lastLon != null;
  // MapLibre usa [lng, lat].
  const trail = useMemo<[number, number][]>(
    () => (positions ?? []).map((p) => [p.lon, p.lat]),
    [positions],
  );

  const back = (
    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
      <Text style={styles.backIcon}>←</Text>
    </Pressable>
  );

  const header = (
    <View style={styles.headerBlock}>
      <Text style={styles.title}>{t('map.title')}</Text>
      {scopeSubtitle ? <Text style={styles.subtitle}>{scopeSubtitle}</Text> : null}
    </View>
  );

  if (!hasPosition) {
    return (
      <ScreenFrame>
        <View style={styles.container}>
          <View style={styles.emptyHeader}>
            {back}
            {header}
          </View>
          <View style={styles.emptyWrap}>
            <EmptyState
              glyph="⌖"
              title={t('map.noPositionTitle')}
              hint={t('map.noPositionHint')}
            />
          </View>
        </View>
      </ScreenFrame>
    );
  }

  const center: [number, number] = [device.lastLon!, device.lastLat!];
  const lat = device.lastLat!;
  const lon = device.lastLon!;
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  const openMaps = () =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`);
  const openWaze = () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lon}&navigate=yes`);

  const addressLabel = geoLoading
    ? t('common.loading')
    : geo?.label || t('map.addressUnknown');

  return (
    <ScreenFrame>
      <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={MAP_STYLE}
        logo={false}
        attribution={true}
        compass={false}
        onDidFinishLoadingStyle={() => setMapReady(true)}
      >
        <Camera center={center} zoom={15} duration={0} />
        {trail.length >= 2 ? (
          <GeoJSONSource
            id="trail"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: trail },
            }}
          >
            <Layer
              id="trailLine"
              type="line"
              source="trail"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': theme.semantic.accent.warning, 'line-width': 3 }}
            />
          </GeoJSONSource>
        ) : null}
        <Marker lngLat={center}>
          <View style={styles.marker} />
        </Marker>
      </Map>

      {/* Tapa oscura mientras el estilo carga: mata el flash blanco inicial. */}
      {!mapReady ? <View style={styles.mapCover} pointerEvents="none" /> : null}

      <View style={styles.header}>
        {back}
        {header}
      </View>

      {/* Tarjeta inferior: direccion (reverse geocode) + coords + navegacion. */}
      <View style={styles.infoCard}>
        <Text style={styles.infoAddress} numberOfLines={1}>
          {addressLabel}
        </Text>
        {geo?.detail ? (
          <Text style={styles.infoDetail} numberOfLines={1}>
            {geo.detail}
          </Text>
        ) : null}
        <Text style={styles.infoCoords}>{coords}</Text>
        <View style={styles.navRow}>
          <HUDButton
            label="Gmaps"
            onPress={openMaps}
            style={styles.navButton}
            labelStyle={styles.navButtonLabel}
          />
          <HUDButton
            label="Waze"
            onPress={openWaze}
            style={styles.navButton}
            labelStyle={styles.navButtonLabel}
          />
        </View>
      </View>
      </View>
    </ScreenFrame>
  );
}
