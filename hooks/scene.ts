// The Violet Glitch backdrop: a night city under a ringed violet planet,
// all of it typed out of ASCII, braille and block characters. Everything that
// moves does so as characters swapping, frame by frame, on its own clock.
// Built once, at load, as one SVG string.

const W = 1600
const H = 1000
// Cascadia Mono's advance, in em. It ships with Windows and carries braille
// and block glyphs at that same width, so every layer lines up on one grid.
const ADV = 0.5859375
const FONTS = '"Cascadia Mono", Consolas, "SF Mono", Menlo, ui-monospace, monospace'
const NB = ' ' // a space that never collapses, so the columns stay put

// ---------------------------------------------------------------- helpers

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

function bayer(r: number, c: number): number {
  return (BAYER[(r % 4) * 4 + (c % 4)] ?? 0) / 16 - 0.5
}

function pick(ramp: string, v: number, d: number): string {
  const n = ramp.length - 1
  const i = Math.max(0, Math.min(n, Math.floor(v * n + 0.5 + d)))
  const ch = ramp[i] ?? ' '
  return ch === ' ' ? NB : ch
}

const f = (n: number): string => (Math.round(n * 10) / 10).toString()

function blank(cols: number, rowsN: number): string[][] {
  return Array.from({ length: rowsN }, () => Array.from({ length: cols }, () => NB))
}

// `origin` is the column every row of the grid's layers starts from.
type Grid = { x0: number; y0: number; cw: number; ch: number; origin: number }

// One <text> per row, trimmed at its right end. Every row starts at the
// grid's origin and is padded out with spaces, so the font's own advance
// keeps the columns true. No textLength: the app times each frame of a
// moving scene, and stretched text costs it ten times as much to draw.
function rows(grid: string[][], g: Grid, shifts: ReadonlyMap<number, number> = new Map()): string {
  let out = ''
  const x = f(g.x0 + g.origin * g.cw)
  for (let r = 0; r < grid.length; r++) {
    const cells = grid[r] ?? []
    let a = 0
    let b = cells.length - 1
    while (a <= b && cells[a] === NB) a++
    while (b >= a && cells[b] === NB) b--
    if (a > b) {
      continue
    }
    const pad = Math.max(0, a - g.origin + (shifts.get(r) ?? 0))
    const line = NB.repeat(pad) + cells.slice(a, b + 1).join('')
    const y = g.y0 + r * g.ch + g.ch * 0.78
    out += `<text x="${x}" y="${f(y)}">${line}</text>`
  }
  return out
}

// The first inked column across some grids, less room for rows shifted left.
function inkStart(grids: string[][][], slack: number): number {
  let min = Infinity
  for (const grid of grids) {
    for (const cells of grid) {
      const a = cells.findIndex(c => c !== NB)
      if (a >= 0) {
        min = Math.min(min, a)
      }
    }
  }
  return Number.isFinite(min) ? Math.max(0, min - slack) : 0
}

const pc = (n: number): string => `${Math.round(n * 100) / 100}%`

// Seconds to the millisecond, for steps that must meet exactly.
const ms = (n: number): string => (Math.round(n * 1000) / 1000).toString()

// Everything that moves here is a glyph swapped for another, never a fade.
// A layer is shown for its share of a cycle and hidden the rest, on the
// stylesheet's clock; a hidden layer costs nothing to draw. The layer left
// showing where animation is off carries no visibility, the others are
// hidden in markup. A turn ends exactly where the next begins: two glyphs
// drawn over each other for even a frame or two light the whole planet up
// at every swap. All timing lives in the stylesheet.
function turnKeyframes(name: string, share: number): string {
  const end = `${Math.ceil(share * 1e6) / 1e4}%`
  return `@keyframes ${name} { 0% { visibility: visible; } ${end} { visibility: hidden; } 100% { visibility: hidden; } }`
}

