import archiver from "archiver";
import { createWriteStream, createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "../db";
import logger from "../lib/logger";
import { 
  households, userProfiles, tasks, taskChecklistItems, approvals, updates, requests,
  comments, reactions, vendors, spendingItems, calendarEvents, householdSettings,
  householdLocations, people, preferences, importantDates, accessItems,
  notifications, notificationSettings
} from "@shared/schema";
import { format, subDays } from "date-fns";

const BACKUPS_DIR = "./backups";
const UPLOADS_DIR = "./uploads";
const MAX_DAILY_BACKUPS = 14;

function ensureBackupsDir(): void {
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export interface BackupMetadata {
  createdAt: string;
  version: string;
  tables: string[];
  householdCount: number;
}

export async function exportAllData(): Promise<Record<string, any[]>> {
  const [
    householdsData,
    userProfilesData,
    tasksData,
    taskChecklistItemsData,
    approvalsData,
    updatesData,
    requestsData,
    commentsData,
    reactionsData,
    vendorsData,
    spendingItemsData,
    calendarEventsData,
    householdSettingsData,
    householdLocationsData,
    peopleData,
    preferencesData,
    importantDatesData,
    accessItemsData,
    notificationsData,
    notificationSettingsData,
  ] = await Promise.all([
    db.select().from(households),
    db.select().from(userProfiles),
    db.select().from(tasks),
    db.select().from(taskChecklistItems),
    db.select().from(approvals),
    db.select().from(updates),
    db.select().from(requests),
    db.select().from(comments),
    db.select().from(reactions),
    db.select().from(vendors),
    db.select().from(spendingItems),
    db.select().from(calendarEvents),
    db.select().from(householdSettings),
    db.select().from(householdLocations),
    db.select().from(people),
    db.select().from(preferences),
    db.select().from(importantDates),
    db.select().from(accessItems),
    db.select().from(notifications),
    db.select().from(notificationSettings),
  ]);

  return {
    households: householdsData,
    userProfiles: userProfilesData,
    tasks: tasksData,
    taskChecklistItems: taskChecklistItemsData,
    approvals: approvalsData,
    updates: updatesData,
    requests: requestsData,
    comments: commentsData,
    reactions: reactionsData,
    vendors: vendorsData,
    spendingItems: spendingItemsData,
    calendarEvents: calendarEventsData,
    householdSettings: householdSettingsData,
    householdLocations: householdLocationsData,
    people: peopleData,
    preferences: preferencesData,
    importantDates: importantDatesData,
    accessItems: accessItemsData,
    notifications: notificationsData,
    notificationSettings: notificationSettingsData,
  };
}

export async function createBackupZip(isScheduled: boolean = false): Promise<string> {
  ensureBackupsDir();
  ensureUploadsDir();

  const timestamp = format(new Date(), "yyyy-MM-dd_HH-mm-ss");
  const prefix = isScheduled ? "scheduled" : "manual";
  const zipFilename = `backup_${prefix}_${timestamp}.zip`;
  const zipPath = join(BACKUPS_DIR, zipFilename);

  const allData = await exportAllData();

  const metadata: BackupMetadata = {
    createdAt: new Date().toISOString(),
    version: "1.0.0",
    tables: Object.keys(allData),
    householdCount: allData.households.length,
  };

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      logger.info("[Backup] Created backup", { zipFilename, bytes: archive.pointer() });
      resolve(zipPath);
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

    for (const [tableName, data] of Object.entries(allData)) {
      archive.append(JSON.stringify(data, null, 2), { name: `data/${tableName}.json` });
    }

    if (existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, "uploads");
    }

    archive.finalize();
  });
}

export function listBackups(): Array<{ filename: string; path: string; size: number; createdAt: Date; type: string }> {
  ensureBackupsDir();

  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((filename) => {
      const filepath = join(BACKUPS_DIR, filename);
      const stats = statSync(filepath);
      const type = filename.includes("scheduled") ? "scheduled" : "manual";
      return {
        filename,
        path: filepath,
        size: stats.size,
        createdAt: stats.mtime,
        type,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return files;
}

export function deleteBackup(filename: string): boolean {
  if (filename.includes("..") || filename.includes("/")) {
    return false;
  }
  const validBackups = listBackups();
  const foundBackup = validBackups.find((b) => b.filename === filename);
  if (!foundBackup) {
    return false;
  }
  const filepath = join(BACKUPS_DIR, filename);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
    return true;
  }
  return false;
}

export function cleanupOldBackups(): number {
  const backups = listBackups();
  const scheduledBackups = backups.filter((b) => b.type === "scheduled");
  const settings = getBackupSettings();
  const retentionDays = settings.retentionDays || 14;
  
  let deletedCount = 0;
  const cutoffDate = subDays(new Date(), retentionDays);
  
  for (const backup of scheduledBackups) {
    if (backup.createdAt < cutoffDate) {
      if (deleteBackup(backup.filename)) {
        deletedCount++;
        logger.info("[Backup] Cleaned up old backup", { filename: backup.filename });
      }
    }
  }
  
  return deletedCount;
}

export function getBackupPath(filename: string): string | null {
  const validBackups = listBackups();
  const foundBackup = validBackups.find((b) => b.filename === filename);
  if (!foundBackup) {
    return null;
  }
  const filepath = join(BACKUPS_DIR, filename);
  if (existsSync(filepath) && !filename.includes("..") && !filename.includes("/")) {
    return filepath;
  }
  return null;
}

export interface BackupSettings {
  scheduledBackupsEnabled: boolean;
  backupTimeHour: number;
  backupTimeMinute: number;
  retentionDays: number;
}

const BACKUP_SETTINGS_FILE = join(BACKUPS_DIR, "settings.json");

export function getBackupSettings(): BackupSettings {
  ensureBackupsDir();
  
  const defaults: BackupSettings = {
    scheduledBackupsEnabled: true,
    backupTimeHour: 2,
    backupTimeMinute: 0,
    retentionDays: 14,
  };

  if (existsSync(BACKUP_SETTINGS_FILE)) {
    try {
      const data = readFileSync(BACKUP_SETTINGS_FILE, "utf-8");
      return { ...defaults, ...JSON.parse(data) };
    } catch {
      return defaults;
    }
  }

  return defaults;
}

export function saveBackupSettings(settings: Partial<BackupSettings>): BackupSettings {
  ensureBackupsDir();
  
  const current = getBackupSettings();
  const updated = { ...current, ...settings };
  
  writeFileSync(BACKUP_SETTINGS_FILE, JSON.stringify(updated, null, 2));
  
  return updated;
}
