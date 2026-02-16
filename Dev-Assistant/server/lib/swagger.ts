import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "hndld API",
      version: "1.0.0",
      description: "White-glove luxury concierge platform for household operations management. Connects household assistants with clients to coordinate tasks, calendar events, vendor management, spending tracking, and communication.",
      contact: {
        name: "hndld Support",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1",
      },
    ],
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "connect.sid",
          description: "Session cookie from Replit Auth login",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
            requestId: { type: "string", format: "uuid" },
          },
        },
        Task: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", nullable: true },
            assignedTo: { type: "string", nullable: true },
            dueDate: { type: "string", format: "date-time", nullable: true },
            isRecurring: { type: "boolean" },
            recurrencePattern: { type: "string", nullable: true },
            estimatedMinutes: { type: "integer", nullable: true },
            serviceType: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Approval: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            category: { type: "string", nullable: true },
            amount: { type: "string", nullable: true },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        SpendingItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            description: { type: "string" },
            amount: { type: "string" },
            category: { type: "string", nullable: true },
            vendor: { type: "string", nullable: true },
            date: { type: "string", format: "date" },
            status: { type: "string" },
            receiptUrl: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CalendarEvent: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time", nullable: true },
            location: { type: "string", nullable: true },
            isAllDay: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Vendor: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            name: { type: "string" },
            category: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
            rating: { type: "integer", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Update: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            title: { type: "string" },
            content: { type: "string" },
            category: { type: "string", nullable: true },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Request: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            status: { type: "string", enum: ["open", "in_progress", "completed", "cancelled"] },
            priority: { type: "string", nullable: true },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Household: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            organizationId: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "integer" },
            userId: { type: "string" },
            displayName: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            role: { type: "string", enum: ["ASSISTANT", "CLIENT", "STAFF"] },
            householdId: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "integer" },
            userId: { type: "string" },
            title: { type: "string" },
            message: { type: "string" },
            type: { type: "string" },
            isRead: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        File: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            filename: { type: "string" },
            originalName: { type: "string" },
            mimeType: { type: "string" },
            size: { type: "integer" },
            url: { type: "string" },
            category: { type: "string", nullable: true },
            uploadedBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Invite: {
          type: "object",
          properties: {
            id: { type: "integer" },
            householdId: { type: "string", format: "uuid" },
            token: { type: "string" },
            role: { type: "string" },
            email: { type: "string", nullable: true },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
      parameters: {
        HouseholdHeader: {
          in: "header",
          name: "X-Household-Id",
          schema: { type: "string", format: "uuid" },
          description: "Active household ID for multi-tenant context",
          required: false,
        },
      },
    },
    security: [{ session: [] }],
  },
  apis: ["./server/routes/*.ts"],
};

export function setupSwagger(app: Express) {
  const spec = swaggerJsdoc(options);

  app.get("/api/docs/spec.json", (_req, res) => {
    res.json(spec);
  });

  app.use("/api/docs", swaggerUi.serve as any, swaggerUi.setup(spec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "hndld API Documentation",
  }));
}
