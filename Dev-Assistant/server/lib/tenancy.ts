import { db } from "../db";
import { eq, and } from "drizzle-orm";
import type { PgTable, TableConfig } from "drizzle-orm/pg-core";

export class TenancyError extends Error {
  public statusCode: number;
  
  constructor(message: string, statusCode: number = 404) {
    super(message);
    this.name = "TenancyError";
    this.statusCode = statusCode;
  }
}

export async function assertBelongsToHousehold<T extends PgTable<TableConfig>>(
  table: T,
  idField: keyof T["_"]["columns"],
  householdField: keyof T["_"]["columns"],
  id: string,
  householdId: string
): Promise<T["$inferSelect"]> {
  const idColumn = (table as any)[idField];
  const householdColumn = (table as any)[householdField];
  
  const result = await db
    .select()
    .from(table as any)
    .where(and(eq(idColumn, id), eq(householdColumn, householdId)));
    
  const record = result[0];
  if (!record) {
    throw new TenancyError(`Resource not found in this household`);
  }
  
  return record as T["$inferSelect"];
}

export async function scopedUpdate<T extends PgTable<TableConfig>>(
  table: T,
  idField: keyof T["_"]["columns"],
  householdField: keyof T["_"]["columns"],
  id: string,
  householdId: string,
  patch: Partial<T["$inferInsert"]>
): Promise<T["$inferSelect"] | undefined> {
  const idColumn = (table as any)[idField];
  const householdColumn = (table as any)[householdField];
  
  const result = await db
    .update(table as any)
    .set(patch as any)
    .where(and(eq(idColumn, id), eq(householdColumn, householdId)))
    .returning();
    
  return result[0] as T["$inferSelect"] | undefined;
}

export async function scopedDelete<T extends PgTable<TableConfig>>(
  table: T,
  idField: keyof T["_"]["columns"],
  householdField: keyof T["_"]["columns"],
  id: string,
  householdId: string
): Promise<boolean> {
  const idColumn = (table as any)[idField];
  const householdColumn = (table as any)[householdField];
  
  const result = await db
    .delete(table as any)
    .where(and(eq(idColumn, id), eq(householdColumn, householdId)))
    .returning();
    
  return (result as any[]).length > 0;
}

export async function scopedGet<T extends PgTable<TableConfig>>(
  table: T,
  idField: keyof T["_"]["columns"],
  householdField: keyof T["_"]["columns"],
  id: string,
  householdId: string
): Promise<T["$inferSelect"] | undefined> {
  const idColumn = (table as any)[idField];
  const householdColumn = (table as any)[householdField];
  
  const result = await db
    .select()
    .from(table as any)
    .where(and(eq(idColumn, id), eq(householdColumn, householdId)));
    
  return result[0] as T["$inferSelect"] | undefined;
}
