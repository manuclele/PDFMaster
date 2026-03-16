import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDFJS_VERSION = '5.5.207';
const CDN_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN_URL}/legacy/build/pdf.worker.min.mjs`;

export async function extractTextFromPdf(file: File): Promise<{ page: number, text: string }[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      standardFontDataUrl: `${CDN_URL}/standard_fonts/`,
      cMapUrl: `${CDN_URL}/cmaps/`,
      cMapPacked: true,
      disableFontFace: false,
      useWorkerFetch: false,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pagesText = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');
      pagesText.push({ page: i, text });
    }

    return pagesText;
  } catch (error: any) {
    console.error('Detailed PDF Error:', error);
    // Create a diagnostic message
    const diagnostic = {
      message: error.message || 'Unknown PDF error',
      name: error.name,
      details: error.details || 'No extra details',
      url: `${CDN_URL}/standard_fonts/`
    };
    throw new Error(`DIAGNOSTIC_ERROR: ${JSON.stringify(diagnostic)}`);
  }
}
