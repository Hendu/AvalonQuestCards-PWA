// =============================================================================
// theme.ts
//
// Design constants -- same palette as the React Native version.
// In web we use these as CSS values directly in style objects or CSS strings.
// =============================================================================

export const COLORS = {
  bgDark:        '#0D0F1A',
  bgCard:        '#161826',
  bgElevated:    '#1E2136',
  gold:          '#C9A84C',
  goldLight:     '#E8C96A',
  goldDark:      '#8A6E2E',
  good:          '#4CAF89',
  goodDim:       '#2A6B52',
  evil:          '#C94C4C',
  evilDim:       '#7A2A2A',
  textPrimary:   '#EDE8D8',
  textSecondary: '#B0B0C0',  // was #8A8A9A -- much more readable on dark backgrounds
  textMuted:     '#888899',  // was #4A4A5A -- was nearly invisible, now legible
  border:        '#3A3D55',  // was #2A2D45 -- slightly brighter so borders show
  borderGold:    '#5A4A20',
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// Minimum readable font sizes -- nothing in the app should go below 11px.
// Use these instead of hardcoded px values in components.
export const FONT = {
  tiny:   11,   // was 8-9px -- labels, badges, alignment tags
  small:  12,   // was 10-11px -- section labels, hints
  body:   14,   // standard body text
  medium: 16,   // player names, important UI text
  large:  20,   // subheadings
  xl:     26,   // quest labels, scores
  xxl:    32,   // room codes, big numbers
};

// Common reusable CSS snippets as template strings
export const SHADOWS = {
  text:      'text-shadow: 0 2px 8px rgba(0,0,0,0.8)',
  textLight: 'text-shadow: 0 1px 4px rgba(0,0,0,0.6)',
  box:       'box-shadow: 0 4px 16px rgba(0,0,0,0.4)',
};
