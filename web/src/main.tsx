import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import html2canvas from "html2canvas";
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
import { type ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Activity, ArrowUpDown, Braces, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database, Download, Edit3, Eye, FileImage, FileText, FolderOpen, GitBranch, HeartPulse, History, ImagePlus, Link2, Loader2, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Save, Search, SplitSquareHorizontal, X } from "lucide-react";
import "./styles.css";
import { getCurrentVault, getRecentVaults, run, setCurrentVault, uploadAsset } from "./api";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command";
import { Input } from "./components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
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
type ObjectLinkCandidate = { id: string; title: string; type_id: string };
type ViewID = "objects" | "detail" | "types" | "graph" | "health" | "vi";
type RouteSearch = { view: ViewID; vault?: string; type?: string; filter?: string; object?: string; graphMode?: string; graphHiddenTypes?: string; section?: string; frame?: string; shot?: string };
type VaultUIState = { view: ViewID; type?: string; filter?: string; object?: string; graphMode?: string; graphHiddenTypes?: string };
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
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "kbd", "sub", "sup", "ins", "mark", "figure", "figcaption"],
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

const viSections = [
  "foundations",
  "controls",
  "object",
  "body-editor",
  "markdown",
  "data",
  "graph",
  "states"
] as const;

type VISectionID = typeof viSections[number];

function normalizeVISection(section: unknown): VISectionID {
  return viSections.includes(section as VISectionID) ? section as VISectionID : "foundations";
}

function viewIsShot(search: RouteSearch) {
  return search.frame === "shot" || search.shot === "1" || search.shot === "true";
}

const rootRoute = createRootRoute({
  component: RootRoute
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): RouteSearch => ({
    view: normalizeView(search.view),
    vault: typeof search.vault === "string" ? search.vault : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
    object: typeof search.object === "string" ? search.object : undefined,
    graphMode: typeof search.graphMode === "string" ? search.graphMode : undefined,
    graphHiddenTypes: typeof search.graphHiddenTypes === "string" ? search.graphHiddenTypes : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
    frame: typeof search.frame === "string" ? search.frame : undefined,
    shot: typeof search.shot === "string" ? search.shot : undefined
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
  return view === "detail" || view === "types" || view === "graph" || view === "health" || view === "vi" ? view : "objects";
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

function parseGraphHiddenTypes(value: unknown): Set<string> {
  if (typeof value !== "string" || !value.trim()) return new Set();
  return new Set(value.split(",").map((item) => {
    try {
      return decodeURIComponent(item.trim());
    } catch {
      return item.trim();
    }
  }).filter(Boolean));
}

function serializeGraphHiddenTypes(types: Set<string>) {
  return [...types].sort().map((type) => encodeURIComponent(type)).join(",");
}

function safeFileName(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "object";
}

function downloadDataURL(dataURL: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: number | undefined;
  const timer = new Promise<never>((_resolve, reject) => {
    timeout = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout !== undefined) window.clearTimeout(timeout);
  });
}

function objectImageScale(width: number, height: number) {
  const deviceScale = Math.min(2, window.devicePixelRatio || 1);
  const maxEdge = 32000;
  const maxArea = 240_000_000;
  const edgeScale = maxEdge / Math.max(width, height, 1);
  const areaScale = Math.sqrt(maxArea / Math.max(width * height, 1));
  return Math.max(0.1, Math.min(deviceScale, edgeScale, areaScale));
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
      saveObjectImage: () => Promise<{ filename: string }>;
      state: () => AutomationSnapshot;
    };
  }
}

