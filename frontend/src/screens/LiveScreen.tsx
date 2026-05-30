import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, getTBRLevel } from '../theme';
import { useEEGStream, formatCountdown } from '../hooks/useEEGStream';
import { fetchCognitionSeries, resolveParticipantId, type BackendBandPowers } from '../api';
import type { TBRPoint } from '../types';

const SW = Dimensions.get('window').width;
const CHART_W = SW - 32;

const TIME_RANGES = ['5m', '10m', '30m', '1h'];
const RANGE_SECONDS = [5 * 60, 10 * 60, 30 * 60, 3600];

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

function fmtPower(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M au`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k au`;
  return `${v.toFixed(1)} au`;
}

function TBRChart({ history, rangeIdx }: { history: TBRPoint[]; rangeIdx: number }) {
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

  const filtered = useMemo(() => {
    if (history.length === 0) return [];
    const cutoff = RANGE_SECONDS[rangeIdx];
    const maxTime = history[history.length - 1].time;
    return history.filter(p => maxTime - p.time <= cutoff);
  }, [history, rangeIdx]);

  const pts = useMemo(() => {
    if (filtered.length === 0) return [];
    const t0 = filtered[0].time;
    const span = filtered[filtered.length - 1].time - t0;
    return filtered.map(p => ({
      t: span > 0 ? (p.time - t0) / span : 0,
      v: p.tbr,
    }));
  }, [filtered]);

  const py = (v: number) => padTop + plotH - ((v - tbrMin) / (tbrMax - tbrMin)) * plotH;
  const px = (t: number) => padL + t * plotW;

  const linePts = pts.map(p => ({ x: px(p.t), y: py(p.v) }));
  const lineD = catmullRom(linePts);
  const areaD = lineD
    ? `${lineD} L ${px(1)} ${padTop + plotH} L ${px(0)} ${padTop + plotH} Z`
    : '';

  const timeLabels = [`-${TIME_RANGES[rangeIdx]}`, '', '', '', 'Now'];

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

        {pts.map((p, i) => (
          <Circle key={i} cx={px(p.t)} cy={py(p.v)} r={3} fill={colors.purp} />
        ))}

        {pts.length > 0 && (
          <>
            <Circle cx={px(1)} cy={py(pts[pts.length - 1].v)} r={6} fill={colors.purp} opacity={0.25} />
            <Circle cx={px(1)} cy={py(pts[pts.length - 1].v)} r={3.5} fill={colors.purp} />
          </>
        )}
      </Svg>

      {zones.map(z => (
        <Text
          key={z.label}
          style={[styles.zoneLabel, { color: z.color, top: py((z.min + Math.min(z.max, tbrMax)) / 2) - 5 }]}
        >
          {z.label}
        </Text>
      ))}

      <View style={[styles.timeAxis, { marginLeft: padL, width: plotW }]}>
        {timeLabels.map((t, i) => <Text key={i} style={styles.timeTick}>{t}</Text>)}
      </View>
    </View>
  );
}

