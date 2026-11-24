import type { Register, ThemeSetArgs } from 'claude-code'

import { COLORS, PROBLEMS } from './palette'
import { SCENE } from './scene'

const PLUGIN = 'violet-glitch'

const LOOK: ThemeSetArgs = {
  colors: COLORS,
  backdrop: {
    scene: 'violet-glitch',
    // a thin frost: panels stay readable, the ASCII still shows through them
    glass: { blur: 4, tint: '#0b0910', opacity: 0.8 },
  },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = PROBLEMS.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    // A session can start before the app attaches; the theme still stands and draws
    // once it does. An earlier version left a status saying otherwise, and the
    // app keeps a status across reloads, so clear it here.
    $.ui.status(undefined)
    await $.theme.set(LOOK)

    return next(e)
  })

  // The scene moves on its own, in characters only: nothing here reacts to
  // the pointer or to what Claude is doing.
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    if (e.props.plugin !== PLUGIN) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        source={SCENE}
        alt="A night city typed in ASCII under a slowly turning ringed violet planet"
        isInteractive
      />
    )
  })
}