// The delay that shows a layer from `at` seconds into a cycle of `cycle`.
function delayAt(at: number, cycle: number): string {
  return `-${ms((((cycle - at) % cycle) + cycle) % cycle)}s`
}

const hidden = (shown: boolean): string => (shown ? '' : ' visibility="hidden"')

// A cell that keeps changing glyph, through `glyphs` in turn.
type Live = { r: number; c: number; glyphs: string[] }

// Live cells run on a few clocks, so they never all change at once. Each
// clock and glyph is one element, its glyphs placed on the grid by x and y.
function shimmer(
  live: Live[],
  g: Grid,
  name: string,
  clocks: number,
  seed: number,
  min: number,
  max: number,
): { markup: string; css: string } {
  const rand = rng(seed)
  const turns = live[0]?.glyphs.length ?? 3
  let markup = ''
  let css = ` .${name} { animation: ${name} 1s linear infinite; } ${turnKeyframes(name, 1 / turns)}`
  for (let k = 0; k < clocks; k++) {
    const mine = live.filter((_, i) => i % clocks === k)
    // whole milliseconds per turn, so turn after turn meets exactly
    const per = Math.round(((min + rand() * (max - min)) * 1000) / turns)
    const dur = (per * turns) / 1000
    const start = Math.round(rand() * dur * 1000) / 1000
    for (let v = 0; v < turns; v++) {
      const spots = mine.map(l => ({ x: g.x0 + l.c * g.cw, y: g.y0 + l.r * g.ch + g.ch * 0.78, g: l.glyphs[v] ?? NB }))
      markup += placed(spots, ` class="${name} ${name}${k}-${v}"${hidden(v === 0)}`)
      css += ` .${name}${k}-${v} { animation-duration: ${ms(dur)}s; animation-delay: ${delayAt(start + (v * per) / 1000, dur)}; }`
    }
  }
  return { markup, css }
}

// A handful of timings, reused, so the stylesheet holds every clock.
function timings(prefix: string, count: number, seed: number, min: number, max: number): string {
  const rand = rng(seed)
  let css = ''
  for (let i = 0; i < count; i++) {
    const dur = min + rand() * (max - min)
    css += ` .${prefix}${i} { animation-duration: ${f(dur)}s; animation-delay: -${f(rand() * dur)}s; }`
  }
  return css
}

// ----------------------------------------------------------------- planet

const P = { cx: 1290, cy: 300, R: 205 }
const PFS = 12
const PCW = PFS * ADV
const PCH = PFS * 1.12
const PX0 = 820
const PY0 = 24
const PCOLS = Math.ceil((W - PX0) / PCW)
const PROWS = Math.ceil((640 - PY0) / PCH)

const SPHERE_RAMP = ' .`:-=+*xo#%@'
const RING_RAMP = ' .:-=+*'
const BLOCKS = '░▒▓█'

// The surface pattern repeats every third of a revolution, so this many
// frames loop it seamlessly. Each frame swaps its changing glyphs in place,
// all in the same instant.
const SPIN_FRAMES = 16
const SPIN_STEP = 2 // seconds each frame holds
const GLITCH_FRAME = 9
const TORN = [15, 22]
const THIRD = (2 * Math.PI) / 3

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

type Planet = { base: string; frames: string; ring: string; ringLive: string; css: string }

