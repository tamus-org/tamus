export interface Element {
  id: string;
  name: string;
  description: string;
}
export interface Qualifier extends Element {
  elements: Element[];
}
export interface Block extends Element {
  x: number;
  y: number;
  width?: number;
  height?: number;
  kind?: 'process' | 'external' | 'dataStore';
  fillColor?: string;
  textColor?: string;
}
export type PortSide = 'left' | 'top' | 'right' | 'bottom';
export interface Flow {
  id: string;
  name: string;
  sourceId: string | null;
  targetId: string | null;
  sourceSide?: PortSide;
  targetSide?: PortSide;
  sourcePosition?: number;
  targetPosition?: number;
  parentFlowId?: string;
  caption?: string;
  objectIds?: string[];
}
export interface DiagramSheet {
  author: string;
  createdAt: string;
  revisedAt: string;
  usedAt: string;
  notes: string;
  reader: string;
  readerDate: string;
  number: string;
  node: string;
  context: string;
}
export const sheetFields = [
  ['author', 'Автор'],
  ['createdAt', 'Дата создания'],
  ['revisedAt', 'Дата ревизии'],
  ['usedAt', 'Используется в'],
  ['notes', 'Замечания'],
  ['reader', 'Читатель'],
  ['readerDate', 'Дата чтения'],
  ['number', 'Номер'],
  ['node', 'Узел'],
  ['context', 'Контекст'],
] as const;
export const diagramSheet = (model?: Model): DiagramSheet => ({
  author: '',
  createdAt: '',
  revisedAt: '',
  usedAt: '',
  notes: '',
  reader: '',
  readerDate: '',
  number: '',
  node: 'A0',
  context: 'ВЕРХ',
  ...model?.sheet,
});
export interface Model extends Element {
  notation: 'IDEF0' | 'DFD';
  backgroundColor?: string;
  blocks: Block[];
  flows: Flow[];
  sheet?: DiagramSheet;
  parentBlockId?: string;
}
export interface Project extends Element {
  format: 'tamus-project';
  schemaVersion: 1;
  models: Model[];
  qualifiers: Qualifier[];
}
export interface Snapshot {
  project: Project;
  revision: string;
  path: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}
export type Command =
  | { kind: 'updateProject'; name: string; description: string }
  | { kind: 'addQualifier'; qualifier: Qualifier }
  | { kind: 'updateQualifier'; id: string; name: string; description: string }
  | { kind: 'deleteQualifier'; id: string }
  | { kind: 'addElement'; qualifierId: string; element: Element }
  | { kind: 'updateElement'; qualifierId: string; element: Element }
  | { kind: 'deleteElement'; qualifierId: string; id: string }
  | { kind: 'addModel'; model: Model }
  | {
      kind: 'decomposeBlock';
      modelId: string;
      blockId: string;
      childId: string;
      count?: number;
      layout?: DecompositionLayout;
      blockNamePrefix?: string;
    }
  | {
      kind: 'updateModel';
      id: string;
      name: string;
      description: string;
      sheet?: DiagramSheet;
      backgroundColor?: string;
    }
  | { kind: 'deleteModel'; id: string }
  | { kind: 'centerArrows'; modelId: string; blockId?: string }
  | { kind: 'addBlock'; modelId: string; block: Block }
  | { kind: 'updateBlock'; modelId: string; block: Block }
  | { kind: 'deleteBlock'; modelId: string; id: string }
  | { kind: 'addFlow'; modelId: string; flow: Flow }
  | { kind: 'updateFlow'; modelId: string; flow: Flow }
  | { kind: 'deleteFlow'; modelId: string; id: string };

