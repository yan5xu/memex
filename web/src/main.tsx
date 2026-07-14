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
import { createRootRoute, createRoute, createRouter, RouterProvider, stripSearchParams, useNavigate, useParams } from "@tanstack/react-router";
import { type ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Activity, ArrowLeft, ArrowUpDown, Braces, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database, Download, Edit3, Eye, FileImage, FileText, FolderOpen, GitBranch, HeartPulse, History, House, ImagePlus, Link2, Loader2, Maximize2, Menu, Minimize2, Move, Network, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Plus, RotateCcw, Save, Search, SplitSquareHorizontal, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import "./styles.css";
import siteExtension from "@memex/site-extension";
import { getCurrentVault, getRecentVaults, getServerInfo, run, setCurrentVault, uploadAsset, type ServerInfo } from "./api";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { ScrollArea } from "./components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Toaster } from "./components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import i18n, { languageOptions } from "./i18n";
import type { SiteAutomationController, SiteLanguage } from "./site-extension-contract";

type TypeDef = { id: string; fields?: FieldDef[] };
type FieldDef = { name: string; kind: string; required?: boolean; unique?: boolean; target_type?: string; enum_values?: string[] };
type Obj = { id: string; type_id: string; title: string; body_path: string; body_abs_path: string; fields: Record<string, unknown> };
type Link = { from_id: string; to_id: string; kind: string; relation: string; text?: string; resolved: boolean };
type GraphData = { nodes: Obj[]; edges: Link[] };
type SchemaEdge = { source: string; target: string; relation: string; kind: string; required?: boolean };
type Point = { x: number; y: number };
type ObjectLinkCandidate = { id: string; title: string; type_id: string };
type ViewID = "objects" | "detail" | "types" | "graph" | "health" | "vi" | "graph-lab";
type RouteSearch = { view: ViewID; vault?: string; type?: string; filter?: string; object?: string; graphView?: string; graphMode?: string; graphHiddenTypes?: string; section?: string; frame?: string; shot?: string };
type PublicPathState = { view: ViewID; type?: string; object?: string };
type PublicRouteDef = { collection: string; type: string; idPrefix: string };
type VaultUIState = { view: ViewID; type?: string; filter?: string; object?: string; graphView?: string; graphMode?: string; graphHiddenTypes?: string };
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
  activeGraphViewID: string;
  activeGraphCenterID: string;
};
type BaseLoadResult = {
  types: TypeDef[];
  issues: unknown[];
  vaultOK: boolean;
  activeType: string;
  rows: Record<string, unknown>[];
};
type ObjectLoadResult = { object: Obj; body: string; links: Link[]; backlinks: Link[] };

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}

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
  graphViewID: string | null;
  graphCenterID: string | null;
  language: string;
};

type RelationGraphAutomationState = {
  available: boolean;
  dialogOpen: boolean;
  activeViewID: string | null;
  activeViewLabel: string | null;
  viewSource: "vault config" | "built in" | "loading config";
  views: Array<{ id: string; label: string; configurable: boolean }>;
  editorOpen: boolean;
  editorID: string;
  editorLabel: string;
  editorSteps: string;
  nodesCount: number;
  edgesCount: number;
};

type AutomationUISnapshot = {
  sidebarCollapsed: boolean;
  mobile: boolean;
  mobileSidebarOpen: boolean;
  inspectorOpen: boolean;
  relationGraph: RelationGraphAutomationState | null;
  graphWorkspace: GraphWorkspaceAutomationState | null;
};

type RelationGraphAutomationController = {
  state: () => RelationGraphAutomationState;
  open: () => Promise<RelationGraphAutomationState>;
  close: () => Promise<RelationGraphAutomationState>;
  setView: (id: string) => Promise<RelationGraphAutomationState>;
  configure: (open?: boolean) => Promise<RelationGraphAutomationState>;
  setEditor: (patch: { id?: string; label?: string; steps?: string }) => Promise<RelationGraphAutomationState>;
  saveView: (patch?: { id?: string; label?: string; steps?: string }) => Promise<RelationGraphAutomationState>;
  deleteView: (id?: string) => Promise<RelationGraphAutomationState>;
};

type GraphWorkspaceAutomationState = {
  activeViewID: string | null;
  activeCenterID: string | null;
  fullMap: boolean;
  centerSearch: string;
  visibleCenterIDs: string[];
  previewOpen: boolean;
  previewObjectID: string | null;
  configVersion: number;
  configError: string | null;
  projectedNodesCount: number;
  projectedEdgesCount: number;
  derivedEdgesCount: number;
  editorOpen: boolean;
  editorID: string;
  detailsOpen: boolean;
  canvasFocus: boolean;
  selectedEdge: { fromID: string; toID: string } | null;
};

type GraphWorkspaceAutomationController = {
  state: () => GraphWorkspaceAutomationState;
  searchCenter: (query: string) => Promise<GraphWorkspaceAutomationState>;
  previewNode: (id: string) => Promise<GraphWorkspaceAutomationState>;
  closePreview: () => Promise<GraphWorkspaceAutomationState>;
  setCenterFromNode: (id: string) => Promise<GraphWorkspaceAutomationState>;
  reloadViews: () => Promise<GraphWorkspaceAutomationState>;
  queryView: (viewID: string, centerID: string) => Promise<GraphWorkspaceAutomationState>;
  configure: (open?: boolean) => Promise<GraphWorkspaceAutomationState>;
  newView: () => Promise<GraphWorkspaceAutomationState>;
  setEditor: (patch: { id?: string; label?: string; rootType?: string; steps?: string; nodes?: Record<string, GraphNodeTemplate>; bridges?: Record<string, GraphBridgeConfig> }) => Promise<GraphWorkspaceAutomationState>;
  saveView: () => Promise<GraphWorkspaceAutomationState>;
  deleteView: (id?: string) => Promise<GraphWorkspaceAutomationState>;
  setDetailsOpen: (open: boolean) => Promise<GraphWorkspaceAutomationState>;
  setCanvasFocus: (open: boolean) => Promise<GraphWorkspaceAutomationState>;
  selectEdge: (fromID: string, toID: string) => Promise<GraphWorkspaceAutomationState>;
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

const fullGraphViewID = "__full_graph__";

const publicRouteDefs: PublicRouteDef[] = [
  { collection: "batches", type: "batch", idPrefix: "batch" },
  { collection: "companies", type: "company", idPrefix: "company" },
  { collection: "concepts", type: "concept", idPrefix: "concept" },
  { collection: "investments", type: "investment", idPrefix: "investment" },
  { collection: "investors", type: "investor", idPrefix: "investor" },
  { collection: "methods", type: "method", idPrefix: "method" },
  { collection: "notes", type: "note", idPrefix: "note" },
  { collection: "people", type: "person", idPrefix: "person" },
  { collection: "sources", type: "source.item", idPrefix: "source" },
  { collection: "touchpoints", type: "touchpoint", idPrefix: "touchpoint" },
  { collection: "traffic", type: "traffic.snapshot", idPrefix: "traffic" }
];

const publicRouteByCollection = new Map(publicRouteDefs.map((route) => [route.collection, route]));
const publicRouteByType = new Map(publicRouteDefs.map((route) => [route.type, route]));

type VISectionID = typeof viSections[number];

function normalizeVISection(section: unknown): VISectionID {
  return viSections.includes(section as VISectionID) ? section as VISectionID : "foundations";
}

function viewIsShot(search: RouteSearch) {
  return search.frame === "shot" || search.shot === "1" || search.shot === "true";
}

function normalizeRouteSearch(search: Record<string, unknown>): RouteSearch {
  return {
    view: normalizeView(search.view),
    vault: typeof search.vault === "string" ? search.vault : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
    object: typeof search.object === "string" ? search.object : undefined,
    graphView: typeof search.graphView === "string" ? search.graphView : undefined,
    graphMode: typeof search.graphMode === "string" ? search.graphMode : undefined,
    graphHiddenTypes: typeof search.graphHiddenTypes === "string" ? search.graphHiddenTypes : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
    frame: typeof search.frame === "string" ? search.frame : undefined,
    shot: typeof search.shot === "string" ? search.shot : undefined
  };
}

function publicPathState(params: Record<string, unknown>): PublicPathState | null {
  const collection = typeof params.collection === "string" ? params.collection : "";
  const slug = typeof params.slug === "string" ? params.slug : "";
  if (!collection) return null;
  if (!slug) {
    if (collection === "graph") return { view: "graph" };
    if (collection === "schema") return { view: "types" };
    if (collection === "health") return { view: "health" };
    const route = publicRouteByCollection.get(collection);
    return route ? { view: "objects", type: route.type } : null;
  }
  if (collection === "objects") {
    return { view: "detail", object: slug };
  }
  const route = publicRouteByCollection.get(collection);
  return route ? { view: "detail", type: route.type, object: `${route.idPrefix}.${slug}` } : null;
}

function publicObjectPath(type: string, id: string) {
  const route = publicRouteByType.get(type);
  if (!route) return { collection: "objects", slug: id };
  const prefix = `${route.idPrefix}.`;
  return { collection: route.collection, slug: id.startsWith(prefix) ? id.slice(prefix.length) : id };
}

function publicSearch(search: RouteSearch): Partial<RouteSearch> {
  if (search.view === "objects") {
    return { filter: search.filter };
  }
  if (search.view === "graph") {
    return {
      object: search.object,
      graphView: search.graphView,
      graphMode: search.graphMode,
      graphHiddenTypes: search.graphHiddenTypes
    };
  }
  return search.view === "vi" || search.view === "graph-lab" ? { view: search.view } : {};
}

const rootRoute = createRootRoute({
  validateSearch: normalizeRouteSearch,
  search: {
    middlewares: [stripSearchParams({ view: "objects" })]
  },
  component: RootRoute
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null
});

const publicCollectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$collection",
  component: () => null
});

const publicObjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$collection/$slug",
  component: () => null
});

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, publicCollectionRoute, publicObjectRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootRoute() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function normalizeView(view: unknown): ViewID {
  return view === "detail" || view === "types" || view === "graph" || view === "health" || view === "vi" || view === "graph-lab" ? view : "objects";
}

function getVaultUIStates(): Record<string, VaultUIState> {
  try {
    const raw = localStorage.getItem("memex.vaultStates");
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
  localStorage.setItem("memex.vaultStates", JSON.stringify(states));
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 25);
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
    graphEdgesCount: state.graph.edges.length,
    graphViewID: state.activeGraphViewID || null,
    graphCenterID: state.activeGraphCenterID || null,
    language: i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en"
  };
}

declare global {
  interface Window {
    memex?: {
      run: typeof run;
      getVault: () => string;
      recentVaults: () => string[];
      uiState: () => AutomationUISnapshot;
      setLanguage: (language: "en" | "zh") => Promise<AutomationSnapshot>;
      setSidebarCollapsed: (collapsed: boolean) => AutomationSnapshot;
      setMobileSidebarOpen: (open: boolean) => AutomationUISnapshot;
      setInspectorOpen: (open: boolean) => AutomationSnapshot;
      openHome: () => Promise<AutomationSnapshot>;
      switchVault: (path: string) => Promise<AutomationSnapshot>;
      openVault: (path: string) => Promise<AutomationSnapshot>;
      reload: () => Promise<AutomationSnapshot>;
      selectType: (type: string) => Promise<AutomationSnapshot>;
      setFilter: (filter: string) => Promise<AutomationSnapshot>;
      openView: (view: ViewID) => Promise<AutomationSnapshot>;
      openObject: (id: string) => Promise<AutomationSnapshot>;
      openGraph: () => Promise<AutomationSnapshot>;
      graphWorkspace: {
        state: () => GraphWorkspaceAutomationState;
        setView: (id: string) => Promise<AutomationSnapshot>;
        setCenter: (id: string) => Promise<AutomationSnapshot>;
        openFullMap: () => Promise<AutomationSnapshot>;
        searchCenter: (query: string) => Promise<GraphWorkspaceAutomationState | null>;
        previewNode: (id: string) => Promise<GraphWorkspaceAutomationState | null>;
        closePreview: () => Promise<GraphWorkspaceAutomationState | null>;
        setCenterFromNode: (id: string) => Promise<GraphWorkspaceAutomationState | null>;
        reloadViews: () => Promise<GraphWorkspaceAutomationState | null>;
        queryView: (viewID: string, centerID: string) => Promise<GraphWorkspaceAutomationState | null>;
        configure: (open?: boolean) => Promise<GraphWorkspaceAutomationState | null>;
        newView: () => Promise<GraphWorkspaceAutomationState | null>;
        setEditor: (patch: { id?: string; label?: string; rootType?: string; steps?: string; nodes?: Record<string, GraphNodeTemplate>; bridges?: Record<string, GraphBridgeConfig> }) => Promise<GraphWorkspaceAutomationState | null>;
        saveView: () => Promise<GraphWorkspaceAutomationState | null>;
        deleteView: (id?: string) => Promise<GraphWorkspaceAutomationState | null>;
        setDetailsOpen: (open: boolean) => Promise<GraphWorkspaceAutomationState | null>;
        setCanvasFocus: (open: boolean) => Promise<GraphWorkspaceAutomationState | null>;
        selectEdge: (fromID: string, toID: string) => Promise<GraphWorkspaceAutomationState | null>;
      };
      openHealth: () => Promise<AutomationSnapshot>;
      relationGraph: {
        state: () => RelationGraphAutomationState | null;
        open: () => Promise<RelationGraphAutomationState | null>;
        close: () => Promise<RelationGraphAutomationState | null>;
        setView: (id: string) => Promise<RelationGraphAutomationState | null>;
        configure: (open?: boolean) => Promise<RelationGraphAutomationState | null>;
        setEditor: (patch: { id?: string; label?: string; steps?: string }) => Promise<RelationGraphAutomationState | null>;
        saveView: (patch?: { id?: string; label?: string; steps?: string }) => Promise<RelationGraphAutomationState | null>;
        deleteView: (id?: string) => Promise<RelationGraphAutomationState | null>;
      };
      site: {
        id: string;
        state: () => unknown;
        invoke: (action: string, payload?: unknown) => Promise<unknown>;
      };
      saveObjectImage: () => Promise<{ filename: string }>;
      state: () => AutomationSnapshot;
    };
  }
}

