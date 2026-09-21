import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, Text, View } from 'react-native';

import {
  ChainLink,
  HUDScan,
  LaneStripe,
  MetalPlate,
  SpeedLines,
} from '@/ui/assets/placeholders';
import { useUITheme } from '@/ui/theme';
import { createPlaceholderStyles } from './Placeholders.styles';

function PlaceholdersCatalog() {
  const theme = useUITheme();
  const s = useMemo(() => createPlaceholderStyles(theme), [theme]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>

      <Text style={s.sectionTitle}>Animated</Text>

      <View style={s.entry}>
        <View style={s.entryHeader}>
          <Text style={s.entryName}>HUDScan</Text>
          <Text style={s.entryDesc}>radar sweep — multi-layer trail + echo</Text>
        </View>
        <View style={s.previewBoxTall}>
          <HUDScan intensity="high" />
        </View>
        <View style={s.previewBox}>
          <HUDScan intensity="medium" />
        </View>
      </View>

      <View style={s.entry}>
        <View style={s.entryHeader}>
          <Text style={s.entryName}>LaneStripe</Text>
          <Text style={s.entryDesc}>scrolling hazard band</Text>
        </View>
        <LaneStripe intensity="high" tone="carbon" style={s.previewInline} />
        <LaneStripe intensity="high" tone="warning" style={s.previewInline} />
      </View>

      <View style={s.entry}>
        <View style={s.entryHeader}>
          <Text style={s.entryName}>SpeedLines</Text>
          <Text style={s.entryDesc}>motion blur — loops left</Text>
        </View>
        <SpeedLines intensity="high" tone="warning" style={s.previewInline} />
        <SpeedLines intensity="medium" tone="smoke" style={s.previewInline} />
      </View>

      <Text style={s.sectionTitle}>Static</Text>

      <View style={s.entry}>
        <View style={s.entryHeader}>
          <Text style={s.entryName}>ChainLink</Text>
          <Text style={s.entryDesc}>direction · spacing · thickness</Text>
        </View>
        <View style={s.previewBox}>
          <ChainLink intensity="medium" direction="both" />
        </View>
        <View style={s.previewBox}>
          <ChainLink intensity="medium" direction="forward" spacing={12} />
        </View>
        <View style={s.previewBox}>
          <ChainLink intensity="medium" direction="backward" spacing={24} thickness={2} />
        </View>
      </View>

      <Text style={s.sectionTitle}>Composite</Text>

      <View style={s.entry}>
        <View style={s.entryHeader}>
          <Text style={s.entryName}>MetalPlate</Text>
          <Text style={s.entryDesc}>ChainLink + HUDScan — all layers configurable</Text>
        </View>
        <MetalPlate style={s.metalCard}>
          <Text style={s.metalCardBody}>Default — both directions, low intensity</Text>
        </MetalPlate>
        <MetalPlate
          intensity="medium"
          chainDirection="forward"
          chainSpacing={12}
          style={s.metalCard}
        >
          <Text style={s.metalCardBody}>forward / spacing 12 / medium intensity</Text>
        </MetalPlate>
        <MetalPlate
          intensity="low"
          chainDirection="backward"
          chainThickness={2}
          scanIntensity="high"
          style={s.metalCard}
        >
          <Text style={s.metalCardBody}>backward / thick lines / high scan</Text>
        </MetalPlate>
      </View>

    </ScrollView>
  );
}

const meta = {
  title: 'Foundations/Placeholders',
  component: PlaceholdersCatalog,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PlaceholdersCatalog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Catalog: Story = {};
