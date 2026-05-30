import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, BANDS } from '../theme';
import { formatPower } from '../hooks/useEEGStream';

interface Props {
  band: 'theta' | 'beta' | 'alpha' | 'delta' | 'gamma';
  power: number;
  baselinePct?: number; // e.g. 42 means 42% above baseline
  rising?: boolean;
}

export default function BandCard({ band, power, baselinePct = 0, rising = false }: Props) {
  const info = BANDS[band];
  const barPct = Math.min(1, power / (20 * 1e-6)); // normalize to rough max

  return (
    <View style={[styles.card, { borderLeftColor: info.color }]}>
      <Text style={[styles.label, { color: info.color }]}>
        {band === 'theta' ? 'θ' : band === 'beta' ? 'β' : band === 'alpha' ? 'α' : band === 'delta' ? 'δ' : 'γ'} {info.label} ({info.range})
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: info.color }]}>{formatPower(power)}</Text>
        <Text style={styles.unit}>V²/Hz</Text>
      </View>
      <Text style={[styles.change, { color: rising ? colors.warnL : colors.good }]}>
        {rising ? '↑' : '↓'} {Math.abs(baselinePct)}% vs baseline
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barPct * 100}%`, backgroundColor: info.color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: colors.bg2, borderRadius: 14, padding: 12,
    borderLeftWidth: 4,
  },
  label: { fontSize: 10, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4, gap: 4 },
  value: { fontSize: 20, fontWeight: '700' },
  unit: { fontSize: 10, color: colors.ts },
  change: { fontSize: 9, marginTop: 4 },
  barTrack: { height: 4, backgroundColor: colors.bg3, borderRadius: 2, marginTop: 8 },
  barFill: { height: 4, borderRadius: 2 },
});
