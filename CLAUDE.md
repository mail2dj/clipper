# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Clipper is a booking app for an at-home dog grooming service in Seoul. Stack: **vinext** (Next.js App Router API on Vite) running on **Cloudflare Workers**, with **Cloudflare D1** (SQLite) accessed through **Drizzle ORM**. UI uses Tailwind CSS v4 and shadcn-style Radix components.

## Commands

- `npm install`, then first-time local DB setup: `npm run db:migrate:local` followed by `npm run db:seed:local` (seed resets and reseeds data). Local D1 state lives in `.wrangler/`.
- `npm run dev` — vinext dev server (http://localhost:3000).
- `npm run build` — build the Worker output to `dist/`; `npm run start` runs that build via Wrangler; `npm run preview` does both.
- `npm run deploy` — deploy to Cloudflare.
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` (`CloudflareEnv`) after changing `wrangler.jsonc` bindings.

There is no test runner or linter configured.

## Architecture

- **Runtime/DB access**: `lib/clipper/db.ts` gets the D1 binding (`DB`, declared in `wrangler.jsonc`) via `import { env } from "cloudflare:workers"` and wraps it with Drizzle using `db/schema.ts`. There is no `process.env`-style connection; always go through `getDatabase()`, per request.
- **Schema/migrations**: `db/schema.ts` defines tables (groomers, grooming_packages, groomer_service_areas, groomer_schedules, appointments). Migrations are SQL files in `drizzle/` (configured by `drizzle.config.ts`, also referenced as `migrations_dir` in `wrangler.jsonc`). Apply locally with `db:migrate:local`, which shells out to `wrangler d1 migrations apply DB --local`. Seed data is in `scripts/seed.sql`.
- **Data layer**: `lib/clipper/data.ts` holds query functions (booking options, appointment lookup by booking reference, `findAvailableGroomer` matching service area + schedule + non-overlapping appointments, `getAvailableSlots` for bookable start times, and cancel/reschedule by reference). Schedules and displayed times are KST; use the helpers in `lib/clipper/format.ts` rather than local `Date` getters, and `lib/clipper/status.ts` for appointment status display. Shared view types are in `lib/clipper/types.ts`. Server pages and API routes both call into this layer.
- **Routes** (`app/`): `/` home, `/appointments` list and `/appointments/[reference]` detail (looked up by booking reference), and API routes `api/booking-options` (GET options; add `?neighborhood=&packageId=` to also get bookable `slots`), `api/bookings` (POST; validates JSON body, assigns an available groomer, inserts appointment) and `api/bookings/[reference]/{cancel,reschedule,slots}`.
- **Components**: `components/clipper/*` are app-specific (booking flow, confirmation, cards, header); `components/ui/*` are generic primitives re-exported from `components/ui/index.ts`. Use the `@/` path alias for imports.
- **Vite config** (`vite.config.ts`): `vinext` plugin plus `@cloudflare/vite-plugin` with the `rsc` environment (SSR as child), CDN cache adapter and image optimizer from `@vinext/cloudflare`.


# Conventions

- Prices are stored as `priceCents` and rendered as `₩{cents.toLocaleString("ko-KR")}` (`formatMoney`).
- Always consider Cloudflare Workers / D1 runtime constraints; keep components modular and use TypeScript strictly.

Migrations are generated, never hand-edited: change db/schema.ts, then `npx drizzle-kit generate`.
No test runner exists. Don't invent one; use `npx tsc --noEmit`.

## Skills

- You have the following Markdown files ready to read:
  - /vercel-react-best-practices (use this when you need to know about React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.)