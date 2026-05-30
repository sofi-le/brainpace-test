import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, getTBRLevel } from '../theme';
import { useEEGStream, formatDuration } from '../hooks/useEEGStream';

const SW = Dimensions.get('window').width;
const CHART_W = SW - 56;

const PAST_SESSIONS = [
  { label: 'Monday Session',    time: '9:30 AM',  dur: '2h',     tbr: 2.8, breaks: 3 },
  { label: 'Friday Session',    time: '2:15 PM',  dur: '1h 40m', tbr: 3.6, breaks: 1 },
  { label: 'Wednesday Session', time: '11:00 AM', dur: '1h 15m', tbr: 2.1, breaks: 2 },
];

// Chart curve data (fractions of plot area, y=0 top=Severe, y=1 bottom=Alert)
const CURVE: { x: number; y: number }[] = [
  { x: 0.0,  y: 0.92 },
  { x: 0.08, y: 0.85 },
  { x: 0.16, y: 0.72 },
  { x: 0.24, y: 0.55 },
  { x: 0.32, y: 0.40 },
  { x: 0.38, y: 0.48 },
  { x: 0.44, y: 0.60 },
  { x: 0.50, y: 0.70 },
  { x: 0.56, y: 0.65 },
  { x: 0.62, y: 0.50 },
  { x: 0.68, y: 0.42 },
  { x: 0.75, y: 0.30 },
  { x: 0.82, y: 0.22 },
  { x: 0.88, y: 0.18 },
  { x: 0.94, y: 0.20 },
  { x: 1.0,  y: 0.15 },
];

const BREAK_X = 0.50; // break at ~60m mark

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

const ZONES = [
  { label: 'Severe',  color: colors.severe },
  { label: 'Signif.', color: colors.warn },
  { label: 'Mild',    color: colors.warnL },
  { label: 'Alert',   color: colors.good },
];

function SessionChart() {
  const padL = 36;
  const padR = 8;
  const padTop = 8;
  const plotW = CHART_W - padL - padR;
  const plotH = 160;
  const zoneH = plotH / 4;

  const px = (fx: number) => padL + fx * plotW;
  const py = (fy: number) => padTop + fy * plotH;

  const linePts = CURVE.map(p => ({ x: px(p.x), y: py(p.y) }));
  const lineD = catmullRom(linePts);
  const areaD = lineD
    ? `${lineD} L ${px(1)} ${padTop + plotH} L ${px(0)} ${padTop + plotH} Z`
    : '';
  const end = linePts[linePts.length - 1];
  const breakX = px(BREAK_X);

  const timeLabels = ['0m', '30m', '60m', '90m', 'now'];

  return (
    <View>
      <Svg width={CHART_W} height={plotH + padTop + 4}>
        <Defs>
          <LinearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.purp} stopOpacity="0.25" />
            <Stop offset="1" stopColor={colors.purp} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {/* Zone bands + dividers */}
        {ZONES.map((z, i) => (
          <React.Fragment key={z.label}>
            <Rect
              x={padL} y={padTop + i * zoneH}
              width={plotW} height={zoneH}
              fill={z.color} opacity={0.04}
            />
            <Line
              x1={padL} y1={padTop + i * zoneH}
              x2={padL + plotW} y2={padTop + i * zoneH}
              stroke={colors.bg3} strokeWidth={0.5} opacity={0.6}
            />
          </React.Fragment>
        ))}

        {/* Break marker — green vertical band */}
        <Rect
          x={breakX - 8} y={padTop}
          width={16} height={plotH}
          fill={colors.good} opacity={0.12}
        />
        <Line
          x1={breakX} y1={padTop}
          x2={breakX} y2={padTop + plotH}
          stroke={colors.good} strokeWidth={1} opacity={0.5}
        />

        {/* Area + line */}
        {areaD ? <Path d={areaD} fill="url(#chartArea)" /> : null}
        {lineD ? (
          <Path d={lineD} stroke={colors.purpL} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}

        {/* End marker */}
        <Circle cx={end.x} cy={end.y} r={8} fill={colors.purp} opacity={0.2} />
        <Circle cx={end.x} cy={end.y} r={4.5} fill={colors.purp} />
        <Circle cx={end.x} cy={end.y} r={2.5} fill={colors.white} />
      </Svg>

      {/* Zone labels (absolute positioned over SVG) */}
      {ZONES.map((z, i) => (
        <Text
          key={z.label}
          style={[styles.zoneLabel, { color: z.color, top: padTop + i * zoneH + zoneH / 2 - 5 }]}
        >
          {z.label}
        </Text>
      ))}

      {/* BREAK label */}
      <Text style={[styles.breakLabel, { left: breakX - 16, top: padTop - 2 }]}>BREAK</Text>

      {/* Time axis */}
      <View style={[styles.timeAxis, { marginLeft: padL, width: plotW }]}>
        {timeLabels.map(t => <Text key={t} style={styles.timeTick}>{t}</Text>)}
      </View>
    </View>
  );
}

