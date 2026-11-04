// Toolbar on printable documents. "Save as PDF" appears only inside the desktop app.
(function () {
  const pdf = document.querySelector('[data-action="pdf"]');
  if (window.desktop && typeof window.desktop.savePdf === 'function') pdf.hidden = false;

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'print') window.print();
    if (action === 'close') window.close();
    if (action === 'pdf') window.desktop.savePdf(document.title);
  });
  if (new URLSearchParams(location.search).get('autoprint') === '1') window.addEventListener('load', () => window.print());
})();
