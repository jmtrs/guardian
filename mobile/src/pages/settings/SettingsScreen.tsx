import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { accentFromHue, hueOfHex, THEME_PRESETS, useThemeControls, useUITheme } from '@/ui/theme';

import { createStyles } from './SettingsScreen.styles';

const LANGUAGES = [
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
];

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const controls = useThemeControls();

  const isCustom = controls.settings.presetId === 'custom';
  const hue = hueOfHex(controls.activeAccent);

  return (
    <ScreenFrame>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && styles.chipPressed]}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.title}>{t('settings.title')}</Text>
        </View>

        {/* APPEARANCE */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.appearance')}</Text>

          <View style={styles.panel}>
            <Text style={styles.fieldLabel}>{t('settings.theme')}</Text>
            <Text style={styles.fieldHint}>{t('settings.themeHint')}</Text>
            <View style={styles.chipRow}>
              {THEME_PRESETS.map((preset) => {
                const active = controls.settings.presetId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => controls.setPreset(preset.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <View style={[styles.chipSwatch, { backgroundColor: preset.accent }]} />
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => controls.setCustomAccent(controls.activeAccent)}
                style={({ pressed }) => [
                  styles.chip,
                  isCustom && styles.chipActive,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipLabel, isCustom && styles.chipLabelActive]}>CUSTOM</Text>
              </Pressable>
            </View>

            {/* Custom accent picker — only when CUSTOM is selected. */}
            {isCustom ? (
              <View style={{ gap: theme.tokens.spacing['2'] }}>
                <Text style={styles.fieldHint}>{t('settings.customAccentHint')}</Text>
                <View style={styles.accentRow}>
                  <View
                    style={[
                      styles.accentPreview,
                      {
                        backgroundColor: controls.activeAccent,
                        borderColor: theme.semantic.accent.glow,
                      },
                    ]}
                  />
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={360}
                    value={hue}
                    onValueChange={(h) => controls.setCustomAccent(accentFromHue(h))}
                    minimumTrackTintColor={theme.semantic.accent.warning}
                    maximumTrackTintColor={theme.semantic.border.metal}
                    thumbTintColor={theme.semantic.accent.glow}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* LANGUAGE */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
          <View style={styles.panel}>
            <View style={styles.chipRow}>
              {LANGUAGES.map((lang) => {
                const active = i18n.language?.startsWith(lang.id);
                return (
                  <Pressable
                    key={lang.id}
                    onPress={() => i18n.changeLanguage(lang.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* SESSION */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('settings.session')}</Text>
          <Pressable
            onPress={() => authClient.signOut()}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.chipPressed]}
          >
            <Text style={styles.logoutText}>{t('auth.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}
