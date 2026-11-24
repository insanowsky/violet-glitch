import { expect, test } from 'claude-code/testing'
import type { ThemeSetArgs } from 'claude-code'

const BACKDROP = {
  plugin: 'violet-glitch',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: {
    scene: 'violet-glitch',
    plugin: 'violet-glitch',
    glass: { blur: 4, tint: '#0b0910', opacity: 0.8 },
  },
} as const

test('the session starts in the violet look, with its scene', async ($, on) => {
  let sent: ThemeSetArgs | undefined
  on('theme.set', (_, e) => {
    sent = e
    return { value: { isDrawn: true, requestId: 'look' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(sent?.backdrop).toEqual({
    scene: 'violet-glitch',
    glass: { blur: 4, tint: '#0b0910', opacity: 0.8 },
  })
  expect(sent?.colors?.label).toBe('Violet Glitch')
})

test('the backdrop draws the ASCII scene on desktop and mobile', async $ => {
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface })
    const svg = await ui.find({ type: 'Svg' })

    expect(svg).toBeDefined()
    await ui.unmount()
  }
})
