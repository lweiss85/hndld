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
- **Design System**: Premium "White Glove" theme with porcelain (#F6F2EA) and ink navy (#1D2A44) color palette, Inter font family
- **Mobile-First**: Bottom tab navigation, iOS safe area padding, responsive layouts, PWA manifest for installability

### Backend Architecture
- **Runtime**: Node.js with Express.js server in TypeScript
- **API Design**: RESTful endpoints under `/api/v1/*` prefix with URL-based versioning (see docs/API_VERSIONING.md). Rate limiting via apiLimiter, authLimiter, criticalLimiter. Accept-Version header support via apiVersion middleware. Unversioned: `/api/health`, `/api/metrics`, auth routes
- **Route Organization**: Modular route files in `server/routes/` with domain-specific modules:
  - `helpers.ts` - Shared functions (calculateNextOccurrence, seedDemoData, getOrCreateHousehold, runMomentsAutomation)
  - `google-calendar.ts` - Google Calendar OAuth flow
  - `user-profile.ts` - User profile, role setup, dashboard, services
  - `cleaning.ts` - Cleaning service & addon services endpoints
  - `tasks.ts` - Task CRUD, completion, recurrence, templates, checklists
  - `approvals.ts` - Approvals, updates, requests, comments, vendors, reactions
  - `spending.ts` - Spending, payments, invoices, payment profiles
  - `calendar.ts` - Calendar events & sync
  - `household-concierge.ts` - Onboarding, household settings, locations, people, preferences, dates, vault, playbooks
  - `admin.ts` - Audit logs, vault settings, handoff, notifications, search, push, suggestions
  - `admin-ops.ts` - Export, backup, organization management, billing
  - `features.ts` - Analytics, emergency contacts, messaging, AI assistant
  - Existing Router-pattern modules: `households.ts`, `invites.ts`, `files.ts`, `weekly-brief.ts`
- **Authentication**: Replit Auth integration with session-based authentication
- **Middleware**: Household context middleware for multi-tenant scoping, permission-based access control, request ID tracking (server/middleware/requestId.ts), response time APM (server/middleware/responseTime.ts)
- **APM Monitoring**: Built-in metrics collector (server/lib/metrics.ts) with response time percentiles, slow DB query tracking (>100ms), Prometheus endpoint at `/api/metrics`, JSON stats at `/api/metrics/json`, daily P95 log summary at midnight
- **Build System**: esbuild for server bundling with dependency allowlist, Vite for client bundling

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions with Drizzle-Zod integration for validation
- **Multi-Tenancy**: Organizations → Households → Users hierarchy with row-level security
- **Key Tables**: organizations, households, user_profiles, tasks, approvals, updates, requests, vendors, spending_items, calendar_events, playbooks, access_items (vault), files, messages
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
- **Anthropic Claude / OpenAI**: AI assistant for request parsing, weekly brief generation, voice transcription (server/services/ai-provider.ts)
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