export type DecompositionLayout = 'diagonal' | 'horizontal' | 'vertical';
export function decompositionPosition(index: number, count: number, layout: DecompositionLayout) {
  if (layout === 'horizontal')
    return { x: 100 + (index % 6) * 290, y: 100 + Math.floor(index / 6) * 200 };
  if (layout === 'vertical')
    return { x: 100 + Math.floor(index / 10) * 300, y: 80 + (index % 10) * 180 };
  const cols = count <= 6 ? count : Math.ceil(Math.sqrt(count));
  return {
    x: 100 + (index % cols) * 290,
    y: 80 + (index % cols) * 130 + Math.floor(index / cols) * 360,
  };
}
export function referencedObject(project: Project, id: string) {
  for (const qualifier of project.qualifiers) {
    if (qualifier.id === id) return qualifier;
    const element = qualifier.elements.find((e) => e.id === id);
    if (element) return element;
  }
  return undefined;
}
export function flowLabel(project: Project, flow: Flow): string {
  return (
    flow.caption?.trim() ||
    flow.name.trim() ||
    (flow.objectIds ?? [])
      .map((id) => referencedObject(project, id)?.name ?? '')
      .filter(Boolean)
      .join('; ')
  );
}
export const newId = () => crypto.randomUUID();
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function createProject(name = 'Новый проект'): Project {
  return {
    format: 'tamus-project',
    schemaVersion: 1,
    id: newId(),
    name,
    description: '',
    models: [],
    qualifiers: [],
  };
}

export function createExample(): Project {
  return {
    format: 'tamus-project',
    schemaVersion: 1,
    id: 'example-project',
    name: 'Деятельность предприятия',
    description: 'Учебный проект. Измените модель, добавьте справочники и сохраните свою копию.',
    models: [
      {
        id: 'orders',
        name: 'Обработка заказов',
        description: 'От поступления заявки до подтверждения заказа.',
        notation: 'IDEF0',
        blocks: [
          {
            id: 'receive',
            name: 'Принять заказ',
            description: 'Зарегистрировать заявку клиента.',
            x: 100,
            y: 145,
          },
          {
            id: 'verify',
            name: 'Проверить данные',
            description: 'Проверить состав и условия заказа.',
            x: 390,
            y: 280,
          },
          {
            id: 'approve',
            name: 'Подтвердить заказ',
            description: 'Согласовать заказ с клиентом.',
            x: 680,
            y: 415,
          },
        ],
        flows: [
          { id: 'request-flow', name: 'Заявка', sourceId: 'receive', targetId: 'verify' },
          {
            id: 'verified-flow',
            name: 'Проверенные данные',
            sourceId: 'verify',
            targetId: 'approve',
          },
        ],
      },
    ],
    qualifiers: [
      {
        id: 'documents',
        name: 'Документы',
        description: 'Документы, участвующие в процессах.',
        elements: [
          { id: 'request', name: 'Заявка клиента', description: 'Первичное обращение клиента.' },
          { id: 'order', name: 'Заказ', description: 'Согласованный состав заказа.' },
          {
            id: 'confirmation',
            name: 'Подтверждение заказа',
            description: 'Результат проверки и согласования.',
          },
        ],
      },
      {
        id: 'people',
        name: 'Персонал',
        description: 'Участники процессов.',
        elements: [
          { id: 'manager', name: 'Менеджер', description: 'Принимает и сопровождает заказ.' },
          { id: 'specialist', name: 'Специалист', description: 'Проверяет состав заказа.' },
        ],
      },
    ],
  };
}

export const parentDiagram = (project: Project, model: Model) =>
  project.models.find((m) => m.blocks.some((b) => b.id === model.parentBlockId));
export const childDiagram = (project: Project, blockId: string) =>
  project.models.find((m) => m.parentBlockId === blockId);
