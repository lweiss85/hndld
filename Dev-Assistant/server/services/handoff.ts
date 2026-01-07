import { storage } from "../storage";
import { format } from "date-fns";

export interface HandoffPacketData {
  household: {
    name: string;
    generatedAt: string;
  };
  people: Array<{
    name: string;
    role: string;
    allergies?: string[];
    dietaryRules?: string[];
  }>;
  preferences: Array<{
    category: string;
    key: string;
    value: string;
    isNoGo?: boolean;
  }>;
  importantDates: Array<{
    title: string;
    date: string;
    type?: string;
    notes?: string;
  }>;
  accessItems: Array<{
    title: string;
    category: string;
    notes?: string;
  }>;
  vendors: Array<{
    name: string;
    category: string;
    phone?: string;
    email?: string;
    notes?: string;
  }>;
  locations: Array<{
    name: string;
    address?: string;
    notes?: string;
  }>;
}

export async function generateHandoffPacket(householdId: string): Promise<HandoffPacketData> {
  const [
    household,
    people,
    preferences,
    importantDates,
    accessItems,
    vendors,
    locations,
  ] = await Promise.all([
    storage.getHousehold(householdId),
    storage.getPeople(householdId),
    storage.getPreferences(householdId),
    storage.getImportantDates(householdId),
    storage.getAccessItems(householdId),
    storage.getVendors(householdId),
    storage.getHouseholdLocations(householdId),
  ]);

  if (!household) {
    throw new Error("Household not found");
  }

  return {
    household: {
      name: household.name,
      generatedAt: format(new Date(), "MMMM d, yyyy 'at' h:mm a"),
    },
    people: people.map((p) => ({
      name: p.fullName,
      role: p.role,
      allergies: p.allergies && p.allergies.length > 0 ? p.allergies : undefined,
      dietaryRules: p.dietaryRules && p.dietaryRules.length > 0 ? p.dietaryRules : undefined,
    })),
    preferences: preferences.map((pref) => ({
      category: pref.category,
      key: pref.key,
      value: pref.value,
      isNoGo: pref.isNoGo ?? undefined,
    })),
    importantDates: importantDates.map((d) => ({
      title: d.title,
      date: format(new Date(d.date), "MMMM d, yyyy"),
      type: d.type || undefined,
      notes: d.notes || undefined,
    })),
    accessItems: accessItems.map((a) => ({
      title: a.title,
      category: a.category,
      notes: a.notes || undefined,
    })),
    vendors: vendors.map((v) => ({
      name: v.name,
      category: v.category || "Other",
      phone: v.phone || undefined,
      email: v.email || undefined,
      notes: v.notes || undefined,
    })),
    locations: locations.map((l) => ({
      name: l.name,
      address: l.address || undefined,
      notes: l.notes || undefined,
    })),
  };
}

