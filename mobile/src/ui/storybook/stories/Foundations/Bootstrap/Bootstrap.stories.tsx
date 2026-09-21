import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';

import { LaneStripe, MetalPlate } from '@/ui/assets/placeholders';
import { useUITheme } from '@/ui/theme';
import { createBootstrapStyles } from './Bootstrap.styles';
import { HUDButton } from './HUDButton';

type BootstrapStoryCardProps = {
  headline: string;
  body: string;
};

function BootstrapStoryCard({ headline, body }: BootstrapStoryCardProps) {
  const theme = useUITheme();
  const styles = useMemo(() => createBootstrapStyles(theme), [theme]);

  return (
    <MetalPlate
      intensity="low"
      chainDirection="backward"
      chainThickness={2}
      scanIntensity="high"
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>save/load</Text>
        <View style={styles.headerArrowBox}>
          <View style={styles.headerArrow} />
        </View>
      </View>
      <LaneStripe intensity="high" style={styles.hazardBand} />
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.trackPanel}>
        <Text style={styles.trackLabel}>TRACK / MOTION BASELINE</Text>
        <View style={styles.trackLine} />
        <View style={styles.trackPulse} />
        <View style={styles.trackMarker} />
      </View>
      <View style={styles.actions}>
        <HUDButton />
      </View>
    </MetalPlate>
  );
}

const meta = {
  title: 'Foundations/Bootstrap',
  component: BootstrapStoryCard,
  args: {
    headline: 'Mobile UI Foundation',
    body: 'Storybook bootstrap ready.',
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof BootstrapStoryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