function App() {
  const rawRouteSearch = rootRoute.useSearch();
  const routeParams = useParams({ strict: false }) as Record<string, unknown>;
  const pathState = publicPathState(routeParams);
  const routeSearch: RouteSearch = pathState ? { ...rawRouteSearch, ...pathState } : rawRouteSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const objectExportRef = useRef<HTMLDivElement | null>(null);
  const relationGraphAutomationRef = useRef<RelationGraphAutomationController | null>(null);
  const graphWorkspaceAutomationRef = useRef<GraphWorkspaceAutomationController | null>(null);
  const siteAutomationRef = useRef<SiteAutomationController | null>(null);
  const SiteHomePage = siteExtension.HomePage;
  const homeMode = Boolean(SiteHomePage && window.location.pathname === "/" && !window.location.search);
  const initialVault = pathState ? "" : routeSearch.vault?.trim() || getCurrentVault();
  const viSection = normalizeVISection(routeSearch.section);
  const viShot = viewIsShot(routeSearch);
  const [view, setViewState] = useState<ViewID>(routeSearch.view);
  const mobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (max-width: 900px)");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("memex.sidebarCollapsed") === "true");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
  const [activeGraphViewID, setActiveGraphViewID] = useState(routeSearch.graphView ?? "");
  const [activeGraphCenterID, setActiveGraphCenterID] = useState(routeSearch.object ?? "");
  const [hiddenGraphTypes, setHiddenGraphTypesState] = useState(() => parseGraphHiddenTypes(routeSearch.graphHiddenTypes));
  const [graphLayoutSeed, setGraphLayoutSeed] = useState(0);
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
  const [selectedSchemaType, setSelectedSchemaType] = useState<string | null>(null);
  const [filter, setFilterState] = useState(routeSearch.filter ?? "");
  const [vault, setVault] = useState(initialVault);
  const [vaultDraft, setVaultDraft] = useState(initialVault);
  const [recentVaults, setRecentVaults] = useState(getRecentVaults());
  const [showcaseVault, setShowcaseVault] = useState("");
  const [vaultOK, setVaultOK] = useState<boolean | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [savingObjectImage, setSavingObjectImage] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const readOnly = Boolean(serverInfo?.read_only);
  const brandName = serverInfo?.brand_name || "Memex";
  const brandMark = serverInfo?.brand_mark || "M";
  const brandTagline = serverInfo?.brand_tagline || t("app.tagline");
  const effectiveSidebarCollapsed = mobile ? false : sidebarCollapsed;

  function updateSearch(next: Partial<RouteSearch>, options: { replace?: boolean } = {}) {
    const nextView = next.view ?? routeSearch.view ?? view;
    let merged: RouteSearch;
    if (nextView === "vi") {
      const hasSection = Object.prototype.hasOwnProperty.call(next, "section");
      const hasFrame = Object.prototype.hasOwnProperty.call(next, "frame");
      const hasShot = Object.prototype.hasOwnProperty.call(next, "shot");
      merged = {
        view: "vi",
        section: hasSection ? next.section : routeSearch.section,
        frame: hasFrame ? next.frame : routeSearch.frame,
        shot: hasShot ? next.shot : routeSearch.shot
      };
    } else {
      merged = { ...routeSearch, ...next, view: nextView };
      if (!merged.vault && vault) merged.vault = vault;
      delete merged.section;
      delete merged.frame;
      delete merged.shot;
    }

    const usePublicPaths = readOnly || pathState !== null;
    if (!usePublicPaths) {
      void navigate({ to: "/", search: merged, replace: options.replace ?? false });
      return;
    }

    const search = publicSearch(merged);
    if (merged.view === "detail" && merged.object) {
      const destination = publicObjectPath(merged.type ?? activeObject?.type_id ?? "", merged.object);
      void navigate({
        to: "/$collection/$slug",
        params: destination,
        search: {} as RouteSearch,
        replace: options.replace ?? false
      });
      return;
    }
    if (merged.view === "objects" && merged.type) {
      const collection = publicRouteByType.get(merged.type)?.collection;
      if (collection) {
        void navigate({
          to: "/$collection",
          params: { collection },
          search: search as RouteSearch,
          replace: options.replace ?? false
        });
        return;
      }
    }
    const collection = merged.view === "graph" ? "graph" : merged.view === "types" ? "schema" : merged.view === "health" ? "health" : "";
    if (collection) {
      void navigate({
        to: "/$collection",
        params: { collection },
        search: search as RouteSearch,
        replace: options.replace ?? false
      });
      return;
    }
    void navigate({ to: "/", search: search as RouteSearch, replace: options.replace ?? false });
  }

  function setView(next: ViewID, options: { replace?: boolean } = {}) {
    setMobileSidebarOpen(false);
    setViewState(next);
    updateSearch({ view: next, object: next === "detail" ? activeObject?.id ?? routeSearch.object : undefined }, options);
  }

  async function openSiteHome() {
    setMobileSidebarOpen(false);
    await navigate({ to: "/", search: {} as RouteSearch });
    await nextFrame();
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

  function setGraphWorkspaceSelection(next: { viewID?: string; centerID?: string }, options: { replace?: boolean } = {}) {
    if (next.viewID !== undefined) setActiveGraphViewID(next.viewID);
    if (next.centerID !== undefined) setActiveGraphCenterID(next.centerID);
    updateSearch({
      view: "graph",
      graphView: next.viewID !== undefined ? next.viewID || undefined : activeGraphViewID || undefined,
      object: next.centerID !== undefined ? next.centerID || undefined : activeGraphCenterID || undefined
    }, options);
  }

  function cachedRun<T>(argv: string[], vaultOverride = vault) {
    const key = ["run", vaultOverride || "default", ...argv];
    return queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => run<T>(argv, vaultOverride),
      staleTime: 1500
    });
  }

  async function loadBase(nextActiveType = activeType, where = filter, vaultOverride = vault): Promise<BaseLoadResult> {
    const [typesRes, issuesRes, vaultRes] = await Promise.all([
      cachedRun<{ types: TypeDef[] }>(["type", "list"], vaultOverride),
      cachedRun<{ issues: unknown[] }>(["issues"], vaultOverride),
      cachedRun<{ exists: boolean }>(["vault", "info"], vaultOverride)
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
      nextRows = await loadRows(nextActiveType, where, vaultOverride);
    }
    return { types: list, issues: nextIssues, vaultOK: nextVaultOK, activeType: nextActiveType, rows: nextRows };
  }

  useEffect(() => {
    if (homeMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await getServerInfo();
        setServerInfo(info.data ?? null);
        const defaultVault = info.data?.vault_exists ? info.data.default_vault : "";
        if (cancelled) return;
        setShowcaseVault(info.data?.showcase_exists ? info.data.showcase_vault : "");
        if (info.data?.read_only && defaultVault) {
          await openVaultPath(defaultVault, { silent: true, remember: false, preserveRoute: true });
          return;
        }
        if (initialVault) {
          const loaded = await loadBase(activeType, filter, initialVault);
          if (cancelled || loaded.vaultOK || routeSearch.vault) return;
        }
        if (defaultVault) {
          await openVaultPath(defaultVault, { preserveRoute: pathState !== null });
          if (defaultVault === info.data?.showcase_vault && info.data.showcase_start_object) {
            await openObject(info.data.showcase_start_object, { vault: defaultVault });
          }
          return;
        }
        await loadBase();
      } catch {
        if (!cancelled) await loadBase();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (homeMode) return;
    if (readOnly && view === "detail" && activeObject) {
      document.title = `${activeObject.title || activeObject.id} | ${brandName}`;
      return;
    }
    if (readOnly && view === "objects" && activeType) {
      document.title = `${activeType} | ${brandName}`;
      return;
    }
    document.title = brandName;
  }, [brandName, homeMode, readOnly, view, activeObject?.id, activeObject?.title, activeType]);

  useEffect(() => {
    document.documentElement.classList.toggle("site-home-active", homeMode);
    return () => document.documentElement.classList.remove("site-home-active");
  }, [homeMode]);

  useEffect(() => {
    if (!readOnly || view !== "detail" || !activeObject) return;
    const destination = publicObjectPath(activeObject.type_id, activeObject.id);
    const pathname = `/${destination.collection}/${destination.slug.split("/").map(encodeURIComponent).join("/")}`;
    if (window.location.pathname === pathname && !window.location.search) return;
    void navigate({
      to: "/$collection/$slug",
      params: destination,
      search: {} as RouteSearch,
      replace: true
    });
  }, [readOnly, view, activeObject?.id, activeObject?.type_id]);

  useEffect(() => {
    if (homeMode || view === "vi" || routeSearch.vault || !vault) return;
    updateSearch({ vault }, { replace: true });
  }, [routeSearch.vault, vault, view, homeMode]);

  useEffect(() => {
    if (homeMode || !activeType) return;
    void loadRows(activeType, filter);
  }, [activeType, filter, homeMode]);

  async function loadRows(type: string, where: string, vaultOverride = vault): Promise<Record<string, unknown>[]> {
    const argv = ["query", type, "--limit", "200"];
    if (where) argv.push("--where", where);
    const res = await cachedRun<{ rows: Record<string, unknown>[] }>(argv, vaultOverride);
    const nextRows = res.data?.rows ?? [];
    setRows(nextRows);
    return nextRows;
  }

  async function openObject(id: string, options: { syncURL?: boolean; view?: ViewID; vault?: string } = {}): Promise<ObjectLoadResult | null> {
    const res = await cachedRun<ObjectLoadResult>(["object", "get", id], options.vault ?? vault);
    if (res.data) {
      setActiveTypeState(res.data.object.type_id);
      setActiveObject(res.data.object);
      setActiveBody(res.data.body ?? "");
      setLinks(res.data.links ?? []);
      setBacklinks(res.data.backlinks ?? []);
      const nextView = options.view ?? "detail";
      setViewState(nextView);
      if (options.syncURL !== false) {
        updateSearch({ view: nextView, type: res.data.object.type_id, object: id });
      }
      return res.data;
    }
    return null;
  }

  async function openGraph(options: { syncURL?: boolean; vault?: string } = {}): Promise<GraphData> {
    const res = await cachedRun<GraphData>(["graph", "export"], options.vault ?? vault);
    const nextGraph = res.data ?? { nodes: [], edges: [] };
    setGraph(nextGraph);
    setViewState("graph");
    if (options.syncURL !== false) {
      updateSearch({
        view: "graph",
        object: activeGraphCenterID || undefined,
        graphView: activeGraphViewID || undefined,
        graphMode,
        graphHiddenTypes: serializeGraphHiddenTypes(hiddenGraphTypes) || undefined
      });
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
      const { default: html2canvas } = await import("html2canvas");
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
  const objectTitleByID = useMemo(() => buildObjectTitleByID(activeObject, rows, graph.nodes), [activeObject, rows, graph.nodes]);
  const selectedGraphObject = useMemo(() => graph.nodes.find((n) => n.id === selectedGraphNode) ?? null, [graph.nodes, selectedGraphNode]);
  const graphLayoutKey = useMemo(() => `${graphMode}:${serializeGraphHiddenTypes(hiddenGraphTypes)}:${graphLayoutSeed}`, [graphMode, hiddenGraphTypes, graphLayoutSeed]);
  const currentVaultState = useMemo<VaultUIState>(() => ({
    view,
    type: activeType || undefined,
    filter: filter || undefined,
    object: view === "detail" || view === "graph-lab" ? activeObject?.id : view === "graph" ? activeGraphCenterID || undefined : undefined,
    graphView: view === "graph" ? activeGraphViewID || undefined : undefined,
    graphMode,
    graphHiddenTypes: serializeGraphHiddenTypes(hiddenGraphTypes) || undefined
  }), [view, activeType, filter, activeObject?.id, activeGraphCenterID, activeGraphViewID, graphMode, hiddenGraphTypes]);

  useEffect(() => {
    if (homeMode) return;
    const nextView = routeSearch.view;
    const nextType = routeSearch.type ?? "";
    const nextFilter = routeSearch.filter ?? "";
    const nextGraphMode = routeSearch.graphMode ?? "core";
    const nextGraphView = routeSearch.graphView ?? "";
    const nextGraphCenter = routeSearch.object ?? "";
    const nextHiddenGraphTypes = parseGraphHiddenTypes(routeSearch.graphHiddenTypes);
    if (nextView !== view) setViewState(nextView);
    if (nextType !== activeType) setActiveTypeState(nextType);
    if (nextFilter !== filter) setFilterState(nextFilter);
    if (nextGraphMode !== graphMode) setGraphModeState(nextGraphMode);
    if (nextGraphView !== activeGraphViewID) setActiveGraphViewID(nextGraphView);
    if (nextView === "graph" && nextGraphCenter !== activeGraphCenterID) setActiveGraphCenterID(nextGraphCenter);
    if (serializeGraphHiddenTypes(nextHiddenGraphTypes) !== serializeGraphHiddenTypes(hiddenGraphTypes)) {
      setHiddenGraphTypesState(nextHiddenGraphTypes);
    }
    if ((nextView === "detail" || nextView === "graph-lab") && routeSearch.object && routeSearch.object !== activeObject?.id) {
      void openObject(routeSearch.object, { syncURL: false, view: nextView });
    }
    if (nextView === "graph" && graph.nodes.length === 0) {
      void openGraph({ syncURL: false });
    }
    if (nextView === "graph-lab" && graph.nodes.length === 0) {
      void cachedRun<GraphData>(["graph", "export"]).then((res) => {
        if (res.data) setGraph(res.data);
      });
    }
  }, [routeSearch.view, routeSearch.type, routeSearch.filter, routeSearch.object, routeSearch.graphView, routeSearch.graphMode, routeSearch.graphHiddenTypes, hiddenGraphTypes, homeMode]);

  useEffect(() => {
    const needsObjectLookup = markdownHasWikiLinks(activeBody) || links.length > 0 || backlinks.length > 0;
    if (view !== "detail" || graph.nodes.length > 0 || !needsObjectLookup) return;
    void cachedRun<GraphData>(["graph", "export"]).then((res) => {
      if (res.data) setGraph(res.data);
    });
  }, [view, activeObject?.id, activeBody, links.length, backlinks.length, graph.nodes.length]);

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
      localStorage.setItem("memex.sidebarCollapsed", String(next));
      return next;
    });
  }

  async function openVaultPath(path: string, options: { silent?: boolean; remember?: boolean; preserveRoute?: boolean } = {}): Promise<BaseLoadResult | null> {
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
    const saved = options.preserveRoute ? routeSearch : getVaultUIState(nextPath);
    const nextView = saved?.view ?? "objects";
    const nextType = saved?.type ?? "";
    const nextFilter = saved?.filter ?? "";
    const nextGraphView = saved?.graphView ?? "";
    const nextGraphCenter = saved?.view === "graph" ? saved?.object ?? "" : "";
    const nextGraphMode = saved?.graphMode ?? "core";
    const nextHiddenGraphTypes = parseGraphHiddenTypes(saved?.graphHiddenTypes);
    if (options.remember !== false) {
      setCurrentVault(nextPath);
      setRecentVaults(getRecentVaults());
    }
    queryClient.invalidateQueries();
    setVaultDraft(nextPath);
    setVault(nextPath);
    setActiveObject(null);
    setActiveBody("");
    setLinks([]);
    setBacklinks([]);
    setGraph({ nodes: [], edges: [] });
    setFilterState(nextFilter);
    setActiveGraphViewID(nextGraphView);
    setActiveGraphCenterID(nextGraphCenter);
    setGraphModeState(nextGraphMode);
    setHiddenGraphTypesState(nextHiddenGraphTypes);
    setViewState(nextView === "detail" ? "objects" : nextView);
    if (!options.preserveRoute) {
      updateSearch({ vault: nextPath, view: nextView === "detail" ? "objects" : nextView, type: nextType || undefined, filter: nextFilter || undefined, object: nextGraphCenter || undefined, graphView: nextGraphView || undefined, graphMode: nextGraphMode, graphHiddenTypes: serializeGraphHiddenTypes(nextHiddenGraphTypes) || undefined }, { replace: true });
    }
    const loaded = await loadBase(nextType, nextFilter, nextPath);
    if (nextView === "graph") {
      await openGraph({ syncURL: false, vault: nextPath });
    }
    if (nextView === "detail" && saved?.object) {
      await openObject(saved.object, { vault: nextPath, syncURL: !options.preserveRoute });
    }
    if (!options.silent) toast.success(`Opened ${shortPath(nextPath)}`);
    return loaded;
  }

  useEffect(() => {
    const nextVault = routeSearch.vault?.trim() || "";
    if (!nextVault || nextVault === vault) return;
    void openVaultPath(nextVault);
  }, [routeSearch.vault]);

  useEffect(() => {
    const currentState = (overrides: Partial<AppState> = {}) => automationState({
      view: homeMode ? "home" : view,
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
      activeGraphViewID,
      activeGraphCenterID,
      ...overrides
    });
    const uiState = (): AutomationUISnapshot => ({
      sidebarCollapsed,
      mobile,
      mobileSidebarOpen,
      inspectorOpen,
      relationGraph: relationGraphAutomationRef.current?.state() ?? null,
      graphWorkspace: graphWorkspaceAutomationRef.current?.state() ?? null
    });
    const relationGraphCall = async <T,>(fn: (controller: RelationGraphAutomationController) => Promise<T>): Promise<T | null> => {
      const controller = relationGraphAutomationRef.current;
      if (!controller) return null;
      return fn(controller);
    };
    const graphWorkspaceCall = async <T,>(fn: (controller: GraphWorkspaceAutomationController) => Promise<T>): Promise<T | null> => {
      const controller = graphWorkspaceAutomationRef.current;
      if (!controller) return null;
      return fn(controller);
    };

    const runAndSync = async <T,>(argv: string[], vaultOverride = vault, options: { stdin?: string } = {}) => {
      const result = await run<T>(argv, vaultOverride, options);
      const changedObject = result.effects?.find((effect) => effect.object && (effect.kind === "body.refresh" || effect.kind === "body.write" || effect.kind === "body.append"))?.object;
      if (result.ok && changedObject) {
        await queryClient.invalidateQueries();
        await openObject(changedObject);
      }
      return result;
    };

    window.memex = {
      run: runAndSync,
      getVault: () => vault,
      recentVaults: () => getRecentVaults(),
      uiState,
      setLanguage: async (language: "en" | "zh") => {
        await i18n.changeLanguage(language);
        await nextFrame();
        return window.memex?.state() ?? currentState();
      },
      setSidebarCollapsed: (collapsed: boolean) => {
        setSidebarCollapsed(collapsed);
        return currentState();
      },
      setMobileSidebarOpen: (open: boolean) => {
        setMobileSidebarOpen(open);
        return { ...uiState(), mobileSidebarOpen: open };
      },
      setInspectorOpen: (open: boolean) => {
        setInspectorOpen(open);
        return currentState();
      },
      openHome: async () => {
        await openSiteHome();
        return currentState({ view: "home" });
      },
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
      openView: async (nextView: ViewID) => {
        if (nextView === "graph") {
          const nextGraph = await openGraph();
          return currentState({ view: "graph", graph: nextGraph });
        }
        setView(nextView);
        return currentState({ view: nextView });
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
      graphWorkspace: {
        state: () => graphWorkspaceAutomationRef.current?.state() ?? ({
          activeViewID: activeGraphViewID || null,
          activeCenterID: activeGraphCenterID || null,
          fullMap: activeGraphViewID === fullGraphViewID,
          centerSearch: "",
        visibleCenterIDs: [],
        previewOpen: false,
        previewObjectID: null,
        configVersion: 1,
        configError: null,
          projectedNodesCount: 0,
          projectedEdgesCount: 0,
          derivedEdgesCount: 0,
          editorOpen: false,
          editorID: "",
          detailsOpen: false,
          canvasFocus: false,
          selectedEdge: null
        }),
        setView: async (id: string) => {
          setGraphWorkspaceSelection({ viewID: id, centerID: "" });
          if (graph.nodes.length === 0) {
            const nextGraph = await openGraph({ syncURL: false });
            await nextFrame();
            await nextFrame();
            return window.memex?.state() ?? currentState({ view: "graph", graph: nextGraph, activeGraphViewID: id, activeGraphCenterID: "" });
          }
          await nextFrame();
          await nextFrame();
          return window.memex?.state() ?? currentState({ view: "graph", activeGraphViewID: id, activeGraphCenterID: "" });
        },
        setCenter: async (id: string) => {
          setGraphWorkspaceSelection({ centerID: id });
          await nextFrame();
          return window.memex?.state() ?? currentState({ view: "graph", activeGraphCenterID: id });
        },
        openFullMap: async () => {
          setGraphWorkspaceSelection({ viewID: fullGraphViewID, centerID: "" });
          if (graph.nodes.length === 0) {
            const nextGraph = await openGraph({ syncURL: false });
            await nextFrame();
            return window.memex?.state() ?? currentState({ view: "graph", graph: nextGraph, activeGraphViewID: fullGraphViewID, activeGraphCenterID: "" });
          }
          await nextFrame();
          return window.memex?.state() ?? currentState({ view: "graph", activeGraphViewID: fullGraphViewID, activeGraphCenterID: "" });
        },
        searchCenter: (query: string) => graphWorkspaceCall((controller) => controller.searchCenter(query)),
        previewNode: (id: string) => graphWorkspaceCall((controller) => controller.previewNode(id)),
        closePreview: () => graphWorkspaceCall((controller) => controller.closePreview()),
        setCenterFromNode: (id: string) => graphWorkspaceCall((controller) => controller.setCenterFromNode(id)),
        reloadViews: () => graphWorkspaceCall((controller) => controller.reloadViews()),
        queryView: (viewID: string, centerID: string) => graphWorkspaceCall((controller) => controller.queryView(viewID, centerID)),
        configure: (open?: boolean) => graphWorkspaceCall((controller) => controller.configure(open)),
        newView: () => graphWorkspaceCall((controller) => controller.newView()),
        setEditor: (patch) => graphWorkspaceCall((controller) => controller.setEditor(patch)),
        saveView: () => graphWorkspaceCall((controller) => controller.saveView()),
        deleteView: (id?: string) => graphWorkspaceCall((controller) => controller.deleteView(id)),
        setDetailsOpen: (open: boolean) => graphWorkspaceCall((controller) => controller.setDetailsOpen(open)),
        setCanvasFocus: (open: boolean) => graphWorkspaceCall((controller) => controller.setCanvasFocus(open)),
        selectEdge: (fromID: string, toID: string) => graphWorkspaceCall((controller) => controller.selectEdge(fromID, toID))
      },
      openHealth: async () => {
        setView("health");
        return currentState({ view: "health" });
      },
      relationGraph: {
        state: () => relationGraphAutomationRef.current?.state() ?? null,
        open: () => relationGraphCall((controller) => controller.open()),
        close: () => relationGraphCall((controller) => controller.close()),
        setView: (id: string) => relationGraphCall((controller) => controller.setView(id)),
        configure: (open?: boolean) => relationGraphCall((controller) => controller.configure(open)),
        setEditor: (patch) => relationGraphCall((controller) => controller.setEditor(patch)),
        saveView: (patch) => relationGraphCall((controller) => controller.saveView(patch)),
        deleteView: (id) => relationGraphCall((controller) => controller.deleteView(id))
      },
      site: {
        id: siteExtension.id,
        state: () => siteAutomationRef.current?.state() ?? {
          available: Boolean(SiteHomePage),
          active: homeMode
        },
        invoke: async (action: string, payload?: unknown) => {
          const controller = siteAutomationRef.current;
          if (!controller) throw new Error("Site automation is unavailable");
          return controller.invoke(action, payload);
        }
      },
      saveObjectImage,
      state: () => currentState()
    };
    return () => {
      delete window.memex;
    };
  }, [view, vault, vaultOK, activeType, activeObject, activeBody, types, rows, links, backlinks, issues, graph, filter, sidebarCollapsed, mobile, mobileSidebarOpen, inspectorOpen, activeGraphViewID, activeGraphCenterID, homeMode]);

  const viMode = view === "vi";
  const graphLabMode = view === "graph-lab";
  const standaloneMode = viMode || graphLabMode;
  const shotMode = viMode && viShot;

  if (homeMode && SiteHomePage) {
    const language: SiteLanguage = i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en";
    return (
      <div className="site-home-shell min-h-screen bg-background text-foreground">
        <SiteHomePage
          brandName={brandName}
          brandMark={brandMark}
          brandTagline={brandTagline}
          language={language}
          setLanguage={async (nextLanguage) => {
            await i18n.changeLanguage(nextLanguage);
            await nextFrame();
          }}
          automationRef={siteAutomationRef}
        />
      </div>
    );
  }

  return (
    <div className={`app-shell flex h-screen w-screen overflow-hidden text-foreground ${standaloneMode ? "vi-standalone-shell" : ""}`}>
      {!standaloneMode && <button className={`mobile-sidebar-backdrop ${mobileSidebarOpen ? "is-open" : ""}`} onClick={() => setMobileSidebarOpen(false)} aria-label={t("nav.collapseSidebar")} />}
      {!standaloneMode && <aside className={`app-sidebar ${mobileSidebarOpen ? "is-mobile-open" : ""} ${effectiveSidebarCollapsed ? "w-12 px-2" : "w-60 px-3"} flex h-screen shrink-0 flex-col overflow-hidden py-4 transition-[width,padding] duration-200`}>
        <div className={`mb-5 flex items-center px-1 ${effectiveSidebarCollapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-foreground font-serif text-[13px] font-medium italic text-background">{brandMark}</div>
          {!effectiveSidebarCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium tracking-tight text-foreground/90">{brandName}</div>
              <div className="truncate text-[10.5px] text-muted-foreground">{brandTagline}</div>
            </div>
          )}
          <button className="mobile-sidebar-close" onClick={() => setMobileSidebarOpen(false)} aria-label={t("nav.collapseSidebar")}><X className="size-4" /></button>
        </div>

        <nav className="space-y-0.5">
          {SiteHomePage && <NavItem collapsed={effectiveSidebarCollapsed} icon={<House className="size-3.5" />} label="Home" active={false} onClick={() => void openSiteHome()} />}
          <NavItem collapsed={effectiveSidebarCollapsed} icon={<Database className="size-3.5" />} label={t("nav.objects")} active={view === "objects" || view === "detail"} onClick={() => setView("objects")} />
          <NavItem collapsed={effectiveSidebarCollapsed} icon={<Braces className="size-3.5" />} label={t("nav.schema")} active={view === "types"} onClick={() => setView("types")} />
          <NavItem collapsed={effectiveSidebarCollapsed} icon={<Network className="size-3.5" />} label={t("nav.graph")} active={view === "graph"} onClick={() => { setMobileSidebarOpen(false); void openGraph(); }} />
          {!readOnly && <NavItem collapsed={effectiveSidebarCollapsed} icon={<HeartPulse className="size-3.5" />} label={t("nav.health")} active={view === "health"} onClick={() => setView("health")} />}
        </nav>

        {!effectiveSidebarCollapsed && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <Separator className="mb-3 bg-border/45" />
            <div className="flex items-center justify-between px-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("nav.types")}</span>
            </div>
            <ScrollArea className="mt-2 min-h-0 flex-1 pr-1.5">
              <div className="space-y-0.5">
                {types.map((t) => (
                  <button key={t.id} onClick={() => { setMobileSidebarOpen(false); setActiveType(t.id); }} className={`sidebar-type-row ${activeType === t.id ? "sidebar-type-row-active" : ""}`}>
                    <span className="truncate">{t.id}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="mt-auto space-y-2.5 pt-3">
          {!effectiveSidebarCollapsed && !readOnly && (
            <>
              <div className="sidebar-tool-card text-[11px] text-muted-foreground">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground/70"><Play className="size-3 text-[hsl(var(--earth))]" /> {t("nav.agentApi")}</div>
                <code className="font-mono">window.memex.state()</code>
              </div>
              <VaultSwitcher
                vault={vault}
                draft={vaultDraft}
                setDraft={setVaultDraft}
                recentVaults={recentVaults}
                showcaseVault={showcaseVault}
                vaultOK={vaultOK}
                openVault={(path) => void openVaultPath(path)}
              />
            </>
          )}
          {!effectiveSidebarCollapsed && readOnly && serverInfo?.source_url && (
            <a className="sidebar-tool-card flex items-center gap-2 text-[11px] text-muted-foreground transition hover:text-foreground" href={serverInfo.source_url} target="_blank" rel="noreferrer">
              <GitBranch className="size-3 text-[hsl(var(--earth))]" />
              <span className="truncate">Open-source repository</span>
            </a>
          )}
          <button className={`sidebar-collapse ${effectiveSidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2"}`} onClick={toggleSidebar} title={effectiveSidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}>
            {effectiveSidebarCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
            {!effectiveSidebarCollapsed && <span>{t("nav.collapseSidebar")}</span>}
          </button>
        </div>
      </aside>}

      <main className={`app-main ${standaloneMode ? "vi-standalone-main" : "console-inset my-3 mr-3"} min-w-0 flex-1 overflow-hidden`}>
        {!standaloneMode && <div className="console-topbar">
          <div className="console-topbar-leading">
            <button className="mobile-menu-button" onClick={() => setMobileSidebarOpen(true)} aria-label={t("nav.expandSidebar")}><Menu className="size-4" /></button>
            <BreadcrumbTrail product={brandName} view={view} activeType={activeType} activeObject={activeObject} />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className={`vault-topbar-status inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${vaultOK ? "text-[hsl(var(--moss))]" : "text-[hsl(var(--clay))]"}`}>
              <span className={`size-1.5 rounded-full ${vaultOK ? "bg-[hsl(var(--moss))]" : "bg-[hsl(var(--clay))]"}`} />
              <span className="vault-topbar-status-label">{readOnly && serverInfo?.status_label ? serverInfo.status_label : vaultOK ? t("status.vaultReady") : t("status.vaultMissing")}</span>
            </span>
          </div>
        </div>}
        <div className="mb-scroll min-h-0 flex-1 overflow-auto">
        {view === "objects" && (
          <section className="objects-page flex h-full w-full flex-col px-7 py-6">
            <div className="objects-page-heading mb-5 flex items-baseline gap-3">
              <h1 className="font-serif text-3xl font-medium leading-none tracking-tight">{activeType || t("objects.title")}</h1>
              <span className="font-mono text-xs text-muted-foreground">{t("objects.count", { count: rows.length })}</span>
            </div>
            <div className="objects-workspace">
              <Tabs defaultValue="table" className="flex h-full min-h-0 flex-col">
                <div className="objects-page-toolbar mb-5 flex flex-wrap items-start justify-between gap-4">
                  <TabsList className="rounded-lg bg-muted/35">
                    <TabsTrigger value="table" className="rounded-md">{t("objects.table")}</TabsTrigger>
                    <TabsTrigger value="api" className="rounded-md">API</TabsTrigger>
                  </TabsList>
                  <ObjectFilterBar fields={activeFields} rows={rows} filter={filter} setFilter={setFilter} />
                </div>
                <TabsContent value="table" className="mt-0 min-h-0 flex-1">
                    {rows.length === 0 ? (
                      <EmptyState title={t("objects.emptyTitle")} description={t("objects.emptyDescription")} />
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
            <article className="object-reader mb-scroll h-full overflow-auto px-8 py-8">
              <div className="body-object-column w-full">
                <ObjectBodyWorkspace
                  object={activeObject}
                  body={activeBody}
                  vault={vault}
                  candidates={objectLinkCandidates}
                  objectTitleByID={objectTitleByID}
                  openObject={(id) => void openObject(id)}
                  saveBody={saveObjectBody}
                  readOnly={readOnly}
                  onBeginEdit={() => setInspectorOpen(false)}
                  inspectorToggle={
                    <button
                      className={`inspector-toggle ${inspectorOpen ? "text-[hsl(var(--earth))]" : "text-muted-foreground"}`}
                      onClick={() => setInspectorOpen((open) => !open)}
                      title={inspectorOpen ? t("detail.collapseInspector") : t("detail.expandInspector")}
                      aria-label={inspectorOpen ? t("detail.collapseInspector") : t("detail.expandInspector")}
                    >
                      {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                    </button>
                  }
                  inspectorPanel={
                    <>
                    <button className={`inspector-backdrop ${inspectorOpen ? "is-open" : ""}`} onClick={() => setInspectorOpen(false)} aria-label={t("detail.collapseInspector")} />
                    <aside className={`object-inspector mb-scroll ${inspectorOpen ? "object-inspector-open" : "object-inspector-closed"}`}>
                      <div className="inspector-header">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("detail.inspector")}</div>
                          <div className="mt-1 truncate text-sm font-semibold">{activeObject.title || activeObject.id}</div>
                          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{activeObject.id}</div>
                        </div>
                      </div>
                      <Panel title={t("detail.actions")} icon={<Download className="size-4" />}>
                        <Button className="w-full justify-start rounded-md" variant="secondary" disabled={savingObjectImage} onClick={() => void saveObjectImage()}>
                          <Download className="size-4" />
                          {savingObjectImage ? t("detail.savingImage") : t("detail.saveAsPng")}
                        </Button>
                      </Panel>
                      {!readOnly && <Panel title={t("detail.body")} icon={<FileText className="size-4" />}>
                        <div className="tray break-all rounded-md p-2.5 font-mono text-xs text-muted-foreground">{activeObject.body_abs_path || activeObject.body_path}</div>
                      </Panel>}
                      <Panel title={t("detail.relationGraph")} icon={<Network className="size-4" />}>
                        <InspectorRelationGraph object={activeObject} links={links} backlinks={backlinks} graphNodes={graph.nodes} graphEdges={graph.edges} vault={vault} readOnly={readOnly} automationRef={relationGraphAutomationRef} open={(id) => void openObject(id)} />
                      </Panel>
                      <Panel title={t("detail.fields")} icon={<Braces className="size-4" />}>{Object.entries(activeObject.fields ?? {}).map(([k, v]) => <KV key={k} k={k} v={renderCell(v)} />)}</Panel>
                      <Panel title={t("detail.fieldLinks")} icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "field").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
                      <Panel title={t("detail.bodyLinks")} icon={<GitBranch className="size-4" />}>{links.filter((l) => l.kind === "body").map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} />)}</Panel>
                      <Panel title={t("detail.backlinks")} icon={<Network className="size-4" />}>{backlinks.map((l, i) => <LinkRow key={i} link={l} open={(id) => void openObject(id)} reverse />)}</Panel>
                    </aside>
                    </>
                  }
                />
              </div>
            </article>

            <div className="object-export-host" aria-hidden="true">
              <article ref={objectExportRef} className="object-export-page">
                <ObjectPageContent object={activeObject} body={activeBody} vault={vault} objectTitleByID={objectTitleByID} openObject={() => undefined} imageLoading="eager" />
              </article>
            </div>
          </section>
        )}

        {view === "types" && (
          <section className="schema-page w-full px-7 py-6">
            <Header eyebrow={t("schema.eyebrow")} title={t("schema.title")} description={t("schema.description")} />
            <div className="content-panel mb-7 overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium"><Network className="size-4 text-[hsl(var(--earth))]" /> {t("schema.graph")}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{t("schema.graphStats", { types: schemaGraphView.nodes.length, edges: schemaGraphView.edges.length })}</div>
                </div>
                <button className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onClick={() => setSelectedSchemaType(null)}>{t("schema.clear")}</button>
              </div>
              <div className="schema-graph-surface h-[390px] border-t border-border/25">
                <SchemaGraphCanvas graphView={schemaGraphView} selectedType={selectedSchemaType} select={setSelectedSchemaType} />
              </div>
            </div>
            <div className="grid gap-x-10 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
              {types.map((typeDef) => (
                <Panel key={typeDef.id} title={typeDef.id} icon={<Braces className="size-4" />}>
                  <div className="space-y-1">
                    {(typeDef.fields ?? []).map((f) => (
                      <div key={f.name} className="soft-row flex items-center gap-2 py-3 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                        <Badge>{f.kind}</Badge>
                        {f.required && <Badge>{t("schema.required")}</Badge>}
                        {f.unique && <Badge>{t("schema.unique")}</Badge>}
                        {f.target_type && <span className="font-mono text-xs text-muted-foreground">{t("schema.to", { type: f.target_type })}</span>}
                      </div>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
            <div className="tray mt-7 rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Play className="size-4 text-[hsl(var(--earth))]" /> {t("schema.runConsole")}</div>
              <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">POST /api/run {"{\"argv\":[\"type\",\"list\"],\"vault\":\"" + (vault || "default") + "\"}"}</pre>
            </div>
          </section>
        )}

        {view === "graph" && (
          <GraphWorkspacePage
            graph={graph}
            types={types}
            vault={vault}
            activeViewID={activeGraphViewID}
            activeCenterID={activeGraphCenterID}
            setSelection={setGraphWorkspaceSelection}
            openObject={(id) => void openObject(id)}
            automationRef={graphWorkspaceAutomationRef}
            readOnly={readOnly}
            fullGraph={{
              graphView,
              graphTypeControls,
              selectedGraphNode,
              setSelectedGraphNode,
              selectedGraphObject,
              graphMode,
              setGraphMode,
              hiddenGraphTypes,
              toggleGraphType,
              showAllGraphTypes,
              graphLayoutKey,
              relayoutGraph
            }}
          />
        )}

        {view === "health" && (
          <section className="health-page w-full px-7 py-6">
            <Header eyebrow={t("health.eyebrow")} title={t("health.title")} description={t("health.description")} />
            <div className="content-panel p-4">
              {issues.length === 0 ? <EmptyState title={t("health.noIssuesTitle")} description={t("health.noIssuesDescription")} /> : issues.map((issue, i) => <pre key={i} className="tray mb-3 overflow-x-auto rounded-2xl p-3 font-mono text-xs text-muted-foreground last:mb-0">{JSON.stringify(issue, null, 2)}</pre>)}
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
        {view === "graph-lab" && (
          <GraphLabPage
            object={activeObject}
            graph={graph}
            links={links}
            backlinks={backlinks}
            vault={vault}
            openObject={(id) => {
              void openObject(id, { syncURL: false, view: "graph-lab" });
              updateSearch({ view: "graph-lab", object: id }, { replace: true });
            }}
          />
        )}
        </div>
      </main>
    </div>
  );
}

function GraphWorkspacePage({
  graph,
  types,
  vault,
  activeViewID,
  activeCenterID,
  setSelection,
  openObject,
  automationRef,
  readOnly = false,
  fullGraph
}: {
  graph: GraphData;
  types: TypeDef[];
  vault: string;
  activeViewID: string;
  activeCenterID: string;
  setSelection: (next: { viewID?: string; centerID?: string }, options?: { replace?: boolean }) => void;
  openObject: (id: string) => void;
  automationRef?: React.MutableRefObject<GraphWorkspaceAutomationController | null>;
  readOnly?: boolean;
  fullGraph: {
    graphView: ReturnType<typeof buildGraphView>;
    graphTypeControls: ReturnType<typeof buildGraphTypeControls>;
    selectedGraphNode: string | null;
    setSelectedGraphNode: (id: string) => void;
    selectedGraphObject: Obj | null;
    graphMode: string;
    setGraphMode: (mode: string) => void;
    hiddenGraphTypes: Set<string>;
    toggleGraphType: (type: string) => void;
    showAllGraphTypes: () => void;
    graphLayoutKey: string;
    relayoutGraph: () => void;
  };
}) {
  const { t } = useTranslation();
  const [viewConfig, setViewConfig] = useState<GraphViewConfig>({ version: 1, views: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorOriginalID, setEditorOriginalID] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [canvasFocus, setCanvasFocus] = useState(false);
  const [editorID, setEditorID] = useState("");
  const [editorLabel, setEditorLabel] = useState("");
  const [editorRootType, setEditorRootType] = useState("");
  const [editorSteps, setEditorSteps] = useState("");
  const [editorNodes, setEditorNodes] = useState<Record<string, GraphNodeTemplate>>({});
  const [editorBridges, setEditorBridges] = useState<Record<string, GraphBridgeConfig>>({});
  const [centerSearch, setCenterSearch] = useState("");
  const [centerPickerOpen, setCenterPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewObject, setPreviewObject] = useState<Obj | null>(null);
  const [previewBody, setPreviewBody] = useState("");
  const [projectedResult, setProjectedResult] = useState<ProjectedGraphResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [selectedProjectedEdge, setSelectedProjectedEdge] = useState<ProjectedGraphEdge | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const configuredViews = viewConfig.views;
  const activeDefinition = configuredViews.find((view) => view.id === activeViewID) ?? configuredViews[0] ?? null;
  const showingFullGraph = activeViewID === fullGraphViewID || !activeDefinition;
  const rootType = activeDefinition?.root_type ?? "";
  const centerCandidates = useMemo(() => {
    if (!rootType) return [] as Obj[];
    return graph.nodes
      .filter((node) => node.type_id === rootType)
      .sort((a, b) => objectDisplayTitle(a).localeCompare(objectDisplayTitle(b)));
  }, [graph.nodes, rootType]);
  const centerObject = graph.nodes.find((node) => node.id === activeCenterID) ?? centerCandidates[0] ?? null;
  const filteredCenterCandidates = useMemo(() => {
    const needle = centerSearch.trim().toLowerCase();
    if (!needle) return centerCandidates;
    return centerCandidates.filter((object) => {
      const values = [object.id, objectDisplayTitle(object), object.fields?.name, object.type_id, object.body_path];
      return values.some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [centerCandidates, centerSearch]);
  const centerSelectOptions = useMemo(() => {
    return filteredCenterCandidates;
  }, [filteredCenterCandidates]);
  const queryGraph = useMemo(() => projectedResult ? buildProjectedRelationGraph(projectedResult) : null, [projectedResult]);
  const queryNodes = queryGraph ? [queryGraph.focus, ...queryGraph.incoming, ...queryGraph.outgoing] : [];
  const queryGroups = queryGraph ? relationGraphGroups(queryGraph, queryNodes) : [];
  const rootTypes = useMemo(() => graphTypeOrder([...new Set(graph.nodes.map((node) => node.type_id))]), [graph.nodes]);
  const editorParsedSteps = useMemo(() => parseRelationStepsText(editorSteps).steps, [editorSteps]);
  const editorTypeIDs = useMemo(() => [...new Set([editorRootType, ...editorParsedSteps.map((step) => step.targetType || "")].filter(Boolean))], [editorRootType, editorParsedSteps]);
  const previewTitleByID = useMemo(() => buildObjectTitleByID(previewObject, [], graph.nodes), [previewObject, graph.nodes]);

  function graphWorkspaceState(): GraphWorkspaceAutomationState {
    return {
      activeViewID: showingFullGraph ? fullGraphViewID : (activeDefinition?.id ?? activeViewID) || null,
      activeCenterID: (centerObject?.id ?? activeCenterID) || null,
      fullMap: showingFullGraph,
      centerSearch,
      visibleCenterIDs: centerSelectOptions.map((object) => object.id),
      previewOpen,
      previewObjectID: previewObject?.id ?? null,
      configVersion: viewConfig.version,
      configError: configError || null,
      projectedNodesCount: projectedResult?.stats.nodes ?? 0,
      projectedEdgesCount: projectedResult?.stats.edges ?? 0,
      derivedEdgesCount: projectedResult?.stats.derived_edges ?? 0,
      editorOpen,
      editorID,
      detailsOpen,
      canvasFocus,
      selectedEdge: selectedProjectedEdge ? { fromID: selectedProjectedEdge.from_id, toID: selectedProjectedEdge.to_id } : null
    };
  }

  async function reloadGraphViews() {
    const result = await run<GraphViewConfig>(["graph", "views"], vault);
    if (!result.ok || !result.data) {
      const message = result.error?.message || t("graph.loadConfigFailed");
      setConfigError(message);
      return { ...graphWorkspaceState(), configError: message };
    }
    const normalized = normalizeGraphViewConfigForUI(result.data);
    setViewConfig((current) => graphViewConfigEqual(current, normalized) ? current : normalized);
    setConfigError("");
    return { ...graphWorkspaceState(), configVersion: normalized.version, configError: null };
  }

  async function queryConfiguredView(viewID: string, centerID: string) {
    setQueryLoading(true);
    const result = await run<ProjectedGraphResult>(["graph", "query", "--view", viewID, "--center", centerID], vault);
    setQueryLoading(false);
    if (!result.ok || !result.data) {
      const message = result.error?.message || t("graph.queryFailed");
      setConfigError(message);
      toast.error(message);
      return { ...graphWorkspaceState(), configError: message };
    }
    setProjectedResult(result.data);
    setConfigError("");
    setSelectedProjectedEdge(null);
    return {
      ...graphWorkspaceState(),
      activeViewID: viewID,
      activeCenterID: centerID,
      projectedNodesCount: result.data.stats.nodes,
      projectedEdgesCount: result.data.stats.edges,
      derivedEdgesCount: result.data.stats.derived_edges
    };
  }

  async function openMarkdownPreview(id: string) {
    const existing = graph.nodes.find((node) => node.id === id) ?? null;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewObject(existing);
    setPreviewBody("");
    const result = await run<ObjectLoadResult>(["object", "get", id], vault);
    if (!result.ok || !result.data) {
      setPreviewLoading(false);
      toast.error(result.error?.message || t("graph.failedToLoad", { id }));
      return graphWorkspaceState();
    }
    setPreviewObject(result.data.object);
    setPreviewBody(result.data.body ?? "");
    setPreviewLoading(false);
    return {
      ...graphWorkspaceState(),
      previewOpen: true,
      previewObjectID: result.data.object.id
    };
  }

  async function setCenterFromNode(id: string) {
    const target = graph.nodes.find((node) => node.id === id);
    if (!target) {
      toast.error(t("graph.nodeNotFound", { id }));
      return graphWorkspaceState();
    }
    const matchingView = configuredViews.find((view) => view.root_type === target.type_id);
    if (!matchingView) {
      toast.info(t("graph.noGraphStartsFrom", { type: target.type_id }));
      return graphWorkspaceState();
    }
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setCenterSearch("");
    setSelection({ viewID: matchingView.id, centerID: target.id });
    const nextVisibleCenterIDs = graph.nodes
      .filter((node) => node.type_id === matchingView.root_type)
      .sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id))
      .map((node) => node.id);
    return {
      ...graphWorkspaceState(),
      activeViewID: matchingView.id,
      activeCenterID: target.id,
      fullMap: false,
      centerSearch: "",
      visibleCenterIDs: nextVisibleCenterIDs,
      previewOpen,
      previewObjectID: previewObject?.id ?? null
    };
  }

  function handleGraphNodeClick(id: string) {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      void openMarkdownPreview(id);
    }, 180);
  }

  function handleGraphNodeDoubleClick(id: string) {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    void setCenterFromNode(id);
  }

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    run<GraphViewConfig>(["graph", "views"], vault).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setConfigError(result.error?.message || t("graph.loadConfigFailed"));
        return;
      }
      setViewConfig(normalizeGraphViewConfigForUI(result.data));
      setConfigError("");
    }).catch(() => {
      if (!cancelled) setConfigError(t("graph.loadConfigFailed"));
    }).finally(() => {
      if (!cancelled) setConfigLoading(false);
    });

    const poll = readOnly ? null : window.setInterval(() => void reloadGraphViews(), 2000);
    return () => {
      cancelled = true;
      if (poll !== null) window.clearInterval(poll);
    };
  }, [vault, readOnly]);

  useEffect(() => {
    if (showingFullGraph || !activeDefinition || !centerObject) {
      setProjectedResult(null);
      return;
    }
    void queryConfiguredView(activeDefinition.id, centerObject.id);
  }, [showingFullGraph, activeDefinition?.id, centerObject?.id, viewConfig]);

  useEffect(() => {
    if (activeViewID || configuredViews.length === 0) return;
    setSelection({ viewID: configuredViews[0].id }, { replace: true });
  }, [activeViewID, configuredViews, setSelection]);

  useEffect(() => {
    if (showingFullGraph || !centerObject || activeCenterID === centerObject.id) return;
    setSelection({ centerID: centerObject.id }, { replace: true });
  }, [showingFullGraph, centerObject, activeCenterID, setSelection]);

  useEffect(() => {
    if (!automationRef) return;
    automationRef.current = {
      state: graphWorkspaceState,
      searchCenter: async (query: string) => {
        setCenterSearch(query);
        await nextFrame();
        const needle = query.trim().toLowerCase();
        const matched = needle
          ? centerCandidates.filter((object) => [object.id, object.title, object.type_id, object.body_path].some((value) => String(value || "").toLowerCase().includes(needle)))
          : centerCandidates;
        const options = centerObject && !matched.some((object) => object.id === centerObject.id) ? [centerObject, ...matched] : matched;
        return { ...graphWorkspaceState(), centerSearch: query, visibleCenterIDs: options.map((object) => object.id) };
      },
      previewNode: openMarkdownPreview,
      closePreview: async () => {
        setPreviewOpen(false);
        await nextFrame();
        return { ...graphWorkspaceState(), previewOpen: false };
      },
      setCenterFromNode,
      reloadViews: reloadGraphViews,
      queryView: async (viewID: string, centerID: string) => {
        const view = configuredViews.find((candidate) => candidate.id === viewID);
        if (!view) throw new Error(`unknown graph view: ${viewID}`);
        const center = graph.nodes.find((candidate) => candidate.id === centerID);
        if (!center) throw new Error(`unknown graph center: ${centerID}`);
        if (center.type_id !== view.root_type) throw new Error(`center ${centerID} is ${center.type_id}, expected ${view.root_type}`);
        setSelection({ viewID, centerID });
        return queryConfiguredView(viewID, centerID);
      },
      configure: async (open = true) => {
        if (open) openEditor(); else setEditorOpen(false);
        await nextFrame();
        return automationRef.current?.state() ?? { ...graphWorkspaceState(), editorOpen: open };
      },
      newView: async () => {
        openEditor(null);
        await nextFrame();
        return automationRef.current?.state() ?? { ...graphWorkspaceState(), editorOpen: true };
      },
      setEditor: async (patch) => {
        if (patch.id !== undefined) setEditorID(patch.id);
        if (patch.label !== undefined) setEditorLabel(patch.label);
        if (patch.rootType !== undefined) setEditorRootType(patch.rootType);
        if (patch.steps !== undefined) setEditorSteps(patch.steps);
        if (patch.nodes !== undefined) setEditorNodes(patch.nodes);
        if (patch.bridges !== undefined) setEditorBridges(patch.bridges);
        await nextFrame();
        return automationRef.current?.state() ?? graphWorkspaceState();
      },
      saveView: saveGraphView,
      deleteView: deleteGraphView,
      setDetailsOpen: async (open: boolean) => {
        setDetailsOpen(open);
        await nextFrame();
        return automationRef.current?.state() ?? { ...graphWorkspaceState(), detailsOpen: open };
      },
      setCanvasFocus: async (open: boolean) => {
        setCanvasFocus(open);
        await nextFrame();
        return automationRef.current?.state() ?? { ...graphWorkspaceState(), canvasFocus: open };
      },
      selectEdge: async (fromID: string, toID: string) => {
        const edge = projectedResult?.edges.find((candidate) => candidate.from_id === fromID && candidate.to_id === toID);
        if (!edge) throw new Error(`projected edge not found: ${fromID} -> ${toID}`);
        setSelectedProjectedEdge(edge);
        setDetailsOpen(true);
        await nextFrame();
        return automationRef.current?.state() ?? { ...graphWorkspaceState(), detailsOpen: true, selectedEdge: { fromID, toID } };
      }
    };
    return () => {
      if (automationRef.current?.state === graphWorkspaceState) automationRef.current = null;
    };
  });

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  function openEditor(source: GraphViewDefinition | null = activeDefinition) {
    const sourceSteps = source ? graphViewPrimarySteps(source) : [];
    setCanvasFocus(false);
    setEditorOriginalID(source?.id ?? null);
    setEditorID(source?.id ?? slugifyGraphViewLabel(`${rootTypes[0] || "object"} view`));
    setEditorLabel(source?.label ?? `${rootTypes[0] || "object"} view`);
    setEditorRootType(source?.root_type ?? rootTypes[0] ?? "");
    setEditorSteps(relationStepsToText(sourceSteps.map((step) => ({ relation: step.relation, direction: step.direction, targetType: step.target_type }))));
    setEditorNodes(source?.nodes ?? {});
    setEditorBridges(source?.bridges ?? {});
    setEditorOpen(true);
  }

  function updateEditorNode(typeID: string, patch: Partial<GraphNodeTemplate>) {
    setEditorNodes((current) => ({ ...current, [typeID]: { ...(current[typeID] ?? {}), ...patch } }));
  }

  function toggleEditorBridge(typeID: string, enabled: boolean) {
    setEditorBridges((current) => {
      if (enabled) return { ...current, [typeID]: current[typeID] ?? { label_fields: [], aggregate: true } };
      const next = { ...current };
      delete next[typeID];
      return next;
    });
  }

  async function saveGraphView() {
    const id = editorID.trim();
    const label = editorLabel.trim();
    const rootType = editorRootType.trim();
    const parsed = parseRelationStepsText(editorSteps);
    if (!id || !label || !rootType || parsed.error || parsed.steps.length === 0) {
      toast.error(parsed.error || t("graph.requiredViewFields"));
      return graphWorkspaceState();
    }
    const nextView: GraphViewDefinition = {
      id,
      label,
      root_type: rootType,
      description: `Follow ${relationQueryPathLabel(rootType, parsed.steps)} from the current ${rootType}`,
      paths: [{ steps: parsed.steps.map((step) => ({ relation: step.relation, direction: step.direction, target_type: step.targetType })) }],
      nodes: cleanGraphNodeTemplates(editorNodes),
      bridges: cleanGraphBridgeConfigs(editorBridges)
    };
    const nextConfig = { version: 2, views: [...viewConfig.views.filter((view) => view.id !== id && view.id !== editorOriginalID), nextView] };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "view", "apply", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.saveFailed"));
      return graphWorkspaceState();
    }
    const normalized = normalizeGraphViewConfigForUI(result.data);
    setViewConfig(normalized);
    const nextCenterID = centerObject?.type_id === rootType ? centerObject.id : "";
    setSelection({ viewID: id, centerID: nextCenterID }, { replace: true });
    setEditorOpen(false);
    toast.success(t("graph.viewSaved"));
    await nextFrame();
    return automationRef?.current?.state() ?? { ...graphWorkspaceState(), activeViewID: id, activeCenterID: nextCenterID || null, editorOpen: false };
  }

  async function deleteGraphView(idOverride?: string) {
    const id = idOverride?.trim() || editorID.trim() || activeDefinition?.id;
    if (!id) return graphWorkspaceState();
    const deletedView = viewConfig.views.find((view) => view.id === id) ?? null;
    const nextConfig = { version: viewConfig.version, views: viewConfig.views.filter((view) => view.id !== id) };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "view", "apply", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.deleteFailed"));
      return graphWorkspaceState();
    }
    const normalized = normalizeGraphViewConfigForUI(result.data);
    setViewConfig(normalized);
    setSelection({ viewID: normalized.views[0]?.id ?? fullGraphViewID, centerID: "" }, { replace: true });
    setDeleteConfirmOpen(false);
    setEditorOpen(false);
    toast.success(t("graph.viewDeleted"), deletedView ? {
      duration: 10000,
      action: {
        label: t("common.undo"),
        onClick: () => void restoreDeletedGraphView(deletedView)
      }
    } : undefined);
    await nextFrame();
    return automationRef?.current?.state() ?? { ...graphWorkspaceState(), editorOpen: false };
  }

  async function restoreDeletedGraphView(deletedView: GraphViewDefinition) {
    const latest = await run<GraphViewConfig>(["graph", "views"], vault);
    if (!latest.ok || !latest.data) {
      toast.error(latest.error?.message || t("graph.restoreFailed"));
      return;
    }
    const current = normalizeGraphViewConfigForUI(latest.data);
    const nextConfig = {
      version: current.version,
      views: [...current.views.filter((view) => view.id !== deletedView.id), deletedView]
    };
    const result = await run<GraphViewConfig>(["graph", "view", "apply", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.restoreFailed"));
      return;
    }
    const normalized = normalizeGraphViewConfigForUI(result.data);
    setViewConfig(normalized);
    setSelection({ viewID: deletedView.id, centerID: "" }, { replace: true });
    toast.success(t("graph.viewRestored"));
  }

  return (
    <section className={`graph-workspace-page ${canvasFocus ? "is-canvas-focus" : ""}`}>
      {(!canvasFocus || editorOpen) && <div className="graph-workspace-header">
        <Header
          eyebrow={t("graph.viewsEyebrow")}
          title={editorOpen ? (editorOriginalID ? t("graph.editViewTitle") : t("graph.newViewTitle")) : t("graph.workspace")}
          description={editorOpen
            ? (editorOriginalID ? t("graph.editViewDescription") : t("graph.newViewDescription"))
            : showingFullGraph ? t("graph.fullGraphDescription") : activeDefinition?.description || t("graph.focusedDescription")}
        />
        {!editorOpen && !readOnly && <div className="graph-workspace-actions">
          {!showingFullGraph && activeDefinition && (
            <Button variant="secondary" className="rounded-md" onClick={() => openEditor(activeDefinition)}>
              <Edit3 className="size-4" />
              {t("graph.editCurrentView")}
            </Button>
          )}
          <Button className="rounded-md" onClick={() => openEditor(null)}>
            <Plus className="size-4" />
            {t("graph.newView")}
          </Button>
        </div>}
      </div>}

      {!editorOpen && !canvasFocus && <div className="graph-workspace-viewbar">
        <div className="relation-filter-chips">
          {configuredViews.map((view) => (
            <button key={view.id} className={`relation-view-chip ${!showingFullGraph && activeDefinition?.id === view.id ? "is-active" : ""}`} onClick={() => setSelection({ viewID: view.id, centerID: "" })}>
              {view.label}
            </button>
          ))}
          <button className={`relation-view-chip ${showingFullGraph ? "is-active" : ""}`} onClick={() => setSelection({ viewID: fullGraphViewID, centerID: "" })}>
            {t("graph.fullMap")}
          </button>
        </div>
        {!showingFullGraph && activeDefinition && (
          <div className="graph-center-control">
            <div className="graph-center-picker">
              <span>{t("graph.center")}</span>
              <Popover open={centerPickerOpen} onOpenChange={setCenterPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="secondary" className="graph-center-trigger" aria-label={t("graph.search", { type: rootType })}>
                    <span className="truncate">{centerObject ? objectDisplayTitle(centerObject) : t("common.none")}</span>
                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="graph-center-popover p-0">
                  <Command shouldFilter={false}>
                    <CommandInput value={centerSearch} onValueChange={setCenterSearch} placeholder={t("graph.search", { type: rootType })} />
                    <CommandList>
                      <CommandEmpty>{t("objects.emptyTitle")}</CommandEmpty>
                      <CommandGroup heading={t("graph.center")}>
                        {centerSelectOptions.map((object) => (
                          <CommandItem
                            key={object.id}
                            value={`${object.id} ${objectDisplayTitle(object)} ${object.type_id}`}
                            onSelect={() => {
                              setSelection({ centerID: object.id });
                              setCenterSearch("");
                              setCenterPickerOpen(false);
                            }}
                          >
                            <Check className={`size-3.5 ${centerObject?.id === object.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="min-w-0 flex-1 truncate">{objectDisplayTitle(object)}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{object.id}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>}

      {configError && (
        <div className="graph-config-error">
          <span>{configError}</span>
          <Button size="sm" variant="secondary" onClick={() => void reloadGraphViews()}>{t("graph.reloadConfig")}</Button>
        </div>
      )}

      {editorOpen && !readOnly && (
        <div className="graph-workspace-editor">
          <div className="graph-view-editor">
            <div className="graph-view-editor-heading">
              <div>
                <div className="graph-view-editor-title">{editorOriginalID ? editorLabel || editorOriginalID : t("graph.newViewUntitled")}</div>
                <div className="graph-view-editor-description">{t("graph.configurationStoredInVault")}</div>
              </div>
              <div className="graph-view-editor-heading-actions">
                <Button size="sm" variant="secondary" onClick={() => setEditorOpen(false)} disabled={configSaving}>
                  <ArrowLeft className="size-3.5" />
                  {t("graph.backToGraph")}
                </Button>
                <Button size="sm" onClick={() => void saveGraphView()} disabled={configSaving}>
                  <Save className="size-3.5" />
                  {t("graph.save")}
                </Button>
                {editorOriginalID && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="graph-delete-view-trigger" onClick={() => setDeleteConfirmOpen(true)} disabled={configSaving} aria-label={t("graph.deleteView")}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("graph.deleteView")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <section className="graph-view-editor-section">
              <div className="graph-view-editor-section-heading">
                <span>{t("graph.viewIdentity")}</span>
                <span>{t("graph.viewIdentityHelp")}</span>
              </div>
              <div className="graph-view-basics">
                <label>
                  <span>{t("graph.label")}</span>
                  <Input value={editorLabel} onChange={(event) => setEditorLabel(event.target.value)} placeholder="Portfolio" />
                </label>
                <label>
                  <span>{t("graph.id")}</span>
                  <Input value={editorID} onChange={(event) => setEditorID(event.target.value)} placeholder="portfolio" />
                </label>
                <label>
                  <span>{t("graph.rootType")}</span>
                  <select value={editorRootType} onChange={(event) => setEditorRootType(event.target.value)}>
                    <option value="">{t("graph.selectType")}</option>
                    {rootTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              </div>
            </section>
            <section className="graph-view-editor-section graph-view-path-section">
              <div className="graph-view-editor-section-heading">
                <span>{t("graph.relationPath")}</span>
                <span>{t("graph.editorHelp")}</span>
              </div>
              <label>
                <span>{t("graph.steps")}</span>
                <textarea value={editorSteps} onChange={(event) => setEditorSteps(event.target.value)} placeholder={"in investor investment\nout company company"} />
              </label>
              <div className="graph-view-editor-help"><code>in investor investment</code><span>→</span><code>out company company</code></div>
            </section>
            <div className="graph-presentation-editor">
              <div className="graph-presentation-heading">
                <span>{t("graph.nodePresentation")}</span>
                <span>{t("graph.nodePresentationHelp")}</span>
              </div>
              {editorTypeIDs.map((typeID, index) => {
                const template = editorNodes[typeID] ?? {};
                const typeDef = types.find((candidate) => candidate.id === typeID);
                const fieldNames = ["title", "id", ...(typeDef?.fields ?? []).map((field) => field.name)];
                const canBridge = index > 0 && index < editorTypeIDs.length - 1;
                const bridge = editorBridges[typeID];
                return (
                  <div key={typeID} className="graph-presentation-row">
                    <div className="graph-presentation-type">
                      <span className="graph-type-dot" style={{ background: graphTypeColor(typeID) }} />
                      <span>{typeID}</span>
                    </div>
                    <label>
                      <span>{t("graph.density")}</span>
                      <select value={template.variant ?? "standard"} onChange={(event) => updateEditorNode(typeID, { variant: event.target.value as GraphNodeTemplate["variant"] })}>
                        <option value="compact">{t("graph.compact")}</option>
                        <option value="standard">{t("graph.standard")}</option>
                        <option value="rich">{t("graph.rich")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t("graph.titleField")}</span>
                      <select value={template.title_field ?? "title"} onChange={(event) => updateEditorNode(typeID, { title_field: event.target.value })}>
                        {fieldNames.map((field) => <option key={field} value={field}>{field}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("graph.subtitleField")}</span>
                      <select value={template.subtitle_field ?? ""} onChange={(event) => updateEditorNode(typeID, { subtitle_field: event.target.value || undefined })}>
                        <option value="">{t("common.none")}</option>
                        {fieldNames.map((field) => <option key={field} value={field}>{field}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>{t("graph.metaFields")}</span>
                      <Input value={(template.meta_fields ?? []).join(", ")} onChange={(event) => updateEditorNode(typeID, { meta_fields: splitCommaList(event.target.value) })} placeholder="status, batch" />
                    </label>
                    {canBridge && (
                      <label className="graph-bridge-toggle">
                        <Checkbox checked={Boolean(bridge)} onCheckedChange={(checked) => toggleEditorBridge(typeID, checked === true)} />
                        <span>{t("graph.foldIntoEdge")}</span>
                      </label>
                    )}
                    {bridge && (
                      <label className="graph-bridge-fields">
                        <span>{t("graph.edgeLabelFields")}</span>
                        <Input value={(bridge.label_fields ?? []).join(", ")} onChange={(event) => setEditorBridges((current) => ({ ...current, [typeID]: { ...current[typeID], label_fields: splitCommaList(event.target.value), aggregate: true } }))} placeholder="round, amount_text, announced_at" />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!editorOpen && (showingFullGraph ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div className="graph-surface relative overflow-hidden">
            <div className="absolute left-5 top-5 z-30 flex max-w-[calc(100%-220px)] flex-wrap gap-2">
              {fullGraph.graphTypeControls.map((lane) => (
                <button key={lane.type} type="button" className={`graph-type-chip ${lane.hidden ? "graph-type-chip-hidden" : ""}`} onClick={() => fullGraph.toggleGraphType(lane.type)} title={lane.hidden ? `Show ${lane.type}` : `Hide ${lane.type}`}>
                  <span className="graph-type-dot" style={{ background: graphTypeColor(lane.type) }} />
                  <span>{lane.type}</span>
                  <span className="font-mono opacity-60">{lane.count}</span>
                </button>
              ))}
            </div>
            <GraphCanvas graphView={fullGraph.graphView} selectedID={fullGraph.selectedGraphNode} select={fullGraph.setSelectedGraphNode} open={openObject} layoutKey={fullGraph.graphLayoutKey} relayout={fullGraph.relayoutGraph} onNodeClick={handleGraphNodeClick} onNodeDoubleClick={handleGraphNodeDoubleClick} />
          </div>
          <aside className="space-y-4">
            <Panel title={t("graph.fullMapMode")} icon={<Network className="size-4" />}>
              <Tabs value={fullGraph.graphMode} onValueChange={fullGraph.setGraphMode}>
                <TabsList className="acrylic rounded-lg">
                  <TabsTrigger value="core" className="rounded-md text-xs">{t("graph.core")}</TabsTrigger>
                  <TabsTrigger value="all" className="rounded-md text-xs">{t("graph.all")}</TabsTrigger>
                  <TabsTrigger value="founders" className="rounded-md text-xs">{t("graph.founders")}</TabsTrigger>
                  <TabsTrigger value="sources" className="rounded-md text-xs">{t("graph.sources")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mt-3 text-sm text-muted-foreground">{t("graph.visibleStats", { nodes: fullGraph.graphView.nodes.length, links: fullGraph.graphView.edges.length })}</div>
            </Panel>
            <Panel title={t("graph.visibleTypes")} icon={<Braces className="size-4" />}>
              <div className="space-y-2">
                {fullGraph.graphTypeControls.map((lane) => (
                  <button key={lane.type} type="button" className={`graph-type-row ${lane.hidden ? "graph-type-row-hidden" : ""}`} onClick={() => fullGraph.toggleGraphType(lane.type)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="graph-type-dot" style={{ background: graphTypeColor(lane.type) }} />
                      <span className="truncate">{lane.type}</span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{lane.hidden ? t("graph.hidden") : lane.count}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="mt-3 rounded-md px-2.5 py-1.5 text-xs text-[hsl(var(--earth))] transition hover:bg-foreground/[0.04] disabled:text-muted-foreground/45" onClick={fullGraph.showAllGraphTypes} disabled={fullGraph.hiddenGraphTypes.size === 0}>
                {t("graph.showAllTypes")}
              </button>
            </Panel>
            <Panel title={t("graph.selection")} icon={<Network className="size-4" />}>
              {fullGraph.selectedGraphObject ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">{fullGraph.selectedGraphObject.title || fullGraph.selectedGraphObject.id}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{fullGraph.selectedGraphObject.id}</div>
                  </div>
                  <Badge>{fullGraph.selectedGraphObject.type_id}</Badge>
                  <button className="rounded-xl px-3 py-2 text-sm text-[hsl(var(--earth))] transition hover:bg-foreground/[0.04]" onClick={() => openObject(fullGraph.selectedGraphObject!.id)}>{t("graph.openObject")}</button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{t("graph.selectionHelp")}</div>
              )}
            </Panel>
          </aside>
        </div>
      ) : (
        <div className={`graph-focus-shell ${detailsOpen ? "is-details-open" : ""} ${canvasFocus ? "is-canvas-focus" : ""}`}>
          <div className="graph-lab-canvas">
            {queryLoading ? (
              <div className="graph-query-loading"><Loader2 className="size-4 animate-spin" />{t("graph.runningQuery")}</div>
            ) : queryGraph ? (
              <RelationGraphCanvas graph={queryGraph} openObject={openObject} onNodeClick={handleGraphNodeClick} onNodeDoubleClick={handleGraphNodeDoubleClick} onEdgeClick={(edge) => {
                setSelectedProjectedEdge(edge as ProjectedGraphEdge);
                if (edge.derived) setDetailsOpen(true);
              }} />
            ) : (
              <EmptyState title={t("graph.noResultTitle")} description={centerCandidates.length === 0 ? t("graph.noTypeObjects", { type: rootType }) : t("graph.selectCenterDescription")} />
            )}
          </div>
          <div className="graph-canvas-mode-controls">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="relation-canvas-tool" onClick={() => setCanvasFocus((current) => !current)} aria-label={canvasFocus ? t("graph.exitCanvasFocus") : t("graph.enterCanvasFocus")}>
                  {canvasFocus ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{canvasFocus ? t("graph.exitCanvasFocus") : t("graph.enterCanvasFocus")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="relation-canvas-tool" onClick={() => setDetailsOpen((current) => !current)} aria-label={detailsOpen ? t("graph.collapseDetails") : t("graph.expandDetails")}>
                  {detailsOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{detailsOpen ? t("graph.collapseDetails") : t("graph.expandDetails")}</TooltipContent>
            </Tooltip>
          </div>
          <button className={`graph-details-backdrop ${detailsOpen ? "is-open" : ""}`} onClick={() => setDetailsOpen(false)} aria-label={t("graph.collapseDetails")} />
          <aside className="graph-lab-panel graph-canvas-details">
            <div className="graph-canvas-details-header">
              <span>{t("graph.viewDetails")}</span>
              <Button size="icon" variant="ghost" onClick={() => setDetailsOpen(false)} aria-label={t("graph.collapseDetails")}>
                <PanelRightClose className="size-4" />
              </Button>
            </div>
            <Panel title={t("graph.currentView")} icon={<Play className="size-4" />}>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div><span className="text-foreground/80">{t("graph.view")}:</span> {activeDefinition?.label}</div>
                <div><span className="text-foreground/80">{t("graph.centerType")}:</span> {rootType}</div>
                <div><span className="text-foreground/80">{t("graph.center")}:</span> {centerObject ? objectDisplayTitle(centerObject) : t("common.none")}</div>
                <div><span className="text-foreground/80">{t("graph.source")}:</span> {configLoading ? t("graph.loadingConfig") : t("graph.vaultConfig")}</div>
                <div><span className="text-foreground/80">{t("graph.nodes")}:</span> {queryNodes.length}</div>
                <div><span className="text-foreground/80">{t("graph.edges")}:</span> {queryGraph?.edges.length ?? 0}</div>
                <div><span className="text-foreground/80">{t("graph.derivedEdges")}:</span> {projectedResult?.stats.derived_edges ?? 0}</div>
              </div>
            </Panel>
            {selectedProjectedEdge?.derived && (
              <Panel title={t("graph.bridgeDetails")} icon={<GitBranch className="size-4" />}>
                <div className="space-y-3">
                  <div className="text-sm font-medium">{selectedProjectedEdge.label || selectedProjectedEdge.relation}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{selectedProjectedEdge.from_id} → {selectedProjectedEdge.to_id}</div>
                  <div className="space-y-1.5">
                    {(selectedProjectedEdge.via ?? []).map((via) => (
                      <button key={via.id} className="graph-bridge-object" onClick={() => void openMarkdownPreview(via.id)}>
                        <span>{via.title || via.id}</span>
                        <span>{via.type_id}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </Panel>
            )}
            <Panel title={t("graph.groups")} icon={<Braces className="size-4" />}>
              <div className="graph-lab-groups">
                {queryGroups.map((group) => (
                  <div key={group.id} className="graph-lab-group">
                    <div className="graph-lab-group-head">
                      <span>{group.label}</span>
                      <span>{group.items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {group.items.slice(0, 10).map((item) => (
                        <button key={item.id} className="graph-lab-order-row" onClick={() => openObject(item.id)}>
                          <span className="truncate">{item.title}</span>
                          <span>{item.type}</span>
                        </button>
                      ))}
                      {group.items.length > 10 && <div className="graph-lab-more">+{group.items.length - 10} more</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      ))}
      <Dialog open={!readOnly && deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="graph-delete-dialog">
          <DialogHeader>
            <DialogTitle>{t("graph.deleteViewTitle", { name: editorLabel || editorOriginalID })}</DialogTitle>
            <DialogDescription>{t("graph.deleteViewDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)} disabled={configSaving}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => void deleteGraphView(editorOriginalID ?? undefined)} disabled={configSaving}>
              <Trash2 className="size-4" />
              {t("graph.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="graph-markdown-dialog">
          <DialogHeader>
            <DialogTitle>{previewObject?.title || previewObject?.id || t("graph.loadingObject")}</DialogTitle>
            <DialogDescription>
              {previewObject ? `${previewObject.type_id} · ${previewObject.id}` : t("graph.loadingMarkdownBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="graph-markdown-actions">
            {previewObject && (
              <>
                <Button variant="secondary" size="sm" className="rounded-md" onClick={() => openObject(previewObject.id)}>
                  <Eye className="size-3.5" />
                  {t("graph.openObject")}
                </Button>
                {configuredViews.some((view) => view.root_type === previewObject.type_id) && (
                  <Button size="sm" className="rounded-md" onClick={() => void setCenterFromNode(previewObject.id)}>
                    <Network className="size-3.5" />
                    {t("graph.setCenter")}
                  </Button>
                )}
              </>
            )}
          </div>
          <ScrollArea className="graph-markdown-scroll">
            {previewLoading && (
              <div className="graph-markdown-loading">
                <Loader2 className="size-4 animate-spin" />
                {t("graph.loadingBody")}
              </div>
            )}
            {!previewLoading && previewObject && (
              <div className="markdown">
                <MarkdownBody body={objectBodyForDisplay(previewObject, previewBody)} object={previewObject} vault={vault} objectTitleByID={previewTitleByID} openObject={(id) => void openMarkdownPreview(id)} imageLoading="eager" />
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GraphLabPage({ object, graph, links, backlinks, vault, openObject }: { object: Obj | null; graph: GraphData; links: Link[]; backlinks: Link[]; vault: string; openObject: (id: string) => void }) {
  const { t } = useTranslation();
  const [viewConfig, setViewConfig] = useState<GraphViewConfig>({ version: 1, views: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorID, setEditorID] = useState("");
  const [editorLabel, setEditorLabel] = useState("");
  const [editorSteps, setEditorSteps] = useState("");
  const templates = useMemo(() => relationQueryTemplatesFor(object?.type_id ?? "", viewConfig), [object?.type_id, viewConfig]);
  const [activeTemplateID, setActiveTemplateID] = useState(templates[0]?.id ?? "nearby");
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    run<GraphViewConfig>(["graph", "views"], vault).then((result) => {
      if (cancelled) return;
      setViewConfig(normalizeGraphViewConfigForUI(result.data));
    }).catch(() => {
      if (!cancelled) setViewConfig({ version: 1, views: [] });
    }).finally(() => {
      if (!cancelled) setConfigLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vault]);
  useEffect(() => {
    if (!templates.some((template) => template.id === activeTemplateID) || (activeTemplateID === "nearby" && templates[0]?.id !== "nearby")) {
      setActiveTemplateID(templates[0]?.id ?? "nearby");
    }
  }, [activeTemplateID, templates]);
  const activeTemplate = templates.find((template) => template.id === activeTemplateID) ?? templates[0] ?? relationNearbyTemplate();
  const labGraph = useMemo(() => {
    if (!object) return null;
    if (activeTemplate.id === "nearby") return buildInspectorRelationGraph(object, links, backlinks, graph.nodes);
    return buildInspectorQueryGraph(object, graph.nodes, graph.edges, activeTemplate, []);
  }, [object, activeTemplate, links, backlinks, graph.nodes, graph.edges]);
  const nodes = labGraph ? [labGraph.focus, ...labGraph.incoming, ...labGraph.outgoing] : [];
  const groups = labGraph ? relationGraphGroups(labGraph, nodes) : [];
  const editableTemplate = activeTemplate.configurable ? activeTemplate : templates.find((template) => template.configurable);

  function toggleGraphViewEditor() {
    if (editorOpen) {
      setEditorOpen(false);
      return;
    }
    const source = editableTemplate;
    setEditorID(source?.id ?? slugifyGraphViewLabel(`${object?.type_id || "object"} view`));
    setEditorLabel(source?.label ?? `${object?.type_id || "object"} view`);
    setEditorSteps(source ? relationStepsToText(source.steps) : "");
    setEditorOpen(true);
  }

  async function saveGraphView() {
    if (!object) return;
    const id = editorID.trim();
    const label = editorLabel.trim();
    const parsed = parseRelationStepsText(editorSteps);
    if (!id || !label || parsed.error || parsed.steps.length === 0) {
      toast.error(parsed.error || t("graph.requiredViewFields"));
      return;
    }
    const nextView: GraphViewDefinition = {
      id,
      label,
      root_type: object.type_id,
      description: `Follow ${relationQueryPathLabel(object.type_id, parsed.steps)} from the current ${object.type_id}`,
      steps: parsed.steps.map((step) => ({ relation: step.relation, direction: step.direction, target_type: step.targetType }))
    };
    const nextConfig = {
      version: 1,
      views: [...viewConfig.views.filter((view) => view.id !== id), nextView]
    };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "views", "write", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.saveFailed"));
      return;
    }
    const normalized = normalizeGraphViewConfigForUI(result.data);
    setViewConfig(normalized);
    setActiveTemplateID(id);
    setEditorOpen(false);
    toast.success(t("graph.viewSaved"));
  }

  async function deleteGraphView() {
    const id = editorID.trim();
    if (!id) return;
    const nextConfig = { version: 1, views: viewConfig.views.filter((view) => view.id !== id) };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "views", "write", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.deleteFailed"));
      return;
    }
    setViewConfig(normalizeGraphViewConfigForUI(result.data));
    setActiveTemplateID("nearby");
    setEditorOpen(false);
    toast.success(t("graph.viewDeleted"));
  }

  const viewSource = activeTemplate.configurable ? t("graph.vaultConfig") : configLoading ? t("graph.loadingConfig") : t("graph.builtIn");

  return (
    <section className="graph-lab-page">
      <div className="graph-lab-header">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("graph.viewer")}</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">{object?.title || object?.id || t("graph.noObjectLoaded")}</h1>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{object?.id || t("graph.useGraphLabUrl")}</div>
        </div>
        <div className="graph-lab-actions">
          {templates.map((template) => (
            <button key={template.id} className={`relation-view-chip ${activeTemplate.id === template.id ? "is-active" : ""}`} onClick={() => setActiveTemplateID(template.id)}>
              {template.label}
            </button>
          ))}
          <button className="relation-view-chip" onClick={toggleGraphViewEditor}>
            {t("graph.configure")}
          </button>
        </div>
      </div>
      <div className="graph-lab-layout">
        <div className="graph-lab-canvas">
          {labGraph ? <RelationGraphCanvas graph={labGraph} openObject={openObject} /> : <EmptyState title={t("common.noGraph")} description={t("graph.openGraphLabUrl")} />}
        </div>
        <aside className="graph-lab-panel">
          <Panel title={t("graph.currentView")} icon={<Play className="size-4" />}>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div><span className="text-foreground/80">{t("graph.path")}:</span> {activeTemplate.label}</div>
              <div>{activeTemplate.description}</div>
              <div><span className="text-foreground/80">{t("graph.source")}:</span> {viewSource}</div>
              <div><span className="text-foreground/80">{t("graph.nodes")}:</span> {nodes.length}</div>
              <div><span className="text-foreground/80">{t("graph.edges")}:</span> {labGraph?.edges.length ?? 0}</div>
            </div>
          </Panel>
          {editorOpen && (
            <Panel title={t("graph.configureView")} icon={<Edit3 className="size-4" />}>
              <div className="graph-view-editor">
                <label>
                  <span>{t("graph.id")}</span>
                  <Input value={editorID} onChange={(event) => setEditorID(event.target.value)} placeholder="investment-chain" />
                </label>
                <label>
                  <span>{t("graph.label")}</span>
                  <Input value={editorLabel} onChange={(event) => setEditorLabel(event.target.value)} placeholder="Investment chain" />
                </label>
                <label>
                  <span>{t("graph.steps")}</span>
                  <textarea value={editorSteps} onChange={(event) => setEditorSteps(event.target.value)} placeholder={"in investor investment\nout company company"} />
                </label>
                <div className="graph-view-editor-help">{t("graph.editorHelp")}</div>
                <div className="graph-view-editor-actions">
                  <Button size="sm" onClick={() => void saveGraphView()} disabled={configSaving || !object}>
                    <Save className="size-3.5" />
                    {t("graph.save")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void deleteGraphView()} disabled={configSaving || !editableTemplate}>
                    <X className="size-3.5" />
                    {t("graph.delete")}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
          <Panel title={t("graph.howToUse")} icon={<Move className="size-4" />}>
            <div className="graph-lab-help">
              <div><Move className="size-3.5" /> {t("graph.helpPan")}</div>
              <div><ZoomIn className="size-3.5" /> {t("graph.helpZoom")}</div>
              <div><Network className="size-3.5" /> {t("graph.helpHover")}</div>
              <div><Eye className="size-3.5" /> {t("graph.helpClick")}</div>
            </div>
          </Panel>
          <Panel title={t("graph.groups")} icon={<Braces className="size-4" />}>
            <div className="graph-lab-groups">
              {groups.map((group) => (
                <div key={group.id} className="graph-lab-group">
                  <div className="graph-lab-group-head">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {group.items.slice(0, 10).map((item) => (
                      <button key={item.id} className="graph-lab-order-row" onClick={() => openObject(item.id)}>
                        <span className="truncate">{item.title}</span>
                        <span>{item.type}</span>
                      </button>
                    ))}
                    {group.items.length > 10 && <div className="graph-lab-more">{t("graph.more", { count: group.items.length - 10 })}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
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
  const semanticColors = [
    ["background", "page canvas"],
    ["foreground", "primary text"],
    ["card", "raised surface"],
    ["card-foreground", "surface text"],
    ["surface", "soft panel"],
    ["surface-soft", "subtle band"],
    ["muted", "quiet fill"],
    ["muted-foreground", "secondary text"],
    ["border", "hairline"],
    ["input", "control border"],
    ["ring", "focus ring"],
    ["popover", "floating surface"],
    ["popover-foreground", "popover text"],
    ["sidebar", "app chrome"]
  ];
  const actionColors = [
    ["primary", "primary action"],
    ["primary-foreground", "on primary"],
    ["secondary", "secondary fill"],
    ["secondary-foreground", "secondary text"],
    ["accent", "hover/focus fill"],
    ["accent-foreground", "accent text"],
    ["destructive", "danger"],
    ["destructive-foreground", "on danger"]
  ];
  const accentColors = [
    ["earth", "mineral link"],
    ["clay", "fired clay"],
    ["teal", "selection/focus"],
    ["teal-soft", "mint auxiliary"],
    ["moss", "success/organic"],
    ["shadow-warm", "shadow tone"]
  ];
  return (
    <div className="vi-foundations-page">
      <VIBlock title="Semantic tokens">
        <div className="vi-color-grid vi-color-grid-semantic">
          {semanticColors.map(([name, role]) => <VIColorSwatch key={name} name={name} role={role} />)}
        </div>
      </VIBlock>
      <VIBlock title="Action tokens">
        <div className="vi-color-grid">
          {actionColors.map(([name, role]) => <VIColorSwatch key={name} name={name} role={role} />)}
        </div>
      </VIBlock>
      <VIBlock title="Accent tokens">
        <div className="vi-color-grid">
          {accentColors.map(([name, role]) => <VIColorSwatch key={name} name={name} role={role} />)}
        </div>
      </VIBlock>
      <VIBlock title="Typography">
        <div className="space-y-3">
          <h2 className="font-serif text-4xl font-medium tracking-tight">Editorial title</h2>
          <div className="text-sm text-foreground/82">Interface body text keeps the product quiet, readable, and useful for repeated work.</div>
          <code className="font-mono text-xs text-muted-foreground">note.lightsprint.product-takeaway</code>
        </div>
      </VIBlock>
      <VIBlock title="Surface layering">
        <div className="vi-surface-stack">
          <div className="vi-surface-sample vi-surface-background">
            <span>background</span>
            <div className="vi-surface-sample vi-surface-card">
              <span>card</span>
              <div className="vi-surface-sample vi-surface-soft">
                <span>surface-soft</span>
              </div>
            </div>
          </div>
          <div className="vi-type-row">
            <span className="text-foreground">foreground</span>
            <span className="text-muted-foreground">muted foreground</span>
            <span className="font-mono text-[hsl(var(--teal))]">teal state</span>
          </div>
        </div>
      </VIBlock>
      <VIBlock title="Component usage">
        <div className="vi-foundation-components">
          <div className="flex flex-wrap items-center gap-2">
            <Button><Save className="size-4" />Primary</Button>
            <Button variant="secondary"><Download className="size-4" />Secondary</Button>
            <Button variant="ghost"><Link2 className="size-4" />Ghost</Button>
            <Button variant="status" disabled><Loader2 className="size-4 animate-spin" />Status</Button>
          </div>
          <div className="grid gap-2">
            <Input placeholder="where, e.g. status=active" className="font-mono text-xs" />
            <Tabs defaultValue="table" className="w-fit">
              <TabsList>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="api">API</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>company</Badge>
            <Badge>source.item</Badge>
            <Badge>resolved</Badge>
            <Badge>active</Badge>
          </div>
        </div>
      </VIBlock>
    </div>
  );
}

const viColorHex: Record<string, string> = {
  background: "#FAFAF8",
  foreground: "#1B1F1E",
  card: "#FFFFFF",
  "card-foreground": "#1B1F1E",
  surface: "#FFFFFF",
  "surface-soft": "#F4F5F3",
  muted: "#F4F5F3",
  "muted-foreground": "#5B6461",
  border: "#E5E9E7",
  input: "#E5E9E7",
  ring: "#176A66",
  popover: "#FFFFFF",
  "popover-foreground": "#1B1F1E",
  sidebar: "#F4F5F3",
  primary: "#B46F5A",
  "primary-foreground": "#FAFAF8",
  secondary: "#F4F5F3",
  "secondary-foreground": "#1B1F1E",
  accent: "#E4F5F1",
  "accent-foreground": "#125652",
  destructive: "#C72727",
  "destructive-foreground": "#FAFAF8",
  earth: "#176A66",
  clay: "#B46F5A",
  teal: "#176A66",
  "teal-soft": "#A7E1D6",
  moss: "#61795D",
  "shadow-warm": "#635149"
};

function VIColorSwatch({ name, role }: { name: string; role: string }) {
  return (
    <div className="vi-color-swatch">
      <div className="vi-color-chip" style={{ background: `hsl(var(--${name}))` }} />
      <div className="min-w-0">
        <div className="vi-color-name">--{name}</div>
        <div className="vi-color-role">{role}</div>
        <div className="vi-color-hex">{viColorHex[name]}</div>
      </div>
    </div>
  );
}

function VIControls() {
  return (
    <div className="vi-controls-page">
      <div className="vi-controls-context">
        <div>
          <div className="vi-control-kicker">active body</div>
          <div className="vi-control-object">company.lightsprint</div>
        </div>
        <div className="vi-control-thread">
          <span>body</span>
          <ChevronRight className="size-3" />
          <span>[[source.yc-launch.lightsprint]]</span>
          <ChevronRight className="size-3" />
          <span className="vi-control-thread-active">linked</span>
        </div>
        <div className="vi-control-status">
          <span className="vi-teal-dot" />
          saved locally
        </div>
      </div>

      <div className="vi-controls-bench">
        <section className="vi-control-section vi-control-section-actions">
          <div className="vi-block-title">Actions</div>
          <div className="vi-action-row">
            <Button><Save className="size-4" />Save</Button>
            <Button variant="secondary"><Download className="size-4" />Export</Button>
            <Button variant="ghost"><Link2 className="size-4" />Link</Button>
            <Button variant="status" disabled><Loader2 className="size-4 animate-spin" />Saving</Button>
          </div>
          <div className="vi-control-note">Primary is warm and explicit. Teal stays for state, focus, and secondary signals.</div>
        </section>

        <section className="vi-control-section">
          <div className="vi-block-title">Filter & mode</div>
          <div className="vi-filter-row">
            <Input placeholder="where, e.g. status=active" className="min-w-[17rem] flex-1 font-mono text-xs" />
            <Select defaultValue="split">
              <SelectTrigger className="w-[8.6rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="write">Write</SelectItem>
                <SelectItem value="split">Split</SelectItem>
                <SelectItem value="preview">Preview</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="vi-mode-pills">
            <span>Write</span>
            <span className="vi-mode-pill-active">Split</span>
            <span>Preview</span>
          </div>
        </section>

        <section className="vi-control-section">
          <div className="vi-block-title">Command & views</div>
          <div className="vi-command-row">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary"><Search className="size-4" />Open command</Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 rounded-xl border-border/55 p-0 shadow-[0_16px_42px_-32px_hsl(var(--shadow-warm)/0.4)]">
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
            <Tabs defaultValue="table" className="min-w-44">
              <TabsList>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="api">API</TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="mt-2 text-xs text-muted-foreground">Table view state.</TabsContent>
              <TabsContent value="api" className="mt-2 text-xs text-muted-foreground">API view state.</TabsContent>
            </Tabs>
          </div>
        </section>
      </div>

      <div className="vi-controls-examples">
        <div className="vi-control-example">
          <span className="vi-example-label">selection</span>
          <span>company.lightsprint</span>
        </div>
        <div className="vi-control-example">
          <span className="vi-example-label">source</span>
          <span>source.yc-launch.lightsprint</span>
        </div>
        <div className="vi-control-example vi-control-example-active">
          <span className="vi-example-label">focus</span>
          <span>body link resolved</span>
        </div>
      </div>
    </div>
  );
}

function VIObject() {
  const object = viObject();
  const titleByID = viObjectTitleByID();
  return (
    <div className="vi-grid">
      <VIBlock title="Object Header">
        <ObjectPageContent object={object} body={"# Lightsprint\n\nA focused product profile with [[source.yc-launch.lightsprint]]."} vault="" objectTitleByID={titleByID} openObject={() => undefined} />
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
  const titleByID = viObjectTitleByID();
  return (
    <div className="vi-wide">
      <ObjectBodyWorkspace
        object={object}
        body={viMarkdownBody()}
        vault=""
        candidates={[{ id: "source.yc-launch.lightsprint", title: "YC Launch", type_id: "source.item" }, { id: "concept.agentic-sdlc", title: "Agentic SDLC", type_id: "concept" }]}
        objectTitleByID={titleByID}
        openObject={() => undefined}
        saveBody={async () => null}
        initialEditing
      />
    </div>
  );
}

function VIMarkdown() {
  const checks = [
    ["Wiki links", "[[id]] renders with title and keeps object identity"],
    ["Reading rhythm", "paragraphs, headings, quotes, lists, and footnotes"],
    ["Evidence blocks", "facts, tables, task lists, code, timeline"],
    ["Media", "captioned image, wide image, inline image, lightbox"]
  ];
  return (
    <div className="vi-markdown-page">
      <aside className="vi-markdown-brief">
        <div className="vi-control-kicker">Markdown system</div>
        <h2>Research memo rendering</h2>
        <p>One fixture exercises the body renderer with the elements people and agents will use most often.</p>
        <div className="vi-markdown-checks">
          {checks.map(([title, detail]) => (
            <div key={title} className="vi-markdown-check">
              <Check className="size-3.5" />
              <div>
                <strong>{title}</strong>
                <span>{detail}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <article className="vi-reader markdown">
        <MarkdownBody body={viMarkdownBody()} object={viObject()} vault="" objectTitleByID={viObjectTitleByID()} openObject={() => undefined} imageLoading="eager" />
      </article>
    </div>
  );
}

function VIData() {
  const fields: FieldDef[] = [
    { name: "status", kind: "enum", enum_values: ["parsed", "linked", "discarded"] },
    { name: "url", kind: "url" },
    { name: "about_company", kind: "ref", target_type: "company" }
  ];
  const rows = [
    { id: "source.yc-launch.lightsprint", title: "YC Launch", status: "parsed", url: "https://www.ycombinator.com/launches", about_company: "company.lightsprint" },
    { id: "source.docs.lightsprint", title: "Docs snapshot", status: "linked", url: "https://lightsprint.com/docs", about_company: "company.lightsprint" }
  ];
  const [filter, setFilter] = useState("");
  return (
    <div className="vi-grid">
      <VIBlock title="Object Table">
        <div className="mb-3">
          <ObjectFilterBar rows={rows} fields={fields} filter={filter} setFilter={setFilter} />
        </div>
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
    body_abs_path: "/tmp/memex-demo/bodies/company.lightsprint.md",
    fields: { status: "active", tags: ["agentic-sdlc", "demo-led"], homepage_url: "https://lightsprint.com" }
  };
}

function viObjectTitleByID() {
  return {
    "company.lightsprint": "Lightsprint",
    "source.yc-launch.lightsprint": "YC Launch",
    "concept.agentic-sdlc": "Agentic SDLC",
    "concept.demo-led-growth": "Demo-led Growth",
    "note.lightsprint-gtm-takeaway": "Lightsprint GTM Takeaway",
    "person.elena-marin": "Elena Marin"
  };
}

function viMarkdownBody() {
  return `# Lightsprint research memo

Lightsprint is a concise sample profile linked to [[source.yc-launch.lightsprint]] and [[concept.agentic-sdlc]]. This page is intentionally written like a working research memo: structured enough for agents, but still calm and readable for people.

The core reading path should feel editorial. Inline links such as [[concept.demo-led-growth]] and [[person.elena-marin]] should render as titles, not raw ids, while still preserving the object target.

![Product surface {wide}](https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1600&auto=format&fit=crop)

## Snapshot

\`\`\`facts
Status: Active
Category: Agentic SDLC
Motion: Product-led
Evidence: YC launch, product demo, website
Open questions: pricing, retention, founder-led distribution
\`\`\`

## Reading notes

The first pass should answer what the company is, why it matters, and which source items support the current judgement.[^source] Secondary details can remain nearby without turning the page into a database dump.

> Keep source evidence separate from human judgement. The quote style should feel editorial: enough contrast to slow the reader down, not a warning banner.

- Product surface
  - agentic software delivery workflow
  - demo-first positioning
  - potential link to [[concept.agentic-sdlc]]
- Evidence quality
  - [x] YC launch captured
  - [x] Website reviewed
  - [ ] Pricing and retention still missing

## Evidence matrix

| Signal | Reading |
| --- | --- |
| Launch | Strong developer demo |
| Motion | Product-led, likely founder-led sales early |
| Source | [[source.yc-launch.lightsprint]] supports the first summary |
| Reusable concept | [[concept.demo-led-growth]] may apply if demo loops are visible |

![Inline interface cue {inline}](https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=720&auto=format&fit=crop) Inline images should stay small when explicitly marked, useful for logos, thumbnails, or compact product cues inside a paragraph.

## Nested reasoning

1. Start from the object.
   1. Identify durable fields: name, category, status, homepage.
   2. Link durable relationships through schema fields.
      1. founders
      2. source items
      3. related concepts
2. Move interpretation into notes.
   - The company body stays as the synthesized profile.
   - [[note.lightsprint-gtm-takeaway]] keeps the human judgement addressable.
3. Refresh body links after edits.

   \`\`\`bash
   mmx -C "$VAULT" body refresh company.lightsprint
   mmx -C "$VAULT" get company.lightsprint --body-preview 800
   \`\`\`

<details>
<summary>Research notes</summary>

This folded section keeps raw notes available without interrupting the reading rhythm.

- Raw capture can include uncertain phrasing.
- Follow-up questions remain visible but not dominant.
- Keyboard hints like <kbd>Cmd</kbd> + <kbd>K</kbd> should sit naturally in prose.

</details>

## Timeline

\`\`\`timeline
2026-01 | YC launch captured
2026-02 | Product demo reviewed
2026-03 | GTM takeaway linked to [[note.lightsprint-gtm-takeaway]]
\`\`\`

## Diagram

\`\`\`plantuml
@startuml
skinparam backgroundColor transparent
skinparam defaultFontName Inter
skinparam shadowing false
actor "Human" as Human
participant "Memex Web UI" as UI
database "SQLite graph" as DB
Human -> UI: Edit Markdown body
UI -> DB: Save body and refresh links
DB --> UI: Updated object graph
@enduml
\`\`\`

## Implementation note

\`\`\`ts
type BodyLink = {
  from: "company.lightsprint";
  to: "source.yc-launch.lightsprint";
  relation: "mentions" | "supports";
};
\`\`\`

Footnotes keep evidence references nearby without crowding the main paragraph.[^source]

[^source]: This is a compact footnote rendered at the end of the document.
`;
}

function renderCell(v: unknown) {
  if (Array.isArray(v)) return <span className="flex flex-wrap gap-1">{v.map((x) => <Badge key={String(x)}>{String(x)}</Badge>)}</span>;
  if (v === undefined || v === null || v === "") return <span className="text-muted-foreground">—</span>;
  return String(v);
}

function cleanDisplayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function objectDisplayTitle(object: Obj | null | undefined) {
  if (!object) return "";
  return cleanDisplayValue(object.title) || cleanDisplayValue(object.fields?.name) || cleanDisplayValue(object.fields?.label) || object.id;
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

function buildObjectTitleByID(activeObject: Obj | null, rows: Record<string, unknown>[], graphNodes: Obj[]) {
  const titles: Record<string, string> = {};
  const add = (id: string, title: unknown) => {
    if (!id || titles[id]) return;
    const cleanTitle = typeof title === "string" && title.trim() ? title.trim() : id;
    titles[id] = cleanTitle;
  };
  if (activeObject) add(activeObject.id, activeObject.title);
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    add(id, row.title || row.name || id);
  }
  for (const node of graphNodes) {
    add(node.id, node.title || node.id);
  }
  return titles;
}

function objectBodyForDisplay(object: Obj, body: string) {
  return body || `# ${object.title || object.id}\n\nBody file: \`${object.body_path}\``;
}

function ObjectBodyWorkspace({
  object,
  body,
  vault,
  candidates,
  objectTitleByID,
  openObject,
  saveBody,
  onBeginEdit,
  inspectorToggle,
  inspectorPanel,
  initialEditing = false,
  readOnly = false
}: {
  object: Obj;
  body: string;
  vault: string;
  candidates: ObjectLinkCandidate[];
  objectTitleByID?: Record<string, string>;
  openObject: (id: string) => void;
  saveBody: (id: string, markdown: string) => Promise<ObjectLoadResult | null>;
  onBeginEdit?: () => void;
  inspectorToggle?: React.ReactNode;
  inspectorPanel?: React.ReactNode;
  initialEditing?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
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
    const next = body || `# ${object.title || object.id}\n\n`;
    setDraft(next);
    selectionRef.current = { start: next.length, end: next.length };
    setEditing(initialEditing);
    setJustSaved(false);
  }, [object.id, body, initialEditing]);

  function beginEdit() {
    const next = body || `# ${object.title || object.id}\n\n`;
    setDraft(next);
    selectionRef.current = { start: next.length, end: next.length };
    onBeginEdit?.();
    setEditing(true);
    requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.length, next.length);
    });
  }

  function cancelEdit() {
    const next = body || `# ${object.title || object.id}\n\n`;
    setDraft(next);
    selectionRef.current = { start: next.length, end: next.length };
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
      toast.success(t("status.saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Could not save body: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function rememberSelection() {
    const input = textareaRef.current;
    if (!input) return;
    selectionRef.current = { start: input.selectionStart, end: input.selectionEnd };
  }

  function insertText(value: string, replaceOpeningWiki = false) {
    const input = textareaRef.current;
    const liveSelection = input && document.activeElement === input
      ? { start: input.selectionStart, end: input.selectionEnd }
      : null;
    const selection = liveSelection ?? (input ? selectionRef.current : { start: draft.length, end: draft.length });
    const selectionStart = Math.min(selection.start, draft.length);
    const selectionEnd = Math.min(selection.end, draft.length);
    const replaceStart = replaceOpeningWiki && draft.slice(0, selectionStart).endsWith("[[") ? selectionStart - 2 : selectionStart;
    const prefix = draft.slice(0, replaceStart);
    const suffix = draft.slice(selectionEnd);
    const needsLeadingBreak = value.startsWith("\n") && prefix.length > 0 && !prefix.endsWith("\n");
    const nextValue = needsLeadingBreak ? `\n${value}` : value;
    const next = `${prefix}${nextValue}${suffix}`;
    const cursor = replaceStart + nextValue.length;
    selectionRef.current = { start: cursor, end: cursor };
    setDraft(next);
    if (input) {
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(cursor, cursor);
      });
    }
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
      const snippets: string[] = [];
      for (const file of images) {
        const result = await uploadAsset(file, vault);
        if (!result.ok || !result.data) {
          throw new Error(result.error?.message || `Could not import ${file.name}`);
        }
        snippets.push(result.data.markdown);
      }
      insertText(`\n\n${snippets.join("\n\n")}\n\n`);
      toast.success(images.length === 1 ? t("bodyEditor.insertImage") : `${images.length} ${t("bodyEditor.insertImage")}`);
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
    selectionRef.current = { start: cursor, end: event.target.selectionEnd };
    if (next.slice(0, cursor).endsWith("[[")) {
      setLinkPickerOpen(true);
    }
  }

  const status = saving ? t("status.saving") : uploading ? t("status.importingImage") : dirty ? t("status.unsavedChanges") : justSaved ? t("status.saved") : t("status.saved");
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
          {!readOnly && <span className={`body-save-state ${dirty ? "body-save-state-dirty" : ""}`}>
            {(saving || uploading) && <Loader2 className="size-3.5 animate-spin" />}
            {status}
          </span>}
          {inspectorToggle}
          {!readOnly && (editing ? (
            <>
              <Button variant="ghost" className="h-8 rounded-md px-2.5" onClick={cancelEdit} disabled={saving}><X className="size-3.5" />{t("common.cancel")}</Button>
              <Button className="h-8 rounded-md px-3" onClick={() => void commitBody()} disabled={saving || uploading || !dirty}><Save className="size-3.5" />{t("bodyEditor.save")}</Button>
            </>
          ) : (
            <Button className="h-8 rounded-md px-3" onClick={beginEdit}><Edit3 className="size-3.5" />{t("bodyEditor.write")}</Button>
          ))}
          {inspectorPanel}
        </div>
      </div>

      {editing ? (
        <div className="body-editor-shell">
          <div className="body-editor-toolbar">
            <div className="flex items-center gap-1">
              <ToolbarButton active={viewMode === "write"} onClick={() => setViewMode("write")} title={t("bodyEditor.write")}><Edit3 className="size-3.5" />{t("bodyEditor.write")}</ToolbarButton>
              <ToolbarButton active={viewMode === "split"} onClick={() => setViewMode("split")} title={t("bodyEditor.split")}><SplitSquareHorizontal className="size-3.5" />{t("bodyEditor.split")}</ToolbarButton>
              <ToolbarButton active={viewMode === "preview"} onClick={() => setViewMode("preview")} title={t("bodyEditor.read")}><Eye className="size-3.5" />{t("bodyEditor.read")}</ToolbarButton>
            </div>
            <div className="flex items-center gap-1">
              <Popover open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="h-8 rounded-md px-2.5"><Link2 className="size-3.5" />{t("bodyEditor.linkObjects")}</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 rounded-2xl p-0">
                  <Command shouldFilter>
                    <CommandInput placeholder={t("bodyEditor.linkObjects")} />
                    <CommandList>
                      <CommandEmpty>{t("objects.emptyTitle")}</CommandEmpty>
                      <CommandGroup heading={t("nav.objects")}>
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
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground" onMouseDown={rememberSelection}>
                <ImagePlus className="size-3.5" />
                {t("bodyEditor.insertImage")}
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
                  onClick={rememberSelection}
                  onKeyUp={rememberSelection}
                  onSelect={rememberSelection}
                  onPaste={(event) => {
                    if (event.clipboardData.files.length > 0) {
                      event.preventDefault();
                      rememberSelection();
                      void importFiles(event.clipboardData.files);
                    }
                  }}
                />
                <div className="body-drop-hint"><FileImage className="size-3.5" />{t("bodyEditor.dropHint")}</div>
              </div>
            )}
            {viewMode !== "write" && (
              <div className="body-preview-pane markdown">
                <MarkdownBody body={draft || objectBodyForDisplay(object, body)} object={object} vault={vault} objectTitleByID={objectTitleByID} openObject={openObject} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="markdown body-reader-surface">
          <MarkdownBody body={objectBodyForDisplay(object, body)} object={object} vault={vault} objectTitleByID={objectTitleByID} openObject={openObject} />
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
  objectTitleByID,
  openObject,
  imageLoading = "lazy"
}: {
  object: Obj;
  body: string;
  vault: string;
  objectTitleByID?: Record<string, string>;
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
        <MarkdownBody body={objectBodyForDisplay(object, body)} object={object} vault={vault} objectTitleByID={objectTitleByID} openObject={openObject} imageLoading={imageLoading} />
      </div>
    </>
  );
}

function MarkdownBody({
  body,
  object,
  vault,
  objectTitleByID = {},
  openObject,
  imageLoading = "lazy"
}: {
  body: string;
  object: Obj | null;
  vault: string;
  objectTitleByID?: Record<string, string>;
  openObject: (id: string) => void;
  imageLoading?: "lazy" | "eager";
}) {
  const rendered = useMemo(() => normalizeMarkdownBody(body, objectTitleByID), [body, objectTitleByID]);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const objectID = objectIDFromInternalHref(href);
            if (objectID) {
              return (
                <button className="markdown-wikilink" type="button" onClick={() => openObject(objectID)} title={objectID}>
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
          blockquote: ({ node: _node, children, ...props }) => <blockquote {...props}>{children}</blockquote>,
          code: ({ node: _node, className, children, ...props }) => <MarkdownCode className={className} {...props}>{children}</MarkdownCode>,
          p: ({ node: _node, children, ...props }) => {
            const onlyChild = Array.isArray(children) && children.length === 1 ? children[0] : children;
            if (isMarkdownFigure(onlyChild)) return onlyChild;
            return <p {...props}>{children}</p>;
          },
          pre: ({ node: _node, children, ...props }) => {
            const child = Array.isArray(children) ? children[0] : children;
            if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
              const language = /language-([A-Za-z0-9_-]+)/.exec(child.props.className ?? "")?.[1]?.toLowerCase();
              const source = String(child.props.children ?? "").replace(/\n$/, "");
              if (language === "mermaid") return <MermaidDiagram source={source} />;
              if (isPlantUMLLanguage(language)) return <PlantUMLDiagram source={source} />;
              if (language === "facts") return <MarkdownFacts source={normalizeStructuredBlockLinks(source, objectTitleByID)} />;
              if (language === "timeline") return <MarkdownTimeline source={normalizeStructuredBlockLinks(source, objectTitleByID)} />;
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
            const caption = cleanImageCaption(alt);
            const layout = markdownImageLayout(alt);
            const image = (
              <img
                {...props}
                className={!caption && layout ? `markdown-image-${layout}` : undefined}
                src={resolved}
                alt={alt ?? ""}
                loading={imageLoading}
                title={caption}
                onClick={() => resolved && setLightboxImage({ src: resolved, alt: caption })}
              />
            );
            if (!caption) return image;
            return (
              <figure className={`markdown-figure ${layout ? `markdown-figure-${layout}` : ""}`}>
                {image}
                <figcaption>{caption}</figcaption>
              </figure>
            );
          }
        }}
      >
        {rendered}
      </ReactMarkdown>
      <Dialog open={Boolean(lightboxImage)} onOpenChange={(open) => !open && setLightboxImage(null)}>
        <DialogContent className="markdown-lightbox">
          {lightboxImage && (
            <>
              <img src={lightboxImage.src} alt={lightboxImage.alt} />
              {lightboxImage.alt && <div className="markdown-lightbox-caption">{lightboxImage.alt}</div>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MarkdownCode({ className, children, ...props }: React.ComponentProps<"code">) {
  const source = String(children ?? "").replace(/\n$/, "");
  const language = /language-([A-Za-z0-9_-]+)/.exec(className ?? "")?.[1]?.toLowerCase();
  if (language === "mermaid") {
    return <MermaidDiagram source={source} />;
  }
  if (isPlantUMLLanguage(language)) {
    return <PlantUMLDiagram source={source} />;
  }
  if (!language) {
    return <code {...props}>{children}</code>;
  }
  const highlighted = highlightCode(source, language);
  return <code {...props} className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

function isMarkdownFigure(node: React.ReactNode) {
  return React.isValidElement<{ className?: string }>(node) && node.type === "figure" && String(node.props.className ?? "").includes("markdown-figure");
}

function isPlantUMLLanguage(language: string | undefined) {
  return language === "plantuml" || language === "puml" || language === "uml";
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
        const result = await mermaid.render(`memex-mermaid-${rawID}`, source);
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

function PlantUMLDiagram({ source }: { source: string }) {
  const [svg, setSVG] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const res = await fetch("/api/plantuml", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source })
        });
        const result = await res.json() as { ok?: boolean; data?: { svg?: string }; error?: { message?: string } };
        if (!result.ok || !result.data?.svg) {
          throw new Error(result.error?.message || "PlantUML render failed");
        }
        if (!cancelled) {
          setSVG(result.data.svg);
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
  }, [source]);
  if (error) return <pre className="markdown-plantuml-error">{error}</pre>;
  if (!svg) return <div className="markdown-plantuml-loading">Rendering PlantUML...</div>;
  return <div className="markdown-plantuml" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MarkdownFacts({ source }: { source: string }) {
  const rows = source.split("\n").map(parseFactLine).filter((row): row is { key: string; value: string } => Boolean(row));
  if (rows.length === 0) return <pre><code>{source}</code></pre>;
  return (
    <dl className="markdown-facts">
      {rows.map((row) => (
        <div key={`${row.key}:${row.value}`} className="markdown-fact-row">
          <dt>{row.key}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MarkdownTimeline({ source }: { source: string }) {
  const items = source.split("\n").map(parseTimelineLine).filter((item): item is { time: string; text: string } => Boolean(item));
  if (items.length === 0) return <pre><code>{source}</code></pre>;
  return (
    <ol className="markdown-timeline">
      {items.map((item) => (
        <li key={`${item.time}:${item.text}`}>
          <time>{item.time}</time>
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

function normalizeMarkdownBody(markdown: string, objectTitleByID: Record<string, string> = {}) {
  return transformMarkdownOutsideFences(markdown, (line) => normalizeWikiLinks(normalizeObsidianImages(line), objectTitleByID));
}

function markdownHasWikiLinks(markdown: string) {
  return /\[\[[^\]\n]+\]\]/.test(markdown);
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

function normalizeWikiLinks(line: string, objectTitleByID: Record<string, string> = {}) {
  return line.replace(/\[\[([^\]\n]+)\]\]/g, (_match, raw: string) => {
    const [target, label] = raw.split("|").map((part) => part.trim());
    if (!target) return "";
    const title = label || objectTitleByID[target] || target;
    return `[${escapeMarkdownAlt(title)}](#memex-object:${encodeURIComponent(target)})`;
  });
}

function normalizeStructuredBlockLinks(source: string, objectTitleByID: Record<string, string> = {}) {
  return source.replace(/\[\[([^\]\n]+)\]\]/g, (_match, raw: string) => {
    const [target, label] = raw.split("|").map((part) => part.trim());
    if (!target) return "";
    return label || objectTitleByID[target] || target;
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

function cleanImageCaption(value: string | undefined) {
  const caption = String(value ?? "").trim();
  if (!caption || caption === "image") return "";
  return caption.replace(/\s*\{(?:wide|full|inline)\}\s*$/i, "").trim();
}

function markdownImageLayout(value: string | undefined) {
  const match = String(value ?? "").match(/\{(wide|full|inline)\}\s*$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function parseFactLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const [key, value] = splitStructuredLine(trimmed);
  if (!key || !value) return null;
  return { key, value };
}

function parseTimelineLine(line: string) {
  const trimmed = line.trim().replace(/^[-*]\s+/, "");
  if (!trimmed || trimmed.startsWith("#")) return null;
  const [time, text] = splitStructuredLine(trimmed);
  if (!time || !text) return null;
  return { time, text };
}

function splitStructuredLine(line: string): [string, string] {
  const separators = [" | ", "\t", " - ", ": "];
  for (const separator of separators) {
    const index = line.indexOf(separator);
    if (index > 0) {
      return [line.slice(0, index).trim(), line.slice(index + separator.length).trim()];
    }
  }
  return ["", ""];
}

function objectIDFromInternalHref(href: string | undefined) {
  if (!href?.startsWith("#memex-object:")) return "";
  return decodeURIComponent(href.slice("#memex-object:".length));
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

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.startsWith("zh") ? "zh" : "en";
  return (
    <Select value={current} onValueChange={(value) => void i18n.changeLanguage(value)}>
      <SelectTrigger className="language-switcher-trigger h-8 w-[112px] rounded-md bg-background/60 px-2.5 text-xs" aria-label={t("app.language")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {languageOptions.map((language) => (
          <SelectItem key={language.value} value={language.value}>
            {language.value === "zh" ? t("app.chinese") : t("app.english")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BreadcrumbTrail({ product, view, activeType, activeObject }: { product: string; view: ViewID; activeType: string; activeObject: Obj | null }) {
  const { t } = useTranslation();
  const parts = [product];
  if (view === "objects") {
    if (activeType) parts.push(activeType);
  } else if (view === "detail") {
    if (activeObject?.type_id || activeType) parts.push(activeObject?.type_id || activeType);
    if (activeObject?.id) parts.push(activeObject.id);
  } else if (view === "types") {
    parts.push(t("nav.schema"));
  } else if (view === "vi") {
    parts.push("visual inventory");
  } else if (view === "graph") {
    parts.push(t("nav.graph"));
  } else if (view === "health") {
    parts.push(t("nav.health"));
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

function VaultSwitcher({ vault, draft, setDraft, recentVaults, showcaseVault, vaultOK, openVault }: { vault: string; draft: string; setDraft: (path: string) => void; recentVaults: string[]; showcaseVault: string; vaultOK: boolean | null; openVault: (path: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [manualPath, setManualPath] = useState(draft || vault);
  const visibleRecent = recentVaults.filter((path) => path !== vault).slice(0, 7);
  const isShowcase = Boolean(vault && showcaseVault && vault === showcaseVault);
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
        {t("vault.label")}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex w-full items-center justify-between gap-3 rounded-md border border-border/35 bg-card/35 px-2.5 py-2 text-left transition hover:bg-card/62">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`min-w-0 truncate text-xs ${isShowcase ? "font-medium" : "font-mono"}`}>{isShowcase ? t("vault.showcase") : vault ? shortPath(vault) : t("vault.serverDefault")}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm break-all font-mono">{vault || t("vault.serverDefault")}</TooltipContent>
            </Tooltip>
            <span className={`vault-status-chip ${vaultOK ? "vault-status-ready" : "vault-status-missing"}`}>{vaultOK ? t("status.ready") : t("status.missing")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 rounded-3xl p-0">
          <Command shouldFilter>
            <CommandInput placeholder={t("vault.pathPlaceholder")} />
            <CommandList>
              <CommandEmpty>{t("objects.emptyTitle")}</CommandEmpty>
              <CommandGroup heading={t("vault.label")}>
                <CommandItem value={vault || "default"} onSelect={() => vault && commit(vault)}>
                  <Check className="size-4 opacity-100" />
                  <span className={`min-w-0 flex-1 truncate text-xs ${isShowcase ? "font-medium" : "font-mono"}`}>{isShowcase ? t("vault.showcase") : vault ? shortPath(vault) : t("vault.serverDefault")}</span>
                  <span className={`vault-status-chip ${vaultOK ? "vault-status-ready" : "vault-status-missing"}`}>{vaultOK ? t("status.ready") : t("status.missing")}</span>
                </CommandItem>
              </CommandGroup>
              {showcaseVault && showcaseVault !== vault && (
                <CommandGroup heading={t("vault.builtIn")}>
                  <CommandItem value={`showcase ${showcaseVault}`} onSelect={() => commit(showcaseVault)}>
                    <Database className="size-4 text-[hsl(var(--earth))]" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("vault.showcase")}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {visibleRecent.length > 0 && (
                <CommandGroup heading={t("vault.recent")}>
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
            <div className="text-xs font-medium text-muted-foreground">{t("vault.open")}</div>
            <div className="flex gap-2">
              <Input value={manualPath} onChange={(event) => { setManualPath(event.target.value); setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") commit(manualPath); }} placeholder="/path/to/vault" className="h-9 flex-1 font-mono text-xs" />
              <Button className="h-9 px-3" disabled={!manualPath.trim()} onClick={() => commit(manualPath)}>{t("vault.open")}</Button>
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

function GraphCanvas({
  graphView,
  selectedID,
  select,
  open,
  layoutKey,
  relayout,
  onNodeClick,
  onNodeDoubleClick
}: {
  graphView: ReturnType<typeof buildGraphView>;
  selectedID: string | null;
  select: (id: string) => void;
  open: (id: string) => void;
  layoutKey: string;
  relayout: () => void;
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
}) {
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
                onClick={() => {
                  select(node.id);
                  onNodeClick?.(node.id);
                }}
                onDoubleClick={() => {
                  if (onNodeDoubleClick) {
                    onNodeDoubleClick(node.id);
                    return;
                  }
                  open(node.id);
                }}
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
  const { t } = useTranslation();
  const change = (delta: number) => setZoom((value) => clampZoom(Number((value + delta).toFixed(2))));
  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-card/72 p-1 text-xs shadow-[0_8px_18px_-14px_hsl(var(--shadow-warm)/0.12)] backdrop-blur">
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => change(-0.12)} title={t("common.zoomOut")}>-</button>
      <button className="min-w-12 rounded-md px-2.5 py-1.5 font-mono text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => setZoom(1)} title={t("common.resetZoom")}>{Math.round(zoom * 100)}%</button>
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={() => change(0.12)} title={t("common.zoomIn")}>+</button>
      <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-foreground/[0.035] hover:text-foreground" onClick={reset} title={t("common.relayout")}>{t("common.relayout")}</button>
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

type ObjectFilterOperator = "=" | "!=" | "contains";
type ParsedObjectFilter = { field: string; op: ObjectFilterOperator; value: string };

function ObjectFilterBar({
  fields,
  rows,
  filter,
  setFilter
}: {
  fields: FieldDef[];
  rows: Record<string, unknown>[];
  filter: string;
  setFilter: (filter: string) => void;
}) {
  const { t } = useTranslation();
  const filterFields = useMemo(() => objectFilterFields(fields), [fields]);
  const parsed = useMemo(() => parseObjectFilter(filter), [filter]);
  const [advanced, setAdvanced] = useState(() => Boolean(filter && !parsed));
  const [draftField, setDraftField] = useState(parsed?.field || filterFields[0]?.name || "title");
  const [draftOp, setDraftOp] = useState<ObjectFilterOperator>(parsed?.op || "contains");
  const [draftValue, setDraftValue] = useState(parsed?.value || "");
  const selectedField = filterFields.find((field) => field.name === draftField) ?? filterFields[0];
  const suggestedValues = useMemo(() => objectFilterValueOptions(rows, draftField, selectedField), [rows, draftField, selectedField]);
  const canApply = Boolean(draftField && draftValue.trim());

  useEffect(() => {
    const nextParsed = parseObjectFilter(filter);
    if (!filter) {
      setAdvanced(false);
      setDraftValue("");
      return;
    }
    if (!nextParsed) {
      setAdvanced(true);
      return;
    }
    setDraftField(nextParsed.field);
    setDraftOp(nextParsed.op);
    setDraftValue(nextParsed.value);
    setAdvanced(false);
  }, [filter]);

  useEffect(() => {
    if (filterFields.length > 0 && !filterFields.some((field) => field.name === draftField)) {
      setDraftField(filterFields[0].name);
    }
  }, [draftField, filterFields]);

  function applyFilter() {
    if (!canApply) return;
    setFilter(buildObjectFilter(draftField, draftOp, draftValue.trim()));
  }

  function clearFilter() {
    setFilter("");
    setDraftValue("");
    setAdvanced(false);
  }

  function changeField(value: string) {
    setDraftField(value);
    const nextField = filterFields.find((field) => field.name === value);
    setDraftOp(nextField?.kind === "text" || nextField?.kind === "url" ? "contains" : "=");
    setDraftValue("");
  }

  return (
    <div className="object-filter-bar">
      <div className="object-filter-main">
        <Select value={draftField} onValueChange={changeField}>
          <SelectTrigger className="object-filter-field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterFields.map((field) => (
              <SelectItem key={field.name} value={field.name}>{field.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draftOp} onValueChange={(value) => setDraftOp(value as ObjectFilterOperator)}>
          <SelectTrigger className="object-filter-op">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">{t("objects.filterContains")}</SelectItem>
            <SelectItem value="=">{t("objects.filterEquals")}</SelectItem>
            <SelectItem value="!=">{t("objects.filterNotEquals")}</SelectItem>
          </SelectContent>
        </Select>
        {selectedField?.enum_values?.length ? (
          <Select value={draftValue} onValueChange={setDraftValue}>
            <SelectTrigger className="object-filter-value">
              <SelectValue placeholder={t("objects.filterValue")} />
            </SelectTrigger>
            <SelectContent>
              {selectedField.enum_values.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : selectedField?.kind === "boolean" ? (
          <Select value={draftValue} onValueChange={setDraftValue}>
            <SelectTrigger className="object-filter-value">
              <SelectValue placeholder={t("objects.filterValue")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="relative min-w-0 flex-1">
            <Input
              list="object-filter-values"
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilter();
              }}
              placeholder={selectedField?.target_type ? `${selectedField.target_type}.id` : t("objects.filterValue")}
              className="object-filter-value-input"
            />
            <datalist id="object-filter-values">
              {suggestedValues.map((value) => <option key={value} value={value} />)}
            </datalist>
          </div>
        )}
        <Button size="sm" onClick={applyFilter} disabled={!canApply}>
          <Search className="size-3.5" />
          {t("objects.filterApply")}
        </Button>
        {filter && (
          <Button size="sm" variant="ghost" onClick={clearFilter} title={t("objects.filterClear")}>
            <X className="size-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setAdvanced((open) => !open)}>
          {advanced ? t("objects.filterVisual") : t("objects.filterAdvanced")}
        </Button>
      </div>
      {filter && !advanced && (
        <div className="object-filter-summary">
          <span>{t("objects.filterActive")}</span>
          <code>{filter}</code>
        </div>
      )}
      {advanced && (
        <div className="object-filter-advanced">
          <Input placeholder={t("objects.filterPlaceholder")} value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 rounded-md bg-background/68 font-mono text-xs" />
        </div>
      )}
    </div>
  );
}

function ObjectDataTable({ rows, fields, activeType, open }: { rows: Record<string, unknown>[]; fields: FieldDef[]; activeType: string; open: (id: string) => void }) {
  const mobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (max-width: 900px)");
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
  const tableMinWidth = table.getVisibleLeafColumns().reduce((sum, column) => sum + objectTableColumnWidth(column.id, mobile), 0);
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
    <div className="object-table-shell flex h-full min-h-0 flex-col overflow-hidden rounded-lg">
      <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto">
        <Table className="table-fixed" style={{ minWidth: tableMinWidth, width: tableMinWidth }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={objectTableCellClass(header.column.id)} style={objectTableColumnStyle(header.column.id, mobile)}>
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
                  <TableCell key={cell.id} className={objectTableCellClass(cell.column.id)} style={objectTableColumnStyle(cell.column.id, mobile)}>
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
      <div className="object-table-pagination flex items-center justify-between gap-3 border-t border-border/45 px-3 py-2 text-xs text-muted-foreground">
        <div className="object-table-page-summary flex items-center gap-2">
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
  const base = "whitespace-nowrap align-top overflow-hidden";
  if (columnID === "id") return `${base} object-table-id-col`;
  if (columnID === "title") return `${base} object-table-title-col`;
  if (columnID === "url") return `${base} object-table-url-col`;
  return `${base} object-table-field-col`;
}

function objectTableColumnStyle(columnID: string, mobile = false): React.CSSProperties | undefined {
  return { width: objectTableColumnWidth(columnID, mobile) };
}

function objectTableColumnWidth(columnID: string, mobile = false) {
  if (mobile) {
    if (columnID === "id") return 148;
    if (columnID === "title") return 210;
    if (columnID === "url") return 240;
    if (columnID === "platform") return 96;
    if (columnID === "post_type") return 116;
    if (columnID === "author") return 120;
    if (columnID.endsWith("_at") || columnID.endsWith("_date")) return 132;
    if (columnID === "status" || columnID.endsWith("_status")) return 116;
    return 132;
  }
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
      <span className="flex max-h-16 max-w-full flex-wrap gap-1 overflow-hidden">
        {refs.map((ref) => (
          <button key={String(ref)} className="glass-light max-w-full truncate rounded-md px-2 py-1 font-mono text-xs text-[hsl(var(--earth))] transition hover:bg-card hover:text-foreground" onClick={() => open(String(ref))}>
            {String(ref)}
          </button>
        ))}
      </span>
    );
  }
  if (field.kind === "url") {
    const href = String(value);
    return <a href={href} target="_blank" rel="noreferrer" className="inline-block max-w-full truncate text-[hsl(var(--earth))] hover:text-foreground">{href}</a>;
  }
  if (Array.isArray(value)) {
    return <span className="flex max-h-16 max-w-full flex-wrap gap-1 overflow-hidden">{value.map((item) => <Badge key={String(item)}>{String(item)}</Badge>)}</span>;
  }
  if (field.kind === "enum" || field.kind === "boolean") return <Badge>{String(value)}</Badge>;
  return <span className="inline-block max-w-full truncate">{String(value)}</span>;
}

function plainCell(v: unknown) {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (v === undefined || v === null || v === "") return "empty";
  return String(v);
}

function objectFilterFields(fields: FieldDef[]): FieldDef[] {
  const base: FieldDef[] = [
    { name: "title", kind: "text" },
    { name: "id", kind: "text" }
  ];
  const seen = new Set(base.map((field) => field.name));
  for (const field of fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    base.push(field);
  }
  return base;
}

function parseObjectFilter(filter: string): ParsedObjectFilter | null {
  const expr = filter.trim();
  if (!expr) return null;
  if (expr.includes(" contains ")) {
    const [field, value] = splitOnce(expr, " contains ");
    if (field && value !== undefined) return { field: field.trim(), op: "contains", value: cleanObjectFilterValue(value) };
  }
  for (const op of ["!=", "="] as const) {
    const [field, value] = splitOnce(expr, op);
    if (field && value !== undefined) return { field: field.trim(), op, value: cleanObjectFilterValue(value) };
  }
  return null;
}

function splitOnce(value: string, delimiter: string): [string, string | undefined] {
  const index = value.indexOf(delimiter);
  if (index < 0) return [value, undefined];
  return [value.slice(0, index), value.slice(index + delimiter.length)];
}

function cleanObjectFilterValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'");
  }
  return trimmed;
}

function buildObjectFilter(field: string, op: ObjectFilterOperator, value: string) {
  const quoted = JSON.stringify(value);
  return op === "contains" ? `${field} contains ${quoted}` : `${field}${op}${quoted}`;
}

function objectFilterValueOptions(rows: Record<string, unknown>[], field: string, fieldDef: FieldDef | undefined) {
  if (fieldDef?.enum_values?.length) return fieldDef.enum_values;
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item === undefined || item === null || item === "") continue;
      values.add(String(item));
      if (values.size >= 40) return [...values];
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
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

type InspectorGraphNode = {
  id: string;
  title: string;
  type: string;
  relation: string;
  kind: string;
  count: number;
  direction: "incoming" | "outgoing" | "focus";
  display?: GraphNodeDisplay;
  x: number;
  y: number;
};

type InspectorGraphEdge = {
  from_id: string;
  to_id: string;
  kind: string;
  relation: string;
  count: number;
  label?: string;
  derived?: boolean;
  via_ids?: string[];
  via?: GraphBridgeDetail[];
  relations?: string[];
};

type InspectorGraphColumn = {
  id: string;
  label: string;
  x: number;
};

type InspectorRelationGraphData = {
  focus: InspectorGraphNode;
  incoming: InspectorGraphNode[];
  outgoing: InspectorGraphNode[];
  edges: InspectorGraphEdge[];
  columns: InspectorGraphColumn[];
  fitMode: "focus" | "bounds";
  width: number;
  height: number;
};

type InspectorFilterOption = {
  id: string;
  label: string;
  count: number;
};

type RelationQueryStep = {
  relation: string;
  direction: "in" | "out";
  targetType?: string;
};

type RelationQueryTemplate = {
  id: string;
  label: string;
  description: string;
  steps: RelationQueryStep[];
  configurable?: boolean;
};

type GraphViewConfig = {
  version: number;
  views: GraphViewDefinition[];
};

type GraphViewDefinition = {
  id: string;
  label: string;
  root_type: string;
  description?: string;
  steps?: GraphViewStepDefinition[];
  paths?: GraphViewPathDefinition[];
  nodes?: Record<string, GraphNodeTemplate>;
  bridges?: Record<string, GraphBridgeConfig>;
};

type GraphViewStepDefinition = {
  relation: string;
  direction: "in" | "out";
  target_type?: string;
  display?: "node" | "bridge";
};

type GraphViewPathDefinition = { steps: GraphViewStepDefinition[] };
type GraphNodeTemplate = {
  variant?: "compact" | "standard" | "rich";
  title_field?: string;
  subtitle_field?: string;
  meta_fields?: string[];
  badge_fields?: string[];
  image_field?: string;
};
type GraphBridgeConfig = { label_fields?: string[]; aggregate?: boolean };
type GraphNodeValue = { field: string; value: string };
type GraphNodeDisplay = { variant: string; title: string; subtitle?: string; meta?: GraphNodeValue[]; badges?: GraphNodeValue[]; image?: string };
type GraphBridgeDetail = { id: string; type_id: string; title: string; fields: Record<string, unknown> };
type ProjectedGraphNode = { id: string; type_id: string; title: string; fields: Record<string, unknown>; depth: number; display: GraphNodeDisplay };
type ProjectedGraphEdge = { from_id: string; to_id: string; kind: string; relation: string; label?: string; count: number; derived: boolean; via_ids?: string[]; via?: GraphBridgeDetail[]; relations?: string[] };
type ProjectedGraphResult = { view: GraphViewDefinition; center: string; nodes: ProjectedGraphNode[]; edges: ProjectedGraphEdge[]; stats: { nodes: number; edges: number; derived_edges: number } };

function InspectorRelationGraph({ object, links, backlinks, graphNodes, graphEdges, vault, readOnly = false, automationRef, open }: { object: Obj; links: Link[]; backlinks: Link[]; graphNodes: Obj[]; graphEdges: Link[]; vault: string; readOnly?: boolean; automationRef?: React.MutableRefObject<RelationGraphAutomationController | null>; open: (id: string) => void }) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewConfig, setViewConfig] = useState<GraphViewConfig>({ version: 1, views: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorID, setEditorID] = useState("");
  const [editorLabel, setEditorLabel] = useState("");
  const [editorSteps, setEditorSteps] = useState("");
  const templates = useMemo(() => relationQueryTemplatesFor(object.type_id, viewConfig), [object.type_id, viewConfig]);
  const [activeTemplateID, setActiveTemplateID] = useState(() => templates[0]?.id ?? "nearby");
  const [showFieldLinks, setShowFieldLinks] = useState(true);
  const [showBodyLinks, setShowBodyLinks] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [hiddenRelations, setHiddenRelations] = useState<string[]>([]);
  const relationEdges = graphEdges.length > 0 ? graphEdges : [...links, ...backlinks];
  const activeTemplate = templates.find((template) => template.id === activeTemplateID) ?? templates[0] ?? relationNearbyTemplate();
  const editableTemplate = activeTemplate.configurable ? activeTemplate : templates.find((template) => template.configurable);
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    run<GraphViewConfig>(["graph", "views"], vault).then((result) => {
      if (!cancelled) setViewConfig(normalizeGraphViewConfigForUI(result.data));
    }).catch(() => {
      if (!cancelled) setViewConfig({ version: 1, views: [] });
    }).finally(() => {
      if (!cancelled) setConfigLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vault]);
  useEffect(() => {
    if (!templates.some((template) => template.id === activeTemplateID) || (activeTemplateID === "nearby" && templates[0]?.id !== "nearby")) {
      setActiveTemplateID(templates[0]?.id ?? "nearby");
    }
  }, [activeTemplateID, templates]);
  const allGraph = useMemo(() => buildInspectorRelationGraph(object, links, backlinks, graphNodes), [object, links, backlinks, graphNodes]);
  const filterMeta = useMemo(() => summarizeInspectorRelationFilters(object.id, links, backlinks, graphNodes, relationEdges), [object.id, links, backlinks, graphNodes, relationEdges]);
  const graph = useMemo(() => {
    if (activeTemplate.id !== "nearby") {
      return buildInspectorQueryGraph(object, graphNodes, relationEdges, activeTemplate, hiddenTypes);
    }
    const visibleKinds = new Set<string>();
    if (showFieldLinks && filterMeta.kindCounts.field > 0) visibleKinds.add("field");
    if ((showBodyLinks || filterMeta.kindCounts.field === 0) && filterMeta.kindCounts.body > 0) visibleKinds.add("body");
    return buildInspectorRelationGraph(
      object,
      links.filter((link) => inspectorLinkVisible(link, "outgoing", graphNodes, visibleKinds, hiddenTypes, hiddenRelations)),
      backlinks.filter((link) => inspectorLinkVisible(link, "incoming", graphNodes, visibleKinds, hiddenTypes, hiddenRelations)),
      graphNodes
    );
  }, [activeTemplate, object, graphNodes, relationEdges, links, backlinks, showFieldLinks, showBodyLinks, hiddenTypes, hiddenRelations, filterMeta.kindCounts.body, filterMeta.kindCounts.field]);
  const activeKindCount = (showFieldLinks && filterMeta.kindCounts.field > 0 ? 1 : 0) + ((showBodyLinks || filterMeta.kindCounts.field === 0) && filterMeta.kindCounts.body > 0 ? 1 : 0);
  const hasFilter = activeTemplate.id !== templates[0]?.id || activeKindCount < Number(filterMeta.kindCounts.field > 0) + Number(filterMeta.kindCounts.body > 0) || hiddenTypes.length > 0 || hiddenRelations.length > 0;
  function resetFilters() {
    setActiveTemplateID(templates[0]?.id ?? "nearby");
    setShowFieldLinks(true);
    setShowBodyLinks(false);
    setHiddenTypes([]);
    setHiddenRelations([]);
  }
  function graphViewEditorSource() {
    return activeTemplate.configurable ? activeTemplate : templates.find((template) => template.configurable);
  }
  function fillGraphViewEditor(source = graphViewEditorSource()) {
    setEditorID(source?.id ?? slugifyGraphViewLabel(`${object.type_id} view`));
    setEditorLabel(source?.label ?? `${object.type_id} view`);
    setEditorSteps(source ? relationStepsToText(source.steps) : "");
  }
  function toggleGraphViewEditor(nextOpen?: boolean) {
    const shouldOpen = nextOpen ?? !editorOpen;
    if (shouldOpen) fillGraphViewEditor();
    setEditorOpen(shouldOpen);
  }
  async function saveGraphView(patch: { id?: string; label?: string; steps?: string } = {}) {
    const id = (patch.id ?? editorID).trim();
    const label = (patch.label ?? editorLabel).trim();
    const stepsText = patch.steps ?? editorSteps;
    const parsed = parseRelationStepsText(stepsText);
    if (!id || !label || parsed.error || parsed.steps.length === 0) {
      toast.error(parsed.error || t("graph.requiredViewFields"));
      return relationGraphState();
    }
    const nextView: GraphViewDefinition = {
      id,
      label,
      root_type: object.type_id,
      description: `Follow ${relationQueryPathLabel(object.type_id, parsed.steps)} from the current ${object.type_id}`,
      steps: parsed.steps.map((step) => ({ relation: step.relation, direction: step.direction, target_type: step.targetType }))
    };
    const nextConfig = { version: 1, views: [...viewConfig.views.filter((view) => view.id !== id), nextView] };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "views", "write", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.saveFailed"));
      return relationGraphState();
    }
    setViewConfig(normalizeGraphViewConfigForUI(result.data));
    setActiveTemplateID(id);
    setEditorOpen(false);
    toast.success(t("graph.viewSaved"));
    await nextFrame();
    return automationRef?.current?.state() ?? relationGraphState();
  }
  async function deleteGraphView(idOverride?: string) {
    const id = (idOverride ?? editorID).trim();
    if (!id) return relationGraphState();
    const nextConfig = { version: 1, views: viewConfig.views.filter((view) => view.id !== id) };
    setConfigSaving(true);
    const result = await run<GraphViewConfig>(["graph", "views", "write", "--stdin"], vault, { stdin: JSON.stringify(nextConfig) });
    setConfigSaving(false);
    if (!result.ok || !result.data) {
      toast.error(result.error?.message || t("graph.deleteFailed"));
      return relationGraphState();
    }
    setViewConfig(normalizeGraphViewConfigForUI(result.data));
    setActiveTemplateID("nearby");
    setEditorOpen(false);
    toast.success(t("graph.viewDeleted"));
    await nextFrame();
    return automationRef?.current?.state() ?? relationGraphState();
  }
  function relationGraphState(): RelationGraphAutomationState {
    return {
      available: true,
      dialogOpen,
      activeViewID: activeTemplate.id,
      activeViewLabel: activeTemplate.label,
      viewSource: activeTemplate.configurable ? "vault config" : configLoading ? "loading config" : "built in",
      views: templates.map((template) => ({ id: template.id, label: template.label, configurable: Boolean(template.configurable) })),
      editorOpen,
      editorID,
      editorLabel,
      editorSteps,
      nodesCount: graph.incoming.length + graph.outgoing.length + 1,
      edgesCount: graph.edges.length
    };
  }
  const automationController: RelationGraphAutomationController = {
    state: relationGraphState,
    open: async () => {
      setDialogOpen(true);
      await nextFrame();
      return automationRef?.current?.state() ?? relationGraphState();
    },
    close: async () => {
      setDialogOpen(false);
      await nextFrame();
      return automationRef?.current?.state() ?? relationGraphState();
    },
    setView: async (id: string) => {
      if (!templates.some((template) => template.id === id)) {
        throw new Error(`unknown relation graph view: ${id}`);
      }
      setActiveTemplateID(id);
      await nextFrame();
      return automationRef?.current?.state() ?? relationGraphState();
    },
    configure: async (openNext = true) => {
      toggleGraphViewEditor(openNext);
      await nextFrame();
      return automationRef?.current?.state() ?? relationGraphState();
    },
    setEditor: async (patch) => {
      if (patch.id !== undefined) setEditorID(patch.id);
      if (patch.label !== undefined) setEditorLabel(patch.label);
      if (patch.steps !== undefined) setEditorSteps(patch.steps);
      await nextFrame();
      return automationRef?.current?.state() ?? relationGraphState();
    },
    saveView: saveGraphView,
    deleteView: deleteGraphView
  };
  useEffect(() => {
    if (!automationRef) return;
    automationRef.current = automationController;
    return () => {
      if (automationRef.current === automationController) automationRef.current = null;
    };
  }, [automationRef, automationController]);
  if (allGraph.incoming.length === 0 && allGraph.outgoing.length === 0) {
    return <div className="inspector-graph-empty">{t("graph.noLinksYet")}</div>;
  }
  const visibleNodeCount = graph.incoming.length + graph.outgoing.length + 1;
  const viewSourceLabel = activeTemplate.configurable ? t("graph.vaultConfig") : configLoading ? t("graph.loadingConfig") : t("graph.builtIn");
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <div className="inspector-graph-launcher">
        <div className="inspector-graph-launcher-copy">
          <div className="inspector-graph-launcher-title">{t("graph.localRelationGraph")}</div>
          <div className="inspector-graph-launcher-meta">{t("graph.relationSummary", { upstream: allGraph.incoming.length, downstream: allGraph.outgoing.length })}</div>
        </div>
        <Button variant="secondary" className="h-8 rounded-md px-2.5" onClick={() => setDialogOpen(true)}>
          <Maximize2 className="size-3.5" />
          {t("graph.openCanvas")}
        </Button>
      </div>
      <DialogContent className={`relation-graph-dialog ${readOnly ? "relation-graph-dialog-readonly" : "relation-graph-dialog-editable"}`}>
        <DialogHeader className="relation-graph-header">
          <div>
            <DialogTitle className="font-serif text-2xl font-medium">{object.title || object.id}</DialogTitle>
            <DialogDescription>{activeTemplate.description}. {t("graph.graphVisibleDescription", { count: visibleNodeCount })}</DialogDescription>
          </div>
        </DialogHeader>
        <RelationGraphFilters
          templates={templates}
          activeTemplateID={activeTemplate.id}
          kindCounts={filterMeta.kindCounts}
          types={filterMeta.types}
          relations={filterMeta.relations}
          showFieldLinks={showFieldLinks}
          showBodyLinks={showBodyLinks || filterMeta.kindCounts.field === 0}
          hiddenTypes={hiddenTypes}
          hiddenRelations={hiddenRelations}
          hasFilter={hasFilter}
          setActiveTemplateID={setActiveTemplateID}
          setShowFieldLinks={setShowFieldLinks}
          setShowBodyLinks={setShowBodyLinks}
          setHiddenTypes={setHiddenTypes}
          setHiddenRelations={setHiddenRelations}
          resetFilters={resetFilters}
        />
        {!readOnly && <div className="relation-graph-config-section">
          <div className="relation-graph-config-bar">
            <div className="relation-graph-config-copy">
              <span>{t("graph.viewSource")}</span>
              <strong>{viewSourceLabel}</strong>
            </div>
            <Button variant="secondary" className="h-8 rounded-md px-2.5" onClick={() => toggleGraphViewEditor()}>
              <Edit3 className="size-3.5" />
              {t("graph.configureView")}
            </Button>
          </div>
          {editorOpen && (
            <div className="relation-graph-config-editor">
              <div className="graph-view-editor">
                <label>
                  <span>{t("graph.id")}</span>
                  <Input value={editorID} onChange={(event) => setEditorID(event.target.value)} placeholder="investment-chain" />
                </label>
                <label>
                  <span>{t("graph.label")}</span>
                  <Input value={editorLabel} onChange={(event) => setEditorLabel(event.target.value)} placeholder="Investment chain" />
                </label>
                <label>
                  <span>{t("graph.steps")}</span>
                  <textarea value={editorSteps} onChange={(event) => setEditorSteps(event.target.value)} placeholder={"in investor investment\nout company company"} />
                </label>
                <div className="graph-view-editor-help">{t("graph.editorHelp")}</div>
                <div className="graph-view-editor-actions">
                  <Button size="sm" onClick={() => void saveGraphView()} disabled={configSaving}>
                    <Save className="size-3.5" />
                    {t("graph.save")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void deleteGraphView()} disabled={configSaving || !editableTemplate}>
                    <X className="size-3.5" />
                    {t("graph.delete")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>}
        <RelationGraphCanvas graph={graph} openObject={(id) => {
          setDialogOpen(false);
          open(id);
        }} />
      </DialogContent>
    </Dialog>
  );
}

function RelationGraphFilters({
  templates,
  activeTemplateID,
  kindCounts,
  types,
  relations,
  showFieldLinks,
  showBodyLinks,
  hiddenTypes,
  hiddenRelations,
  hasFilter,
  setActiveTemplateID,
  setShowFieldLinks,
  setShowBodyLinks,
  setHiddenTypes,
  setHiddenRelations,
  resetFilters
}: {
  templates: RelationQueryTemplate[];
  activeTemplateID: string;
  kindCounts: { body: number; field: number };
  types: InspectorFilterOption[];
  relations: InspectorFilterOption[];
  showFieldLinks: boolean;
  showBodyLinks: boolean;
  hiddenTypes: string[];
  hiddenRelations: string[];
  hasFilter: boolean;
  setActiveTemplateID: (next: string) => void;
  setShowFieldLinks: (next: boolean) => void;
  setShowBodyLinks: (next: boolean) => void;
  setHiddenTypes: React.Dispatch<React.SetStateAction<string[]>>;
  setHiddenRelations: React.Dispatch<React.SetStateAction<string[]>>;
  resetFilters: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relation-filter-panel">
      <div className="relation-filter-row">
        <span className="relation-filter-label">{t("graph.view")}</span>
        <div className="relation-filter-chips">
          {templates.map((template) => (
          <button key={template.id} className={`relation-view-chip ${activeTemplateID === template.id ? "is-active" : ""}`} onClick={() => setActiveTemplateID(template.id)}>
            {template.label}
          </button>
        ))}
        </div>
      </div>
      <div className="relation-filter-row">
        <span className="relation-filter-label">{t("graph.kind")}</span>
        <RelationFilterChip label={t("graph.field")} count={kindCounts.field} active={showFieldLinks && kindCounts.field > 0} disabled={kindCounts.field === 0} onClick={() => setShowFieldLinks(!showFieldLinks)} />
        <RelationFilterChip label={t("graph.body")} count={kindCounts.body} active={showBodyLinks && kindCounts.body > 0} disabled={kindCounts.body === 0 || kindCounts.field === 0} onClick={() => setShowBodyLinks(!showBodyLinks)} />
        <button className="relation-filter-reset" disabled={!hasFilter} onClick={resetFilters}>{t("graph.reset")}</button>
      </div>
      {types.length > 0 && (
        <div className="relation-filter-row">
          <span className="relation-filter-label">{t("graph.types")}</span>
          <div className="relation-filter-chips">
            {types.map((type) => (
              <RelationFilterChip
                key={type.id}
                label={type.label}
                count={type.count}
                active={!hiddenTypes.includes(type.id)}
                onClick={() => setHiddenTypes((items) => toggleArrayItem(items, type.id))}
              />
            ))}
          </div>
        </div>
      )}
      {relations.length > 0 && (
        <div className="relation-filter-row">
          <span className="relation-filter-label">{t("graph.paths")}</span>
          <div className="relation-filter-chips">
            {relations.map((relation) => (
              <RelationFilterChip
                key={relation.id}
                label={relation.label}
                count={relation.count}
                active={!hiddenRelations.includes(relation.id)}
                onClick={() => setHiddenRelations((items) => toggleArrayItem(items, relation.id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelationFilterChip({ label, count, active, disabled, onClick }: { label: string; count: number; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`relation-filter-chip ${active ? "is-active" : ""}`} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <span className="relation-filter-count">{count}</span>
    </button>
  );
}

function RelationGraphCanvas({
  graph,
  openObject,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick
}: {
  graph: InspectorRelationGraphData;
  openObject: (id: string) => void;
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
  onEdgeClick?: (edge: InspectorGraphEdge) => void;
}) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(0.86);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredID, setHoveredID] = useState<string | null>(null);
  const [draggedPositions, setDraggedPositions] = useState<Record<string, Point>>({});
  const panRef = useRef<{ startX: number; startY: number; origin: Point } | null>(null);
  const nodeDragRef = useRef<{ id: string; startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const userAdjustedViewRef = useRef(false);
  const baseNodes = useMemo(() => [graph.focus, ...graph.incoming, ...graph.outgoing], [graph]);
  const graphLayoutKey = useMemo(() => [
    graph.fitMode,
    ...graph.columns.map((column) => `${column.id}:${column.x}`),
    ...baseNodes.map((node) => `${node.id}:${node.x}:${node.y}:${node.display?.variant ?? "standard"}`)
  ].join("|"), [baseNodes, graph.columns, graph.fitMode]);
  const nodes = baseNodes.map((node) => ({ ...node, ...(draggedPositions[node.id] ?? {}) }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connectedToHovered = useMemo(() => {
    if (!hoveredID) return new Set<string>();
    const connected = new Set([hoveredID]);
    for (const edge of graph.edges) {
      if (edge.from_id === hoveredID) connected.add(edge.to_id);
      if (edge.to_id === hoveredID) connected.add(edge.from_id);
    }
    return connected;
  }, [graph.edges, hoveredID]);
  useEffect(() => {
    userAdjustedViewRef.current = false;
    setDraggedPositions({});
    setZoom(0.86);
    const centerView = (fit = false) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const nextView = fit || graph.fitMode === "bounds"
        ? relationGraphFitView(graph, baseNodes, rect)
        : { zoom: 0.86, pan: { x: rect.width / 2 - graph.focus.x * 0.86, y: rect.height / 2 - graph.focus.y * 0.86 } };
      setZoom(nextView.zoom);
      setPan(nextView.pan);
      return true;
    };
    centerView();
    const shortDelay = window.setTimeout(() => centerView(), 60);
    const longDelay = window.setTimeout(() => centerView(), 240);
    const viewport = viewportRef.current;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && viewport) {
      observer = new ResizeObserver(() => {
        if (!userAdjustedViewRef.current) centerView();
      });
      observer.observe(viewport);
    }
    return () => {
      window.clearTimeout(shortDelay);
      window.clearTimeout(longDelay);
      observer?.disconnect();
    };
  }, [graphLayoutKey]);

  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    userAdjustedViewRef.current = true;
    const rect = viewportRef.current?.getBoundingClientRect();
    const clamped = clampZoom(nextZoom);
    if (!rect || clientX === undefined || clientY === undefined) {
      setZoom(clamped);
      return;
    }
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - pan.x) / zoom;
    const worldY = (localY - pan.y) / zoom;
    setZoom(clamped);
    setPan({ x: localX - worldX * clamped, y: localY - worldY * clamped });
  }

  function resetView() {
    userAdjustedViewRef.current = false;
    const rect = viewportRef.current?.getBoundingClientRect();
    setDraggedPositions({});
    if (rect) {
      const nextView = graph.fitMode === "bounds"
        ? relationGraphFitView(graph, baseNodes, rect)
        : { zoom: 0.86, pan: { x: rect.width / 2 - graph.focus.x * 0.86, y: rect.height / 2 - graph.focus.y * 0.86 } };
      setZoom(nextView.zoom);
      setPan(nextView.pan);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    zoomAt(zoom * factor, event.clientX, event.clientY);
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".relation-canvas-node")) return;
    userAdjustedViewRef.current = true;
    panRef.current = { startX: event.clientX, startY: event.clientY, origin: pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginNodeDrag(event: React.PointerEvent<HTMLButtonElement>, node: InspectorGraphNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    userAdjustedViewRef.current = true;
    nodeDragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, origin: { x: node.x, y: node.y }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag) {
      const dx = (event.clientX - nodeDrag.startX) / zoom;
      const dy = (event.clientY - nodeDrag.startY) / zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) nodeDrag.moved = true;
      setDraggedPositions((positions) => ({ ...positions, [nodeDrag.id]: { x: nodeDrag.origin.x + dx, y: nodeDrag.origin.y + dy } }));
      return;
    }
    const drag = panRef.current;
    if (!drag) return;
    setPan({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY });
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (nodeDragRef.current?.moved) suppressClickRef.current = nodeDragRef.current.id;
    nodeDragRef.current = null;
    panRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may belong to a dragged node.
    }
  }

  return (
    <div className="relation-canvas-shell">
      <div className="relation-canvas-toolbar">
        <div className="relation-canvas-stat"><Move className="size-3.5" />{nodes.length} {t("graph.nodes").toLowerCase()}</div>
        <div className="flex items-center gap-1">
          <button className="relation-canvas-tool" onClick={() => zoomAt(zoom * 0.9)} title={t("common.zoomOut")}><ZoomOut className="size-3.5" /></button>
          <button className="relation-canvas-tool relation-canvas-zoom" onClick={() => zoomAt(1)} title={t("common.resetZoom")}>{Math.round(zoom * 100)}%</button>
          <button className="relation-canvas-tool" onClick={() => zoomAt(zoom * 1.1)} title={t("common.zoomIn")}><ZoomIn className="size-3.5" /></button>
          <button className="relation-canvas-tool" onClick={resetView} title={graph.fitMode === "bounds" ? t("common.fitGraph") : t("common.resetView")}><RotateCcw className="size-3.5" /></button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="relation-canvas-viewport"
        onWheel={handleWheel}
        onPointerDown={beginPan}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="relation-canvas-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {graph.columns.map((column) => (
            <div key={column.id} className="relation-canvas-column-label" style={{ left: column.x, top: 52 }}>
              {column.label}
            </div>
          ))}
          <svg className="relation-canvas-edges" width={graph.width} height={graph.height}>
            <defs>
              <marker id="relation-arrow-field" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M1,1 L9,5 L1,9 Z" fill="hsl(var(--moss) / 0.62)" />
              </marker>
              <marker id="relation-arrow-body" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M1,1 L9,5 L1,9 Z" fill="hsl(var(--earth) / 0.55)" />
              </marker>
            </defs>
            {graph.edges.map((edge) => {
              const from = nodeMap.get(edge.from_id);
              const to = nodeMap.get(edge.to_id);
              const active = !hoveredID || edge.from_id === hoveredID || edge.to_id === hoveredID;
              return from && to ? <RelationGraphEdge key={`${edge.from_id}-${edge.relation}-${edge.to_id}-${(edge.via_ids ?? []).join("-")}`} from={from} to={to} edge={edge} active={active} onClick={onEdgeClick} /> : null;
            })}
          </svg>
          {nodes.map((node) => (
            <button
              key={node.id}
              className={`relation-canvas-node relation-canvas-node-${node.direction} relation-canvas-node-${node.display?.variant ?? "standard"} ${hoveredID && !connectedToHovered.has(node.id) ? "relation-canvas-node-dimmed" : ""} ${hoveredID === node.id ? "relation-canvas-node-hovered" : ""}`}
              data-relation-node={node.id}
              style={{ left: node.x, top: node.y }}
              title={node.id}
              onPointerDown={(event) => beginNodeDrag(event, node)}
              onMouseEnter={() => setHoveredID(node.id)}
              onMouseLeave={() => setHoveredID(null)}
              onClick={() => {
                if (suppressClickRef.current === node.id) {
                  suppressClickRef.current = null;
                  return;
                }
                if (onNodeClick) {
                  onNodeClick(node.id);
                  return;
                }
                openObject(node.id);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (onNodeDoubleClick) {
                  onNodeDoubleClick(node.id);
                  return;
                }
                openObject(node.id);
              }}
            >
              <span className="relation-canvas-node-title">{node.display?.title || node.title}</span>
              {node.display?.subtitle && <span className="relation-canvas-node-subtitle">{node.display.subtitle}</span>}
              {(node.display?.meta?.length ?? 0) > 0 && (
                <span className="relation-canvas-node-meta">{node.display!.meta!.map((item) => item.value).join(" · ")}</span>
              )}
              {(node.display?.badges?.length ?? 0) > 0 && (
                <span className="relation-canvas-node-badges">{node.display!.badges!.map((item) => item.value).join(" · ")}</span>
              )}
              <span className="relation-canvas-node-type">{node.type}</span>
              {node.direction !== "focus" && <span className="relation-canvas-node-relation">{node.relation}{node.count > 1 ? ` x${node.count}` : ""}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RelationGraphEdge({ from, to, edge, active, onClick }: { from: InspectorGraphNode; to: InspectorGraphNode; edge: InspectorGraphEdge; active: boolean; onClick?: (edge: InspectorGraphEdge) => void }) {
  const start = relationNodeAnchor(from, to.x >= from.x ? "right" : "left");
  const end = relationNodeAnchor(to, to.x >= from.x ? "left" : "right");
  const distance = Math.max(90, Math.abs(end.x - start.x) * 0.42);
  const forward = end.x >= start.x;
  const d = `M ${start.x} ${start.y} C ${start.x + (forward ? distance : -distance)} ${start.y}, ${end.x - (forward ? distance : -distance)} ${end.y}, ${end.x} ${end.y}`;
  const marker = edge.kind === "field" ? "relation-arrow-field" : "relation-arrow-body";
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 8;
  return (
    <g className={`relation-canvas-edge-group ${edge.derived ? "is-derived" : ""}`} onClick={() => onClick?.(edge)}>
      <path className={active ? "relation-canvas-edge-active" : "relation-canvas-edge-dimmed"} d={d} fill="none" stroke={edge.derived ? "hsl(var(--teal) / 0.58)" : edge.kind === "field" ? "hsl(var(--moss) / 0.48)" : "hsl(var(--earth) / 0.38)"} strokeWidth={active ? "1.7" : "1.2"} strokeDasharray={edge.derived ? "6 4" : undefined} markerEnd={`url(#${marker})`} />
      {edge.label && <text className="relation-canvas-edge-label" x={labelX} y={labelY}>{edge.label}</text>}
    </g>
  );
}

function relationNodeAnchor(node: InspectorGraphNode, side: "left" | "right") {
  const dimensions = relationNodeDimensions(node);
  return { x: node.x + (side === "right" ? dimensions.width : 0), y: node.y + dimensions.height / 2 };
}

function relationNodeDimensions(node: InspectorGraphNode) {
  const variant = node.display?.variant ?? "standard";
  if (variant === "compact") return { width: node.direction === "focus" ? 180 : 160, height: 62 };
  if (variant === "rich") return { width: node.direction === "focus" ? 230 : 220, height: 112 };
  return { width: node.direction === "focus" ? 200 : 190, height: 86 };
}

function relationGraphFitView(graph: InspectorRelationGraphData, nodes: InspectorGraphNode[], rect: DOMRect) {
  const bounds = relationGraphBounds(graph, nodes);
  const paddingX = 72;
  const paddingY = 80;
  const scaleX = (rect.width - paddingX) / Math.max(bounds.width, 1);
  const scaleY = (rect.height - paddingY) / Math.max(bounds.height, 1);
  const zoom = clampZoom(Math.min(1.02, Math.max(0.28, Math.min(scaleX, scaleY))));
  return {
    zoom,
    pan: {
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * zoom
    }
  };
}

function relationGraphBounds(graph: InspectorRelationGraphData, nodes: InspectorGraphNode[]) {
  const nodeBoxes = nodes.map((node) => ({
    x: node.x,
    y: node.y,
    ...relationNodeDimensions(node)
  }));
  for (const column of graph.columns) {
    nodeBoxes.push({ x: column.x, y: 52, width: 170, height: 28 });
  }
  if (nodeBoxes.length === 0) return { x: 0, y: 0, width: graph.width, height: graph.height };
  const minX = Math.min(...nodeBoxes.map((box) => box.x));
  const minY = Math.min(...nodeBoxes.map((box) => box.y));
  const maxX = Math.max(...nodeBoxes.map((box) => box.x + box.width));
  const maxY = Math.max(...nodeBoxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function summarizeInspectorRelationFilters(focusID: string, links: Link[], backlinks: Link[], graphNodes: Obj[], graphEdges: Link[]) {
  const objectByID = new Map(graphNodes.map((node) => [node.id, node]));
  const kindCounts = { body: 0, field: 0 };
  const typeCounts = new Map<string, number>();
  const relationCounts = new Map<string, number>();
  const edges = graphEdges.length > 0 ? graphEdges : [...links, ...backlinks];
  const nearbyEdges = edges.filter((edge) => edge.from_id === focusID || edge.to_id === focusID);
  for (const link of nearbyEdges) {
    if (link.kind === "body") kindCounts.body += 1;
    if (link.kind === "field") kindCounts.field += 1;
    const linkedID = link.from_id === focusID ? link.to_id : link.from_id;
    const type = objectByID.get(linkedID)?.type_id || inferObjectType(linkedID);
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    relationCounts.set(link.relation, (relationCounts.get(link.relation) ?? 0) + 1);
  }
  return {
    kindCounts,
    types: mapCountsToFilterOptions(typeCounts).sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return graphTypeOrder([a.id, b.id])[0] === a.id ? -1 : 1;
    }),
    relations: mapCountsToFilterOptions(relationCounts).sort((a, b) => {
      if (a.id === "mentions") return 1;
      if (b.id === "mentions") return -1;
      if (a.count !== b.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
  };
}

function inspectorLinkVisible(link: Link, direction: "incoming" | "outgoing", graphNodes: Obj[], visibleKinds: Set<string>, hiddenTypes: string[], hiddenRelations: string[]) {
  if (!visibleKinds.has(link.kind)) return false;
  if (hiddenRelations.includes(link.relation)) return false;
  const objectByID = new Map(graphNodes.map((node) => [node.id, node]));
  const linkedID = direction === "incoming" ? link.from_id : link.to_id;
  const type = objectByID.get(linkedID)?.type_id || inferObjectType(linkedID);
  return !hiddenTypes.includes(type);
}

function mapCountsToFilterOptions(counts: Map<string, number>) {
  return [...counts.entries()].map(([id, count]) => ({ id, label: id, count }));
}

function toggleArrayItem(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function shortPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

function buildInspectorRelationGraph(object: Obj, links: Link[], backlinks: Link[], graphNodes: Obj[]): InspectorRelationGraphData {
  const objectByID = new Map(graphNodes.map((node) => [node.id, node]));
  const incoming = buildInspectorGraphLane(backlinks, "incoming", objectByID);
  const outgoing = buildInspectorGraphLane(links, "outgoing", objectByID);
  const rowGap = 92;
  const laneHeight = Math.max(incoming.length, outgoing.length, 1) * rowGap + 320;
  const width = 1800;
  const height = Math.max(920, laneHeight);
  const focus: InspectorGraphNode = {
    id: object.id,
    title: object.title || object.id,
    type: object.type_id,
    relation: "focus",
    kind: "self",
    count: 1,
    direction: "focus",
    x: width / 2 - 95,
    y: height / 2 - 38
  };
  const positionedIncoming = positionInspectorLane(incoming, height, rowGap, 330);
  const positionedOutgoing = positionInspectorLane(outgoing, height, rowGap, 1300);
  return {
    focus,
    incoming: positionedIncoming,
    outgoing: positionedOutgoing,
    edges: [
      ...backlinks.map((edge) => toInspectorGraphEdge(edge)),
      ...links.map((edge) => toInspectorGraphEdge(edge))
    ],
    columns: [] as InspectorGraphColumn[],
    fitMode: "focus" as const,
    width,
    height
  };
}

function buildInspectorQueryGraph(object: Obj, graphNodes: Obj[], graphEdges: Link[], template: RelationQueryTemplate, hiddenTypes: string[]): InspectorRelationGraphData {
  const objectByID = new Map(graphNodes.map((node) => [node.id, node]));
  const columns = executeRelationQuery(object.id, graphEdges, objectByID, template, hiddenTypes);
  const rowGap = 92;
  const width = Math.max(1800, 680 + columns.nodesByStep.length * 360);
  const height = Math.max(920, Math.max(...columns.nodesByStep.map((nodes) => nodes.length), 1) * rowGap + 320);
  const focus: InspectorGraphNode = {
    id: object.id,
    title: object.title || object.id,
    type: object.type_id,
    relation: "focus",
    kind: "self",
    count: 1,
    direction: "focus",
    x: 220,
    y: height / 2 - 38
  };
  const outgoing = columns.nodesByStep.flatMap((nodes, stepIndex) => {
    const x = focus.x + 360 * (stepIndex + 1);
    return positionInspectorLane(nodes, height, rowGap, x);
  });
  const graphColumns: InspectorGraphColumn[] = [
    { id: "root", label: object.type_id, x: focus.x },
    ...template.steps.map((step, index) => ({
      id: `${index}-${step.relation}`,
      label: step.targetType || step.relation,
      x: focus.x + 360 * (index + 1)
    }))
  ];
  return {
    focus,
    incoming: [],
    outgoing,
    edges: columns.edges,
    columns: graphColumns,
    fitMode: "bounds" as const,
    width,
    height
  };
}

function buildProjectedRelationGraph(result: ProjectedGraphResult): InspectorRelationGraphData {
  const projectedByID = new Map(result.nodes.map((node) => [node.id, node]));
  const center = projectedByID.get(result.center);
  if (!center) throw new Error(`projected graph center missing: ${result.center}`);
  const depths = [...new Set(result.nodes.map((node) => node.depth))].sort((a, b) => a - b);
  const rowGap = 126;
  const maxRowsPerLane = 5;
  const depthCounts = depths.map((depth) => result.nodes.filter((node) => node.depth === depth).length);
  const maxRows = Math.max(1, ...depthCounts.map((count) => Math.min(count, maxRowsPerLane)));
  const totalLanes = Math.max(1, ...depthCounts.map((count) => Math.ceil(count / maxRowsPerLane)));
  const width = Math.max(1800, 680 + Math.max(...depths, 0) * 390 + Math.max(0, totalLanes - 1) * 300);
  const height = Math.max(920, maxRows * rowGap + 300);
  const toNode = (node: ProjectedGraphNode): InspectorGraphNode => {
    const incoming = result.edges.find((edge) => edge.to_id === node.id);
    return {
      id: node.id,
      title: node.display.title || node.title || node.id,
      type: node.type_id,
      relation: incoming?.label || incoming?.relation || "focus",
      kind: incoming?.kind || "field",
      count: incoming?.count || 1,
      direction: node.id === result.center ? "focus" : "outgoing",
      display: node.display,
      x: 0,
      y: 0
    };
  };
  const focus = { ...toNode(center), x: 220, y: height / 2 - 38 };
  const outgoing: InspectorGraphNode[] = [];
  const columns: InspectorGraphColumn[] = [{ id: "root", label: center.type_id, x: focus.x }];
  for (const depth of depths.filter((value) => value > 0)) {
    const items = result.nodes.filter((node) => node.depth === depth).map(toNode);
    const labels = [...new Set(items.map((node) => node.type))];
    const laneCount = Math.ceil(items.length / maxRowsPerLane);
    for (let lane = 0; lane < laneCount; lane++) {
      const laneItems = items.slice(lane * maxRowsPerLane, (lane + 1) * maxRowsPerLane);
      const x = focus.x + depth * 390 + lane * 300;
      outgoing.push(...positionProjectedLane(laneItems, height, rowGap, x, lane, Math.min(items.length, maxRowsPerLane)));
      columns.push({ id: `depth-${depth}-${lane}`, label: laneCount > 1 ? `${labels.join(" / ")} ${lane + 1}` : labels.join(" / "), x });
    }
  }
  return {
    focus,
    incoming: [],
    outgoing,
    edges: result.edges.map((edge) => ({ ...edge })),
    columns,
    fitMode: "bounds",
    width,
    height
  };
}

function positionProjectedLane(nodes: InspectorGraphNode[], height: number, rowGap: number, x: number, lane: number, primaryRows: number) {
  if (lane === 0 || primaryRows < 2) return positionInspectorLane(nodes, height, rowGap, x);
  const primaryContentHeight = (primaryRows - 1) * rowGap;
  const primaryStart = Math.max(96, height / 2 - primaryContentHeight / 2 - 38);
  const gapPositions = Array.from({ length: primaryRows - 1 }, (_, index) => primaryStart + rowGap * (index + 0.5));
  if (nodes.length === 1) {
    return [{ ...nodes[0], x, y: gapPositions[Math.floor(gapPositions.length / 2)] }];
  }
  return nodes.map((node, index) => {
    const gapIndex = Math.round(index * (gapPositions.length - 1) / Math.max(nodes.length - 1, 1));
    return { ...node, x, y: gapPositions[gapIndex] };
  });
}

function executeRelationQuery(rootID: string, graphEdges: Link[], objectByID: Map<string, Obj>, template: RelationQueryTemplate, hiddenTypes: string[]) {
  let frontier = new Set([rootID]);
  let orderByID = new Map([[rootID, 0]]);
  const nodesByStep: InspectorGraphNode[][] = [];
  const resultEdges = new Map<string, InspectorGraphEdge>();
  const sortedEdges = [...graphEdges].sort((a, b) => {
    const aFrom = objectByID.get(a.from_id)?.title || a.from_id;
    const bFrom = objectByID.get(b.from_id)?.title || b.from_id;
    if (aFrom !== bFrom) return aFrom.localeCompare(bFrom);
    const aTo = objectByID.get(a.to_id)?.title || a.to_id;
    const bTo = objectByID.get(b.to_id)?.title || b.to_id;
    return aTo.localeCompare(bTo);
  });
  for (const step of template.steps) {
    const nextIDs = new Set<string>();
    const nodeMap = new Map<string, InspectorGraphNode>();
    const nextOrderByID = new Map<string, number>();
    for (const edge of sortedEdges) {
      if (edge.kind !== "field" || edge.relation !== step.relation) continue;
      const sourceMatches = step.direction === "out" ? frontier.has(edge.from_id) : frontier.has(edge.to_id);
      if (!sourceMatches) continue;
      const sourceID = step.direction === "out" ? edge.from_id : edge.to_id;
      const targetID = step.direction === "out" ? edge.to_id : edge.from_id;
      const target = objectByID.get(targetID);
      const targetType = target?.type_id || inferObjectType(targetID);
      if (step.targetType && targetType !== step.targetType) continue;
      if (hiddenTypes.includes(targetType)) continue;
      nextIDs.add(targetID);
      const sourceOrder = orderByID.get(sourceID) ?? 0;
      nextOrderByID.set(targetID, Math.min(nextOrderByID.get(targetID) ?? Number.POSITIVE_INFINITY, sourceOrder));
      const existing = nodeMap.get(targetID);
      if (existing) {
        existing.count += 1;
      } else {
        nodeMap.set(targetID, {
          id: targetID,
          title: target?.title || humanizeObjectID(targetID),
          type: targetType,
          relation: step.relation,
          kind: edge.kind,
          count: 1,
          direction: "outgoing",
          x: 0,
          y: 0
        });
      }
      const edgeKey = `${edge.from_id}\u0000${edge.to_id}\u0000${edge.relation}`;
      const existingEdge = resultEdges.get(edgeKey);
      if (existingEdge) {
        existingEdge.count += 1;
      } else {
        resultEdges.set(edgeKey, toInspectorGraphEdge(edge));
      }
    }
    const sortedNodes = [...nodeMap.values()].sort((a, b) => {
      const orderDelta = (nextOrderByID.get(a.id) ?? 0) - (nextOrderByID.get(b.id) ?? 0);
      return orderDelta || compareInspectorNodes(a, b);
    });
    sortedNodes.forEach((node, index) => nextOrderByID.set(node.id, index));
    nodesByStep.push(sortedNodes);
    frontier = new Set(sortedNodes.map((node) => node.id));
    orderByID = nextOrderByID;
  }
  return { nodesByStep, edges: [...resultEdges.values()] };
}

function buildInspectorGraphLane(links: Link[], direction: "incoming" | "outgoing", objectByID: Map<string, Obj>) {
  const byID = new Map<string, InspectorGraphNode>();
  for (const link of links) {
    const id = direction === "incoming" ? link.from_id : link.to_id;
    const object = objectByID.get(id);
    const existing = byID.get(id);
    if (existing) {
      existing.count += 1;
      if (!existing.relation.includes(link.relation)) existing.relation = `${existing.relation}, ${link.relation}`;
      if (existing.kind !== "field" && link.kind === "field") existing.kind = "field";
      continue;
    }
    byID.set(id, {
      id,
      title: object?.title || humanizeObjectID(id),
      type: object?.type_id || inferObjectType(id),
      relation: link.relation,
      kind: link.kind,
      count: 1,
      direction,
      x: 0,
      y: 0
    });
  }
  return [...byID.values()].sort(compareInspectorNodes);
}

function compareInspectorNodes(a: InspectorGraphNode, b: InspectorGraphNode) {
    if (a.type !== b.type) return graphTypeOrder([a.type, b.type])[0] === a.type ? -1 : 1;
    return a.title.localeCompare(b.title);
}

function positionInspectorLane(nodes: InspectorGraphNode[], height: number, rowGap: number, x: number) {
  if (nodes.length === 0) return [];
  const contentHeight = (nodes.length - 1) * rowGap;
  const start = Math.max(96, height / 2 - contentHeight / 2 - 38);
  return nodes.map((node, index) => ({ ...node, x, y: start + index * rowGap }));
}

function toInspectorGraphEdge(edge: Link): InspectorGraphEdge {
  return { from_id: edge.from_id, to_id: edge.to_id, kind: edge.kind, relation: edge.relation, count: 1 };
}

function relationNearbyTemplate(): RelationQueryTemplate {
  return { id: "nearby", label: "Direct links", description: "Direct field and body links around the current object", steps: [] };
}

function relationQueryTemplatesFor(typeID: string, config: GraphViewConfig = { version: 1, views: [] }): RelationQueryTemplate[] {
  const nearby = relationNearbyTemplate();
  const configured = config.views
    .filter((view) => view.root_type === typeID)
    .map((view) => graphViewDefinitionToTemplate(view, typeID));
  return configured.length > 0 ? [...configured, nearby] : [nearby];
}

function relationQueryTemplate(rootType: string, steps: RelationQueryStep[]): RelationQueryTemplate {
  const types = [rootType, ...steps.map((step) => step.targetType || step.relation)];
  const label = relationQueryPathLabel(rootType, steps);
  const id = types.join("-");
  return {
    id,
    label,
    description: `Follow ${label} from the current ${rootType}`,
    steps
  };
}

function graphViewDefinitionToTemplate(view: GraphViewDefinition, rootType: string): RelationQueryTemplate {
  const steps = graphViewPrimarySteps(view).map((step) => ({
    relation: step.relation,
    direction: step.direction,
    targetType: step.target_type
  }));
  return {
    id: view.id,
    label: view.label || relationQueryPathLabel(rootType, steps),
    description: view.description || `Follow ${relationQueryPathLabel(rootType, steps)} from the current ${rootType}`,
    steps,
    configurable: true
  };
}

function normalizeGraphViewConfigForUI(input: GraphViewConfig | undefined): GraphViewConfig {
  const views = Array.isArray(input?.views) ? input.views : [];
  return {
    version: input?.version || 1,
    views: views
      .filter((view) => view && typeof view.id === "string" && typeof view.root_type === "string")
      .map((view) => ({
        id: view.id,
        label: view.label || view.id,
        root_type: view.root_type,
        description: view.description,
        steps: Array.isArray(view.steps) ? view.steps.filter((step) => step.direction === "in" || step.direction === "out").map((step) => ({
          relation: step.relation,
          direction: step.direction,
          target_type: step.target_type,
          display: step.display
        })) : undefined,
        paths: Array.isArray(view.paths) ? view.paths.map((path) => ({ steps: Array.isArray(path.steps) ? path.steps.filter((step) => step.direction === "in" || step.direction === "out").map((step) => ({
          relation: step.relation,
          direction: step.direction,
          target_type: step.target_type,
          display: step.display
        })) : [] })).filter((path) => path.steps.length > 0) : undefined,
        nodes: view.nodes ?? {},
        bridges: view.bridges ?? {}
      }))
      .filter((view) => graphViewPrimarySteps(view).length > 0)
  };
}

function graphViewPrimarySteps(view: GraphViewDefinition) {
  return view.paths?.[0]?.steps ?? view.steps ?? [];
}

function graphViewConfigEqual(left: GraphViewConfig, right: GraphViewConfig) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cleanGraphNodeTemplates(templates: Record<string, GraphNodeTemplate>) {
  const out: Record<string, GraphNodeTemplate> = {};
  for (const [typeID, template] of Object.entries(templates)) {
    const cleaned: GraphNodeTemplate = {
      variant: template.variant || "standard",
      title_field: template.title_field || "title",
      subtitle_field: template.subtitle_field || undefined,
      meta_fields: template.meta_fields?.filter(Boolean),
      badge_fields: template.badge_fields?.filter(Boolean),
      image_field: template.image_field || undefined
    };
    out[typeID] = cleaned;
  }
  return out;
}

function cleanGraphBridgeConfigs(configs: Record<string, GraphBridgeConfig>) {
  const out: Record<string, GraphBridgeConfig> = {};
  for (const [typeID, config] of Object.entries(configs)) {
    out[typeID] = { label_fields: config.label_fields?.filter(Boolean), aggregate: config.aggregate !== false };
  }
  return out;
}

function splitCommaList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseRelationStepsText(text: string): { steps: RelationQueryStep[]; error?: string } {
  const steps: RelationQueryStep[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const [direction, relation, targetType] = line.split(/\s+/);
    if (direction !== "in" && direction !== "out") return { steps: [], error: `Invalid direction in: ${line}` };
    if (!relation) return { steps: [], error: `Missing relation in: ${line}` };
    if (!targetType) return { steps: [], error: `Missing target_type in: ${line}` };
    steps.push({ direction, relation, targetType });
  }
  return { steps };
}

function relationStepsToText(steps: RelationQueryStep[]) {
  return steps.map((step) => `${step.direction} ${step.relation} ${step.targetType || ""}`.trim()).join("\n");
}

function slugifyGraphViewLabel(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "graph-view";
}

function relationQueryPathLabel(rootType: string, steps: RelationQueryStep[]) {
  let label = rootType;
  steps.forEach((step) => {
    label += step.direction === "in" ? " <- " : " -> ";
    label += step.targetType || step.relation;
  });
  return label;
}

function relationGraphGroups(graph: InspectorRelationGraphData, nodes: InspectorGraphNode[]) {
  if (graph.columns.length > 0) {
    return graph.columns.map((column) => ({
      id: column.id,
      label: column.label,
      items: nodes
        .filter((node) => Math.abs(node.x - column.x) < 40)
        .sort((a, b) => a.y - b.y)
    })).filter((group) => group.items.length > 0);
  }
  return [
    { id: "focus", label: "center", items: [graph.focus] },
    { id: "incoming", label: "upstream", items: graph.incoming },
    { id: "outgoing", label: "downstream", items: graph.outgoing }
  ].filter((group) => group.items.length > 0);
}

function inferObjectType(id: string) {
  if (id.startsWith("source.")) return "source.item";
  if (id.startsWith("social.analytics.")) return "social.analytics.snapshot";
  if (id.startsWith("social.account.")) return "social.account";
  if (id.startsWith("social.post.")) return "social.post";
  const [prefix] = id.split(".");
  return prefix || "object";
}

function humanizeObjectID(id: string) {
  const parts = id.split(".");
  const rest = parts.length > 1 ? parts.slice(1).join(" ") : id;
  return rest.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  return objectDisplayTitle(a).localeCompare(objectDisplayTitle(b));
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
      <div className="truncate text-xs font-semibold">{objectDisplayTitle(object)}</div>
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
