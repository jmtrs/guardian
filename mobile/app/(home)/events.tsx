import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DeviceEvent } from '@/api/devices';
import { useDeviceEvents, useDevices } from '@/api/devices';
import { uiFontFamily } from '@/ui/theme/fonts';

const KIND_ICON: Record<DeviceEvent['kind'], string> = {
  suspected_movement: '▲',
  battery_low: '▼',
  power_lost: '✕',
  heartbeat: '♥',
  gnss_fix: '⌖',
};

export default function EventsScreen() {
  const { t } = useTranslation();
  const { data: devices } = useDevices();
  const device = devices?.[0];
  const { data: events, isLoading } = useDeviceEvents(device?.id, 100);

  const kindLabel = (kind: DeviceEvent['kind']) => {
    switch (kind) {
      case 'suspected_movement':
        return t('events.kindSuspectedMovement');
      case 'battery_low':
        return t('events.kindBatteryLow');
      case 'power_lost':
        return t('events.kindPowerLost');
      case 'heartbeat':
        return t('events.kindHeartbeat');
      case 'gnss_fix':
        return t('events.kindGnssFix');
    }
  };

  return (
    <View style={styles.canvas}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <Text style={styles.muted}>
            {isLoading ? t('common.loading') : t('home.noEvents')}
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              item.kind === 'suspected_movement' && styles.rowAlert,
              item.kind === 'power_lost' && styles.rowAlert,
            ]}
          >
            <Text
              style={[
                styles.kindIcon,
                (item.kind === 'suspected_movement' || item.kind === 'power_lost') &&
                  styles.kindIconAlert,
              ]}
            >
              {KIND_ICON[item.kind]}
            </Text>
            <View style={styles.rowBody}>
              <Text style={styles.kindText}>{kindLabel(item.kind)}</Text>
              <Text style={styles.metaText}>
                {new Date(item.observedAt).toLocaleString()} · seq {item.seq}
                {item.payload?.batteryMv != null
                  ? ` · ${(item.payload.batteryMv / 1000).toFixed(2)} V`
                  : ''}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#0b0d10' },
  content: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    backgroundColor: 'rgba(15, 18, 23, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowAlert: { borderColor: 'rgba(239, 68, 68, 0.5)' },
  kindIcon: {
    fontFamily: uiFontFamily.display,
    fontSize: 18,
    color: '#94a3b8',
  },
  kindIconAlert: { color: '#ef4444' },
  rowBody: { flex: 1, gap: 2 },
  kindText: {
    fontFamily: uiFontFamily.ui.semibold,
    fontSize: 14,
    color: '#e2e8f0',
  },
  metaText: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 11,
    color: '#64748b',
  },
  muted: {
    color: '#64748b',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
});