function planet(): Planet {
  const ring = blank(PCOLS, PROWS)
  const ringCells: { r: number; c: number; v: number }[] = []
  const L = norm([-0.82, -0.4, 0.42])
  const tilt = (-14 * Math.PI) / 180
  const flat = 0.24
  const ca = Math.cos(tilt)
  const sa = Math.sin(tilt)
  const depth = Math.sqrt(1 - flat * flat)

  type Cell = { r: number; c: number; Xr: number; Yr: number; zs: number; diff: number; rim: number }
  const cells: Cell[] = []

  for (let r = 0; r < PROWS; r++) {
    for (let c = 0; c < PCOLS; c++) {
      const X = (PX0 + (c + 0.5) * PCW - P.cx) / P.R
      const Y = (PY0 + (r + 0.5) * PCH - P.cy) / P.R
      const d2 = X * X + Y * Y
      const zs = d2 <= 1 ? Math.sqrt(1 - d2) : -Infinity

      // the ring: a tilted flat disc through the centre
      const Xr = X * ca + Y * sa
      const Yr = -X * sa + Y * ca
      const rr = Math.sqrt(Xr * Xr + (Yr / flat) ** 2)
      const zr = (Yr / flat) * depth
      let ringV = 0
      if (rr > 1.3 && rr < 2.08) {
        const band = rr < 1.5 ? 1 : rr < 1.57 ? 0 : rr < 1.9 ? 0.85 - (rr - 1.57) * 1.2 : 0.3
        const grain = 0.86 + 0.14 * Math.sin(rr * 64)
        const lit = Math.min(1, Math.max(0.35, 0.72 - Xr * 0.22 + (zr > 0 ? 0.18 : 0)))
        // the planet's shadow falls across the far side of the ring
        const shade = zr < 0 && Math.abs(Xr) < 1.02 ? 0.18 : 1
        ringV = band * grain * lit * shade
      }
      const ringInFront = ringV > 0 && zr > zs

      if (zs > -Infinity && !ringInFront) {
        const diff = Math.max(0, X * L[0] + Y * L[1] + zs * L[2])
        const edge = Math.min(1, Math.max(0, (X + 0.15) / 1.05))
        const rim = Math.pow(1 - zs, 2.4) * edge * edge
        cells.push({ r, c, Xr, Yr, zs, diff, rim })
      } else if (ringV > 0) {
        ring[r]![c] = pick(RING_RAMP, ringV, bayer(r, c) * 0.9)
        ringCells.push({ r, c, v: ringV })
      }
    }
  }

  // the ring, every frame and the torn rows share one origin, so they overlay
  // cell for cell in whatever monospace font draws them
  const sphereInk = blank(PCOLS, PROWS)
  for (const cell of cells) {
    sphereInk[cell.r]![cell.c] = '@'
  }
  const PGRID: Grid = { x0: PX0, y0: PY0, cw: PCW, ch: PCH, origin: inkStart([ring, sphereInk], 4) }

  // rows knocked sideways in every frame: the glitch that stays
  const knocked = new Map<number, number>([
    [13, 2],
    [18, -1],
    [26, 1],
  ])
  const rand = rng(77)
  const turn: string[][][] = []

  for (let k = 0; k < SPIN_FRAMES; k++) {
    const sphere = blank(PCOLS, PROWS)
    const phase = (k / SPIN_FRAMES) * THIRD
    for (const cell of cells) {
      const lat = Math.asin(Math.max(-1, Math.min(1, cell.Yr)))
      const lon = Math.atan2(cell.Xr, cell.zs) + phase
      const bands = 0.5 + 0.5 * Math.sin(lat * 10.5 + 1.5 * Math.sin(lon * 3 + lat * 3))
      // a storm every third of a turn, riding the southern belt
      const sl = lon - Math.round(lon / THIRD) * THIRD
      const dl = lat - 0.3
      const e = Math.sqrt((dl * dl) / 0.006 + (sl * sl) / 0.04)
      const eye = Math.exp(-e * e)
      const wall = Math.exp(-((e - 1.4) ** 2) / 0.25)
      const texture = bands * (1 - 0.8 * eye) + 0.28 * wall
      const v = Math.min(1, Math.pow(cell.diff, 0.85) * (0.62 + 0.38 * texture) + cell.rim * 0.72)
      sphere[cell.r]![cell.c] = pick(SPHERE_RAMP, v, bayer(cell.r, cell.c) * 0.9)
    }
    turn.push(sphere)
  }

  // Glyphs every frame shares are drawn once, under the frames, which keep
  // only the cells that change. The rows that tear keep all their glyphs.
  const base = blank(PCOLS, PROWS)
  for (const cell of cells) {
    if (TORN.includes(cell.r)) {
      continue
    }
    const first = turn[0]![cell.r]![cell.c]!
    if (turn.every(s => s[cell.r]![cell.c] === first)) {
      base[cell.r]![cell.c] = first
      for (const s of turn) {
        s[cell.r]![cell.c] = NB
      }
    }
  }

  const cycle = SPIN_FRAMES * SPIN_STEP
  const tornShifts = new Map<number, number>([
    [15, 4],
    [22, -3],
  ])
  let frames = ''
  let css = ` .fr { animation: fr ${ms(cycle)}s linear infinite; } ${turnKeyframes('fr', 1 / SPIN_FRAMES)}`

  turn.forEach((sphere, k) => {
    // once a turn, two rows break into blocks for a beat
    let torn: string[][] | undefined
    if (k === GLITCH_FRAME) {
      torn = blank(PCOLS, PROWS)
      for (const r of TORN) {
        for (let c = 0; c < PCOLS; c++) {
          if (sphere[r]![c] !== NB && rand() < 0.85) {
            torn[r]![c] = BLOCKS[Math.floor(rand() * BLOCKS.length)] ?? '░'
            sphere[r]![c] = NB
          }
        }
      }
    }
    let body = rows(sphere, PGRID, knocked)
    if (torn !== undefined) {
      body += `<g fill="#ff5cc8" opacity="0.75">${rows(torn, PGRID, tornShifts)}</g>`
    }
    frames += `<g class="fr p${k}"${hidden(k === 0)}>${body}</g>`
    css += ` .p${k} { animation-delay: ${delayAt(k * SPIN_STEP, cycle)}; }`
  })

  // dust in the ring catching the light: a few of its glyphs flick brighter
  // and dimmer, each on its own clock
  const glint = rng(31)
  const live: Live[] = []
  for (const { r, c, v } of ringCells) {
    if (glint() >= 0.1) {
      continue
    }
    const d = bayer(r, c) * 0.9
    const glyphs = [ring[r]![c]!, pick(RING_RAMP, Math.min(1, v * (1.25 + 0.4 * glint())), d), pick(RING_RAMP, v * (0.45 + 0.3 * glint()), d)]
    if (glyphs.every(gl => gl === glyphs[0])) {
      continue
    }
    live.push({ r, c, glyphs })
    ring[r]![c] = NB
  }
  const glints = shimmer(live, PGRID, 'rg', 4, 33, 6, 10)

  return {
    base: rows(base, PGRID, knocked),
    frames,
    ring: rows(ring, PGRID),
    ringLive: glints.markup,
    css: css + glints.css,
  }
}

