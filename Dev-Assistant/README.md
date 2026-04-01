**Your home, handled.**

hndld is a dual-experience household management platform. It serves two audiences from one codebase: consumers who manage their own homes, and professional concierges/cleaners who manage client households.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/lweiss85/hndld.git
cd hndld

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Then edit .env with your actual values (see Environment Variables below)

# 4. Create database tables
npm run db:push

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:5000` (or the port shown in terminal).

---

## Project Structure

```
hndld/
├── client/                    # Frontend (React + TypeScript)
│   └── src/
│       ├── pages/             # All page components (53 pages)
│       ├── components/        # Shared UI components
│       │   ├── layout/        # Bottom nav, sidebar, app shell
│       │   ├── ui/            # shadcn/ui primitives (buttons, cards, etc.)
│       │   └── ...            # Feature-specific components
│       ├── hooks/             # Custom React hooks
│       ├── lib/               # Utilities, API client, user context
│       └── styles/            # Global CSS
│
├── server/                    # Backend (Node.js + Express + TypeScript)
│   ├── routes/                # API route modules (modular by domain)
│   │   ├── tasks.ts           # Task CRUD, completion, templates
│   │   ├── households.ts      # Household management
│   │   ├── invites.ts         # Household invite system
│   │   ├── files.ts           # File upload/download
│   │   └── ...                # Other domain routes
│   ├── routes.ts              # Main route registration (legacy monolith — being split)
│   ├── services/              # Business logic layer
│   │   ├── ai-provider.ts     # Claude/OpenAI abstraction + NL parsing
│   │   ├── ai-chat.ts         # Contextual AI chat with household awareness
│   │   ├── ai-suggestions.ts  # Smart suggestions + pattern analysis
│   │   ├── home-intelligence.ts  # Predictive maintenance + spending anomalies
│   │   ├── predictive-maintenance.ts  # Appliance lifespan + consumable tracking
│   │   ├── knowledge-graph.ts # Household preference memory + relationships
│   │   ├── billing.ts         # Stripe subscriptions + checkout + webhooks
│   │   ├── google-calendar.ts # Per-user OAuth + AES-256-GCM encrypted tokens
│   │   ├── handoff.ts         # Handoff packet generation
│   │   ├── websocket.ts       # Household-scoped real-time broadcasting
│   │   ├── notifications.ts   # Email (SMTP) + SMS (Twilio)
│   │   ├── push-notifications.ts  # Web Push (VAPID)
│   │   ├── scheduler.ts       # Cron jobs (calendar sync, backups)
│   │   ├── analytics.ts       # Usage + engagement analytics
│   │   ├── aggregate-analytics.ts  # Cross-household anonymized benchmarks
│   │   ├── data-anonymization.ts   # Data anonymization for external use
│   │   ├── data-capture.ts    # Automatic data collection
│   │   ├── audit.ts           # Entity audit logging with before/after
│   │   ├── backup.ts          # Full data export/zip
│   │   └── storage-provider.ts  # Local + S3 file storage abstraction
│   ├── middleware/
│   │   ├── householdContext.ts # Multi-tenant household resolution
│   │   ├── requirePermission.ts  # Permission gate
│   │   └── serviceScope.ts    # CLEANING vs PA data isolation
│   ├── lib/
│   │   ├── permissions.ts     # Role-based access (ASSISTANT/CLIENT/STAFF)
│   │   ├── tenancy.ts         # Scoped CRUD helpers
│   │   ├── crypto.ts          # AES-256-GCM encrypt/decrypt
│   │   ├── logger.ts          # Winston structured logging + PII redaction
│   │   ├── rate-limit.ts      # Tiered API rate limiters
│   │   └── escape-html.ts     # XSS prevention for invoice templates
│   └── replit_integrations/   # Replit-specific auth (WILL BE REPLACED with Clerk)
│       └── auth/
│           ├── replitAuth.ts  # Replit OIDC + passport + sessions
│           └── storage.ts     # User upsert for Replit Auth
│
├── shared/                    # Shared between frontend and backend
│   └── schema.ts              # Drizzle ORM schema (80+ tables, ~2,937 lines)
│
├── .env.example               # Environment variable documentation
├── package.json               # Dependencies and scripts
├── vite.config.ts             # Vite build configuration
├── tsconfig.json              # TypeScript configuration
├── drizzle.config.ts          # Drizzle ORM configuration
└── Dockerfile                 # Container definition
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, Wouter (routing), TanStack React Query |
| UI | TailwindCSS + shadcn/ui (New York variant), Framer Motion, Recharts |
| Backend | Node.js + Express + TypeScript |
| ORM | Drizzle ORM (type-safe, schema-driven) |
| Database | PostgreSQL (80+ tables) |
| Auth | Replit OIDC (**must migrate to Clerk** — see Known Issues) |
| Payments | Stripe (subscriptions, invoicing, webhooks) |
| AI | Anthropic Claude + OpenAI (NL parsing, briefs, chat, Whisper transcription) |
| Calendar | Google Calendar API (OAuth 2.0, AES-256-GCM encrypted tokens) |
| Files | S3-compatible + local fallback |
| Real-time | WebSocket (ws) for household-scoped broadcasting |
| Validation | Zod (request/response schemas) |
| Logging | Winston (structured, PII redaction) |
| PWA | vite-plugin-pwa + Workbox |

