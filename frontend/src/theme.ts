// ─── Design Tokens (matches Figma brainpace page exactly) ────────────────────

export const colors = {
  bg:      '#0C0C11',
  bg2:     '#151520',
  bg3:     '#1E1E28',
  purp:    '#8752FD',
  purpL:   '#A075FE',
  purpD:   '#5A30BB',
  teal:    '#1CD6BE',
  warn:    '#FD5D43',
  warnL:   '#FE9A3B',
  good:    '#33DB85',
  severe:  '#D91E2A',
  tp:      '#F1F1F6',
  ts:      '#888899',
  tl:      '#555566',
  white:   '#FFFFFF',
  black:   '#000000',
} as const;

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, pill: 40,
} as const;

export const font = {
  regular:  'Inter_400Regular',
  medium:   'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold:     'Inter_700Bold',
} as const;

// ─── Fatigue classification (from AWear TBR research) ────────────────────────
export const FATIGUE_LEVELS = [
  { state: 'alert',               label: 'Alert',               min: 0,   max: 2.0, color: colors.good,   bgColor: '#0A2618' },
  { state: 'mild_fatigue',        label: 'Mild Fatigue',        min: 2.0, max: 3.0, color: colors.warnL,  bgColor: '#2A1A06' },
  { state: 'significant_fatigue', label: 'Significant Fatigue', min: 3.0, max: 4.0, color: colors.warn,   bgColor: '#2A0E06' },
  { state: 'severe_fatigue',      label: 'Severe Fatigue',      min: 4.0, max: 99,  color: colors.severe, bgColor: '#2A0608' },
] as const;

export function getTBRLevel(tbr: number) {
  return FATIGUE_LEVELS.find(l => tbr >= l.min && tbr < l.max) ?? FATIGUE_LEVELS[3];
}

export function tbrToColor(tbr: number): string {
  return getTBRLevel(tbr).color;
}

// Band frequency ranges (Hz) — matches your bandpass_fft config
export const BANDS = {
  delta: { label: 'Delta', range: '1–4 Hz',  color: colors.tl },
  theta: { label: 'Theta', range: '4–8 Hz',  color: colors.warn },
  alpha: { label: 'Alpha', range: '8–13 Hz', color: colors.purp },
  beta:  { label: 'Beta',  range: '13–30 Hz',color: colors.teal },
  gamma: { label: 'Gamma', range: '30–50 Hz',color: colors.warnL },
} as const;
