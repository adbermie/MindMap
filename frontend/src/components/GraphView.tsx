import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods } from "react-force-graph-2d";

import { api } from "../api";
import type { GraphNode } from "../types";
import { EntryDrawer } from "./EntryDrawer";

// Stable color from a string — keeps the same tag the same hue across reloads.
function colorForTag(tag: string | null): string {
  if (!tag) return "#9ca3af"; // ink/gray for untagged
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export function GraphView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["graph"],
    queryFn: api.getGraph,
    refetchOnWindowFocus: false,
  });
  const [openId, setOpenId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<SimNode> | undefined>(undefined);
  const [dims, setDims] = useState({ width: 600, height: 600 });

  useEffect(() => {
    function resize() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDims({ width: rect.width, height: Math.max(400, window.innerHeight - 220) });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Graph data must be a stable reference per data fetch, or the simulation
  // restarts on every render.
  const graphData = useMemo(() => {
    if (!data)
      return { nodes: [] as SimNode[], links: [] as { source: number; target: number; reason: string | null }[] };
    return {
      nodes: data.nodes.map((n) => ({ ...n })) as SimNode[],
      links: data.edges.map((e) => ({ ...e })),
    };
  }, [data]);

  if (isLoading) {
    return (
      <p className="px-1 text-sm text-ink-900/40 dark:text-ink-100/40">
        Loading graph…
      </p>
    );
  }
  if (error) {
    return (
      <p className="px-1 text-sm text-red-600 dark:text-red-400">
        Failed to load graph: {(error as Error).message}
      </p>
    );
  }
  if (graphData.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center text-sm text-ink-900/50 dark:border-ink-900 dark:text-ink-100/50">
        Process a few entries first — the graph fills in as Claude tags and
        links them.
      </div>
    );
  }

  const isDark = document.documentElement.classList.contains("dark");
  const linkColor = isDark ? "rgba(228, 228, 231, 0.25)" : "rgba(24, 24, 27, 0.2)";
  const labelColor = isDark ? "#e4e4e7" : "#18181b";

  return (
    <>
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
          nodeLabel={(n: SimNode) => `${n.label}${n.primary_tag ? `\n#${n.primary_tag}` : ""}`}
          nodeVal={(n: SimNode) => 4 + n.tag_count * 1.2}
          nodeColor={(n: SimNode) => colorForTag(n.primary_tag)}
          linkColor={() => linkColor}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.95}
          linkCurvature={0.12}
          cooldownTicks={120}
          onNodeClick={(n: SimNode) => setOpenId(n.id)}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: SimNode, ctx, globalScale) => {
            if (globalScale < 1.3) return; // hide labels when zoomed out
            const label = node.label;
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
            ctx.fillStyle = labelColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const radius = 4 + node.tag_count * 1.2;
            ctx.fillText(label.slice(0, 60), x, y + radius + 2);
          }}
        />
      </div>
      <EntryDrawer entryId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
