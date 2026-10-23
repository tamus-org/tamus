<script lang="ts">
  import { locale, t } from '$lib/i18n';
  import type { RecentNotation, RecentProject } from '$lib/services/recent-projects';
  import Icon from './Icon.svelte';
  import WindowControls from './WindowControls.svelte';

  let {
    recents,
    busy,
    error,
    onCreate,
    onOpen,
    onOpenRamus,
    onOpenRecent,
    onRemoveRecent,
    onSettings,
    onHelp,
    onClose,
    onError,
    onClearError,
  }: {
    recents: RecentProject[];
    busy: boolean;
    error: string;
    onCreate: () => void;
    onOpen: () => void;
    onOpenRamus: () => void;
    onOpenRecent: (entry: RecentProject) => void;
    onRemoveRecent: (entry: RecentProject) => void;
    onSettings: () => void;
    onHelp: () => void;
    onClose: () => void;
    onError: (message: string) => void;
    onClearError: () => void;
  } = $props();

  function notationLabel(notation: RecentNotation) {
    if (notation === 'IDEF0' || notation === 'DFD') return notation;
    return notation === 'mixed' ? $t('Смешанный проект') : $t('Без моделей');
  }
  function formatDate(value: number) {
    return new Intl.DateTimeFormat($locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  }
  function formatMeta(entry: RecentProject) {
    const location = entry.path
      ? (entry.path.split(/[\\/]/).pop() ?? entry.path)
      : $t('Локальная копия');
    return `${formatDate(entry.updatedAt)} · ${location}`;
  }
</script>

<div class="welcome-shell" aria-busy={busy}>
  <header class="app-header welcome-header">
    <span class="brand">Tamus</span>
    <div class="header-spacer" data-tauri-drag-region></div>
    <span class="version-badge">0.1.0</span>
    <WindowControls onclose={onClose} onerror={onError} />
  </header>

  <main class="welcome-main">
    <section class="welcome-hero" aria-labelledby="welcome-title">
      <span class="eyebrow">TAMUS · IDEF0 / DFD</span>
      <h1 id="welcome-title">{$t('Модели процессов начинаются здесь')}</h1>
      <p class="welcome-lead">
        {$t('Создайте проект IDEF0 или DFD, откройте файл Tamus или вернитесь к недавней работе.')}
      </p>

      {#if error}<div class="error-banner welcome-error" role="alert">
          <Icon name="info" size={18} /><span>{$t(error)}</span><button
            class="icon-button"
            aria-label={$t('Закрыть сообщение')}
            onclick={onClearError}><Icon name="close" size={15} /></button
          >
        </div>{/if}

      <div class="welcome-actions">
        <button class="welcome-action primary" onclick={onCreate} disabled={busy}>
          <span class="welcome-action-icon"><Icon name="plus" size={21} /></span>
          <span class="welcome-action-copy">
            <strong>{$t('Создать проект')}</strong>
            <small>{$t('Выберите IDEF0 или DFD')}</small>
          </span>
        </button>
        <div class="welcome-open">
          <button class="welcome-action" onclick={onOpen} disabled={busy}>
            <span class="welcome-action-icon"><Icon name="folderOpen" size={21} /></span>
            <span class="welcome-action-copy">
              <strong>{$t('Открыть проект Tamus')}</strong>
              <small>{$t('Файл .tamus.json')}</small>
            </span>
          </button>
          <button class="welcome-action" onclick={onOpenRamus} disabled={busy}>
            <span class="welcome-action-icon"><Icon name="layers" size={21} /></span>
            <span class="welcome-action-copy">
              <strong>{$t('Проект Ramus')}</strong>
              <small>{$t('Файл Ramus (.rsf)')}</small>
            </span>
          </button>
        </div>
      </div>
    </section>

    <section class="recent-panel" aria-labelledby="recent-title">
      <header class="recent-header">
        <div>
          <span class="eyebrow">{$t('Продолжить работу')}</span>
          <h2 id="recent-title">{$t('Недавние проекты')}</h2>
        </div>
        <span class="recent-count">{recents.length}</span>
      </header>
      {#if recents.length}
        <ul class="recent-list">
          {#each recents as entry (entry.id)}
            <li class="recent-row">
              <button class="recent-item" onclick={() => onOpenRecent(entry)} disabled={busy}>
                <span class="recent-icon"><Icon name="file" size={18} /></span>
                <span class="recent-copy">
                  <strong>{entry.name}</strong>
                  <small>{formatMeta(entry)}</small>
                </span>
                <span class="recent-notation">{notationLabel(entry.notation)}</span>
              </button>
              <button
                class="recent-remove"
                aria-label={$t('Убрать из недавних')}
                title={$t('Убрать из недавних')}
                onclick={() => onRemoveRecent(entry)}
                disabled={busy}><Icon name="close" size={13} /></button
              >
            </li>
          {/each}
        </ul>
      {:else}
        <div class="recent-empty">
          <span class="recent-empty-icon"><Icon name="folderOpen" size={27} /></span>
          <p>{$t('Здесь появятся открытые и сохранённые проекты.')}</p>
        </div>
      {/if}
    </section>

    <footer class="welcome-footer">
      <button class="welcome-footer-button" onclick={onSettings}>
        <Icon name="settings" size={16} />{$t('Настройки')}
      </button>
      <button class="welcome-footer-button" onclick={onHelp}>
        <Icon name="help" size={16} />{$t('Справка')}
      </button>
      <span class="welcome-format">.tamus.json · UTF-8 · v0.1.0</span>
    </footer>
  </main>
</div>
