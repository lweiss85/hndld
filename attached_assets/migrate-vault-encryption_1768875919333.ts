/**
 * Migration Script: Encrypt Existing Access Items
 * 
 * Run this ONCE after deploying the vault encryption feature to migrate
 * existing plaintext values to encrypted format.
 * 
 * Usage:
 *   npx tsx scripts/migrate-vault-encryption.ts
 * 
 * Or add to package.json scripts:
 *   "migrate:vault": "tsx scripts/migrate-vault-encryption.ts"
 */

import { db } from "../server/db";
import { accessItems } from "../shared/schema";
import { encryptVaultValue, isEncrypted } from "../server/lib/vault-encryption";
import { eq } from "drizzle-orm";

async function migrateVaultItems() {
  console.log("[Migration] Starting vault encryption migration...");
  
  // Fetch all access items
  const items = await db.select().from(accessItems);
  console.log(`[Migration] Found ${items.length} access items to check`);
  
  let migratedCount = 0;
  let alreadyEncryptedCount = 0;
  let errorCount = 0;
  
  for (const item of items) {
    try {
      // Check if already encrypted
      if (isEncrypted(item.value)) {
        alreadyEncryptedCount++;
        continue;
      }
      
      // Encrypt the value
      const encryptedValue = encryptVaultValue(item.value);
      
      // Update in database
      await db.update(accessItems)
        .set({ value: encryptedValue, updatedAt: new Date() })
        .where(eq(accessItems.id, item.id));
      
      migratedCount++;
      console.log(`[Migration] Encrypted item: ${item.id} (${item.title})`);
    } catch (error) {
      errorCount++;
      console.error(`[Migration] Failed to migrate item ${item.id}:`, error);
    }
  }
  
  console.log("\n[Migration] Complete!");
  console.log(`  - Migrated: ${migratedCount}`);
  console.log(`  - Already encrypted: ${alreadyEncryptedCount}`);
  console.log(`  - Errors: ${errorCount}`);
  
  if (errorCount > 0) {
    console.error("\n⚠️  Some items failed to migrate. Check logs above.");
    process.exit(1);
  }
  
  process.exit(0);
}

// Run migration
migrateVaultItems().catch((error) => {
  console.error("[Migration] Fatal error:", error);
  process.exit(1);
});
