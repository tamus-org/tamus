<script lang="ts">
  export type IconName =
    | 'model'
    | 'table'
    | 'folder'
    | 'folderOpen'
    | 'save'
    | 'plus'
    | 'undo'
    | 'redo'
    | 'search'
    | 'chevron'
    | 'close'
    | 'settings'
    | 'help'
    | 'grid'
    | 'cursor'
    | 'block'
    | 'link'
    | 'minus'
    | 'fit'
    | 'panel'
    | 'trash'
    | 'file'
    | 'check'
    | 'arrow'
    | 'dots'
    | 'info'
    | 'edit'
    | 'download'
    | 'layers';
  let {
    name,
    size = 18,
    stroke = 1.7,
  }: { name: IconName; size?: number; stroke?: number } = $props();
  const paths: Record<IconName, string> = {
    model: 'M3 3h6v6H3z M15 15h6v6h-6z M6 9v9h9 M9 6h9v9',
    table: 'M3 4h18v16H3z M3 9h18 M9 9v11 M15 9v11',
    folder: 'M3 7V5h6l2 2h10v13H3z',
    folderOpen: 'M3 11V5h6l2 2h10v4 M3 11h19l-3 9H2z',
    save: 'M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8',
    plus: 'M12 5v14 M5 12h14',
    undo: 'M8 4 3 9l5 5 M3 9h11a6 6 0 0 1 0 12',
    redo: 'm16 4 5 5-5 5 M21 9H10a6 6 0 0 0 0 12',
    search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
    chevron: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12 M18 6 6 18',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3z',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2 M12 17h.01',
    grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    cursor: 'm5 3 15 9-7 1-3 7z',
    block: 'M3 6h18v12H3z',
    link: 'M9 15 15 9 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    minus: 'M5 12h14',
    fit: 'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
    panel: 'M3 4h18v16H3z M15 4v16',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    file: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h5',
    check: 'm5 12 4 4L20 5',
    arrow: 'M4 12h16 m-6-6 6 6-6 6',
    dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7h.01',
    edit: 'm15 3 6 6-12 12H3v-6z M12 6l6 6',
    download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
    layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
