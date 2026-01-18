# hndld

## Overview

hndld (formerly HouseOps) is a mobile-first Progressive Web Application (PWA) designed to streamline household operations management. White-glove household operations, handled. It serves as a coordination platform between household assistants and family clients, enabling task management, approvals, requests, updates, calendar integration, vendor tracking, and spending management.

The application supports two user roles:
- **Assistant**: Manages daily tasks, calendar events, vendors, spending, and posts updates
- **Client**: Views weekly briefings, submits requests, approves items, and reads updates

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite as the build tool
- **Routing**: Wouter for client-side routing with role-based route switching
- **State Management**: TanStack React Query for server state and caching
- **Styling**: TailwindCSS with shadcn/ui component library (New York style variant)
- **Design System**: Premium "White Glove" theme with porcelain (#F6F2EA) and ink navy (#1D2A44) color palette, Inter font family
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
- **API Design**: RESTful API endpoints under `/api/*` prefix
- **Build System**: esbuild for server bundling, Vite for client bundling
- **Development**: Hot module replacement via Vite middleware in development mode

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
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
- **Emergency Protocols**: Emergency contacts and protocols management with household-scoped authorization
- **Google Calendar Integration** (server/services/google-calendar-replit.ts): Replit connector-based Google Calendar sync with Skylight Calendar support via Google Calendar bridge
- **Database Tables**: subscriptions, payment_methods, invoices, analytics_events, emergency_contacts, emergency_protocols, conversations, messages, ai_settings

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
- Service worker support for offline capability
- Web app manifest at `/manifest.json`
- Apple mobile web app meta tags configured

### Development Tools
- Replit-specific Vite plugins for development (cartographer, dev-banner, runtime-error-modal)
- TypeScript with strict mode enabled
- Path aliases: `@/` maps to `client/src/`, `@shared/` maps to `shared/`