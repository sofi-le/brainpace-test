import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, FATIGUE_LEVELS, BANDS } from '../theme';
import { useEEGStream, formatPower } from '../hooks/useEEGStream';

export default function ReportScreen() {
  const { tbr, bands, prediction } = useEEGStream();

  const bandBars = [
    { key: 'delta' as const, pct: 0.12 },
    { key: 'theta' as const, pct: 0.82 },
    { key: 'alpha' as const, pct: 0.48 },
    { key: 'beta'  as const, pct: 0.26 },
    { key: 'gamma' as const, pct: 0.08 },
  ];

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Fatigue Analysis</Text>
      <Text style={styles.subtitle}>Today {'\u00B7'} Welch PSD {'\u00B7'} 1-sec epochs</Text>

      {/* Classification table */}
      <Text style={styles.sectionTitle}>Fatigue Classification from EEG</Text>
      <Text style={styles.sectionSub}>TBR = Theta Power (4{'\u2013'}8 Hz) / Beta Power (13{'\u2013'}30 Hz)</Text>

      {FATIGUE_LEVELS.map(level => {
        const isCurrent = tbr >= level.min && tbr < level.max;
        return (
          <View
            key={level.state}
            style={[
              styles.classRow,
              isCurrent && { backgroundColor: level.bgColor, borderLeftColor: level.color, borderLeftWidth: 4 },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: level.color }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.classLabel, isCurrent && { fontWeight: '700', color: colors.tp }]}>
                  {level.state === 'severe_fatigue' ? 'Severe / Drowsiness' : level.label}
                </Text>
                {isCurrent && <Text style={styles.youBadge}>{'\u2190'} YOU</Text>}
              </View>
              <Text style={styles.classDesc}>
                {level.state === 'alert' && 'Normal cognitive function. Focused.'}
                {level.state === 'mild_fatigue' && 'Theta rising, beta dropping. Early signs.'}
                {level.state === 'significant_fatigue' && 'Cognitive load impaired. Break recommended.'}
                {level.state === 'severe_fatigue' && 'Risk of microsleeps. Stop immediately.'}
              </Text>
            </View>
            <Text style={[styles.classTBR, { color: level.color }]}>
              TBR {level.min === 0 ? '~1\u20132' : level.min === 2 ? '~2\u20133' : level.min === 3 ? '>3' : '>4\u20135'}
            </Text>
          </View>
        );
      })}

      {/* Band power bars */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Absolute Band Powers (V{'\u00B2'}/Hz)</Text>
      <Text style={styles.sectionSub}>From psd_welch() {'\u00B7'} n_fft=256 {'\u00B7'} 1-sec {'\u00B7'} fmax=50</Text>

      {bandBars.map(b => {
        const info = BANDS[b.key];
        const power = bands[b.key];
        return (
          <View key={b.key} style={styles.barRow}>
            <Text style={styles.barLabel}>{info.label} ({info.range})</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${b.pct * 100}%`, backgroundColor: info.color }]} />
            </View>
            <Text style={[styles.barValue, { color: info.color }]}>{formatPower(power)}</Text>
          </View>
        );
      })}

      {/* Baseline comparison */}
      <View style={styles.compareCard}>
        <Text style={styles.compareLabel}>vs Baseline (first 30 epochs)</Text>
        <Text style={styles.compareValue}>
          {'\u2191'} {prediction?.tbr_vs_baseline?.toFixed(1) ?? '1.4'} TBR above baseline
        </Text>
        <Text style={styles.compareSub}>
          Baseline TBR: {prediction?.baseline_tbr?.toFixed(1) ?? '1.8'} {'\u00B7'} Current: {tbr.toFixed(1)}
        </Text>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: colors.tp },
  subtitle: { fontSize: 12, color: colors.tl, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.tp, marginTop: 20 },
  sectionSub: { fontSize: 10, color: colors.tl, marginTop: 3, marginBottom: 12 },

  classRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg2, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  classLabel: { fontSize: 14, color: colors.ts, fontWeight: '600' },
  classDesc: { fontSize: 10, color: colors.tl, marginTop: 3 },
  classTBR: { fontSize: 11, fontWeight: '600' },
  youBadge: { fontSize: 10, fontWeight: '700', color: colors.warn },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  barLabel: { fontSize: 11, color: colors.ts, width: 110 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.bg3, borderRadius: 4 },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { fontSize: 11, fontWeight: '600', width: 56, textAlign: 'right' },

  compareCard: { backgroundColor: colors.bg2, borderRadius: 14, padding: 16, marginTop: 20 },
  compareLabel: { fontSize: 12, fontWeight: '600', color: colors.ts },
  compareValue: { fontSize: 22, fontWeight: '700', color: colors.good, marginTop: 8 },
  compareSub: { fontSize: 10, color: colors.tl, marginTop: 6 },
});
