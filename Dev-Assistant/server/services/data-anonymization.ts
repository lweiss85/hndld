interface AnonymizationConfig {
  kAnonymity: number;
  generalizeLocation: boolean;
  generalizeDates: boolean;
  generalizeAmounts: boolean;
  removeIdentifiers: boolean;
}

const DEFAULT_CONFIG: AnonymizationConfig = {
  kAnonymity: 10,
  generalizeLocation: true,
  generalizeDates: true,
  generalizeAmounts: false,
  removeIdentifiers: true,
};

const PII_FIELDS = [
  "email", "phone", "name", "firstName", "lastName",
  "address", "streetAddress", "fullAddress",
  "ssn", "socialSecurity", "taxId",
  "creditCard", "bankAccount",
  "password", "passwordHash",
  "ipAddress", "userAgent",
];

const LOCATION_FIELDS = [
  "city", "state", "region", "county", "neighborhood",
  "suburb", "district", "municipality",
];

const QUASI_IDENTIFIERS = [
  "postalCode", "zipCode", "birthDate", "exactAge",
  "exactIncome", "exactSquareFootage",
];

export function anonymizeRecord<T extends Record<string, unknown>>(
  record: T,
  config: AnonymizationConfig = DEFAULT_CONFIG
): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (config.removeIdentifiers && PII_FIELDS.some(pii =>
      key.toLowerCase().includes(pii.toLowerCase())
    )) {
      continue;
    }

    if (config.generalizeLocation && LOCATION_FIELDS.some(loc =>
      key.toLowerCase() === loc.toLowerCase()
    )) {
      result[key] = generalizeLocationValue(key, value);
      continue;
    }

    if (QUASI_IDENTIFIERS.some(qi => key.toLowerCase().includes(qi.toLowerCase()))) {
      result[key] = generalizeValue(key, value, config);
      continue;
    }

    result[key] = value;
  }

  return result as Partial<T>;
}

function generalizeLocationValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  const lowerKey = key.toLowerCase();

  if (lowerKey === "city" || lowerKey === "neighborhood" || lowerKey === "suburb" || lowerKey === "district" || lowerKey === "municipality") {
    return "[REDACTED]";
  }

  if (lowerKey === "state" || lowerKey === "region") {
    return str.length <= 3 ? str : str.substring(0, 2).toUpperCase();
  }

  if (lowerKey === "county") {
    return "[REDACTED]";
  }

  return "[REDACTED]";
}

function generalizeValue(key: string, value: unknown, config: AnonymizationConfig): unknown {
  if (value === null || value === undefined) return null;

  if (key.toLowerCase().includes("postal") || key.toLowerCase().includes("zip")) {
    return String(value).substring(0, 3) + "XX";
  }

  if (key.toLowerCase().includes("date") && config.generalizeDates) {
    const date = new Date(String(value));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  if (key.toLowerCase().includes("age")) {
    const age = Number(value);
    if (age < 25) return "18-24";
    if (age < 35) return "25-34";
    if (age < 45) return "35-44";
    if (age < 55) return "45-54";
    if (age < 65) return "55-64";
    return "65+";
  }

  if (key.toLowerCase().includes("income")) {
    const income = Number(value);
    if (income < 50000) return "UNDER_50K";
    if (income < 100000) return "50K_100K";
    if (income < 250000) return "100K_250K";
    if (income < 500000) return "250K_500K";
    return "500K_PLUS";
  }

  if (key.toLowerCase().includes("sqft") || key.toLowerCase().includes("squarefootage")) {
    const sqft = Number(value);
    if (sqft < 1000) return "UNDER_1000";
    if (sqft < 1500) return "1000_1500";
    if (sqft < 2000) return "1500_2000";
    if (sqft < 2500) return "2000_2500";
    if (sqft < 3500) return "2500_3500";
    if (sqft < 5000) return "3500_5000";
    return "5000_PLUS";
  }

  return value;
}

export function checkKAnonymity<T extends Record<string, unknown>>(
  records: T[],
  quasiIdentifierKeys: string[],
  k: number = 10
): { passes: boolean; smallestGroup: number; groupCount: number } {
  const groups = new Map<string, number>();

  for (const record of records) {
    const key = quasiIdentifierKeys
      .map(qiKey => String(record[qiKey] || ""))
      .join("|");

    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const groupSizes = Array.from(groups.values());
  const smallestGroup = groupSizes.length > 0 ? Math.min(...groupSizes) : 0;

  return {
    passes: smallestGroup >= k,
    smallestGroup,
    groupCount: groups.size,
  };
}

export function anonymizeDataset<T extends Record<string, unknown>>(
  records: T[],
  config: AnonymizationConfig = DEFAULT_CONFIG
): { data: Partial<T>[]; meetsKAnonymity: boolean; recordCount: number } {
  const anonymized = records.map(r => anonymizeRecord(r, config));

  const kCheck = checkKAnonymity(
    anonymized,
    ["region", "homeType", "sqftRange"],
    config.kAnonymity
  );

  return {
    data: kCheck.passes ? anonymized : [],
    meetsKAnonymity: kCheck.passes,
    recordCount: records.length,
  };
}
