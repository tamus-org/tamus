(function () {
  var theme = 'light';
  try {
    if (localStorage.getItem('tamus:ui:theme:v1') === 'dark') theme = 'dark';
  } catch (error) {
    /* Storage is optional. */
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#14181f' : '';
})();
