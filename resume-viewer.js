// =====================================================================
//  Résumé previewer: renders the hosted PDF with Mozilla PDF.js so it
//  displays the same on desktop and phones (many mobile browsers can't
//  show PDFs inline). Used by the pop-up on the home page and by /resume.
// =====================================================================
(() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let loading;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDFJS + 'pdf.min.js';
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  // Fallback when PDF.js can't load: let the browser try to show it.
  function fallback(container, url) {
    container.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'Résumé PDF';
    frame.className = 'resume-frame';
    container.appendChild(frame);
  }

  async function render(container, url) {
    container.innerHTML = '<p class="resume-loading">Loading résumé…</p>';
    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument(url).promise;
      container.innerHTML = '';
      const width = Math.min(container.clientWidth || 800, 900);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = document.createElement('canvas');
        canvas.className = 'resume-page';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Résumé page ${n} of ${doc.numPages}`);
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    } catch (err) {
      fallback(container, url);
    }
  }

  window.ResumeViewer = { render };
})();