export function blockCode(project: Project, model: Model, block: Block): string {
  const kind = block.kind ?? 'process';
  const index =
    model.blocks.filter((b) => (b.kind ?? 'process') === kind).findIndex((b) => b.id === block.id) +
    1;
  if (kind === 'external') return `E${index}`;
  if (kind === 'dataStore') return `D${index}`;
  const node = diagramNode(project, model);
  if (model.notation === 'DFD')
    return !model.parentBlockId && node === 'Контекст'
      ? '0'
      : node === '0'
        ? `${index}`
        : `${node}.${index}`;
  return node === 'A-0' ? 'A0' : `${node === 'A0' ? 'A' : node}${index}`;
}
export function diagramNode(project: Project, model: Model): string {
  const parent = parentDiagram(project, model);
  if (!parent) return diagramSheet(model).node || 'A0';
  const owner = parent.blocks.find((b) => b.id === model.parentBlockId)!;
  return blockCode(project, parent, owner);
}
export function diagramAncestors(project: Project, model: Model): Model[] {
  const parent = parentDiagram(project, model);
  return parent ? [...diagramAncestors(project, parent), parent] : [];
}
export function modelTree(project: Project): { model: Model; depth: number }[] {
  const visit = (model: Model, depth: number): { model: Model; depth: number }[] => [
    { model, depth },
    ...model.blocks.flatMap((b) => {
      const child = childDiagram(project, b.id);
      return child ? visit(child, depth + 1) : [];
    }),
  ];
  return project.models.filter((m) => !m.parentBlockId).flatMap((m) => visit(m, 0));
}
export function functionTree(project: Project) {
  type Row = {
    id: string;
    modelId: string;
    blockId?: string;
    childId?: string;
    name: string;
    node: string;
    depth: number;
  };
  const rows: Row[] = [];
  const visit = (model: Model, depth: number) => {
    for (const [index, block] of model.blocks.entries()) {
      const child = childDiagram(project, block.id),
        parentNode = diagramNode(project, model);
      const node = blockCode(project, model, block);
      rows.push({
        id: block.id,
        modelId: model.id,
        blockId: block.id,
        childId: child?.id,
        name: block.name,
        node,
        depth,
      });
      if (child) visit(child, depth + 1);
    }
  };
  for (const model of project.models.filter((m) => !m.parentBlockId)) {
    rows.push({
      id: model.id,
      modelId: model.id,
      name: model.name,
      node: diagramNode(project, model),
      depth: 0,
    });
    visit(model, 1);
  }
  return rows;
}
export interface BoundaryPort {
  flowId: string;
  name: string;
  side: PortSide;
  position: number;
  code: string;
}
export function boundaryPorts(project: Project, model: Model): BoundaryPort[] {
  const parent = parentDiagram(project, model);
  if (!parent) return [];
  const ports = parent.flows.flatMap((f) => {
    if (f.sourceId === model.parentBlockId)
      return [{ flowId: f.id, name: flowLabel(project, f), side: 'right' as PortSide }];
    if (f.targetId === model.parentBlockId)
      return [
        {
          flowId: f.id,
          name: flowLabel(project, f),
          side: model.notation === 'DFD' ? 'left' : (f.targetSide ?? 'left'),
        },
      ];
    return [];
  });
  return ports.map((p) => {
    const same = ports.filter((other) => other.side === p.side);
    const index = same.indexOf(p);
    return {
      ...p,
      position: (index + 1) / (same.length + 1),
      code: `${{ left: 'I', top: 'C', right: 'O', bottom: 'M' }[p.side]}${index + 1}`,
    };
  });
}
function checkFlowInterface(project: Project, model: Model, flow: Flow) {
  if (!flow.parentFlowId) return;
  const port = boundaryPorts(project, model).find((p) => p.flowId === flow.parentFlowId);
  if (
    !port ||
    (flow.sourceId === null
      ? port.side === 'right' || flow.targetId === null || (flow.sourceSide ?? 'left') !== port.side
      : flow.targetId !== null ||
        port.side !== 'right' ||
        (flow.targetSide ?? 'right') !== port.side)
  )
    throw new Error('Граничная стрелка не соответствует интерфейсу родительского блока.');
}
// Keep inherited boundary arrows consistent through every level in one undo transaction.
function syncInterfaces(project: Project) {
  for (let pass = 0; pass < project.models.length; pass++) {
    for (const m of project.models) {
      const ports = boundaryPorts(project, m);
      m.flows = m.flows.flatMap((f) => {
        if (!f.parentFlowId) return [f];
        const port = ports.find((p) => p.flowId === f.parentFlowId);
        if (!port || (f.sourceId === null ? port.side === 'right' : port.side !== 'right'))
          return [];
        const parent = parentDiagram(project, m)!;
        const original = parent.flows.find((p) => p.id === port.flowId)!;
        const copy = { ...f };
        if (original.objectIds !== undefined) copy.objectIds = [...original.objectIds];
        else delete copy.objectIds;
        return [
          {
            ...copy,
            name: original.name,
            ...(f.sourceId === null
              ? { sourceSide: port.side, sourcePosition: port.position }
              : { targetSide: port.side, targetPosition: port.position }),
          },
        ];
      });
    }
  }
}