// ---------------------------------------------------------- braille dust

const braille = (bits: number): string => String.fromCharCode(0x2800 + bits)

function dots(n: number, rand: () => number): number {
  let bits = 0
  for (let i = 0; i < n; i++) {
    bits |= 1 << Math.floor(rand() * 8)
  }
  return bits
}

// A faint band of star dust across the sky, drawn in braille dots. Some of
// its cells keep rearranging their dots.
function dust(seed: number): { markup: string; css: string } {
  const rand = rng(seed)
  const stir = rng(seed + 1)
  const live: Live[] = []
  const fs = 12
  const g0 = { x0: 0, y0: 0, cw: fs * ADV, ch: fs * 1.12 }
  const cols = Math.ceil(1180 / g0.cw)
  const rowsN = Math.ceil(640 / g0.ch)
  const g = { ...g0, origin: 0 }
  const grid = blank(cols, rowsN)
  // the band runs from low on the left up toward the planet
  const ax = 0
  const ay = 600
  const bx = 1180
  const by = 40
  const len = Math.hypot(bx - ax, by - ay)
  const nx = -(by - ay) / len
  const ny = (bx - ax) / len
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * g.cw
      const y = (r + 0.5) * g.ch
      const dist = (x - ax) * nx + (y - ay) * ny
      const along = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len)
      const wobble = 22 * Math.sin(along * 9) + 14 * Math.sin(along * 23 + 1)
      const core = Math.exp(-(((dist - wobble) / 62) ** 2))
      const clump = 0.55 + 0.45 * Math.sin(x * 0.021 + Math.sin(y * 0.017) * 2) * Math.sin(y * 0.013 + x * 0.004)
      const density = core * clump * Math.min(1, along * 3) * Math.min(1, (1 - along) * 4)
      const count = Math.round(density * 6 * rand() + (rand() < density * 0.5 ? 1 : 0))
      if (count <= 0) {
        continue
      }
      const bits = dots(count, rand)
      if (stir() < 0.14) {
        const n = Math.max(1, count + Math.round(stir() * 2 - 1))
        live.push({ r, c, glyphs: [braille(bits), braille(dots(n, stir)), braille(dots(n, stir))] })
      } else {
        grid[r]![c] = braille(bits)
      }
    }
  }
  const stirred = shimmer(live, g, 'ds', 4, seed + 2, 9, 15)
  return {
    markup: `<g font-size="${fs}" fill="#b9a2ff" opacity="0.2">${rows(grid, { ...g, origin: inkStart([grid], 0) })}${stirred.markup}</g>`,
    css: stirred.css,
  }
}

