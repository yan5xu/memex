import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useNavigate } from "@tanstack/react-router";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, type RowSelectionState, type SortingState, type VisibilityState, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Activity, ArrowUpDown, Boxes, Braces, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Database, FileText, FolderOpen, GitBranch, HeartPulse, History, Network, PanelLeftClose, PanelLeftOpen, Play, Search } from "lucide-react";
import "./styles.css";
import { getCurrentVault, getRecentVaults, run, setCurrentVault } from "./api";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { Input } from "./components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { ScrollArea } from "./components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Toaster } from "./components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

type TypeDef = { id: string; fields?: FieldDef[] };
type FieldDef = { name: string; kind: string; required?: boolean; unique?: boolean; target_type?: string; enum_values?: string[] };
type Obj = { id: string; type_id: string; title: string; body_path: string; body_abs_path: string; fields: Record<string, unknown> };
type Link = { from_id: string; to_id: string; kind: string; relation: string; text?: string; resolved: boolean };
type GraphData = { nodes: Obj[]; edges: Link[] };
type SchemaEdge = { source: string; target: string; relation: string; kind: string; required?: boolean };
type Point = { x: number; y: number };
type ViewID = "objects" | "detail" | "types" | "graph" | "health";
type RouteSearch = { view: ViewID; type?: string; filter?: string; object?: string; graphMode?: string };
type VaultUIState = { view: ViewID; type?: string; filter?: string; object?: string; graphMode?: string };
type AppState = {
  view: string;
  vault: string;
  vaultOK: boolean | null;
  activeType: string;
  activeObject: Obj | null;
  activeBody: string;
  types: TypeDef[];
  rows: Record<string, unknown>[];
  links: Link[];
  backlinks: Link[];
  issues: unknown[];
  graph: GraphData;
};
type BaseLoadResult = {
  types: TypeDef[];
  issues: unknown[];
  vaultOK: boolean;
  activeType: string;
  rows: Record<string, unknown>[];
};
type ObjectLoadResult = { object: Obj; body: string; links: Link[]; backlinks: Link[] };
type AutomationSnapshot = {
  version: 1;
  view: string;
  vault: string;
  vaultOK: boolean | null;
  activeType: string;
  activeObjectId: string | null;
  activeObjectTitle: string | null;
  activeBodyLength: number;
  types: string[];
  rowsCount: number;
  rowIds: string[];
  linksCount: number;
  backlinksCount: number;
  issuesCount: number;
  graphNodesCount: number;
  graphEdgesCount: number;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1500,
      gcTime: 5 * 60 * 1000,
      retry: 1
    }
  }
});

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "kbd", "sub", "sup", "ins"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...((defaultSchema.attributes?.["*"] as unknown[]) ?? []), "className", "title"],
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), "href", "target", "rel"],
    code: [...((defaultSchema.attributes?.code as unknown[]) ?? []), "className"],
    div: [...((defaultSchema.attributes?.div as unknown[]) ?? []), "className"],
    input: [...((defaultSchema.attributes?.input as unknown[]) ?? []), "type", "checked", "disabled"],
    span: [...((defaultSchema.attributes?.span as unknown[]) ?? []), "className"],
    details: ["open"],
    summary: []
  }
};

const rootRoute = createRootRoute({
  component: RootRoute
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): RouteSearch => ({
    view: normalizeView(search.view),
    type: typeof search.type === "string" ? search.type : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
    object: typeof search.object === "string" ? search.object : undefined,
    graphMode: typeof search.graphMode === "string" ? search.graphMode : undefined
  }),
  component: App
});

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootRoute() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function normalizeView(view: unknown): ViewID {
  return view === "detail" || view === "types" || view === "graph" || view === "health" ? view : "objects";
}

