# hndld

## Overview

hndld is a mobile-first Progressive Web Application (PWA) designed as a white-glove luxury concierge platform for household operations management. The application connects household assistants with their clients (families) to coordinate daily tasks, calendar events, vendor management, spending tracking, and communication in a calm, premium interface.

The platform supports two primary user roles:
- **Assistant**: Manages daily tasks, calendar events, vendors, spending, posts updates, and handles household operations
- **Client**: Views weekly briefings, submits requests, approves purchases/decisions, and reads updates

The design philosophy emphasizes minimalist elegance with a porcelain + navy aesthetic, drawing inspiration from luxury brands like Chanel and high-end hotel concierge services.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite as the build tool
- **Routing**: Wouter for client-side routing with role-based route switching (ClientRouter vs AssistantRouter)
- **State Management**: TanStack React Query for server state, caching, and optimistic updates
- **Styling**: TailwindCSS with shadcn/ui component library (New York style variant) and custom CSS variables for theming
- **Design System**: Premium "White Glove" ambient theme with porcelain (#F8F5F0), navy (#14213D), gold (#C9A96E) palette. Cormorant Garamond (serif, headings, 300-700 weights) + DM Sans (sans, body, 300-700 weights) + IBM Plex Mono (mono, data/currency) via @fontsource. Luxury type scale (xs:12px–5xl:48px) with dramatic sizing. All page h1 titles use `font-display text-3xl font-light tracking-tight`. Section headers use `text-xs font-semibold uppercase tracking-widest`. CSS utility classes: `.font-display-light/regular/medium/semibold`, `.font-data` (tabular-nums mono), `.hndld-amount` (mono tabular-nums for currency), `.hndld-page-title`, `.hndld-section-title`. BreathingGreeting hero at 2.75rem with rAF opacity oscillation (0.72→1.0 over 6s sine wave). Time-aware UI with phase-based sky/accent/glow colors (morning/afternoon/evening/night). AmbientParticles (canvas), simplified 3-element header (logo, search icon, avatar dropdown with household switcher/role switcher/service switcher/notifications/nav links). Calm State: full-screen takeover on home screen when no pending approvals/overdue tasks/unpaid invoices (useAllHandled hook with 1s debounce, CalmState component with breathing greeting, gold divider, "Your home is in order" italic, date, last-checked timestamp from query dataUpdatedAt; time-of-day bg transition; AnimatePresence mode="wait" switches between calm-state and active-state branches). 3-tier card hierarchy: HeroCard (rounded-3xl, gradient glow), ActionCard (rounded-2xl, framer-motion hover lift, keyboard accessible), InsightCard (rounded-xl, surface2 bg). UpdateCard component with type-specific visual treatments (cleaning/grocery/maintenance/default). **Empty States**: Standardized luxury concierge brand voice across all pages. EmptyState component (components/premium/index.tsx) uses `font-display text-xl font-light tracking-tight` headings + `text-sm text-muted-foreground max-w-[300px] leading-relaxed` descriptions + HandledIllustration (56px, opacity-40) + `py-16 px-6` padding. Approved copy: Tasks="Your day is clear", Approvals="Nothing needs your attention", Spending="No expenses to review", Calendar="Your schedule is open", Messages="You're all caught up"
- **Header**: Translucent glass effect (`bg-background/70 backdrop-blur-2xl border-b border-border/20`), 3-element layout: logo (left), search icon (right), avatar dropdown (right). Bottom nav uses `bg-card/70 backdrop-blur-2xl` with gold active-tab indicator
- **Landing Page**: grain-overlay texture, gold divider accents between hero sections, section sub-headings (`text-xs font-semibold uppercase tracking-widest`), "THE PLATFORM" / "HOW IT WORKS" labels, gold-toned step numbers, testimonial with gold divider, trust indicators in uppercase, navy footer
- **Custom Icon System**: 16 branded dual-tone SVG icons in `components/icons/hndld-icons.tsx` using `currentColor` (navy structure) + `accentColor` prop (gold accents, default `#C9A96E`). Icons: IconHome, IconSchedule, IconMessages, IconProfile, IconSpending, IconTasks, IconSparkle, IconCleaning, IconCare, IconProvider, IconReferrals, IconRatings, IconAlert, IconComplete, IconClock, IconSettings. Convenience `<Icon name="..." />` component in `components/icons/icon.tsx`. Lookup map `hndldIcons` with type `HndldIconName`. Bottom nav uses active/inactive accent toggling (`accentColor={isActive ? "#C9A96E" : "currentColor"}`). Lucide kept only for utility icons (chevrons, X, Plus, Search, arrows, etc.). Dev icon gallery at `/dev/icons` (authenticated only).
- **CSS Utilities**: `.premium-card` (gradient card bg, light+dark), `.skeleton-shimmer` (gold-accent shimmer via `--hndld-gold-400`), `.hndld-glass` (backdrop-blur glassmorphism), `.grain-overlay` (SVG noise texture at 2.5% opacity), `.hndld-icon-interactive` (hover scale 1.05, active scale 0.95), `.hndld-nav-icon` (spring scale 1.1 on active)
- **Mobile-First**: Bottom tab navigation, iOS safe area padding, responsive layouts, PWA manifest for installability

### Backend Architecture
- **Runtime**: Node.js with Express.js server in TypeScript
- **API Design**: RESTful endpoints under `/api/v1/*` prefix with URL-based versioning (see docs/API_VERSIONING.md). Rate limiting via apiLimiter, authLimiter, criticalLimiter. Accept-Version header support via apiVersion middleware. Unversioned: `/api/health`, `/api/metrics`, auth routes
- **Route Organization**: Modular route files in `server/routes/` with domain-specific modules:
  - `helpers.ts` - Shared functions (calculateNextOccurrence, seedDemoData, getOrCreateHousehold, runMomentsAutomation)
  - `google-calendar.ts` - Google Calendar OAuth flow
  - `user-profile.ts` - User profile, role setup, dashboard, services, onboarding tour completion
  - `cleaning.ts` - Cleaning service & addon services endpoints
  - `tasks.ts` - Task CRUD, completion, recurrence, templates, checklists
  - `approvals.ts` - Approvals, updates, requests, comments, vendors, reactions
  - `spending.ts` - Spending, payments, invoices, payment profiles
  - `calendar.ts` - Calendar events & sync
  - `household-concierge.ts` - Onboarding, household settings, locations, people, preferences, dates, vault, playbooks
  - `admin.ts` - Audit logs, vault settings, handoff, notifications, search, push, suggestions
  - `admin-ops.ts` - Export, backup, organization management, billing
  - `features.ts` - Analytics, emergency contacts, messaging, AI assistant
  - `insights.ts` - Home Intelligence insights endpoint (GET /api/v1/insights, POST /api/v1/insights/:id/dismiss)
  - `inventory.ts` - Home inventory CRUD, warranty/maintenance alerts, insurance summary, service history, locations
  - `data-api.ts` - External data partner API with Bearer auth, usage tracking, 6 aggregate analytics endpoints (appliance-lifespan, vendor-pricing, maintenance-costs, seasonal-demand, service-quality, home-operating-costs)
  - `data-partners-admin.ts` - Admin CRUD for data partners, usage stats, API key rotation
  - `household-details.ts` - Household profile data (GET/POST/PATCH), data completion suggestions, consent management
  - `service-ratings.ts` - Service quality ratings CRUD, vendor rating summaries, rating prompts
  - `marketplace.ts` - Provider marketplace: search/filter providers (category, location, availability, rating, verification), provider detail by slug, booking request CRUD (create, confirm, cancel), booking messages, marketplace reviews (submit, helpful, report), badge computation
  - `provider/index.ts` - Provider portal: registration, profile management (CRUD with auto-slug), dashboard, clients (with tier limits), staff, schedule, invoices, booking request responses (accept/decline with fee calc), review responses, tier info, featured status
  - Existing Router-pattern modules: `households.ts`, `invites.ts`, `files.ts`, `weekly-brief.ts`
- **Services**:
  - `data-capture.ts` - State-to-region/climate derivation, completeness scoring, auto-capture vendor pricing from spending, auto-capture inventory events
- **Authentication**: Replit Auth integration with session-based authentication
- **Middleware**: Household context middleware for multi-tenant scoping, permission-based access control, request ID tracking (server/middleware/requestId.ts), response time APM (server/middleware/responseTime.ts)
- **APM Monitoring**: Built-in metrics collector (server/lib/metrics.ts) with response time percentiles, slow DB query tracking (>100ms), Prometheus endpoint at `/api/metrics`, JSON stats at `/api/metrics/json`, daily P95 log summary at midnight
- **Build System**: esbuild for server bundling with dependency allowlist, Vite for client bundling

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions with Drizzle-Zod integration for validation
- **Multi-Tenancy**: Organizations → Households → Users hierarchy with row-level security
- **Key Tables**: organizations, households, user_profiles, tasks, approvals, updates, requests, vendors, spending_items, calendar_events, playbooks, access_items (vault), files, messages, household_insights, inventory_items, inventory_service_history, household_details, vendor_pricing, inventory_events, service_quality_ratings, data_partners, data_api_logs, provider_profiles, booking_requests, booking_messages, marketplace_reviews
- **Session Storage**: PostgreSQL-backed sessions

### Security Features
- **Vault Security**: PIN-protected sensitive access items with bcrypt hashing and unlock attempt logging
- **Audit Logging**: Comprehensive activity tracking via audit_logs table
- **Permission System**: Role-based permissions (CAN_EDIT_TASKS, CAN_APPROVE, CAN_VIEW_VAULT, etc.) mapped to household roles
- **Rate Limiting**: Tiered rate limits for API, auth, expensive operations, and critical actions

## External Dependencies

### Third-Party Services
- **Stripe**: Billing and subscription management with webhook handling (server/services/billing.ts)
- **Google Calendar API**: OAuth-based calendar sync with AES-256-GCM token encryption (server/services/google-calendar.ts)
- **Anthropic Claude / OpenAI**: AI assistant for request parsing, weekly brief generation, voice transcription (server/services/ai-provider.ts), Home Intelligence calendar suggestions (server/services/home-intelligence.ts)
- **Nodemailer**: Email notifications with configurable SMTP
- **Sentry**: Error monitoring and performance tracking (production only)

### Storage
- **S3-Compatible Storage**: File uploads with local filesystem fallback (server/services/storage-provider.ts)
- **Multer**: File upload handling middleware

### Key NPM Packages
- **drizzle-orm / drizzle-kit**: Database ORM and migrations
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI primitives for shadcn/ui
- **date-fns**: Date manipulation
- **zod**: Runtime validation with drizzle-zod integration
- **winston**: Structured logging
- **express-rate-limit**: API rate limiting
- **passport**: Authentication middleware