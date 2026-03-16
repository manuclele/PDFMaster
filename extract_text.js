import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

(async () => {
  const data = new Uint8Array(fs.readFileSync('dummy.pdf'));
  const pdf = await pdfjsLib.getDocument({ 
    data,
    standardFontDataUrl: `./node_modules/pdfjs-dist/standard_fonts/`,
    cMapUrl: `./node_modules/pdfjs-dist/cmaps/`,
    cMapPacked: true,
    disableFontFace: false,
  }).promise;
  const numPages = pdf.numPages;
  console.log('Number of pages:', numPages);
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str).join(' ');
    console.log('Page', i, 'text:', text);
  }
})();