export default function StudyScreen() {
  const { tbr, prediction, tbrHistory, sessionSec, breakCount, logBreak } = useEEGStream();
  const retention = prediction?.estimated_retention ?? 68;

  const stats = [
    { label: 'DURATION', value: formatDuration(sessionSec), color: colors.tp },
    { label: 'AVG TBR',  value: tbr.toFixed(1), color: colors.teal },
    { label: 'BREAKS',   value: `${breakCount}/3`, color: colors.tp },
    { label: 'RETAIN',   value: `${retention}%`, color: colors.good },
  ];

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <Text style={styles.title}>Study Session</Text>
      <View style={styles.subRow}>
        <View style={styles.connDot} />
        <Text style={styles.subtitle}>Organic Chemistry \u00B7 AWear streaming</Text>
      </View>

      {/* Stat pills */}
      <View style={styles.pillRow}>
        {stats.map(s => (
          <View key={s.label} style={styles.statPill}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Chart card */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Session fatigue (TBR)</Text>
          <TouchableOpacity style={styles.breakNowBtn} onPress={logBreak} activeOpacity={0.8}>
            <Text style={styles.breakNowText}>BREAK NOW</Text>
          </TouchableOpacity>
        </View>
        <SessionChart />
      </View>

      {/* Fatigue Prediction card */}
      <View style={styles.predCard}>
        <View style={styles.predHeader}>
          <View style={styles.predIconWrap}>
            <Text style={styles.predIcon}>{'\u26A1'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.predTitle}>Fatigue Prediction</Text>
            <Text style={styles.predSub}>Based on TBR slope from 42 prior sessions</Text>
          </View>
        </View>

        <View style={styles.predStats}>
          <View style={styles.predStat}>
            <Text style={styles.predStatLabel}>To severe</Text>
            <Text style={[styles.predStatValue, { color: colors.warn }]}>~12 min</Text>
          </View>
          <View style={styles.predStat}>
            <Text style={styles.predStatLabel}>Break at</Text>
            <Text style={[styles.predStatValue, { color: colors.tp }]}>NOW</Text>
          </View>
          <View style={styles.predStat}>
            <Text style={styles.predStatLabel}>Recovery</Text>
            <Text style={[styles.predStatValue, { color: colors.teal }]}>8-10 min</Text>
          </View>
        </View>

        <Text style={styles.predNote}>
          {'\u2192'} You lose ~40% retention past TBR 3.5
        </Text>
      </View>

      {/* Past Sessions */}
      <Text style={styles.sectionTitle}>Past Sessions</Text>
      {PAST_SESSIONS.map(se => {
        const level = getTBRLevel(se.tbr);
        return (
          <View key={se.label} style={styles.sessionRow}>
            <View style={[styles.sessionBorder, { backgroundColor: level.color }]} />
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionName}>{se.label}</Text>
              <Text style={styles.sessionMeta}>{se.time} \u00B7 {se.dur} \u00B7 {se.breaks} break{se.breaks !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.tbrBadge}>
              <Text style={[styles.tbrBadgeValue, { color: level.color }]}>{se.tbr.toFixed(1)}</Text>
              <Text style={styles.tbrBadgeLabel}>TBR</Text>
            </View>
          </View>
        );
      })}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 60 },

  title: { fontSize: 28, fontWeight: '700', color: colors.tp },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  connDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.good },
  subtitle: { fontSize: 12, color: colors.tl },

  pillRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statPill: { flex: 1, backgroundColor: colors.bg2, borderRadius: 10, padding: 10 },
  statLabel: { fontSize: 8, fontWeight: '600', color: colors.ts, letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },

  chartCard: { backgroundColor: colors.bg2, borderRadius: 16, padding: 16, marginTop: 16, overflow: 'hidden', position: 'relative' },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: colors.tp },
  breakNowBtn: { backgroundColor: colors.teal, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  breakNowText: { fontSize: 10, fontWeight: '700', color: colors.bg, letterSpacing: 0.3 },

  zoneLabel: { position: 'absolute', left: 4, fontSize: 8, fontWeight: '600' },
  breakLabel: { position: 'absolute', fontSize: 8, fontWeight: '700', color: colors.good },
  timeAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeTick: { fontSize: 9, color: colors.tl },

  predCard: { backgroundColor: colors.bg2, borderRadius: 16, padding: 16, marginTop: 16 },
  predHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  predIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purp + '30', alignItems: 'center', justifyContent: 'center' },
  predIcon: { fontSize: 16 },
  predTitle: { fontSize: 14, fontWeight: '600', color: colors.tp },
  predSub: { fontSize: 10, color: colors.tl, marginTop: 2 },
  predStats: { flexDirection: 'row', marginTop: 16, gap: 8 },
  predStat: { flex: 1 },
  predStatLabel: { fontSize: 9, color: colors.ts },
  predStatValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  predNote: { fontSize: 10, color: colors.tl, marginTop: 14 },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.tp, marginTop: 24, marginBottom: 12 },
  sessionRow: { flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: 12, marginBottom: 8, overflow: 'hidden', alignItems: 'center' },
  sessionBorder: { width: 4, alignSelf: 'stretch' },
  sessionInfo: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  sessionName: { fontSize: 14, fontWeight: '600', color: colors.tp },
  sessionMeta: { fontSize: 10, color: colors.ts, marginTop: 4 },
  tbrBadge: { alignItems: 'center', justifyContent: 'center', marginRight: 14, gap: 1 },
  tbrBadgeValue: { fontSize: 18, fontWeight: '700' },
  tbrBadgeLabel: { fontSize: 8, fontWeight: '600', color: colors.ts, letterSpacing: 0.5 },
});
