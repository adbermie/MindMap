import { useQuery } from "@tanstack/react-query";
import { Maximize2, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods } from "react-force-graph-2d";

import { api } from "../api";
import { cn } from "../lib/utils";
import type { GraphEdge, GraphNode } from "../types";
import { EntryDrawer } from "./EntryDrawer";

// Stable color from a string — same tag keeps the same hue across reloads.
function colorForTag(tag: string | null): string {
  if (!tag) return "#9ca3af";
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 55%)`;
}

type SimNode = GraphNode & { x?: number; y?: number };
type SimLink = Omit<GraphEdge, "source" | "target"> & {
  source: string | SimNode;
  target: string | SimNode;
};

const endpointId = (e: string | SimNode): string =>
  typeof e === "object" ? e.id : e;

function nodeRadius(n: SimNode): number {
  if (n.type === "tag") return 5 + Math.sqrt(n.count) * 2.4;
  return 3 + n.count * 1.1;
}

type DatePreset = "all" | "30d" | "7d";

export function GraphView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["graph"],
    queryFn: api.getGraph,
    refetchOnWindowFocus: false,
  });

  const [openId, setOpenId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<SimNode, SimLink> | undefined>(undefined);
  const [dims, setDims] = useState({ width: 600, height: 600 });
  const didFitRef = useRef(false);

  // Theme-reactive: track the `dark` class so colors update on toggle.
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Filters
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [hideRaw, setHideRaw] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  // Hover highlight
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    function resize() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDims({ width: rect.width, height: Math.max(420, window.innerHeight - 240) });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // All tags (for the filter bar / legend), most-used first.
  const allTags = useMemo(() => {
    if (!data) return [] as { name: string; count: number }[];
    return data.nodes
      .filter((n) => n.type === "tag")
      .map((n) => ({ name: n.primary_tag as string, count: n.count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // Structural filter → a fresh, stable-per-filter graph for the simulation.
  const graphData = useMemo(() => {
    if (!data) return { nodes: [] as SimNode[], links: [] as SimLink[] };

    const cutoff =
      datePreset === "all"
        ? 0
        : Date.now() - (datePreset === "7d" ? 7 : 30) * 86400_000;

    const entries = data.nodes.filter((n) => {
      if (n.type !== "entry") return false;
      if (hideRaw && n.status === "raw") return false;
      if (activeTag && !n.tags.includes(activeTag)) return false;
      if (cutoff && n.created_at && new Date(n.created_at).getTime() < cutoff) return false;
      return true;
    });
    const keptEntryIds = new Set(entries.map((n) => n.id));

    // Keep tag nodes that are still referenced (or the active tag).
    const referencedTags = new Set<string>();
    for (const e of entries) for (const t of e.tags) referencedTags.add(t);
    if (activeTag) {
      for (const t of [...referencedTags]) if (t !== activeTag) referencedTags.delete(t);
    }
    const tags = data.nodes.filter(
      (n) => n.type === "tag" && referencedTags.has(n.primary_tag as string),
    );
    const keptIds = new Set<string>([...keptEntryIds, ...tags.map((t) => t.id)]);

    const nodes = [...entries, ...tags].map((n) => ({ ...n })) as SimNode[];
    const links = data.edges
      .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
      .map((e) => ({ ...e })) as SimLink[];
    return { nodes, links };
  }, [data, hideRaw, activeTag, datePreset]);

  // Re-fit when the structural graph changes.
  useEffect(() => {
    didFitRef.current = false;
  }, [graphData]);

  // Search matches (entries by label/tags) — a render-time highlight, not a filter.
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null as Set<string> | null;
    const set = new Set<string>();
    for (const n of graphData.nodes) {
      if (n.type !== "entry") continue;
      if (n.label.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
        set.add(n.id);
    }
    return set;
  }, [search, graphData]);

  // Neighborhood of the hovered node.
  const hoverSet = useMemo(() => {
    if (!hoverId) return null as Set<string> | null;
    const set = new Set<string>([hoverId]);
    for (const l of graphData.links) {
      const s = endpointId(l.source);
      const t = endpointId(l.target);
      if (s === hoverId) set.add(t);
      else if (t === hoverId) set.add(s);
    }
    return set;
  }, [hoverId, graphData]);

  // The active "focus" set drives dimming. Hover wins over search.
  const focusSet = hoverSet ?? searchMatches;

  const linkColor = isDark ? "rgba(228,228,231,0.22)" : "rgba(24,24,27,0.18)";
  const linkColorLink = isDark ? "rgba(245,158,11,0.55)" : "rgba(217,119,6,0.55)";
  const labelColor = isDark ? "#e4e4e7" : "#18181b";
  const dimColor = isDark ? "rgba(120,120,130,0.18)" : "rgba(120,120,130,0.18)";

  function fit() {
    fgRef.current?.zoomToFit(400, 40);
  }
  function resetFilters() {
    setSearch("");
    setActiveTag(null);
    setHideRaw(true);
    setDatePreset("all");
  }

  if (isLoading) {
    return <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">Loading graph…</p>;
  }
  if (error) {
    return (
      <p className="px-1 text-sm text-red-600 dark:text-red-400">
        Failed to load graph: {(error as Error).message}
      </p>
    );
  }
  if (!data || data.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-900/50 dark:border-ink-900 dark:text-ink-100/50">
        Process a few entries first — the graph fills in as Claude tags and links them.
      </div>
    );
  }

  return (
    <>
      {/* Controls */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-900/40 dark:text-ink-100/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchMatches && searchMatches.size > 0) {
                  fgRef.current?.zoomToFit(400, 60, (n: SimNode) => searchMatches.has(n.id));
                }
              }}
              placeholder="Find an entry…"
              className="w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs text-ink-900 placeholder:text-ink-900/40 focus:border-ink-900/30 focus:outline-none dark:border-ink-900 dark:bg-ink-900/40 dark:text-ink-100 dark:placeholder:text-ink-100/40"
            />
          </div>
          {searchMatches && (
            <span className="text-[11px] text-ink-900/50 dark:text-ink-100/50">
              {searchMatches.size} match{searchMatches.size === 1 ? "" : "es"}
            </span>
          )}
          <button
            onClick={() => setHideRaw((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition",
              hideRaw
                ? "border-ink-200 text-ink-900/50 dark:border-ink-900 dark:text-ink-100/50"
                : "border-ink-900/30 text-ink-900 dark:border-ink-100/30 dark:text-ink-100",
            )}
            title="Toggle raw (unprocessed) entries"
          >
            {hideRaw ? "Raw hidden" : "Raw shown"}
          </button>
          <div className="inline-flex rounded-full bg-ink-100 p-0.5 text-[11px] dark:bg-ink-900">
            {(["all", "30d", "7d"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={cn(
                  "rounded-full px-2 py-0.5 transition",
                  datePreset === p
                    ? "bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-100"
                    : "text-ink-900/50 dark:text-ink-100/50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={fit}
            className="rounded-full border border-ink-200 p-1.5 text-ink-900/50 transition hover:text-ink-900 dark:border-ink-900 dark:text-ink-100/50 dark:hover:text-ink-100"
            title="Zoom to fit"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetFilters}
            className="rounded-full border border-ink-200 p-1.5 text-ink-900/50 transition hover:text-ink-900 dark:border-ink-900 dark:text-ink-100/50 dark:hover:text-ink-100"
            title="Reset filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tag filter / legend */}
        <div className="flex flex-wrap gap-1.5">
          {allTags.slice(0, 24).map((t) => (
            <button
              key={t.name}
              onClick={() => setActiveTag((cur) => (cur === t.name ? null : t.name))}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                activeTag === t.name
                  ? "border-ink-900/40 bg-ink-100 text-ink-900 dark:border-ink-100/40 dark:bg-ink-800 dark:text-ink-100"
                  : "border-transparent text-ink-900/60 hover:bg-ink-50 dark:text-ink-100/60 dark:hover:bg-ink-900/50",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: colorForTag(t.name) }}
              />
              #{t.name}
              <span className="text-ink-900/30 dark:text-ink-100/30">{t.count}</span>
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] text-ink-900/50 hover:text-ink-900 dark:text-ink-100/50 dark:hover:text-ink-100"
            >
              <X className="h-3 w-3" /> clear
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-900 dark:bg-ink-900/40"
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dims.width}
          height={dims.height}
          nodeId="id"
          nodeVal={(n: SimNode) => (n.type === "tag" ? 8 : 2)}
          cooldownTicks={120}
          onEngineStop={() => {
            if (!didFitRef.current) {
              didFitRef.current = true;
              fit();
            }
          }}
          onNodeHover={(n: SimNode | null) => setHoverId(n ? n.id : null)}
          onNodeClick={(n: SimNode) => {
            if (n.type === "entry" && n.entry_id != null) setOpenId(n.entry_id);
            else if (n.type === "tag")
              setActiveTag((cur) => (cur === n.primary_tag ? null : n.primary_tag));
          }}
          onBackgroundClick={() => setHoverId(null)}
          linkColor={(l: SimLink) =>
            focusSet && !(focusSet.has(endpointId(l.source)) && focusSet.has(endpointId(l.target)))
              ? dimColor
              : l.type === "link"
                ? linkColorLink
                : linkColor
          }
          linkWidth={(l: SimLink) => (l.type === "link" ? 1.5 : 0.6)}
          linkDirectionalArrowLength={(l: SimLink) => (l.type === "link" ? 4 : 0)}
          linkDirectionalArrowRelPos={0.98}
          linkCurvature={(l: SimLink) => (l.type === "link" ? 0.15 : 0)}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={(node: SimNode, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeCanvasObject={(node: SimNode, ctx, globalScale) => {
            const r = nodeRadius(node);
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const dim = focusSet ? !focusSet.has(node.id) : false;
            const color =
              node.type === "tag" ? colorForTag(node.primary_tag) : colorForTag(node.primary_tag);

            ctx.globalAlpha = dim ? 0.2 : 1;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            if (node.type === "tag") {
              ctx.lineWidth = 1.5 / globalScale;
              ctx.strokeStyle = isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)";
              ctx.stroke();
            }

            // Labels: tags always; entries when zoomed in or highlighted.
            const showLabel =
              node.type === "tag" || globalScale >= 1.3 || (focusSet?.has(node.id) ?? false);
            if (showLabel && !dim) {
              const fontSize = (node.type === "tag" ? 11 : 10) / globalScale;
              ctx.font = `${node.type === "tag" ? "600 " : ""}${fontSize}px ui-sans-serif, system-ui, sans-serif`;
              ctx.fillStyle = labelColor;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              const text = node.type === "tag" ? node.label : node.label.slice(0, 48);
              ctx.fillText(text, x, y + r + 1.5);
            }
            ctx.globalAlpha = 1;
          }}
        />
      </div>
      <p className="mt-2 px-1 text-[11px] text-ink-900/40 dark:text-ink-100/40">
        Hover to highlight connections · click a tag to focus its cluster · click an entry to open it
        · amber edges are Claude's links between entries.
      </p>
      <EntryDrawer entryId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