export function generateHandoffHTML(data: HandoffPacketData): string {
  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
        line-height: 1.6; 
        color: #1a1a1a;
        padding: 40px;
        max-width: 800px;
        margin: 0 auto;
      }
      .header { 
        text-align: center; 
        margin-bottom: 40px; 
        padding-bottom: 20px;
        border-bottom: 2px solid #d4a574;
      }
      .header h1 { 
        font-size: 28px; 
        font-weight: 600;
        color: #2c1810;
        margin-bottom: 8px;
      }
      .header .subtitle { 
        color: #666; 
        font-size: 14px;
      }
      .section { 
        margin-bottom: 32px; 
        page-break-inside: avoid;
      }
      .section h2 { 
        font-size: 18px; 
        font-weight: 600;
        color: #8b6914;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e5e5e5;
      }
      .item { 
        padding: 12px 0; 
        border-bottom: 1px solid #f0f0f0;
      }
      .item:last-child { border-bottom: none; }
      .item-title { 
        font-weight: 600; 
        color: #2c1810;
      }
      .item-subtitle { 
        font-size: 13px; 
        color: #666;
        margin-top: 2px;
      }
      .item-details { 
        font-size: 14px; 
        color: #444;
        margin-top: 4px;
      }
      .badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 500;
        padding: 2px 8px;
        background: #f5f0e6;
        color: #8b6914;
        border-radius: 4px;
        margin-left: 8px;
      }
      .badge.no-go {
        background: #fef2f2;
        color: #dc2626;
      }
      .footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #e5e5e5;
        text-align: center;
        font-size: 12px;
        color: #888;
      }
      @media print {
        body { padding: 20px; }
        .section { page-break-inside: avoid; }
      }
    </style>
  `;

  const header = `
    <div class="header">
      <h1>${escapeHtml(data.household.name)}</h1>
      <p class="subtitle">Handoff Packet</p>
      <p class="subtitle">Generated: ${data.household.generatedAt}</p>
    </div>
  `;

  const peopleSection = data.people.length > 0 ? `
    <div class="section">
      <h2>Household Members</h2>
      ${data.people.map(p => `
        <div class="item">
          <div class="item-title">${escapeHtml(p.name)}<span class="badge">${escapeHtml(p.role)}</span></div>
          ${p.allergies ? `<div class="item-details"><strong>Allergies:</strong> ${p.allergies.map(escapeHtml).join(', ')}</div>` : ''}
          ${p.dietaryRules ? `<div class="item-details"><strong>Dietary:</strong> ${p.dietaryRules.map(escapeHtml).join(', ')}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const preferencesSection = data.preferences.length > 0 ? `
    <div class="section">
      <h2>Preferences</h2>
      ${data.preferences.map(p => `
        <div class="item">
          <div class="item-title">${escapeHtml(p.key)}<span class="badge">${escapeHtml(p.category)}</span>${p.isNoGo ? '<span class="badge no-go">No-Go</span>' : ''}</div>
          <div class="item-details">${escapeHtml(p.value)}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const datesSection = data.importantDates.length > 0 ? `
    <div class="section">
      <h2>Important Dates</h2>
      ${data.importantDates.map(d => `
        <div class="item">
          <div class="item-title">${escapeHtml(d.title)}${d.type ? `<span class="badge">${escapeHtml(d.type)}</span>` : ''}</div>
          <div class="item-subtitle">${d.date}</div>
          ${d.notes ? `<div class="item-details">${escapeHtml(d.notes)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const accessSection = data.accessItems.length > 0 ? `
    <div class="section">
      <h2>Access Information</h2>
      ${data.accessItems.map(a => `
        <div class="item">
          <div class="item-title">${escapeHtml(a.title)}<span class="badge">${escapeHtml(a.category)}</span></div>
          ${a.notes ? `<div class="item-details">${escapeHtml(a.notes)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const vendorsSection = data.vendors.length > 0 ? `
    <div class="section">
      <h2>Vendors & Service Providers</h2>
      ${data.vendors.map(v => `
        <div class="item">
          <div class="item-title">${escapeHtml(v.name)}<span class="badge">${escapeHtml(v.category)}</span></div>
          ${v.phone || v.email ? `<div class="item-subtitle">${[v.phone, v.email].filter(Boolean).join(' | ')}</div>` : ''}
          ${v.notes ? `<div class="item-details">${escapeHtml(v.notes)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const locationsSection = data.locations.length > 0 ? `
    <div class="section">
      <h2>Locations</h2>
      ${data.locations.map(l => `
        <div class="item">
          <div class="item-title">${escapeHtml(l.name)}</div>
          ${l.address ? `<div class="item-subtitle">${escapeHtml(l.address)}</div>` : ''}
          ${l.notes ? `<div class="item-details">${escapeHtml(l.notes)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const footer = `
    <div class="footer">
      <p>This handoff packet was generated by hndld</p>
      <p>Confidential household information - handle with care</p>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(data.household.name)} - Handoff Packet</title>
      ${styles}
    </head>
    <body>
      ${header}
      ${peopleSection}
      ${preferencesSection}
      ${datesSection}
      ${accessSection}
      ${vendorsSection}
      ${locationsSection}
      ${footer}
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
