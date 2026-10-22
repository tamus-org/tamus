<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    open,
    title,
    onclose,
    children,
    wide = false,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
    wide?: boolean;
  } = $props();
  let dialog: HTMLDialogElement;
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  aria-label={title}
  bind:this={dialog}
  class:wide
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  onclose={() => {
    if (open) onclose();
  }}
>
  <header class="modal-header">
    <h2>{title}</h2>
    <button class="icon-button" aria-label={$t('Закрыть диалог')} onclick={onclose}
      ><Icon name="close" /></button
    >
  </header>
  {@render children()}
</dialog>
