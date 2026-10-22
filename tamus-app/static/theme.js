(function () {
  var theme = 'light';
  try {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (error) {
    /* Fall back to the light theme. */
  }
  try {
    var stored = localStorage.getItem('tamus:ui:theme:v1');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (error) {
    /* Storage is optional. */
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#14181f' : '';
})();
