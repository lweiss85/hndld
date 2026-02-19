import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  Loader2,
  FileDown,
  Database,
  Trash2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

type SetupStep = "idle" | "scanning" | "verifying" | "complete";

interface TwoFactorStatus {
  enabled: boolean;
}

interface SetupResponse {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

interface ExportPreview {
  preview: Record<string, number>;
  note: string;
}

interface DeletionStatus {
  pending: boolean;
  scheduledDeletionAt?: string;
  requestedAt?: string;
  canCancel?: boolean;
}

export default function SecuritySettingsPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<SetupStep>("idle");
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [codesDownloaded, setCodesDownloaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const { data: status, isLoading } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/v1/2fa/status"],
  });

  const { data: exportPreview } = useQuery<ExportPreview>({
    queryKey: ["/api/v1/user/export/preview"],
  });

  const { data: deletionStatus } = useQuery<DeletionStatus>({
    queryKey: ["/api/v1/user/delete/status"],
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ confirmText, reason }: { confirmText: string; reason: string }) => {
      const res = await fetch("/api/v1/user/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to request deletion");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/delete/status"] });
      setShowDeleteSection(false);
      setConfirmText("");
      setDeleteReason("");
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/user/delete/cancel", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/delete/status"] });
    },
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/2fa/setup", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Setup failed");
      }
      return res.json() as Promise<SetupResponse>;
    },
    onSuccess: (data) => {
      setSetupData(data);
      setStep("scanning");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/v1/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep("complete");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/2fa/status"] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/v1/2fa/disable", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disable");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowDisable(false);
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/2fa/status"] });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const downloadBackupCodes = () => {
    if (!setupData) return;
    const content = [
      "hndld - Two-Factor Authentication Backup Codes",
      "================================================",
      "",
      "Keep these codes in a safe place. Each code can only be used once.",
      "",
      ...setupData.backupCodes.map((code, i) => `${i + 1}. ${code}`),
      "",
      `Generated: ${new Date().toLocaleDateString()}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hndld-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setCodesDownloaded(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 space-y-4 pb-24">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-48 bg-muted animate-pulse rounded-2xl mt-6" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate("/house")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1D2A44] to-[#2a3f6b] flex items-center justify-center">
            <Shield className="h-5 w-5 text-[#C9A96E]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Security</h1>
            <p className="text-xs text-muted-foreground">Account security & privacy</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Two-Factor Authentication</h2>
                <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={status?.enabled
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0"
                : "bg-muted text-muted-foreground border-0"
              }
            >
              {status?.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          <p className="text-sm text-foreground/70 mb-4">
            {status?.enabled
              ? "Your account is protected with two-factor authentication. You'll need your authenticator app or a backup code to sign in."
              : "Protect your account by requiring a verification code from your authenticator app when signing in."}
          </p>

          {!status?.enabled && step === "idle" && (
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              className="w-full bg-[#1D2A44] hover:bg-[#2a3f6b] text-white"
            >
              {setupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Enable Two-Factor Authentication
            </Button>
          )}

          {setupMutation.isError && (
            <p className="text-sm text-red-500 mt-2">{setupMutation.error.message}</p>
          )}

          {status?.enabled && !showDisable && (
            <Button
              variant="outline"
              onClick={() => setShowDisable(true)}
              className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Disable Two-Factor Authentication
            </Button>
          )}

          {showDisable && (
            <div className="space-y-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Enter your current authenticator code to disable 2FA:
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-red-200 dark:border-red-800 bg-background focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {disableMutation.isError && (
                <p className="text-sm text-red-500">{disableMutation.error.message}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => { setShowDisable(false); setDisableCode(""); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => disableMutation.mutate(disableCode)}
                  disabled={disableCode.length < 6 || disableMutation.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {disableMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : "Disable"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {step === "scanning" && setupData && (
          <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-5">
            <div className="text-center">
              <h3 className="font-semibold mb-1">Scan QR Code</h3>
              <p className="text-sm text-muted-foreground">
                Open your authenticator app and scan this QR code
              </p>
            </div>

            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Or enter this code manually:</p>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted">
                <KeyRound className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <code className="flex-1 text-sm font-mono break-all">
                  {showSecret ? setupData.secret : "••••••••••••••••"}
                </code>
                <button onClick={() => setShowSecret(!showSecret)} className="p-1 hover:bg-background rounded">
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(setupData.secret, "secret")}
                  className="p-1 hover:bg-background rounded"
                >
                  {copiedCode === "secret" ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Enter the 6-digit code from your app:</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]"
                autoFocus
              />
              {verifyMutation.isError && (
                <p className="text-sm text-red-500">{verifyMutation.error.message}</p>
              )}
              <Button
                onClick={() => verifyMutation.mutate(verifyCode)}
                disabled={verifyCode.length < 6 || verifyMutation.isPending}
                className="w-full bg-[#1D2A44] hover:bg-[#2a3f6b] text-white"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Verify & Enable
              </Button>
            </div>
          </div>
        )}

        {(step === "scanning" || step === "complete") && setupData && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">Backup Codes</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Save these codes somewhere safe. Each code can only be used once to sign in if you lose access to your authenticator app.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {setupData.backupCodes.map((code, i) => (
                <button
                  key={i}
                  onClick={() => copyToClipboard(code, `code-${i}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-amber-200 dark:border-amber-800 font-mono text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <span>{code}</span>
                  {copiedCode === `code-${i}` ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(setupData.backupCodes.join("\n"), "all-codes")}
                className="flex-1 border-amber-200 dark:border-amber-800"
              >
                {copiedCode === "all-codes" ? (
                  <Check className="h-4 w-4 mr-2 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Copy All
              </Button>
              <Button
                variant="outline"
                onClick={downloadBackupCodes}
                className="flex-1 border-amber-200 dark:border-amber-800"
              >
                {codesDownloaded ? (
                  <Check className="h-4 w-4 mr-2 text-emerald-500" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download
              </Button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
              <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">2FA Enabled</h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Your account is now protected with two-factor authentication.
            </p>
            <Button
              variant="ghost"
              onClick={() => { setStep("idle"); setSetupData(null); setVerifyCode(""); }}
              className="mt-2"
            >
              Done
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <Database className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Export My Data</h2>
              <p className="text-xs text-muted-foreground">Download a copy of all your data</p>
            </div>
          </div>

          <p className="text-sm text-foreground/70">
            Under data protection regulations, you have the right to request a copy of your personal data.
            Your export will include your profile, tasks, approvals, spending, calendar events, messages,
            preferences, and more. File contents are not included — only metadata.
          </p>

          {exportPreview && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(exportPreview.preview).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={async () => {
              setExporting(true);
              try {
                const res = await fetch("/api/v1/user/export", { credentials: "include" });
                if (!res.ok) throw new Error("Export failed");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `hndld-export-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch {
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            variant="outline"
            className="w-full"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            {exporting ? "Preparing Export..." : "Download My Data"}
          </Button>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Supported authenticator apps</h3>
          <ul className="space-y-2 text-sm text-foreground/70">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A96E]" />
              Google Authenticator
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A96E]" />
              Authy
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A96E]" />
              1Password
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C9A96E]" />
              Microsoft Authenticator
            </li>
          </ul>
        </div>

        {deletionStatus?.pending ? (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-amber-800 dark:text-amber-200">Deletion Scheduled</h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Your account is scheduled for permanent deletion on{" "}
                  <span className="font-medium">
                    {new Date(deletionStatus.scheduledDeletionAt!).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </span>.
                  You can cancel this request any time before then.
                </p>
              </div>
            </div>
            <Button
              onClick={() => cancelDeletionMutation.mutate()}
              disabled={cancelDeletionMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {cancelDeletionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Cancel Deletion Request
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-card p-5 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <Trash2 className="h-5 w-5 text-red-500" />
              <div>
                <h2 className="font-semibold text-red-700 dark:text-red-400">Delete Account</h2>
                <p className="text-xs text-muted-foreground">Permanently remove your account and data</p>
              </div>
            </div>

            {!showDeleteSection ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground/70">
                  Deleting your account will permanently remove all your data after a 7-day grace period.
                  During this time, you can cancel the request and keep your account.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteSection(true)}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Request Account Deletion
                </Button>
              </div>
            ) : (
              <div className="space-y-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    This will schedule your account for permanent deletion in 7 days.
                    All your tasks, messages, files, and personal data will be removed.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-red-700 dark:text-red-300">
                    Why are you leaving? (optional)
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Help us improve..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-red-200 dark:border-red-800 bg-background focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-red-700 dark:text-red-300">
                    Type <span className="font-mono bg-red-100 dark:bg-red-900 px-1.5 py-0.5 rounded">DELETE MY ACCOUNT</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-red-200 dark:border-red-800 bg-background focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {deleteMutation.isError && (
                  <p className="text-sm text-red-500">{deleteMutation.error.message}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => { setShowDeleteSection(false); setConfirmText(""); setDeleteReason(""); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => deleteMutation.mutate({ confirmText, reason: deleteReason })}
                    disabled={confirmText !== "DELETE MY ACCOUNT" || deleteMutation.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete My Account
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
