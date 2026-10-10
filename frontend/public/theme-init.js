// Applies the saved theme before first paint, so there is no flash of the wrong theme.
// This is an external file (not inline) so the Content-Security-Policy can forbid inline scripts entirely.
try {
  var t = localStorage.getItem('cdims-theme');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage unavailable */ }