// ------------------------------------------------------------------ stars

// Stars are few elements, each placing many glyphs by its own x and y
// lists: the app redraws the whole scene every frame to time it, and every
// element costs, where a glyph more in one element costs next to nothing.
type Spot = { x: number; y: number; g: string }

function placed(list: Spot[], attrs: string): string {
  if (list.length === 0) {
    return ''
  }
  const xs = list.map(s => f(s.x)).join(' ')
  const ys = list.map(s => f(s.y)).join(' ')
  return `<text${attrs} x="${xs}" y="${ys}">${list.map(s => s.g).join('')}</text>`
}

function stars(seed: number): string {
  const rand = rng(seed)
  const glyphs = ['.', '.', '.', '`', '+', '*', 'x', '.']
  const still = new Map<string, Spot[]>()
  const twinkling: { at: Spot[]; o: number }[] = Array.from({ length: 6 }, () => ({ at: [], o: 0 }))
  let n = 0
  let twinkles = 0
  for (let i = 0; i < 400 && n < 96; i++) {
    const x = rand() * W
    const y = 20 + rand() * 660
    const dx = (x - P.cx) / (P.R * 2.15)
    const dy = (y - P.cy) / (P.R * 1.1)
    if (dx * dx + dy * dy < 1) {
      continue
    }
    const middle = x > 470 && x < 1130
    if (middle && rand() < 0.75) {
      continue
    }
    const o = middle ? 0.16 + rand() * 0.12 : 0.24 + rand() * 0.5
    const twinkle = !middle && twinkles < 16 && rand() < 0.3
    if (twinkle) {
      const group = twinkling[twinkles % 6]!
      group.at.push({ x, y, g: '.' })
      group.o = Math.max(group.o, o)
      twinkles++
    } else {
      const g = glyphs[Math.floor(rand() * glyphs.length)] ?? '.'
      const size = g === '.' ? 13 + rand() * 6 : 9 + rand() * 4
      // a few sizes and brightnesses, so stars share elements
      const key = `${Math.round(size / 3) * 3}|${f(Math.round(o * 5) / 5 || 0.2)}`
      const list = still.get(key) ?? []
      list.push({ x, y, g })
      still.set(key, list)
    }
    n++
  }
  let out = ''
  for (const [key, list] of still) {
    const [size, o] = key.split('|')
    out += placed(list, ` font-size="${size}" opacity="${o}"`)
  }
  // a twinkle is the glyph itself growing: . then + then * and back
  twinkling.forEach((group, i) => {
    if (group.at.length === 0) {
      return
    }
    const as = (g: string) => group.at.map(s => ({ ...s, g }))
    out +=
      `<g opacity="${f(group.o)}" font-size="13">` +
      placed(as('.'), ` class="t0 tw${i}"`) +
      placed(as('+'), ` class="t1 tw${i}"${hidden(false)}`) +
      placed(as('*'), ` class="t2 tw${i}"${hidden(false)}`) +
      '</g>'
  })
  return out
}

