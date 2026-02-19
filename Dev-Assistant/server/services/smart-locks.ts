import logger from "../lib/logger";

export interface LockCommand {
  lockId: string;
  externalId: string;
  accessToken: string;
}

export interface LockCodeCommand {
  lockId: string;
  externalId: string;
  accessToken: string;
  code: string;
  name: string;
  startsAt?: Date;
  expiresAt?: Date;
}

export interface LockActivity {
  action: string;
  method: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface LockProvider {
  name: string;
  lock(cmd: LockCommand): Promise<boolean>;
  unlock(cmd: LockCommand): Promise<boolean>;
  createCode(cmd: LockCodeCommand): Promise<string | null>;
  deleteCode(lockExternalId: string, codeExternalId: string, accessToken: string): Promise<boolean>;
  getActivity(lockExternalId: string, accessToken: string, limit?: number): Promise<LockActivity[]>;
  getStatus(lockExternalId: string, accessToken: string): Promise<{ locked: boolean; battery?: number }>;
}

class AugustProvider implements LockProvider {
  name = "AUGUST";

  async lock(cmd: LockCommand): Promise<boolean> {
    logger.info("[SmartLock] August lock command", { lockId: cmd.lockId, externalId: cmd.externalId });
    return true;
  }

  async unlock(cmd: LockCommand): Promise<boolean> {
    logger.info("[SmartLock] August unlock command", { lockId: cmd.lockId, externalId: cmd.externalId });
    return true;
  }

  async createCode(cmd: LockCodeCommand): Promise<string | null> {
    logger.info("[SmartLock] August create code", { lockId: cmd.lockId, name: cmd.name });
    return `aug_code_${Date.now()}`;
  }

  async deleteCode(lockExternalId: string, codeExternalId: string): Promise<boolean> {
    logger.info("[SmartLock] August delete code", { lockExternalId, codeExternalId });
    return true;
  }

  async getActivity(lockExternalId: string, _accessToken: string, limit = 20): Promise<LockActivity[]> {
    logger.info("[SmartLock] August get activity", { lockExternalId, limit });
    return [];
  }

  async getStatus(lockExternalId: string): Promise<{ locked: boolean; battery?: number }> {
    logger.info("[SmartLock] August get status", { lockExternalId });
    return { locked: true, battery: 85 };
  }
}

class GenericProvider implements LockProvider {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  async lock(cmd: LockCommand): Promise<boolean> {
    logger.info(`[SmartLock] ${this.name} lock (manual tracking)`, { lockId: cmd.lockId });
    return true;
  }

  async unlock(cmd: LockCommand): Promise<boolean> {
    logger.info(`[SmartLock] ${this.name} unlock (manual tracking)`, { lockId: cmd.lockId });
    return true;
  }

  async createCode(): Promise<string | null> {
    return null;
  }

  async deleteCode(): Promise<boolean> {
    return true;
  }

  async getActivity(): Promise<LockActivity[]> {
    return [];
  }

  async getStatus(): Promise<{ locked: boolean; battery?: number }> {
    return { locked: true };
  }
}

const providers: Record<string, LockProvider> = {
  AUGUST: new AugustProvider(),
  SCHLAGE: new GenericProvider("SCHLAGE"),
  YALE: new GenericProvider("YALE"),
  LEVEL: new GenericProvider("LEVEL"),
  OTHER: new GenericProvider("OTHER"),
};

export function getProvider(providerName: string): LockProvider {
  return providers[providerName] || providers.OTHER;
}
