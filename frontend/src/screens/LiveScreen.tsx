import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, getTBRLevel, FATIGUE_LEVELS } from '../theme';

const SW = Dimensions.get('window').width;
const CHART_W = SW - 32;

// Placeholder data — reflects a 5-min polled snapshot
const SNAPSHOT = {
  tbr: 3.2,
  tbrDelta: 0.4,
  tbrVsBaseline: 1.4,
  thetaPower: 14.6e-6,
  betaPower: 4.6e-6,
  alphaPower: 8.4e-6,
  lastPullMin: 2,
  nextPullSec: 180, // 3:00
};

const BAND_BARS = [
  { label: 'Delta (1–4 Hz)',   color: colors.tl,    pct: 0.14 },
  { label: 'Theta (4–8 Hz)',   color: colors.warn,   pct: 0.92 },
  { label: 'Alpha (8–13 Hz)',  color: colors.purpL,  pct: 0.55 },
  { label: 'Beta (13–30 Hz)', color: colors.teal,   pct: 0.30 },
  { label: 'Gamma (30–50 Hz)',color: colors.warnL,  pct: 0.08 },
];

// TBR history points (x=fraction of window, y=TBR value)
const TBR_HISTORY = [
  { t: 0.00, v: 1.8 }, { t: 0.08, v: 1.9 }, { t: 0.16, v: 2.1 },
  { t: 0.24, v: 2.4 }, { t: 0.32, v: 2.2 }, { t: 0.38, v: 2.6 },
  { t: 0.44, v: 2.3 }, { t: 0.50, v: 2.8 }, { t: 0.56, v: 2.5 },
  { t: 0.62, v: 2.9 }, { t: 0.68, v: 3.0 }, { t: 0.75, v: 2.8 },
  { t: 0.82, v: 3.1 }, { t: 0.88, v: 3.0 }, { t: 0.94, v: 3.1 },
  { t: 1.00, v: 3.2 },
];

const TIME_RANGES = ['2h', '6h', '12h', '24h'];

function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatPower(v: number) {
  return `${(v * 1e6).toFixed(1)}e-6 V²/Hz`;
}

function TBRChart({ rangeIdx }: { rangeIdx: number }) {
  const padL = 8;
  const padR = 8;
  const padTop = 20;
  const plotH = 120;
  const plotW = CHART_W - 32 - padL - padR;
  const tbrMin = 1.0;
  const tbrMax = 4.5;

  const zones = [
    { label: 'Alert',    color: colors.good,   min: 0,   max: 2.0 },
    { label: 'Mild',     color: colors.warnL,  min: 2.0, max: 3.0 },
    { label: 'Signif.',  color: colors.warn,   min: 3.0, max: 4.0 },
    { label: 'Severe',   color: colors.severe, min: 4.0, max: 4.5 },
  ];

  const py = (v: number) => padTop + plotH - ((v - tbrMin) / (tbrMax - tbrMin)) * plotH;
  const px = (t: number) => padL + t * plotW;

  const linePts = TBR_HISTORY.map(p => ({ x: px(p.t), y: py(p.v) }));
  const lineD = catmullRom(linePts);
  const areaD = lineD
    ? `${lineD} L ${px(1)} ${padTop + plotH} L ${px(0)} ${padTop + plotH} Z`
    : '';

  const timeLabels = ['-2h', '-1h30', '-1h', '-30m', 'Now'];

  return (
    <View>
      <Svg width={CHART_W - 32} height={plotH + padTop + 4}>
        <Defs>
          <LinearGradient id="tbrArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.purp} stopOpacity="0.3" />
            <Stop offset="1" stopColor={colors.purp} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {zones.map(z => {
          const y1 = py(Math.min(z.max, tbrMax));
          const y2 = py(Math.max(z.min, tbrMin));
          return (
            <React.Fragment key={z.label}>
              <Rect x={padL} y={y1} width={plotW} height={y2 - y1} fill={z.color} opacity={0.04} />
              <Line x1={padL} y1={y1} x2={padL + plotW} y2={y1} stroke={colors.bg3} strokeWidth={0.5} opacity={0.6} />
            </React.Fragment>
          );
        })}

        {areaD ? <Path d={areaD} fill="url(#tbrArea)" /> : null}
        {lineD ? <Path d={lineD} stroke={colors.purpL} strokeWidth={2} fill="none" strokeLinecap="round" /> : null}

        {TBR_HISTORY.map((p, i) => (
          <Circle key={i} cx={px(p.t)} cy={py(p.v)} r={3} fill={colors.purp} />
        ))}

        {/* Now marker */}
        <Circle cx={px(1)} cy={py(TBR_HISTORY[TBR_HISTORY.length - 1].v)} r={6} fill={colors.purp} opacity={0.25} />
        <Circle cx={px(1)} cy={py(TBR_HISTORY[TBR_HISTORY.length - 1].v)} r={3.5} fill={colors.purp} />
      </Svg>

      {/* Zone labels */}
      {zones.map(z => (
        <Text
          key={z.label}
          style={[styles.zoneLabel, { color: z.color, top: py((z.min + Math.min(z.max, tbrMax)) / 2) - 5 }]}
        >
          {z.label}
        </Text>
      ))}

      {/* Time axis */}
      <View style={[styles.timeAxis, { marginLeft: padL, width: plotW }]}>
        {timeLabels.map(t => <Text key={t} style={styles.timeTick}>{t}</Text>)}
      </View>
    </View>
  );
}