const requireItem = <T>(value: T | undefined): T => {
  if (!value) throw new Error('Объект больше не существует.');
  return value;
};

// Only the standalone browser preview uses this reducer. Desktop writes go through Rust.
export function reduceProject(current: Project, command: Command): Project {
  const project = clone(current);
  const qualifier = () =>
    requireItem(
      project.qualifiers.find((q) => 'qualifierId' in command && q.id === command.qualifierId),
    );
  const model = () =>
    requireItem(project.models.find((m) => 'modelId' in command && m.id === command.modelId));
  switch (command.kind) {
    case 'updateProject':
      Object.assign(project, { name: command.name, description: command.description });
      break;
    case 'addQualifier':
      project.qualifiers.push(command.qualifier);
      break;
    case 'updateQualifier':
      Object.assign(requireItem(project.qualifiers.find((q) => q.id === command.id)), {
        name: command.name,
        description: command.description,
      });
      break;
    case 'deleteQualifier':
      requireItem(project.qualifiers.find((q) => q.id === command.id));
      project.qualifiers = project.qualifiers.filter((q) => q.id !== command.id);
      break;
    case 'addElement':
      qualifier().elements.push(command.element);
      break;
    case 'updateElement':
      Object.assign(
        requireItem(qualifier().elements.find((e) => e.id === command.element.id)),
        command.element,
      );
      break;
    case 'deleteElement':
      requireItem(qualifier().elements.find((e) => e.id === command.id));
      qualifier().elements = qualifier().elements.filter((e) => e.id !== command.id);
      break;
    case 'addModel':
      project.models.push(command.model);
      break;
    case 'decomposeBlock': {
      const parent = model();
      const owner = requireItem(parent.blocks.find((b) => b.id === command.blockId));
      if ((owner.kind ?? 'process') !== 'process')
        throw new Error('Декомпозиция доступна только для процесса.');
      if (childDiagram(project, owner.id)) throw new Error('Декомпозиция уже существует.');
      const count = command.count ?? 3,
        layout = command.layout ?? 'diagonal';
      if (
        !Number.isInteger(count) ||
        count < 2 ||
        count > 20 ||
        !['diagonal', 'horizontal', 'vertical'].includes(layout)
      )
        throw new Error('Выберите от 2 до 20 функций и поддерживаемый шаблон.');
      const prefix = command.blockNamePrefix ?? 'Функция';
      if (typeof prefix !== 'string' || !prefix.trim() || [...prefix].length > 240)
        throw new Error('Укажите имя до 256 символов и описание до 10 000 символов.');
      const child: Model = {
        id: command.childId,
        name: owner.name,
        description: owner.description,
        notation: parent.notation,
        ...(parent.backgroundColor ? { backgroundColor: parent.backgroundColor } : {}),
        parentBlockId: owner.id,
        flows: [],
        blocks: Array.from({ length: count }, (_, i) => ({
          id: `${command.childId}-${i + 1}`,
          name: `${prefix} ${i + 1}`,
          description: '',
          ...decompositionPosition(i, count, layout),
        })),
        sheet: { ...diagramSheet(parent), number: '', node: '', context: '' },
      };
      project.models.push(child);
      child.sheet!.node = diagramNode(project, child);
      child.sheet!.context = diagramNode(project, parent);
      break;
    }
    case 'updateModel':
      Object.assign(requireItem(project.models.find((m) => m.id === command.id)), {
        name: command.name,
        description: command.description,
        ...(command.sheet === undefined ? {} : { sheet: command.sheet }),
        ...(command.backgroundColor === undefined
          ? {}
          : { backgroundColor: command.backgroundColor }),
      });
      {
        const current = requireItem(project.models.find((m) => m.id === command.id));
        const parent = parentDiagram(project, current);
        const owner = parent?.blocks.find((b) => b.id === current.parentBlockId);
        if (owner) owner.name = command.name;
      }
      break;
    case 'deleteModel':
      if (project.models.some((m) => parentDiagram(project, m)?.id === command.id))
        throw new Error('Сначала удалите дочерние диаграммы.');
      requireItem(project.models.find((m) => m.id === command.id));
      project.models = project.models.filter((m) => m.id !== command.id);
      break;
    case 'centerArrows':
      if (command.blockId !== undefined)
        requireItem(model().blocks.find((b) => b.id === command.blockId));
      for (const flow of model().flows) {
        if (flow.sourceId !== null && (!command.blockId || flow.sourceId === command.blockId))
          flow.sourcePosition = 0.5;
        if (flow.targetId !== null && (!command.blockId || flow.targetId === command.blockId))
          flow.targetPosition = 0.5;
      }
      break;
    case 'addBlock':
      model().blocks.push(command.block);
      break;
    case 'updateBlock': {
      const m = model(),
        index = m.blocks.findIndex((b) => b.id === command.block.id);
      requireItem(m.blocks[index]);
      m.blocks[index] = command.block;
      break;
    }
    case 'deleteBlock': {
      if (childDiagram(project, command.id)) throw new Error('Сначала удалите декомпозицию блока.');
      const m = model();
      requireItem(m.blocks.find((b) => b.id === command.id));
      m.blocks = m.blocks.filter((b) => b.id !== command.id);
      m.flows = m.flows.filter((f) => f.sourceId !== command.id && f.targetId !== command.id);
      break;
    }
    case 'addFlow':
      checkFlowInterface(project, model(), command.flow);
      model().flows.push(command.flow);
      break;
    case 'updateFlow':
      checkFlowInterface(project, model(), command.flow);
      Object.assign(requireItem(model().flows.find((f) => f.id === command.flow.id)), command.flow);
      break;
    case 'deleteFlow':
      requireItem(model().flows.find((f) => f.id === command.id));
      model().flows = model().flows.filter((f) => f.id !== command.id);
      break;
  }
  for (const m of project.models) {
    const parent = parentDiagram(project, m);
    const owner = parent?.blocks.find((b) => b.id === m.parentBlockId);
    if (owner) m.name = owner.name;
  }
  syncInterfaces(project);
  validateProject(project);
  return project;
}

