# Replit Agent Prompt: Production Readiness Fixes

Copy this entire prompt into Replit Agent:

---

## Task: Make hndld production-ready by fixing critical security gaps

I need you to implement the following production-critical fixes. Do them in order.

---

## FIX 1: Add Helmet Security Headers

Install helmet and add security headers.

```bash
npm install helmet
```

In `server/index.ts`, add after the imports:

```typescript
import helmet from "helmet";
```

Add after `app.use(express.urlencoded({ extended: false }));`:

```typescript
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https://api.stripe.com", "wss:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some third-party scripts
}));
```

---

## FIX 2: Add Health Check Endpoint

In `server/routes.ts`, add near the top of the `registerRoutes` function (before other routes):

```typescript
// Health check endpoint for load balancers and monitoring
app.get("/health", (_req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    database: "connected", // Add actual DB check in production
    version: process.env.npm_package_version || "1.0.0"
  });
});
```

---

## FIX 3: Add SameSite Cookie and Body Limits

In `server/replit_integrations/auth/replitAuth.ts`, update the cookie config:

```typescript
cookie: {
  httpOnly: true,
  secure: true,
  sameSite: "lax",  // ADD THIS LINE
  maxAge: sessionTtl,
},
```

In `server/index.ts`, update the JSON parser to add size limit:

```typescript
app.use(
  express.json({
    limit: "10mb",  // ADD THIS - prevents DoS via large payloads
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));  // ADD limit here too
```

---

## FIX 4: Encrypt Vault Items (Access Items)

Create a new file `server/lib/vault-encryption.ts`:

```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getVaultKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("VAULT_ENCRYPTION_KEY or SESSION_SECRET required for vault encryption");
  }
  // Derive a 32-byte key from the secret
  return crypto.scryptSync(secret, "vault-salt-hndld", 32);
}

export function encryptVaultValue(plaintext: string): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptVaultValue(encryptedData: string): string {
  const key = getVaultKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  
  if (!ivHex || !authTagHex || !encrypted) {
    // If not in encrypted format, return as-is (for migration)
    return encryptedData;
  }
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  // Check if value matches our encryption format (iv:authTag:data)
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}
```

---

## FIX 5: Update Access Items Routes to Use Encryption

In `server/routes.ts`, find the access items routes and update them.

Add import at top:
```typescript
import { encryptVaultValue, decryptVaultValue, isEncrypted } from "./lib/vault-encryption";
```

Find the POST `/api/access-items` route and update to encrypt on save:

```typescript
// In the POST /api/access-items handler, before saving:
const encryptedValue = encryptVaultValue(req.body.value);
const accessItem = await storage.createAccessItem({
  ...req.body,
  value: encryptedValue,  // Save encrypted
  householdId,
});
// Return decrypted for response
res.json({ ...accessItem, value: req.body.value });
```

Find the GET `/api/access-items` route and update to decrypt on read:

```typescript
// In the GET /api/access-items handler, before returning:
const decryptedItems = accessItems.map(item => ({
  ...item,
  value: decryptVaultValue(item.value),
}));
res.json(decryptedItems);
```

Find the PATCH `/api/access-items/:id` route and update:

```typescript
// In the PATCH handler, if value is being updated:
if (req.body.value) {
  req.body.value = encryptVaultValue(req.body.value);
}
```

---

## FIX 6: Add Input Validation Schemas

In `server/routes.ts`, add these Zod schemas after the existing imports:

```typescript
// Add near other schema definitions
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  category: z.enum(["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]).optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  location: z.string().max(500).optional(),
  assignedTo: z.string().optional(),
  estimatedMinutes: z.number().int().positive().max(1440).optional(),
});

const createApprovalSchema = z.object({
  title: z.string().min(1).max(500),
  details: z.string().max(5000).optional(),
  amount: z.number().int().min(0).optional(),
  links: z.array(z.string().url()).optional(),
  images: z.array(z.string()).optional(),
});

const createRequestSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  category: z.enum(["HOUSEHOLD", "ERRANDS", "MAINTENANCE", "GROCERIES", "KIDS", "PETS", "EVENTS", "OTHER"]).optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  images: z.array(z.string()).optional(),
});

const createAccessItemSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.string().min(1).max(1000),
  category: z.enum(["ENTRY", "WIFI", "ALARM", "LOCKS", "GARAGE", "OTHER"]).optional(),
  notes: z.string().max(2000).optional(),
  isSensitive: z.boolean().optional(),
});
```

Then update each route to validate. Example for POST /api/tasks:

```typescript
app.post("/api/tasks", isAuthenticated, householdContext, requirePermission("CAN_EDIT_TASKS"), async (req: any, res) => {
  try {
    const validation = createTaskSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        message: "Invalid request body", 
        errors: validation.error.errors 
      });
    }
    
    const data = validation.data;
    // ... rest of handler using data instead of req.body
```

---

## FIX 7: Add File Upload Size Limit

Find where file uploads are handled (likely in fileRoutes). Add multer with size limits:

```typescript
import multer from "multer";

const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5, // Max 5 files per request
  },
  fileFilter: (_req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "text/plain", "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});
```

---

## FIX 8: Add VAULT_ENCRYPTION_KEY to .env.example

Add to `.env.example`:

```bash
# -----------------------------------------------------------------------------
# Vault Encryption (Required for secure storage of sensitive items)
# -----------------------------------------------------------------------------
VAULT_ENCRYPTION_KEY=your-vault-encryption-key-minimum-32-characters-change-this
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# If not set, SESSION_SECRET will be used as fallback
```

---

## Summary of Changes

After implementing all fixes:

| Fix | File(s) Modified |
|-----|------------------|
| Helmet security headers | server/index.ts |
| Health check endpoint | server/routes.ts |
| SameSite cookie | server/replit_integrations/auth/replitAuth.ts |
| Body size limits | server/index.ts |
| Vault encryption | NEW: server/lib/vault-encryption.ts, server/routes.ts |
| Input validation | server/routes.ts |
| File upload limits | server/routes.ts or file routes |
| Env example | .env.example |

---

## Testing After Implementation

1. **Health check:**
   ```bash
   curl http://localhost:5000/health
   curl http://localhost:5000/api/health
   ```

2. **Security headers:**
   ```bash
   curl -I http://localhost:5000 | grep -i "x-frame\|x-content\|strict"
   ```

3. **Vault encryption:**
   - Create an access item with sensitive data
   - Check database - value should be encrypted (format: `hex:hex:hex`)
   - Retrieve via API - should be decrypted

4. **Body size limit:**
   - Try sending a request with >10MB body - should get 413 error

---

## Post-Implementation Checklist

- [ ] Run `npm install helmet` if not already installed
- [ ] Set VAULT_ENCRYPTION_KEY in production environment
- [ ] Test all fixed endpoints
- [ ] Migrate existing access items to encrypted format (one-time script)
- [ ] Consider adding automated tests for critical paths