function getVaultUIStates(): Record<string, VaultUIState> {
  try {
    const raw = localStorage.getItem("mbase.vaultStates");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getVaultUIState(vault: string): VaultUIState | null {
  return getVaultUIStates()[vault] ?? null;
}

function saveVaultUIState(vault: string, state: VaultUIState) {
  const nextVault = vault.trim();
  if (!nextVault) return;
  const states = getVaultUIStates();
  states[nextVault] = state;
  localStorage.setItem("mbase.vaultStates", JSON.stringify(states));
}

function automationState(state: AppState): AutomationSnapshot {
  return {
    version: 1,
    view: state.view,
    vault: state.vault,
    vaultOK: state.vaultOK,
    activeType: state.activeType,
    activeObjectId: state.activeObject?.id ?? null,
    activeObjectTitle: state.activeObject?.title ?? null,
    activeBodyLength: state.activeBody.length,
    types: state.types.map((t) => t.id),
    rowsCount: state.rows.length,
    rowIds: state.rows.map((row) => String(row.id ?? "")),
    linksCount: state.links.length,
    backlinksCount: state.backlinks.length,
    issuesCount: state.issues.length,
    graphNodesCount: state.graph.nodes.length,
    graphEdgesCount: state.graph.edges.length
  };
}

declare global {
  interface Window {
    mbase?: {
      run: typeof run;
      getVault: () => string;
      recentVaults: () => string[];
      switchVault: (path: string) => Promise<AutomationSnapshot>;
      openVault: (path: string) => Promise<AutomationSnapshot>;
      reload: () => Promise<AutomationSnapshot>;
      selectType: (type: string) => Promise<AutomationSnapshot>;
      setFilter: (filter: string) => Promise<AutomationSnapshot>;
      openObject: (id: string) => Promise<AutomationSnapshot>;
      openGraph: () => Promise<AutomationSnapshot>;
      openHealth: () => Promise<AutomationSnapshot>;
      state: () => AutomationSnapshot;
    };
  }
}

function App() {
  const routeSearch = indexRoute.useSearch();
  const navigate = useNavigate({ from: "/" });
  const queryClient = useQueryClient();
  const [view, setViewState] = useState<ViewID>(routeSearch.view);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("mbase.sidebarCollapsed") === "true");
  const [types, setTypes] = useState<TypeDef[]>([]);
  const [activeType, setActiveTypeState] = useState(routeSearch.type ?? "");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [activeObject, setActiveObject] = useState<Obj | null>(null);
  const [activeBody, setActiveBody] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [backlinks, setBacklinks] = useState<Link[]>([]);
  const [issues, setIssues] = useState<unknown[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphMode, setGraphModeState] = useState(routeSearch.graphMode ?? "core");
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<string | null>(null);
  const [filter, setFilterState] = useState(routeSearch.filter ?? "");
  const [vault, setVault] = useState(getCurrentVault());
  const [vaultDraft, setVaultDraft] = useState(getCurrentVault());
  const [recentVaults, setRecentVaults] = useState(getRecentVaults());
  const [vaultOK, setVaultOK] = useState<boolean | null>(null);

  function updateSearch(next: Partial<RouteSearch>, options: { replace?: boolean } = {}) {
    void navigate({
      search: (prev) => ({
        ...prev,
        ...next
      }),
      replace: options.replace ?? false
    });
  }

  function setView(next: ViewID, options: { replace?: boolean } = {}) {
    setViewState(next);
    updateSearch({ view: next, object: next === "detail" ? activeObject?.id ?? routeSearch.object : undefined }, options);
  }

  function setActiveType(next: string, options: { replace?: boolean } = {}) {
    setActiveTypeState(next);
    setActiveObject(null);
    setActiveBody("");
    setViewState("objects");
    updateSearch({ view: "objects", type: next, object: undefined }, options);
  }

  function setFilter(next: string) {
    setFilterState(next);
    updateSearch({ filter: next || undefined }, { replace: true });
  }

  function setGraphMode(next: string, options: { replace?: boolean } = {}) {
    setGraphModeState(next);
    updateSearch({ view: "graph", graphMode: next }, options);
  }

  function cachedRun<T>(argv: string[], vaultOverride = getCurrentVault()) {
    const key = ["run", vaultOverride || "default", ...argv];
    return queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => run<T>(argv, vaultOverride),
      staleTime: 1500
    });
  }

  async function loadBase(nextActiveType = activeType, where = filter): Promise<BaseLoadResult> {
    const [typesRes, issuesRes, vaultRes] = await Promise.all([
      cachedRun<{ types: TypeDef[] }>(["type", "list"]),
      cachedRun<{ issues: unknown[] }>(["issues"]),
      cachedRun<{ exists: boolean }>(["vault", "info"])
    ]);
    const list = typesRes.data?.types ?? [];
    const nextIssues = issuesRes.data?.issues ?? [];
    const nextVaultOK = Boolean(vaultRes.data?.exists);
    setTypes(list);
    if (nextActiveType && !list.some((type) => type.id === nextActiveType)) {
      nextActiveType = "";
    }
    if (!nextActiveType && list[0]) {
      nextActiveType = list[0].id;
    }
    if (nextActiveType) {
      setActiveTypeState(nextActiveType);
      updateSearch({ type: nextActiveType }, { replace: true });
    }
    setIssues(nextIssues);
    setVaultOK(nextVaultOK);
    let nextRows: Record<string, unknown>[] = [];
    if (nextActiveType) {
      nextRows = await loadRows(nextActiveType, where);
    }
    return { types: list, issues: nextIssues, vaultOK: nextVaultOK, activeType: nextActiveType, rows: nextRows };
  }

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (!activeType) return;
    void loadRows(activeType, filter);
  }, [activeType, filter]);

  async function loadRows(type: string, where: string): Promise<Record<string, unknown>[]> {
    const argv = ["query", type, "--limit", "200"];
    if (where) argv.push("--where", where);
    const res = await cachedRun<{ rows: Record<string, unknown>[] }>(argv);
    const nextRows = res.data?.rows ?? [];
    setRows(nextRows);
    return nextRows;
  }

  async function openObject(id: string, options: { syncURL?: boolean } = {}): Promise<ObjectLoadResult | null> {
    const res = await cachedRun<ObjectLoadResult>(["object", "get", id]);
    if (res.data) {
      setActiveObject(res.data.object);
      setActiveBody(res.data.body ?? "");
      setLinks(res.data.links ?? []);
      setBacklinks(res.data.backlinks ?? []);
      setViewState("detail");
      if (options.syncURL !== false) {
        updateSearch({ view: "detail", object: id });
      }
      return res.data;
    }
    return null;
  }

  async function openGraph(options: { syncURL?: boolean } = {}): Promise<GraphData> {
    const res = await cachedRun<GraphData>(["graph", "export"]);
    const nextGraph = res.data ?? { nodes: [], edges: [] };
    setGraph(nextGraph);
    setViewState("graph");
    if (options.syncURL !== false) {
      updateSearch({ view: "graph", graphMode });
    }
    return nextGraph;
  }

  const activeFields = useMemo(() => types.find((t) => t.id === activeType)?.fields ?? [], [types, activeType]);
  const schemaGraphView = useMemo(() => buildSchemaGraphView(types, selectedSchemaType), [types, selectedSchemaType]);
  const graphView = useMemo(() => buildGraphView(graph, graphMode, selectedGraphNode), [graph, graphMode, selectedGraphNode]);
  const selectedGraphObject = useMemo(() => graph.nodes.find((n) => n.id === selectedGraphNode) ?? null, [graph.nodes, selectedGraphNode]);
  const currentVaultState = useMemo<VaultUIState>(() => ({
    view,
    type: activeType || undefined,
    filter: filter || undefined,
    object: view === "detail" ? activeObject?.id : undefined,
    graphMode
  }), [view, activeType, filter, activeObject?.id, graphMode]);

  useEffect(() => {
    const nextView = routeSearch.view;
    const nextType = routeSearch.type ?? "";
    const nextFilter = routeSearch.filter ?? "";
    const nextGraphMode = routeSearch.graphMode ?? "core";
    if (nextView !== view) setViewState(nextView);
    if (nextType !== activeType) setActiveTypeState(nextType);
    if (nextFilter !== filter) setFilterState(nextFilter);
    if (nextGraphMode !== graphMode) setGraphModeState(nextGraphMode);
    if (nextView === "detail" && routeSearch.object && routeSearch.object !== activeObject?.id) {
      void openObject(routeSearch.object, { syncURL: false });
    }
    if (nextView === "graph" && graph.nodes.length === 0) {
      void openGraph({ syncURL: false });
    }
  }, [routeSearch.view, routeSearch.type, routeSearch.filter, routeSearch.object, routeSearch.graphMode]);

  useEffect(() => {
    if (!vault) return;
    saveVaultUIState(vault, currentVaultState);
  }, [vault, currentVaultState]);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("mbase.sidebarCollapsed", String(next));
      return next;
    });
  }

  async function openVaultPath(path: string): Promise<BaseLoadResult | null> {
    const nextPath = path.trim();
    if (!nextPath) {
      toast.error("Vault path is required");
      return null;
    }
    if (vault) saveVaultUIState(vault, currentVaultState);
    const info = await run<{ exists: boolean }>(["vault", "info"], nextPath);
    if (!info.ok || !info.data?.exists) {
      toast.error(`Vault not ready: ${shortPath(nextPath)}`);
      setVaultDraft(nextPath);
      return null;
    }
    const saved = getVaultUIState(nextPath);
    const nextView = saved?.view ?? "objects";
    const nextType = saved?.type ?? "";
    const nextFilter = saved?.filter ?? "";
    const nextGraphMode = saved?.graphMode ?? "core";
    setCurrentVault(nextPath);
    setRecentVaults(getRecentVaults());
    queryClient.invalidateQueries();
    setVaultDraft(nextPath);
    setVault(nextPath);
    setActiveObject(null);
    setActiveBody("");
    setLinks([]);
    setBacklinks([]);
    setGraph({ nodes: [], edges: [] });
    setFilterState(nextFilter);
    setGraphModeState(nextGraphMode);
    setViewState(nextView === "detail" ? "objects" : nextView);
    updateSearch({ view: nextView === "detail" ? "objects" : nextView, type: nextType || undefined, filter: nextFilter || undefined, object: undefined, graphMode: nextGraphMode }, { replace: true });
    const loaded = await loadBase(nextType, nextFilter);
    if (nextView === "graph") {
      await openGraph({ syncURL: false });
    }
    if (nextView === "detail" && saved?.object) {
      await openObject(saved.object);
    }
    toast.success(`Opened ${shortPath(nextPath)}`);
    return loaded;
  }

  useEffect(() => {
    const currentState = (overrides: Partial<AppState> = {}) => automationState({
      view,
      vault,
      vaultOK,
      activeType,
      activeObject,
      activeBody,
      types,
      rows,
      links,
      backlinks,
      issues,
      graph,
      ...overrides
    });

    const runAndSync = async <T,>(argv: string[], vaultOverride = getCurrentVault()) => {
      const result = await run<T>(argv, vaultOverride);
      const changedObject = result.effects?.find((effect) => effect.object && (effect.kind === "body.refresh" || effect.kind === "body.write" || effect.kind === "body.append"))?.object;
      if (result.ok && changedObject) {
        await queryClient.invalidateQueries();
        await openObject(changedObject);
      }
      return result;
    };

    window.mbase = {
      run: runAndSync,
      getVault: () => getCurrentVault(),
      recentVaults: () => getRecentVaults(),
      switchVault: async (path: string) => {
        const loaded = await openVaultPath(path);
        if (!loaded) return currentState({ vaultOK: false });
        return currentState({
          view: loaded.activeType ? "objects" : view,
          vault: path.trim(),
          vaultOK: loaded.vaultOK,
          activeType: loaded.activeType,
          activeObject: null,
          activeBody: "",
          rows: loaded.rows,
          links: [],
          backlinks: [],
          types: loaded.types,
          issues: loaded.issues
        });
      },
      openVault: async (path: string) => {
        const loaded = await openVaultPath(path);
        if (!loaded) return currentState({ vaultOK: false });
        return currentState({
          view: loaded.activeType ? "objects" : view,
          vault: path.trim(),
          vaultOK: loaded.vaultOK,
          activeType: loaded.activeType,
          activeObject: null,
          activeBody: "",
          rows: loaded.rows,
          links: [],
          backlinks: [],
          types: loaded.types,
          issues: loaded.issues
        });
      },
      reload: async () => {
        const loaded = await loadBase(activeType);
        return currentState({ vaultOK: loaded.vaultOK, activeType: loaded.activeType, types: loaded.types, issues: loaded.issues, rows: loaded.rows });
      },
      selectType: async (type: string) => {
        setActiveType(type);
        const nextRows = await loadRows(type, filter);
        return currentState({ view: "objects", activeType: type, activeObject: null, activeBody: "", rows: nextRows });
      },
      setFilter: async (nextFilter: string) => {
        setFilter(nextFilter);
        const nextRows = activeType ? await loadRows(activeType, nextFilter) : [];
        return currentState({ view: "objects", rows: nextRows });
      },
      openObject: async (id: string) => {
        const data = await openObject(id);
        return currentState({
          view: "detail",
          activeObject: data?.object ?? activeObject,
          activeBody: data?.body ?? activeBody,
          links: data?.links ?? links,
          backlinks: data?.backlinks ?? backlinks
        });
      },
      openGraph: async () => {
        const nextGraph = await openGraph();
        return currentState({ view: "graph", graph: nextGraph });
      },
      openHealth: async () => {
        setView("health");
        return currentState({ view: "health" });
      },
      state: () => currentState()
    };
    return () => {
      delete window.mbase;
    };
  }, [view, vault, vaultOK, activeType, activeObject, activeBody, types, rows, links, backlinks, issues, graph, filter]);

  return (
    <div className="app-shell flex min-h-screen text-foreground">
      <aside className={`${sidebarCollapsed ? "w-20 px-3" : "w-72 px-4"} shrink-0 bg-[hsl(var(--sidebar)/0.78)] py-5 transition-[width,padding] duration-200`}>
        <div className={`mb-7 flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3 px-2"}`}>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex size-9 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_hsl(var(--shadow-warm)/0.16)]">m</div>
          {!sidebarCollapsed && <div>
            <div className="text-base font-semibold tracking-tight">mbase</div>
            <div className="text-xs text-muted-foreground">Local knowledge workbench</div>
          </div>}
          </div>
          <button className="glass-light inline-flex rounded-xl p-2 text-muted-foreground transition hover:text-foreground" onClick={toggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <VaultSwitcher
            vault={vault}
            draft={vaultDraft}
            setDraft={setVaultDraft}
            recentVaults={recentVaults}
            vaultOK={vaultOK}
            openVault={(path) => void openVaultPath(path)}
          />
        )}

        <nav className="space-y-1.5">
          <NavItem collapsed={sidebarCollapsed} icon={<Database className="size-4" />} label="Objects" active={view === "objects" || view === "detail"} onClick={() => setView("objects")} />
          <NavItem collapsed={sidebarCollapsed} icon={<Braces className="size-4" />} label="Schema" active={view === "types"} onClick={() => setView("types")} />
          <NavItem collapsed={sidebarCollapsed} icon={<Network className="size-4" />} label="Graph" active={view === "graph"} onClick={() => void openGraph()} />
          <NavItem collapsed={sidebarCollapsed} icon={<HeartPulse className="size-4" />} label="Health" active={view === "health"} onClick={() => setView("health")} />
        </nav>

        {!sidebarCollapsed && <><Separator className="my-6 bg-border/55" /><div className="px-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Types</div>
        <TypeCommand types={types} activeType={activeType} select={(type) => setActiveType(type)} />
        <ScrollArea className="mt-2 max-h-64 pr-2">
          <div className="space-y-1">
            {types.map((t) => (
              <button key={t.id} onClick={() => setActiveType(t.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-foreground/[0.035] ${activeType === t.id ? "bg-card/62 text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.45)]" : "text-muted-foreground"}`}>
                <span className="truncate font-medium">{t.id}</span>
                <span className="text-xs tabular-nums opacity-60">{t.fields?.length ?? 0}</span>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="tray mt-8 rounded-2xl p-3 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground/70"><Play className="size-3.5" /> Agent API</div>
          <code className="font-mono">window.mbase.state()</code>
        </div></>}
      </aside>

      <main className="min-w-0 flex-1 p-6">
        {view === "objects" && (
          <section className="mx-auto max-w-6xl">
            <Header eyebrow="Objects" title={activeType || "Objects"} description="Typed markdown objects from the current local vault." />
            <div className="mica overflow-hidden rounded-3xl">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Boxes className="size-5 text-[hsl(var(--earth))]" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{rows.length} objects</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{vault || "server default vault"}</div>
                  </div>
                </div>
                <div className="relative w-80 max-w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="where, e.g. judged=keep" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full pl-9" />
                </div>
              </div>
              <Tabs defaultValue="table" className="px-3 pb-3">
                <div className="mb-3 flex items-center justify-between">
                  <TabsList className="rounded-2xl bg-card/68">
                    <TabsTrigger value="table" className="rounded-xl">Table</TabsTrigger>
                    <TabsTrigger value="api" className="rounded-xl">API</TabsTrigger>
                  </TabsList>
                </div>
                <div className="rounded-2xl bg-card/46">
                  <TabsContent value="table" className="mt-0">
                    {rows.length === 0 ? (
                      <EmptyState title="No objects" description="Create objects from the CLI or switch to another type." />
                    ) : (
                      <ObjectDataTable rows={rows} fields={activeFields} open={(id) => void openObject(id)} />
                    )}
                  </TabsContent>
                  <TabsContent value="api" className="mt-0">
                    <pre className="overflow-x-auto p-4 font-mono text-xs text-muted-foreground">POST /api/run {"{\"argv\":[\"query\",\"" + (activeType || "type") + "\",\"--limit\",\"200\"],\"vault\":\"" + (vault || "default") + "\"}"}</pre>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </section>
        )}

        {view === "detail" && activeObject && (
          <section className="mx-auto h-[calc(100vh-3rem)] max-w-7xl">
            <ResizablePanelGroup orientation="horizontal" className="gap-4">
              <ResizablePanel defaultSize={68} minSize={45}>
                <article className="mica h-full overflow-auto rounded-3xl px-8 py-7">
                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <Badge>{activeObject.type_id}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{activeObject.id}</span>
                  </div>
                  <div className="mb-7">
                    <h1 className="font-serif text-4xl font-medium tracking-tight">{activeObject.title || activeObject.id}</h1>
                    <div className="mt-3 h-px w-24 bg-[hsl(var(--earth)/0.28)]" />
                  </div>
                  <div className="markdown max-w-3xl">
                    <MarkdownBody
                      body={activeBody || `# ${activeObject.title || activeObject.id}\n\nBody file: \`${activeObject.body_path}\``}
                      object={activeObject}
                      vault={vault}
                      openObject={(id) => void openObject(id)}
                    />
                  </div>
                </article>
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent" />
              <ResizablePanel defaultSize={32} minSize={22}>
                <aside className="h-full space-y-4 overflow-auto">
                  <Panel title="Body" icon={<FileText className="size-4" />}>
                    <div className="tray break-all rounded-2xl p-3 font-mono text-xs text-muted-foreground">{activeObject.body_abs_path || activeObject.body_path}</div>
                  </Panel>
                  <Panel title="Fields" icon={<Braces className="size-4" />}>{Object.entries(activeObject.fields ?? {}).map(([k, v]) => <KV key={k} k={k} v={renderCell(v)} />)}</Panel>
                  <Panel title="Field Links" icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "field").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
                  <Panel title="Body Links" icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "body").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
                  <Panel title="Backlinks" icon={<Network className="size-4" />}>{backlinks.map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} reverse />)}</Panel>
                </aside>
              </ResizablePanel>
            </ResizablePanelGroup>
          </section>
        )}

        {view === "types" && (
          <section className="mx-auto max-w-6xl">
            <Header eyebrow="Schema Studio" title="Types and fields" description="Dynamic schema for object projections, field links, and local validation." />
            <div className="mica mb-5 overflow-hidden rounded-3xl">
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium"><Network className="size-4 text-[hsl(var(--earth))]" /> Schema graph</div>
                  <div className="mt-1 text-sm text-muted-foreground">{schemaGraphView.nodes.length} types, {schemaGraphView.edges.length} reference fields</div>
                </div>
                <button className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => setSelectedSchemaType(null)}>Clear</button>
              </div>
              <div className="h-[360px] border-t border-border/50">
                <SchemaGraphCanvas graphView={schemaGraphView} selectedType={selectedSchemaType} select={setSelectedSchemaType} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {types.map((t) => (
                <Panel key={t.id} title={t.id} icon={<Braces className="size-4" />}>
                  <div className="space-y-1">
                    {(t.fields ?? []).map((f) => (
                      <div key={f.name} className="soft-row flex items-center gap-2 py-3 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                        <Badge>{f.kind}</Badge>
                        {f.required && <Badge>required</Badge>}
                        {f.unique && <Badge>unique</Badge>}
                        {f.target_type && <span className="font-mono text-xs text-muted-foreground">to {f.target_type}</span>}
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
            <div className="tray mt-5 rounded-3xl p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Play className="size-4 text-[hsl(var(--earth))]" /> Run console</div>
              <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">POST /api/run {"{\"argv\":[\"type\",\"list\"],\"vault\":\"" + (vault || "default") + "\"}"}</pre>
            </div>
          </section>
        )}

        {view === "graph" && (
          <section className="mx-auto h-[calc(100vh-3rem)] max-w-7xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <Header eyebrow="Link Map" title="Object graph" description={`${graphView.nodes.length} visible nodes, ${graphView.edges.length} visible links`} />
              <Tabs value={graphMode} onValueChange={setGraphMode}>
                <TabsList className="acrylic rounded-2xl">
                  <TabsTrigger value="core" className="rounded-xl text-xs">Core</TabsTrigger>
                  <TabsTrigger value="all" className="rounded-xl text-xs">All</TabsTrigger>
                  <TabsTrigger value="founders" className="rounded-xl text-xs">Founders</TabsTrigger>
                  <TabsTrigger value="sources" className="rounded-xl text-xs">Sources</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="grid h-[calc(100%-6rem)] grid-cols-[minmax(0,1fr)_280px] gap-4">
              <div className="mica relative overflow-hidden rounded-3xl">
                <div className="pointer-events-none absolute left-5 top-5 z-10 flex gap-2">
                  {graphView.lanes.map((lane) => <Badge key={lane.type} className="bg-card/70">{lane.type} · {lane.count}</Badge>)}
                </div>
                <GraphCanvas graphView={graphView} selectedID={selectedGraphNode} select={setSelectedGraphNode} open={(id) => void openObject(id)} />
              </div>
              <aside className="space-y-4">
                <Panel title="Selection" icon={<Network className="size-4" />}>
                  {selectedGraphObject ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium">{selectedGraphObject.title || selectedGraphObject.id}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{selectedGraphObject.id}</div>
                      </div>
                      <Badge>{selectedGraphObject.type_id}</Badge>
                      <button className="rounded-xl px-3 py-2 text-sm text-[hsl(var(--earth))] transition hover:bg-foreground/[0.04]" onClick={() => void openObject(selectedGraphObject.id)}>Open object</button>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a node to inspect it. Double click opens the object page.</div>
                  )}
                </Panel>
                <Panel title="Relation Legend" icon={<GitBranch className="size-4" />}>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <LegendRow color="hsl(var(--earth))" label="company / batch" />
                    <LegendRow color="hsl(var(--moss))" label="founder links" />
                    <LegendRow color="hsl(var(--clay))" label="touchpoints / sources" />
                  </div>
                </Panel>
              </aside>
            </div>
          </section>
        )}

        {view === "health" && (
          <section className="mx-auto max-w-5xl">
            <Header eyebrow="Health" title="Vault integrity" description="Local validation and body/link diagnostics." />
            <div className="mica rounded-3xl p-4">
              {issues.length === 0 ? <EmptyState title="No issues" description="The current vault is clean." /> : issues.map((issue, i) => <pre key={i} className="tray mb-3 overflow-x-auto rounded-2xl p-3 font-mono text-xs text-muted-foreground last:mb-0">{JSON.stringify(issue, null, 2)}</pre>)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function renderCell(v: unknown) {
  if (Array.isArray(v)) return <span className="flex flex-wrap gap-1">{v.map((x) => <Badge key={String(x)}>{String(x)}</Badge>)}</span>;
  if (v === undefined || v === null || v === "") return <span className="text-muted-foreground">—</span>;
  return String(v);
}

function MarkdownBody({ body, object, vault, openObject }: { body: string; object: Obj | null; vault: string; openObject: (id: string) => void }) {
  const rendered = useMemo(() => normalizeMarkdownBody(body), [body]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
        a: ({ node: _node, href, children, ...props }) => {
          const objectID = objectIDFromInternalHref(href);
          if (objectID) {
            return (
              <button className="markdown-wikilink" type="button" onClick={() => openObject(objectID)}>
                {children}
              </button>
            );
          }
          return (
            <a {...props} href={href} target={isExternalHref(href) ? "_blank" : undefined} rel={isExternalHref(href) ? "noreferrer" : undefined}>
              {children}
            </a>
          );
        },
        blockquote: ({ node: _node, children, ...props }) => <MarkdownBlockquote {...props}>{children}</MarkdownBlockquote>,
        code: ({ node: _node, className, children, ...props }) => <MarkdownCode className={className} {...props}>{children}</MarkdownCode>,
        img: ({ node: _node, src, alt, ...props }) => {
          const resolved = markdownAssetURL(src, object, vault);
          return (
            <img
              {...props}
              src={resolved}
              alt={alt ?? ""}
              loading="lazy"
              title={alt ?? ""}
              onClick={() => resolved && window.open(resolved, "_blank", "noopener,noreferrer")}
            />
          );
        }
      }}
    >
      {rendered}
    </ReactMarkdown>
  );
}

function MarkdownCode({ className, children, ...props }: React.ComponentProps<"code">) {
  const source = String(children ?? "").replace(/\n$/, "");
  const language = /language-([A-Za-z0-9_-]+)/.exec(className ?? "")?.[1]?.toLowerCase();
  if (language === "mermaid") {
    return <MermaidDiagram source={source} />;
  }
  if (!language) {
    return <code {...props}>{children}</code>;
  }
  const highlighted = highlightCode(source, language);
  return <code {...props} className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

function MermaidDiagram({ source }: { source: string }) {
  const rawID = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSVG] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            fontFamily: "Inter, ui-sans-serif, system-ui",
            primaryColor: "#f8f5ef",
            primaryBorderColor: "#c8b8a0",
            lineColor: "#967a59",
            textColor: "#332e27"
          }
        });
        const result = await mermaid.render(`mbase-mermaid-${rawID}`, source);
        if (!cancelled) {
          setSVG(result.svg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSVG("");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [rawID, source]);
  if (error) return <pre className="markdown-mermaid-error">{error}</pre>;
  if (!svg) return <div className="markdown-mermaid-loading">Rendering diagram...</div>;
  return <div className="markdown-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MarkdownBlockquote({ children, ...props }: React.ComponentProps<"blockquote">) {
  const alertType = githubAlertType(children);
  if (alertType) {
    return (
      <div className={`markdown-alert markdown-alert-${alertType.toLowerCase()}`}>
        <div className="markdown-alert-title">{alertType[0] + alertType.slice(1).toLowerCase()}</div>
        <blockquote {...props} className="markdown-alert-body">{children}</blockquote>
      </div>
    );
  }
  return <blockquote {...props}>{children}</blockquote>;
}

function normalizeMarkdownBody(markdown: string) {
  return transformMarkdownOutsideFences(markdown, (line) => normalizeWikiLinks(normalizeObsidianImages(line)));
}

function transformMarkdownOutsideFences(markdown: string, transform: (line: string) => string) {
  let fenced = false;
  return markdown.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return line;
    }
    return fenced ? line : transform(line);
  }).join("\n");
}

