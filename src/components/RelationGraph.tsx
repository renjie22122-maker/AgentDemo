import { useId } from 'react';
export interface RelationNode {
  id: string;
  label: string;
  subtitle: string;
}
export interface RelationEdge {
  from: string;
  to: string;
  label?: string;
}
export function graphLayout(nodes: RelationNode[], edges: RelationEdge[], peer = false) {
  const ids = new Set(nodes.map((n) => n.id)),
    levels = new Map<string, number>();
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>();
  for (const e of edges)
    if (ids.has(e.from) && ids.has(e.to) && e.from !== e.to) {
      incoming.set(e.to, incoming.get(e.to)! + 1);
      next.set(e.from, [...(next.get(e.from) || []), e.to]);
    }
  const queue = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++)
    for (const to of next.get(queue[i]) || []) {
      levels.set(to, Math.max(levels.get(to) || 0, (levels.get(queue[i]) || 0) + 1));
      incoming.set(to, incoming.get(to)! - 1);
      if (incoming.get(to) === 0) queue.push(to);
    }
  const groups = new Map<number, number>();
  return nodes.map((node, index) => {
    const level = peer ? Math.floor(index / 3) : levels.get(node.id) || 0;
    const column = groups.get(level) || 0;
    groups.set(level, column + 1);
    return { ...node, x: column * 224 + 24, y: level * 118 + 24 };
  });
}
export function RelationGraph({
  nodes,
  edges,
  peer,
  zh,
  onSelect,
}: {
  nodes: RelationNode[];
  edges: RelationEdge[];
  peer?: boolean;
  zh: boolean;
  onSelect: (id: string) => void;
}) {
  const marker = useId().replaceAll(':', '');
  const shown = nodes.slice(0, 60),
    points = graphLayout(shown, edges, peer);
  const byId = new Map(points.map((n) => [n.id, n]));
  const width = Math.max(480, ...points.map((p) => p.x + 212)),
    height = Math.max(130, ...points.map((p) => p.y + 92));
  return (
    <div className="relation-graph-shell">
      {nodes.length > 60 && (
        <p className="muted">
          {zh
            ? '图中显示前 60 个节点，其余可在列表查看。'
            : 'Graph shows the first 60 nodes; all remain available in the list.'}
        </p>
      )}
      <div
        className="relation-graph-scroll"
        tabIndex={0}
        aria-label={zh ? '关系图，可横向滚动' : 'Relationship graph, horizontally scrollable'}
      >
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={zh ? 'Agent 与任务关系图' : 'Agent and task relationship graph'}
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((edge, index) => {
            const a = byId.get(edge.from),
              b = byId.get(edge.to);
            if (!a || !b) return null;
            const same = a.y === b.y,
              x1 = a.x + 96,
              y1 = a.y + (same ? 0 : 66),
              x2 = b.x + 96,
              y2 = b.y;
            const middle = same ? Math.max(3, a.y - 20) : (y1 + y2) / 2;
            return (
              <g key={index} className="relation-graph-edge">
                <path
                  d={
                    same
                      ? 'M ' +
                        x1 +
                        ' ' +
                        y1 +
                        ' Q ' +
                        (x1 + x2) / 2 +
                        ' ' +
                        middle +
                        ' ' +
                        x2 +
                        ' ' +
                        y2
                      : 'M ' +
                        x1 +
                        ' ' +
                        y1 +
                        ' C ' +
                        x1 +
                        ' ' +
                        middle +
                        ' ' +
                        x2 +
                        ' ' +
                        middle +
                        ' ' +
                        x2 +
                        ' ' +
                        y2
                  }
                  fill="none"
                  markerEnd={'url(#' + marker + ')'}
                />
                <title>{a.label + ' → ' + b.label + (edge.label ? ' · ' + edge.label : '')}</title>
                {edge.label && (
                  <text x={(x1 + x2) / 2} y={middle - 4} textAnchor="middle">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {points.map((node) => (
            <g
              key={node.id}
              className="relation-graph-node"
              role="button"
              tabIndex={0}
              aria-label={node.label + ' · ' + node.subtitle}
              transform={'translate(' + node.x + ',' + node.y + ')'}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(node.id);
                }
              }}
            >
              <title>{node.label + ' · ' + node.subtitle}</title>
              <rect width={192} height={66} rx={12} />
              <text x={12} y={26}>
                {node.label.length > 15 ? node.label.slice(0, 14) + '…' : node.label}
              </text>
              <text className="relation-graph-subtitle" x={12} y={49}>
                {node.subtitle.length > 24 ? node.subtitle.slice(0, 23) + '…' : node.subtitle}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
