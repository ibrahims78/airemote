import { useUIStore } from '../store/uiStore'

/**
 * Chart palette (data encoding, not chrome).
 *
 * Recharts writes SVG attributes, so these must be concrete colour strings —
 * CSS custom properties are not resolved inside `stroke`/`fill` props.
 * Series colours are chosen for >=3:1 against the plot background in both
 * themes; axis labels use the muted text token so they keep >=4.5:1.
 */
export interface ChartPalette {
  cpu: string
  ram: string
  disk: string
  netUp: string
  netDown: string
  grid: string
  axis: string
}

const PALETTES: Record<'dark' | 'light', ChartPalette> = {
  dark: {
    cpu: '#38bdf8',
    ram: '#2dd4bf',
    disk: '#c084fc',
    netUp: '#4ade80',
    netDown: '#38bdf8',
    grid: '#334155',
    axis: '#94a3b8'
  },
  light: {
    cpu: '#0369a1',
    ram: '#0f766e',
    disk: '#7e22ce',
    netUp: '#15803d',
    netDown: '#0369a1',
    grid: '#e2e8f0',
    axis: '#475569'
  }
}

export function useChartPalette(): ChartPalette {
  const theme = useUIStore(s => s.theme)
  return PALETTES[theme === 'light' ? 'light' : 'dark']
}