export default function LiveScreen() {
  const stream = useEEGStream();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [liveBands, setLiveBands] = useState<BackendBandPowers | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchBands() {
      try {
        const pid = await resolveParticipantId();
        if (!pid || cancelled) return;
        const series = await fetchCognitionSeries(pid, 5, '20s');
        const pts = series.points;
        if (pts.length > 0 && !cancelled) {
          setLiveBands(pts[pts.length - 1].band_powers);
        }
      } catch {}
    }
    fetchBands();
    const t = setInterval(fetchBands, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const level = getTBRLevel(stream.tbr);

  const b = liveBands ?? stream.bands;
  const bandBars = useMemo(() => {
    const bands = [
      { label: 'Delta (1–4 Hz)',   color: colors.tl,    v: b.delta },
      { label: 'Theta (4–8 Hz)',   color: colors.warn,   v: b.theta },
      { label: 'Alpha (8–13 Hz)',  color: colors.purpL,  v: b.alpha },
      { label: 'Beta (13–30 Hz)', color: colors.teal,   v: b.beta  },
      { label: 'Gamma (30–50 Hz)',color: colors.warnL,  v: b.gamma },
    ];
    const maxV = Math.max(...bands.map(bd => bd.v), 1e-12);
    return bands.map(bd => ({ ...bd, pct: bd.v / maxV }));
  }, [b]);

  const tbrDelta = useMemo(() => {
    const h = stream.tbrHistory;
    if (h.length < 2) return null;
    return h[h.length - 1].tbr - h[h.length - 2].tbr;
  }, [stream.tbrHistory]);

  const tbrVsBaseline = stream.prediction?.tbr_vs_baseline ?? null;
  const trend = stream.prediction?.trend ?? 'stable';

  const lastPullLabel = stream.lastPullAgo < 60
    ? `${stream.lastPullAgo}s ago`
    : `${Math.floor(stream.lastPullAgo / 60)}m ago`;

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Latest Reading</Text>
      <Text style={styles.subtitle}>AWear EEG · Polled every 20 s</Text>

      {stream.error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{stream.error}</Text>
        </View>
      )}

      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: stream.isConnected ? colors.good : colors.warn }]} />
          <Text style={[styles.statusText, { color: stream.isConnected ? colors.good : colors.warn }]}>
            {stream.isConnected ? `Last pull: ${lastPullLabel}` : 'Connecting…'}
          </Text>
        </View>
        <Text style={styles.nextText}>Next in {formatCountdown(stream.nextPullIn)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Latest Snapshot</Text>
        <Text style={styles.cardSub}>{stream.epochsInWindow} pts · Welch PSD · n_fft=256</Text>

        <View style={styles.snapshotRow}>
          <View style={styles.snapshotLeft}>
            <Text style={styles.tbrLabel}>TBR</Text>
            <Text style={[styles.tbrValue, { color: level.color }]}>
              {stream.tbr > 0 ? stream.tbr.toFixed(1) : '—'}
            </Text>
            <View style={[styles.fatigueBadge, { backgroundColor: level.color + '22', borderColor: level.color + '55' }]}>
              <Text style={[styles.fatigueBadgeText, { color: level.color }]}>
                {level.label.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.snapshotRight}>
            <Text style={styles.avgLabel}>Latest window avg</Text>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>θ Power</Text>
              <Text style={[styles.powerVal, { color: colors.warn }]}>{fmtPower(b.theta)}</Text>
            </View>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>β Power</Text>
              <Text style={[styles.powerVal, { color: colors.teal }]}>{fmtPower(b.beta)}</Text>
            </View>
            <View style={styles.powerRow}>
              <Text style={styles.powerBand}>α Power</Text>
              <Text style={[styles.powerVal, { color: colors.purpL }]}>{fmtPower(b.alpha)}</Text>
            </View>
          </View>
        </View>

        {tbrDelta !== null && (
          <Text style={styles.deltaLine}>
            {tbrDelta >= 0 ? '↑' : '↓'} {Math.abs(tbrDelta).toFixed(2)} from last pull · {trend}
          </Text>
        )}
        {tbrVsBaseline !== null && (
          <Text style={styles.baselineLine}>
            {tbrVsBaseline >= 0 ? '↑' : '↓'} {Math.abs(tbrVsBaseline).toFixed(1)} vs baseline (first 3 pts)
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Band Powers · latest window</Text>
        {bandBars.map(b => (
          <View key={b.label} style={styles.barRow}>
            <Text style={styles.barLabel}>{b.label}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${b.pct * 100}%`, backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.chartHeader}>
          <Text style={styles.cardTitle}>TBR History · 20s buckets</Text>
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
        <TBRChart history={stream.tbrHistory} rangeIdx={rangeIdx} />
      </View>

      <View style={styles.howCard}>
        <View style={styles.howDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.howTitle}>How it works</Text>
          <Text style={styles.howBody}>
            AWear API polled every 20 s → 20s buckets → bandpass_fft per band → Welch PSD → TBR computed
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

  errorBar: {
    backgroundColor: colors.severe + '22', borderRadius: 10, padding: 10, marginTop: 12,
  },
  errorText: { fontSize: 12, color: colors.severe },

  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bg2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 16,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500' },
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
