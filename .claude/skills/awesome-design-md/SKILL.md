---
name: awesome-design-md
description: A library of 74 DESIGN.md files — full token systems (colour, type scale, spacing, radii, elevation, motion, component rules) reverse-engineered from real products including Linear, Stripe, Vercel, Notion, Supabase, Raycast, Figma, Sentry, PostHog, Apple, Nike and Tesla. Use when choosing or defending a visual direction, when you need concrete token values rather than invented ones, or when a brief names a product to look like ("Linear-style", "Stripe-y", "Apple-clean"). Read the matching DESIGN.md before writing CSS.
---

# Awesome DESIGN.md

A corpus of design systems written in the format LLMs read best. Each entry is a
real product's visual language, pulled apart into values you can paste into CSS
rather than adjectives you have to guess at.

## When to reach for it

- A brief names a product or an aesthetic family and you need the actual numbers.
- You are choosing a direction and want to compare two or three credible ones
  side by side instead of defaulting to the first thing that comes to mind.
- You are about to invent a type scale, a set of surface greys, or an easing
  curve. Somebody has already solved it; read theirs first.

Do **not** copy an entry wholesale into an unrelated product. These are
reference points, not skins. Take the reasoning — why the accent is used three
times a page, why the hairline is 1px of a near-black — and apply it.

## Layout

```
design-md/<product>/DESIGN.md   the token system and the rules
design-md/<product>/README.md   what the product is and how it reads
```

Each `DESIGN.md` opens with YAML frontmatter — `colors`, `typography`,
`spacing`, `radii`, `shadows`, `motion` — followed by prose on layout rhythm,
component anatomy and the things that system deliberately refuses to do.

## What is here

**Developer tools and SaaS** — linear.app, vercel, stripe, supabase, sentry,
posthog, raycast, notion, figma, framer, webflow, mintlify, sanity, replicate,
clickhouse, mongodb, hashicorp, cursor, warp, opencode.ai, expo, cal, zapier,
composio, resend, elevenlabs, together.ai, minimax, mistral.ai, cohere,
ollama, x.ai, claude, voltagent, lovable, clay, superhuman, miro, slack,
runwayml, intercom, airtable, pinterest, uber, meta, nvidia, spotify, airbnb

**Finance and commerce** — revolut, wise, coinbase, kraken, binance,
mastercard, shopify, starbucks

**Consumer, industrial and editorial** — apple, tesla, nike, bmw, bmw-m,
ferrari, lamborghini, bugatti, renault, vodafone, playstation, nintendo-2001,
spacex, theverge, wired, ibm, hp, dell-1996

`REFERENCE.md` is the upstream README, including what DESIGN.md is as a format.

## Using one

1. Pick the entry whose *problem* matches yours, not whose logo you like. A
   dense product UI has more to learn from Linear or Sentry than from Nike.
2. Read the frontmatter for values and the prose for the rules that hold them
   together. The rules are the part that transfers.
3. Map into the project's own token names rather than importing theirs, so the
   system stays one system.

Source: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT).
