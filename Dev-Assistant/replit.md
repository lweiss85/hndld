# hndld

## Overview

hndld (formerly HouseOps) is a mobile-first Progressive Web Application (PWA) designed to streamline household operations management. White-glove household operations, handled. It serves as a coordination platform between household assistants and family clients, enabling task management, approvals, requests, updates, calendar integration, vendor tracking, and spending management.

The application supports three user roles:
- **Assistant**: Manages daily tasks, calendar events, vendors, spending, and posts updates for all service types
- **Client**: Views weekly briefings, submits requests, approves items, and reads updates (UI adapts per service type)
- **Staff**: Limited to CLEANING service tasks only; can view assigned tasks, post updates, and access entry instructions via vault unlock

### Service Types
The platform supports two service modes that affect UI and permissions:
- **PA (Personal Assistant)**: Full-featured household management with all views and capabilities
- **CLEANING**: Simplified cleaning service mode with specialized UI (Overview/Visits/Photos/Add-ons/Pay tabs), tip flow, and entry instructions reveal for staff

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite as the build tool
- **Routing**: Wouter for client-side routing with role-based route switching
- **State Management**: TanStack React Query for server state and caching
- **Styling**: TailwindCSS with shadcn/ui component library (New York style variant)
- **Design System**: Luxe "White Glove" theme with ink navy primary (#1D2A44), champagne gold accents (#D4C5A0), porcelain background (#F6F2EA), Inter font family
- **Motion System**: framer-motion for page transitions, stagger animations, ripple effects, success celebrations, haptic feedback
- **Accessibility**: LiveAnnouncerProvider for screen reader announcements, reduced motion support
- **Visual Effects**: Glass morphism (.hndld-glass), ambient glow (.hndld-glow), signature curves (.hndld-curve)
- **Typography Scale**: 
  - text-xs (12px): timestamps, metadata, badges
  - text-sm (14px): body text, labels, descriptions
  - text-base (16px): primary body, form inputs
  - text-lg (18px): section headers, card titles
  - text-xl (20px): page subtitles, emphasis
  - text-2xl (24px): page titles
  - text-3xl (32px): hero text, onboarding headers
- **Mobile-First**: Bottom tab navigation, safe area padding for iOS, responsive layouts with max-w-4xl container

### Backend Architecture
- **Runtime**: Node.js with Express.js server in TypeScript
- **API Design**: RESTful endpoints under `/api/v1/*` prefix with URL-based versioning. Rate limiting via apiLimiter, authLimiter. Accept-Version header support via apiVersion middleware
- **OpenAPI Documentation**: Swagger UI at `/api/docs`, JSON spec at `/api/docs/spec.json`. 155 documented endpoints across 43 tags using swagger-jsdoc and swagger-ui-express. JSDoc @openapi annotations on all route handlers in `server/routes/*.ts`. Component schemas defined in `server/lib/swagger.ts`
- **Route Organization**: 20 domain-specific route modules in `server/routes/` (tasks, approvals, spending, calendar, household-concierge, admin, admin-ops, features, cleaning, user-profile, google-calendar, files, weekly-brief, ask, shortcuts, network)
- **Caching**: In-memory cache (`server/lib/cache.ts`) with TTL-based expiration, pattern-based invalidation, and cache stats. Cached: household settings/preferences/locations/people/dates (5min), addon services/task templates (1hr), user profiles (5min), payment profiles (5min). Write-through invalidation on all mutation routes. Cache-Control middleware at `server/middleware/cacheControl.ts` sets appropriate HTTP headers
- **Build System**: esbuild for server bundling, Vite for client bundling
- **Development**: Hot module replacement via Vite middleware in development mode

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM, optimized connection pool (max 20, idle timeout 30s, connect timeout 5s) with event-based monitoring and periodic status logging. Pool stats (total/idle/waiting/utilization/lifetime errors) exposed via `/api/metrics/json` and Prometheus `/api/metrics`
- **Schema Location**: `shared/schema.ts` contains all table definitions with Drizzle-Zod integration for validation
- **Key Tables**: organizations, households, user_profiles, tasks, approvals, updates, requests, comments, vendors, spending_items, calendar_events, playbooks, playbook_steps, quick_request_templates, audit_logs, vault_settings, sessions, users
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

### Premium Platform Features
- **Audit Logging**: Comprehensive activity tracking via `audit_logs` table - tracks user actions, entity changes, before/after snapshots
- **Vault Security**: PIN-protected vault for sensitive access items with bcrypt hashing, auto-lock timer, and unlock attempt logging
- **Handoff Packets**: HTML export of household information for onboarding new assistants (people, preferences, dates, vendors, access info)
- **Role-Based Permissions**: Assistant-only access gates for sensitive operations (creating organizations, playbooks, handoff exports)
- **File Storage Abstraction**: S3-compatible storage with local filesystem fallback (server/services/storage-provider.ts)

### Phase 1: Launch-Critical Enhancements
- **Billing & Subscriptions** (server/services/billing.ts): Stripe integration with demo fallback, tiered plans (FREE through ENTERPRISE), checkout sessions, billing portal, webhook handling, invoice tracking
- **Analytics Dashboard** (server/services/analytics.ts): KPI tracking, tasks over time charts, category breakdowns, spending analysis, client impact summaries
- **AI Assistant** (server/services/ai-provider.ts): Anthropic Claude and OpenAI abstraction with demo fallback, request parsing, weekly brief generation, voice transcription (OpenAI Whisper), smart action suggestions
- **Household Knowledge Graph** (server/services/knowledge-graph.ts): Builds an in-memory graph of all household entities (people, vendors, tasks, preferences, events, spending, locations, dates) with relationship edges. Supports natural language queries via `/api/v1/ask` (AI-powered with rule-based fallback). Graph stats at `/api/v1/knowledge-graph`. Surfaces connections like spending totals per vendor, upcoming dates, and vendor activity levels
- **Siri Shortcuts** (server/routes/shortcuts.ts): Token-based API for iOS Shortcuts with endpoints for next cleaning, pending approvals, approve items, message assistant, monthly spending, and household status. All responses include a `spoken` field for Siri "Speak Text" action. Token management via POST/GET/DELETE `/api/v1/shortcuts/token(s)`. Shortcut definitions and setup guide at `public/shortcuts/`. Uses `api_tokens` table with scoping, expiration, and revocation
- **Personalized Weekly Briefs** (server/services/weekly-brief.ts): AI-powered personalized briefings that learn user preferences through engagement tracking. Scheduled delivery Sunday 8am and 6pm via cron jobs. Tracks user engagement with tasks, events, and approvals to personalize content. API routes at `/api/h/:householdId/weekly-brief/*` with feedback collection for continuous improvement
- **Emergency Protocols**: Emergency contacts and protocols management with household-scoped authorization
- **Google Calendar Integration** (server/services/google-calendar-replit.ts): Replit connector-based Google Calendar sync with Skylight Calendar support via Google Calendar bridge
- **Account Deletion** (server/routes/account-deletion.ts): GDPR-compliant account deletion with 7-day grace period. POST /user/delete (requires "DELETE MY ACCOUNT" confirmation text, optional reason), POST /user/delete/cancel, GET /user/delete/status. Background job via scheduler (daily 2am) processes expired requests. Deletes user data (notifications, celebrations, API tokens, 2FA secrets); if sole household member, cascades to delete household data (messages via conversations, tasks, approvals, spending, files, household). Frontend on Security page with pending deletion banner, cancel button, confirmation flow. Table: account_deletion_requests
- **GDPR Data Export** (server/routes/data-export.ts): User data export with GET /user/export (JSON download with Content-Disposition) and GET /user/export/preview (record counts). User-scoped data (tasks, approvals, spending, requests, messages, files, celebrations by createdBy/senderId/uploadedBy) separated from household-shared data (calendar events, vendors, people, preferences, locations). Frontend "Export My Data" section on Security page with preview grid and download button
- **Two-Factor Authentication** (server/routes/two-factor.ts): TOTP-based 2FA with setup (QR code generation), verify & enable, disable, status check, and login validation endpoints. Uses otplib for TOTP, vault encryption for secret storage, bcrypt-hashed backup codes (10 per user, one-time use). Attempt logging for security audit. Frontend at `/security` with QR scanner flow, backup code display/download, enable/disable toggle. Tables: two_factor_secrets, two_factor_attempts
- **Celebrations & Milestones** (server/services/celebrations.ts, server/routes/celebrations.ts): Anniversary celebrations (1-month, 3-month, 6-month, yearly with shareable graphics), milestone recognition (task count milestones at 10/25/50/100/250/500/1000, estimated hours saved), seasonal touches (personalized spring/summer/fall/winter checklists), pattern reminders (last year's events like parties), handwritten thank-you notes auto-queued at 3 months. Frontend at `/celebrations` with stat cards, filterable celebration cards, share preview overlay, and handwritten note tracker. Tables: celebrations, handwritten_notes
- **Trusted Network** (server/routes/network.ts): Cross-household social features enabling vendor sharing, verified reviews, referrals, group buying, and emergency coverage. Requires household connections (trust network) before data sharing. Tables: household_connections, vendor_reviews, vendor_shares, referrals, group_buy_requests, group_buy_offers, group_buy_participants, backup_providers, emergency_coverage_requests. Frontend at `/network` with 4 tabs (Network, Referrals, Group Deals, Coverage). Vendor detail dialog enhanced with Review, Share, Backup, and Refer actions
- **Database Tables**: subscriptions, payment_methods, invoices, analytics_events, emergency_contacts, emergency_protocols, conversations, messages, ai_settings, weekly_briefs, user_engagement, household_connections, vendor_reviews, vendor_shares, referrals, group_buy_requests, group_buy_offers, group_buy_participants, backup_providers, emergency_coverage_requests, celebrations, handwritten_notes

### Calendar Integration (Skylight + Google Calendar)
- **Architecture**: Uses Replit's Google Calendar connector for OAuth management
- **Skylight Support**: Skylight Calendar doesn't have a public API; users sync Skylight to Google Calendar, then hndld reads from Google Calendar
- **Storage**: Events stored in `calendar_events` table via storage abstraction layer
- **Sync**: `/api/calendar/sync` endpoint fetches events from connected Google account, stores/updates in database, removes deleted events
- **Status**: `/api/calendar/status` endpoint returns connection status
- **Note**: Replit connector is project-scoped (shared across household members), which fits the household management model

### Multi-Tenancy Architecture
- **Organization Layer**: Organizations serve as the top-level container for multi-household management
- **Hierarchy**: Organizations → Households → Users/Data
- **Assistant Capability**: Assistants can create organizations to manage multiple households
- **User Membership**: User profiles can be linked to both households and organizations
- **API Endpoints**: `/api/organizations/*` for organization CRUD operations

### Authentication
- **Method**: Replit Auth integration using OpenID Connect
- **Session Management**: Express sessions with PostgreSQL store, 7-day session TTL
- **User Flow**: OAuth-based login with automatic user profile creation and household setup

### Security Architecture (Multi-Household)
- **Two-Layer Security**: Middleware validates household membership, storage layer enforces row-level tenancy
- **Household Context Middleware** (server/middleware/householdContext.ts): Validates user membership in households before allowing access to household-scoped API routes. Uses an allowlist for bootstrap endpoints (auth, onboarding, user-profile).
- **Permission Middleware** (server/middleware/requirePermission.ts): Role-based access control that checks if users have required permissions (e.g., CAN_MANAGE_BACKUPS, CAN_ADMIN_EXPORTS, CAN_MANAGE_PLAYBOOKS, CAN_EDIT_TASKS, CAN_APPROVE, CAN_VIEW_VAULT, CAN_EDIT_VAULT).
- **Storage Layer Tenancy**: All storage get-by-id, update, and delete methods require householdId as first parameter. Delete methods return boolean for proper error handling. Nested resources (task checklist items, playbook steps) verify parent resource belongs to household.
- **Tenancy Utilities** (server/lib/tenancy.ts): Helper functions including assertBelongsToHousehold, scopedUpdate, scopedDelete, scopedGet for consistent tenancy enforcement.
- **Extended Request Types** (server/types/express.d.ts): Express.Request augmented with householdId, householdRole, userId, userProfile, and organizationId.
- **Default Household Persistence**: user_profiles table includes isDefault column to remember which household a user last accessed.
- **Route Protection Pattern**: `isAuthenticated -> householdContext -> requirePermission -> handler`
- **Permission Definitions** (server/lib/permissions.ts): ASSISTANT role has full permissions; CLIENT role has view-only and request-creation permissions.

### File Structure Convention
- `client/src/`: React frontend code with pages, components, hooks, and lib utilities
- `server/`: Express backend with routes, storage layer, and Replit integrations
- `shared/`: Shared TypeScript types and database schema
- `migrations/`: Drizzle database migrations

## External Dependencies

### Database
- PostgreSQL database (required, connection via DATABASE_URL environment variable)
- Drizzle ORM for type-safe database operations
- connect-pg-simple for session storage

### Authentication
- Replit Auth via OpenID Connect protocol
- Passport.js with openid-client strategy
- Requires SESSION_SECRET environment variable

### Frontend Libraries
- Radix UI primitives for accessible components
- date-fns for date manipulation
- Lucide React for icons
- embla-carousel-react for carousels
- react-day-picker for calendar components

### PWA Configuration
- Service worker support for offline capability via vite-plugin-pwa with Workbox
- Web app manifest at `/manifest.json`
- Apple mobile web app meta tags configured
- Offline caching: CacheFirst for fonts, NetworkFirst for API calls with 5-min expiration
- Service worker registered in production builds with update handlers
- OfflineIndicator component shows connection status

### Phase 3: Competitive Edge Features
- **AI Smart Suggestions** (server/services/ai-suggestions.ts): Pattern analysis detecting overdue tasks, waiting approvals, upcoming events; SmartSuggestions component on Today page with /api/suggestions endpoint
- **Web Push Notifications** (server/services/push-notifications.ts): VAPID-based browser notifications for approvals, tasks, updates; PushNotificationToggle in household profile Overview tab; pushSubscriptions table for subscription management
- **Required Environment Variables**: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY for push notifications

### UI/UX Design System
- **Semantic Status Colors**: Unified palette with muted variants (success-muted, warning-muted, destructive-muted, info-muted) for consistent badge styling across all pages
- **Typography Utilities**: heading-page, heading-section, heading-card, text-body, text-meta classes for consistent hierarchy
- **Micro-interactions**: card-interactive utility for hover effects, stagger-N classes for list animations, transition-luxury timing function
- **Badge Variants**: Extended shadcn Badge with success, warning, info variants using semantic tokens
- **StatusBadge Component**: Reusable component (client/src/components/ui/status-badge.tsx) for consistent status styling

### Security & Robustness
- **Invoice XSS Prevention**: All user inputs in generated invoice HTML are escaped via escapeHtml() helper
- **Invoice File Storage**: Invoice documents are written to storage provider before database record creation
- **Stripe Webhook Idempotency**: Invoice webhooks use upsert pattern to handle duplicate deliveries gracefully
- **Stripe Subscription Lookup**: Webhook handlers use stripeSubscriptionId for reliable subscription matching
- **Session Cookie Security**: Cookie secure flag is environment-conditional (production only)

### Development Tools
- Replit-specific Vite plugins for development (cartographer, dev-banner, runtime-error-modal)
- TypeScript with strict mode enabled
- Path aliases: `@/` maps to `client/src/`, `@shared/` maps to `shared/`