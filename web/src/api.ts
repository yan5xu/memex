export type RunResult<T = unknown> = {
  ok: boolean;
  code: number;
  data?: T;
  error?: { kind: string; message: string };
  warnings?: Array<{ kind: string; message: string }>;
  effects?: Array<{ kind: string; object?: string; field?: string }>;
};

export type ServerInfo = {
  product: string;
  default_vault: string;
  vault_exists: boolean;
  showcase_vault: string;
  showcase_exists: boolean;
  showcase_start_object: string;
  read_only?: boolean;
  brand_name?: string;
  brand_mark?: string;
  brand_tagline?: string;
  source_url?: string;
  status_label?: string;
};

export async function getServerInfo(): Promise<RunResult<ServerInfo>> {
  const res = await fetch("/api/info");
  return res.json();
}

export function getCurrentVault() {
  return localStorage.getItem("memex.currentVault") || "";
}

export function setCurrentVault(vault: string) {
  const next = vault.trim();
  if (next) {
    localStorage.setItem("memex.currentVault", next);
    rememberVault(next);
  }
}

export function getRecentVaults() {
  try {
    const raw = localStorage.getItem("memex.recentVaults");
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
  localStorage.setItem("memex.recentVaults", JSON.stringify(recent));
}

export async function run<T>(argv: string[], vault = getCurrentVault(), options: { stdin?: string } = {}): Promise<RunResult<T>> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ argv, vault: vault || undefined, stdin: options.stdin })
  });
  return res.json();
}

export type AssetResult = {
  path: string;
  abs_path: string;
  filename: string;
  markdown: string;
};

export async function uploadAsset(file: File, vault = getCurrentVault()): Promise<RunResult<AssetResult>> {
  const body = new FormData();
  body.set("file", file);
  if (vault) body.set("vault", vault);
  const res = await fetch("/api/assets", {
    method: "POST",
    body
  });
  return res.json();
}