function normalizeObsidianImages(line: string) {
  return line.replace(/!\[\[([^\]\n]+)\]\]/g, (_match, raw: string) => {
    const [target, label] = raw.split("|").map((part) => part.trim());
    if (!target) return "";
    const alt = label || target.split("/").pop() || target;
    return `![${escapeMarkdownAlt(alt)}](${encodeURI(target)})`;
  });
}

function normalizeWikiLinks(line: string) {
  return line.replace(/\[\[([^\]\n]+)\]\]/g, (_match, raw: string) => {
    const [target, label] = raw.split("|").map((part) => part.trim());
    if (!target) return "";
    const title = label || target;
    return `[${escapeMarkdownAlt(title)}](#mbase-object:${encodeURIComponent(target)})`;
  });
}

function escapeMarkdownAlt(value: string) {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function highlightCode(source: string, language: string) {
  try {
    if (hljs.getLanguage(language)) {
      return hljs.highlight(source, { language, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(source).value;
  } catch {
    return escapeHTML(source);
  }
}

function escapeHTML(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function githubAlertType(children: React.ReactNode) {
  const match = reactText(children).trimStart().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function reactText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return reactText(node.props.children);
  return "";
}

function objectIDFromInternalHref(href: string | undefined) {
  if (!href?.startsWith("#mbase-object:")) return "";
  return decodeURIComponent(href.slice("#mbase-object:".length));
}

function isExternalHref(href: string | undefined) {
  return Boolean(href && /^[a-z][a-z0-9+.-]*:/i.test(href));
}

function markdownAssetURL(src: string | undefined, object: Obj | null, vault: string) {
  if (!src || isExternalAsset(src)) return src;
  const params = new URLSearchParams({ path: src });
  if (object?.body_path) params.set("base", object.body_path);
  if (vault) params.set("vault", vault);
  return `/api/file?${params.toString()}`;
}

function isExternalAsset(src: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("#");
}

function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-5">
      <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
      <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function NavItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode; label: string; active: boolean; collapsed?: boolean; onClick: () => void }) {
  const button = (
    <button onClick={onClick} title={collapsed ? label : undefined} className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} rounded-2xl py-2.5 text-left text-sm transition ${active ? "bg-card/68 text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.42),0_10px_22px_hsl(var(--shadow-warm)/0.08)]" : "text-foreground/72 hover:bg-foreground/[0.035]"}`}>
      <span className={active ? "text-[hsl(var(--earth))]" : "text-muted-foreground"}>{icon}</span>
      {!collapsed && <span className="font-medium">{label}</span>}
    </button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function VaultSwitcher({ vault, draft, setDraft, recentVaults, vaultOK, openVault }: { vault: string; draft: string; setDraft: (path: string) => void; recentVaults: string[]; vaultOK: boolean | null; openVault: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [manualPath, setManualPath] = useState(draft || vault);
  const visibleRecent = recentVaults.filter((path) => path !== vault).slice(0, 7);
  useEffect(() => {
    setManualPath(draft || vault);
  }, [draft, vault]);
  function commit(path: string) {
    const next = path.trim();
    if (!next) return;
    setDraft(next);
    openVault(next);
    setOpen(false);
  }
  return (
    <div className="mica mb-5 rounded-2xl p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <FolderOpen className="size-3.5" />
        Vault
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card/62 px-3 py-3 text-left transition hover:bg-card">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate font-mono text-xs">{vault ? shortPath(vault) : "default server vault"}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm break-all font-mono">{vault || "server default vault"}</TooltipContent>
            </Tooltip>
            <Badge className={vaultOK ? "text-[hsl(var(--moss))]" : "text-[hsl(var(--clay))]"}>{vaultOK ? "ready" : "missing"}</Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 rounded-3xl p-0">
          <Command shouldFilter>
            <CommandInput placeholder="Search recent vaults..." />
            <CommandList>
              <CommandEmpty>No recent vault found.</CommandEmpty>
              <CommandGroup heading="Current">
                <CommandItem value={vault || "default"} onSelect={() => vault && commit(vault)}>
                  <Check className="size-4 opacity-100" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{vault ? shortPath(vault) : "server default"}</span>
                  <Badge className={vaultOK ? "text-[hsl(var(--moss))]" : "text-[hsl(var(--clay))]"}>{vaultOK ? "ready" : "missing"}</Badge>
                </CommandItem>
              </CommandGroup>
              {visibleRecent.length > 0 && (
                <CommandGroup heading="Recent">
                  {visibleRecent.map((path) => (
                    <CommandItem key={path} value={path} onSelect={() => commit(path)}>
                      <History className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortPath(path)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          <Separator />
          <div className="space-y-2 p-3">
            <div className="text-xs font-medium text-muted-foreground">Open path</div>
            <div className="flex gap-2">
              <Input value={manualPath} onChange={(event) => { setManualPath(event.target.value); setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") commit(manualPath); }} placeholder="/path/to/vault" className="h-9 flex-1 font-mono text-xs" />
              <Button className="h-9 px-3" disabled={!manualPath.trim()} onClick={() => commit(manualPath)}>Open</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TypeCommand({ types, activeType, select }: { types: TypeDef[]; activeType: string; select: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = types.find((type) => type.id === activeType);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground">
          <span className="truncate">{active?.id ?? "Select type"}</span>
          <Search className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-2xl p-0">
        <Command>
          <CommandInput placeholder="Find type..." />
          <CommandList>
            <CommandEmpty>No type found.</CommandEmpty>
            <CommandGroup>
              {types.map((type) => (
                <CommandItem key={type.id} value={type.id} onSelect={() => { select(type.id); setOpen(false); }}>
                  <Check className={`size-4 ${type.id === activeType ? "opacity-100" : "opacity-0"}`} />
                  <span className="flex-1 truncate">{type.id}</span>
                  <span className="text-xs text-muted-foreground">{type.fields?.length ?? 0}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function GraphModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={`rounded-xl px-3 py-1.5 transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`} onClick={onClick}>{label}</button>;
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: color }} />{label}</div>;
}

function SchemaGraphCanvas({ graphView, selectedType, select }: { graphView: ReturnType<typeof buildSchemaGraphView>; selectedType: string | null; select: (type: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Point>>({});
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Point } | null>(null);
  useEffect(() => pruneDraggedPositions(graphView.nodes, setDraggedPositions), [graphView.nodes]);
  const nodes = graphView.nodes.map((node) => ({ ...node, position: draggedPositions[node.id] ?? node.position }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const size = graphCanvasSize(nodes, zoom);
  const innerSize = graphCanvasSize(nodes);
  function beginDrag(event: React.PointerEvent, id: string, position: Point) {
    if (event.button !== 0) return;
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, origin: position };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = {
      x: Math.max(0, drag.origin.x + (event.clientX - drag.startX) / zoom),
      y: Math.max(0, drag.origin.y + (event.clientY - drag.startY) / zoom)
    };
    setDraggedPositions((positions) => ({ ...positions, [drag.id]: next }));
  }
  function endDrag(event: React.PointerEvent) {
    if (dragRef.current) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }
  return (
    <div className="relative h-full overflow-hidden">
      <GraphZoomControls zoom={zoom} setZoom={setZoom} reset={() => setDraggedPositions({})} />
      <div className="h-full overflow-auto overscroll-contain">
        <div className="relative" style={{ width: size.width, height: size.height }}>
          <div className="relative origin-top-left" style={{ width: innerSize.width, height: innerSize.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        <svg className="absolute inset-0" width={innerSize.width} height={innerSize.height}>
          <defs>
            <marker id="schema-arrow" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--earth) / 0.52)" />
            </marker>
          </defs>
          {graphView.edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            const path = graphPath(source.position, target.position);
            const dimmed = selectedType !== null && edge.source !== selectedType && edge.target !== selectedType;
            return (
              <g key={`${edge.source}-${edge.relation}-${edge.target}`} opacity={dimmed ? 0.22 : 1}>
                <path d={path.d} fill="none" stroke={dimmed ? "hsl(var(--muted-foreground) / 0.18)" : schemaEdgeColor(edge)} strokeWidth={edge.required ? 2.2 : 1.7} markerEnd="url(#schema-arrow)" />
                {!dimmed && (
                  <text x={path.label.x} y={path.label.y} className="fill-muted-foreground text-[10px]">
                    {edge.relation}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => (
          <button
            key={node.id}
            className={`absolute w-[190px] rounded-[18px] px-4 py-3 text-left transition ${node.id === selectedType ? "bg-card shadow-[0_16px_34px_hsl(var(--shadow-warm)/0.18)]" : "bg-card/80 shadow-[0_10px_24px_hsl(var(--shadow-warm)/0.10)] hover:bg-card"}`}
            data-graph-node={node.id}
            style={{ left: node.position.x, top: node.position.y, border: `1px solid ${node.id === selectedType ? graphTypeColor(node.id) : "hsl(var(--border) / 0.45)"}` }}
            onClick={() => select(node.id)}
            onPointerDown={(event) => beginDrag(event, node.id, node.position)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="truncate text-sm font-semibold">{node.id}</div>
            <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground">
              <span>{node.fieldCount} fields</span>
              <span>{node.refCount} refs</span>
            </div>
          </button>
        ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphCanvas({ graphView, selectedID, select, open }: { graphView: ReturnType<typeof buildGraphView>; selectedID: string | null; select: (id: string) => void; open: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Point>>({});
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  useEffect(() => pruneDraggedPositions(graphView.nodes, setDraggedPositions), [graphView.nodes]);
  const nodes = graphView.nodes.map((node) => ({ ...node, position: draggedPositions[node.id] ?? node.position }));
  const nodeMap = new Map(nodes.map((node) => [node.id, { object: node.object, position: node.position }]));
  const size = graphCanvasSize(nodes, zoom);
  const innerSize = graphCanvasSize(nodes);
  function beginDrag(event: React.PointerEvent, id: string, position: Point) {
    if (event.button !== 0) return;
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, origin: position, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    setDraggedPositions((positions) => ({ ...positions, [drag.id]: { x: Math.max(0, drag.origin.x + dx), y: Math.max(0, drag.origin.y + dy) } }));
  }
  function endDrag(event: React.PointerEvent) {
    if (dragRef.current) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }
  return (
    <div className="relative h-full overflow-hidden">
      <GraphZoomControls zoom={zoom} setZoom={setZoom} reset={() => setDraggedPositions({})} />
      <div className="h-full overflow-auto overscroll-contain">
        <div className="relative" style={{ width: size.width, height: size.height }}>
          <div className="relative origin-top-left" style={{ width: innerSize.width, height: innerSize.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
        <svg className="absolute inset-0" width={innerSize.width} height={innerSize.height}>
          <defs>
            <marker id="graph-arrow-earth" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--earth) / 0.48)" />
            </marker>
            <marker id="graph-arrow-moss" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--moss) / 0.62)" />
            </marker>
            <marker id="graph-arrow-clay" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
              <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--clay) / 0.66)" />
            </marker>
          </defs>
          {graphView.edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            const path = graphPath(source.position, target.position);
            const dimmed = selectedID !== null && edge.source !== selectedID && edge.target !== selectedID;
            return (
              <g key={edge.id} opacity={dimmed ? 0.24 : 1}>
                <path d={path.d} fill="none" stroke={edge.color} strokeWidth={dimmed ? 1.1 : 1.9} markerEnd={`url(#${edge.marker})`} />
                {!dimmed && selectedID && (
                  <text x={path.label.x} y={path.label.y} className="fill-muted-foreground text-[10px]">
                    {edge.relation}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => (
          <button
            key={node.id}
            className={`absolute w-[190px] rounded-[18px] px-2 py-2 text-left transition ${node.id === selectedID ? "bg-card shadow-[0_16px_34px_hsl(var(--shadow-warm)/0.18)]" : "bg-card/80 shadow-[0_10px_24px_hsl(var(--shadow-warm)/0.10)] hover:bg-card"}`}
            data-graph-node={node.id}
            style={{ left: node.position.x, top: node.position.y, border: `1px solid ${node.id === selectedID ? graphTypeColor(node.object.type_id) : "hsl(var(--border) / 0.45)"}` }}
            onClick={() => select(node.id)}
            onDoubleClick={() => open(node.id)}
            onPointerDown={(event) => beginDrag(event, node.id, node.position)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GraphNodeLabel object={node.object} />
          </button>
        ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphZoomControls({ zoom, setZoom, reset }: { zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; reset: () => void }) {
  const change = (delta: number) => setZoom((value) => clampZoom(Number((value + delta).toFixed(2))));
  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-2xl bg-card/78 p-1 text-xs shadow-[0_10px_24px_hsl(var(--shadow-warm)/0.10)] backdrop-blur">
      <button className="rounded-xl px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => change(-0.12)} title="Zoom out">-</button>
      <button className="min-w-12 rounded-xl px-2.5 py-1.5 font-mono text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
      <button className="rounded-xl px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => change(0.12)} title="Zoom in">+</button>
      <button className="rounded-xl px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={reset} title="Reset layout">Reset</button>
    </div>
  );
}

function clampZoom(value: number) {
  return Math.min(1.8, Math.max(0.55, value));
}

function pruneDraggedPositions(nodes: Array<{ id: string }>, setDraggedPositions: React.Dispatch<React.SetStateAction<Record<string, Point>>>) {
  const liveIDs = new Set(nodes.map((node) => node.id));
  setDraggedPositions((positions) => {
    const next = Object.fromEntries(Object.entries(positions).filter(([id]) => liveIDs.has(id)));
    return Object.keys(next).length === Object.keys(positions).length ? positions : next;
  });
}

function ObjectDataTable({ rows, fields, open }: { rows: Record<string, unknown>[]; fields: FieldDef[]; open: (id: string) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const base: ColumnDef<Record<string, unknown>>[] = [
      {
        id: "_select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            aria-label={`Select ${String(row.original.id)}`}
            onClick={(event) => event.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false
      },
      {
        accessorKey: "id",
        header: ({ column }) => <SortableHeader label="id" toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => (
          <button className="font-mono text-xs text-[hsl(var(--earth))] transition hover:text-foreground" onClick={() => open(String(row.original.id))}>
            {String(row.original.id)}
          </button>
        ),
        enableHiding: false
      },
      {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader label="title" toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => (
          <button className="max-w-56 truncate text-left font-medium transition hover:text-[hsl(var(--earth))]" onClick={() => open(String(row.original.id))}>
            {String(row.original.title || row.original.id)}
          </button>
        )
      }
    ];
    const fieldColumns = fields
      .filter((field) => field.name !== "title")
      .map<ColumnDef<Record<string, unknown>>>((field) => ({
        id: field.name,
        accessorFn: (row) => row[field.name],
        header: ({ column }) => <SortableHeader label={field.name} toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => renderTableCell(row.original[field.name], field, open)
      }));
    return [...base, ...fieldColumns];
  }, [fields, open]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } }
  });
  const visibleRows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 46,
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const bottomPadding = virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div className="overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/45 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} rows · {table.getVisibleLeafColumns().length} columns · {Object.keys(rowSelection).length} selected
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground">
              <Columns3 className="size-3.5" /> Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44 rounded-2xl bg-card/95 p-1 shadow-[0_18px_50px_hsl(var(--shadow-warm)/0.18)] backdrop-blur">
            {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}>
                {column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div ref={tableScrollRef} className="max-h-[520px] overflow-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {topPadding > 0 && (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} style={{ height: topPadding }} className="p-0" />
              </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
              const row = visibleRows[virtualRow.index];
              return (
              <TableRow key={row.id} onDoubleClick={() => open(String(row.original.id))}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="max-w-72 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              );
            })}
            {bottomPadding > 0 && (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} style={{ height: bottomPadding }} className="p-0" />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/45 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}</span>
          <Select value={String(table.getState().pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
            <SelectTrigger className="h-8 w-24 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-xl p-2 transition hover:bg-foreground/[0.04] disabled:opacity-35" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} title="First page"><ChevronsLeft className="size-3.5" /></button>
          <button className="rounded-xl p-2 transition hover:bg-foreground/[0.04] disabled:opacity-35" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} title="Previous page"><ChevronLeft className="size-3.5" /></button>
          <button className="rounded-xl p-2 transition hover:bg-foreground/[0.04] disabled:opacity-35" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} title="Next page"><ChevronRight className="size-3.5" /></button>
          <button className="rounded-xl p-2 transition hover:bg-foreground/[0.04] disabled:opacity-35" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} title="Last page"><ChevronsRight className="size-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({ label, toggle }: { label: string; toggle: () => void }) {
  return (
    <button className="inline-flex items-center gap-1.5 transition hover:text-foreground" onClick={toggle}>
      {label}
      <ArrowUpDown className="size-3" />
    </button>
  );
}

function renderTableCell(value: unknown, field: FieldDef, open: (id: string) => void) {
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground">empty</span>;
  if (field.kind === "ref" || field.kind === "ref_list") {
    const refs = Array.isArray(value) ? value : [value];
    return (
      <span className="flex max-w-72 flex-wrap gap-1">
        {refs.map((ref) => (
          <button key={String(ref)} className="glass-light rounded-xl px-2 py-1 font-mono text-xs text-[hsl(var(--earth))] transition hover:bg-card hover:text-foreground" onClick={() => open(String(ref))}>
            {String(ref)}
          </button>
        ))}
      </span>
    );
  }
  if (field.kind === "url") {
    const href = String(value);
    return <a href={href} target="_blank" rel="noreferrer" className="inline-block max-w-64 truncate text-[hsl(var(--earth))] hover:text-foreground">{href}</a>;
  }
  if (Array.isArray(value)) {
    return <span className="flex max-w-72 flex-wrap gap-1">{value.map((item) => <Badge key={String(item)}>{String(item)}</Badge>)}</span>;
  }
  if (field.kind === "enum" || field.kind === "boolean") return <Badge>{String(value)}</Badge>;
  return <span className="inline-block max-w-72 truncate">{String(value)}</span>;
}

function plainCell(v: unknown) {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (v === undefined || v === null || v === "") return "empty";
  return String(v);
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--muted)/0.72)] text-muted-foreground">
        <Activity className="size-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mica rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon && <span className="text-[hsl(var(--earth))]">{icon}</span>}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="soft-row flex justify-between gap-3 py-2.5 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

