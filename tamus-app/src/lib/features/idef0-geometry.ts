import type { Block, Flow, PortSide } from '$lib/domain/project';
export interface Endpoint {
  id: string | null;
  side: PortSide;
  position: number;
  parentFlowId?: string;
}
export interface Point {
  x: number;
  y: number;
}
const normal = (side: PortSide): Point =>
  ({ left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } })[
    side
  ];
export function endpointPoint(
  endpoint: Endpoint,
  blocks: Block[],
  width: number,
  height: number,
): Point {
  const block = blocks.find((b) => b.id === endpoint.id);
  const x = block?.x ?? 0,
    y = block?.y ?? 0;
  const w = block ? (block.width ?? 210) : width,
    h = block ? (block.height ?? 110) : height;
  const p = endpoint.position;
  return {
    x: x + (endpoint.side === 'left' ? 0 : endpoint.side === 'right' ? w : w * p),
    y: y + (endpoint.side === 'top' ? 0 : endpoint.side === 'bottom' ? h : h * p),
  };
}
export function flowEndpoints(flow: Flow): [Endpoint, Endpoint] {
  return [
    {
      id: flow.sourceId,
      side: flow.sourceSide ?? (flow.sourceId === null ? 'left' : 'right'),
      position: flow.sourcePosition ?? 0.5,
    },
    {
      id: flow.targetId,
      side: flow.targetSide ?? (flow.targetId === null ? 'right' : 'left'),
      position: flow.targetPosition ?? 0.5,
    },
  ];
}
// Search a rectilinear visibility grid. Cost includes bends so arrows prefer simple routes.
export function arrowRoute(
  source: Endpoint,
  target: Endpoint,
  blocks: Block[],
  width: number,
  height: number,
) {
  const start = endpointPoint(source, blocks, width, height),
    end = endpointPoint(target, blocks, width, height);
  const offset = (p: Point, e: Endpoint): Point => {
    const n = normal(e.side),
      d = e.id === null ? -26 : 26;
    return {
      x: Math.max(0, Math.min(width, p.x + n.x * d)),
      y: Math.max(0, Math.min(height, p.y + n.y * d)),
    };
  };
  const a = offset(start, source),
    b = offset(end, target);
  const obstacles = blocks.map((r) => ({
    left: r.x - 12,
    right: r.x + (r.width ?? 210) + 12,
    top: r.y - 12,
    bottom: r.y + (r.height ?? 110) + 12,
  }));
  const xs = [
    ...new Set([a.x, b.x, 20, width - 20, ...obstacles.flatMap((r) => [r.left, r.right])]),
  ]
    .filter((x) => x >= 0 && x <= width)
    .sort((a, b) => a - b);
  const ys = [
    ...new Set([a.y, b.y, 20, height - 20, ...obstacles.flatMap((r) => [r.top, r.bottom])]),
  ]
    .filter((y) => y >= 0 && y <= height)
    .sort((a, b) => a - b);
  const clear = (p: Point, q: Point) =>
    !obstacles.some((r) =>
      p.x === q.x
        ? p.x > r.left &&
          p.x < r.right &&
          Math.max(p.y, q.y) > r.top &&
          Math.min(p.y, q.y) < r.bottom
        : p.y > r.top &&
          p.y < r.bottom &&
          Math.max(p.x, q.x) > r.left &&
          Math.min(p.x, q.x) < r.right,
    );
  const key = (x: number, y: number, d: number) => `${x},${y},${d}`;
  const first = { x: xs.indexOf(a.x), y: ys.indexOf(a.y), d: 0, cost: 0, key: '' };
  first.key = key(first.x, first.y, 0);
  const queue = [first],
    costs = new Map([[first.key, 0]]),
    previous = new Map<string, string>();
  let last: typeof first | undefined;
  while (queue.length) {
    queue.sort((a, b) => b.cost - a.cost);
    const cur = queue.pop()!;
    if (cur.cost !== costs.get(cur.key)) continue;
    const p = { x: xs[cur.x], y: ys[cur.y] };
    if (p.x === b.x && p.y === b.y) {
      last = cur;
      break;
    }
    for (const [dx, dy, d] of [
      [-1, 0, 1],
      [1, 0, 1],
      [0, -1, 2],
      [0, 1, 2],
    ]) {
      const x = cur.x + dx,
        y = cur.y + dy;
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      const q = { x: xs[x], y: ys[y] };
      if (!clear(p, q)) continue;
      const cost =
          cur.cost + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + (cur.d && cur.d !== d ? 25 : 0),
        k = key(x, y, d);
      if (cost >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k, cost);
      previous.set(k, cur.key);
      queue.push({ x, y, d, cost, key: k });
    }
  }
  const middle: Point[] = [];
  if (last) {
    let k: string | undefined = last.key;
    while (k) {
      const [x, y] = k.split(',').map(Number);
      middle.unshift({ x: xs[x], y: ys[y] });
      k = previous.get(k);
    }
  } else middle.push(a, { x: b.x, y: a.y }, b);
  const points = [start, ...middle, end].filter(
    (p, i, list) => !i || p.x !== list[i - 1].x || p.y !== list[i - 1].y,
  );
  const simplified = points.filter((point, index) => {
    const before = points[index - 1],
      after = points[index + 1];
    return (
      !before ||
      !after ||
      !(
        (before.x === point.x && point.x === after.x) ||
        (before.y === point.y && point.y === after.y)
      )
    );
  });
  const segments = simplified.slice(1).map((point, index) => ({
    a: simplified[index],
    b: point,
    length: Math.abs(point.x - simplified[index].x) + Math.abs(point.y - simplified[index].y),
  }));
  const candidates = segments
    .sort((a, b) => b.length - a.length)
    .map((segment) => ({
      x: Math.max(100, Math.min(width - 100, (segment.a.x + segment.b.x) / 2)),
      y: Math.max(18, Math.min(height - 18, (segment.a.y + segment.b.y) / 2)),
    }));
  const clearLabel = (p: Point) =>
    !blocks.some(
      (block) =>
        p.x + 100 > block.x - 4 &&
        p.x - 100 < block.x + (block.width ?? 210) + 4 &&
        p.y + 18 > block.y - 4 &&
        p.y - 18 < block.y + (block.height ?? 110) + 4,
    );
  // Keep labels on the line when possible, then search beside it if no segment fits.
  const alternatives = candidates.flatMap((point) =>
    [-30, 30, -60, 60].map((dy) => ({
      x: point.x,
      y: Math.max(18, Math.min(height - 18, point.y + dy)),
    })),
  );
  const label = [...candidates, ...alternatives].find(clearLabel) ?? candidates[0] ?? start;

  return {
    path: simplified.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '),
    x: label.x,
    y: label.y,
  };
}