export default function LiveScreen() {
  const [countdown, setCountdown] = useState(SNAPSHOT.nextPullSec);
  const [rangeIdx, setRangeIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : 300)), 1000);
    return () => clearInterval(t);
  }, []);

  const level = getTBRLevel(SNAPSHOT.tbr);

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Text style={styles.title}>Latest Reading</Text>
      <Text style={styles.subtitle}>AWear EEG · Polled every 5 min</Text>

      {/* Poll status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={styles.greenDot} />
          <Text style={styles.statusText}>Last pull: {SNAPSHOT.lastPullMin} min ago</Text>
        </View>
        <Text style={styles.nextText}>Next in {formatSec(countdown)}</Text>
      </View>

      {/* Snapshot card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>5-Minute Snapshot</Text>
        <Text style={styles.cardSub}>300 epochs · Welch PSD · n_fft=256</Text>

        <View style={styles.snapshotRow}>
          <View style={styles.snapshotLeft}>
            <Text style={styles.tbrLabel}>TBR</Text>
            <Text style={[styles.tbrValue, { color: level.color }]}>{SNAPSHOT.tbr.toFixed(1)}</Text>
            <View style={[styles.fatigueBadge, { backgroundColor: level.color + '22', borderColor: level.color + '55' }]}>
              <Text style={[styles.fatigueBadgeText, { color: level.color }]}>
                {level.label.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.snapshotRight}>
            <Text style={styles.avgLabel}>Avg over window</Text>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>θ Power</Text>
              <Text style={[styles.powerVal, { color: colors.warn }]}>{formatPower(SNAPSHOT.thetaPower)}</Text>
            </View>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>β Power</Text>
              <Text style={[styles.powerVal, { color: colors.teal }]}>{formatPower(SNAPSHOT.betaPower)}</Text>
            </View>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>α Power</Text>
              <Text style={[styles.powerVal, { color: colors.purpL }]}>{formatPower(SNAPSHOT.alphaPower)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.deltaLine}>
          ↑ {SNAPSHOT.tbrDelta.toFixed(1)} from last pull · Rising
        </Text>
        <Text style={styles.baselineLine}>
          ↑ {SNAPSHOT.tbrVsBaseline.toFixed(1)} above baseline (first 30 epochs)
        </Text>
      </View>

      {/* Band power bars */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Band Powers · 300-epoch avg</Text>
        {BAND_BARS.map(b => (
          <View key={b.label} style={styles.barRow}>
            <Text style={styles.barLabel}>{b.label}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${b.pct * 100}%`, backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </View>

      {/* TBR history chart */}
      <View style={styles.card}>
        <View style={styles.chartHeader}>
          <Text style={styles.cardTitle}>TBR History · 5-min intervals</Text>
          <View style={styles.rangePills}>
            {TIME_RANGES.map((r, i) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangePill, i === rangeIdx && styles.rangePillActive]}
                onPress={() => setRangeIdx(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rangePillText, i === rangeIdx && styles.rangePillTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TBRChart rangeIdx={rangeIdx} />
      </View>

      {/* How it works */}
      <View style={styles.howCard}>
        <View style={styles.howDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.howTitle}>How it works</Text>
          <Text style={styles.howBody}>
            AWear API polled every 5 min → 300 1-sec epochs → bandpass_fft per band → Welch PSD → TBR computed
          </Text>
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 60 },

  title: { fontSize: 28, fontWeight: '700', color: colors.tp },
  subtitle: { fontSize: 12, color: colors.tl, marginTop: 4 },

  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bg2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 16,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.good },
  statusText: { fontSize: 13, color: colors.good, fontWeight: '500' },
  nextText: { fontSize: 13, color: colors.ts },

  card: { backgroundColor: colors.bg2, borderRadius: 16, padding: 16, marginTop: 14 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.tp },
  cardSub: { fontSize: 10, color: colors.tl, marginTop: 3 },

  snapshotRow: { flexDirection: 'row', marginTop: 14, gap: 16 },
  snapshotLeft: { gap: 6 },
  tbrLabel: { fontSize: 11, fontWeight: '600', color: colors.ts, letterSpacing: 0.5 },
  tbrValue: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  fatigueBadge: {
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  fatigueBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  snapshotRight: { flex: 1, justifyContent: 'flex-end', gap: 4, paddingBottom: 4 },
  avgLabel: { fontSize: 9, color: colors.ts, marginBottom: 4 },
  powerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  powerBand: { fontSize: 10, color: colors.tl },
  powerVal: { fontSize: 10, fontWeight: '600' },

  deltaLine: { fontSize: 11, color: colors.warnL, marginTop: 12 },
  baselineLine: { fontSize: 11, color: colors.warnL, marginTop: 4 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  barLabel: { fontSize: 10, color: colors.ts, width: 110 },
  barTrack: { flex: 1, height: 6, backgroundColor: colors.bg3, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },

  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  rangePills: { flexDirection: 'row', gap: 4 },
  rangePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.bg3 },
  rangePillActive: { backgroundColor: colors.purp },
  rangePillText: { fontSize: 11, fontWeight: '600', color: colors.ts },
  rangePillTextActive: { color: colors.white },

  zoneLabel: { position: 'absolute', left: 0, fontSize: 8, fontWeight: '600' },
  timeAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeTick: { fontSize: 9, color: colors.tl },

  howCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.bg2, borderRadius: 14, padding: 14, marginTop: 14,
  },
  howDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purp, marginTop: 3 },
  howTitle: { fontSize: 13, fontWeight: '600', color: colors.tp },
  howBody: { fontSize: 11, color: colors.tl, marginTop: 4, lineHeight: 17 },
});
