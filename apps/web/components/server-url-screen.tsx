// First-launch screen for native apps (Android / iOS / desktop): pick which
// self-hosted Domus server to connect to. The web build skips this — its server
// is baked in at build time. After connecting, the app proceeds to login.
"use client";

import React from "react";
import { toast } from "sonner";
import { Server, ArrowRight } from "lucide-react";
import {
  getStoredServerUrl,
  normalizeServerUrl,
  setServerUrl,
  validateServerUrl,
} from "@/lib/server-url";

export function ServerUrlScreen({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [value, setValue] = React.useState(getStoredServerUrl() || "");
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const connect = async (force: boolean) => {
    const normalized = normalizeServerUrl(value);
    if (!normalized) {
      setError("Enter your Domus server address.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      if (force || (await validateServerUrl(normalized))) {
        setServerUrl(normalized);
        toast.success("Server connected", { description: normalized });
        onConnected();
      } else {
        setError(
          `Couldn't reach ${normalized}. Check the address and that the server is running.`,
        );
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Server className="h-6 w-6" />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Connect to your server
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the address of your self-hosted Domus server to get started.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/40 p-6 backdrop-blur-md shadow-glow sm:p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect(false);
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Server Address
              </label>
              <div className="relative">
                <Server className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://domus.example.com"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background/50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background/80"
                />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground/80">
                e.g. http://192.168.1.50:8000 on your home network
              </p>
              {error && (
                <p className="text-xs font-semibold text-rose-500">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/95 disabled:opacity-50"
            >
              {checking ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <>
                  Connect <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {error && (
              <button
                type="button"
                onClick={() => connect(true)}
                disabled={checking}
                className="w-full text-center text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Connect anyway without checking
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