function LinkRow({ link, open, reverse }: { link: Link; open: (id: string) => void; reverse?: boolean }) {
  const target = reverse ? link.from_id : link.to_id;
  return <div className="soft-row flex items-center justify-between gap-2 py-2.5 text-sm"><span><Badge>{link.kind}</Badge> <span className="ml-1 text-muted-foreground">{link.relation}</span></span><button className="rounded-xl px-2 py-1 font-mono text-xs text-[hsl(var(--earth))] transition hover:bg-foreground/[0.04]" onClick={() => open(target)}>{target}</button></div>;
}

function shortPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

function buildSchemaGraphView(types: TypeDef[], selectedType: string | null) {
  const nodes = graphTypeOrder(types.map((type) => type.id)).map((id) => {
    const type = types.find((item) => item.id === id)!;
    const fields = type.fields ?? [];
    return {
      id,
      type,
      fieldCount: fields.length,
      refCount: fields.filter((field) => Boolean(field.target_type)).length,
      position: schemaNodePosition(id, types)
    };
  });
  const typeIDs = new Set(nodes.map((node) => node.id));
  const edges = compactSchemaEdges(types.flatMap((type) => (type.fields ?? [])
    .filter((field) => field.target_type && typeIDs.has(field.target_type))
    .map((field) => displaySchemaEdge(type.id, field))));
  return {
    nodes,
    edges,
    selectedEdges: selectedType ? edges.filter((edge) => edge.source === selectedType || edge.target === selectedType) : edges,
    nodeMap: new Map(nodes.map((node) => [node.id, node]))
  };
}

