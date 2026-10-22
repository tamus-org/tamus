<script lang="ts">
  import { t } from '$lib/i18n';
  import Modal from './Modal.svelte';
  import {
    flowLabel,
    referencedObject,
    type Block,
    type Flow,
    type Project,
  } from '$lib/domain/project';
  let {
    open,
    object,
    project,
    error,
    busy,
    onclose,
    onapply,
    advancedMode = false,
    notation = 'IDEF0',
    paperColor = '#ffffe8',
  }: {
    open: boolean;
    object: Block | Flow | null;
    project: Project;
    error: string;
    busy: boolean;
    onclose: () => void;
    onapply: (value: Block | Flow) => Promise<boolean>;
    advancedMode?: boolean;
    notation?: 'IDEF0' | 'DFD';
    paperColor?: string;
  } = $props();
  const isFlow = $derived(!!object && 'sourceId' in object);
  const inherited = $derived(!!object && 'parentFlowId' in object && !!object.parentFlowId);
  let name = $state(''),
    description = $state(''),
    caption = $state('');
  let width = $state<number | undefined>(210),
    height = $state<number | undefined>(110);
  let fillColor = $state('#ffffe8'),
    textColor = $state('#25251f'),
    appearanceChanged = $state(false),
    inheritColors = $state(false);
  function selectFill(value: string) {
    fillColor = value;
    appearanceChanged = true;
    inheritColors = false;
    const n = parseInt(value.slice(1), 16);
    textColor =
      ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150
        ? '#25251f'
        : '#ffffff';
  }
  let objectIds = $state<string[]>([]),
    pickedIds = $state<string[]>([]),
    qualifierId = $state('');
  let tab = $state<'general' | 'flow' | 'appearance'>('general'),
    picker = $state(false);
  const qualifier = $derived(project.qualifiers.find((q) => q.id === qualifierId));
  const preview = $derived(
    object && 'sourceId' in object
      ? flowLabel(project, { ...object, name, caption, objectIds })
      : '',
  );
  $effect(() => {
    if (open && object) {
      name = object.name;
      description = 'description' in object ? object.description : '';
      caption = 'caption' in object ? (object.caption ?? '') : '';
      objectIds = 'objectIds' in object ? [...(object.objectIds ?? [])] : [];
      width = 'width' in object ? (object.width ?? 210) : 210;
      height = 'height' in object ? (object.height ?? 110) : 110;
      tab = 'sourceId' in object ? 'flow' : 'general';
      picker = false;
      fillColor = 'fillColor' in object ? (object.fillColor ?? paperColor) : paperColor;
      textColor = 'textColor' in object ? (object.textColor ?? '#25251f') : '#25251f';
      appearanceChanged = false;
      inheritColors = false;
    }
  });
  function toggleObject(id: string, checked: boolean) {
    pickedIds = checked
      ? [...new Set([...pickedIds, id])]
      : pickedIds.filter((value) => value !== id);
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!object) return;
    const value =
      'sourceId' in object
        ? { ...object, name, caption, objectIds: [...objectIds] }
        : { ...object, name: name.trim(), description, width: width ?? 210, height: height ?? 110 };
    if (!('sourceId' in value) && appearanceChanged) {
      if (inheritColors) {
        delete value.fillColor;
        delete value.textColor;
      } else {
        value.fillColor = fillColor;
        value.textColor = textColor;
      }
    }
    if (await onapply(value)) onclose();
  }
</script>

<Modal
  {open}
  title={isFlow
    ? $t('Свойства стрелки')
    : notation === 'DFD'
      ? $t('Свойства объекта DFD')
      : $t('Свойства блока')}
  {onclose}