// ---------------------------------------------------------------- skyline

type Lamp = { r: number; c: number; text: string }

function skyline(
  seed: number,
  cols: number,
  rowsN: number,
  minH: number,
  maxH: number,
  litChance: number,
): { grid: string[][]; lit: Lamp[]; beacons: Lamp[] } {
  const rand = rng(seed)
  const grid = blank(cols, rowsN)
  const lit: Lamp[] = []
  const beacons: Lamp[] = []
  const put = (r: number, c: number, s: string) => {
    if (r >= 0 && r < rowsN && c >= 0 && c < cols) {
      grid[r]![c] = s
    }
  }
  let x = Math.floor(rand() * 3)
  while (x < cols) {
    const w = 5 + Math.floor(rand() * 9)
    const t = (x + w / 2) / cols
    const edge = Math.pow(Math.abs(t - 0.5) * 2, 1.15)
    const top = Math.round(minH + (maxH - minH) * edge)
    const h = Math.max(2, Math.min(rowsN - 4, Math.round(top * (0.5 + 0.5 * rand()))))
    const roof = rowsN - h
    const style = Math.floor(rand() * 4)

    put(roof, x, '.')
    put(roof, x + w - 1, '.')
    for (let c = x + 1; c < x + w - 1; c++) {
      put(roof, c, style === 2 ? '_' : '-')
    }
    for (let r = roof + 1; r < rowsN; r++) {
      put(r, x, '|')
      put(r, x + w - 1, '|')
      for (let c = x + 1; c < x + w - 1; c++) {
        const k = c - x - 1
        const fl = r - roof - 1
        let s = NB
        if (style === 0 && k % 3 !== 2 && c + 1 < x + w - 1) {
          s = k % 3 === 0 ? '[' : ']'
          if (k % 3 === 0 && rand() < litChance) {
            lit.push({ r, c, text: '[]' })
          }
        } else if (style === 1 && k % 2 === 0) {
          s = ':'
          if (rand() < litChance * 0.6) {
            lit.push({ r, c, text: ':' })
          }
        } else if (style === 2 && fl % 2 === 1) {
          s = '='
        } else if (style === 3 && k % 2 === 0 && fl % 2 === 0) {
          s = 'o'
          if (rand() < litChance) {
            lit.push({ r, c, text: 'o' })
          }
        }
        put(r, c, s)
      }
    }
    if (h > rowsN * 0.55 && rand() < 0.7) {
      const ac = x + Math.floor(w / 2)
      const len = 1 + Math.floor(rand() * 3)
      for (let k = 1; k <= len; k++) {
        put(roof - k, ac, '|')
      }
      beacons.push({ r: roof - len - 1, c: ac, text: '*' })
      put(roof - len - 1, ac, '.')
    }
    x += w + Math.floor(rand() * 3)
  }
  return { grid, lit, beacons }
}

// ------------------------------------------------------------------ build

