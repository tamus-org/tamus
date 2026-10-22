<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { desktop } from '$lib/services/project-client';
  let { onclose, onerror }: { onclose: () => void; onerror: (message: string) => void } = $props();
  let maximized = $state(false);
  async function windowAction(action: 'minimize' | 'maximize') {
    if (!desktop) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (action === 'minimize') await win.minimize();
      else {
        await win.toggleMaximize();
        maximized = await win.isMaximized();
      }
    } catch (error) {
      onerror(String(error));
    }
  }
  onMount(() => {
    if (!desktop) return;
    let stopped = false,
      unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        maximized = await win.isMaximized();
        const stop = await win.onResized(() => {
          void win
            .isMaximized()
            .then((value) => (maximized = value))
            .catch((error) => onerror(String(error)));
        });
        if (stopped) stop();
        else unlisten = stop;
      })
      .catch((error) => onerror(String(error)));
    return () => {
      stopped = true;
      unlisten?.();
    };
  });
</script>

<div class="window-controls" aria-label={$t('Управление окном')}>
  <button
    aria-label={$t('Свернуть окно')}
    title={desktop ? $t('Свернуть') : $t('Свернуть — доступно в настольном приложении')}
    disabled={!desktop}
    onclick={() => void windowAction('minimize')}
    ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" /></svg
    ></button
  >
  <button
    aria-label={maximized ? $t('Восстановить окно') : $t('Развернуть окно')}
    title={desktop
      ? maximized
        ? $t('Восстановить')
        : $t('Развернуть')
      : $t('Развернуть — доступно в настольном приложении')}
    disabled={!desktop}
    onclick={() => void windowAction('maximize')}
    ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      >{#if maximized}<path d="M3 1h8v8H9 M1 3h8v8H1z" />{:else}<path d="M1 1h10v10H1z" />{/if}</svg
    ></button
  >
  <button
    class="window-close"
    aria-label={$t('Закрыть окно')}
    title={desktop ? $t('Закрыть') : $t('Закрыть — доступно в настольном приложении')}
    disabled={!desktop}
    onclick={onclose}
    ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      ><path d="m1 1 10 10 M11 1 1 11" /></svg
    ></button
  >
</div>
