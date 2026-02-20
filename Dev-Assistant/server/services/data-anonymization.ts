import crypto from "crypto";

const DEFAULT_K_ANONYMITY = 10;
const DEFAULT_L_DIVERSITY = 3;
const EPSILON = 1.0;

const PII_PATTERNS = [
  { name: "email", patterns: [/email/i] },
  { name: "phone", patterns: [/phone/i, /mobile/i, /tel/i] },
  { name: "name", patterns: [/^name$/i, /first_?name/i, /last_?name/i] },
  { name: "address", patterns: [/^address$/i, /street/i] },
  { name: "ssn", patterns: [/ssn/i, /social_?security/i] },
  { name: "financial", patterns: [/credit_?card/i, /bank_?account/i] },
  { name: "auth", patterns: [/password/i, /secret/i, /token/i, /api_?key/i] },
  { name: "ip", patterns: [/ip_?address/i] },
];

export function isPiiField(fieldName: string): boolean {
  return PII_PATTERNS.some((p) =>
    p.patterns.some((rx) => rx.test(fieldName))
  );
}

const QUASI_IDENTIFIERS = [
  {
    name: "postalCode",
    patterns: [/postal/i, /zip/i],
    generalizer: (v: unknown) => (v ? String(v).substring(0, 3) + "**" : null),
  },
  {
    name: "age",
    patterns: [/^age$/i],
    generalizer: (v: unknown) => {
      const n = Number(v);
      if (n < 25) return "18-24";
      if (n < 35) return "25-34";
      if (n < 45) return "35-44";
      if (n < 55) return "45-54";
      if (n < 65) return "55-64";
      return "65+";
    },
  },
  {
    name: "income",
    patterns: [/income/i],
    generalizer: (v: unknown) => {
      const n = Number(v);
      if (n < 50000) return "UNDER_50K";
      if (n < 100000) return "50K_100K";
      if (n < 250000) return "100K_250K";
      return "250K_PLUS";
    },
  },
  {
    name: "squareFootage",
    patterns: [/sq_?ft/i, /square_?foot/i],
    generalizer: (v: unknown) => {
      const n = Number(v);
      if (n < 1500) return "UNDER_1500";
      if (n < 2500) return "1500_2500";
      if (n < 3500) return "2500_3500";
      return "3500_PLUS";
    },
  },
  {
    name: "date",
    patterns: [/date/i, /_at$/i],
    generalizer: (v: unknown) => {
      const d = new Date(v as string | number);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },
  },
];

export function removePii<T extends Record<string, unknown>>(record: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (!isPiiField(key)) {
      result[key] = record[key];
    }
  }
  return result as Partial<T>;
}

export function generalizeQuasiIdentifiers<T extends Record<string, unknown>>(
  record: T,
  fieldsToGeneralize?: string[]
): { record: Record<string, unknown>; generalizedFields: string[] } {
  const out: Record<string, unknown> = { ...record };
  const generalizedFields: string[] = [];

  for (const key of Object.keys(out)) {
    if (fieldsToGeneralize && !fieldsToGeneralize.includes(key)) continue;
    for (const qi of QUASI_IDENTIFIERS) {
      if (qi.patterns.some((rx) => rx.test(key))) {
        out[key] = qi.generalizer(out[key]);
        generalizedFields.push(key);
        break;
      }
    }
  }

  return { record: out, generalizedFields };
}

export function checkKAnonymity<T extends Record<string, unknown>>(
  records: T[],
  quasiIdentifierKeys: string[],
  k: number = DEFAULT_K_ANONYMITY
): {
  passes: boolean;
  smallestGroupSize: number;
  totalGroups: number;
  groupsUnderK: number;
  violatingGroups: { key: string; size: number }[];
} {
  const groups = new Map<string, number>();

  for (const rec of records) {
    const groupKey = quasiIdentifierKeys
      .map((qk) => String(rec[qk] ?? ""))
      .join("|");
    groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
  }

  let smallestGroupSize = Infinity;
  const violatingGroups: { key: string; size: number }[] = [];

  groups.forEach((size, key) => {
    if (size < smallestGroupSize) smallestGroupSize = size;
    if (size < k) violatingGroups.push({ key, size });
  });

  if (groups.size === 0) smallestGroupSize = 0;

  return {
    passes: violatingGroups.length === 0 && groups.size > 0,
    smallestGroupSize,
    totalGroups: groups.size,
    groupsUnderK: violatingGroups.length,
    violatingGroups,
  };
}