function displaySchemaEdge(typeID: string, field: FieldDef): SchemaEdge {
  const target = field.target_type ?? "";
  const edge = { source: typeID, target, relation: field.name, kind: field.kind, required: field.required };
  switch (field.name) {
    case "batch":
      return { ...edge, source: target, target: typeID };
    case "founded_companies":
      return { ...edge, source: target, target: typeID };
    case "owner_company":
    case "owner_person":
      return { ...edge, source: target, target: typeID };
    case "about_company":
    case "about_person":
    case "about_batch":
      return { ...edge, source: target, target: typeID };
    case "from_touchpoint":
      return { ...edge, source: target, target: typeID };
    default:
      return edge;
  }
}

function compactSchemaEdges(edges: SchemaEdge[]) {
  const seen = new Set<string>();
  const result: SchemaEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}\u0000${edge.relation}\u0000${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result.sort((a, b) => {
    const source = graphTypeOrder([a.source, b.source]);
    if (source[0] !== source[1]) return source[0] === a.source ? -1 : 1;
    return a.relation.localeCompare(b.relation);
  });
}

function schemaNodePosition(id: string, types: TypeDef[]) {
  const fallback = graphTypeOrder(types.map((type) => type.id)).indexOf(id);
  const positions: Record<string, { x: number; y: number }> = {
    batch: { x: 70, y: 138 },
    company: { x: 330, y: 92 },
    person: { x: 330, y: 224 },
    touchpoint: { x: 600, y: 154 },
    "source.item": { x: 870, y: 154 }
  };
  return positions[id] ?? { x: 70 + (fallback % 4) * 270, y: 62 + Math.floor(fallback / 4) * 132 };
}

