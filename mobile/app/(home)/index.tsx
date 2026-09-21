import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { useDeviceEvents, useDevices, useEndTrip, useStartTrip } from '@/api/devices';
import { uiFontFamily } from '@/ui/theme/fonts';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { data: devices, isLoading } = useDevices();
  const device = devices?.[0];
  const { data: events } = useDeviceEvents(device?.id, 5);
  const startTrip = useStartTrip(device?.id);
  const endTrip = useEndTrip(device?.id);

  const lastEvent = events?.[0];
  const lastBatteryMv = events?.find((e) => e.payload?.batteryMv != null)?.payload
    ?.batteryMv;
  const isAlert =
    device?.state === 'ARMED' && lastEvent?.kind === 'suspected_movement';

  const statusText = isAlert
    ? t('home.statusAlert')
    : device?.state === 'TRIP'
      ? t('home.statusTrip')
      : t('home.statusArmed');

  const logout = async () => {
    await authClient.signOut();
    router.replace('/(auth)/login');
  };

  if (isLoading) {
    return (
      <View style={styles.canvas}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.canvas} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Pressable onPress={logout} hitSlop={12}>
          <Text style={styles.logout}>{t('auth.logout')}</Text>
        </Pressable>
      </View>

      {!device ? (
        <View style={styles.panel}>
          <Text style={styles.muted}>{t('home.noDevice')}</Text>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.statusPanel,
              isAlert && styles.statusPanelAlert,
              device.state === 'TRIP' && styles.statusPanelTrip,
            ]}
          >
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text
              style={[
                styles.statusText,
                isAlert && styles.statusTextAlert,
                device.state === 'TRIP' && styles.statusTextTrip,
              ]}
            >
              {statusText}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('home.lastSeen')}</Text>
              <Text style={styles.metaValue}>
                {device.lastSeenAt
                  ? new Date(device.lastSeenAt).toLocaleString()
                  : t('home.lastSeenNever')}
              </Text>
            </View>
            {lastBatteryMv != null ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('home.battery')}</Text>
                <Text style={styles.metaValue}>{(lastBatteryMv / 1000).toFixed(2)} V</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.tripButton,
              device.state === 'TRIP' ? styles.tripButtonEnd : styles.tripButtonStart,
              pressed && styles.buttonPressed,
              (startTrip.isPending || endTrip.isPending) && styles.buttonDisabled,
            ]}
            onPress={() =>
              device.state === 'TRIP' ? endTrip.mutate() : startTrip.mutate()
            }
            disabled={startTrip.isPending || endTrip.isPending}
          >
            <Text
              style={[
                styles.tripButtonText,
                device.state === 'TRIP' && styles.tripButtonTextEnd,
              ]}
            >
              {device.state === 'TRIP' ? t('home.endTrip') : t('home.startTrip')}
            </Text>
          </Pressable>

          <Link href="/(home)/events" asChild>
            <Pressable style={({ pressed }) => [styles.eventsLink, pressed && styles.buttonPressed]}>
              <Text style={styles.eventsLinkText}>{t('home.events')} →</Text>
            </Pressable>
          </Link>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#0b0d10' },
  content: { padding: 24, gap: 16, paddingTop: 72 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: uiFontFamily.display,
    fontSize: 28,
    letterSpacing: 5,
    color: '#e2e8f0',
  },
  logout: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
    color: '#64748b',
  },
  panel: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: 'rgba(15, 18, 23, 0.9)',
    padding: 24,
  },
  statusPanel: {
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
    backgroundColor: 'rgba(15, 18, 23, 0.9)',
    padding: 24,
    gap: 12,
  },
  statusPanelAlert: { borderColor: 'rgba(239, 68, 68, 0.7)' },
  statusPanelTrip: { borderColor: 'rgba(180, 83, 9, 0.7)' },
  deviceName: {
    fontFamily: uiFontFamily.ui.medium,
    fontSize: 14,
    color: '#94a3b8',
    letterSpacing: 1,
  },
  statusText: {
    fontFamily: uiFontFamily.display,
    fontSize: 30,
    letterSpacing: 4,
    color: '#4ade80',
  },
  statusTextAlert: { color: '#ef4444' },
  statusTextTrip: { color: '#f59e0b' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaValue: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 12,
    color: '#cbd5e1',
  },
  tripButton: { paddingVertical: 18, alignItems: 'center', borderWidth: 1 },
  tripButtonStart: { backgroundColor: '#b45309', borderColor: '#b45309' },
  tripButtonEnd: { backgroundColor: 'transparent', borderColor: '#ef4444' },
  tripButtonText: {
    color: '#0b0d10',
    fontFamily: uiFontFamily.ui.bold,
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tripButtonTextEnd: { color: '#ef4444' },
  eventsLink: { paddingVertical: 12, alignItems: 'center' },
  eventsLinkText: {
    color: '#94a3b8',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 14,
    letterSpacing: 1,
  },
  muted: {
    color: '#64748b',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
});
