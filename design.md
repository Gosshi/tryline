---
version: "alpha"
name: "Tryline Touchline"
description: "A paper-toned Japanese rugby reading system with ink-dark surfaces, brand red, and Mincho headings."
colors:
  page-background: "#f5f2eb"
  panel: "#eae7e0"
  ink: "#20232a"
  ink-muted: "#606269"
  rule: "#d8d5ce"
  ink-strong: "#17191f"
  brass: "#956137"
  accent: "#c93a40"
  accent-dim: "color-mix(in srgb, var(--color-accent) 15%, transparent)"
  accent-subtle: "color-mix(in srgb, var(--color-accent) 10%, transparent)"
  team-home: "#667085"
  team-away: "#475467"
  shadcn:
    background: "42 33% 94%"
    foreground: "222 13.5% 14.5%"
    card: "42.9 100% 98.6%"
    card-foreground: "222 13.5% 14.5%"
    primary: "357 57% 51%"
    primary-foreground: "0 0% 100%"
    muted: "42 19.2% 89.8%"
    muted-foreground: "226.7 4.5% 39.4%"
    border: "42 11.4% 82.7%"
    input: "42 11.4% 82.7%"
    ring: "357 57% 51%"
typography:
  family:
    body: "Noto Sans JP via --font-noto-sans-jp"
    heading: "Shippori Mincho B1 via --font-shippori-mincho"
    number: "Outfit via --font-number"
  weights:
    Noto Sans JP: [400]
    Shippori Mincho B1: [700, 800]
    Outfit: [500, 700]
  body:
    fontWeight: 400
  heading:
    fontWeight: 800
  numeric:
    fontFeature: "tabular-nums"
  scale:
    xs: "0.75rem"
    sm: "0.875rem"
    base: "1rem"
    lg: "1.125rem"
    xl: "1.25rem"
    "2xl": "1.5rem"
    "3xl": "2rem"
    "4xl": "2.5rem"
radius:
  base: "1rem"
  sm: "1rem"
  md: "1.375rem"
  lg: "1.875rem"
shadows:
  default: "0 20px 44px -24px rgb(28 38 64 / 40%)"
  soft: "0 12px 28px -20px rgb(28 38 64 / 45%)"
spacing:
  base: "4px"
  scale:
    "0.5": "2px"
    "1": "4px"
    "1.5": "6px"
    "2": "8px"
    "3": "12px"
    "4": "16px"
    "5": "20px"
    "6": "24px"
    "8": "32px"
    "10": "40px"
  density:
    mobile: "comfortable"
    desktop: "compact"
layout:
  container: "1152px"
  breakpoints:
    sm: "640px"
    md: "768px"
    lg: "1024px"
    xl: "1280px"
  listRow:
    appliesTo: "new-and-redesigned-surfaces"
    mobile:
      orientation: "stacked"
    desktop:
      orientation: "columnar"
      maxEmptyRatio: 0.25
---

# Tryline Design System

## Overview

Tryline serves Japanese rugby fans who follow overseas competitions and want fixtures, results, standings, and readable Japanese analysis together. The design direction is THE TOUCHLINE (Owner decision D037, 2026-10-04): a paper-colored reading surface, ink-dark areas, a restrained brand-red accent, and Mincho headings paired with sans-serif body text.

The reference is [THE TOUCHLINE A4](docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html). This system is being introduced in stages. Color and typography are the first stage; corner radii, shadows, motion, and page composition are handled by later specifications.

## Colors

The page background is paper `#f5f2eb`. `body` and `.bg-paper` share a subtle linear gradient from `#f8f6f1` through `#f5f2eb` to `#efebe3`, plus the existing low-opacity SVG grain. The former red and blue radial gradients have been removed.

