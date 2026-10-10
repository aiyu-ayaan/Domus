# Domus Design System — MASTER

Single source of truth for the web/desktop UI. Page files in `pages/` may
override specific rules; otherwise everything here applies. Derived from the
`ui-ux-pro-max` recommendation **Minimalism & Swiss Style** (variance 2,
motion 3, density 8) for a professional smart-home dashboard.

Implementation: tokens in `apps/web/src/index.css`, Tailwind mapping in
`apps/web/tailwind.config.js`, primitives in `apps/web/src/components/ui/`.

## Principles

1. **Precise, not playful.** Hairline borders, small radii, no glow, no
   gradients, no coloured icon tiles, no bounce.
2. **Colour means state.** UI chrome is neutral. Green appears only for
   "on / live / healthy"; amber for warnings; red for errors and destructive.
3. **Numbers first.** Readings use tabular figures and a clear unit; labels are small and muted.
4. **Dense but calm.** 14px base, 4px grid, generous alignment, few borders.
5. **Glass only where it earns it.** The sticky top bar and the mobile tab bar
   use a light translucent blur so content scrolls beneath; cards and panels are opaque.

## Color tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#09090B` | `#FAFAFA` | page |
| `panel` | `#111113` | `#FFFFFF` | cards, sidebar, sheets |
| `raised` | `#18181B` | `#F4F4F5` | inputs, hovered rows, segmented track |
| `border` | `#27272A` | `#E4E4E7` | 1px hairlines |
| `border-strong` | `#3F3F46` | `#D4D4D8` | focus-adjacent, active outlines |
| `fg` | `#FAFAFA` | `#09090B` | primary text |
| `muted` | `#A1A1AA` | `#52525B` | secondary text (≥ 4.5:1 on panel) |
| `subtle` | `#71717A` | `#71717A` | captions, axis labels |
| `primary` | `#FAFAFA` | `#18181B` | primary button background |
| `on-primary` | `#09090B` | `#FAFAFA` | primary button text |
| `on` | `#22C55E` | `#16A34A` | device on, live, healthy |
| `warn` | `#F59E0B` | `#B45309` | warnings |
| `danger` | `#EF4444` | `#DC2626` | errors, destructive |
| `info` | `#3B82F6` | `#2563EB` | links, informational badges |

Charts use `on` for the series and `raised`/`border` for the track and grid lines.

## Typography

- Family: **Inter** (400/500/600), fallback `system-ui`. Numbers use `font-variant-numeric: tabular-nums`.
- Scale (px): 12 caption · 13 label · 14 body · 16 section title · 20 page title · 28 hero metric.
- Weights: 600 headings and metrics, 500 labels/buttons, 400 body.
- Letter-spacing: `-0.01em` for ≥ 20px, default otherwise. Uppercase is only used for 11–12px overlines (+0.04em).

## Shape & spacing

- Radius: 6px controls (buttons, inputs, badges), 10px cards and sheets, full only for status dots and switches.
- Spacing: 4px grid. Card padding 16px (20px ≥ md). Grid gaps 12px. Section gap 32px.
- Borders: 1px `border`. No drop shadows on cards; sheets/menus use `0 16px 48px -12px rgb(0 0 0 / .5)`.
- Icons: Phosphor *regular*, 16px in controls, 18px in nav and cards, stroke-consistent. Never filled blobs; an "on" device colours its icon `on`.

## Components

- **Button**: height 32 (sm) / 36 (md). Variants: `primary` (solid fg), `secondary` (raised + border), `ghost`, `danger` (danger text, danger/10 bg on hover).
- **Input / Select**: height 36, `raised` background, 1px border, focus ring 2px `fg/30` + border-strong.
- **Switch**: 32×18 track, `on` when checked, neutral `border-strong` otherwise.
- **Segmented**: `raised` track, `panel` thumb with border; thumb slides 150ms.
- **Card**: `panel` + border, radius 10, header row = 13px label in `muted` + optional action.
- **Device row/tile**: name 14/500, status 13 `muted`, icon 18 neutral (or `on`), power toggle as a Switch — no circular white buttons.
- **Badge**: 20px tall, 12px text, `raised` background; semantic variants tint text only.
- **Sheet**: right-side drawer on ≥ md (420/560px), bottom sheet on mobile; opaque `panel`.
- **Sidebar**: 232px, flush to the edge, `panel` with right border; active item = `raised` bg + `fg` text.
- **Mobile tab bar**: 56px, translucent `bg/80` + blur, top border, max 5 items.

## Motion

- Durations: 120ms hover/press, 150ms state changes, 200ms sheets/pages. Ease: `cubic-bezier(0.2, 0, 0, 1)`.
- Only opacity and ≤ 8px translate. No springs with overshoot, no scale-bounce, no staggered cascades over 4 items.
- `prefers-reduced-motion`: disable translate, keep instant state changes.

## Accessibility

- Text contrast ≥ 4.5:1 in both themes; focus ring always visible (`:focus-visible`).
- Hit targets ≥ 36px on desktop, ≥ 44px on touch (rows and tab bar).
- State is never colour-only: "On/Off", "Online/Offline" text accompanies the colour.
- Icon-only buttons have `aria-label`; live values use `aria-live="polite"` only where they change on user action.

## Anti-patterns (do not use)

Gradient brand tiles, coloured icon squares, rounded-3xl/4xl cards, glowing
shadows, animated ambient backgrounds, emoji, bouncy springs, oversized
greetings, pill-shaped primary buttons, decorative glass on content.
