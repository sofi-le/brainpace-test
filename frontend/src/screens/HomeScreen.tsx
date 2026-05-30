import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, getTBRLevel } from '../theme';
import { useEEGStream, formatPower } from '../hooks/useEEGStream';
import type { TBRPoint } from '../types';

const TBR_MAX = 5;

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

// Pick 4 evenly-spaced relative-time labels (e.g. "-2h", "-30m", "now").
function axisLabels(history: TBRPoint[]): string[] {
  if (history.length < 2) return [];
  const maxTime = history[history.length - 1].time;
  const idxs = [0, 1, 2, 3].map(i => Math.round((i / 3) * (history.length - 1)));
  return idxs.map(i => {
    const secAgo = maxTime - history[i].time;
    if (secAgo < 30) return 'now';
    const m = Math.round(secAgo / 60);
    if (m < 60) return `-${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `-${h}h` : `-${h}h${rem}m`;
  });
}

// Mini vertical bar chart for band cards — recent TBR points as a sparkline.
function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(0.001, ...values);
  return (
    <View style={{ flexDirection: 'row', gap: 2, height: 20, alignItems: 'flex-end', marginTop: 8 }}>
      {values.map((v, i) => (
        <View key={i} style={{ width: 4, height: Math.max(2, 20 * (v / max)), backgroundColor: color, borderRadius: 1 }} />
      ))}
    </View>
  );
}

function BandCard({
  symbol, name, range, value, pct, rising, accent, spark,
}: {
  symbol: string; name: string; range: string; value: string;
  pct: number; rising: boolean; accent: string; spark: number[];
}) {
  return (
    <View style={[styles.bandCard, { borderLeftColor: accent }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
        <Text style={[styles.bandSymName, { color: accent }]}>{symbol} {name}</Text>
      </View>
      <Text style={styles.bandRange}>{range}</Text>
      <View style={styles.bandValueRow}>
        <Text style={styles.bandValue}>{value}</Text>
        <Text style={styles.bandUnit}> V{'²'}/Hz</Text>
      </View>
      <Text style={[styles.bandDelta, { color: accent }]}>
        {rising ? '↑' : '↓'} {pct}% of total
      </Text>
      <MiniBars values={spark} color={accent} />
    </View>
  );
}

function TBRChart({ history, tbr }: { history: TBRPoint[]; tbr: number }) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = 144;
  const padL = 32;
  const padR = 12;
  const padTop = 6;
  const plotW = W - padL - padR;
  const plotH = 116;
  const zones = [
    { label: 'Severe', color: colors.severe },
    { label: 'Signif.', color: colors.warn },
    { label: 'Mild', color: colors.warnL },
    { label: 'Alert', color: colors.good },
  ];
  const zoneH = plotH / 4;

  // x by index across the window, y by TBR (high TBR sits near the top).
  const n = history.length;
  const fx = (i: number) => (n <= 1 ? 1 : i / (n - 1));
  const fy = (t: number) => Math.max(0, Math.min(1, 1 - t / TBR_MAX));
  const px = (v: number) => padL + v * plotW;
  const py = (v: number) => padTop + v * plotH;

  const linePts = history.map((p, i) => ({ x: px(fx(i)), y: py(fy(p.tbr)) }));
  const lineD = catmullRom(linePts);
  const areaD = lineD
    ? `${lineD} L ${px(1)} ${padTop + plotH} L ${px(0)} ${padTop + plotH} Z`
    : '';
  const end = linePts[linePts.length - 1];
  const labels = axisLabels(history);

  return (
    <View style={[styles.chartCard, { width: W }]}>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="tbrArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.purp} stopOpacity="0.28" />
            <Stop offset="1" stopColor={colors.purp} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {zones.map((z, i) => (
          <React.Fragment key={z.label}>
            <Rect x={padL} y={padTop + i * zoneH} width={plotW} height={zoneH} fill={z.color} opacity={0.05} />
            <Line x1={padL} y1={padTop + i * zoneH} x2={padL + plotW} y2={padTop + i * zoneH} stroke={colors.bg3} strokeWidth={1} opacity={0.5} />
          </React.Fragment>
        ))}

        {areaD ? <Path d={areaD} fill="url(#tbrArea)" /> : null}
        {lineD ? <Path d={lineD} stroke={colors.purpL} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}

        {/* one dot per 20-second sample */}
        {linePts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={1.6} fill={colors.purpL} opacity={0.7} />
        ))}

        {end ? (
          <>
            <Circle cx={end.x} cy={end.y} r={10} fill={colors.purp} opacity={0.25} />
            <Circle cx={end.x} cy={end.y} r={5} fill={colors.purp} />
            <Circle cx={end.x} cy={end.y} r={3} fill={colors.white} />
          </>
        ) : null}
      </Svg>

      {zones.map((z, i) => (
        <Text key={z.label} style={[styles.zoneLabel, { color: z.color, top: padTop + i * zoneH + zoneH / 2 - 5 }]}>{z.label}</Text>
      ))}

      {end ? (
        <Text style={[styles.chartEndLabel, { left: Math.min(W - 26, end.x + 6), top: end.y - 16 }]}>{tbr.toFixed(1)}</Text>
      ) : null}

      <View style={[styles.timeAxis, { marginLeft: padL, width: plotW }]}>
        {labels.map((t, i) => <Text key={i} style={styles.timeTick}>{t}</Text>)}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const {
    tbr, fatigueColor, bands, prediction, tbrHistory,
    isConnected, error, participantId,
  } = useEEGStream();

  const level = getTBRLevel(tbr);
  const knobLeft = Math.max(0, Math.min(100, (tbr / TBR_MAX) * 100));

  const totalPower = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma || 1;
  const thetaPct = Math.round((bands.theta / totalPower) * 100);
  const betaPct = Math.round((bands.beta / totalPower) * 100);
  const spark = tbrHistory.slice(-12).map(p => p.tbr);
  const trendArrow = prediction?.trend === 'increasing' ? '↗' : prediction?.trend === 'decreasing' ? '↘' : '→';

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.greeting}>Good morning, Alex</Text>
          <View style={styles.subRow}>
            <View style={[styles.connDot, { backgroundColor: isConnected ? colors.good : colors.warn }]} />
            <Text style={styles.subtitle}>
              AWear {'·'} {isConnected ? 'Connected' : 'Offline'} {'·'} {participantId || '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* TBR card — TBR index + fatigue meter */}
      <View style={styles.tbrCard}>
        <Text style={styles.cardHeader}>COGNITIVE STRAIN {'—'} THETA / BETA RATIO (TBR)</Text>

        <View style={styles.ringWrap}>
          <View style={[styles.glow, { backgroundColor: fatigueColor + '14' }]} />
          <Svg width={160} height={160}>
            <Circle cx={80} cy={80} r={79} stroke={colors.bg3} strokeWidth={2} fill="none" opacity={0.6} />
            <Circle cx={80} cy={80} r={50} stroke={colors.bg3} strokeWidth={2} fill="none" opacity={0.4} />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.tbrNumber, { color: fatigueColor }]}>{tbr.toFixed(1)}</Text>
            <Text style={styles.tbrIndex}>TBR index</Text>
          </View>
        </View>

        <View style={[styles.statePill, { backgroundColor: fatigueColor + '26' }]}>
          <Text style={[styles.stateText, { color: fatigueColor }]}>{trendArrow} {level.label.toUpperCase()}</Text>
        </View>

        {/* 0–5 fatigue meter */}
        <View style={styles.sliderWrap}>
          <View style={styles.sliderTrack}>
            <View style={[styles.seg, { flex: 64, backgroundColor: colors.good }]} />
            <View style={[styles.seg, { flex: 64, backgroundColor: colors.teal }]} />
            <View style={[styles.seg, { flex: 64, backgroundColor: colors.warnL }]} />
            <View style={[styles.seg, { flex: 48, backgroundColor: colors.warn }]} />
            <View style={[styles.seg, { flex: 80, backgroundColor: colors.severe }]} />
            <View style={[styles.knob, { left: `${knobLeft}%` }]} />
          </View>
          <View style={styles.tickRow}>
            <Text style={styles.tick}>0</Text>
            <Text style={styles.tick}>5</Text>
          </View>
        </View>

        <Text style={styles.formula}>TBR = {'θ'} Power (4{'–8'} Hz) / {'β'} Power (13{'–30'} Hz)</Text>
        <Text style={styles.formulaSub}>Computed via Welch PSD {'·'} 20-sec buckets {'·'} V{'²'}/Hz</Text>
      </View>

      {/* Band cards */}
      <View style={styles.bandRow}>
        <BandCard symbol={'θ'} name="Theta" range={'4–8 Hz'} value={formatPower(bands.theta)} pct={thetaPct} rising accent={colors.warn} spark={spark} />
        <View style={{ width: 8 }} />
        <BandCard symbol={'β'} name="Beta" range={'13–30 Hz'} value={formatPower(bands.beta)} pct={betaPct} rising={false} accent={colors.teal} spark={spark} />
      </View>

      {/* TBR Over Time */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>TBR Over Time</Text>
        <View style={styles.segControl}>
          {['Recent'].map((p, i) => (
            <TouchableOpacity key={p} style={[styles.segPill, i === 0 && styles.segPillActive]}>
              <Text style={[styles.segPillText, i === 0 && styles.segPillTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tbrHistory.length > 0 ? (
        <TBRChart history={tbrHistory} tbr={tbr} />
      ) : (
        <View style={styles.emptyChart}>
          <Text style={styles.emptyText}>{error ?? 'Loading TBR data…'}</Text>
        </View>
      )}

      {/* Nudge banner */}
      {prediction ? (
        <TouchableOpacity style={styles.nudge} activeOpacity={0.85}>
          <View style={styles.nudgeIcon}><Text style={{ fontSize: 16 }}>{'⚡'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nudgeTitle}>TBR {tbr.toFixed(1)} {'—'} {prediction.recommendation}</Text>
            <Text style={styles.nudgeSub}>
              {prediction.predicted_severe_in_min != null
                ? `Predicted severe in ~${prediction.predicted_severe_in_min} min at current slope`
                : prediction.retention_note}
            </Text>
            <Text style={styles.nudgeAction}>Start breathing exercise {'→'}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 62 },

  header: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.purp, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.white },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.white },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.good },
  subtitle: { fontSize: 11, color: colors.ts },

  tbrCard: { marginTop: 16, backgroundColor: colors.bg2, borderRadius: 22, paddingTop: 16, paddingBottom: 18, paddingHorizontal: 16, alignItems: 'center', overflow: 'hidden' },
  cardHeader: { fontSize: 10, fontWeight: '600', color: colors.ts, letterSpacing: 1.2, textAlign: 'center' },

  ringWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  glow: { position: 'absolute', width: 150, height: 150, borderRadius: 75 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  tbrNumber: { fontSize: 68, fontWeight: '800', lineHeight: 76 },
  tbrIndex: { fontSize: 12, color: colors.ts, marginTop: -2 },

  statePill: { marginTop: 8, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6 },
  stateText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  sliderWrap: { width: '100%', marginTop: 18, paddingHorizontal: 4 },
  sliderTrack: { flexDirection: 'row', height: 8, borderRadius: 4, position: 'relative' },
  seg: { height: 8 },
  knob: { position: 'absolute', top: -3, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.bg, shadowColor: colors.black, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  tick: { fontSize: 9, color: colors.tl },

  formula: { fontSize: 10, fontWeight: '500', color: colors.ts, marginTop: 14, alignSelf: 'flex-start', paddingLeft: 4 },
  formulaSub: { fontSize: 9, color: colors.tl, marginTop: 3, alignSelf: 'flex-start', paddingLeft: 4 },

  bandRow: { flexDirection: 'row', marginTop: 14 },
  bandCard: { flex: 1, backgroundColor: colors.bg2, borderRadius: 12, padding: 12, borderLeftWidth: 4 },
  bandSymName: { fontSize: 11, fontWeight: '600' },
  bandRange: { fontSize: 9, color: colors.tl, marginTop: 2 },
  bandValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  bandValue: { fontSize: 18, fontWeight: '700', color: colors.white },
  bandUnit: { fontSize: 9, color: colors.ts },
  bandDelta: { fontSize: 9, marginTop: 4 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.white },
  segControl: { flexDirection: 'row', gap: 6 },
  segPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  segPillActive: { backgroundColor: colors.purp },
  segPillText: { fontSize: 11, color: colors.ts },
  segPillTextActive: { color: colors.white, fontWeight: '600' },

  chartCard: { backgroundColor: colors.bg, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  zoneLabel: { position: 'absolute', left: 4, fontSize: 8, fontWeight: '600' },
  chartEndLabel: { position: 'absolute', fontSize: 10, fontWeight: '700', color: colors.warn },
  timeAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingBottom: 6 },
  timeTick: { fontSize: 8, color: colors.tl },

  emptyChart: { height: 144, borderRadius: 12, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 12, color: colors.ts, paddingHorizontal: 24, textAlign: 'center' },

  nudge: { flexDirection: 'row', backgroundColor: colors.purp, borderRadius: 14, padding: 14, marginTop: 16, alignItems: 'flex-start', gap: 12 },
  nudgeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' },
  nudgeTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  nudgeSub: { fontSize: 10, color: '#EDE7FF', marginTop: 3 },
  nudgeAction: { fontSize: 10, fontWeight: '600', color: colors.white, marginTop: 6 },
});