`--color-panel` and shadcn `--muted` use `#eae7e0`. `--color-ink` is `#20232a`, `--color-ink-muted` is `#606269`, and `--color-rule` is `#d8d5ce`. Ink-dark `--color-ink-strong` (`#17191f`) is reserved for large surfaces in later page work. Brass `--color-brass` (`#956137`) is reserved for small editorial labels. The existing brand red `--color-accent: #c93a40`, its dim and subtle variants, and the team identity tokens are unchanged.

The shadcn-compatible HSL tokens are `--background: 42 33% 94%`, `--foreground: 222 13.5% 14.5%`, `--card: 42.9 100% 98.6%`, `--card-foreground: 222 13.5% 14.5%`, `--primary: 357 57% 51%`, `--primary-foreground: 0 0% 100%`, `--muted: 42 19.2% 89.8%`, `--muted-foreground: 226.7 4.5% 39.4%`, `--border: 42 11.4% 82.7%`, `--input: 42 11.4% 82.7%`, and `--ring: 357 57% 51%`.

## Typography

Noto Sans JP is the body family, loaded with `--font-noto-sans-jp` and rendered at weight 400. Shippori Mincho B1 is the heading family, loaded with `--font-shippori-mincho`; `h1`, `h2`, and `h3` use weight 800. Both are fixed web fonts so Japanese glyph shapes do not vary by operating system. `display: "swap"` preserves visible fallback text while fonts load.

Outfit remains loaded through `--font-number` at weights 500 and 700. It is reserved for `.tabular-nums`, which also applies `font-variant-numeric: tabular-nums`, so score and statistic columns retain stable figure widths.

The type scale has eight tokens: `--text-xs: 0.75rem`, `--text-sm: 0.875rem`, `--text-base: 1rem`, `--text-lg: 1.125rem`, `--text-xl: 1.25rem`, `--text-2xl: 1.5rem`, `--text-3xl: 2rem`, and `--text-4xl: 2.5rem`.

## Spacing

Spacing uses a 4px base unit and the implemented scale of 2, 4, 6, 8, 12, 16, 20, 24, 32, and 40px. The matching `--space-*` custom properties are the documented source of truth, while Tailwind spacing utilities remain the implementation mechanism. In current surfaces, `gap-2` is the common separation for tightly related elements, `gap-4` separates element groups, and `px-4` is the default horizontal padding for many cards and containers.

Use the smaller 2–8px steps inside compact controls and tightly coupled match data, the 12–20px steps between related groups, and the 24–40px steps for larger section rhythm. These tokens document the existing spacing language; they are not a requirement to replace established Tailwind utilities across existing components.

## Layout

The primary container is 1152px (`max-w-6xl`), the most frequently used container width in the implementation. The responsive breakpoints are `sm` at 640px, `md` at 768px, `lg` at 1024px, and `xl` at 1280px.

Responsive work must not branch at `sm:` and stop there. The current implementation has 223 `sm:` uses but only 26 `lg:` uses, even though 63% of readers are on desktop; new and redesigned surfaces must change how information is arranged at `lg:` and above instead of stretching the mobile stack across a wider canvas.

List rows stack on mobile and become columnar on desktop. On new and redesigned surfaces, the empty span between the end of primary text and the start of the next column must not exceed 25% of the row width (`maxEmptyRatio: 0.25`). This constraint does not apply retroactively to unchanged existing surfaces.

## Density

Mobile density is comfortable: favor vertical stacking, readable text, and touchable separation. Desktop density is compact: use columns and deliberate alignment to improve scanning, while retaining the same soft-modern surfaces and legible Japanese typography. Do not carry the same vertical stack to desktop and merely stretch it horizontally.

`WeekBoard` in `components/calendar/week-schedule.tsx` is the reference implementation for `density.desktop: compact`. Its desktop board is activated with `hidden lg:block`, changing to a columnar weekly arrangement at 1024px while the mobile presentation remains comfortable and stacked.

## Block Intent and Primary Task

