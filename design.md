---
version: "alpha"
name: "Tryline Apple-Inspired"
description: "Apple-inspired design system for a Japanese rugby analysis product."
colors:
  paper: "oklch(98.5% 0.005 95)"
  ink: "oklch(18% 0.02 260)"
  ink-muted: "oklch(45% 0.02 260)"
  rule: "oklch(90% 0.01 260)"
  accent: "oklch(58% 0.18 145)"
  surface: "#ffffff"
  surface-raised: "#f8fafc"
typography:
  body:
    fontFamily: "Hiragino Sans, Noto Sans JP, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.9"
  heading:
    fontFamily: "Noto Serif JP, Fraunces, Hiragino Mincho ProN, Georgia, serif"
    fontWeight: 700
    lineHeight: "1.2"
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 900
    fontFeature: "tabular-nums"
    lineHeight: "1"
  caption:
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.18em"
    textTransform: "uppercase"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "40px"
  "3xl": "48px"
  "4xl": "64px"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  full: "9999px"
radius:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  full: "9999px"
shadows:
  none: "none"
  card: "0 1px 2px rgb(15 23 42 / 0.06)"
  card-hover: "0 10px 18px rgb(15 23 42 / 0.10)"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    borderColor: "{colors.rule}"
    padding: "{spacing.lg}"
    shadow: "{shadows.card}"
  card-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    borderColor: "{colors.rule}"
    shadow: "{shadows.card-hover}"
    transform: "translateY(-2px)"
  badge:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  section-label:
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
---

# Tryline Design System

## Overview

Tryline is a Japanese rugby analysis product for fans who already watch overseas rugby through DAZN, J SPORTS, WOWOW, or similar services. The interface should feel like a premium match companion: fast to scan before kickoff, calm enough to read after full time, and opinionated enough to distinguish itself from a generic sports database.

The design position is "sports media energy plus intelligent long-form reading." Match cards, scores, flags, and team color stripes provide the energy. Generous spacing, controlled color, and strong typography provide the reading quality.

## Colors

The palette is intentionally restrained and Apple-inspired. Use warm paper, deep ink, muted ink, soft rules, and a single green accent. Team colors may add context, but they should remain a supporting layer.

- **Paper** (`oklch(98.5% 0.005 95)`): app background and reading foundation.
- **Ink** (`oklch(18% 0.02 260)`): primary text, score emphasis, and important labels.
- **Ink muted** (`oklch(45% 0.02 260)`): metadata, secondary text, and quiet labels.
- **Rule** (`oklch(90% 0.01 260)`): separators and low-contrast borders.
- **Accent** (`oklch(58% 0.18 145)`): CTA, focus, section accents, and availability badges.
- **Surface** (`#ffffff`): cards, match panels, and raised content blocks.
- **Surface raised** (`#f8fafc`): subtle interior panels, TOC blocks, and quiet badges.

## Typography

Typography carries the premium feel. Japanese body text uses a readable sans stack with generous line height. Headings use a serif stack for editorial weight. Scores use the display family with tabular numbers so score changes and score comparisons stay visually stable.

- Body copy: `Hiragino Sans`, `Noto Sans JP`, `-apple-system`, 1rem or larger, line-height 1.9 for Japanese long-form reading.
- Headings: `Noto Serif JP`, `Fraunces`, `Georgia`, weight 700.
- Display and scores: `Fraunces`, weight 900, tabular numbers, 4xl or larger on match detail scorelines.
- Captions and section labels: 0.75rem, weight 600, uppercase, letter-spacing 0.18em.

## Layout

Use an 8px spacing grid. Prefer clear vertical rhythm over dense dashboards. Mobile pages should keep primary match information visible without horizontal overflow. Desktop layouts can widen into two-column match grids, but the core card proportions should remain compact and scannable.

Apple-inspired spacing means important content gets breathing room. Match detail headers, hero areas, and long-form content sections should use larger vertical padding than utility tables or metadata rows. Do not compress long Japanese text below 1rem.

## Elevation & Depth

Surfaces should be quiet. The default card uses a 1px rule border, white background, and a light shadow. Hover can increase depth with a small upward translation and stronger shadow. Avoid heavy shadows, glossy panels, glassmorphism, and decorative gradients that compete with match data.

Team identity is expressed through stripes and low-opacity card gradients, not through primary text color. Keep text neutral for readability and let the two-team structure carry the sports context.

## Shapes

Use small, consistent radius values.

- `sm` (`0.5rem`): badges, tags, and compact controls.
- `md` (`0.75rem`): cards and standard panels. This matches the current `--radius`.
- `lg` (`1rem`): larger sections and hero-adjacent panels.
- `full` (`9999px`): pills and compact status controls.

Avoid overly rounded cards unless the component is explicitly a pill or badge. Cards should feel crisp and premium, not playful.

## Components

Cards use a white surface, 1px rule border, `0.75rem` radius, and light shadow. On hover, use `-translate-y-0.5`, a slightly stronger shadow, and a subtle border change.

Section labels are uppercase, wide-tracked, muted, and small. They label groups such as "最新シーズン", "今後の試合", "最近のレビュー", and "大会アーカイブ" without competing with match names.

Accent lines use a 2px green border on the left side of important editorial headings. This is the preferred way to add brand emphasis inside long-form content.

The homepage hero uses a deep ink background, white text, and a quiet grid pattern. It should signal product identity in the first viewport without becoming a marketing splash screen detached from the match experience.

## Do's and Don'ts

Do use generous spacing, strong score typography, neutral text colors, and team colors as structural accents. Do keep Japanese long-form content comfortable with line-height 1.9 or higher. Do use focus rings with `ring-2` and the accent color.

Do not use team colors as body text colors. Do not add decorative color blobs, heavy gradients, or noisy sports textures. Do not reduce mobile text to fit more data into a row. Stack content instead.

## Brand Position

Tryline serves Japanese rugby fans who want a better post-match and pre-match reading experience than raw English feeds or score-only apps. The product should feel premium, editorial, and useful during a rugby weekend.

The user expectation is not a social feed. It is a composed match companion: next matches, finished match results, official-looking match context, and Japanese AI analysis that is easy to read.

## Visual Principles

1. Use breathing room. Important match and reading surfaces need generous padding.
2. Let typography lead. Hierarchy should come from scale, weight, and family contrast.
3. Keep color functional. Use accent for actions, state, and data labels.
4. Keep surfaces quiet. White and slate surfaces should dominate; team color adds identity.
5. Make interactions subtle. Hover is a small translation plus shadow, not a dramatic animation.

## Sports Adaptation

Scores use display typography, tabular numbers, and at least 4xl sizing in detail headers. Team abbreviations and flags should remain visually close to the score so the match state can be understood at a glance.

Team colors are limited to stripes, top bars, and low-opacity gradients. This protects contrast and prevents a one-note team-color page from overpowering the reading experience.

Japanese long-form analysis needs space. Use 1rem or larger body text, line-height 1.9 or higher, and avoid dense paragraphs that feel like raw data export.

## Accessibility

Ink on paper should maintain contrast at 15:1 or better. Ink muted on surface must meet WCAG AA at 4.5:1 or better. Interactive elements use visible focus rings, preferably `ring-2 ring-[var(--color-accent)]`.

Motion should respect `prefers-reduced-motion`. Keep default transitions short and nonessential. Avoid interactions where motion is required to understand state.
