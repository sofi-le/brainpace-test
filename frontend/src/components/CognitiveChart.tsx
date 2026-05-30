/**
 * CognitiveChart — Smooth TBR-over-time graph with fatigue zone bands.
 * Pure react-native-svg, no external chart libs needed.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { colors } from '../theme';
import type { TBRPoint } from '../types';

interface Props {
  data: TBRPoint[];
  width?: number;
  height?: number;
  showZones?: boolean;
  showPrediction?: boolean;
  predictedSevereMin?: number | null;
}

const ZONES = [
  { label: 'Alert',   yMin: 0,   yMax: 0.4, color: colors.good },
  { label: 'Mild',    yMin: 0.4, yMax: 0.6, color: colors.warnL },
  { label: 'Signif.', yMin: 0.6, yMax: 0.8, color: colors.warn },
  { label: 'Severe',  yMin: 0.8, yMax: 1.0, color: colors.severe },
];

// Catmull-Rom spline for smooth curves
function catmullRomPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  const n = points.length;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n - 1, i + 1)];
    const p3 = points[Math.min(n - 1, i + 2)];

    // Convert Catmull-Rom to cubic Bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function CognitiveChart({
  data,
  width = 340,
  height = 200,
  showZones = true,
  showPrediction = true,
  predictedSevereMin = null,
}: Props) {
  const pad = { top: 8, right: 8, bottom: 20, left: 6 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // Normalize TBR 0-5 → pixel coords (inverted Y: top = severe)
  const points = useMemo(() => {
    if (data.length < 2) return [];
    const minT = data[0].time;
    const maxT = data[data.length - 1].time;
    const range = Math.max(1, maxT - minT);

    return data.map(pt => ({
      x: pad.left + ((pt.time - minT) / range) * chartW,
      y: pad.top + chartH - (Math.min(5, pt.tbr) / 5) * chartH,
    }));
  }, [data, chartW, chartH]);

  const linePath = useMemo(() => catmullRomPath(points), [points]);

  // Area fill path (close to bottom)
  const areaPath = useMemo(() => {
    if (!linePath || points.length < 2) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${linePath} L ${last.x} ${pad.top + chartH} L ${first.x} ${pad.top + chartH} Z`;
  }, [linePath, points, chartH]);

  // Current point (last)
  const current = points[points.length - 1];
  const currentTBR = data.length > 0 ? data[data.length - 1].tbr : 0;

  return (
    <View style={[styles.container, { width, height: height + 30 }]}>
      {/* Zone labels */}
      {showZones && (
        <View style={styles.zoneLabels}>
          {ZONES.map(z => (
            <Text key={z.label} style={[styles.zoneLabel, { color: z.color, top: pad.top + z.yMin * chartH + (z.yMax - z.yMin) * chartH / 2 - 6 }]}>
              {z.label}
            </Text>
          ))}
        </View>
      )}

      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.purp} stopOpacity="0.25" />
            <Stop offset="1" stopColor={colors.purp} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Zone band backgrounds */}
        {showZones && ZONES.map(z => (
          <Rect
            key={z.label}
            x={pad.left} y={pad.top + z.yMin * chartH}
            width={chartW} height={(z.yMax - z.yMin) * chartH}
            fill={z.color} opacity={0.05}
          />
        ))}

        {/* Grid lines */}
        {ZONES.map(z => (
          <Line key={`grid-${z.label}`}
            x1={pad.left} y1={pad.top + z.yMin * chartH}
            x2={pad.left + chartW} y2={pad.top + z.yMin * chartH}
            stroke={z.color} strokeWidth={0.5} opacity={0.2}
          />
        ))}

        {/* Area fill */}
        {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}

        {/* Main line */}
        {linePath ? (
          <Path d={linePath} stroke={colors.purpL} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        ) : null}

        {/* Current position dot */}
        {current && (
          <>
            <Circle cx={current.x} cy={current.y} r={10} fill={colors.warn} opacity={0.12} />
            <Circle cx={current.x} cy={current.y} r={5} fill={colors.warn} opacity={0.3} />
            <Circle cx={current.x} cy={current.y} r={3} fill={colors.warn} />
          </>
        )}

        {/* Prediction dashed line */}
        {showPrediction && predictedSevereMin && predictedSevereMin < 30 && current && (
          <Line
            x1={current.x} y1={current.y}
            x2={current.x + 40} y2={pad.top + 0.1 * chartH}
            stroke={colors.warn} strokeWidth={1.5} strokeDasharray="4,4" opacity={0.6}
          />
        )}
      </Svg>

      {/* Current TBR label */}
      {current && (
        <View style={[styles.nowLabel, { left: Math.min(width - 50, current.x + 8), top: current.y - 8 }]}>
          <Text style={styles.nowText}>{currentTBR.toFixed(1)}</Text>
        </View>
      )}

      {/* Time axis */}
      <View style={[styles.timeAxis, { width: chartW, marginLeft: pad.left }]}>
        {data.length > 0 && ['0m', `${Math.round((data[data.length-1].time) / 120)}m`, `${Math.round((data[data.length-1].time) / 60)}m`].map((t, i) => (
          <Text key={i} style={styles.timeTick}>{t}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', backgroundColor: '#0F0D1A', borderRadius: 16, overflow: 'hidden' },
  zoneLabels: { position: 'absolute', left: 0, top: 0, bottom: 20, width: 40, zIndex: 1 },
  zoneLabel: { position: 'absolute', left: 4, fontSize: 7, fontWeight: '600' },
  nowLabel: { position: 'absolute' },
  nowText: { fontSize: 10, fontWeight: '700', color: colors.warn },
  timeAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  timeTick: { fontSize: 8, color: colors.tl },
});
