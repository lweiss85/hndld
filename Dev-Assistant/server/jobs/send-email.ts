import type PgBoss from "pg-boss";
import logger from "../lib/logger";

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export async function handleSendEmailJob(job: PgBoss.Job<EmailJobData>): Promise<void> {
  const { to, subject, body, html } = job.data;
  logger.info("[SendEmail Job] Sending", { jobId: job.id, to, subject });

  try {
    const nodemailer = await import("nodemailer");

    if (!process.env.SMTP_HOST) {
      logger.info("[SendEmail Job] SMTP not configured, logging email", { to, subject });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || "noreply@houseops.app",
      to,
      subject,
      text: body,
      html: html || body,
    });

    logger.info("[SendEmail Job] Sent successfully", { jobId: job.id, to });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("[SendEmail Job] Failed", { jobId: job.id, to, error: message });
    throw error;
  }
}