function schemaEdgeColor(edge: SchemaEdge) {
  if (edge.kind === "ref_list") return "hsl(var(--moss) / 0.58)";
  return "hsl(var(--earth) / 0.52)";
}

function buildGraphView(graph: GraphData, mode: string, selectedID: string | null) {
  const visibleEdges = graph.edges.filter((edge) => graphEdgeVisible(edge, mode));
  const visibleNodeIds = new Set<string>();
  for (const edge of visibleEdges) {
    visibleNodeIds.add(edge.from_id);
    visibleNodeIds.add(edge.to_id);
  }
  const nodes = graph.nodes.filter((node) => visibleNodeIds.size === 0 || visibleNodeIds.has(node.id));
  const lanes = graphLanes(nodes);
  const positions = layoutGraphNodes(nodes, visibleEdges);
  return {
    lanes,
    nodes: nodes.map((node) => {
      const selected = node.id === selectedID;
      return {
        id: node.id,
        object: node,
        position: positions[node.id] ?? { x: 0, y: 0 },
        selected,
        style: graphNodeStyle(node.type_id, selected)
      };
    }),
    edges: visibleEdges.map((edge, i) => {
      const display = displayEdge(edge);
      const selectedEdge = selectedID === null || display.source === selectedID || display.target === selectedID;
      return {
      id: String(i),
      source: display.source,
      target: display.target,
      relation: edge.relation,
      selected: selectedEdge,
      color: graphEdgeColor(edge, selectedEdge),
      marker: graphEdgeMarker(edge)
    };
    }),
    nodeMap: new Map(nodes.map((node) => [node.id, { object: node, position: positions[node.id] ?? { x: 0, y: 0 } }]))
  };
}