function App() {
  const routeSearch = indexRoute.useSearch();
  const navigate = useNavigate({ from: "/" });
  const queryClient = useQueryClient();
  const objectExportRef = useRef<HTMLDivElement | null>(null);
  const initialVault = routeSearch.vault?.trim() || getCurrentVault();
  const viSection = normalizeVISection(routeSearch.section);
  const viShot = viewIsShot(routeSearch);
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
  const [hiddenGraphTypes, setHiddenGraphTypesState] = useState(() => parseGraphHiddenTypes(routeSearch.graphHiddenTypes));
  const [graphLayoutSeed, setGraphLayoutSeed] = useState(0);
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<string | null>(null);
  const [filter, setFilterState] = useState(routeSearch.filter ?? "");
  const [vault, setVault] = useState(initialVault);
  const [vaultDraft, setVaultDraft] = useState(initialVault);
  const [recentVaults, setRecentVaults] = useState(getRecentVaults());
  const [vaultOK, setVaultOK] = useState<boolean | null>(null);
  const [savingObjectImage, setSavingObjectImage] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  function updateSearch(next: Partial<RouteSearch>, options: { replace?: boolean } = {}) {
    void navigate({
      search: (prev) => {
        const current = prev as Partial<RouteSearch>;
        const nextView = next.view ?? current.view ?? routeSearch.view ?? view;
        if (nextView === "vi") {
          const hasSection = Object.prototype.hasOwnProperty.call(next, "section");
          const hasFrame = Object.prototype.hasOwnProperty.call(next, "frame");
          const hasShot = Object.prototype.hasOwnProperty.call(next, "shot");
          return {
            view: "vi",
            section: hasSection ? next.section : current.section ?? routeSearch.section,
            frame: hasFrame ? next.frame : current.frame ?? routeSearch.frame,
            shot: hasShot ? next.shot : current.shot ?? routeSearch.shot
          };
        }
        const merged = {
          ...current,
          ...next
        };
        delete merged.section;
        delete merged.frame;
        delete merged.shot;
        return {
          ...merged
        };
      },
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

  function setGraphHiddenTypes(next: Set<string>, options: { replace?: boolean } = {}) {
    const serialized = serializeGraphHiddenTypes(next);
    setHiddenGraphTypesState(next);
    updateSearch({ view: "graph", graphHiddenTypes: serialized || undefined }, options);
  }

  function toggleGraphType(type: string) {
    const next = new Set(hiddenGraphTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setGraphHiddenTypes(next);
  }

  function showAllGraphTypes() {
    setGraphHiddenTypes(new Set());
  }

  function relayoutGraph() {
    setGraphLayoutSeed((seed) => seed + 1);
  }

  function cachedRun<T>(argv: string[], vaultOverride = vault) {
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
      updateSearch({ view: "graph", graphMode, graphHiddenTypes: serializeGraphHiddenTypes(hiddenGraphTypes) || undefined });
    }
    return nextGraph;
  }

  async function saveObjectImage(): Promise<{ filename: string }> {
    if (!activeObject || !objectExportRef.current) {
      throw new Error("No active object page to save");
    }
    const node = objectExportRef.current;
    const filename = `${safeFileName(activeObject.id || activeObject.title || "object")}.png`;
    setSavingObjectImage(true);
    try {
      await withTimeout(waitForImages(node), 8000, "Image loading");
      const width = Math.ceil(Math.max(node.scrollWidth, node.getBoundingClientRect().width));
      const height = Math.ceil(node.scrollHeight);
      const scale = objectImageScale(width, height);
      const canvas = await withTimeout(html2canvas(node, {
        backgroundColor: "hsl(48 33% 97%)",
        scale,
        useCORS: true,
        allowTaint: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        onclone: (_document, clonedElement) => {
          const el = clonedElement as HTMLElement;
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
          el.style.overflow = "visible";
          el.style.maxHeight = "none";
        }
      }), 20000, "Image export");
      const dataURL = canvas.toDataURL("image/png");
      downloadDataURL(dataURL, filename);
      toast.success(`Saved ${filename}`);
      return { filename };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Could not save image: ${message}`);
      throw error;
    } finally {
      setSavingObjectImage(false);
    }
  }

  async function saveObjectBody(objectID: string, markdown: string): Promise<ObjectLoadResult | null> {
    const result = await run<{ object: string; body_abs_path: string; bytes: number }>(["body", "write", objectID, "--stdin"], vault, { stdin: markdown });
    if (!result.ok) {
      throw new Error(result.error?.message || "Could not save body");
    }
    await queryClient.invalidateQueries();
    const data = await openObject(objectID, { syncURL: false });
    if (activeType) {
      await loadRows(activeType, filter);
    }
    if (view === "graph") {
      await openGraph({ syncURL: false });
    }
    return data;
  }

  const activeFields = useMemo(() => types.find((t) => t.id === activeType)?.fields ?? [], [types, activeType]);
  const schemaGraphView = useMemo(() => buildSchemaGraphView(types, selectedSchemaType), [types, selectedSchemaType]);
  const graphView = useMemo(() => buildGraphView(graph, graphMode, selectedGraphNode, hiddenGraphTypes, graphLayoutSeed), [graph, graphMode, selectedGraphNode, hiddenGraphTypes, graphLayoutSeed]);
  const graphTypeControls = useMemo(() => buildGraphTypeControls(graph, graphMode, hiddenGraphTypes), [graph, graphMode, hiddenGraphTypes]);
  const objectLinkCandidates = useMemo(() => buildObjectLinkCandidates(activeObject, activeType, rows, graph.nodes), [activeObject, activeType, rows, graph.nodes]);
  const selectedGraphObject = useMemo(() => graph.nodes.find((n) => n.id === selectedGraphNode) ?? null, [graph.nodes, selectedGraphNode]);
  const graphLayoutKey = useMemo(() => `${graphMode}:${serializeGraphHiddenTypes(hiddenGraphTypes)}:${graphLayoutSeed}`, [graphMode, hiddenGraphTypes, graphLayoutSeed]);
  const currentVaultState = useMemo<VaultUIState>(() => ({
    view,
    type: activeType || undefined,
    filter: filter || undefined,
    object: view === "detail" ? activeObject?.id : undefined,
    graphMode,
    graphHiddenTypes: serializeGraphHiddenTypes(hiddenGraphTypes) || undefined
  }), [view, activeType, filter, activeObject?.id, graphMode, hiddenGraphTypes]);

  useEffect(() => {
    const nextView = routeSearch.view;
    const nextType = routeSearch.type ?? "";
    const nextFilter = routeSearch.filter ?? "";
    const nextGraphMode = routeSearch.graphMode ?? "core";
    const nextHiddenGraphTypes = parseGraphHiddenTypes(routeSearch.graphHiddenTypes);
    if (nextView !== view) setViewState(nextView);
    if (nextType !== activeType) setActiveTypeState(nextType);
    if (nextFilter !== filter) setFilterState(nextFilter);
    if (nextGraphMode !== graphMode) setGraphModeState(nextGraphMode);
    if (serializeGraphHiddenTypes(nextHiddenGraphTypes) !== serializeGraphHiddenTypes(hiddenGraphTypes)) {
      setHiddenGraphTypesState(nextHiddenGraphTypes);
    }
    if (nextView === "detail" && routeSearch.object && routeSearch.object !== activeObject?.id) {
      void openObject(routeSearch.object, { syncURL: false });
    }
    if (nextView === "graph" && graph.nodes.length === 0) {
      void openGraph({ syncURL: false });
    }
  }, [routeSearch.view, routeSearch.type, routeSearch.filter, routeSearch.object, routeSearch.graphMode, routeSearch.graphHiddenTypes, hiddenGraphTypes]);

  useEffect(() => {
    if (selectedGraphNode && !graphView.nodes.some((node) => node.id === selectedGraphNode)) {
      setSelectedGraphNode(null);
    }
  }, [selectedGraphNode, graphView.nodes]);

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
    const nextHiddenGraphTypes = parseGraphHiddenTypes(saved?.graphHiddenTypes);
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
    setHiddenGraphTypesState(nextHiddenGraphTypes);
    setViewState(nextView === "detail" ? "objects" : nextView);
    updateSearch({ vault: nextPath, view: nextView === "detail" ? "objects" : nextView, type: nextType || undefined, filter: nextFilter || undefined, object: undefined, graphMode: nextGraphMode, graphHiddenTypes: serializeGraphHiddenTypes(nextHiddenGraphTypes) || undefined }, { replace: true });
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

    const runAndSync = async <T,>(argv: string[], vaultOverride = vault, options: { stdin?: string } = {}) => {
      const result = await run<T>(argv, vaultOverride, options);
      const changedObject = result.effects?.find((effect) => effect.object && (effect.kind === "body.refresh" || effect.kind === "body.write" || effect.kind === "body.append"))?.object;
      if (result.ok && changedObject) {
        await queryClient.invalidateQueries();
        await openObject(changedObject);
      }
      return result;
    };

    window.mbase = {
      run: runAndSync,
      getVault: () => vault,
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
      saveObjectImage,
      state: () => currentState()
    };
    return () => {
      delete window.mbase;
    };
  }, [view, vault, vaultOK, activeType, activeObject, activeBody, types, rows, links, backlinks, issues, graph, filter]);

  const viMode = view === "vi";
  const shotMode = viMode && viShot;

  return (
    <div className={`app-shell flex h-screen w-screen overflow-hidden text-foreground ${viMode ? "vi-standalone-shell" : ""}`}>
      {!viMode && <aside className={`${sidebarCollapsed ? "w-12 px-2" : "w-60 px-3"} flex h-screen shrink-0 flex-col overflow-hidden py-4 transition-[width,padding] duration-200`}>
        <div className={`mb-5 flex items-center px-1 ${sidebarCollapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-foreground font-serif text-[17px] font-medium italic text-background">m</div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-medium tracking-tight text-foreground/90">mbase</div>
              <div className="text-[10.5px] text-muted-foreground">Local knowledge workbench</div>
            </div>
          )}
        </div>

        <nav className="space-y-0.5">
          <NavItem collapsed={sidebarCollapsed} icon={<Database className="size-3.5" />} label="Objects" active={view === "objects" || view === "detail"} onClick={() => setView("objects")} />
          <NavItem collapsed={sidebarCollapsed} icon={<Braces className="size-3.5" />} label="Schema" active={view === "types"} onClick={() => setView("types")} />
          <NavItem collapsed={sidebarCollapsed} icon={<Network className="size-3.5" />} label="Graph" active={view === "graph"} onClick={() => void openGraph()} />
          <NavItem collapsed={sidebarCollapsed} icon={<HeartPulse className="size-3.5" />} label="Health" active={view === "health"} onClick={() => setView("health")} />
        </nav>

        {!sidebarCollapsed && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <Separator className="mb-3 bg-border/45" />
            <div className="flex items-center justify-between px-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Types</span>
              <span className="font-mono text-[10px] text-muted-foreground/65">{types.length}</span>
            </div>
            <ScrollArea className="mt-2 min-h-0 flex-1 pr-1.5">
              <div className="space-y-0.5">
                {types.map((t) => (
                  <button key={t.id} onClick={() => setActiveType(t.id)} className={`sidebar-type-row ${activeType === t.id ? "sidebar-type-row-active" : ""}`}>
                    <span className="truncate">{t.id}</span>
                    <span className="font-mono text-[11px] opacity-60">{t.fields?.length ?? 0}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="mt-auto space-y-2.5 pt-3">
          {!sidebarCollapsed && (
            <>
              <div className="sidebar-tool-card text-[11px] text-muted-foreground">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground/70"><Play className="size-3 text-[hsl(var(--earth))]" /> Agent API</div>
                <code className="font-mono">window.mbase.state()</code>
              </div>
              <VaultSwitcher
                vault={vault}
                draft={vaultDraft}
                setDraft={setVaultDraft}
                recentVaults={recentVaults}
                vaultOK={vaultOK}
                openVault={(path) => void openVaultPath(path)}
              />
            </>
          )}
          <button className={`sidebar-collapse ${sidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2"}`} onClick={toggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
            {!sidebarCollapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>}

      <main className={`${viMode ? "vi-standalone-main" : "console-inset my-3 mr-3"} min-w-0 flex-1 overflow-hidden`}>
        {!viMode && <div className="console-topbar">
          <BreadcrumbTrail view={view} activeType={activeType} activeObject={activeObject} />
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${vaultOK ? "text-[hsl(var(--moss))]" : "text-[hsl(var(--clay))]"}`}>
              <span className={`size-1.5 rounded-full ${vaultOK ? "bg-[hsl(var(--moss))]" : "bg-[hsl(var(--clay))]"}`} />
              {vaultOK ? "vault ready" : "vault missing"}
            </span>
          </div>
        </div>}
        <div className="mb-scroll min-h-0 flex-1 overflow-auto">
        {view === "objects" && (
          <section className="mx-auto flex h-full w-full max-w-[1100px] flex-col px-7 py-6">
            <div className="mb-5 flex items-baseline gap-3">
              <h1 className="font-serif text-3xl font-medium leading-none tracking-tight">{activeType || "Objects"}</h1>
              <span className="font-mono text-xs text-muted-foreground">{rows.length} objects</span>
            </div>
            <div className="objects-workspace">
              <Tabs defaultValue="table" className="flex h-full min-h-0 flex-col">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <TabsList className="rounded-lg bg-muted/35">
                    <TabsTrigger value="table" className="rounded-md">Table</TabsTrigger>
                    <TabsTrigger value="api" className="rounded-md">API</TabsTrigger>
                  </TabsList>
                  <div className="relative w-80 max-w-[45%]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="where, e.g. judged=keep" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 w-full rounded-md bg-background/68 pl-9 font-mono text-xs" />
                  </div>
                </div>
                <TabsContent value="table" className="mt-0 min-h-0 flex-1">
                    {rows.length === 0 ? (
                      <EmptyState title="No objects" description="Create objects from the CLI or switch to another type." />
                    ) : (
                      <ObjectDataTable rows={rows} fields={activeFields} activeType={activeType} open={(id) => void openObject(id)} />
                    )}
                </TabsContent>
                <TabsContent value="api" className="mt-0 min-h-0 flex-1 rounded-lg bg-muted/30">
                  <pre className="overflow-x-auto p-4 font-mono text-xs text-muted-foreground">POST /api/run {"{\"argv\":[\"query\",\"" + (activeType || "type") + "\",\"--limit\",\"200\"],\"vault\":\"" + (vault || "default") + "\"}"}</pre>
                </TabsContent>
              </Tabs>
            </div>
          </section>
        )}

        {view === "detail" && activeObject && (
          <section className="detail-stage relative h-full overflow-hidden px-6 py-5">
            <article className={`object-reader mb-scroll h-full overflow-auto px-8 py-8 ${inspectorOpen ? "object-reader-with-inspector" : ""}`}>
              <div className="body-object-column mx-auto max-w-[760px]">
                <ObjectBodyWorkspace
                  object={activeObject}
                  body={activeBody}
                  vault={vault}
                  candidates={objectLinkCandidates}
                  openObject={(id) => void openObject(id)}
                  saveBody={saveObjectBody}
                  onBeginEdit={() => setInspectorOpen(false)}
                />
              </div>
            </article>

            <div className="object-export-host" aria-hidden="true">
              <article ref={objectExportRef} className="object-export-page">
                <ObjectPageContent object={activeObject} body={activeBody} vault={vault} openObject={() => undefined} imageLoading="eager" />
              </article>
            </div>

            <button
              className={`inspector-toggle ${inspectorOpen ? "right-[414px] text-[hsl(var(--earth))]" : "right-10 text-muted-foreground"}`}
              onClick={() => setInspectorOpen((open) => !open)}
              title={inspectorOpen ? "Hide inspector" : "Show inspector"}
            >
              {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              <span>{inspectorOpen ? "Hide" : "Inspector"}</span>
            </button>

            <aside className={`object-inspector mb-scroll ${inspectorOpen ? "translate-x-0 opacity-100" : "translate-x-[420px] opacity-0"}`}>
              <div className="inspector-header">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Inspector</div>
                  <div className="mt-1 truncate text-sm font-semibold">{activeObject.title || activeObject.id}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{activeObject.id}</div>
                </div>
                <button className="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => setInspectorOpen(false)} title="Hide inspector">
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <Panel title="Actions" icon={<Download className="size-4" />}>
                <Button className="w-full justify-start rounded-md" variant="secondary" disabled={savingObjectImage} onClick={() => void saveObjectImage()}>
                  <Download className="size-4" />
                  {savingObjectImage ? "Saving image" : "Save as PNG"}
                </Button>
              </Panel>
              <Panel title="Body" icon={<FileText className="size-4" />}>
                <div className="tray break-all rounded-md p-2.5 font-mono text-xs text-muted-foreground">{activeObject.body_abs_path || activeObject.body_path}</div>
              </Panel>
              <Panel title="Fields" icon={<Braces className="size-4" />}>{Object.entries(activeObject.fields ?? {}).map(([k, v]) => <KV key={k} k={k} v={renderCell(v)} />)}</Panel>
              <Panel title="Field Links" icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "field").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
              <Panel title="Body Links" icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "body").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
              <Panel title="Backlinks" icon={<Network className="size-4" />}>{backlinks.map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} reverse />)}</Panel>
            </aside>
          </section>
        )}

        {view === "types" && (
          <section className="mx-auto max-w-[1100px] px-7 py-6">
            <Header eyebrow="Schema Studio" title="Types and fields" description="Dynamic schema for object projections, field links, and local validation." />
            <div className="content-panel mb-7 overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium"><Network className="size-4 text-[hsl(var(--earth))]" /> Schema graph</div>
                  <div className="mt-1 text-sm text-muted-foreground">{schemaGraphView.nodes.length} types, {schemaGraphView.edges.length} reference fields</div>
                </div>
                <button className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => setSelectedSchemaType(null)}>Clear</button>
              </div>
              <div className="schema-graph-surface h-[390px] border-t border-border/25">
                <SchemaGraphCanvas graphView={schemaGraphView} selectedType={selectedSchemaType} select={setSelectedSchemaType} />
              </div>
            </div>
            <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
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
            <div className="tray mt-7 rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Play className="size-4 text-[hsl(var(--earth))]" /> Run console</div>
              <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">POST /api/run {"{\"argv\":[\"type\",\"list\"],\"vault\":\"" + (vault || "default") + "\"}"}</pre>
            </div>
          </section>
        )}

        {view === "graph" && (
          <section className="mx-auto h-full max-w-7xl px-6 py-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <Header
                eyebrow="Link Map"
                title="Object graph"
                description={`${graphView.nodes.length} visible nodes, ${graphView.edges.length} visible links${hiddenGraphTypes.size ? `, ${hiddenGraphTypes.size} type${hiddenGraphTypes.size > 1 ? "s" : ""} hidden` : ""}`}
              />
              <Tabs value={graphMode} onValueChange={setGraphMode}>
                <TabsList className="acrylic rounded-lg">
                  <TabsTrigger value="core" className="rounded-md text-xs">Core</TabsTrigger>
                  <TabsTrigger value="all" className="rounded-md text-xs">All</TabsTrigger>
                  <TabsTrigger value="founders" className="rounded-md text-xs">Founders</TabsTrigger>
                  <TabsTrigger value="sources" className="rounded-md text-xs">Sources</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="grid h-[calc(100%-6rem)] grid-cols-[minmax(0,1fr)_280px] gap-4">
              <div className="graph-surface relative overflow-hidden">
                <div className="absolute left-5 top-5 z-30 flex max-w-[calc(100%-220px)] flex-wrap gap-2">
                  {graphTypeControls.map((lane) => (
                    <button
                      key={lane.type}
                      type="button"
                      className={`graph-type-chip ${lane.hidden ? "graph-type-chip-hidden" : ""}`}
                      onClick={() => toggleGraphType(lane.type)}
                      title={lane.hidden ? `Show ${lane.type}` : `Hide ${lane.type}`}
                    >
                      <span className="graph-type-dot" style={{ background: graphTypeColor(lane.type) }} />
                      <span>{lane.type}</span>
                      <span className="font-mono opacity-60">{lane.count}</span>
                    </button>
                  ))}
                </div>
                <GraphCanvas graphView={graphView} selectedID={selectedGraphNode} select={setSelectedGraphNode} open={(id) => void openObject(id)} layoutKey={graphLayoutKey} relayout={relayoutGraph} />
              </div>
              <aside className="space-y-4">
                <Panel title="Visible Types" icon={<Braces className="size-4" />}>
                  <div className="space-y-2">
                    {graphTypeControls.map((lane) => (
                      <button
                        key={lane.type}
                        type="button"
                        className={`graph-type-row ${lane.hidden ? "graph-type-row-hidden" : ""}`}
                        onClick={() => toggleGraphType(lane.type)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="graph-type-dot" style={{ background: graphTypeColor(lane.type) }} />
                          <span className="truncate">{lane.type}</span>
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{lane.hidden ? "hidden" : lane.count}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-md px-2.5 py-1.5 text-xs text-[hsl(var(--earth))] transition hover:bg-foreground/[0.04] disabled:text-muted-foreground/45"
                    onClick={showAllGraphTypes}
                    disabled={hiddenGraphTypes.size === 0}
                  >
                    Show all types
                  </button>
                </Panel>
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
          <section className="mx-auto max-w-5xl px-7 py-6">
            <Header eyebrow="Health" title="Vault integrity" description="Local validation and body/link diagnostics." />
            <div className="content-panel p-4">
              {issues.length === 0 ? <EmptyState title="No issues" description="The current vault is clean." /> : issues.map((issue, i) => <pre key={i} className="tray mb-3 overflow-x-auto rounded-2xl p-3 font-mono text-xs text-muted-foreground last:mb-0">{JSON.stringify(issue, null, 2)}</pre>)}
            </div>
          </section>
        )}

        {view === "vi" && (
          <VisualInventoryPage
            section={viSection}
            shot={viShot}
            setSection={(section) => updateSearch({ view: "vi", section }, { replace: true })}
            setShot={(enabled) => updateSearch({ view: "vi", section: viSection, frame: enabled ? "shot" : undefined, shot: undefined }, { replace: true })}
          />
        )}
        </div>
      </main>
    </div>
  );
}

function VisualInventoryPage({ section, shot, setSection, setShot }: { section: VISectionID; shot: boolean; setSection: (section: VISectionID) => void; setShot: (enabled: boolean) => void }) {
  return (
    <section className={`vi-page ${shot ? "vi-page-shot" : ""}`}>
      <div className="vi-canvas">
        <div className="vi-header">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Visual Inventory</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">{viSectionTitle(section)}</h1>
          </div>
          {!shot && (
            <Button variant="secondary" className="h-8 rounded-md" onClick={() => setShot(true)}>
              <Download className="size-3.5" />
              Shot mode
            </Button>
          )}
          {shot && (
            <Button variant="secondary" className="h-8 rounded-md" onClick={() => setShot(false)}>
              <PanelLeftOpen className="size-3.5" />
              Full UI
            </Button>
          )}
        </div>
        <div className="vi-layout">
          {!shot && (
            <aside className="vi-section-nav">
              {viSections.map((item) => (
                <button key={item} className={`vi-section-button ${item === section ? "vi-section-button-active" : ""}`} onClick={() => setSection(item)}>
                  {viSectionTitle(item)}
                </button>
              ))}
            </aside>
          )}
          <div className="vi-section-stage">
            {section === "foundations" && <VIFoundations />}
            {section === "controls" && <VIControls />}
            {section === "object" && <VIObject />}
            {section === "body-editor" && <VIBodyEditor />}
            {section === "markdown" && <VIMarkdown />}
            {section === "data" && <VIData />}
            {section === "graph" && <VIGraph />}
            {section === "states" && <VIStates />}
          </div>
        </div>
      </div>
    </section>
  );
}

function viSectionTitle(section: VISectionID) {
  return section.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function VIBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vi-block">
      <div className="vi-block-title">{title}</div>
      <div className="vi-block-body">{children}</div>
    </section>
  );
}

function VIFoundations() {
  return (
    <div className="vi-grid">
      <VIBlock title="Palette">
        <div className="grid grid-cols-4 gap-3">
          {[
            ["foreground", "hsl(var(--foreground))"],
            ["earth", "hsl(var(--earth))"],
            ["moss", "hsl(var(--moss))"],
            ["clay", "hsl(var(--clay))"],
            ["card", "hsl(var(--card))"],
            ["surface", "hsl(var(--surface))"],
            ["muted", "hsl(var(--muted))"],
            ["border", "hsl(var(--border))"]
          ].map(([name, color]) => (
            <div key={name} className="space-y-2">
              <div className="h-10 rounded-md border border-border/40" style={{ background: color }} />
              <div className="font-mono text-[11px] text-muted-foreground">{name}</div>
            </div>
          ))}
        </div>
      </VIBlock>
      <VIBlock title="Typography">
        <div className="space-y-3">
          <h2 className="font-serif text-4xl font-medium tracking-tight">Editorial title</h2>
          <div className="text-sm text-foreground/82">Interface body text keeps the product quiet, readable, and useful for repeated work.</div>
          <code className="font-mono text-xs text-muted-foreground">note.lightsprint.product-takeaway</code>
        </div>
      </VIBlock>
      <VIBlock title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>company</Badge>
          <Badge>source.item</Badge>
          <Badge>resolved</Badge>
          <Badge>active</Badge>
        </div>
      </VIBlock>
    </div>
  );
}

function VIControls() {
  return (
    <div className="vi-grid">
      <VIBlock title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-md"><Save className="size-4" />Save</Button>
          <Button variant="secondary" className="rounded-md"><Download className="size-4" />Export</Button>
          <Button variant="ghost" className="rounded-md"><Link2 className="size-4" />Link</Button>
          <Button className="rounded-md" disabled><Loader2 className="size-4 animate-spin" />Saving</Button>
        </div>
      </VIBlock>
      <VIBlock title="Inputs">
        <div className="grid max-w-xl gap-3">
          <Input placeholder="where, e.g. status=active" className="h-9 rounded-md bg-background/68 font-mono text-xs" />
          <Select defaultValue="split">
            <SelectTrigger className="h-9 w-40 rounded-md"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="write">Write</SelectItem>
              <SelectItem value="split">Split</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </VIBlock>
      <VIBlock title="Command Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" className="rounded-md"><Search className="size-4" />Open command</Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 rounded-2xl p-0">
            <Command>
              <CommandInput placeholder="Search objects..." />
              <CommandList>
                <CommandGroup heading="Objects">
                  <CommandItem>Lightsprint <span className="ml-auto font-mono text-[10px] text-muted-foreground">company</span></CommandItem>
                  <CommandItem>YC Launch <span className="ml-auto font-mono text-[10px] text-muted-foreground">source.item</span></CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </VIBlock>
      <VIBlock title="Tabs">
        <Tabs defaultValue="table" className="w-full max-w-md">
          <TabsList className="rounded-lg bg-muted/35">
            <TabsTrigger value="table" className="rounded-md">Table</TabsTrigger>
            <TabsTrigger value="api" className="rounded-md">API</TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="mt-3 text-sm text-muted-foreground">Table view state.</TabsContent>
          <TabsContent value="api" className="mt-3 text-sm text-muted-foreground">API view state.</TabsContent>
        </Tabs>
      </VIBlock>
    </div>
  );
}

function VIObject() {
  const object = viObject();
  return (
    <div className="vi-grid">
      <VIBlock title="Object Header">
        <ObjectPageContent object={object} body={"# Lightsprint\n\nA focused product profile with [[source.yc-launch.lightsprint]]."} vault="" openObject={() => undefined} />
      </VIBlock>
      <VIBlock title="Inspector Blocks">
        <Panel title="Fields" icon={<Braces className="size-4" />}>
          <KV k="status" v={<Badge>active</Badge>} />
          <KV k="tags" v={<span className="flex flex-wrap gap-1"><Badge>agentic-sdlc</Badge><Badge>demo-led</Badge></span>} />
        </Panel>
        <Panel title="Body Links" icon={<GitBranch className="size-4" />}>
          <LinkRow link={{ from_id: "company.lightsprint", to_id: "source.yc-launch.lightsprint", kind: "body", relation: "mentions", text: "YC Launch", resolved: true }} open={() => undefined} />
        </Panel>
      </VIBlock>
      <VIBlock title="Object ID">
        <ObjectIDCell id="social.post.wechat.yan5xu.0D6fd1etd-launch" activeType="social.post" open={() => undefined} />
      </VIBlock>
    </div>
  );
}

function VIBodyEditor() {
  const object = viObject();
  return (
    <div className="vi-wide">
      <ObjectBodyWorkspace
        object={object}
        body={viMarkdownBody()}
        vault=""
        candidates={[{ id: "source.yc-launch.lightsprint", title: "YC Launch", type_id: "source.item" }, { id: "concept.agentic-sdlc", title: "Agentic SDLC", type_id: "concept" }]}
        openObject={() => undefined}
        saveBody={async () => null}
        initialEditing
      />
    </div>
  );
}

function VIMarkdown() {
  return (
    <div className="vi-reader markdown">
      <MarkdownBody body={viMarkdownBody()} object={viObject()} vault="" openObject={() => undefined} />
    </div>
  );
}

function VIData() {
  const fields: FieldDef[] = [
    { name: "status", kind: "enum" },
    { name: "url", kind: "url" },
    { name: "about_company", kind: "ref", target_type: "company" }
  ];
  const rows = [
    { id: "source.yc-launch.lightsprint", title: "YC Launch", status: "parsed", url: "https://www.ycombinator.com/launches", about_company: "company.lightsprint" },
    { id: "source.docs.lightsprint", title: "Docs snapshot", status: "linked", url: "https://lightsprint.com/docs", about_company: "company.lightsprint" }
  ];
  return (
    <div className="vi-grid">
      <VIBlock title="Object Table">
        <div className="vi-table-frame">
          <ObjectDataTable rows={rows} fields={fields} activeType="source.item" open={() => undefined} />
        </div>
      </VIBlock>
      <VIBlock title="Empty State">
        <EmptyState title="No objects" description="Create objects from the CLI or switch to another type." />
      </VIBlock>
    </div>
  );
}

function VIGraph() {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="vi-grid">
      <VIBlock title="Type Chips">
        <div className="flex flex-wrap gap-2">
          {["company", "source.item", "note", "concept"].map((type) => (
            <button key={type} className="graph-type-chip">
              <span className="graph-type-dot" style={{ background: graphTypeColor(type) }} />
              <span>{type}</span>
              <span className="font-mono opacity-60">4</span>
            </button>
          ))}
        </div>
      </VIBlock>
      <VIBlock title="Node Labels">
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/45 bg-card/90 px-2 py-2"><GraphNodeLabel object={viObject()} /></div>
          <div className="rounded-xl border border-border/45 bg-card/90 px-2 py-2 opacity-40"><GraphNodeLabel object={{ ...viObject(), id: "note.lightsprint-gtm", type_id: "note", title: "GTM takeaway" }} /></div>
        </div>
      </VIBlock>
      <VIBlock title="Zoom Controls">
        <div className="relative h-20 rounded-lg border border-border/35 bg-card/40">
          <GraphZoomControls zoom={zoom} setZoom={setZoom} reset={() => setZoom(1)} />
        </div>
      </VIBlock>
    </div>
  );
}

function VIStates() {
  return (
    <div className="vi-grid">
      <VIBlock title="Save States">
        <div className="flex flex-wrap gap-4">
          <span className="body-save-state">Saved</span>
          <span className="body-save-state body-save-state-dirty">Unsaved changes</span>
          <span className="body-save-state"><Loader2 className="size-3.5 animate-spin" />Saving...</span>
        </div>
      </VIBlock>
      <VIBlock title="Vault Status">
        <div className="flex flex-wrap gap-2">
          <span className="vault-status-chip vault-status-ready">ready</span>
          <span className="vault-status-chip vault-status-missing">missing</span>
        </div>
      </VIBlock>
      <VIBlock title="Graph Visibility">
        <button className="graph-type-chip graph-type-chip-hidden">
          <span className="graph-type-dot" style={{ background: graphTypeColor("note") }} />
          <span>note</span>
          <span className="font-mono opacity-60">hidden</span>
        </button>
      </VIBlock>
    </div>
  );
}

function viObject(): Obj {
  return {
    id: "company.lightsprint",
    type_id: "company",
    title: "Lightsprint",
    body_path: "bodies/company.lightsprint.md",
    body_abs_path: "/tmp/mbase-yc-model/bodies/company.lightsprint.md",
    fields: { status: "active", tags: ["agentic-sdlc", "demo-led"], homepage_url: "https://lightsprint.com" }
  };
}

function viMarkdownBody() {
  return `# Lightsprint

Lightsprint is a concise sample profile linked to [[source.yc-launch.lightsprint]] and [[concept.agentic-sdlc]].

## Evidence

- [Website](https://lightsprint.com)
- [x] YC launch captured

> [!NOTE]
> Keep source evidence separate from human judgement.

| Signal | Reading |
| --- | --- |
| Launch | Strong developer demo |
| Motion | Product-led |

\`\`\`ts
const relation = "supports";
\`\`\`
`;
}

function renderCell(v: unknown) {
  if (Array.isArray(v)) return <span className="flex flex-wrap gap-1">{v.map((x) => <Badge key={String(x)}>{String(x)}</Badge>)}</span>;
  if (v === undefined || v === null || v === "") return <span className="text-muted-foreground">—</span>;
  return String(v);
}

function buildObjectLinkCandidates(activeObject: Obj | null, activeType: string, rows: Record<string, unknown>[], graphNodes: Obj[]): ObjectLinkCandidate[] {
  const seen = new Set<string>();
  const out: ObjectLinkCandidate[] = [];
  const add = (candidate: ObjectLinkCandidate) => {
    if (!candidate.id || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    out.push(candidate);
  };
  if (activeObject) {
    add({ id: activeObject.id, title: activeObject.title, type_id: activeObject.type_id });
  }
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    add({ id, title: String(row.title || id), type_id: String(row.type_id || activeType || "") });
  }
  for (const node of graphNodes) {
    add({ id: node.id, title: node.title || node.id, type_id: node.type_id });
  }
  return out.sort((a, b) => `${a.type_id}:${a.title || a.id}`.localeCompare(`${b.type_id}:${b.title || b.id}`));
}

function objectBodyForDisplay(object: Obj, body: string) {
  return body || `# ${object.title || object.id}\n\nBody file: \`${object.body_path}\``;
}

function ObjectBodyWorkspace({
  object,
  body,
  vault,
  candidates,
  openObject,
  saveBody,
  onBeginEdit,
  initialEditing = false
}: {
  object: Obj;
  body: string;
  vault: string;
  candidates: ObjectLinkCandidate[];
  openObject: (id: string) => void;
  saveBody: (id: string, markdown: string) => Promise<ObjectLoadResult | null>;
  onBeginEdit?: () => void;
  initialEditing?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState(body || `# ${object.title || object.id}\n\n`);
  const [viewMode, setViewMode] = useState<"write" | "split" | "preview">("split");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = draft !== body;
  useEffect(() => {
    if (editing && dirty) return;
    setDraft(body || `# ${object.title || object.id}\n\n`);
    setEditing(initialEditing);
    setJustSaved(false);
  }, [object.id, body, initialEditing]);

  function beginEdit() {
    setDraft(body || `# ${object.title || object.id}\n\n`);
    onBeginEdit?.();
    setEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function cancelEdit() {
    setDraft(body || `# ${object.title || object.id}\n\n`);
    setEditing(false);
    setLinkPickerOpen(false);
  }

  async function commitBody() {
    setSaving(true);
    try {
      await saveBody(object.id, draft);
      setEditing(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
      toast.success("Body saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Could not save body: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function insertText(value: string, replaceOpeningWiki = false) {
    const input = textareaRef.current;
    if (!input) {
      setDraft((current) => `${current}${value}`);
      return;
    }
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    const replaceStart = replaceOpeningWiki && draft.slice(0, selectionStart).endsWith("[[") ? selectionStart - 2 : selectionStart;
    const next = `${draft.slice(0, replaceStart)}${value}${draft.slice(selectionEnd)}`;
    const cursor = replaceStart + value.length;
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }

  function insertLink(candidate: ObjectLinkCandidate) {
    insertText(`[[${candidate.id}]]`, true);
    setLinkPickerOpen(false);
  }

  async function importFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading(true);
    try {
      for (const file of images) {
        const result = await uploadAsset(file, vault);
        if (!result.ok || !result.data) {
          throw new Error(result.error?.message || `Could not import ${file.name}`);
        }
        insertText(`\n\n${result.data.markdown}\n\n`);
      }
      toast.success(images.length === 1 ? "Image inserted" : `${images.length} images inserted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Could not insert image: ${message}`);
    } finally {
      setUploading(false);
    }
  }

  function handleBodyChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    setDraft(next);
    const cursor = event.target.selectionStart;
    if (next.slice(0, cursor).endsWith("[[")) {
      setLinkPickerOpen(true);
    }
  }

  const status = saving ? "Saving..." : uploading ? "Importing image..." : dirty ? "Unsaved changes" : justSaved ? "Saved" : "Saved";
  return (
    <div className="body-workspace">
      <div className="body-workspace-header">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Badge>{object.type_id}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{object.id}</span>
          </div>
          <h1 className="font-serif text-[42px] font-medium leading-[1.05] tracking-tight">{object.title || object.id}</h1>
          <div className="mt-4 h-0.5 w-24 rounded-full bg-[hsl(var(--earth)/0.34)]" />
        </div>
        <div className="body-workspace-actions">
          <span className={`body-save-state ${dirty ? "body-save-state-dirty" : ""}`}>
            {(saving || uploading) && <Loader2 className="size-3.5 animate-spin" />}
            {status}
          </span>
          {editing ? (
            <>
              <Button variant="ghost" className="h-8 rounded-md px-2.5" onClick={cancelEdit} disabled={saving}><X className="size-3.5" />Cancel</Button>
              <Button className="h-8 rounded-md px-3" onClick={() => void commitBody()} disabled={saving || uploading || !dirty}><Save className="size-3.5" />Save</Button>
            </>
          ) : (
            <Button className="h-8 rounded-md px-3" onClick={beginEdit}><Edit3 className="size-3.5" />Edit body</Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="body-editor-shell">
          <div className="body-editor-toolbar">
            <div className="flex items-center gap-1">
              <ToolbarButton active={viewMode === "write"} onClick={() => setViewMode("write")} title="Write"><Edit3 className="size-3.5" />Write</ToolbarButton>
              <ToolbarButton active={viewMode === "split"} onClick={() => setViewMode("split")} title="Split"><SplitSquareHorizontal className="size-3.5" />Split</ToolbarButton>
              <ToolbarButton active={viewMode === "preview"} onClick={() => setViewMode("preview")} title="Preview"><Eye className="size-3.5" />Preview</ToolbarButton>
            </div>
            <div className="flex items-center gap-1">
              <Popover open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-8 rounded-md px-2.5"><Link2 className="size-3.5" />Link</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 rounded-2xl p-0">
                  <Command shouldFilter>
                    <CommandInput placeholder="Search objects..." />
                    <CommandList>
                      <CommandEmpty>No object found.</CommandEmpty>
                      <CommandGroup heading="Objects">
                        {candidates.map((candidate) => (
                          <CommandItem key={candidate.id} value={`${candidate.id} ${candidate.title} ${candidate.type_id}`} onSelect={() => insertLink(candidate)}>
                            <span className="min-w-0 flex-1 truncate">{candidate.title || candidate.id}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{candidate.type_id}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground">
                <ImagePlus className="size-3.5" />
                Image
                <input className="hidden" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.currentTarget.value = ""; }} />
              </label>
            </div>
          </div>
          <div
            className={`body-editor-grid body-editor-grid-${viewMode}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void importFiles(event.dataTransfer.files);
            }}
          >
            {viewMode !== "preview" && (
              <div className="body-editor-pane">
                <textarea
                  ref={textareaRef}
                  className="body-editor-textarea"
                  value={draft}
                  spellCheck={false}
                  onChange={handleBodyChange}
                  onPaste={(event) => {
                    if (event.clipboardData.files.length > 0) {
                      void importFiles(event.clipboardData.files);
                    }
                  }}
                />
                <div className="body-drop-hint"><FileImage className="size-3.5" />Drop or paste images here. Type [[ to link an object.</div>
              </div>
            )}
            {viewMode !== "write" && (
              <div className="body-preview-pane markdown">
                <MarkdownBody body={draft || objectBodyForDisplay(object, body)} object={object} vault={vault} openObject={openObject} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="markdown body-reader-surface">
          <MarkdownBody body={objectBodyForDisplay(object, body)} object={object} vault={vault} openObject={openObject} />
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`body-toolbar-button ${active ? "body-toolbar-button-active" : ""}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function ObjectPageContent({
  object,
  body,
  vault,
  openObject,
  imageLoading = "lazy"
}: {
  object: Obj;
  body: string;
  vault: string;
  openObject: (id: string) => void;
  imageLoading?: "lazy" | "eager";
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge>{object.type_id}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{object.id}</span>
      </div>
      <div className="mb-7">
        <h1 className="font-serif text-[42px] font-medium leading-[1.05] tracking-tight">{object.title || object.id}</h1>
        <div className="mt-4 h-0.5 w-24 rounded-full bg-[hsl(var(--earth)/0.34)]" />
      </div>
      <div className="markdown">
        <MarkdownBody body={objectBodyForDisplay(object, body)} object={object} vault={vault} openObject={openObject} imageLoading={imageLoading} />
      </div>
    </>
  );
}

function MarkdownBody({
  body,
  object,
  vault,
  openObject,
  imageLoading = "lazy"
}: {
  body: string;
  object: Obj | null;
  vault: string;
  openObject: (id: string) => void;
  imageLoading?: "lazy" | "eager";
}) {
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
        pre: ({ node: _node, children, ...props }) => {
          const child = Array.isArray(children) ? children[0] : children;
          if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
            const language = /language-([A-Za-z0-9_-]+)/.exec(child.props.className ?? "")?.[1]?.toLowerCase();
            if (language === "mermaid") {
              return <MermaidDiagram source={String(child.props.children ?? "").replace(/\n$/, "")} />;
            }
          }
          return <pre {...props}>{children}</pre>;
        },
        table: ({ node: _node, children, ...props }) => (
          <div className="markdown-table-wrap">
            <table {...props}>{children}</table>
          </div>
        ),
        img: ({ node: _node, src, alt, ...props }) => {
          const resolved = markdownAssetURL(src, object, vault);
          return (
            <img
              {...props}
              src={resolved}
              alt={alt ?? ""}
              loading={imageLoading}
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
        <blockquote {...props} className="markdown-alert-body">{stripAlertMarker(children)}</blockquote>
      </div>
    );
  }
  return <blockquote {...props}>{children}</blockquote>;
}

function stripAlertMarker(children: React.ReactNode) {
  let stripped = false;
  function strip(node: React.ReactNode): React.ReactNode {
    if (node === null || node === undefined || typeof node === "boolean") return node;
    if (typeof node === "string" || typeof node === "number") {
      if (stripped) return node;
      const next = String(node).replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, "");
      if (next !== String(node)) stripped = true;
      return next;
    }
    if (Array.isArray(node)) {
      return node.map(strip).filter((child) => child !== "");
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      const nextChildren = strip(node.props.children);
      if (nextChildren === "" || (Array.isArray(nextChildren) && nextChildren.length === 0)) return null;
      return React.cloneElement(node, { children: nextChildren });
    }
    return node;
  }
  return strip(children);
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

function BreadcrumbTrail({ view, activeType, activeObject }: { view: ViewID; activeType: string; activeObject: Obj | null }) {
  const parts = ["mbase"];
  if (view === "objects") {
    if (activeType) parts.push(activeType);
  } else if (view === "detail") {
    if (activeObject?.type_id || activeType) parts.push(activeObject?.type_id || activeType);
    if (activeObject?.id) parts.push(activeObject.id);
  } else if (view === "types") {
    parts.push("schema");
  } else if (view === "vi") {
    parts.push("visual inventory");
  } else {
    parts.push(view);
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-muted-foreground">
      {parts.map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
          {index > 0 && <ChevronRight className="size-3 opacity-45" />}
          <span className={`truncate ${index === parts.length - 1 ? "font-semibold text-foreground" : ""}`}>{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function NavItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode; label: string; active: boolean; collapsed?: boolean; onClick: () => void }) {
  const button = (
    <button onClick={onClick} title={collapsed ? label : undefined} className={`flex w-full items-center ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"} rounded-lg py-2 text-left text-[12.5px] transition ${active ? "bg-[hsl(var(--card)/0.58)] text-foreground" : "text-foreground/66 hover:bg-card/40 hover:text-foreground/82"}`}>
      <span className={active ? "text-[hsl(31_28%_39%)]" : "text-muted-foreground"}>{icon}</span>
      {!collapsed && <span className={active ? "font-medium" : "font-normal"}>{label}</span>}
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
    <div className="sidebar-tool-card">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <FolderOpen className="size-3" />
        Vault
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex w-full items-center justify-between gap-3 rounded-md border border-border/35 bg-card/35 px-2.5 py-2 text-left transition hover:bg-card/62">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate font-mono text-xs">{vault ? shortPath(vault) : "default server vault"}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm break-all font-mono">{vault || "server default vault"}</TooltipContent>
            </Tooltip>
            <span className={`vault-status-chip ${vaultOK ? "vault-status-ready" : "vault-status-missing"}`}>{vaultOK ? "ready" : "missing"}</span>
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
                  <span className={`vault-status-chip ${vaultOK ? "vault-status-ready" : "vault-status-missing"}`}>{vaultOK ? "ready" : "missing"}</span>
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

function GraphModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={`rounded-xl px-3 py-1.5 transition ${active ? "bg-card text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.65),0_6px_14px_hsl(var(--shadow-warm)/0.08)]" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`} onClick={onClick}>{label}</button>;
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
                <path d={path.d} fill="none" stroke={dimmed ? "hsl(var(--muted-foreground) / 0.14)" : schemaEdgeColor(edge)} strokeWidth={edge.required ? 1.8 : 1.35} markerEnd="url(#schema-arrow)" />
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
            className={`absolute w-[190px] rounded-xl px-4 py-3 text-left transition ${node.id === selectedType ? "bg-card shadow-[0_10px_22px_-16px_hsl(var(--shadow-warm)/0.20)]" : "bg-card/76 shadow-[0_8px_18px_-15px_hsl(var(--shadow-warm)/0.14)] hover:bg-card/92"}`}
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

function GraphCanvas({ graphView, selectedID, select, open, layoutKey, relayout }: { graphView: ReturnType<typeof buildGraphView>; selectedID: string | null; select: (id: string) => void; open: (id: string) => void; layoutKey: string; relayout: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Point>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  useEffect(() => pruneDraggedPositions(graphView.nodes, setDraggedPositions), [graphView.nodes]);
  useEffect(() => {
    setDraggedPositions({});
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  }, [layoutKey]);
  const nodes = graphView.nodes.map((node) => ({ ...node, position: draggedPositions[node.id] ?? node.position }));
  const nodeMap = new Map(nodes.map((node) => [node.id, { object: node.object, position: node.position }]));
  const relatedNodeIDs = new Set<string>();
  if (selectedID) {
    relatedNodeIDs.add(selectedID);
    for (const edge of graphView.edges) {
      if (edge.source === selectedID || edge.target === selectedID) {
        relatedNodeIDs.add(edge.source);
        relatedNodeIDs.add(edge.target);
      }
    }
  }
  const baseEdges = selectedID ? graphView.edges.filter((edge) => edge.source !== selectedID && edge.target !== selectedID) : graphView.edges;
  const focusEdges = selectedID ? graphView.edges.filter((edge) => edge.source === selectedID || edge.target === selectedID) : [];
  const orderedNodes = selectedID
    ? [...nodes].sort((a, b) => graphNodeLayer(a.id, selectedID, relatedNodeIDs) - graphNodeLayer(b.id, selectedID, relatedNodeIDs))
    : nodes;
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
  function handleRelayout() {
    setDraggedPositions({});
    relayout();
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  }
  return (
    <div className="relative h-full overflow-hidden">
      <GraphZoomControls zoom={zoom} setZoom={setZoom} reset={handleRelayout} />
      <div ref={scrollRef} className="h-full overflow-auto overscroll-contain">
        <div className="relative" style={{ width: size.width, height: size.height }}>
          <div className="relative origin-top-left" style={{ width: innerSize.width, height: innerSize.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg className="absolute inset-0" width={innerSize.width} height={innerSize.height}>
              <defs>
                <marker id="graph-arrow-earth" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                  <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--earth) / 0.56)" />
                </marker>
                <marker id="graph-arrow-moss" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                  <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--moss) / 0.58)" />
                </marker>
                <marker id="graph-arrow-clay" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
                  <path d="M2,2 L10,6 L2,10 Z" fill="hsl(var(--clay) / 0.6)" />
                </marker>
              </defs>
              {baseEdges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;
                const path = graphPath(source.position, target.position);
                return (
                  <g key={edge.id} opacity={selectedID ? 0.14 : 0.88}>
                    <path d={path.d} fill="none" stroke={edge.color} strokeWidth={selectedID ? 0.95 : 1.65} markerEnd={`url(#${edge.marker})`} />
                  </g>
                );
              })}
            </svg>
          {orderedNodes.map((node) => {
            const related = selectedID === null || relatedNodeIDs.has(node.id);
            const selected = node.id === selectedID;
            return (
              <button
                key={node.id}
                className={`absolute w-[190px] rounded-xl px-2 py-2 text-left transition ${selected ? "bg-card shadow-[0_10px_22px_-16px_hsl(var(--shadow-warm)/0.20)]" : "bg-card/90 shadow-[0_8px_18px_-15px_hsl(var(--shadow-warm)/0.13)] hover:bg-card"} ${related ? "opacity-100" : "opacity-[0.38]"}`}
                data-graph-node={node.id}
                style={{ left: node.position.x, top: node.position.y, zIndex: graphNodeLayer(node.id, selectedID, relatedNodeIDs), border: `1px solid ${selected ? graphTypeColor(node.object.type_id) : "hsl(var(--border) / 0.45)"}` }}
                onClick={() => select(node.id)}
                onDoubleClick={() => open(node.id)}
                onPointerDown={(event) => beginDrag(event, node.id, node.position)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GraphNodeLabel object={node.object} />
              </button>
            );
          })}
          {selectedID && focusEdges.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 z-20" width={innerSize.width} height={innerSize.height}>
              {focusEdges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;
                const path = graphPath(source.position, target.position);
                return (
                  <g key={`focus-${edge.id}`} opacity={1}>
                    <path d={path.d} fill="none" stroke={edge.color} strokeWidth={2.05} markerEnd={`url(#${edge.marker})`} />
                    <text x={path.label.x} y={path.label.y} className="fill-muted-foreground text-[10px]">
                      {edge.relation}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphZoomControls({ zoom, setZoom, reset }: { zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; reset: () => void }) {
  const change = (delta: number) => setZoom((value) => clampZoom(Number((value + delta).toFixed(2))));
  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-card/72 p-1 text-xs shadow-[0_8px_18px_-14px_hsl(var(--shadow-warm)/0.12)] backdrop-blur">
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => change(-0.12)} title="Zoom out">-</button>
      <button className="min-w-12 rounded-md px-2.5 py-1.5 font-mono text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => change(0.12)} title="Zoom in">+</button>
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={reset} title="Relayout visible graph">Relayout</button>
    </div>
  );
}

function clampZoom(value: number) {
  return Math.min(1.8, Math.max(0.55, value));
}

function graphNodeLayer(id: string, selectedID: string | null, relatedNodeIDs: Set<string>) {
  if (!selectedID) return 1;
  if (id === selectedID) return 40;
  if (relatedNodeIDs.has(id)) return 30;
  return 10;
}

function pruneDraggedPositions(nodes: Array<{ id: string }>, setDraggedPositions: React.Dispatch<React.SetStateAction<Record<string, Point>>>) {
  const liveIDs = new Set(nodes.map((node) => node.id));
  setDraggedPositions((positions) => {
    const next = Object.fromEntries(Object.entries(positions).filter(([id]) => liveIDs.has(id)));
    return Object.keys(next).length === Object.keys(positions).length ? positions : next;
  });
}

function ObjectDataTable({ rows, fields, activeType, open }: { rows: Record<string, unknown>[]; fields: FieldDef[]; activeType: string; open: (id: string) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const base: ColumnDef<Record<string, unknown>>[] = [
      {
        accessorKey: "id",
        header: ({ column }) => <SortableHeader label="id" toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => <ObjectIDCell id={String(row.original.id)} activeType={activeType} open={open} />,
        enableHiding: false
      },
      {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader label="title" toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
        cell: ({ row }) => (
          <button className="block w-full truncate text-left font-medium transition hover:text-[hsl(var(--earth))]" onClick={() => open(String(row.original.id))}>
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
  }, [fields, activeType, open]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } }
  });
  const tableMinWidth = table.getVisibleLeafColumns().reduce((sum, column) => sum + objectTableColumnWidth(column.id), 0);
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg">
      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto">
        <Table className="table-fixed" style={{ minWidth: tableMinWidth, width: tableMinWidth }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={objectTableCellClass(header.column.id)} style={objectTableColumnStyle(header.column.id)}>
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
                  <TableCell key={cell.id} className={objectTableCellClass(cell.column.id)} style={objectTableColumnStyle(cell.column.id)}>
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
          <span>{rows.length} rows</span>
          <span className="text-border">/</span>
          <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}</span>
          <Select value={String(table.getState().pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
            <SelectTrigger className="h-8 w-24 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-md p-2 transition hover:bg-foreground/[0.035] disabled:opacity-35" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} title="First page"><ChevronsLeft className="size-3.5" /></button>
          <button className="rounded-md p-2 transition hover:bg-foreground/[0.035] disabled:opacity-35" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} title="Previous page"><ChevronLeft className="size-3.5" /></button>
          <button className="rounded-md p-2 transition hover:bg-foreground/[0.035] disabled:opacity-35" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} title="Next page"><ChevronRight className="size-3.5" /></button>
          <button className="rounded-md p-2 transition hover:bg-foreground/[0.035] disabled:opacity-35" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} title="Last page"><ChevronsRight className="size-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

function ObjectIDCell({ id, activeType, open }: { id: string; activeType: string; open: (id: string) => void }) {
  const compact = compactObjectID(id, activeType);
  return (
    <button
      className="object-id-cell group"
      title={id}
      onClick={() => open(id)}
    >
      {compact.context && <span className="object-id-context">{compact.context}</span>}
      <span className="object-id-suffix">{compact.suffix}</span>
    </button>
  );
}

function compactObjectID(id: string, activeType: string) {
  const prefix = activeType ? `${activeType}.` : "";
  const rest = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  const parts = rest.split(".");
  const suffix = parts.pop() || rest;
  const context = parts.length > 0 ? parts.join(".") : "";
  return {
    context: context ? truncateMiddle(context, 20) : "",
    suffix: truncateMiddle(suffix, 18)
  };
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

function objectTableCellClass(columnID: string) {
  const base = "whitespace-nowrap align-top";
  if (columnID === "id") return `${base} object-table-id-col`;
  if (columnID === "title") return `${base} object-table-title-col`;
  if (columnID === "url") return `${base} object-table-url-col`;
  return `${base} object-table-field-col`;
}

function objectTableColumnStyle(columnID: string): React.CSSProperties | undefined {
  return { width: objectTableColumnWidth(columnID) };
}

function objectTableColumnWidth(columnID: string) {
  if (columnID === "id") return 190;
  if (columnID === "title") return 330;
  if (columnID === "url") return 300;
  if (columnID === "platform") return 110;
  if (columnID === "post_type") return 130;
  if (columnID === "author") return 130;
  if (columnID.endsWith("_at") || columnID.endsWith("_date")) return 150;
  if (columnID === "status" || columnID.endsWith("_status")) return 130;
  return 160;
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
      <span className="flex max-h-16 max-w-72 flex-wrap gap-1 overflow-hidden">
        {refs.map((ref) => (
          <button key={String(ref)} className="glass-light rounded-md px-2 py-1 font-mono text-xs text-[hsl(var(--earth))] transition hover:bg-card hover:text-foreground" onClick={() => open(String(ref))}>
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
    return <span className="flex max-h-16 max-w-72 flex-wrap gap-1 overflow-hidden">{value.map((item) => <Badge key={String(item)}>{String(item)}</Badge>)}</span>;
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
    <section className="panel-block">
      <div className="inspector-section-title">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="inspector-section-body">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="inspector-kv">
      <div className="inspector-kv-key">{k}</div>
      <div className="inspector-kv-value">{v}</div>
    </div>
  );
}

function LinkRow({ link, open, reverse }: { link: Link; open: (id: string) => void; reverse?: boolean }) {
  const target = reverse ? link.from_id : link.to_id;
  return (
    <div className="inspector-link-row">
      <div className="flex min-w-0 items-center gap-2">
        <Badge>{link.kind}</Badge>
        <span className="truncate text-xs text-muted-foreground">{link.relation}</span>
      </div>
      <button className="inspector-link-target" onClick={() => open(target)}>{target}</button>
    </div>
  );
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

function buildGraphView(graph: GraphData, mode: string, selectedID: string | null, hiddenTypes: Set<string>, layoutSeed = 0) {
  const modeEdges = graph.edges.filter((edge) => graphEdgeVisible(edge, mode));
  const visibleNodeIds = new Set<string>();
  for (const edge of modeEdges) {
    visibleNodeIds.add(edge.from_id);
    visibleNodeIds.add(edge.to_id);
  }
  const nodes = graph.nodes.filter((node) => (visibleNodeIds.size === 0 || visibleNodeIds.has(node.id)) && !hiddenTypes.has(node.type_id));
  const nodeIDs = new Set(nodes.map((node) => node.id));
  const visibleEdges = modeEdges.filter((edge) => nodeIDs.has(edge.from_id) && nodeIDs.has(edge.to_id));
  const lanes = graphLanes(nodes);
  const positions = layoutGraphNodes(nodes, visibleEdges, layoutSeed);
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

function buildGraphTypeControls(graph: GraphData, mode: string, hiddenTypes: Set<string>) {
  const modeEdges = graph.edges.filter((edge) => graphEdgeVisible(edge, mode));
  const visibleNodeIds = new Set<string>();
  for (const edge of modeEdges) {
    visibleNodeIds.add(edge.from_id);
    visibleNodeIds.add(edge.to_id);
  }
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    if (visibleNodeIds.size > 0 && !visibleNodeIds.has(node.id)) continue;
    counts.set(node.type_id, (counts.get(node.type_id) ?? 0) + 1);
  }
  return graphTypeOrder([...counts.keys()]).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
    hidden: hiddenTypes.has(type)
  }));
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

function layoutGraphNodes(nodes: Obj[], edges: Link[], layoutSeed = 0) {
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const companies = nodes.filter((node) => node.type_id === "company").sort(sortObject);
  if (companies.length === 0) return layoutGenericGraphNodes(nodes);

  const detailTypes = graphDetailTypes(nodes);
  const detailX = graphDetailColumnX(detailTypes, layoutSeed);
  const companyGroups = new Map<string, Map<string, Obj[]>>();
  const ensureGroup = (companyID: string) => {
    if (!companyGroups.has(companyID)) companyGroups.set(companyID, new Map());
    return companyGroups.get(companyID)!;
  };
  const pushRelated = (companyID: string, obj: Obj | undefined) => {
    if (!obj || obj.type_id === "company" || obj.type_id === "batch") return;
    const groups = ensureGroup(companyID);
    const list = groups.get(obj.type_id) ?? [];
    ensurePush(list, obj);
    groups.set(obj.type_id, list);
  };
  for (const edge of edges) {
    if (edge.relation === "founders" && byID.get(edge.from_id)?.type_id === "company") pushRelated(edge.from_id, byID.get(edge.to_id));
    if (edge.relation === "founded_companies" && byID.get(edge.to_id)?.type_id === "company") pushRelated(edge.to_id, byID.get(edge.from_id));
    if (edge.relation === "owner_company" && byID.get(edge.to_id)?.type_id === "company") pushRelated(edge.to_id, byID.get(edge.from_id));
    if (edge.relation === "about_company" && byID.get(edge.to_id)?.type_id === "company") pushRelated(edge.to_id, byID.get(edge.from_id));
    if (edge.relation === "from_touchpoint") {
      const touchpointOwner = edges.find((candidate) => candidate.relation === "owner_company" && candidate.from_id === edge.to_id);
      if (touchpointOwner) pushRelated(touchpointOwner.to_id, byID.get(edge.from_id));
    }
  }

  const companyY = new Map<string, number>();
  let y = 80;
  const rowStep = 78 + (layoutSeed % 2) * 4;
  for (const company of companies) {
    companyY.set(company.id, y);
    const groups = companyGroups.get(company.id);
    const largestVisibleGroup = Math.max(1, ...detailTypes.map((type) => groups?.get(type)?.length ?? 0));
    y += Math.max(210, largestVisibleGroup * rowStep + 112);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  companies.forEach((company) => {
    positions[company.id] = { x: nodes.some((node) => node.type_id === "batch") ? 300 : 40, y: companyY.get(company.id) ?? 0 };
  });

  const batchNodes = nodes.filter((node) => node.type_id === "batch").sort(sortObject);
  const companyYs = [...companyY.values()];
  const middleY = companyYs.length > 0 ? (companyYs[0] + companyYs[companyYs.length - 1]) / 2 : 120;
  batchNodes.forEach((node, i) => {
    positions[node.id] = { x: 0, y: middleY + (i - (batchNodes.length - 1) / 2) * 110 };
  });

  for (const [companyID, groups] of companyGroups) {
    const y = companyY.get(companyID) ?? middleY;
    for (const type of detailTypes) {
      placeGroup((groups.get(type) ?? []).sort(sortObject), detailX.get(type) ?? 640, y, rowStep, positions);
    }
  }

  placeRemaining(nodes, positions, detailX, rowStep);
  return positions;
}

function graphDetailTypes(nodes: Obj[]) {
  return graphTypeOrder([...new Set(nodes.map((node) => node.type_id).filter((type) => type !== "batch" && type !== "company"))]);
}

function graphDetailColumnX(types: string[], layoutSeed = 0) {
  const start = 560;
  const gap = 208 + (layoutSeed % 2) * 12;
  return new Map(types.map((type, index) => [type, start + index * gap]));
}

function layoutGenericGraphNodes(nodes: Obj[]) {
  const positions: Record<string, { x: number; y: number }> = {};
  const byType = new Map<string, Obj[]>();
  for (const node of nodes) {
    const group = byType.get(node.type_id) ?? [];
    group.push(node);
    byType.set(node.type_id, group);
  }
  graphTypeOrder([...byType.keys()]).forEach((type, typeIndex) => {
    const group = (byType.get(type) ?? []).sort(sortObject);
    const x = 40 + typeIndex * 270;
    group.forEach((node, nodeIndex) => {
      positions[node.id] = { x, y: 70 + nodeIndex * 102 };
    });
  });
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

function placeRemaining(nodes: Obj[], positions: Record<string, { x: number; y: number }>, detailX: Map<string, number>, step: number) {
  const defaultX = detailX.size > 0 ? Math.max(...detailX.values()) + 208 : 560;
  const counts = new Map<string, number>();
  for (const node of nodes.filter((item) => !positions[item.id]).sort(sortObject)) {
    const index = counts.get(node.type_id) ?? 0;
    counts.set(node.type_id, index + 1);
    const x = detailX.get(node.type_id) ?? defaultX;
    positions[node.id] = { x, y: 80 + index * step };
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
