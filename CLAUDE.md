# ClearanceIQ — CLAUDE.md

## What This Is
A full-stack retail deal intelligence platform for Ohio.
Automatically monitors Walmart, Home Depot, Target, Best Buy,
Lowe's, Menards, and Amazon for hidden clearance, penny deals,
and markdowns that are 70–99% off original retail price.
Sends alerts via Email (Resend) and Web Push notifications only.
No SMS. No paid alert services. Zero monthly cost target.

## Core Mission
ONLY surface deals that are 70% off or greater.
Everything below 70% is filtered at the data collection layer
before it ever enters the database. No exceptions.

## Your Role
You are a principal-level full-stack engineer with 30+ years
of experience. You write production-grade code. You never cut
corners. You run all verification commands after every change.
You explain what you are doing before you do it.
When in doubt, build the simpler thing that actually works.

## Tech Stack (Do Not Deviate)
Frontend  : Next.js 14 App Router, TypeScript strict, Tailwind CSS
Components: shadcn/ui
Charts    : Recharts
Maps      : Leaflet.js + react-leaflet (OpenStreetMap, no API key)
Animation : Framer Motion
Data      : TanStack Query v5 (React Query)
ORM       : Prisma
Database  : Supabase PostgreSQL (free tier)
Cache     : Upstash Redis (free tier, REST API only)
Workers   : Python 3.11+ scripts via GitHub Actions
AI        : Groq API (free tier, llama-3.3-70b-versatile)
Email     : Resend (free tier) + React Email templates
Push      : Web Push API (VAPID keys, native browser, no service)
Alerts    : Email + Web Push ONLY. No SMS. No Twilio. Ever.
Hosting   : Vercel Hobby (frontend) + GitHub Actions (workers)

## Non-Negotiable Rules
- TypeScript strict mode. Zero `any` types.
- All secrets in .env.local — never hardcoded
- Every API call has try/catch + exponential backoff retry
- All DB queries use proper indexes
- Mobile-first responsive on every screen
- Run `npm run build` after every major feature — fix all errors
- Run `npm run type-check` after every file change
- 70% discount minimum is enforced at the WORKER level,
  not just the UI. If a deal is under 70% it never enters
  the database at all.

## Commands
npm run dev          → Start dev server (port 3000)
npm run build        → Production build (run often)
npm run type-check   → TypeScript check (no emit)
npm run lint         → ESLint
npx prisma generate  → Regenerate client after schema changes
npx prisma db push   → Push schema to Supabase
python workers/walmart_sync.py --dry-run → Test worker locally

## Design System
Background   : #07070C
Card surface : #13131F
Border       : #1E1E30
Accent       : #F97316 (orange — prices, CTAs, highlights)
Success      : #22C55E
Warning      : #EAB308
Error        : #EF4444
Penny        : #A855F7 (purple — 99% off deals only)
Blue         : #60A5FA (aisle/location info)
Text primary : #F1F5F9
Text muted   : #64748B
Price font   : Geist Mono (monospace)
UI font      : System UI

## Phase Tracker (update as you complete each phase)
- [x] PHASE 1 — Foundation
- [x] PHASE 2 — Walmart + Home Depot Live Data
- [x] PHASE 3 — All Retailers + UPC Enrichment
- [x] PHASE 4 — Full UI (All Screens)
- [x] PHASE 5 — Email + Web Push Alert System
- [x] PHASE 6 — AI Deal Scoring (Groq)
- [x] PHASE 7 — History + Analytics Screen
- [x] PHASE 8 — Scrapers + Polish
