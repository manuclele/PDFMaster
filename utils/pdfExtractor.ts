import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDFJS_VERSION = '5.5.207';
const CDN_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

// Set worker source using CDN for better compatibility in production/installed apps
pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN_URL}/legacy/build/pdf.worker.min.mjs`;

export async function extractTextFromPdf(file: File): Promise<{ page: number, text: string }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ 
    data: arrayBuffer,
    standardFontDataUrl: `${CDN_URL}/standard_fonts/`,
    cMapUrl: `${CDN_URL}/cmaps/`,
    cMapPacked: true,
    disableFontFace: false,
    useWorkerFetch: false,
  }).promise;
  const numPages = pdf.numPages;
  const pagesText = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ');
    pagesText.push({ page: i, text });
  }

  return pagesText;
}
