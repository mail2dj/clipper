# Clipper Project Guide

## Overview

Clipper is a full-stack Next.js application integrated with Cloudflare D1 (via Drizzle ORM) and Wrangler.

## Architecture & Tech Stack

- Framework: Next.js (App Router)
- Database: Cloudflare D1 via Drizzle ORM
- Deployment / Local Runtime: Cloudflare Wrangler
- Styling: Tailwind CSS, shadcn/ui

## Common Commands

- `npm run dev` : Start local development server
- `npx wrangler d1 migrations apply DB --local --config wrangler.jsonc` : Apply local D1 database migrations
- `npx wrangler d1 execute DB --local --file=scripts/seed.sql --config wrangler.jsonc` : Seed local D1 database

## Guidelines for Claude

- Always consider the Cloudflare Workers / D1 runtime constraints.
- Keep components modular within the `components/` and `app/` directories.
- Use TypeScript strictly.

Prices are stored as `priceCents` and rendered as `₩{cents.toLocaleString("ko-KR")}`.

# Conventions

Migrations are generated, never hand-edited: change db/schema.ts, then `npx drizzle-kit generate`.
No test runner exists. Don't invent one; use `npx tsc --noEmit`.

## Skills

- You have the following Markdown files ready to read:
  - /vercel-react-best-practices (use this when you need to know about React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.)
