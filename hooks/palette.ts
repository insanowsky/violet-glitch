import { makeColors } from './make-colors.js'

// Violet Glitch: near-black violet ink, electric violet light.
// One mode only: this look is a night scene.
export const { theme: COLORS, problems: PROBLEMS } = makeColors({
  label: 'Violet Glitch',
  id: 'violet-glitch',
  only: 'dark',
  roles: {
    accent: '#9b6bff',
    danger: '#ff4f6e',
    success: '#3fe0a3',
    warning: '#ffb547',
    pro: '#ff5cc8',
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b0910',
        'surface-1': '#110e18',
        'surface-2': '#16121f',
        'surface-3': '#1b1626',
        'text-primary': '#f6f2fd',
        'text-secondary': '#cbc1de',
        'text-muted': '#a198b6',
      },
    },
    git: {
      added: '#3fe0a3',
      removed: '#ff4f6e',
      modified: '#ffb547',
      merged: '#b591ff',
      closed: '#ff4f6e',
      conflicting: '#ff8a3d',
      draft: '#aaa1c0',
    },
  },
})