export function validateProject(value: unknown): asserts value is Project {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const knownFields = (v: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(v).some((key) => !allowed.includes(key)))
      throw new Error('Проект содержит неподдерживаемые поля. Данные не были изменены.');
  };
  const checkColor = (color: unknown) => {
    if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)))
      throw new Error('Цвет должен иметь формат #RRGGBB.');
  };
  const entityFields = ['id', 'name', 'description'];
  const ids = new Set<string>();
  const entity = (v: unknown) => {
    if (
      !object(v) ||
      typeof v.id !== 'string' ||
      !v.id ||
      new TextEncoder().encode(v.id).length > 128 ||
      ids.has(v.id) ||
      typeof v.name !== 'string' ||
      !v.name.trim() ||
      [...v.name].length > 256 ||
      typeof v.description !== 'string' ||
      [...v.description].length > 10000
    )
      throw new Error('Некорректные данные объекта: проверьте имя, описание и уникальность ID.');
    ids.add(v.id);
  };
  if (
    !object(value) ||
    value.format !== 'tamus-project' ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.models) ||
    !Array.isArray(value.qualifiers)
  )
    throw new Error('Это не поддерживаемый проект Tamus (.tamus.json).');
  knownFields(value, [...entityFields, 'format', 'schemaVersion', 'models', 'qualifiers']);
  entity(value);
  for (const q of value.qualifiers) {
    entity(q);
    knownFields(q, [...entityFields, 'elements']);
    if (!Array.isArray(q.elements)) throw new Error('Некорректный классификатор.');
    for (const e of q.elements) {
      entity(e);
      knownFields(e, entityFields);
    }
  }
  for (const m of value.models) {
    entity(m);
    knownFields(m, [
      ...entityFields,
      'notation',
      'blocks',
      'flows',
      'sheet',
      'parentBlockId',
      'backgroundColor',
    ]);
    if (m.sheet !== undefined) {
      if (!object(m.sheet)) throw new Error('Некорректные поля штампа диаграммы.');
      knownFields(
        m.sheet,
        sheetFields.map(([key]) => key),
      );
      for (const [key] of sheetFields) {
        if (typeof m.sheet[key] !== 'string' || [...m.sheet[key]].length > 256)
          throw new Error('Поля штампа должны содержать не более 256 символов.');
      }
    }
    if (
      !['IDEF0', 'DFD'].includes(m.notation) ||
      !Array.isArray(m.blocks) ||
      !Array.isArray(m.flows)
    )
      throw new Error('Неподдерживаемая модель.');
    if (!m.parentBlockId && object(m.sheet) && m.sheet.node === 'A-0' && m.blocks.length > 1)
      throw new Error('Контекстная диаграмма A-0 содержит один блок. Откройте его декомпозицию.');
    if (
      m.notation === 'DFD' &&
      !m.parentBlockId &&
      object(m.sheet) &&
      m.sheet.node === 'Контекст' &&
      m.blocks.filter((b: Block) => (b.kind ?? 'process') === 'process').length > 1
    )
      throw new Error('В контексте DFD один процесс. Откройте его декомпозицию.');
    checkColor(m.backgroundColor);
    for (const b of m.blocks) {
      entity(b);
      knownFields(b, [
        ...entityFields,
        'x',
        'y',
        'width',
        'height',
        'kind',
        'fillColor',
        'textColor',
      ]);
      if (b.kind !== undefined && !['process', 'external', 'dataStore'].includes(b.kind))
        throw new Error('Неизвестный вид объекта диаграммы.');
      if (m.notation === 'IDEF0' && (b.kind ?? 'process') !== 'process')
        throw new Error('Внешние сущности и хранилища доступны в DFD.');
      checkColor(b.fillColor);
      checkColor(b.textColor);
      if (
        (b.width !== undefined &&
          (typeof b.width !== 'number' ||
            !Number.isFinite(b.width) ||
            b.width < 80 ||
            b.width > 800)) ||
        (b.height !== undefined &&
          (typeof b.height !== 'number' ||
            !Number.isFinite(b.height) ||
            b.height < 50 ||
            b.height > 600))
      )
        throw new Error('Размер блока: ширина 80–800, высота 50–600.');
      if (
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y) ||
        b.x < 0 ||
        b.y < 0 ||
        b.x > 2000 ||
        b.y > 2000
      )
        throw new Error('Блок находится за пределами рабочей области.');
    }
    for (const f of m.flows) {
      if (
        !object(f) ||
        typeof f.id !== 'string' ||
        !f.id ||
        new TextEncoder().encode(f.id).length > 128 ||
        ids.has(f.id) ||
        typeof f.name !== 'string' ||
        [...f.name].length > 256 ||
        f.sourceId === f.targetId ||
        (f.sourceId !== null && !m.blocks.some((b: Block) => b.id === f.sourceId)) ||
        (f.targetId !== null && !m.blocks.some((b: Block) => b.id === f.targetId))
      )
        throw new Error('Стрелка должна соединять блоки одной диаграммы или блок с границей.');
      knownFields(f, [
        'id',
        'name',
        'sourceId',
        'targetId',
        'sourceSide',
        'targetSide',
        'sourcePosition',
        'targetPosition',
        'parentFlowId',
        'caption',
        'objectIds',
      ]);
      if (
        f.caption !== undefined &&
        (typeof f.caption !== 'string' || [...f.caption].length > 10000)
      )
        throw new Error('Некорректная подпись сегмента.');
      if (
        f.objectIds !== undefined &&
        (!Array.isArray(f.objectIds) ||
          new Set(f.objectIds).size !== f.objectIds.length ||
          f.objectIds.some(
            (id: unknown) =>
              typeof id !== 'string' || !referencedObject(value as unknown as Project, id),
          ))
      )
        throw new Error(
          'Поток ссылается на отсутствующий объект классификатора. Удалите присоединение перед удалением объекта.',
        );
      const sourceSide = f.sourceSide ?? (f.sourceId === null ? 'left' : 'right');
      const targetSide = f.targetSide ?? (f.targetId === null ? 'right' : 'left');
      const sides = ['left', 'top', 'right', 'bottom'];
      if (
        typeof sourceSide !== 'string' ||
        typeof targetSide !== 'string' ||
        !sides.includes(sourceSide) ||
        !sides.includes(targetSide)
      )
        throw new Error('Некорректная сторона стрелки.');
      if (m.notation === 'IDEF0') {
        if (
          (f.sourceId === null
            ? !['left', 'top', 'bottom'].includes(sourceSide)
            : sourceSide !== 'right') ||
          (f.targetId === null
            ? targetSide !== 'right'
            : !['left', 'top', 'bottom'].includes(targetSide))
        )
          throw new Error('Выход блока справа; вход слева, управление сверху, механизм снизу.');
      } else {
        if ((f.sourceId === null || f.targetId === null) && (!m.parentBlockId || !f.parentFlowId))
          throw new Error('В DFD используйте внешнюю сущность вместо свободной границы.');
        const source = m.blocks.find((b: Block) => b.id === f.sourceId),
          target = m.blocks.find((b: Block) => b.id === f.targetId);
        if (
          source &&
          target &&
          (source.kind ?? 'process') !== 'process' &&
          (target.kind ?? 'process') !== 'process'
        )
          throw new Error('Поток DFD должен проходить через процесс.');
      }
      for (const position of [f.sourcePosition, f.targetPosition])
        if (
          position !== undefined &&
          (typeof position !== 'number' ||
            !Number.isFinite(position) ||
            position < 0.05 ||
            position > 0.95)
        )
          throw new Error('Некорректное положение присоединения стрелки.');
      if (f.parentFlowId !== undefined && (typeof f.parentFlowId !== 'string' || !f.parentFlowId))
        throw new Error('Некорректная связь с родительской стрелкой.');
      ids.add(f.id);
    }
  }
  validateHierarchy(value as unknown as Project);
}

