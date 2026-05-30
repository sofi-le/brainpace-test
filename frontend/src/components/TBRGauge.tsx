/**
 * TBRGauge — Arc gauge showing current TBR score + fatigue state.
 * Uses react-native-svg for the arc.
 *
 * npx expo install react-native-svg
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, getTBRLevel } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  tbr: number;
  maxTBR?: number;
}

export default function TBRGauge({ tbr, maxTBR = 5 }: Props) {
  const level = getTBRLevel(tbr);
  const pct = Math.min(1, tbr / maxTBR);

  // Arc math
  const size = 200;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270° arc
  const offset = arcLength * (1 - pct);

  // Animate the arc fill
  const animVal = useRef(new Animated.Value(arcLength)).current;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: offset,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [tbr]);

  return (
    <View style={styles.container}>
      {/* Ambient glow */}
      <View style={[styles.glow, { backgroundColor: level.color + '12' }]} />

      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation="-225" origin={`${size/2}, ${size/2}`}>
          {/* Track */}
          <Circle
            cx={size/2} cy={size/2} r={radius}
            stroke={colors.bg3}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            fill="none"
            strokeLinecap="round"
          />
          {/* Fill */}
          <AnimatedCircle
            cx={size/2} cy={size/2} r={radius}
            stroke={level.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={animVal}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center text */}
      <View style={styles.center}>
        <Text style={styles.label}>COGNITIVE STRAIN</Text>
        <Text style={styles.sublabel}>Theta / Beta Ratio</Text>
        <Text style={[styles.score, { color: level.color }]}>{tbr.toFixed(1)}</Text>
        <View style={[styles.statePill, { backgroundColor: level.color }]}>
          <Text style={styles.stateText}>{level.label.toUpperCase()}</Text>
        </View>
      </View>

      {/* Scale labels */}
      <View style={styles.scaleRow}>
        {[0, 1, 2, 3, 4, 5].map(n => (
          <Text key={n} style={styles.scaleTick}>{n}</Text>
        ))}
      </View>

      {/* Scale bar */}
      <View style={styles.scaleBar}>
        <View style={[styles.seg, { flex: 2, backgroundColor: colors.good }]} />
        <View style={[styles.seg, { flex: 1, backgroundColor: colors.teal }]} />
        <View style={[styles.seg, { flex: 1, backgroundColor: colors.warnL }]} />
        <View style={[styles.seg, { flex: 1, backgroundColor: colors.warn }]} />
        <View style={[styles.seg, { flex: 1, backgroundColor: colors.severe }]} />
      </View>

      {/* Formula */}
      <Text style={styles.formula}>TBR = θ Power (4–8 Hz) ÷ β Power (13–30 Hz)</Text>
      <Text style={styles.formulaSub}>Welch PSD · 1-sec epochs · V²/Hz</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: '#1A1430', borderRadius: 22, padding: 20, paddingBottom: 16 },
  glow: { position: 'absolute', top: 20, width: 160, height: 160, borderRadius: 80 },
  center: { position: 'absolute', top: 50, alignItems: 'center', width: 180 },
  label: { fontSize: 9, fontWeight: '700', color: colors.ts, letterSpacing: 1.5 },
  sublabel: { fontSize: 10, color: colors.tl, marginTop: 2 },
  score: { fontSize: 64, fontWeight: '700', marginTop: 4 },
  statePill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, marginTop: 4 },
  stateText: { fontSize: 9, fontWeight: '800', color: '#0A0500', letterSpacing: 0.5 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', width: '80%', marginTop: 8 },
  scaleTick: { fontSize: 8, color: colors.tl },
  scaleBar: { flexDirection: 'row', width: '80%', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  seg: { height: 6 },
  formula: { fontSize: 9, fontWeight: '500', color: colors.ts, marginTop: 10 },
  formulaSub: { fontSize: 8, color: colors.tl, marginTop: 2 },
});