> Adopted 2026-09-09 after external design review of the 2026-09-06 draft
> (`docs/audits/gpt6-spec-review-followup-2026-09-08/design-review.md`).
> The draft classified whole surfaces as Brand or Data; the review found that
> unit wrong — a page mixes purposes, so the role belongs to the block.

These rules apply only to new surfaces and explicitly scoped redesigns.
A factual correction or maintenance change does not, by itself, make an
existing surface a redesign. Existing pages are not required to adopt new
layout rules retroactively.

Keep the existing spacing scale, container conventions, breakpoints,
maxEmptyRatio rule, WeekBoard reference, and soft-modern brand direction.
This section governs priority and grouping, not a replacement visual system.

### Classify blocks, not URLs

A page's specification names its primary reader task. Each major block has
a role appropriate to that task:

- Brand: communicate the product's value and identity.
- Data: find or compare fixtures, scores, standings, and records.
- Reading: understand an article, guide, legal text, or explanation.
- Task/state: make a choice, submit a form, understand a result, or recover
  from an error.

These roles may coexist on one page and do not introduce new token sets.
A language route is not a role. Pricing, home, and competition hubs must not
be classified as brand-only simply because they contain a hero or imagery.

### Order around the primary task

For a data-first task, group the title and necessary context, task controls,
essential data-quality notices, and the first complete relevant data unit
before unrelated promotion or long-form introductory content.
Do not place a newsletter or subscription promotion between those controls
and that data unit. A direct path to the primary task may precede longer
explanations on a mixed-purpose page.

Use 12-20px steps between related data groups and 24-40px between larger
sections as already defined by Spacing. Reading blocks retain their own
paragraph and section rhythm. Do not compress the entire page because it
contains a table, or expand every block because it contains brand imagery.

### First complete data unit

The first complete data unit is the smallest visible, relevant record that
lets the reader understand the advertised information and identify its
associated action, when one exists. It is not a heading, count, skeleton,
decorative badge, or a few pixels of the next card.

- Fixture/result: the two teams, required competition/date context, match
  state, kickoff time or permitted result, and the route to match details.
- Standings: a complete team row with the labels needed to interpret rank
  and points. The entire standings table need not fit at once.
- Weekly board: one complete relevant match card with its day/time context,
  not the entire week's board.

Required labels may live in an adjacent group header if they remain visibly
associated with the record. Spoiler settings still apply: do not reveal a
hidden score in order to satisfy the layout rule.

For no-data, loading, or error states, evaluate the corresponding state
message and useful next action. Record the real-data metric as not applicable;
do not invent a record or count a skeleton as real data.

### Measurement and budgets

For new or redesigned data-first surfaces, the specification records the
target unit, fixed data fixture, viewport width and height, zoom/text size,
locale, login/spoiler state, and the selectors used to measure it.
Measure after fonts and relevant content have settled, from scroll position
zero with temporary menus closed. Record the unit's top and bottom in CSS
pixels and any persistent header or overlay that obstructs the usable area.

Record both the distance to the unit and the scroll needed to see the complete
unit. If the unit cannot fit within the unobstructed viewport, record that
condition separately. Do not hide labels, shrink essential text, or clip the
unit solely to pass a height budget.

No universal pixel or viewport-fraction limit is established by this section.
An individual redesign may adopt a numerical budget after comparing the
current and proposed layouts under the same fixtures and viewport conditions.
Once the Owner accepts that budget, include it in that specification's
acceptance criteria. Ordering and measurement requirements can be checked
before a global numerical budget exists.

The September 5 audit measurements are historical observations, not targets
or evidence of the current deployment's layout.

## Elevation & Depth

Surfaces combine white cards, gentle borders, and the defined soft shadows: `--shadow` is `0 20px 44px -24px rgb(28 38 64 / 40%)`, and `--shadow-soft` is `0 12px 28px -20px rgb(28 38 64 / 45%)`. Layered page gradients, low-opacity card treatments, and `backdrop-blur` are intentional parts of the current interface when they preserve match-data legibility.

