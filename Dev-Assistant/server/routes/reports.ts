import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { spendingItems } from "@shared/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { startOfYear, endOfYear, format } from "date-fns";
import PDFDocument from "pdfkit";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";
import { internalError } from "../lib/errors";

const router = Router();
const householdContext = householdContextMiddleware;

const DEDUCTIBLE_CATEGORIES = [
  "Maintenance",
  "Utilities",
  "Services",
  "Insurance",
  "Home Office",
  "Home Improvement",
];

async function getAnnualReportData(householdId: string, year: number) {
  const startDate = startOfYear(new Date(year, 0, 1));
  const endDate = endOfYear(new Date(year, 0, 1));

  const dateFilter = and(
    eq(spendingItems.householdId, householdId),
    gte(spendingItems.date, startDate),
    lte(spendingItems.date, endDate)
  );

  const [byCategory, byVendor, monthlyTrend] = await Promise.all([
    db.select({
      category: spendingItems.category,
      total: sql<number>`COALESCE(sum(${spendingItems.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(spendingItems)
      .where(dateFilter)
      .groupBy(spendingItems.category)
      .orderBy(desc(sql`sum(${spendingItems.amount})`)),

    db.select({
      vendor: spendingItems.vendor,
      total: sql<number>`COALESCE(sum(${spendingItems.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(spendingItems)
      .where(dateFilter)
      .groupBy(spendingItems.vendor)
      .orderBy(desc(sql`sum(${spendingItems.amount})`)),

    db.select({
      month: sql<string>`to_char(${spendingItems.date}, 'YYYY-MM')`,
      total: sql<number>`COALESCE(sum(${spendingItems.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(spendingItems)
      .where(dateFilter)
      .groupBy(sql`to_char(${spendingItems.date}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${spendingItems.date}, 'YYYY-MM')`),
  ]);

  const totalSpending = byCategory.reduce((sum, cat) => sum + (cat.total || 0), 0);
  const totalTransactions = byCategory.reduce((sum, cat) => sum + (cat.count || 0), 0);

  const potentiallyDeductible = byCategory.filter(
    (c) => c.category && DEDUCTIBLE_CATEGORIES.includes(c.category)
  );
  const deductibleTotal = potentiallyDeductible.reduce((sum, c) => sum + (c.total || 0), 0);

  const vendorsOver600 = byVendor.filter((v) => v.vendor && v.total >= 60000);

  return {
    year,
    summary: {
      totalSpending,
      categoryCount: byCategory.length,
      vendorCount: byVendor.filter((v) => v.vendor).length,
      transactionCount: totalTransactions,
      deductibleTotal,
      vendorsRequiring1099: vendorsOver600.length,
    },
    byCategory,
    byVendor: byVendor.filter((v) => v.vendor),
    vendorsOver600,
    monthlyTrend,
    potentiallyDeductible,
  };
}

router.get(
  "/reports/annual/:year",
  isAuthenticated,
  householdContext,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const year = parseInt(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "Invalid year" });
      }
      const data = await getAnnualReportData(householdId, year);
      res.json(data);
    } catch (error) {
      logger.error("[Reports] Annual report failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(internalError("Failed to generate report"));
    }
  }
);

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

router.get(
  "/reports/annual/:year/pdf",
  isAuthenticated,
  householdContext,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const year = parseInt(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "Invalid year" });
      }

      const data = await getAnnualReportData(householdId, year);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="annual-report-${year}.pdf"`);

      const doc = new PDFDocument({ margin: 50, size: "letter" });
      doc.pipe(res);

      doc.fontSize(22).font("Helvetica-Bold").text(`Annual Financial Report — ${year}`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica").fillColor("#666").text(`Generated ${format(new Date(), "MMMM d, yyyy")}`, { align: "center" });
      doc.moveDown(1.5);

      doc.fillColor("#000").fontSize(14).font("Helvetica-Bold").text("Summary");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Total Spending: ${formatCents(data.summary.totalSpending)}`);
      doc.text(`Transactions: ${data.summary.transactionCount}`);
      doc.text(`Categories: ${data.summary.categoryCount}`);
      doc.text(`Vendors: ${data.summary.vendorCount}`);
      doc.text(`Potentially Deductible: ${formatCents(data.summary.deductibleTotal)}`);
      doc.text(`Vendors Requiring 1099 ($600+): ${data.summary.vendorsRequiring1099}`);
      doc.moveDown(1);

      doc.fontSize(14).font("Helvetica-Bold").text("Spending by Category");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica");
      for (const cat of data.byCategory) {
        const label = cat.category || "Uncategorized";
        const pct = data.summary.totalSpending > 0
          ? ((cat.total / data.summary.totalSpending) * 100).toFixed(1)
          : "0.0";
        doc.text(`${label}: ${formatCents(cat.total)} (${cat.count} items, ${pct}%)`);
      }
      doc.moveDown(1);

      doc.fontSize(14).font("Helvetica-Bold").text("Monthly Trend");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica");
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (let m = 0; m < 12; m++) {
        const key = `${year}-${String(m + 1).padStart(2, "0")}`;
        const entry = data.monthlyTrend.find((t) => t.month === key);
        const amount = entry ? entry.total : 0;
        doc.text(`${months[m]} ${year}: ${formatCents(amount)}`);
      }
      doc.moveDown(1);

      if (data.potentiallyDeductible.length > 0) {
        doc.fontSize(14).font("Helvetica-Bold").text("Potentially Deductible Expenses");
        doc.moveDown(0.3);
        doc.fontSize(9).font("Helvetica");
        for (const item of data.potentiallyDeductible) {
          doc.text(`${item.category}: ${formatCents(item.total)} (${item.count} items)`);
        }
        doc.moveDown(1);
      }

      if (data.vendorsOver600.length > 0) {
        doc.addPage();
        doc.fontSize(14).font("Helvetica-Bold").text("Vendors Over $600 (1099 Reporting)");
        doc.moveDown(0.3);
        doc.fontSize(9).font("Helvetica");
        doc.text("Vendors paid $600 or more may require 1099-MISC or 1099-NEC filing.", { oblique: true });
        doc.moveDown(0.5);
        for (const v of data.vendorsOver600) {
          doc.font("Helvetica-Bold").text(v.vendor || "Unknown");
          doc.font("Helvetica").text(`  Total Paid: ${formatCents(v.total)} (${v.count} transactions)`);
          doc.moveDown(0.3);
        }
        doc.moveDown(1);
      }

      doc.fontSize(14).font("Helvetica-Bold").text("All Vendors");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica");
      for (const v of data.byVendor.slice(0, 50)) {
        doc.text(`${v.vendor || "Unknown"}: ${formatCents(v.total)} (${v.count} items)`);
      }
      if (data.byVendor.length > 50) {
        doc.text(`... and ${data.byVendor.length - 50} more vendors`);
      }

      doc.moveDown(2);
      doc.fontSize(8).fillColor("#999").text(
        "This report is for informational purposes only and does not constitute tax advice. Please consult a qualified tax professional.",
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      logger.error("[Reports] PDF generation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(internalError("Failed to generate PDF report"));
    }
  }
);

router.get(
  "/reports/annual/:year/csv",
  isAuthenticated,
  householdContext,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const year = parseInt(req.params.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "Invalid year" });
      }

      const startDate = startOfYear(new Date(year, 0, 1));
      const endDate = endOfYear(new Date(year, 0, 1));

      const items = await db
        .select()
        .from(spendingItems)
        .where(
          and(
            eq(spendingItems.householdId, householdId),
            gte(spendingItems.date, startDate),
            lte(spendingItems.date, endDate)
          )
        )
        .orderBy(spendingItems.date);

      const csvHeader = "Date,Vendor,Category,Amount,Status,Note,Kind,Payment Method\n";
      const csvRows = items.map((item) => {
        const date = item.date ? format(new Date(item.date), "yyyy-MM-dd") : "";
        const vendor = (item.vendor || "").replace(/"/g, '""');
        const category = (item.category || "").replace(/"/g, '""');
        const amount = (item.amount / 100).toFixed(2);
        const status = item.status || "";
        const note = (item.note || "").replace(/"/g, '""');
        const kind = item.kind || "";
        const payment = item.paymentMethodUsed || "";
        return `${date},"${vendor}","${category}",${amount},${status},"${note}",${kind},${payment}`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="spending-${year}.csv"`);
      res.send(csvHeader + csvRows.join("\n"));
    } catch (error) {
      logger.error("[Reports] CSV export failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(internalError("Failed to generate CSV export"));
    }
  }
);

export function registerReportRoutes(app: Router) {
  app.use(router);
}