function build(): string {
  const orb = planet()
  const sand = dust(91)

  const SFS = 11.5
  const SCW = SFS * ADV
  const SCH = SFS * 1.12
  const SCOLS = Math.ceil(W / SCW)
  const SROWS = 19
  const SY0 = H - SROWS * SCH

  const far = skyline(7, SCOLS, SROWS, 9, 18, 0.04)
  const near = skyline(23, SCOLS, SROWS, 3, 14, 0.12)

  // Lit windows: a few go dark now and then and come back, as whole characters.
  // The still ones share rows; each moving one is its own row of spaces and
  // its glyph, so all of them land on the buildings' own columns.
  const lamps = (list: Lamp[], cls: string, seed: number, y0: number, chance: number, max: number): string => {
    const rand = rng(seed)
    const still = blank(SCOLS, SROWS)
    let moving = 0
    let out = ''
    for (const l of list) {
      if (moving < max && rand() < chance) {
        const y = y0 + l.r * SCH + SCH * 0.78
        out += `<text class="${cls} ${cls}${moving++ % 5}" x="0" y="${f(y)}">${NB.repeat(l.c)}${l.text}</text>`
      } else {
        ;[...l.text].forEach((ch, i) => {
          const row = still[l.r]
          if (row !== undefined && l.c + i < SCOLS) {
            row[l.c + i] = ch
          }
        })
      }
    }
    return rows(still, { x0: 0, y0, cw: SCW, ch: SCH, origin: 0 }) + out
  }

  const style = [
    `text { font-family: ${FONTS}; white-space: pre; }`,
    orb.css,
    sand.css,
    // a twinkle is the glyph itself growing: . then + then * then + and back
    '.t0, .t1, .t2 { animation-duration: 12s; animation-timing-function: linear; animation-iteration-count: infinite; }',
    '.t0 { animation-name: t0; } .t1 { animation-name: t1; } .t2 { animation-name: t2; }',
    // a glyph shown stays up to its boundary and the next appears just after it, so two never stack
    '@keyframes t0 { 0%, 79.9% { visibility: visible; } 80%, 96% { visibility: hidden; } 96.1%, 100% { visibility: visible; } }',
    '@keyframes t1 { 0%, 80% { visibility: hidden; } 80.1%, 83.9% { visibility: visible; } 84%, 92% { visibility: hidden; } 92.1%, 95.9% { visibility: visible; } 96%, 100% { visibility: hidden; } }',
    '@keyframes t2 { 0%, 84% { visibility: hidden; } 84.1%, 91.9% { visibility: visible; } 92%, 100% { visibility: hidden; } }',
    timings('tw', 6, 13, 14, 22),
    // a window goes dark and its frame shows through, then it comes back on
    '.off { animation-name: off; animation-timing-function: linear; animation-iteration-count: infinite; animation-duration: 18s; }',
    '@keyframes off { 0%, 61.9% { visibility: visible; } 62%, 91.9% { visibility: hidden; } 92%, 100% { visibility: visible; } }',
    timings('off', 5, 17, 14, 26),
    // a beacon blinks between * and the . beneath it
    '.bc { animation-name: bc; animation-timing-function: linear; animation-iteration-count: infinite; animation-duration: 2.4s; }',
    '@keyframes bc { 0%, 49.9% { visibility: visible; } 50%, 100% { visibility: hidden; } }',
    timings('bc', 5, 19, 4.5, 7),
    '@media (max-aspect-ratio: 4/5) { .sky-planet { transform: translate(-610px, 60px) scale(0.92); } }',
  ].join(' ')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<style>${style}</style>` +
    '<defs>' +
    `<radialGradient id="skyGlow" cx="${P.cx}" cy="${P.cy}" r="760" gradientUnits="userSpaceOnUse">` +
    '<stop offset="0" stop-color="#3a1a78" stop-opacity="0.62"/>' +
    '<stop offset="0.45" stop-color="#1f0f42" stop-opacity="0.35"/>' +
    '<stop offset="1" stop-color="#0b0910" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="lowGlow" cx="160" cy="1040" r="720" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#5a1259" stop-opacity="0.42"/>' +
    '<stop offset="1" stop-color="#0b0910" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="haze" x1="0" y1="760" x2="0" y2="1000" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#2a1260" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#3b1870" stop-opacity="0.5"/>' +
    '</linearGradient>' +
    `<radialGradient id="atmo" cx="${P.cx}" cy="${P.cy}" r="${P.R * 1.9}" gradientUnits="userSpaceOnUse">` +
    '<stop offset="0.3" stop-color="#8b5cff" stop-opacity="0.2"/>' +
    '<stop offset="0.6" stop-color="#7a4cf0" stop-opacity="0.1"/>' +
    '<stop offset="1" stop-color="#8b5cff" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<linearGradient id="orbInk" x1="1110" y1="110" x2="1480" y2="500" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#f6efff"/>' +
    '<stop offset="0.4" stop-color="#b48dff"/>' +
    '<stop offset="0.75" stop-color="#7c4cf2"/>' +
    '<stop offset="1" stop-color="#ff5cc8"/>' +
    '</linearGradient>' +
    '<linearGradient id="ringInk" x1="880" y1="200" x2="1600" y2="420" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#7a5ae0" stop-opacity="0.35"/>' +
    '<stop offset="0.3" stop-color="#c39bff"/>' +
    '<stop offset="0.75" stop-color="#ff8ad8"/>' +
    '<stop offset="1" stop-color="#ff6ac8"/>' +
    '</linearGradient>' +
    '<linearGradient id="cityFade" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#fff"/>' +
    '<stop offset="0.3" stop-color="#fff" stop-opacity="0.55"/>' +
    '<stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/>' +
    '<stop offset="0.7" stop-color="#fff" stop-opacity="0.55"/>' +
    '<stop offset="1" stop-color="#fff"/>' +
    '</linearGradient>' +
    `<mask id="city" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#cityFade)"/></mask>` +
    '<pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">' +
    '<text x="14" y="18" font-size="10" text-anchor="middle" fill="#b59cff">+</text>' +
    '</pattern>' +
    '</defs>' +
    // sky
    `<rect width="${W}" height="${H}" fill="#0b0910"/>` +
    `<rect width="${W}" height="${H}" fill="url(#skyGlow)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#lowGlow)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.045"/>` +
    sand.markup +
    `<g fill="#cdb9ff">${stars(41)}</g>` +
    // planet
    '<g class="sky-planet">' +
    `<circle cx="${P.cx}" cy="${P.cy}" r="${P.R * 1.9}" fill="url(#atmo)"/>` +
    '<g opacity="0.88">' +
    `<g font-size="${PFS}" fill="url(#ringInk)" opacity="0.9">${orb.ring}${orb.ringLive}</g>` +
    `<g font-size="${PFS}" fill="url(#orbInk)">${orb.base}${orb.frames}</g>` +
    '</g>' +
    '</g>' +
    // city
    `<rect y="700" width="${W}" height="${H - 700}" fill="url(#haze)"/>` +
    '<g mask="url(#city)">' +
    `<g font-size="${SFS}" fill="#3a2a6e" opacity="0.8">${rows(far.grid, { x0: 0, y0: SY0 - SCH * 2, cw: SCW, ch: SCH, origin: 0 })}</g>` +
    `<rect y="${f(SY0 + SCH * 4)}" width="${W}" height="${H}" fill="#0b0910" opacity="0.35"/>` +
    `<g font-size="${SFS}" fill="#6a4fc0" opacity="0.9">${rows(near.grid, { x0: 0, y0: SY0, cw: SCW, ch: SCH, origin: 0 })}</g>` +
    `<g font-size="${SFS}" fill="#ff7ad9">${lamps(near.lit, 'off', 5, SY0, 0.3, 10)}</g>` +
    `<g font-size="${SFS}" fill="#c7a8ff">${lamps(far.lit, 'off', 9, SY0 - SCH * 2, 0.3, 4)}</g>` +
    `<g font-size="${SFS}" fill="#ff5cc8">${lamps(near.beacons, 'bc', 3, SY0, 1, 8)}</g>` +
    '</g>' +
    '</svg>'
  )
}

export const SCENE: string = build()