function displayEdge(edge: Link) {
  switch (edge.relation) {
    case "batch":
      return { source: edge.to_id, target: edge.from_id };
    case "founded_companies":
      return { source: edge.to_id, target: edge.from_id };
    case "owner_company":
    case "about_company":
      return { source: edge.to_id, target: edge.from_id };
    case "about_batch":
      return { source: edge.to_id, target: edge.from_id };
    case "from_touchpoint":
      return { source: edge.to_id, target: edge.from_id };
    default:
      return { source: edge.from_id, target: edge.to_id };
  }
}

function graphEdgeVisible(edge: Link, mode: string) {
  if (mode === "all") return true;
  if (mode === "founders") return edge.relation === "founders" || edge.relation === "founded_companies";
  if (mode === "sources") return ["from_touchpoint", "about_company", "about_batch"].includes(edge.relation);
  return edge.relation !== "founded_companies";
}

function graphLanes(nodes: Obj[]) {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.type_id, (counts.get(node.type_id) ?? 0) + 1);
  return graphTypeOrder([...counts.keys()]).map((type) => ({ type, count: counts.get(type) ?? 0 })).filter((lane) => lane.count > 0);
}

function graphTypeOrder(types: string[]) {
  const order = ["batch", "company", "person", "touchpoint", "source.item"];
  return [...types].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function layoutGraphNodes(nodes: Obj[], edges: Link[]) {
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const companies = nodes.filter((node) => node.type_id === "company").sort(sortObject);
  const companyY = new Map<string, number>();
  companies.forEach((company, i) => companyY.set(company.id, 80 + i * 230));
  const positions: Record<string, { x: number; y: number }> = {};
  companies.forEach((company) => {
    positions[company.id] = { x: 300, y: companyY.get(company.id) ?? 0 };
  });

  const batchNodes = nodes.filter((node) => node.type_id === "batch").sort(sortObject);
  const middleY = companies.length > 0 ? 80 + ((companies.length - 1) * 230) / 2 : 120;
  batchNodes.forEach((node, i) => {
    positions[node.id] = { x: 0, y: middleY + (i - (batchNodes.length - 1) / 2) * 110 };
  });

  const companyGroups = new Map<string, { people: Obj[]; touchpoints: Obj[]; sources: Obj[] }>();
  const ensureGroup = (companyID: string) => {
    if (!companyGroups.has(companyID)) companyGroups.set(companyID, { people: [], touchpoints: [], sources: [] });
    return companyGroups.get(companyID)!;
  };
  for (const edge of edges) {
    if (edge.relation === "founders" && byID.get(edge.from_id)?.type_id === "company") ensurePush(ensureGroup(edge.from_id).people, byID.get(edge.to_id));
    if (edge.relation === "founded_companies" && byID.get(edge.to_id)?.type_id === "company") ensurePush(ensureGroup(edge.to_id).people, byID.get(edge.from_id));
    if (edge.relation === "owner_company" && byID.get(edge.to_id)?.type_id === "company") ensurePush(ensureGroup(edge.to_id).touchpoints, byID.get(edge.from_id));
    if (edge.relation === "about_company" && byID.get(edge.to_id)?.type_id === "company") ensurePush(ensureGroup(edge.to_id).sources, byID.get(edge.from_id));
    if (edge.relation === "from_touchpoint") {
      const touchpointOwner = edges.find((candidate) => candidate.relation === "owner_company" && candidate.from_id === edge.to_id);
      if (touchpointOwner) ensurePush(ensureGroup(touchpointOwner.to_id).sources, byID.get(edge.from_id));
    }
  }

  for (const [companyID, group] of companyGroups) {
    const y = companyY.get(companyID) ?? middleY;
    placeGroup(group.people.sort(sortObject), 640, y, 74, positions);
    placeGroup(group.touchpoints.sort(sortObject), 640, y + 92, 76, positions);
    placeGroup(group.sources.sort(sortObject), 930, y + 92, 76, positions);
  }

  placeRemaining(nodes, positions);
  return positions;
}

function ensurePush(list: Obj[], obj: Obj | undefined) {
  if (!obj || list.some((item) => item.id === obj.id)) return;
  list.push(obj);
}

function placeGroup(nodes: Obj[], x: number, centerY: number, step: number, positions: Record<string, { x: number; y: number }>) {
  nodes.forEach((node, i) => {
    if (positions[node.id]) return;
    positions[node.id] = { x, y: centerY + (i - (nodes.length - 1) / 2) * step };
  });
}

function placeRemaining(nodes: Obj[], positions: Record<string, { x: number; y: number }>) {
  const lanes: Record<string, { x: number; y: number; step: number }> = {
    person: { x: 640, y: 0, step: 86 },
    touchpoint: { x: 640, y: 470, step: 94 },
    "source.item": { x: 930, y: 500, step: 108 }
  };
  const counts = new Map<string, number>();
  for (const node of nodes.filter((item) => !positions[item.id]).sort(sortObject)) {
    const index = counts.get(node.type_id) ?? 0;
    counts.set(node.type_id, index + 1);
    const lane = lanes[node.type_id] ?? { x: 1160, y: 0, step: 100 };
    positions[node.id] = { x: lane.x, y: lane.y + index * lane.step };
  }
}

function sortObject(a: Obj, b: Obj) {
  return (a.title || a.id).localeCompare(b.title || b.id);
}

function graphNodeStyle(type: string, selected: boolean) {
  const accent = graphTypeColor(type);
  return {
    width: 190,
    minHeight: 64,
    borderRadius: 18,
    border: `1px solid ${selected ? accent : "hsl(var(--border) / 0.45)"}`,
    background: selected ? "hsl(var(--card) / 0.98)" : "hsl(var(--card) / 0.84)",
    color: "hsl(var(--foreground))",
    boxShadow: selected ? "0 16px 34px hsl(var(--shadow-warm) / 0.18)" : "0 10px 24px hsl(var(--shadow-warm) / 0.10)",
    fontSize: 12,
    whiteSpace: "pre-line" as const
  };
}

function GraphNodeLabel({ object }: { object: Obj }) {
  return (
    <div className="px-2 py-1.5 text-left">
      <div className="truncate text-xs font-semibold">{object.title || object.id}</div>
      <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{object.type_id}</div>
    </div>
  );
}

function graphTypeColor(type: string) {
  switch (type) {
    case "person":
      return "hsl(var(--moss))";
    case "touchpoint":
    case "source.item":
      return "hsl(var(--clay))";
    case "company":
    case "batch":
    default:
      return "hsl(var(--earth))";
  }
}

function graphCanvasSize(nodes: Array<{ position: { x: number; y: number } }>, zoom = 1) {
  const maxX = Math.max(900, ...nodes.map((node) => node.position.x + 260));
  const maxY = Math.max(640, ...nodes.map((node) => node.position.y + 130));
  return { width: Math.ceil(maxX * zoom), height: Math.ceil(maxY * zoom) };
}

function graphPath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const forward = target.x >= source.x;
  const start = { x: forward ? source.x + 190 : source.x, y: source.y + 32 };
  const end = { x: forward ? target.x : target.x + 190, y: target.y + 32 };
  const distance = Math.max(80, Math.abs(end.x - start.x) * 0.48);
  const c1 = { x: start.x + (forward ? distance : -distance), y: start.y };
  const c2 = { x: end.x - (forward ? distance : -distance), y: end.y };
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8 }
  };
}

function graphEdgeMarker(edge: Link) {
  if (edge.relation === "founders" || edge.relation === "founded_companies") return "graph-arrow-moss";
  if (edge.relation.includes("touchpoint") || edge.relation.startsWith("about_")) return "graph-arrow-clay";
  return "graph-arrow-earth";
}

function graphEdgeColor(edge: Link, selected: boolean) {
  const color = edge.relation === "founders" || edge.relation === "founded_companies"
    ? "hsl(var(--moss) / 0.62)"
    : edge.relation.includes("touchpoint") || edge.relation.startsWith("about_")
      ? "hsl(var(--clay) / 0.66)"
      : "hsl(var(--earth) / 0.48)";
  return selected ? color : "hsl(var(--muted-foreground) / 0.18)";
}

function graphEdgeStyle(edge: Link, selected: boolean) {
  return {
    stroke: graphEdgeColor(edge, selected),
    strokeWidth: selected ? (edge.kind === "body" ? 1.4 : 1.9) : 1.1,
    opacity: selected ? 1 : 0.42
  };
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
