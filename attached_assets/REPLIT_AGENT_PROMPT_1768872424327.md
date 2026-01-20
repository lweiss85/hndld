# Replit Agent Prompt: Add Cleaning Client Support

Copy and paste this entire prompt into Replit Agent:

---

## Task: Add service type differentiation for PA vs CLEANING clients

Currently all clients see the same interface. We need to:
1. Add a `serviceType` field to households (PA or CLEANING)
2. Show different bottom navigation for cleaning clients (Schedule, Add-ons instead of Updates, Approvals)
3. Create an Add-ons page where cleaning clients can request priced services
4. Create a Schedule page where cleaning clients can see their cleaning visits

## Step 1: Update Schema

In `shared/schema.ts`, add this enum after line 14 (after recurrenceEnum):

```typescript
export const serviceTypeEnum = pgEnum("service_type", ["PA", "CLEANING"]);
```

Then modify the households table to add serviceType:

```typescript
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Add these new tables at the end of the schema (before relations):

```typescript
export const addonServices = pgTable("addon_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  householdId: varchar("household_id").references(() => households.id),
  name: text("name").notNull(),
  description: text("description"),
  priceInCents: integer("price_in_cents").notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  category: text("category").default("general"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cleaningVisits = pgTable("cleaning_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").default("SCHEDULED").notNull(),
  notes: text("notes"),
  rating: integer("rating"),
  feedback: text("feedback"),
  cleanerName: text("cleaner_name"),
  beforePhotos: jsonb("before_photos").$type<string[]>().default([]),
  afterPhotos: jsonb("after_photos").$type<string[]>().default([]),
  addonsRequested: jsonb("addons_requested").$type<string[]>().default([]),
  totalPriceInCents: integer("total_price_in_cents"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AddonService = typeof addonServices.$inferSelect;
export type InsertAddonService = typeof addonServices.$inferInsert;
export type CleaningVisit = typeof cleaningVisits.$inferSelect;
export type InsertCleaningVisit = typeof cleaningVisits.$inferInsert;
```

Run `npm run db:push` after these changes.

## Step 2: Create use-service-type hook

Create `client/src/hooks/use-service-type.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";

interface HouseholdData {
  id: string;
  name: string;
  serviceType: "PA" | "CLEANING";
}

export function useServiceType() {
  const { data: household } = useQuery<HouseholdData>({
    queryKey: ["/api/household"],
  });

  return {
    serviceType: household?.serviceType || "PA",
    isCleaning: household?.serviceType === "CLEANING",
    isPA: household?.serviceType !== "CLEANING",
    isLoading: !household,
  };
}
```

## Step 3: Update bottom-nav.tsx

Replace `client/src/components/layout/bottom-nav.tsx` to support different tabs for cleaning clients:

- Import `useServiceType` hook
- Add `cleaningClientTabs` array with: Home, Schedule, Add-ons, Money, Messages
- Use `isCleaning` to conditionally render cleaning tabs vs PA tabs

Key change in the component:
```typescript
const { isCleaning } = useServiceType();

const tabs = activeRole === "ASSISTANT" 
  ? assistantTabs 
  : isCleaning 
    ? cleaningClientTabs 
    : paClientTabs;
```

## Step 4: Create pages/addons.tsx

Create a new page for cleaning clients to request add-on services. Features:
- Show next cleaning date at top
- Display pending add-on requests
- Grid of available add-ons with prices
- Tap to request an add-on (creates an approval)
- Default add-ons: Deep Clean Refrigerator ($25), Interior Windows ($40), Oven Cleaning ($30), Inside Cabinets ($35), Laundry Service ($20), Change Bed Linens ($15), Baseboards ($25), Organize Pantry ($40)

## Step 5: Create pages/schedule.tsx

Create a new page showing cleaning schedule. Features:
- Hero card showing next cleaning date/time
- Quick actions: Book Extra, Message Team
- List of upcoming cleanings
- History of past cleanings with ratings

## Step 6: Update App.tsx

Add imports:
```typescript
import Addons from "@/pages/addons";
import Schedule from "@/pages/schedule";
```

Add routes to ClientRouter:
```typescript
<Route path="/addons" component={Addons} />
<Route path="/schedule" component={Schedule} />
```

## Step 7: Add API routes in server/routes.ts

Add these endpoints:
- GET /api/household - return household with serviceType
- GET /api/addon-services - return addon services for household
- GET /api/cleaning/next - return next scheduled cleaning
- GET /api/cleaning/visits - return all cleaning visits

## Step 8: Add storage methods

In server/storage.ts, add methods:
- getHousehold(householdId)
- getAddonServices(householdId)
- getNextCleaningVisit(householdId)
- getCleaningVisits(householdId)
- createCleaningVisit(data)
- updateCleaningVisit(id, data)

---

After completing all steps, to test:
1. Run `npm run db:push`
2. Set a household's serviceType to 'CLEANING' in the database
3. Log in as that household's client
4. Verify the bottom nav shows: Home, Schedule, Add-ons, Money, Messages
