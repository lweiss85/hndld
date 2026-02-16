import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_KEY = "test-vault-encryption-key-32chars!";

describe("Vault Encryption Service", () => {
  let encryptVaultValue: typeof import("../../server/services/vault-encryption").encryptVaultValue;
  let decryptVaultValue: typeof import("../../server/services/vault-encryption").decryptVaultValue;
  let isEncrypted: typeof import("../../server/services/vault-encryption").isEncrypted;
  let migrateToEncrypted: typeof import("../../server/services/vault-encryption").migrateToEncrypted;

  beforeEach(async () => {
    vi.stubEnv("VAULT_ENCRYPTION_KEY", MOCK_KEY);
    vi.resetModules();
    const mod = await import("../../server/services/vault-encryption");
    encryptVaultValue = mod.encryptVaultValue;
    decryptVaultValue = mod.decryptVaultValue;
    isEncrypted = mod.isEncrypted;
    migrateToEncrypted = mod.migrateToEncrypted;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("encryptVaultValue", () => {
    it("encrypts plaintext and returns salt:iv:authTag:ciphertext format", () => {
      const plaintext = "my-secret-wifi-password";
      const encrypted = encryptVaultValue(plaintext);

      expect(encrypted).not.toBe(plaintext);
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(4);

      expect(parts[0]).toHaveLength(64);
      expect(parts[1]).toHaveLength(32);
      expect(parts[2]).toHaveLength(32);
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it("produces different ciphertexts for the same input (random salt/iv)", () => {
      const plaintext = "same-value";
      const a = encryptVaultValue(plaintext);
      const b = encryptVaultValue(plaintext);
      expect(a).not.toBe(b);
    });

    it("handles empty string", () => {
      const encrypted = encryptVaultValue("");
      const decrypted = decryptVaultValue(encrypted);
      expect(decrypted).toBe("");
    });

    it("handles unicode content", () => {
      const plaintext = "パスワード 🔐 contraseña";
      const encrypted = encryptVaultValue(plaintext);
      const decrypted = decryptVaultValue(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("handles very long values", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encryptVaultValue(plaintext);
      const decrypted = decryptVaultValue(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("decryptVaultValue", () => {
    it("decrypts an encrypted value back to original", () => {
      const plaintext = "alarm-code-1234";
      const encrypted = encryptVaultValue(plaintext);
      const decrypted = decryptVaultValue(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("returns original value if not in encrypted format", () => {
      const plaintext = "not-encrypted";
      const result = decryptVaultValue(plaintext);
      expect(result).toBe(plaintext);
    });

    it("returns original value if format has wrong number of parts", () => {
      const badFormat = "only:two:parts";
      const result = decryptVaultValue(badFormat);
      expect(result).toBe(badFormat);
    });

    it("returns encrypted value on decryption failure (tampered data)", () => {
      const plaintext = "secret-data";
      const encrypted = encryptVaultValue(plaintext);
      const parts = encrypted.split(":");
      parts[3] = "ff" + parts[3].slice(2);
      const tampered = parts.join(":");

      const result = decryptVaultValue(tampered);
      expect(result).toBe(tampered);
    });
  });

  describe("isEncrypted", () => {
    it("returns true for properly encrypted values", () => {
      const encrypted = encryptVaultValue("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(isEncrypted("plain-text")).toBe(false);
    });

    it("returns false for values with wrong part count", () => {
      expect(isEncrypted("a:b:c")).toBe(false);
      expect(isEncrypted("a:b:c:d:e")).toBe(false);
    });

    it("returns false for values with wrong hex lengths", () => {
      expect(isEncrypted("short:hex:vals:data")).toBe(false);
    });
  });

  describe("migrateToEncrypted", () => {
    it("encrypts unencrypted values", () => {
      const plain = "unencrypted-password";
      const migrated = migrateToEncrypted(plain);
      expect(migrated).not.toBe(plain);
      expect(isEncrypted(migrated)).toBe(true);
    });

    it("leaves already encrypted values unchanged", () => {
      const encrypted = encryptVaultValue("already-encrypted");
      const migrated = migrateToEncrypted(encrypted);
      expect(migrated).toBe(encrypted);
    });
  });

  describe("when VAULT_ENCRYPTION_KEY is not set", () => {
    it("returns plaintext without encryption", async () => {
      const origKey = process.env.VAULT_ENCRYPTION_KEY;
      delete process.env.VAULT_ENCRYPTION_KEY;
      vi.resetModules();
      const mod = await import("../../server/services/vault-encryption");

      const plaintext = "no-key-available";
      const result = mod.encryptVaultValue(plaintext);
      expect(result).toBe(plaintext);

      process.env.VAULT_ENCRYPTION_KEY = origKey;
    });

    it("returns value as-is for decryption", async () => {
      const origKey = process.env.VAULT_ENCRYPTION_KEY;
      delete process.env.VAULT_ENCRYPTION_KEY;
      vi.resetModules();
      const mod = await import("../../server/services/vault-encryption");

      const value = "some-value";
      const result = mod.decryptVaultValue(value);
      expect(result).toBe(value);

      process.env.VAULT_ENCRYPTION_KEY = origKey;
    });
  });
});