export function checkLDiversity<T extends Record<string, unknown>>(
  records: T[],
  quasiIdKeys: string[],
  sensitiveKey: string,
  l: number = DEFAULT_L_DIVERSITY
): { passes: boolean; minDiversity: number } {
  const groups = new Map<string, Set<unknown>>();

  for (const rec of records) {
    const groupKey = quasiIdKeys
      .map((qk) => String(rec[qk] ?? ""))
      .join("|");
    if (!groups.has(groupKey)) groups.set(groupKey, new Set());
    groups.get(groupKey)!.add(rec[sensitiveKey]);
  }

  let minDiversity = Infinity;
  groups.forEach((vals) => {
    if (vals.size < minDiversity) minDiversity = vals.size;
  });

  if (groups.size === 0) minDiversity = 0;

  return {
    passes: minDiversity >= l && groups.size > 0,
    minDiversity,
  };
}

export function addLaplacianNoise(
  value: number,
  sensitivity: number,
  epsilon: number = EPSILON
): number {
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + noise;
}

export function anonymizeDataset<T extends Record<string, unknown>>(
  records: T[],
  quasiIdKeys: string[],
  config?: {
    kAnonymity?: number;
    suppressSmallGroups?: boolean;
    generalizeQuasiIdentifiers?: boolean;
  }
): {
  data: Partial<T>[];
  metadata: {
    originalCount: number;
    anonymizedCount: number;
    suppressedCount: number;
    kAnonymityAchieved: boolean;
    generalizedFields: string[];
  };
} {
  const k = config?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const shouldSuppress = config?.suppressSmallGroups ?? true;
  const shouldGeneralize = config?.generalizeQuasiIdentifiers ?? true;

  let cleaned = records.map((r) => removePii(r) as Record<string, unknown>);

  let allGeneralizedFields: string[] = [];
  if (shouldGeneralize) {
    const generalized = cleaned.map((r) =>
      generalizeQuasiIdentifiers(r as Record<string, unknown>, quasiIdKeys)
    );
    cleaned = generalized.map((g) => g.record);
    const fieldSet = new Set<string>();
    for (const g of generalized) {
      for (const f of g.generalizedFields) fieldSet.add(f);
    }
    allGeneralizedFields = Array.from(fieldSet);
  }

  let suppressedCount = 0;
  let finalData = cleaned;

  if (shouldSuppress) {
    const groups = new Map<string, number>();
    for (const rec of cleaned) {
      const groupKey = quasiIdKeys
        .map((qk) => String(rec[qk] ?? ""))
        .join("|");
      groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
    }

    finalData = cleaned.filter((rec) => {
      const groupKey = quasiIdKeys
        .map((qk) => String(rec[qk] ?? ""))
        .join("|");
      const size = groups.get(groupKey) || 0;
      if (size < k) {
        suppressedCount++;
        return false;
      }
      return true;
    });
  }

  const kCheck = checkKAnonymity(
    finalData as (T & Record<string, unknown>)[],
    quasiIdKeys,
    k
  );

  return {
    data: finalData as Partial<T>[],
    metadata: {
      originalCount: records.length,
      anonymizedCount: finalData.length,
      suppressedCount,
      kAnonymityAchieved: kCheck.passes,
      generalizedFields: allGeneralizedFields,
    },
  };
}

export function pseudonymize(value: string, salt?: string): string {
  const input = salt ? `${salt}:${value}` : value;
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
}

export function generateAnonymousId(originalId: string, entityType: string): string {
  return `anon_${entityType}_${pseudonymize(originalId)}`;
}
