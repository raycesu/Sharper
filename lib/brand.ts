/**
 * Single source of truth for brand colors used in JS contexts (Recharts, lightweight-charts)
 * that cannot consume CSS custom properties directly.
 * Keep these in sync with the :root variables in globals.css.
 */
export const brand = {
  background:    '#0d0d0f',
  surface:       '#111116',
  surfaceRaised: '#16161e',
  brandStart:    '#6b8eff',
  brandEnd:      '#7c5cfc',
  brand:         '#6b8eff',
  brandB:        '#7c5cfc',
  green:         '#2ecc87',
  red:           '#ef5569',
  yellow:        '#f7c97a',
  orange:        '#f97316',
  borderSubtle:  '#1e1e2a',
  borderStrong:  '#2a2a3a',
  foreground:    '#a0a0b0',
  heading:       '#f0f0f8',
} as const
