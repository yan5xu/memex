export type RunResult<T = unknown> = {
  ok: boolean;
  code: number;
  data?: T;
  error?: { kind: string; message: string };
  warnings?: Array<{ kind: string; message: string }>;
  effects?: Array<{ kind: string; object?: string; field?: string }>;
};

export function getCurrentVault() {
  return localStorage.getItem("mbase.currentVault") || "";
}

export function setCurrentVault(vault: string) {
  const next = vault.trim();
  if (next) {
    localStorage.setItem("mbase.currentVault", next);
    rememberVault(next);
  }
}

export function getRecentVaults() {
  try {
    const raw = localStorage.getItem("mbase.recentVaults");
    const values = raw ? JSON.parse(raw) : [];
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
  } catch {
    return [];
  }
}

export function rememberVault(vault: string) {
  const next = vault.trim();
  if (!next) return;
  const recent = [next, ...getRecentVaults().filter((v) => v !== next)].slice(0, 8);
  localStorage.setItem("mbase.recentVaults", JSON.stringify(recent));
}

export async function run<T>(argv: string[], vault = getCurrentVault()): Promise<RunResult<T>> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ argv, vault: vault || undefined })
  });
  return res.json();
}
