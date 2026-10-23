<script lang="ts">
  import {
    t,
    locale,
    setLocale,
    initializeLocale,
    count,
    type Locale,
    type Parameters,
  } from '$lib/i18n';
  import { onMount } from 'svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Welcome from '$lib/components/Welcome.svelte';
  import WindowControls from '$lib/components/WindowControls.svelte';
  import ObjectProperties from '$lib/components/ObjectProperties.svelte';
  import Diagram from '$lib/features/Diagram.svelte';
  import {
    createProjectWithDiagram,
    newId,
    validateProject,
    diagramSheet,
    type Model,
    parentDiagram,
    childDiagram,
    diagramNode,
    diagramAncestors,
    boundaryPorts,
    modelTree,
    functionTree,
    decompositionPosition,
    flowLabel,
    type DecompositionLayout,
    type Block,
    type Flow,
    type PortSide,
    sheetFields,
    type Command,
    type Snapshot,
    type Element,
  } from '$lib/domain/project';
  import * as client from '$lib/services/project-client';
  import {
    loadRecentProject,
    readRecentProjects,
    rememberProject,
    removeRecentProject,
    type RecentProject,
  } from '$lib/services/recent-projects';
  import { applyTheme, readStoredTheme, saveTheme, type Theme } from '$lib/ui/theme';
  import '../app.css';

  type Tab = { id: string; kind: 'model' | 'qualifier' };
  type ModalKind =
    | 'newProject'
    | 'newModel'
    | 'newQualifier'
    | 'newFlow'
    | 'unsaved'
    | 'delete'
    | 'help'
    | 'decompose'
    | 'settings'
    | 'objectProperties'
    | 'ramus'
    | null;
  let screen = $state<'welcome' | 'editor'>('welcome');
  let recents = $state<RecentProject[]>([]);
  let snapshot = $state<Snapshot | null>(null);
  let tabs = $state<Tab[]>([]);
  let activeId = $state<string | null>(null);
  let workspace = $state<'model' | 'qualifier'>('model');
  let selectedId = $state<string | null>(null);
  let busy = $state(false);
  let error = $state('');
  let status = $state('Подготовка рабочего пространства…');
  let statusParams = $state<Parameters>({});
  let filter = $state('');
  let sortByName = $state(false);
  let inspector = $state(true);
  let modelsExpanded = $state(true);
  let qualifiersExpanded = $state(true);
  let modal = $state<ModalKind>(null);
  const initialTheme = readStoredTheme();
  applyTheme(initialTheme);
  let theme = $state<Theme>(initialTheme);
  let advancedMode = $state(false);
  let modelNotation = $state<'IDEF0' | 'DFD'>('IDEF0');
  let draftBackground = $state('#ffffe8');
  function setAppTheme(value: Theme) {
    theme = value;
    applyTheme(value);
    saveTheme(value);
  }
  function setAdvancedMode(value: boolean) {
    advancedMode = value;
    try {
      localStorage.setItem('tamus:ui:settings:v1', JSON.stringify({ advanced: value }));
    } catch {}
    if (!value) {
      tabs = tabs.filter((tab) => tab.kind === 'model');
      workspace = 'model';
      filter = '';
      if (!tabs.some((tab) => tab.id === activeId)) {
        activeId = tabs[0]?.id ?? null;
        selectedId = null;
        const root = project?.models.find((m) => !m.parentBlockId);
        if (!activeId && root) openTab(root.id, 'model');
      }
    }
  }
  let modalName = $state('');
  let modalDescription = $state('');
  let decompositionOwner = $state<string | null>(null);
  let decompositionCount = $state<number | undefined>(4);
  let decompositionLayout = $state<DecompositionLayout>('diagonal');
  let separateDecomposition = $state(false);
  const templateBlocks = $derived(
    Array.from({ length: Math.max(2, Math.min(20, decompositionCount ?? 4)) }, (_, i) =>
      decompositionPosition(i, decompositionCount ?? 4, decompositionLayout),
    ),
  );
  let flowSource = $state('');
  let flowTarget = $state('');
  let pending = $state<(() => Promise<void>) | null>(null);
  let pendingDelete = $state<Command | null>(null);
  let deleteTitle = $state('');
  let draftName = $state('');
  let draftDescription = $state('');
  let draftTargetSide = $state<PortSide>('left');
  let draftSheet = $state(diagramSheet());
  let fileInput: HTMLInputElement;
  let searchInput: HTMLInputElement;
  let nameInput = $state<HTMLInputElement>();

  const project = $derived(snapshot?.project);
  const activeTab = $derived(tabs.find((t) => t.id === activeId));
  const model = $derived(
    activeTab?.kind === 'model' ? project?.models.find((m) => m.id === activeId) : undefined,
  );
  const qualifier = $derived(
    activeTab?.kind === 'qualifier'
      ? project?.qualifiers.find((q) => q.id === activeId)
      : undefined,
  );
  const objectForDialog = $derived(
    model?.blocks.find((b) => b.id === selectedId) ??
      model?.flows.find((f) => f.id === selectedId) ??
      null,
  );
  const block = $derived(model?.blocks.find((b) => b.id === selectedId));
  const flow = $derived(model?.flows.find((f) => f.id === selectedId));
  const sheetChanged = $derived(
    !!model &&
      !block &&
      !flow &&
      (JSON.stringify(draftSheet) !== JSON.stringify(diagramSheet(model)) ||
        draftBackground !== (model?.backgroundColor ?? '#ffffe8')),
  );
  const element = $derived(qualifier?.elements.find((e) => e.id === selectedId));
  const entity = $derived(block ?? flow ?? element ?? model ?? qualifier ?? project);
  const entityType = $derived(
    block
      ? $t('Функциональный блок')
      : flow
        ? $t('Связь')
        : element
          ? $t('Элемент классификатора')
          : model
            ? $t('Модель')
            : qualifier
              ? $t('Классификатор')
              : $t('Проект'),
  );
  const modelCount = $derived(project?.models.filter((m) => !m.parentBlockId).length ?? 0);
  const totalElements = $derived(
    project?.qualifiers.reduce((sum, q) => sum + q.elements.length, 0) ?? 0,
  );
  const visibleModels = $derived(
    project
      ? functionTree(project).filter((row) =>
          row.name.toLocaleLowerCase($locale).includes(filter.toLocaleLowerCase($locale)),
        )
      : [],
  );
  const ancestors = $derived(project && model ? diagramAncestors(project, model) : []);
  const parent = $derived(project && model ? parentDiagram(project, model) : undefined);
  const visibleQualifiers = $derived(
    project?.qualifiers.filter((q) =>
      q.name.toLocaleLowerCase($locale).includes(filter.toLocaleLowerCase($locale)),
    ) ?? [],
  );
  const visibleElements = $derived.by(() => {
    let rows =
      qualifier?.elements.filter((e) =>
        `${e.name} ${e.description}`
          .toLocaleLowerCase($locale)
          .includes(filter.toLocaleLowerCase($locale)),
      ) ?? [];
    if (sortByName) rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, $locale));
    return rows;
  });
  const activeTitle = $derived(model?.name ?? qualifier?.name ?? $t('Рабочее пространство'));

  $effect(() => {
    draftName = entity?.name ?? '';
    draftDescription = entity && 'description' in entity ? entity.description : '';
    draftTargetSide = flow?.targetSide ?? (flow?.targetId === null ? 'right' : 'left');
    draftSheet = diagramSheet(model);
    draftBackground = model?.backgroundColor ?? '#ffffe8';
  });
  $effect(() => {
    if (!client.desktop || !project) return;
    const title =
      screen === 'welcome' ? 'Tamus' : `${snapshot?.dirty ? '• ' : ''}${project.name} — Tamus`;
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => {});
  });

  function resetViews() {
    tabs = [];
    activeId = null;
    selectedId = null;
    filter = '';
    const firstModel = snapshot?.project.models[0];
    const firstQualifier = snapshot?.project.qualifiers[0];
    if (firstModel) openTab(firstModel.id, 'model');
    else if (firstQualifier) openTab(firstQualifier.id, 'qualifier');
  }
  function syncViews() {
    if (!project) return;
    tabs = tabs.filter((t) =>
      t.kind === 'model'
        ? project.models.some((m) => m.id === t.id)
        : project.qualifiers.some((q) => q.id === t.id),
    );
    if (!tabs.some((t) => t.id === activeId)) {
      activeId = tabs.at(-1)?.id ?? null;
      if (!activeId && project.models.length)
        openTab(project.models.find((m) => !m.parentBlockId)?.id ?? project.models[0].id, 'model');
    }
  }
  function enterEditor() {
    screen = 'editor';
    resetViews();
    error = '';
    status = 'Готов к работе';
    statusParams = {};
  }
  function rememberCurrent() {
    if (snapshot) recents = rememberProject(snapshot);
  }
  async function requestHome() {
    await guard(async () => {
      screen = 'welcome';
      tabs = [];
      activeId = null;
      selectedId = null;
      error = '';
      recents = readRecentProjects();
    });
  }
  async function openRecent(entry: RecentProject) {
    if (!snapshot) return;
    await guard(async () => {
      const opened = await run(async () => {
        if (client.desktop && entry.path) return client.openPath(entry.path, snapshot!.revision);
        const cached = loadRecentProject(entry);
        if (!cached) throw new Error('Недавний проект недоступен. Откройте файл заново.');
        return client.replace(cached, snapshot!.revision);
      }, 'Проект открыт');
      if (opened) {
        enterEditor();
        rememberCurrent();
      }
    });
  }
  function removeRecent(entry: RecentProject) {
    recents = removeRecentProject(entry.id);
  }
  function requestRamus() {
    closeMenus();
    error = '';
    modal = 'ramus';
  }
  async function run(
    action: () => Promise<Snapshot | null>,
    message: string,
    params: Parameters = {},
  ): Promise<boolean> {
    if (busy) return false;
    busy = true;
    error = '';
    try {
      const result = await action();
      if (!result) return false;
      snapshot = result;
      syncViews();
      status = message;
      statusParams = params;
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      return false;
    } finally {
      busy = false;
    }
  }
  async function apply(command: Command, message = 'Изменения внесены') {
    if (!snapshot) return false;
    return run(() => client.execute(command, snapshot!.revision), message);
  }
  function closeMenus() {
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
  }
  function openTab(id: string, kind: Tab['kind']) {
    closeMenus();
    if (kind === 'qualifier' && !advancedMode) return;
    workspace = kind;
    filter = '';
    selectedId = null;
    if (!tabs.some((t) => t.id === id)) tabs = [...tabs, { id, kind }];
    activeId = id;
  }
  function closeTab(id: string) {
    tabs = tabs.filter((t) => t.id !== id);
    if (activeId === id) {
      activeId = tabs.at(-1)?.id ?? null;
      selectedId = null;
      const tab = tabs.find((t) => t.id === activeId);
      if (tab) workspace = tab.kind;
    }
  }
  function changeWorkspace(kind: Tab['kind']) {
    closeMenus();
    if (kind === 'qualifier' && !advancedMode) return;
    workspace = kind;
    filter = '';
    selectedId = null;
    const tab = tabs.find((t) => t.kind === kind);
    const item = kind === 'model' ? project?.models[0] : project?.qualifiers[0];
    if (tab) activeId = tab.id;
    else if (item) openTab(item.id, kind);
    else activeId = null;
  }
  async function guard(action: () => Promise<void>) {
    closeMenus();
    if (busy) return;
    if (screen === 'editor' && snapshot?.dirty) {
      pending = action;
      modal = 'unsaved';
    } else await action();
  }
  async function save(saveAs = false) {
    closeMenus();
    if (!snapshot) return false;
    const saved = await run(
      () => client.save(snapshot!.revision, saveAs),
      client.desktop ? 'Проект сохранён' : 'Проект экспортирован в JSON',
    );
    if (saved) rememberCurrent();
    return saved;
  }
  async function confirmUnsaved(shouldSave: boolean) {
    const next = pending;
    if (shouldSave && !(await save())) return;
    pending = null;
    modal = null;
    if (next) await next();
  }
  function cancelModal() {
    if (busy) return;
    modal = null;
    pending = null;
    pendingDelete = null;
  }
  function showCreate(kind: 'newModel' | 'newQualifier' | 'newProject') {
    error = '';
    modalName = '';
    modalDescription = '';
    if (kind === 'newProject') modelNotation = 'IDEF0';
    modal = kind;
    closeMenus();
  }
  async function requestNew() {
    await guard(async () => showCreate('newProject'));
  }
  async function requestOpen() {
    await guard(async () => {
      if (!snapshot) return;
      if (client.desktop) {
        if (await run(() => client.open(snapshot!.revision), 'Проект открыт')) {
          enterEditor();
          rememberCurrent();
        }
      } else fileInput.click();
    });
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement,
      file = input.files?.[0];
    input.value = '';
    if (!file || !snapshot) return;
    const imported = await run(
      async () => {
        if (file.size > 16 * 1024 * 1024) throw new Error('Размер проекта превышает 16 МБ.');
        const data: unknown = JSON.parse(await file.text());
        validateProject(data);
        return client.replace(data, snapshot!.revision);
      },
      'Открыт {0}',
      { 0: file.name },
    );
    if (imported) {
      enterEditor();
      rememberCurrent();
    }
  }
  async function submitCreate(event: SubmitEvent) {
    event.preventDefault();
    if (!snapshot || !modalName.trim()) return;
    const name = modalName.trim(),
      description = modalDescription.trim();
    if (modal === 'newProject') {
      if (
        await run(
          () =>
            client.replace(
              createProjectWithDiagram(name, modelNotation, description),
              snapshot!.revision,
            ),
          'Новый проект создан',
        )
      ) {
        modal = null;
        enterEditor();
        rememberCurrent();
      }
    } else if (modal === 'newModel') {
      const id = newId();
      if (
        await apply(
          {
            kind: 'addModel',
            model: {
              id,
              name,
              description,
              notation: modelNotation,
              blocks: [{ id: newId(), name, description, x: 390, y: 170 }],
              flows: [],
              sheet: {
                ...diagramSheet(),
                node: modelNotation === 'DFD' ? 'Контекст' : 'A-0',
                createdAt: new Date().toLocaleDateString('sv-SE'),
              },
            },
          },
          'Модель создана',
        )
      ) {
        modal = null;
        openTab(id, 'model');
      }
    } else if (modal === 'newQualifier') {
      const id = newId();
      if (
        await apply(
          { kind: 'addQualifier', qualifier: { id, name, description, elements: [] } },
          'Классификатор создан',
        )
      ) {
        modal = null;
        openTab(id, 'qualifier');
      }
    } else if (modal === 'newFlow' && model) {
      const id = newId();
      if (
        await apply(
          {
            kind: 'addFlow',
            modelId: model.id,
            flow: { id, name, sourceId: flowSource, targetId: flowTarget },
          },
          'Связь создана',
        )
      ) {
        modal = null;
        selectedId = id;
      }
    }
  }
  async function addElement() {
    if (!qualifier) return;
    const id = newId();
    if (
      await apply(
        {
          kind: 'addElement',
          qualifierId: qualifier.id,
          element: { id, name: $t('Новый элемент'), description: '' },
        },
        'Элемент добавлен',
      )
    ) {
      selectedId = id;
      inspector = true;
    }
  }
  function navigateDiagram(id: string, newTab = false) {
    if (!newTab && activeTab?.kind === 'model' && activeId !== id)
      tabs = tabs.filter((tab) => tab.id !== activeId);
    openTab(id, 'model');
  }
  function openDecomposition(owner: Block, newTab = false) {
    if (!project || !model || busy) return;
    const existing = childDiagram(project, owner.id);
    if ((owner.kind ?? 'process') !== 'process') return;
    if (existing) {
      navigateDiagram(existing.id, newTab);
      return;
    }
    decompositionOwner = owner.id;
    decompositionCount = 4;
    decompositionLayout = 'diagonal';
    separateDecomposition = newTab;
    error = '';
    modal = 'decompose';
  }
  async function createDecomposition(event: SubmitEvent) {
    event.preventDefault();
    if (!model || !decompositionOwner) return;
    const id = newId();
    if (
      await apply(
        {
          kind: 'decomposeBlock',
          modelId: model.id,
          blockId: decompositionOwner,
          childId: id,
          count: decompositionCount,
          layout: decompositionLayout,
          blockNamePrefix: $locale === 'en' && model.notation === 'DFD' ? 'Process' : $t('Функция'),
        },
        'Декомпозиция создана',
      )
    ) {
      modal = null;
      navigateDiagram(id, separateDecomposition);
    }
  }
  function editDiagramObject(id: string) {
    selectedId = id;
    inspector = true;
    error = '';
    modal = 'objectProperties';
  }
  async function applyObjectProperties(value: Block | Flow) {
    if (!model) return false;
    return 'sourceId' in value
      ? apply({ kind: 'updateFlow', modelId: model.id, flow: value }, 'Свойства стрелки изменены')
      : apply({ kind: 'updateBlock', modelId: model.id, block: value }, 'Свойства блока изменены');
  }
  function deleteDiagramObject(id: string) {
    selectedId = id;
    requestDelete();
  }
  async function drawFlow(flow: Omit<Flow, 'id'>) {
    if (!model) return false;
    const id = newId();
    if (
      await apply({ kind: 'addFlow', modelId: model.id, flow: { id, ...flow } }, 'Стрелка создана')
    ) {
      selectedId = id;
      inspector = true;
      return true;
    }
    return false;
  }
  async function addBlock(position?: { x: number; y: number }, kind: Block['kind'] = 'process') {
    if (!model) return;
    const id = newId(),
      n = model.blocks.length;
    if (
      await apply(
        {
          kind: 'addBlock',
          modelId: model.id,
          block: {
            id,
            name:
              model?.notation === 'DFD'
                ? kind === 'external'
                  ? $t('Внешняя сущность')
                  : kind === 'dataStore'
                    ? $t('Хранилище данных')
                    : $t('Новый процесс')
                : $t('Новая функция'),
            ...(model?.notation === 'DFD' ? { kind } : {}),
            description: '',
            x: position?.x ?? 120 + (n % 4) * 220,
            y: position?.y ?? 100 + Math.floor(n / 4) * 160,
          },
        },
        'Блок добавлен',
      )
    ) {
      selectedId = id;
      inspector = true;
    }
  }
  function addFlow() {
    if (!model || model.blocks.length < 2) return;
    modalName = $t('Поток данных');
    modalDescription = '';
    flowSource = model.blocks[0].id;
    flowTarget = model.blocks[1].id;
    modal = 'newFlow';
  }
  async function updateProperties(event: SubmitEvent) {
    event.preventDefault();
    if (!entity) return;
    const values = { name: draftName.trim(), description: draftDescription.trim() };
    if (block && model)
      await apply({ kind: 'updateBlock', modelId: model.id, block: { ...block, ...values } });
    else if (flow && model)
      await apply({
        kind: 'updateFlow',
        modelId: model.id,
        flow: { ...flow, name: values.name, targetSide: draftTargetSide },
      });
    else if (element && qualifier)
      await apply({
        kind: 'updateElement',
        qualifierId: qualifier.id,
        element: { ...element, ...values },
      });
    else if (model)
      await apply({
        kind: 'updateModel',
        id: model.id,
        ...values,
        sheet: { ...draftSheet },
        backgroundColor: draftBackground,
      });
    else if (qualifier) await apply({ kind: 'updateQualifier', id: qualifier.id, ...values });
    else await apply({ kind: 'updateProject', ...values });
  }
  function requestDelete() {
    if (busy) return;
    let command: Command | null = null;
    if (block && model) command = { kind: 'deleteBlock', modelId: model.id, id: block.id };
    else if (flow && model) command = { kind: 'deleteFlow', modelId: model.id, id: flow.id };
    else if (element && qualifier)
      command = { kind: 'deleteElement', qualifierId: qualifier.id, id: element.id };
    else if (model) command = { kind: 'deleteModel', id: model.id };
    else if (qualifier) command = { kind: 'deleteQualifier', id: qualifier.id };
    if (command) {
      pendingDelete = command;
      deleteTitle =
        flow && project
          ? flowLabel(project, flow) || $t('Стрелка без подписи')
          : (entity?.name ?? '');
      modal = 'delete';
    }
  }
  async function confirmDelete() {
    if (pendingDelete && (await apply(pendingDelete, 'Объект удалён. Действие можно отменить.'))) {
      selectedId = null;
      modal = null;
      pendingDelete = null;
    }
  }
  async function undoRedo(direction: 'undo' | 'redo') {
    closeMenus();
    if (snapshot)
      await run(
        () => client.history(direction, snapshot!.revision),
        direction === 'undo' ? 'Действие отменено' : 'Действие повторено',
      );
  }
  async function requestExit() {
    await guard(async () => {
      if (client.desktop) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('project_close_window');
      }
    });
  }
  function keydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const editing = target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === 'Escape') closeMenus();
    if (modal) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && ['s', 'o', 'n', 'k'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const key = event.key.toLowerCase();
      if (key === 's' && screen === 'editor') void save(event.shiftKey);
      if (key === 'o') void requestOpen();
      if (key === 'n') void requestNew();
      if (key === 'k' && screen === 'editor') searchInput?.focus();
      return;
    }
    if (screen !== 'editor') return;
    if (mod && !editing && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      void undoRedo(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
    } else if (event.key === 'Delete' && !editing && selectedId) requestDelete();
    else if (event.key === 'F2' && !editing) {
      event.preventDefault();
      inspector = true;
      nameInput?.focus();
    }
  }
  onMount(() => {
    initializeLocale();
    try {
      const settings = JSON.parse(localStorage.getItem('tamus:ui:settings:v1') ?? '{}');
      advancedMode = settings.advanced === true;
    } catch {}
    let disposed = false,
      unlisten: (() => void) | undefined;
    void initialize();
    async function initialize() {
      try {
        snapshot = await client.initialize();
        if (disposed) return;
        recents = readRecentProjects();
        status = 'Готов к работе';
        if (client.desktop) {
          const { listen } = await import('@tauri-apps/api/event');
          const stop = await listen('project-close-requested', () => {
            void requestExit();
          });
          if (disposed) stop();
          else unlisten = stop;
        }
      } catch (cause) {
        error = String(cause);
        status = 'Не удалось открыть проект';
      }
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (snapshot?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });
</script>

<svelte:window
  onkeydown={keydown}
  onpointerdown={(event) => {
    if (!(event.target as HTMLElement).closest('.app-menu')) closeMenus();
  }}
/>
<svelte:head
  ><title>{project?.name ?? $t('Рабочее пространство')} — Tamus</title><meta
    name="description"
    content={$t('Рабочее пространство для моделирования процессов и ведения классификаторов.')}
  /></svelte:head
>
<input
  class="visually-hidden"
  tabindex="-1"
  aria-label={$t('Открыть файл проекта')}
  type="file"
  accept=".json"
  bind:this={fileInput}
  onchange={importFile}
/>

{#if screen === 'welcome'}
  <Welcome
    {recents}
    busy={busy || !snapshot}
    {error}
    onCreate={requestNew}
    onOpen={requestOpen}
    onOpenRamus={requestRamus}
    onOpenRecent={openRecent}
    onRemoveRecent={removeRecent}
    onSettings={() => {
      closeMenus();
      modal = 'settings';
    }}
    onHelp={() => {
      closeMenus();
      modal = 'help';
    }}
    onClose={() => void requestExit()}
    onError={(message) => (error = message)}
    onClearError={() => (error = '')}
  />
{:else}
  <div class="app-shell" class:without-inspector={!inspector} aria-busy={busy}>
    <header class="app-header">
      <a
        class="brand"
        href="/"
        onclick={(event) => {
          event.preventDefault();
          void requestHome();
        }}
        aria-label={$t('Tamus — главный экран')}
      >
        Tamus</a
      >

      <nav class="app-menu" aria-label={$t('Главное меню')}>
        <details name="main-menu">
          <summary
            onclick={(event) => {
              const current = event.currentTarget.parentElement;
              document.querySelectorAll('.app-menu details[open]').forEach((item) => {
                if (item !== current) item.removeAttribute('open');
              });
            }}>{$t('Файл')}</summary
          >
          <div class="menu-popover">
            <button onclick={requestHome} disabled={busy}><span>{$t('Главный экран')}</span></button
            >
            <hr />
            <button onclick={requestNew} disabled={busy}
              ><span>{$t('Новый проект')}</span><kbd>Ctrl N</kbd></button
            ><button onclick={requestOpen} disabled={busy}
              ><span>{$t('Открыть…')}</span><kbd>Ctrl O</kbd></button
            ><button onclick={requestRamus} disabled={busy}
              ><span>{$t('Импорт Ramus…')}</span><span class="tag">{$t('скоро')}</span></button
            >
            <hr />
            <button onclick={() => save()} disabled={busy || !snapshot}
              ><span>{$t('Сохранить')}</span><kbd>Ctrl S</kbd></button
            ><button onclick={() => save(true)} disabled={busy || !snapshot}
              >{$t('Сохранить как…')}</button
            >{#if client.desktop}<hr />
              <button onclick={requestExit}>{$t('Выход')}</button>{/if}
          </div>
        </details>
        <details name="main-menu">
          <summary
            onclick={(event) => {
              const current = event.currentTarget.parentElement;
              document.querySelectorAll('.app-menu details[open]').forEach((item) => {
                if (item !== current) item.removeAttribute('open');
              });
            }}>{$t('Правка')}</summary
          >
          <div class="menu-popover">
            <button onclick={() => undoRedo('undo')} disabled={busy || !snapshot?.canUndo}
              ><span>{$t('Отменить')}</span><kbd>Ctrl Z</kbd></button
            ><button onclick={() => undoRedo('redo')} disabled={busy || !snapshot?.canRedo}
              ><span>{$t('Повторить')}</span><kbd>Ctrl Y</kbd></button
            >
            <hr />
            <button
              onclick={() => {
                closeMenus();
                requestDelete();
              }}
              disabled={!activeTab || busy}>{$t('Удалить объект…')}</button
            >
          </div>
        </details>
        <details name="main-menu">
          <summary
            onclick={(event) => {
              const current = event.currentTarget.parentElement;
              document.querySelectorAll('.app-menu details[open]').forEach((item) => {
                if (item !== current) item.removeAttribute('open');
              });
            }}>{$t('Вид')}</summary
          >
          <div class="menu-popover">
            <button onclick={() => changeWorkspace('model')}>{$t('Диаграммы')}</button
            >{#if advancedMode}<button onclick={() => changeWorkspace('qualifier')}
                >{$t('Классификаторы')}</button
              >{/if}
            <button
              onclick={() => {
                closeMenus();
                modal = 'settings';
              }}>{$t('Настройки…')}</button
            >
            <hr />
            <button
              onclick={() => {
                inspector = !inspector;
                closeMenus();
              }}>{$t(inspector ? 'Скрыть свойства' : 'Показать свойства')}</button
            >
          </div>
        </details>
        <button
          onclick={() => {
            closeMenus();
            modal = 'help';
          }}
          class="menu-help">{$t('Помощь')}</button
        >
      </nav>
      <div class="header-spacer" data-tauri-drag-region></div>
      <span class="version-badge">0.1.0</span>
      <WindowControls onclose={() => void requestExit()} onerror={(message) => (error = message)} />
    </header>

    <div class="global-toolbar">
      <div class="tool-group">
        <button class="tool-button" onclick={requestNew} disabled={busy}
          ><Icon name="plus" /><span>{$t('Новый')}</span></button
        ><button class="tool-button" onclick={requestOpen} disabled={busy}
          ><Icon name="folderOpen" /><span>{$t('Открыть')}</span></button
        ><button class="tool-button save-button" onclick={() => save()} disabled={busy || !snapshot}
          ><Icon name="save" /><span>{$t('Сохранить')}</span>{#if snapshot?.dirty}<span
              class="unsaved-dot"
            ></span>{/if}</button
        ><span class="tool-divider"></span><button
          class="icon-button"
          aria-label={$t('Отменить')}
          title={$t('Отменить (Ctrl+Z)')}
          onclick={() => undoRedo('undo')}
          disabled={busy || !snapshot?.canUndo}><Icon name="undo" /></button
        ><button
          class="icon-button"
          aria-label={$t('Повторить')}
          title={$t('Повторить (Ctrl+Y)')}
          onclick={() => undoRedo('redo')}
          disabled={busy || !snapshot?.canRedo}><Icon name="redo" /></button
        >
      </div>
      <div class="toolbar-project">
        <span class="project-status-dot"></span><span
          >{project?.name ?? $t('Загрузка проекта')}</span
        >{#if !snapshot?.path}<span class="tag">{$t('Локальный')}</span>{/if}
      </div>
      <button
        class="icon-button"
        class:pressed={inspector}
        title={$t('Панель свойств')}
        aria-label={$t('Панель свойств')}
        aria-pressed={inspector}
        onclick={() => (inspector = !inspector)}><Icon name="panel" /></button
      >
    </div>

    <aside class="activity-rail" aria-label={$t('Разделы')}>
      <button
        class:active={workspace === 'model'}
        aria-label={$t('Диаграммы')}
        title={$t('Диаграммы')}
        onclick={() => changeWorkspace('model')}
        ><Icon name="model" size={22} /><span>{$t('Схемы')}</span></button
      >
      {#if advancedMode}<button
          class:active={workspace === 'qualifier'}
          aria-label={$t('Классификаторы')}
          title={$t('Классификаторы')}
          onclick={() => changeWorkspace('qualifier')}
          ><Icon name="table" size={22} /><span>{$t('Данные')}</span></button
        >{/if}
      <div class="rail-spacer"></div>
      <button
        aria-label={$t('Настройки')}
        title={$t('Настройки и расширенный режим')}
        onclick={() => {
          closeMenus();
          modal = 'settings';
        }}><Icon name="settings" size={21} /><span>{$t('Настройки')}</span></button
      >
      <button
        aria-label={$t('О программе и горячие клавиши')}
        title={$t('Справка')}
        onclick={() => (modal = 'help')}
        ><Icon name="help" size={21} /><span>{$t('Справка')}</span></button
      >
    </aside>

    <aside class="project-sidebar">
      <header class="sidebar-header">
        <span>{$t('ОБОЗРЕВАТЕЛЬ')}</span><span class="sidebar-label">{$t('ПРОЕКТ')}</span>
      </header>
      <div class="sidebar-search">
        <Icon name="search" size={15} /><input
          bind:this={searchInput}
          bind:value={filter}
          placeholder={$t('Найти в проекте…')}
          aria-label={$t('Поиск в проекте')}
        /><kbd>Ctrl K</kbd>{#if filter}<button
            class="clear-search"
            aria-label={$t('Очистить поиск')}
            onclick={() => (filter = '')}><Icon name="close" size={13} /></button
          >{/if}
      </div>
      <button
        class="project-root"
        onclick={() => {
          activeId = null;
          selectedId = null;
          inspector = true;
        }}
        ><span class="root-folder"><Icon name="folder" size={18} /></span><span
          >{project?.name ?? $t('Проект')}</span
        ></button
      >
      <div class="sidebar-tree">
        <div class="tree-group-header">
          <button
            class="tree-group-toggle"
            onclick={() => (modelsExpanded = !modelsExpanded)}
            aria-expanded={modelsExpanded}
            ><span class:expanded={modelsExpanded} class="tree-chevron"
              ><Icon name="chevron" size={13} /></span
            ><span>{$t('Модели')}</span><span class="count">{modelCount}</span></button
          ><button
            class="tree-add"
            title={$t('Создать модель')}
            aria-label={$t('Создать модель')}
            disabled={busy || !project}
            onclick={() => showCreate('newModel')}><Icon name="plus" size={15} /></button
          >
        </div>
        {#if modelsExpanded}{#each visibleModels as row}<button
              class="tree-item"
              class:active={(row.childId ?? row.modelId) === activeId &&
                (!row.blockId || row.childId ? !selectedId : selectedId === row.blockId)}
              style:padding-left={`${18 + row.depth * 15}px`}
              title={row.blockId ? $t('Функция: Ctrl+щелчок — декомпозиция') : $t('Модель')}
              onclick={(event) => {
                if (!row.blockId) {
                  navigateDiagram(row.modelId);
                  return;
                }
                if (row.childId && !event.ctrlKey && !event.metaKey) {
                  navigateDiagram(row.childId);
                  return;
                }
                navigateDiagram(row.modelId);
                selectedId = row.blockId;
                inspector = true;
                if ((event.ctrlKey || event.metaKey) && model) {
                  const block = model.blocks.find((b) => b.id === row.blockId);
                  if (block) openDecomposition(block);
                }
              }}
              ><Icon name={row.blockId ? 'block' : 'model'} size={17} /><span>{row.name}</span><span
                class="tree-item-code">{row.node === 'Контекст' ? $t('Контекст') : row.node}</span
              ></button
            >
          {/each}{#if !visibleModels.length}<p class="tree-empty">
              {filter ? $t('Ничего не найдено') : $t('Добавьте первую модель')}
            </p>{/if}{/if}
        {#if advancedMode}<div class="tree-group-header qualifier-group">
            <button
              class="tree-group-toggle"
              onclick={() => (qualifiersExpanded = !qualifiersExpanded)}
              aria-expanded={qualifiersExpanded}
              ><span class:expanded={qualifiersExpanded} class="tree-chevron"
                ><Icon name="chevron" size={13} /></span
              ><span>{$t('Классификаторы')}</span><span class="count"
                >{project?.qualifiers.length ?? 0}</span
              ></button
            ><button
              class="tree-add"
              title={$t('Создать классификатор')}
              aria-label={$t('Создать классификатор')}
              disabled={busy || !project}
              onclick={() => showCreate('newQualifier')}><Icon name="plus" size={15} /></button
            >
          </div>
          {#if qualifiersExpanded}{#each visibleQualifiers as item}<button
                class="tree-item"
                class:active={activeId === item.id}
                onclick={() => openTab(item.id, 'qualifier')}
                ><Icon name="table" size={17} /><span>{item.name}</span><span class="tree-item-code"
                  >{item.elements.length}</span
                ></button
              >{/each}{#if !visibleQualifiers.length}<p class="tree-empty">
                {filter ? $t('Ничего не найдено') : $t('Добавьте первый классификатор')}
              </p>{/if}{/if}
        {/if}
      </div>
      <div class="sidebar-bottom">
        <div>
          <Icon name="layers" size={15} /><span
            >{$count('model', modelCount)}{#if advancedMode}
              · {$count('item', totalElements)}{/if}</span
          >
        </div>
        <span class="local-label"><span class="tiny-dot"></span>{$t('Локальное пространство')}</span
        >
      </div>
    </aside>

    <main class="workspace">
      <div class="document-tabs" aria-label={$t('Открытые документы')}>
        {#each tabs as tab}<div class="document-tab" class:active={activeId === tab.id}>
            <button class="tab-main" onclick={() => openTab(tab.id, tab.kind)}
              ><Icon name={tab.kind === 'model' ? 'model' : 'table'} size={16} /><span
                >{tab.kind === 'model'
                  ? project?.models.find((m) => m.id === tab.id)?.name
                  : project?.qualifiers.find((q) => q.id === tab.id)?.name}</span
              ></button
            ><button
              class="tab-close"
              aria-label={$t('Закрыть вкладку')}
              onclick={() => closeTab(tab.id)}><Icon name="close" size={13} /></button
            >
          </div>{/each}<button
          class="new-tab"
          aria-label={$t('Добавить документ')}
          title={$t('Добавить документ')}
          onclick={() => showCreate(workspace === 'model' ? 'newModel' : 'newQualifier')}
          disabled={busy || !project}><Icon name="plus" size={17} /></button
        >
      </div>
      {#if error}<div class="error-banner" role="alert">
          <Icon name="info" size={18} /><span>{$t(error)}</span><button
            class="icon-button"
            aria-label={$t('Закрыть сообщение')}
            onclick={() => (error = '')}><Icon name="close" size={15} /></button
          >
        </div>{/if}
      {#if project && activeTab && (model || qualifier)}
        <header class="document-header">
          <div class="breadcrumbs">
            <span>{$t('Проект')}</span><Icon name="chevron" size={12} /><span
              >{model ? $t('Модели') : $t('Классификаторы')}</span
            ><Icon name="chevron" size={12} /><span class="breadcrumb-current">{activeTitle}</span>
          </div>
          {#if ancestors.length}<nav
              class="diagram-ancestors"
              aria-label={$t('Уровни декомпозиции')}
            >
              {#each ancestors as ancestor}<button onclick={() => openTab(ancestor.id, 'model')}
                  >{project
                    ? diagramNode(project, ancestor) === 'Контекст'
                      ? $t('Контекст')
                      : diagramNode(project, ancestor)
                    : ''} · {ancestor.name}</button
                ><span>›</span>{/each}
              <span
                >{project && model
                  ? diagramNode(project, model) === 'Контекст'
                    ? $t('Контекст')
                    : diagramNode(project, model)
                  : ''}</span
              >
            </nav>{/if}
          <div class="document-title-row">
            <div>
              <span class="eyebrow">{model ? $t('ДИАГРАММА ПРОЦЕССА') : $t('ДАННЫЕ ПРОЕКТА')}</span>
              <h1>{activeTitle}</h1>
            </div>
            <span class="notation-tag"
              >{model ? model.notation : $count('item', qualifier?.elements.length ?? 0)}</span
            >
          </div>
        </header>
        {#if model}
          <Diagram
            {model}
            project={project!}
            onedit={editDiagramObject}
            ondelete={deleteDiagramObject}
            oncenter={(blockId) => {
              if (model)
                void apply(
                  { kind: 'centerArrows', modelId: model.id, ...(blockId ? { blockId } : {}) },
                  'Присоединения стрелок центрированы',
                );
            }}
            node={project ? diagramNode(project, model) : 'A0'}
            context={project && parent ? diagramNode(project, parent) : diagramSheet(model).context}
            hasParent={!!parent}
            interfaces={project ? boundaryPorts(project, model) : []}
            childBlockIds={project?.models.flatMap((m) =>
              m.parentBlockId ? [m.parentBlockId] : [],
            ) ?? []}
            onopen={openDecomposition}
            onparent={() => {
              if (parent) navigateDiagram(parent.id);
            }}
            ondraw={drawFlow}
            projectName={project?.name ?? ''}
            onproperties={() => {
              selectedId = null;
              inspector = true;
            }}
            {busy}
            {selectedId}
            onselect={(id) => {
              selectedId = id;
              inspector = true;
            }}
            onmove={(block) => {
              if (model)
                void apply(
                  { kind: 'updateBlock', modelId: model.id, block },
                  'Положение блока изменено',
                );
            }}
            onadd={addBlock}
            onflow={addFlow}
          />
        {:else if qualifier}
          <div class="table-toolbar">
            <div class="tool-group">
              <button class="button primary small" onclick={addElement} disabled={busy}
                ><Icon name="plus" size={16} />{$t('Добавить элемент')}</button
              ><button
                class="icon-button"
                aria-label={$t('Удалить выбранный элемент')}
                disabled={!element || busy}
                onclick={requestDelete}><Icon name="trash" size={17} /></button
              >
            </div>
            <button
              class="tool-button sort-button"
              class:pressed={sortByName}
              onclick={() => (sortByName = !sortByName)}
              aria-pressed={sortByName}><Icon name="table" size={15} />{$t('По названию')}</button
            >
          </div>
          <div class="table-scroll">
            <table class="elements-table">
              <thead
                ><tr
                  ><th class="row-code">{$t('Код')}</th><th
                    >{$t('Название')} <span class="column-type">{$t('Строка')}</span></th
                  ><th>{$t('Описание')} <span class="column-type">{$t('Строка')}</span></th></tr
                ></thead
              ><tbody
                >{#each visibleElements as row}<tr class:selected={selectedId === row.id}
                    ><td class="row-code"
                      >{String(qualifier.elements.findIndex((e) => e.id === row.id) + 1).padStart(
                        2,
                        '0',
                      )}</td
                    ><td
                      ><button
                        class="element-name"
                        onclick={() => {
                          selectedId = row.id;
                          inspector = true;
                        }}
                        ><span class="element-icon"><Icon name="file" size={16} /></span
                        >{row.name}</button
                      ></td
                    ><td class="element-description">{row.description || '—'}</td></tr
                  >{/each}</tbody
              >
            </table>
            {#if !visibleElements.length}<div class="empty-state table-empty">
                <Icon name="table" size={34} />
                <h2>{filter ? $t('Ничего не найдено') : $t('Здесь будут элементы')}</h2>
                <p>
                  {filter
                    ? $t('Измените запрос в поиске проекта.')
                    : $t('Добавьте первый элемент в классификатор.')}
                </p>
                {#if !filter}<button class="button" onclick={addElement} disabled={busy}
                    ><Icon name="plus" size={16} />{$t('Добавить элемент')}</button
                  >{/if}
              </div>{/if}
          </div>
          <div class="table-footer">
            <span
              >{$t('Показано {visible} из {total}', {
                visible: visibleElements.length,
                total: qualifier.elements.length,
              })}</span
            ><span>{$t('Выберите элемент для редактирования свойств')}</span>
          </div>
        {/if}
      {:else}
        <div class="empty-state workspace-empty">
          <span class="empty-illustration"><Icon name="model" size={42} /></span><span
            class="eyebrow">{$t('ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО')}</span
          >
          <h1>
            {project ? $t('От идеи — к понятной модели') : $t('Открываем рабочее пространство…')}
          </h1>
          <p>
            {project
              ? advancedMode
                ? $t('Создайте модель процесса или классификатор.')
                : $t('Создайте модель IDEF0 или DFD, чтобы начать работу.')
              : $t('Подготавливаем проект и инструменты.')}
          </p>
          {#if project}<div class="empty-actions">
              <button class="button primary" onclick={() => showCreate('newModel')}
                ><Icon name="model" size={17} />{$t('Создать модель')}</button
              >{#if advancedMode}<button class="button" onclick={() => showCreate('newQualifier')}
                  ><Icon name="table" size={17} />{$t('Классификатор')}</button
                >{/if}
            </div>{/if}
        </div>
      {/if}
    </main>

    {#if inspector}<aside class="inspector">
        <header class="inspector-header">
          <span>{$t('Свойства')}</span><button
            class="icon-button"
            aria-label={$t('Скрыть свойства')}
            onclick={() => (inspector = false)}><Icon name="panel" size={16} /></button
          >
        </header>
        <div class="inspector-object">
          <span class="inspector-object-icon"
            ><Icon
              name={flow ? 'arrow' : model ? 'block' : qualifier ? 'file' : 'folder'}
              size={21}
            /></span
          >
          <div>
            <span>{entityType}</span><strong
              >{flow && project
                ? flowLabel(project, flow) || $t('Стрелка без подписи')
                : (entity?.name ?? $t('Проект'))}</strong
            >
          </div>
        </div>
        {#if entity}<form class="properties-form" onsubmit={updateProperties}>
            <div class="property-section-title">{$t('ОСНОВНОЕ')}</div>
            <label for="property-name">{$t('Название')}</label><input
              id="property-name"
              bind:this={nameInput}
              bind:value={draftName}
              readonly={!!flow?.parentFlowId}
              required={!flow}
              maxlength="256"
              disabled={busy}
            />{#if !flow}<label for="property-description">{$t('Описание')}</label><textarea
                id="property-description"
                bind:value={draftDescription}
                rows="5"
                maxlength="10000"
                placeholder={$t('Добавьте описание…')}
                disabled={busy}></textarea>{:else}<div class="flow-properties">
                <span>{$t('Из блока')}</span><strong
                  >{model?.blocks.find((b) => b.id === flow.sourceId)?.name ??
                    $t('Граница листа (I/C/M)')}</strong
                ><Icon name="arrow" size={15} /><span>{$t('В блок')}</span><strong
                  >{model?.blocks.find((b) => b.id === flow.targetId)?.name ??
                    $t('Граница листа (O)')}</strong
                >
              </div>{/if}
            {#if flow}<button
                type="button"
                class="button decomposition-action"
                onclick={() => editDiagramObject(flow.id)}>{$t('Свойства стрелки / Поток…')}</button
              >
              <p class="inherited-note">
                {$t('Объектов потока:')}
                {flow.objectIds?.length ?? 0}
              </p>{/if}
            {#if flow && flow.targetId !== null}
              <label for="flow-role"
                >{model?.notation === 'DFD'
                  ? $t('Сторона назначения')
                  : $t('Входит в блок как')}</label
              >
              <select id="flow-role" bind:value={draftTargetSide} disabled={busy}>
                <option value="left"
                  >{model?.notation === 'DFD' ? $t('Слева') : $t('Вход (I) — слева')}</option
                >{#if model?.notation === 'DFD'}<option value="right">{$t('Справа')}</option
                  >{/if}<option value="top"
                  >{model?.notation === 'DFD'
                    ? $t('Сверху')
                    : $t('Управление (C) — сверху')}</option
                ><option value="bottom"
                  >{model?.notation === 'DFD' ? $t('Снизу') : $t('Механизм (M) — снизу')}</option
                >
              </select>
            {/if}
            {#if flow?.parentFlowId}<p class="inherited-note">
                {$t('Имя и граничный порт наследуются от стрелки родительского блока.')}
              </p>{/if}
            {#if block}<button
                type="button"
                class="button decomposition-action"
                onclick={() => void openDecomposition(block)}
                disabled={busy}>{$t('↓ Открыть декомпозицию')}</button
              >{/if}
            {#if model && !block && !flow}
              <div class="paper-color-controls">
                <label for="diagram-background">{$t('Фон листа')}</label><input
                  id="diagram-background"
                  type="color"
                  bind:value={draftBackground}
                />
                <button
                  type="button"
                  class="button small"
                  onclick={() => (draftBackground = '#ffffe8')}>{$t('Жёлтый')}</button
                ><button
                  type="button"
                  class="button small"
                  onclick={() => (draftBackground = '#ffffff')}>{$t('Белый')}</button
                >
              </div>
              <fieldset class="sheet-properties" disabled={busy}>
                <legend>{$t('Штамп диаграммы')}</legend>
                {#each sheetFields as [key, label]}
                  <label for={`sheet-${key}`}>{$t(label)}</label>
                  <input
                    id={`sheet-${key}`}
                    bind:value={draftSheet[key]}
                    readonly={!!model?.parentBlockId && (key === 'node' || key === 'context')}
                    maxlength="256"
                  />
                {/each}
              </fieldset>
            {/if}
            {#if block}<div class="property-section-title geometry-title">{$t('ПОЛОЖЕНИЕ')}</div>
              <div class="geometry-values">
                <div><span>X</span><strong>{block.x}</strong></div>
                <div><span>Y</span><strong>{block.y}</strong></div>
              </div>{/if}
            <button
              class="button apply-properties"
              type="submit"
              disabled={busy ||
                (!flow && !draftName.trim()) ||
                (draftName.trim() === entity.name &&
                  draftDescription.trim() === ('description' in entity ? entity.description : '') &&
                  !sheetChanged &&
                  (!flow ||
                    draftTargetSide ===
                      (flow.targetSide ?? (flow.targetId === null ? 'right' : 'left'))))}
              ><Icon name="check" size={16} />{$t('Применить')}</button
            >
          </form>
          <div class="inspector-meta">
            <div class="property-section-title">{$t('ИНФОРМАЦИЯ')}</div>
            <dl>
              <dt>{$t('Тип')}</dt>
              <dd>{entityType}</dd>
              {#if model}<dt>{$t('Нотация')}</dt>
                <dd>{model.notation}</dd>
                <dt>{$t('Блоков')}</dt>
                <dd>{model.blocks.length}</dd>{:else if qualifier}<dt>{$t('Элементов')}</dt>
                <dd>{qualifier.elements.length}</dd>{/if}
              <dt>ID</dt>
              <dd class="entity-id" title={entity.id}>{entity.id}</dd>
            </dl>
          </div>
          {#if activeTab}<div class="inspector-danger">
              <button class="tool-button danger" onclick={requestDelete} disabled={busy}
                ><Icon name="trash" size={16} />{$t('Удалить')}
                {block
                  ? $t('блок')
                  : flow
                    ? $t('связь')
                    : element
                      ? $t('элемент')
                      : model
                        ? $t('модель')
                        : $t('классификатор')}</button
              >
            </div>{/if}{/if}
        <div class="inspector-note">
          <Icon name="info" size={16} />
          <p>{$t('Выберите объект в рабочей области, чтобы изменить его свойства.')}</p>
        </div>
      </aside>{/if}

    <footer class="statusbar">
      <div>
        <span class="status-light" class:working={busy}></span><span role="status"
          >{busy ? $t('Выполняется…') : $t(status, statusParams)}</span
        >
      </div>
      <div>
        <span>{client.desktop ? $t('Локальное ядро Rust') : $t('Браузерный режим')}</span><span
          class="status-separator"
        ></span><span
          title={snapshot?.path ?? $t('Используйте «Сохранить», чтобы создать файл проекта')}
          >{snapshot?.path ? snapshot.path.split(/[\\/]/).at(-1) : $t('Не сохранён в файл')}</span
        >{#if snapshot?.dirty}<span class="dirty-caption">{$t('Изменён')}</span>{/if}<span
          class="status-separator"
        ></span><span>UTF-8</span>
      </div>
    </footer>
  </div>
{/if}

<Modal
  open={modal === 'newProject' ||
    modal === 'newModel' ||
    modal === 'newQualifier' ||
    modal === 'newFlow'}
  title={modal === 'newProject'
    ? $t('Новый проект')
    : modal === 'newModel'
      ? $t('Новая модель')
      : modal === 'newFlow'
        ? $t('Новая связь')
        : $t('Новый классификатор')}
  onclose={cancelModal}
>
  <form class="modal-form" onsubmit={submitCreate}>
    <p class="modal-intro">
      {modal === 'newProject'
        ? $t('Выберите нотацию и задайте название. Контекстная диаграмма будет создана сразу.')
        : modal === 'newModel'
          ? $t('Создайте диаграмму для описания процесса.')
          : modal === 'newFlow'
            ? $t('Соедините два блока направленным потоком.')
            : $t('Соберите документы, участников и другие объекты в справочник.')}
    </p>
    <label for="create-name">{$t('Название')}</label><input
      id="create-name"
      bind:value={modalName}
      placeholder={modal === 'newModel'
        ? $t('Например, Обработка заказов')
        : modal === 'newQualifier'
          ? $t('Например, Документы')
          : $t('Название')}
      required
      maxlength="256"
      disabled={busy}
    />
    {#if modal === 'newProject'}<fieldset class="notation-choice" disabled={busy}>
        <legend>{$t('Нотация проекта')}</legend>
        <label class:selected={modelNotation === 'IDEF0'}>
          <input type="radio" bind:group={modelNotation} value="IDEF0" />
          <span
            ><strong>IDEF0</strong><small
              >{$t('Функциональная модель процессов и их декомпозиции.')}</small
            ></span
          >
        </label>
        <label class:selected={modelNotation === 'DFD'}>
          <input type="radio" bind:group={modelNotation} value="DFD" />
          <span
            ><strong>DFD</strong><small
              >{$t('Потоки данных, процессы, внешние сущности и хранилища.')}</small
            ></span
          >
        </label>
      </fieldset>{/if}
    {#if modal === 'newModel'}<label for="model-notation">{$t('Нотация')}</label><select
        id="model-notation"
        bind:value={modelNotation}
        ><option value="IDEF0">{$t('IDEF0 — функциональная модель')}</option><option value="DFD"
          >{$t('DFD — потоки данных')}</option
        ></select
      >{/if}
    {#if modal === 'newFlow' && model}<label for="flow-source">{$t('Из блока')}</label><select
        id="flow-source"
        bind:value={flowSource}
        >{#each model.blocks as b}<option value={b.id}>{b.name}</option>{/each}</select
      ><label for="flow-target">{$t('В блок')}</label><select
        id="flow-target"
        bind:value={flowTarget}
        >{#each model.blocks as b}<option value={b.id}>{b.name}</option>{/each}</select
      >{:else}<label for="create-description"
        >{$t('Описание')} <span class="optional">{$t('необязательно')}</span></label
      ><textarea
        id="create-description"
        rows="3"
        bind:value={modalDescription}
        maxlength="10000"
        placeholder={$t('О чём этот проект или объект?')}
        disabled={busy}></textarea>{/if}
    {#if error}<p class="form-error" role="alert">{$t(error)}</p>{/if}
    <div class="modal-actions">
      <button type="button" class="button" onclick={cancelModal} disabled={busy}
        >{$t('Отмена')}</button
      ><button
        type="submit"
        class="button primary"
        disabled={busy || !modalName.trim() || (modal === 'newFlow' && flowSource === flowTarget)}
        >{$t('Создать')}</button
      >
    </div>
  </form>
</Modal>
<Modal open={modal === 'unsaved'} title={$t('Сохранить изменения?')} onclose={cancelModal}
  ><div class="modal-form">
    <p class="modal-intro">
      {$t('В проекте «{name}» есть несохранённые изменения.', { name: project?.name })}
    </p>
    {#if error}<p class="form-error" role="alert">{$t(error)}</p>{/if}
    <div class="modal-actions unsaved-actions">
      <button class="button" onclick={cancelModal} disabled={busy}>{$t('Отмена')}</button><button
        class="button"
        onclick={() => confirmUnsaved(false)}
        disabled={busy}>{$t('Не сохранять')}</button
      ><button class="button primary" onclick={() => confirmUnsaved(true)} disabled={busy}
        >{$t('Сохранить')}</button
      >
    </div>
  </div></Modal
>
<Modal open={modal === 'delete'} title={$t('Удалить объект?')} onclose={cancelModal}
  ><div class="modal-form">
    <p class="modal-intro">
      {$t('«{name}» будет удалён.', { name: deleteTitle })}{#if block}
        {$t('Связи этого блока также будут удалены.')}{:else if model || qualifier}
        {$t('Содержимое объекта также будет удалено.')}{/if}
      {$t('Действие можно отменить.')}
    </p>
    <div class="modal-actions">
      <button class="button" onclick={cancelModal} disabled={busy}>{$t('Отмена')}</button><button
        class="button destructive"
        onclick={confirmDelete}
        disabled={busy}>{$t('Удалить')}</button
      >
    </div>
  </div></Modal
>
<Modal
  open={modal === 'help'}
  title={$t('Tamus · первое рабочее пространство')}
  onclose={cancelModal}
  ><div class="modal-form help-content">
    <p class="modal-intro">{$t('Модели процессов и классификаторы в одном проекте.')}</p>
    <p>
      {$t(
        'Двойной щелчок по блоку открывает свойства, Ctrl/⌘+щелчок — декомпозицию. X включает размещение блоков, Z — указатель, C — стрелки, N — сетку. Кнопка «Родитель» возвращает на уровень выше. В режиме «Стрелка» нажмите на выход блока или границу I/C/M, затем на вход, управление, механизм другого блока или границу O. Esc отменяет построение.',
      )}
    </p>
    <p>
      {$t(
        'Для DFD выберите нотацию при создании модели. X — процесс, E — внешняя сущность, D — хранилище. Потоки можно присоединять с любой стороны; хотя бы один конец должен быть процессом. Декомпозиция доступна для процессов.',
      )}
    </p>
    <p>
      {$t(
        'Цвет листа меняется в свойствах диаграммы, заливка и текст блока — двойным щелчком → «Оформление». Классификаторы доступны после включения «Настройки → Расширенный режим».',
      )}
    </p>
    <dl class="shortcut-list">
      <dt>{$t('Новый / открыть проект')}</dt>
      <dd>Ctrl/⌘ N · O</dd>
      <dt>{$t('Сохранить / сохранить как')}</dt>
      <dd>Ctrl/⌘ S · ⇧ S</dd>
      <dt>{$t('Отменить / повторить')}</dt>
      <dd>Ctrl/⌘ Z · ⇧ Z</dd>
      <dt>{$t('Поиск')}</dt>
      <dd>Ctrl/⌘ K</dd>
      <dt>{$t('Свойства объекта')}</dt>
      <dd>F2</dd>
      <dt>{$t('Удалить выбранное')}</dt>
      <dd>Delete</dd>
    </dl>
    <p class="help-format">
      {$t('Текущий формат:')} <strong>.tamus.json</strong>{$t(
        '. Импорт RSF, туннели, развилки, матрицы и отчёты будут добавлены следующими этапами.',
      )}
    </p>
    <div class="modal-actions">
      <button class="button primary" onclick={cancelModal}>{$t('Понятно')}</button>
    </div>
  </div></Modal
>

<Modal open={modal === 'ramus'} title={$t('Импорт проекта Ramus')} onclose={cancelModal}
  ><div class="modal-form">
    <p class="modal-intro">
      {$t('Чтение RSF и Ramus YAML пока не реализовано.')}
    </p>
    <p>
      {$t(
        'Сейчас можно открыть только проект Tamus в формате .tamus.json. Импорт Ramus появится на этапе совместимости; неподдержанные данные будут диагностироваться, а не теряться молча.',
      )}
    </p>
    <div class="modal-actions">
      <button class="button primary" onclick={cancelModal}>{$t('Понятно')}</button>
    </div>
  </div></Modal
>

{#if project}<ObjectProperties
    open={modal === 'objectProperties'}
    object={objectForDialog}
    {project}
    {advancedMode}
    notation={model?.notation ?? 'IDEF0'}
    paperColor={model?.backgroundColor ?? '#ffffe8'}
    {error}
    {busy}
    onclose={cancelModal}
    onapply={applyObjectProperties}
  />{/if}
<Modal open={modal === 'decompose'} title={$t('Создание декомпозиции')} onclose={cancelModal}>
  <form class="modal-form" onsubmit={createDecomposition}>
    <p class="modal-intro">
      {$t('Разложите функцию «{name}» на работы.', {
        name: model?.blocks.find((b) => b.id === decompositionOwner)?.name,
      })}
    </p>
    <label for="decomposition-layout">{$t('Шаблон размещения')}</label>
    <select id="decomposition-layout" bind:value={decompositionLayout}
      ><option value="diagonal">{$t('По диагонали')}</option><option value="horizontal"
        >{$t('Слева направо')}</option
      ><option value="vertical">{$t('Сверху вниз')}</option></select
    >
    <label for="decomposition-count">{$t('Количество функций')}</label><input
      id="decomposition-count"
      type="number"
      min="2"
      max="20"
      required
      bind:value={decompositionCount}
    />
    <svg
      class="template-preview"
      viewBox={`0 0 ${Math.max(...templateBlocks.map((b) => b.x)) + 310} ${Math.max(...templateBlocks.map((b) => b.y)) + 210}`}
      role="img"
      aria-label={$t('Предпросмотр шаблона')}
    >
      {#each templateBlocks as position, i}<rect
          x={position.x}
          y={position.y}
          width="210"
          height="110"
        /><text x={position.x + 105} y={position.y + 65} text-anchor="middle">{i + 1}</text>{/each}
    </svg>
    {#if error}<p class="form-error" role="alert">{$t(error)}</p>{/if}
    <div class="modal-actions">
      <button type="button" class="button" onclick={cancelModal}>{$t('Отмена')}</button><button
        type="submit"
        class="button primary"
        disabled={busy}>{$t('Создать')}</button
      >
    </div>
  </form>
</Modal>

<Modal open={modal === 'settings'} title={$t('Настройки')} onclose={cancelModal}>
  <div class="modal-form">
    <label for="interface-language">{$t('Язык интерфейса')}</label>
    <select
      id="interface-language"
      value={$locale}
      onchange={(event) => setLocale(event.currentTarget.value as Locale)}
    >
      <option value="ru">Русский</option>
      <option value="en">English</option>
    </select>
    <label for="interface-theme">{$t('Тема оформления')}</label>
    <select
      id="interface-theme"
      value={theme}
      onchange={(event) => setAppTheme(event.currentTarget.value as Theme)}
    >
      <option value="light">{$t('Светлая')}</option>
      <option value="dark">{$t('Тёмная')}</option>
    </select>
    <label class="setting-toggle" for="advanced-mode"
      ><input
        id="advanced-mode"
        type="checkbox"
        checked={advancedMode}
        onchange={(event) => setAdvancedMode(event.currentTarget.checked)}
      /><span
        ><strong>{$t('Расширенный режим')}</strong><small
          >{$t('Классификаторы и присоединение справочных объектов к потокам.')}</small
        ></span
      ></label
    >
    <button
      class="button"
      onclick={() => {
        modal = null;
        activeId = null;
        selectedId = null;
        inspector = true;
      }}>{$t('Свойства проекта')}</button
    >
    <div class="modal-actions">
      <button class="button primary" onclick={cancelModal}>{$t('Закрыть')}</button>
    </div>
  </div>
</Modal>
