# API Versioning Strategy

## Overview

The hndld API uses URL-based versioning with an optional `Accept-Version` header for version negotiation.

## URL Structure

All business API endpoints are prefixed with `/api/v1/`:

```
GET /api/v1/tasks
POST /api/v1/approvals
GET /api/v1/spending
```

## Unversioned Endpoints

The following infrastructure endpoints remain unversioned for load balancer and tooling compatibility:

| Endpoint | Purpose |
|---|---|
| `/api/health` | Health check for load balancers |
| `/health` | Alternative health check |
| `/api/metrics` | Prometheus metrics (text format) |
| `/api/metrics/json` | Metrics (JSON format) |
| `/api/login` | Authentication (Replit Auth) |
| `/api/logout` | Session logout |
| `/api/callback` | OAuth callback |
| `/api/auth/user` | Current user info |

## Version Negotiation

Clients can send an `Accept-Version` header to declare the API version they expect:

```
Accept-Version: 1
```

If the requested version is not supported, the server responds with `400 Bad Request`:

```json
{
  "error": "Unsupported API version",
  "requested": "2",
  "supported": ["1"]
}
```

Every response from a versioned endpoint includes an `X-API-Version` header confirming the version used.

## Backward Compatibility

During the transition period, the original `/api/*` paths continue to work and are routed to the v1 handlers. This allows existing clients and integrations to continue working without immediate updates.

```
GET /api/tasks        → routes to v1 handler (backward compat)
GET /api/v1/tasks     → routes to v1 handler (canonical)
```

New integrations should use the `/api/v1/` prefix.

## Adding a New Version

When a v2 is needed:

1. Create a new `v2` Express Router in `server/routes.ts`
2. Mount it at `/api/v2`
3. Add `"2"` to `SUPPORTED_VERSIONS` in `server/middleware/apiVersion.ts`
4. Register v2-specific route modules on the new router
5. Keep v1 routes active for backward compatibility
6. Update the `CURRENT_VERSION` constant when v2 becomes the default

## Frontend Integration

The frontend uses a centralized `versionedUrl()` function exported from `client/src/lib/queryClient.ts` that automatically maps `/api/*` calls to `/api/v1/*`. Auth and infrastructure endpoints (`/api/auth/*`, `/api/login`, `/api/logout`, `/api/callback`, `/api/health`, `/api/metrics`) are excluded from this mapping.

Both `apiRequest()` and `getQueryFn()` apply `versionedUrl()` internally. Direct `fetch()` calls throughout the frontend also use `versionedUrl()` to ensure consistent routing to versioned endpoints.