function validateHierarchy(project: Project) {
  const owners = new Set<string>();
  for (const model of project.models) {
    if (model.parentBlockId !== undefined) {
      if (
        typeof model.parentBlockId !== 'string' ||
        !parentDiagram(project, model) ||
        owners.has(model.parentBlockId)
      )
        throw new Error('У декомпозиции должен быть один существующий блок-владелец.');
      const parent = parentDiagram(project, model)!;
      if (
        parent.notation !== model.notation ||
        (parent.blocks.find((b) => b.id === model.parentBlockId)?.kind ?? 'process') !== 'process'
      )
        throw new Error('Декомпозиция должна принадлежать процессу той же нотации.');
      owners.add(model.parentBlockId);
    }
    const visited = new Set<string>();
    let current: Model | undefined = model;
    while (current) {
      if (visited.has(current.id)) throw new Error('Цикл в дереве декомпозиции.');
      visited.add(current.id);
      current = parentDiagram(project, current);
    }
    const ports = boundaryPorts(project, model);
    for (const f of model.flows)
      if (f.parentFlowId) {
        const port = ports.find((p) => p.flowId === f.parentFlowId);
        if (
          !port ||
          (f.sourceId === null
            ? (f.sourceSide ?? 'left') !== port.side
            : f.targetId !== null || (f.targetSide ?? 'right') !== port.side)
        )
          throw new Error('Граничная стрелка не соответствует интерфейсу родительского блока.');
      }
  }
}