Team identity is expressed through stripes and low-opacity card gradients, not through primary text color. Keep text neutral for readability and let the two-team structure carry the sports context.

## Shapes

The soft-modern system uses rounded surfaces deliberately. `--radius`, the base radius, is `1rem`; `--radius-sm` is also `1rem`, `--radius-md` is `1.375rem`, and `--radius-lg` is `1.875rem`. Use these sizes to make cards, panels, and compact controls approachable while preserving clear group boundaries in data-dense views.

## Components

Cards and panels use the white shadcn card surface (`--card: 0 0% 100%`) or the appropriate quiet interior surface, neutral text, rounded tokens, and the existing border/shadow treatments. Glass-like and gradient treatments are appropriate for overlays and match emphasis when their contrast remains adequate; they are not a substitute for hierarchy.

Section labels should support, rather than compete with, match names and scores. Accent is for actions, selected state, and editorial emphasis. Existing focus-visible controls commonly use `ring-2` with `ring-[var(--color-accent)]`; the shared ring token is `--ring: 357 57% 51%`.

## Do's and Don'ts

Do use rounded surfaces, soft shadows, restrained low-opacity gradients, and blur where they make grouping or match context clearer. Do use neutral text colors and team color as a structural accent. Do keep score and statistics columns stable with tabular figures, and stack content on mobile rather than reducing important text to microtype.

Do not use team colors for body text. Do not add decorative effects that obscure scores, labels, controls, or reading flow. Do not introduce contrast-dependent state without a visible text or shape cue, and do not use motion as the only way to communicate state.

## Brand Position

Tryline helps Japanese rugby fans follow overseas rugby through a readable Japanese interface. THE TOUCHLINE uses paper-colored reading areas, ink-dark surfaces, and restrained red emphasis. The web font pair is Mincho headings with sans-serif body text. The app icon and current site logo remain unchanged.

## Visual Principles

1. Make match state scannable. Scores, teams, kickoff context, and availability should read quickly.
2. Use Mincho headings and sans-serif body text on paper-colored surfaces.
3. Keep color functional. Use the red accent for actions and emphasis, and team colors for identity rather than body text.
4. Use depth purposefully. Existing gradients, texture, blur, borders, and shadows should clarify layers instead of competing with data.
5. Keep mobile reading comfortable. Preserve useful text size and regroup content before compressing it.

## Sports Adaptation

Scores use Outfit with tabular figures where `.tabular-nums` is applied. Team abbreviations and flags should remain visually close to the score so the match state can be understood at a glance.

Team colors are limited to stripes, top bars, and low-opacity gradients. This protects contrast and prevents a one-note team-color page from overpowering the reading experience.

Japanese long-form analysis needs room to breathe. Keep narrative content visibly distinct from score and schedule data, and avoid layouts that make either feel like a raw data export.

## Accessibility

Contrast is calculated with the WCAG relative-luminance formula (linearized sRGB channels, then `(L1 + 0.05) / (L2 + 0.05)`). Body text `#20232a` against the paper base `#f5f2eb` is 14.07:1. Muted text `#606269` is 5.45:1 against paper and 5.99:1 against the card surface `#fffdf8`. Brass `#956137` against paper is 4.65:1. White text on brand red `#c93a40` is 5.04:1, and red text against paper is 4.51:1. These are solid-color comparisons; the subtle paper gradient and grain vary the rendered background slightly.

Interactive elements use visible focus treatment. The shared `--ring` token is `357 57% 51%`, and existing controls commonly use `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`.

`prefers-reduced-motion: reduce` is implemented once in the global base layer. It reduces animation and transition duration to `0.01ms`, limits animation iteration to one, and restores automatic scrolling for readers who request reduced motion. Keep transitions nonessential and do not make motion required to understand state.