>
  <form class="modal-form object-properties" onsubmit={submit}>
    <div class="property-tabs" role="tablist" aria-label={$t('Вкладки свойств')}>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'general'}
        onclick={() => (tab = 'general')}>{$t('Общие')}</button
      >
      {#if isFlow}<button
          type="button"
          role="tab"
          aria-selected={tab === 'flow'}
          onclick={() => (tab = 'flow')}>{$t('Поток')}</button
        >{/if}
      {#if !isFlow}<button
          type="button"
          role="tab"
          aria-selected={tab === 'appearance'}
          onclick={() => (tab = 'appearance')}>{$t('Оформление')}</button
        >{/if}
    </div>
    {#if tab === 'general'}
      <label for="object-name"
        >{isFlow
          ? $t('Имя потока')
          : notation === 'DFD'
            ? $t('Название объекта')
            : $t('Название функции')}</label
      >
      <input
        id="object-name"
        bind:value={name}
        maxlength="256"
        required={!isFlow}
        readonly={inherited}
        disabled={busy}
      />
      {#if !isFlow}
        <label for="object-description">{$t('Описание')}</label><textarea
          id="object-description"
          bind:value={description}
          rows="4"
          maxlength="10000"
          disabled={busy}></textarea>
        <div class="size-fields">
          <div>
            <label for="object-width">{$t('Ширина')}</label><input
              id="object-width"
              type="number"
              min="80"
              max="800"
              required
              bind:value={width}
              disabled={busy}
            />
          </div>
          <div>
            <label for="object-height">{$t('Высота')}</label><input
              id="object-height"
              type="number"
              min="50"
              max="600"
              required
              bind:value={height}
              disabled={busy}
            />
          </div>
        </div>
      {:else}<p class="modal-intro">
          {notation === 'DFD'
            ? $t(
                'Поток данных связывает процесс с другим процессом, внешней сущностью или хранилищем. Сторону присоединения можно выбирать свободно.',
              )
            : $t('Тип участия определяется стороной присоединения к функции.')}
          {$t('Имя потока и подпись сегмента задаются на вкладке «Поток».')}
        </p>{/if}
    {:else if tab === 'flow'}
      <label for="stream-name">{$t('Имя потока')}</label><input
        id="stream-name"
        bind:value={name}
        maxlength="256"
        readonly={inherited}
        disabled={busy}
      />
      <label for="segment-caption">{$t('Подпись сегмента')}</label><textarea
        id="segment-caption"
        bind:value={caption}
        rows="2"
        maxlength="10000"
        placeholder={$t('Если пусто — имя потока или названия объектов')}
        disabled={busy}></textarea>
      {#if advancedMode || objectIds.length}<div class="object-links-heading">
          <strong>{$t('Присоединённые объекты')}</strong><span>{objectIds.length}</span>
        </div>
        <ul class="object-links">
          {#each objectIds as id}<li>
              <span>{referencedObject(project, id)?.name ?? $t('Объект не найден')}</span><button
                type="button"
                aria-label={$t('Отсоединить {0}', { 0: referencedObject(project, id)?.name })}
                disabled={busy || inherited || !advancedMode}
                onclick={() => (objectIds = objectIds.filter((value) => value !== id))}>×</button
              >
            </li>{/each}
          {#if !objectIds.length}<li class="no-linked-objects">
              {$t('Нет присоединённых объектов')}
            </li>{/if}
        </ul>
        <div class="object-link-actions">
          <button
            type="button"
            class="button small"
            disabled={busy || inherited || !advancedMode}
            onclick={() => {
              pickedIds = [...objectIds];
              qualifierId = project.qualifiers[0]?.id ?? '';
              picker = true;
            }}>{$t('Добавить…')}</button
          >
          <button
            type="button"
            class="button small"
            disabled={busy || inherited || !advancedMode || !objectIds.length}
            onclick={() => (objectIds = [])}>{$t('Очистить')}</button
          >
        </div>
      {/if}
      {#if !advancedMode}<p class="inherited-note">
          {$t('Справочные объекты доступны в расширенном режиме.')}
        </p>{/if}
      <p class="stream-preview">
        {$t('На диаграмме:')} <strong>{preview || $t('без подписи')}</strong>
      </p>
      {#if inherited}<p class="inherited-note">
          {$t(
            'Имя и объекты наследуются от родительского потока. Подпись этого сегмента можно изменить отдельно.',
          )}
        </p>{/if}
    {:else}
      <label for="block-fill-color">{$t('Цвет блока')}</label><input
        id="block-fill-color"
        type="color"
        value={fillColor}
        oninput={(event) => selectFill(event.currentTarget.value)}
      />
      <label for="block-text-color">{$t('Цвет текста')}</label><input
        id="block-text-color"
        type="color"
        bind:value={textColor}
        oninput={() => {
          appearanceChanged = true;
          inheritColors = false;
        }}
      />
      <div class="color-presets">
        <button type="button" class="button small" onclick={() => selectFill('#ffffff')}
          >{$t('Белый')}</button
        ><button type="button" class="button small" onclick={() => selectFill('#ffffe8')}
          >{$t('Жёлтый')}</button
        ><button type="button" class="button small" onclick={() => selectFill('#d9edbd')}
          >{$t('Зелёный')}</button
        ><button type="button" class="button small" onclick={() => selectFill('#d8e9fa')}
          >{$t('Голубой')}</button
        ><button
          type="button"
          class="button small"
          onclick={() => {
            fillColor = paperColor;
            textColor = '#25251f';
            inheritColors = true;
            appearanceChanged = true;
          }}>{$t('Как лист')}</button
        >
      </div>
      <div class="block-color-preview" style:background={fillColor} style:color={textColor}>
        {name || $t('Блок')}
      </div>
    {/if}
    {#if error}<p class="form-error" role="alert">{$t(error)}</p>{/if}
    <div class="modal-actions">
      <button type="button" class="button" disabled={busy} onclick={onclose}>{$t('Отмена')}</button
      ><button class="button primary" type="submit" disabled={busy}>{$t('Применить')}</button>
    </div>
  </form>
</Modal>
<Modal open={picker && open} title={$t('Выбор объектов потока')} onclose={() => (picker = false)}>
  <div class="modal-form">
    <p class="modal-intro">{$t('Выберите классификатор целиком или отдельные элементы.')}</p>
    <div class="object-picker">
      <div class="picker-qualifiers" aria-label={$t('Классификаторы')}>
        {#each project.qualifiers as q}<button
            class:chosen={qualifierId === q.id}
            onclick={() => (qualifierId = q.id)}>{q.name}</button
          >{/each}
        {#if !project.qualifiers.length}<p>{$t('Сначала создайте классификатор.')}</p>{/if}
      </div>
      <div class="picker-elements">
        {#if qualifier}<label class="picker-choice qualifier-choice"
            ><input
              type="checkbox"
              value={qualifier.id}
              checked={pickedIds.includes(qualifier.id)}
              onchange={(event) => toggleObject(qualifier.id, event.currentTarget.checked)}
            /><span>{$t('Классификатор «{name}»', { name: qualifier.name })}</span></label
          >
          {#each qualifier.elements as element}<label class="picker-choice"
              ><input
                type="checkbox"
                value={element.id}
                checked={pickedIds.includes(element.id)}
                onchange={(event) => toggleObject(element.id, event.currentTarget.checked)}
              /><span>{element.name}</span></label
            >{/each}
        {/if}
      </div>
    </div>
    <div class="modal-actions">
      <button class="button" onclick={() => (picker = false)}>{$t('Отмена')}</button><button
        class="button primary"
        onclick={() => {
          objectIds = [...pickedIds];
          picker = false;
        }}>{$t('Присоединить')}</button
      >
    </div>
  </div>
</Modal>
