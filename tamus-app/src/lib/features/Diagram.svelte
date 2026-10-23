<script lang="ts">
  import { t, count } from '$lib/i18n';
  import { untrack, tick } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import {
    diagramSheet,
    flowLabel,
    blockCode,
    parentDiagram,
    type Project,
    type Block,
    type Model,
    type Flow,
    type BoundaryPort,
    type PortSide,
  } from '$lib/domain/project';
  import { flowRoute, flowEndpoints, endpointPoint, type Endpoint } from './idef0-geometry';
  let {
    model,
    project,
    onedit,
    ondelete,
    oncenter,
    projectName,
    onproperties,
    onopen,
    onparent,
    ondraw,
    childBlockIds,
    hasParent,
    node,
    context,
    interfaces,
    selectedId,
    onselect,
    onmove,
    onadd,
    onflow,
    onmoveflow,
    busy,
  }: {
    model: Model;
    project: Project;
    onedit: (id: string) => void;
    ondelete: (id: string) => void;
    oncenter: (blockId?: string) => void;
    projectName: string;
    onproperties: () => void;
    onopen: (block: Block, newTab?: boolean) => void;
    onparent: () => void;
    ondraw: (flow: Omit<Flow, 'id'>) => Promise<boolean>;
    childBlockIds: string[];
    hasParent: boolean;
    node: string;
    context: string;
    interfaces: BoundaryPort[];
    selectedId: string | null;
    onselect: (id: string) => void;
    onmove: (block: Block) => void;
    onadd: (position?: { x: number; y: number }, kind?: Block['kind']) => void;
    onflow: () => void;
    onmoveflow: (flow: Flow) => void;
    busy: boolean;
  } = $props();
  let zoom = $state(0.8);
  let grid = $state(true);
  let viewport: HTMLDivElement;
  let drag = $state<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    original: Block;
    moved: boolean;
    resize: boolean;
    width: number;
    height: number;
  } | null>(null);
  let flowDrag = $state<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    original: RoutedFlow;
    waypoints: { x: number; y: number }[];
    index: number;
    label: boolean;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  let width = $derived(
    Math.max(model.pageWidth ?? 1050, ...model.blocks.map((b) => b.x + (b.width ?? 210) + 100)),
  );
  let height = $derived(
    Math.max(model.pageHeight ?? 742, ...model.blocks.map((b) => b.y + (b.height ?? 110) + 212)),
  );
  const sheet = $derived(diagramSheet(model));
  const parent = $derived(parentDiagram(project, model));
  let blocks = $derived(
    model.blocks.map((b) =>
      drag?.id === b.id
        ? {
            ...b,
            x: drag.x,
            y: drag.y,
            ...(drag.resize ? { width: drag.width, height: drag.height } : {}),
          }
        : b,
    ),
  );
  let blockKind = $state<NonNullable<Block['kind']>>('process');
  const dfd = $derived(model.notation === 'DFD');
  const contextHasProcess = $derived(
    !hasParent &&
      (node === 'A-0' || node === 'Контекст') &&
      blocks.some((b) => (b.kind ?? 'process') === 'process'),
  );
  function readableText(color: string) {
    const n = parseInt(color.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150
      ? '#25251f'
      : '#ffffff';
  }
  function blockFontSize(block: Block) {
    if (block.fontSize === undefined || !Number.isFinite(block.fontSize)) return 16;
    return Math.max(8, Math.min(72, (block.fontSize * 4) / 3));
  }
  function blockFontFamily(block: Block) {
    const name = block.fontName?.trim();
    if (!name || name === 'Dialog') return 'system-ui, sans-serif';
    return `${JSON.stringify(name)}, system-ui, sans-serif`;
  }
  function blockLineClamp(block: Block) {
    const height = block.height ?? 110;
    return Math.max(1, Math.min(8, Math.floor((height - 22) / (blockFontSize(block) * 1.2))));
  }
  let tool = $state<'select' | 'flow' | 'block'>('select');
  let pending = $state<Endpoint | null>(null);
  let cursor = $state({ x: 0, y: 0 });
  let hint = $state('');
  let drawing: HTMLDivElement;
  const bodyWidth = $derived(width - 30),
    bodyHeight = $derived(height - 182);
  const sides: PortSide[] = ['left', 'top', 'right', 'bottom'];
  const roleNames = $derived(
    dfd
      ? { left: $t('Слева'), top: $t('Сверху'), right: $t('Справа'), bottom: $t('Снизу') }
      : { left: $t('Вход'), top: $t('Управление'), right: $t('Выход'), bottom: $t('Механизм') },
  );
  const boundaryHandles = $derived(
    dfd
      ? interfaces
      : sides.flatMap((side) => {
          const inherited = interfaces.filter((p) => p.side === side);
          return inherited.length
            ? inherited
            : [
                {
                  side,
                  position: 0.5,
                  name: '',
                  flowId: '',
                  code: { left: 'I', top: 'C', right: 'O', bottom: 'M' }[side],
                },
              ];
        }),
  );
  const selectedBlockId = $derived(
    blocks.some((block) => block.id === selectedId) ? selectedId : null,
  );
  const waypointDrag = $derived(flowDrag && !flowDrag.label ? flowDrag : null);
  const routedFlows: RoutedFlow[] = $derived(
    model.flows.map((flow) => {
      const dragging = waypointDrag?.id === flow.id ? waypointDrag : null;
      const route = flowRoute(
        dragging ? { ...flow, waypoints: dragging.waypoints } : flow,
        blocks,
        bodyWidth,
        bodyHeight,
      );
      return {
        ...flow,
        label: flowLabel(project, flow),
        ...route,
      };
    }),
  );
  const flows: RoutedFlow[] = $derived(
    routedFlows.map((flow) => {
      const dragging = flowDrag?.id === flow.id && flowDrag.label ? flowDrag : null;
      return {
        ...flow,
        x: dragging?.x ?? flow.labelX ?? flow.x,
        y: dragging?.y ?? flow.labelY ?? flow.y,
      };
    }),
  );
  const preview = $derived.by(() => {
    if (!pending) return '';
    const point = endpointPoint(pending, blocks, bodyWidth, bodyHeight);
    return `M ${point.x} ${point.y} H ${(point.x + cursor.x) / 2} V ${cursor.y} H ${cursor.x}`;
  });
  function chooseTool(value: 'select' | 'flow' | 'block') {
    tool = value;
    pending = null;
    hint = '';
  }
  async function connect(endpoint: Endpoint) {
    if (busy || tool !== 'flow') return;
    if (!pending) {
      if (endpoint.id === null ? endpoint.side === 'right' : !dfd && endpoint.side !== 'right') {
        hint = 'Начните с выхода блока или входящей границы листа.';
        return;
      }
      pending = endpoint;
      cursor = endpointPoint(endpoint, blocks, bodyWidth, bodyHeight);
      hint = dfd
        ? 'Выберите сторону другого объекта DFD.'
        : 'Выберите вход, управление, механизм блока или выходную границу.';
      return;
    }
    if (
      pending.id === endpoint.id ||
      (endpoint.id === null ? endpoint.side !== 'right' : !dfd && endpoint.side === 'right')
    ) {
      hint = 'Завершите стрелку на другом блоке (I/C/M) или на правой границе (O).';
      return;
    }
    const source = pending;
    if (
      await ondraw({
        name:
          interfaces.find((p) => p.flowId === (source.parentFlowId ?? endpoint.parentFlowId))
            ?.name || '',
        sourceId: source.id,
        targetId: endpoint.id,
        sourceSide: source.side,
        targetSide: endpoint.side,
        sourcePosition: source.position,
        targetPosition: endpoint.position,
        ...((source.parentFlowId ?? endpoint.parentFlowId)
          ? { parentFlowId: source.parentFlowId ?? endpoint.parentFlowId }
          : {}),
      })
    ) {
      pending = null;
      hint = 'Стрелка создана. Название можно изменить в свойствах.';
    }
  }
  function track(event: PointerEvent) {
    moveFlowDrag(event);
    move(event);
    if (pending && drawing) {
      const rect = drawing.getBoundingClientRect();
      cursor = { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
    }
  }
  function start(event: PointerEvent, block: Block) {
    if (event.button !== 0 || busy || tool !== 'select' || event.ctrlKey || event.metaKey) return;
    onselect(block.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = {
      id: block.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: block.x,
      y: block.y,
      original: block,
      moved: false,
      resize: false,
      width: block.width ?? 210,
      height: block.height ?? 110,
    };
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / zoom,
      dy = (event.clientY - drag.startY) / zoom;
    const snap = grid ? 10 : 1;
    if (drag.resize) {
      drag.width = Math.max(
        80,
        Math.min(800, Math.round(((drag.original.width ?? 210) + dx) / snap) * snap),
      );
      drag.height = Math.max(
        50,
        Math.min(600, Math.round(((drag.original.height ?? 110) + dy) / snap) * snap),
      );
      drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      return;
    }
    drag.x = Math.max(0, Math.min(2000, Math.round((drag.original.x + dx) / snap) * snap));
    drag.y = Math.max(0, Math.min(2000, Math.round((drag.original.y + dy) / snap) * snap));
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
  }
  function end(event: PointerEvent) {
    if (flowDrag) {
      endFlowDrag(event);
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const previous = drag;
    drag = null;
    if (previous.moved)
      onmove({
        ...previous.original,
        x: previous.x,
        y: previous.y,
        ...(previous.resize ? { width: previous.width, height: previous.height } : {}),
      });
  }
  type RoutedFlow = Flow & {
    points?: { x: number; y: number }[];
    x: number;
    y: number;
    path: string;
    label: string;
  };
  function pointInDrawing(event: PointerEvent) {
    const rect = drawing.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }
  function distanceToSegment(
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    if (!length) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
  }
  function closestOnSegment(
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    if (!length) return { x: a.x, y: a.y };
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  function beginFlowDrag(event: PointerEvent, flow: RoutedFlow) {
    if (event.button !== 0 || busy || tool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    onselect(flow.id);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const pointer = pointInDrawing(event);
    const points = flow.points ?? [];
    const waypoints = (flow.waypoints?.length ? flow.waypoints : points.slice(1, -1)).map(
      (point) => ({
        ...point,
      }),
    );
    let index = -1,
      best = 22;
    waypoints.forEach((point, pointIndex) => {
      const distance = Math.hypot(pointer.x - point.x, pointer.y - point.y);
      if (distance < best) {
        best = distance;
        index = pointIndex;
      }
    });
    if (index < 0 && points.length > 1) {
      let segmentIndex = 0,
        segmentDistance = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const distance = distanceToSegment(pointer, points[i], points[i + 1]);
        if (distance < segmentDistance) {
          segmentDistance = distance;
          segmentIndex = i;
        }
      }
      if (segmentDistance <= 28) {
        const insertAt = Math.max(0, Math.min(waypoints.length, segmentIndex));
        waypoints.splice(
          insertAt,
          0,
          closestOnSegment(pointer, points[segmentIndex], points[segmentIndex + 1]),
        );
        index = insertAt;
      }
    }
    if (index < 0) return;
    flowDrag = {
      id: flow.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      original: flow,
      waypoints,
      index,
      label: false,
      x: flow.x,
      y: flow.y,
      moved: false,
    };
  }
  function beginFlowLabelDrag(event: PointerEvent, flow: RoutedFlow) {
    if (event.button !== 0 || busy || tool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    onselect(flow.id);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    flowDrag = {
      id: flow.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      original: flow,
      waypoints: [],
      index: -1,
      label: true,
      x: flow.labelX ?? flow.x,
      y: flow.labelY ?? flow.y,
      moved: false,
    };
  }
  function moveFlowDrag(event: PointerEvent) {
    if (!flowDrag || flowDrag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - flowDrag.startX) / zoom,
      dy = (event.clientY - flowDrag.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) flowDrag.moved = true;
    if (flowDrag.label) {
      flowDrag.x = Math.max(0, Math.min(2000, flowDrag.x + dx));
      flowDrag.y = Math.max(0, Math.min(2000, flowDrag.y + dy));
      flowDrag.startX = event.clientX;
      flowDrag.startY = event.clientY;
      return;
    }
    const pointer = pointInDrawing(event);
    const snap = grid ? 10 : 1;
    flowDrag.waypoints[flowDrag.index] = {
      x: Math.max(0, Math.min(2000, Math.round(pointer.x / snap) * snap)),
      y: Math.max(0, Math.min(2000, Math.round(pointer.y / snap) * snap)),
    };
  }
  function endFlowDrag(event: PointerEvent) {
    if (!flowDrag || flowDrag.pointerId !== event.pointerId) return;
    const finished = flowDrag;
    flowDrag = null;
    if (!finished.moved) return;
    const {
      points: _points,
      x: _x,
      y: _y,
      path: _path,
      label: _label,
      ...flow
    } = finished.original;
    if (finished.label) {
      onmoveflow({
        ...flow,
        labelX: Math.round(finished.x),
        labelY: Math.round(finished.y),
      });
    } else {
      onmoveflow({
        ...flow,
        waypoints: finished.waypoints,
      });
    }
  }
  function fit() {
    if (viewport)
      zoom = Math.min(
        1.3,
        Math.max(
          0.3,
          Math.min((viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height),
        ),
      );
  }
  let editor: HTMLElement;
  let menuElement = $state<HTMLDivElement>();
  let menu = $state<{
    kind: 'block' | 'flow' | 'diagram';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  function contextMenu(event: MouseEvent, kind: 'block' | 'flow' | 'diagram', id: string) {
    event.preventDefault();
    event.stopPropagation();
    chooseTool('select');
    if (id) onselect(id);
    menu = {
      kind,
      id,
      x: Math.min(event.clientX, window.innerWidth - 260),
      y: Math.min(event.clientY, window.innerHeight - 230),
    };
  }
  $effect(() => {
    if (menu) void tick().then(() => menuElement?.querySelector('button')?.focus());
  });
  function editorKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
      return;
    if (event.key === 'Escape') {
      drag = null;
      chooseTool('select');
      menu = null;
      event.preventDefault();
      return;
    }
    if (event.altKey && event.code === 'KeyC') {
      event.preventDefault();
      oncenter();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyZ') {
      event.preventDefault();
      chooseTool('select');
    }
    if (event.code === 'KeyX' && !contextHasProcess) {
      blockKind = 'process';
      event.preventDefault();
      chooseTool('block');
    }
    if (event.code === 'KeyC') {
      event.preventDefault();
      chooseTool('flow');
    }
    if (dfd && (event.code === 'KeyE' || event.code === 'KeyD')) {
      event.preventDefault();
      blockKind = event.code === 'KeyE' ? 'external' : 'dataStore';
      chooseTool('block');
    }
    if (event.code === 'KeyN') {
      event.preventDefault();
      grid = !grid;
    }
    if (
      event.key === 'Enter' &&
      selectedId &&
      (event.target === editor || (event.target as Element).closest('.function-block,.flow-hit'))
    ) {
      event.preventDefault();
      onedit(selectedId);
    }
  }
  function backgroundClick(event: MouseEvent) {
    if (
      (event.target as Element).closest(
        '.function-node,.flow-label,.flow-hit,.boundary-port,.boundary-edge',
      )
    )
      return;
    editor?.focus({ preventScroll: true });
    if (event.ctrlKey || event.metaKey) {
      pending = null;
      if (hasParent) onparent();
      return;
    }
    if (tool === 'block') {
      const rect = drawing.getBoundingClientRect(),
        snap = grid ? 10 : 1;
      onadd(
        {
          x: Math.max(
            0,
            Math.min(2000, Math.round((event.clientX - rect.left) / zoom / snap) * snap),
          ),
          y: Math.max(
            0,
            Math.min(2000, Math.round((event.clientY - rect.top) / zoom / snap) * snap),
          ),
        },
        blockKind,
      );
    } else if (tool === 'select') onproperties();
  }
  function blockPort(event: MouseEvent, block: Block, side: PortSide) {
    const rect = (event.currentTarget as HTMLElement)
      .closest('.function-node')!
      .getBoundingClientRect();
    const position =
      event.detail === 0
        ? 0.5
        : side === 'left' || side === 'right'
          ? (event.clientY - rect.top) / rect.height
          : (event.clientX - rect.left) / rect.width;
    void connect({ id: block.id, side, position: Math.max(0.05, Math.min(0.95, position)) });
  }
  function boundaryClick(event: MouseEvent, side: PortSide) {
    const rect = drawing.getBoundingClientRect();
    const position =
      event.detail === 0
        ? 0.5
        : side === 'left' || side === 'right'
          ? (event.clientY - rect.top) / rect.height
          : (event.clientX - rect.left) / rect.width;
    const nearest = interfaces
      .filter((p) => p.side === side)
      .sort((a, b) => Math.abs(a.position - position) - Math.abs(b.position - position))[0];
    void connect({
      id: null,
      side,
      position: nearest?.position ?? Math.max(0.05, Math.min(0.95, position)),
      ...(nearest ? { parentFlowId: nearest.flowId } : {}),
    });
  }
  const modelIdentity = $derived(model.id);
  $effect(() => {
    modelIdentity;
    untrack(() => {
      drag = null;
      pending = null;
      hint = '';
      tool = 'select';
      menu = null;
      fit();
    });
  });
</script>

<svelte:window
  onpointerdown={(event) => {
    if (menu && !(event.target as Element).closest('.diagram-contextmenu')) menu = null;
  }}
/>
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This diagram application supports scoped keyboard tools and exposes its objects as accessible buttons.) -->
<section
  class="diagram-editor"
  role="application"
  aria-label={$t('Рабочее поле диаграммы')}
  tabindex="0"
  bind:this={editor}
  onkeydown={editorKey}
>
  <div class="diagram-toolbar">
    <div class="tool-group">
      <button
        class="icon-button"
        class:active-tool={tool === 'select'}
        onclick={() => chooseTool('select')}
        title={$t('Выбрать и переместить')}
        aria-label={$t('Выбрать и переместить')}
        aria-pressed={tool === 'select'}><Icon name="cursor" /></button
      >
      <span class="tool-divider"></span>
      <button
        class="tool-button"
        class:active-tool={tool === 'block'}
        onclick={() => {
          blockKind = 'process';
          chooseTool('block');
        }}
        title={node === 'A-0'
          ? $t('Для добавления работ откройте декомпозицию контекстного блока')
          : $t('Добавить функциональный блок')}
        disabled={busy || contextHasProcess}
        ><Icon name="block" /><span>{dfd ? $t('Процесс') : $t('Блок')}</span></button
      >
      {#if dfd}<button
          class="tool-button"
          class:active-tool={tool === 'block' && blockKind === 'external'}
          onclick={() => {
            blockKind = 'external';
            chooseTool('block');
          }}
          disabled={busy}>{$t('Внешняя сущность')}</button
        ><button
          class="tool-button"
          class:active-tool={tool === 'block' && blockKind === 'dataStore'}
          onclick={() => {
            blockKind = 'dataStore';
            chooseTool('block');
          }}
          disabled={busy}>{$t('Хранилище')}</button
        >{/if}
      <button
        class="tool-button"
        class:active-tool={tool === 'flow'}
        aria-pressed={tool === 'flow'}
        onclick={() => chooseTool('flow')}
        disabled={busy}><Icon name="arrow" /><span>{$t('Стрелка')}</span></button
      >
    </div>
    <div class="tool-group decomposition-tools">
      <button
        class="tool-button"
        aria-label={$t('Открыть декомпозицию')}
        disabled={busy ||
          !blocks.some((b) => b.id === selectedId && (b.kind ?? 'process') === 'process')}
        onclick={() => {
          const block = blocks.find((b) => b.id === selectedId);
          if (block) onopen(block);
        }}><span>↓</span><span>{$t('В блок')}</span></button
      >
      <button
        class="tool-button"
        aria-label={$t('К родительской диаграмме')}
        disabled={busy || !hasParent}
        onclick={onparent}><span>↑</span><span>{$t('Родитель')}</span></button
      >
    </div>
    <div class="tool-group">
      <button
        class="icon-button"
        class:pressed={grid}
        onclick={() => (grid = !grid)}
        title={$t('Привязка к сетке')}
        aria-label={$t('Привязка к сетке')}
        aria-pressed={grid}><Icon name="grid" size={16} /></button
      >
      <span class="tool-divider"></span>
      <button
        class="icon-button"
        aria-label={$t('Уменьшить масштаб')}
        onclick={() => (zoom = Math.max(0.3, zoom - 0.1))}><Icon name="minus" size={16} /></button
      >
      <button class="zoom-value" onclick={() => (zoom = 1)} title={$t('Масштаб 100%')}
        >{Math.round(zoom * 100)}%</button
      >
      <button
        class="icon-button"
        aria-label={$t('Увеличить масштаб')}
        onclick={() => (zoom = Math.min(1.8, zoom + 0.1))}><Icon name="plus" size={16} /></button
      >
      <button class="icon-button" aria-label={$t('Вписать диаграмму')} onclick={fit}
        ><Icon name="fit" size={16} /></button
      >
    </div>
  </div>
  <div
    class="diagram-viewport"
    role="region"
    aria-label={$t('Редактор диаграммы')}
    bind:this={viewport}
    onpointermove={track}
    onpointerup={end}
    onpointercancel={() => (drag = null)}
  >
    <div
      class="diagram-scaled"
      style:width={`${width * zoom}px`}
      style:height={`${height * zoom}px`}
    >
      <div
        class="diagram-paper"
        style:--paper={model.backgroundColor ?? '#ffffe8'}
        style:width={`${width}px`}
        style:height={`${height}px`}
        style:transform={`scale(${zoom})`}
      >
        <button
          class="paper-heading"
          onclick={onproperties}
          oncontextmenu={(event) => contextMenu(event, 'diagram', '')}
          aria-label={$t('Свойства диаграммы')}
          title={$t('Изменить поля штампа диаграммы')}
        >
          <div class="sheet-used">
            <span>{$t('ИСПОЛЬЗУЕТСЯ В:')}</span><span class="sheet-value">{sheet.usedAt}</span>
          </div>
          <div class="sheet-details">
            <div class="sheet-detail-row">
              <span class="sheet-truncate">{$t('АВТОР:')} {sheet.author}</span><span
                >{$t('ДАТА:')} {sheet.createdAt}</span
              >
            </div>
            <div class="sheet-detail-row">
              <span class="sheet-truncate">{$t('ПРОЕКТ:')} {projectName}</span><span
                >{$t('РЕВ:')} {sheet.revisedAt}</span
              >
            </div>
            <div class="sheet-notes">{$t('ЗАМЕЧАНИЯ:')} {sheet.notes}</div>
          </div>
          <div class="sheet-readers">
            <div class="reader-row">
              <span class="reader-mark current"></span><span>{$t('ЧИТАТЕЛЬ')}</span><span
                >{$t('ДАТА')}</span
              >
            </div>
            <div class="reader-row">
              <span class="reader-mark"></span><span>{sheet.reader}</span><span
                >{sheet.readerDate}</span
              >
            </div>
            <div class="reader-row">
              <span class="reader-mark"></span><span></span><span></span>
            </div>
            <div class="reader-row">
              <span class="reader-mark"></span><span></span><span></span>
            </div>
          </div>
          <div class="sheet-context">
            {#if parent}
              <div class="context-map" aria-hidden="true">
                {#each parent.blocks.slice(0, 12) as block (block.id)}
                  <span class:filled={block.id === model.parentBlockId}></span>
                {/each}
              </div>
            {/if}
            <span>{$t('КОНТЕКСТ:')}</span><span class="sheet-value"
              >{context === 'ВЕРХ' || context === 'Контекст' ? $t(context) : context}</span
            >
          </div>
        </button>
        <div
          class="diagram-drawing"
          class:no-grid={!grid}
          class:drawing-flow={tool === 'flow'}
          bind:this={drawing}
          role="presentation"
          onkeydown={(event) => {
            if (event.target === drawing && event.key === 'Enter') onproperties();
          }}
          onclick={backgroundClick}
          oncontextmenu={(event) => {
            event.preventDefault();
            chooseTool('select');
            menu = null;
          }}
        >
          <svg
            class="diagram-lines"
            width={bodyWidth}
            height={bodyHeight}
            role="group"
            aria-label={$t('Стрелки диаграммы')}
          >
            <defs
              ><marker
                id="flow-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="currentColor" /></marker
              ></defs
            >
            {#each flows as flow (flow.id)}
              <path
                d={flow.path}
                class:selected-flow={selectedId === flow.id}
                class:related-flow={!!selectedBlockId &&
                  (flow.sourceId === selectedBlockId || flow.targetId === selectedBlockId)}
                marker-end="url(#flow-arrow)"
                aria-hidden="true"
              />
              <path
                d={flow.path}
                class="flow-hit"
                role="button"
                tabindex="0"
                aria-label={$t('Стрелка: {0}', { 0: flow.label || $t('без подписи') })}
                ondblclick={() => onedit(flow.id)}
                onpointerdown={(event) => beginFlowDrag(event, flow)}
                oncontextmenu={(event) => contextMenu(event, 'flow', flow.id)}
                onclick={() => {
                  if (tool === 'select') onselect(flow.id);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onselect(flow.id);
                  }
                }}
              />
            {/each}
            {#if pending}<path d={preview} class="flow-preview" aria-hidden="true" />{/if}
          </svg>
          {#each flows as flow (flow.id)}
            {#if flow.label && !flow.hideLabel}
              <button
                class="flow-label"
                class:selected={selectedId === flow.id}
                style:left={`${flow.x}px`}
                style:top={`${flow.y}px`}
                onpointerdown={(event) => beginFlowLabelDrag(event, flow)}
                onclick={() => onselect(flow.id)}
                ondblclick={() => onedit(flow.id)}
                oncontextmenu={(event) => contextMenu(event, 'flow', flow.id)}
                aria-label={$t('Подпись стрелки: {0}', { 0: flow.label || $t('без подписи') })}
                title={$t('Двойной щелчок — свойства стрелки')}>{flow.label}</button
              >
            {/if}
          {/each}
          {#each blocks as block (block.id)}
            <div
              class="function-node"
              style:left={`${block.x}px`}
              style:top={`${block.y}px`}
              style:width={`${block.width ?? 210}px`}
              style:height={`${block.height ?? 110}px`}
            >
              <button
                class="function-block"
                class:dfd-process={dfd && (block.kind ?? 'process') === 'process'}
                class:dfd-external={dfd && block.kind === 'external'}
                class:dfd-store={dfd && block.kind === 'dataStore'}
                style:--block-fill={block.fillColor ?? 'var(--paper)'}
                style:--block-text={block.textColor ??
                  readableText(block.fillColor ?? model.backgroundColor ?? '#ffffe8')}
                style:--block-font-size={`${blockFontSize(block)}px`}
                style:--block-font-family={blockFontFamily(block)}
                style:--block-font-weight={block.fontStyle?.includes('bold') ? 700 : 400}
                style:--block-font-style={block.fontStyle?.includes('italic') ? 'italic' : 'normal'}
                style:--block-lines={String(blockLineClamp(block))}
                class:selected={selectedId === block.id}
                class:dragging={drag?.id === block.id}
                onpointerdown={(event) => start(event, block)}
                onclick={(event) => {
                  if (event.ctrlKey || event.metaKey) onopen(block);
                  else if (tool === 'flow')
                    void connect({ id: block.id, side: pending ? 'left' : 'right', position: 0.5 });
                  else onselect(block.id);
                }}
                ondblclick={() => {
                  if (tool === 'select') onedit(block.id);
                }}
                aria-label={`${dfd ? (block.kind === 'external' ? $t('Внешняя сущность') : block.kind === 'dataStore' ? $t('Хранилище') : $t('Процесс')) : $t('Блок')} ${blockCode(project, model, block)}: ${block.name}`}
                title={$t('Двойной щелчок — свойства; Ctrl+щелчок — декомпозиция')}
                oncontextmenu={(event) => contextMenu(event, 'block', block.id)}
                disabled={busy}
              >
                <span class="function-name">{block.name}</span><span class="function-number"
                  >{blockCode(project, model, block)}</span
                >
                {#if (block.kind ?? 'process') === 'process' && !childBlockIds.includes(block.id)}
                  <span class="leaf-mark" aria-hidden="true">/</span>
                {/if}
                {#if selectedId === block.id}<span class="selection-dot dot-tl"></span><span
                    class="selection-dot dot-tr"
                  ></span><span class="selection-dot dot-bl"></span><span
                    class="selection-dot dot-br"
                  ></span>{/if}
              </button>
              {#if tool === 'select' && selectedId === block.id}<button
                  class="block-resize"
                  aria-label={$t('Изменить размер: {0}', { 0: block.name })}
                  onpointerdown={(event) => {
                    event.stopPropagation();
                    start(event, block);
                    if (drag) drag.resize = true;
                  }}
                ></button>{/if}
              {#if tool === 'flow'}{#each sides as side}
                  <button
                    class={`block-port port-${side}`}
                    aria-label={`${roleNames[side]}: ${block.name}`}
                    title={dfd
                      ? roleNames[side]
                      : `${roleNames[side]} (${{ left: 'I', top: 'C', right: 'O', bottom: 'M' }[side]})`}
                    disabled={busy}
                    onclick={(event) => blockPort(event, block, side)}
                  ></button>
                {/each}{/if}
            </div>
          {/each}
          {#if tool === 'flow' && !dfd}{#each sides as side}<button
                class={`boundary-edge edge-${side}`}
                aria-label={$t('Сторона листа: {0}', { 0: roleNames[side] })}
                onclick={(event) => boundaryClick(event, side)}
              ></button>{/each}{/if}
          {#each boundaryHandles as port}
            {@const point = endpointPoint(
              { id: null, side: port.side, position: port.position },
              blocks,
              bodyWidth,
              bodyHeight,
            )}
            {#if tool === 'flow'}
              <button
                class={`boundary-port boundary-${port.side}`}
                class:inherited={!!port.flowId}
                style:left={`${point.x}px`}
                style:top={`${point.y}px`}
                aria-label={$t('Граница {0}{1}', {
                  0: port.code,
                  1: port.name ? ': ' + port.name : '',
                })}
                title={port.flowId
                  ? $t('{0}: {1} — интерфейс родительского блока', { 0: port.code, 1: port.name })
                  : $t('Граница: {0}', { 0: roleNames[port.side] })}
                disabled={busy}
                onclick={() => {
                  if (tool === 'select') chooseTool('flow');
                  void connect({
                    id: null,
                    side: port.side,
                    position: port.position,
                    ...(port.flowId ? { parentFlowId: port.flowId } : {}),
                  });
                }}
              >
                <span class="boundary-dot"></span><span class="boundary-name"
                  >{port.code}{port.name ? ' · ' + port.name : ''}</span
                >
              </button>
            {/if}
          {/each}
          {#if !blocks.length}<div class="canvas-empty">
              <Icon name="model" size={36} />
              <h3>{$t('Начните с первого блока')}</h3>
              <p>
                {dfd
                  ? $t('Добавьте процесс и задайте ему название.')
                  : $t('Добавьте функцию и задайте ей название.')}
              </p>
              <button class="button primary" onclick={() => chooseTool('block')} disabled={busy}
                ><Icon name="plus" />{$t('Добавить блок')}</button
              >
            </div>{/if}
        </div>
        <button
          class="paper-footer"
          onclick={onproperties}
          aria-label={$t('Номер, узел и название диаграммы')}
          title={$t('Изменить поля штампа диаграммы')}
        >
          <span>{$t('НОМЕР:')} <span>{sheet.number}</span></span><span
            >{$t('УЗЕЛ:')} <span>{dfd && node === 'Контекст' ? $t('Контекст') : node}</span></span
          ><span>{$t('НАЗВАНИЕ:')} <span>{model.name}</span></span>
        </button>
      </div>
    </div>
  </div>
  <div class="canvas-caption">
    <span
      ><span class="tiny-dot"></span>{(hint && $t(hint)) ||
        (tool === 'flow'
          ? dfd
            ? $t(
                'Выберите сторону источника, затем сторону получателя. Поток должен проходить через процесс. Esc — отмена.',
              )
            : $t(
                'Начало: выход блока или граница I/C/M → конец: вход, управление, механизм или граница O. Esc — отмена.',
              )
          : tool === 'block'
            ? dfd
              ? $t(
                  'Щёлкните на листе для размещения объекта. X — процесс, E — внешняя сущность, D — хранилище.',
                )
              : $t('Щёлкните на листе для создания функции. X — блок, Z — указатель.')
            : dfd
              ? $t(
                  'Z — указатель · X — процесс · E — сущность · D — хранилище · C — поток · Ctrl+щелчок — декомпозиция.',
                )
              : $t(
                  'Z — указатель · X — блок · C — стрелка · N — сетка · Ctrl+щелчок — переход по уровням.',
                ))}</span
    ><span>{$count('block', model.blocks.length)} · {$count('connection', model.flows.length)}</span
    >
  </div>

  {#if menu}<div
      class="diagram-contextmenu"
      role="menu"
      aria-label={$t('Контекстные команды')}
      style:left={`${menu.x}px`}
      style:top={`${menu.y}px`}
      bind:this={menuElement}
    >
      {#if menu.kind === 'diagram'}<button
          role="menuitem"
          onclick={() => {
            menu = null;
            onproperties();
          }}>{$t('Свойства диаграммы')}</button
        >{:else}
        <button
          role="menuitem"
          onclick={() => {
            if (menu) onedit(menu.id);
            menu = null;
          }}>{$t('Свойства…')}</button
        >
        {#if menu.kind === 'block' && (blocks.find((b) => b.id === menu?.id)?.kind ?? 'process') === 'process'}
          <button
            role="menuitem"
            onclick={() => {
              const block = blocks.find((b) => b.id === menu?.id);
              menu = null;
              if (block) onopen(block);
            }}>{$t('К дочерней диаграмме')}</button
          >
          <button
            role="menuitem"
            onclick={() => {
              const block = blocks.find((b) => b.id === menu?.id);
              menu = null;
              if (block) onopen(block, true);
            }}>{$t('Открыть в новой вкладке')}</button
          >
          <button
            role="menuitem"
            onclick={() => {
              if (menu) oncenter(menu.id);
              menu = null;
            }}>{$t('Центровать присоединённые стрелки')}</button
          >
        {/if}
        <button
          role="menuitem"
          disabled={menu.kind === 'block' && childBlockIds.includes(menu.id)}
          onclick={() => {
            if (menu) ondelete(menu.id);
            menu = null;
          }}>{$t('Удалить')}</button
        >
      {/if}
    </div>{/if}
</section>
