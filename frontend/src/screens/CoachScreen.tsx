import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, StyleSheet as RN,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

// ─── Constants ────────────────────────────────────────────────────────────────
const SQ = 164;
const INSET = 28;
const PERIMETER = SQ * 4;
const PHASE_DUR = 4;

const PHASES = [
  { label: 'Inhale', color: colors.good },
  { label: 'Hold',   color: colors.purpL },
  { label: 'Exhale', color: colors.teal },
  { label: 'Hold',   color: colors.purpL },
];

const EXERCISES = [
  { id: 1, icon: '🫁',  name: 'Box Breathing',        tag: 'stress relief', dur: '4:00' },
  { id: 2, icon: '🌊',  name: '4-7-8 Breathing',      tag: 'deep calm',     dur: '3:30' },
  { id: 3, icon: '😮‍💨', name: 'Physiological Sigh',   tag: 'acute stress',  dur: '1:00' },
  { id: 4, icon: '🧘',  name: 'Body Scan',             tag: 'mental reset',  dur: '5:00' },
  { id: 5, icon: '🎵',  name: 'Sound Bath',            tag: 'alpha boost',   dur: '8:00' },
  { id: 6, icon: '👁️', name: '5-4-3-2-1 Grounding',  tag: 'panic relief',  dur: '2:00' },
  { id: 7, icon: '🌬️', name: 'Resonant Breathing',   tag: 'HRV optimize',  dur: '6:00' },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── Section 4: Box Breathing Player ─────────────────────────────────────────
function BoxBreathingPlayer({
  initialCalm,
  onCalmChange,
  onStop,
}: {
  initialCalm: number;
  onCalmChange: (v: number) => void;
  onStop: () => void;
}) {
  const dashOffset = useRef(new Animated.Value(PERIMETER)).current;
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(PHASE_DUR);
  const svgSize = SQ + INSET * 2;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(dashOffset, {
        toValue: 0,
        duration: PHASE_DUR * 4 * 1000,
        useNativeDriver: false,
      }),
    );
    anim.start();

    let elapsed = 0;
    let calm = initialCalm;
    const tick = setInterval(() => {
      elapsed++;
      const rem = elapsed % PHASE_DUR;
      setCountdown(rem === 0 ? PHASE_DUR : PHASE_DUR - rem);
      setPhaseIdx(Math.floor(elapsed / PHASE_DUR) % 4);
      calm = Math.min(65, calm + 0.4);
      onCalmChange(calm);
    }, 1000);

    return () => {
      clearInterval(tick);
      anim.stop();
      dashOffset.setValue(PERIMETER);
    };
  }, []);

  const phase = PHASES[phaseIdx];
  // Path: bottom-left → top-left (inhale) → top-right (hold) → bottom-right (exhale) → bottom-left (hold)
  const sqPath = [
    `M ${INSET},${INSET + SQ}`,
    `L ${INSET},${INSET}`,
    `L ${INSET + SQ},${INSET}`,
    `L ${INSET + SQ},${INSET + SQ}`,
    `L ${INSET},${INSET + SQ}`,
  ].join(' ');

  return (
    <View style={styles.playerCard}>
      <View style={{ alignItems: 'center' }}>
        {/* SVG + center overlay */}
        <View style={{ width: svgSize, height: svgSize }}>
          <Svg width={svgSize} height={svgSize}>
            {/* ghost square */}
            <Path d={sqPath} stroke={colors.bg3} strokeWidth={2} fill="none" />
            {/* animated stroke */}
            <AnimatedPath
              d={sqPath}
              stroke={colors.purp}
              strokeWidth={2.5}
              fill="none"
              strokeDasharray={`${PERIMETER}`}
              strokeDashoffset={dashOffset}
            />
          </Svg>
          {/* phase label + countdown */}
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={[styles.phaseLabel, { color: phase.color }]}>{phase.label}</Text>
            <Text style={styles.phaseCountdown}>{countdown}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.stopBtn} onPress={onStop} activeOpacity={0.8}>
        <Text style={styles.stopBtnText}>Stop Session</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CoachScreen() {
  const [selectedId, setSelectedId] = useState(1);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [calmPct, setCalmPct] = useState(42);

  const showPlayer = sessionStarted && selectedId === 1;

  // Mock state: ELEVATED
  const STATE = 'ELEVATED' as 'CALM' | 'ELEVATED' | 'STRESSED';
  const stateColor =
    STATE === 'CALM' ? colors.good :
    STATE === 'ELEVATED' ? colors.warnL :
    colors.warn;

  function handleStart() {
    setSelectedId(1);
    setSessionStarted(true);
  }

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>

      {/* ── Section 1: Brain State Header ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTag}>🧠 YOUR BRAIN STATE</Text>
        <View style={[styles.statePill, { backgroundColor: stateColor + '22', borderColor: stateColor + '55' }]}>
          <Text style={[styles.statePillText, { color: stateColor }]}>{STATE}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${calmPct}%` }]} />
        </View>
        <Text style={styles.calmPctText}>{Math.round(calmPct)}% calm</Text>
      </View>

      {/* ── Section 2: Coach Recommendation ── */}
      <View style={styles.card}>
        <Text style={styles.coachHeading}>✦ Coach recommends</Text>
        <Text style={styles.coachReason}>Your stress is elevated.</Text>
        <Text style={styles.coachExercise}>→ Box Breathing</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleStart} activeOpacity={0.8}>
          <Text style={styles.ctaBtnText}>Start Session</Text>
        </TouchableOpacity>
      </View>

      {/* ── Section 3: Exercise List ── */}
      <Text style={styles.listHeader}>Breathing Exercises</Text>
      {EXERCISES.map(ex => {
        const active = ex.id === selectedId;
        return (
          <TouchableOpacity
            key={ex.id}
            style={[styles.exRow, active && styles.exRowActive]}
            onPress={() => { setSelectedId(ex.id); setSessionStarted(false); }}
            activeOpacity={0.75}
          >
            {active && <View style={styles.exAccent} />}
            <Text style={styles.exIcon}>{ex.icon}</Text>
            <View style={styles.exMid}>
              <Text style={[styles.exName, active && { color: colors.tp }]}>{ex.name}</Text>
              <Text style={styles.exTag}>{ex.tag}</Text>
            </View>
            <Text style={styles.exDur}>{ex.dur}</Text>
          </TouchableOpacity>
        );
      })}

      {/* ── Section 4: Box Breathing Player ── */}
      {showPlayer && (
        <BoxBreathingPlayer
          initialCalm={calmPct}
          onCalmChange={setCalmPct}
          onStop={() => setSessionStarted(false)}
        />
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 60 },

  // Section 1
  card: { backgroundColor: colors.bg2, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTag: { fontSize: 10, fontWeight: '700', color: colors.ts, letterSpacing: 1, marginBottom: 12 },
  statePill: {
    alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 16,
  },
  statePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  barTrack: {
    height: 8, backgroundColor: colors.bg3, borderRadius: 4, overflow: 'hidden',
  },
  barFill: {
    height: 8, borderRadius: 4, backgroundColor: colors.purp,
    shadowColor: colors.purp, shadowOpacity: 0.7, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  calmPctText: { fontSize: 11, color: colors.ts, marginTop: 8 },

  // Section 2
  coachHeading: { fontSize: 16, fontWeight: '700', color: colors.purp, marginBottom: 6 },
  coachReason: { fontSize: 13, color: colors.tl, fontStyle: 'italic', marginBottom: 4 },
  coachExercise: { fontSize: 18, fontWeight: '700', color: colors.tp, marginBottom: 16 },
  ctaBtn: {
    backgroundColor: colors.purp, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
    shadowColor: colors.purp, shadowOpacity: 0.5, shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  // Section 3
  listHeader: { fontSize: 13, fontWeight: '600', color: colors.ts, letterSpacing: 0.5, marginBottom: 10 },
  exRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg2, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 8, overflow: 'hidden',
    gap: 12,
  },
  exRowActive: { borderWidth: 0 },
  exAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: colors.purp,
  },
  exIcon: { fontSize: 22 },
  exMid: { flex: 1, gap: 3 },
  exName: { fontSize: 14, fontWeight: '600', color: colors.ts },
  exTag: { fontSize: 10, color: colors.tl },
  exDur: { fontSize: 12, color: colors.ts },

  // Section 4
  playerCard: {
    backgroundColor: colors.bg2, borderRadius: 20, padding: 20,
    marginTop: 6, marginBottom: 14, alignItems: 'center', gap: 20,
  },
  phaseLabel: { fontSize: 22, fontWeight: '700' },
  phaseCountdown: { fontSize: 42, fontWeight: '800', color: colors.tp, lineHeight: 48 },
  stopBtn: {
    width: '100%', backgroundColor: colors.bg3, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  stopBtnText: { fontSize: 14, fontWeight: '600', color: colors.ts },
});
