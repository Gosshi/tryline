---
version: "alpha"
name: "Tryline Soft Modern"
description: "The current soft-modern design system for a Japanese rugby analysis product."
colors:
  page-background: "#f1efe9"
  panel: "#f5f6f8"
  ink: "#1f2530"
  ink-muted: "#646a76"
  rule: "#eceef2"
  accent: "#c93a40"
  accent-dim: "color-mix(in srgb, var(--color-accent) 15%, transparent)"
  accent-subtle: "color-mix(in srgb, var(--color-accent) 10%, transparent)"
  team-home: "#667085"
  team-away: "#475467"
  shadcn:
    background: "220 13% 97%"
    foreground: "219 22% 15%"
    card: "0 0% 100%"
    card-foreground: "219 22% 15%"
    primary: "357 57% 51%"
    primary-foreground: "0 0% 100%"
    muted: "220 14% 95%"
    muted-foreground: "220 7% 42%"
    border: "220 16% 94%"
    input: "220 16% 94%"
    ring: "357 57% 51%"
typography:
  family:
    body: "Zen Maru Gothic via --font-zen-maru"
    heading: "Zen Maru Gothic via --font-zen-maru"
    number: "Outfit via --font-number"
  weights:
    Zen Maru Gothic: [500, 700, 900]
    Outfit: [500, 700]
  body:
    fontWeight: 500
  heading:
    fontWeight: 900
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

Tryline is a Japanese rugby analysis product for fans who already watch overseas rugby through DAZN, J SPORTS, WOWOW, or similar services. The interface is a soft-modern, friendly and app-like match companion: fast to scan before kickoff and calm enough to read after full time.

This direction was selected on 2026-06-23. The reference mock is [soft-v3](docs/design/mock-1-soft-v3.html). Match cards, scores, flags, and team color stripes provide the sports energy; rounded surfaces, soft depth, and rounded Japanese typography keep the reading experience approachable.

## Colors

The page background is not a single flat token. `body` uses `#f1efe9` as its background color, overlaid with a red 5% radial gradient (`rgb(201 58 58 / 5%)`), a blue 5% radial gradient (`rgb(26 58 92 / 5%)`), a `#f8f7f4` → `#f1efe9` → `#eceae3` linear gradient, and a low-opacity SVG noise texture. `.bg-paper` applies the same layers.

`--color-panel` is `#f5f6f8`; it is an internal-panel token, not the page background. It is used for interior panels on the match page, match events section, and score graph. `--color-ink` is `#1f2530`, `--color-ink-muted` is `#646a76`, `--color-rule` is `#eceef2`, and the brand accent is red: `--color-accent: #c93a40`. `--color-accent-dim` and `--color-accent-subtle` mix that accent with transparency at 15% and 10% respectively. `--team-home` is `#667085` and `--team-away` is `#475467`.

The shadcn-compatible tokens use HSL values: `--background: 220 13% 97%`, `--foreground: 219 22% 15%`, `--card: 0 0% 100%`, `--card-foreground: 219 22% 15%`, `--primary: 357 57% 51%`, `--primary-foreground: 0 0% 100%`, `--muted: 220 14% 95%`, `--muted-foreground: 220 7% 42%`, `--border: 220 16% 94%`, `--input: 220 16% 94%`, and `--ring: 357 57% 51%`. These provide the compatibility layer for controls and surfaces alongside the named Tryline tokens.

## Typography

Zen Maru Gothic is the single Japanese interface family. `--font-body` and `--font-heading` both alias `--font-zen-maru`; they are roles, not different typefaces. The loaded Zen Maru Gothic weights are 500, 700, and 900. Body text is rendered at weight 500, and `h1`, `h2`, and `h3` at weight 900.

Outfit is loaded separately through `--font-number` at weights 500 and 700. It is reserved for `.tabular-nums`, which also applies `font-variant-numeric: tabular-nums`, so score and statistic columns retain stable figure widths.

The type scale has eight tokens: `--text-xs: 0.75rem`, `--text-sm: 0.875rem`, `--text-base: 1rem`, `--text-lg: 1.125rem`, `--text-xl: 1.25rem`, `--text-2xl: 1.5rem`, `--text-3xl: 2rem`, and `--text-4xl: 2.5rem`. Use scale and weight to establish hierarchy without making dense match data harder to scan on small screens.

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

Tryline serves Japanese rugby fans who want a better post-match and pre-match reading experience than raw English feeds or score-only apps. The product is friendly, soft-modern, editorial, and useful during a rugby weekend—not a return to the rejected sparse-serif "margin premium" direction.

The user expectation is a composed match companion: next matches, finished match results, official-looking match context, and Japanese AI analysis that is easy to read.

## Visual Principles

1. Make match state scannable. Scores, teams, kickoff context, and availability should read quickly.
2. Let rounded Japanese typography and soft surfaces create an approachable application feel.
3. Keep color functional. Use the red accent for actions and emphasis, and team colors for identity rather than body text.
4. Use depth purposefully. Existing gradients, texture, blur, borders, and shadows should clarify layers instead of competing with data.
5. Keep mobile reading comfortable. Preserve useful text size and regroup content before compressing it.

## Sports Adaptation

Scores use Outfit with tabular figures where `.tabular-nums` is applied. Team abbreviations and flags should remain visually close to the score so the match state can be understood at a glance.

Team colors are limited to stripes, top bars, and low-opacity gradients. This protects contrast and prevents a one-note team-color page from overpowering the reading experience.

Japanese long-form analysis needs room to breathe. Keep narrative content visibly distinct from score and schedule data, and avoid layouts that make either feel like a raw data export.

## Accessibility

Contrast is calculated with the WCAG relative-luminance formula (linearized sRGB channels, then `(L1 + 0.05) / (L2 + 0.05)`) using the solid `body` base color `#f1efe9` and the white card surface. `--color-ink` (`#1f2530`) against the `body` base is 13.37:1. `--color-ink-muted` (`#646a76`) is 4.73:1 against the `body` base and 5.43:1 against a white card. The shadcn-compatible `--muted-foreground` (`220 7% 42%`, rendered as `#646973`) is 4.79:1 against the `body` base and 5.51:1 against a white card. Both secondary-text tokens meet the WCAG AA 4.5:1 requirement for normal text. The gradient and texture layers mean the painted page background varies slightly; these figures document the implemented solid base comparison.

Interactive elements use visible focus treatment. The shared `--ring` token is `357 57% 51%`, and existing controls commonly use `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`.

`prefers-reduced-motion: reduce` is implemented once in the global base layer. It reduces animation and transition duration to `0.01ms`, limits animation iteration to one, and restores automatic scrolling for readers who request reduced motion. Keep transitions nonessential and do not make motion required to understand state.