---

## User Roles

| Role | Description |
|------|-------------|
| `ASSISTANT` | Professional concierge/cleaner managing client households |
| `CLIENT` | Household client whose home is managed by a concierge |
| `STAFF` | Staff member working under an assistant (limited permissions) |
| `HOUSEHOLD` | Self-managing consumer (**planned — consumer refactoring**) |

---

## Key Concepts

**Multi-Tenancy:** Organizations → Households → Users. Every data query is scoped to the active household via the `householdContext` middleware. The `X-Household-Id` header selects the active household.

**Task Status Flow:** `INBOX → PLANNED → IN_PROGRESS → WAITING_ON_CLIENT → DONE / CANCELLED`

**Service Types:** Tasks, approvals, spending, and updates can be scoped to `CLEANING` or `PA` service types. Users with memberships in both see both.

**Vault Security:** Sensitive data (WiFi passwords, alarm codes) is AES-256 encrypted with PIN-protected access, auto-lock, and full audit logging.

**Data Collection:** Analytics events, task patterns, learned preferences, and household insights are continuously captured for AI features and future data licensing. The anonymization service ensures safe external use.

---

## Environment Variables

See `.env.example` for the complete list with comments. Key variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | 32+ char secret for session encryption |
| `VAULT_ENCRYPTION_KEY` | Yes | 64-char hex key for vault AES encryption |
| `GOOGLE_CLIENT_ID` | For calendar | Google Cloud OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For calendar | Google Cloud OAuth secret |
| `STRIPE_SECRET_KEY` | For billing | Stripe API secret key |
| `ANTHROPIC_API_KEY` | For AI | Anthropic Claude API key |
| `OPENAI_API_KEY` | For AI | OpenAI API key (fallback + Whisper) |

---

## Scripts

```bash
npm run dev          # Start development server (Vite + Express)
npm run build        # Build for production
npm run db:push      # Push schema changes to database (NOT for production — use migrations)
npm run db:studio    # Open Drizzle Studio (database browser)
```

---

## Known Issues (Pre-Handoff)

1. **Auth locked to Replit** — Must migrate to Clerk before deploying outside Replit
2. **No database migrations** — Using `db:push` which can drop data. Must switch to migration files.
3. **Data isolation by app code** — Multi-tenancy needs PostgreSQL Row Level Security
4. **WebSocket not wired to React Query** — Real-time events don't reach the UI
5. **React Query staleTime = Infinity** — Data never auto-refreshes
6. **tasks.tsx is 1,727 lines** — Needs component decomposition
7. **Invoice HTML has XSS risk** — User input not escaped in invoice templates

See the Developer Handoff Document for the complete technical audit and roadmap.

---

## Brand

| Element | Value |
|---------|-------|
| Primary Color | Ink Navy `#1D2A44` |
| Background | Porcelain `#F6F2EA` |
| Accent | Champagne Gold `#B8964F` |
| Display Font | Fraunces (serif) |
| Body Font | Inter (sans-serif) |
| Component Library | shadcn/ui — New York variant |

---

## License

Proprietary. All rights reserved. © 2026 LWeiss Cleaning LLC.
