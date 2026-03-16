import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { SplitPlan } from '../services/geminiService';

export async function splitAndDownloadPdf(file: File, splitPlans: SplitPlan[]) {
  const arrayBuffer = await file.arrayBuffer();
  const originalPdf = await PDFDocument.load(arrayBuffer);
  
  const zip = new JSZip();

  for (const plan of splitPlans) {
    const newPdf = await PDFDocument.create();
    
    // Pages in pdf-lib are 0-indexed, but our plan is 1-indexed
    const startIdx = plan.startPage - 1;
    const endIdx = plan.endPage - 1;
    
    const pagesToCopy = [];
    for (let i = startIdx; i <= endIdx; i++) {
      if (i >= 0 && i < originalPdf.getPageCount()) {
        pagesToCopy.push(i);
      }
    }

    if (pagesToCopy.length > 0) {
      const copiedPages = await newPdf.copyPages(originalPdf, pagesToCopy);
      copiedPages.forEach(page => newPdf.addPage(page));
      
      const pdfBytes = await newPdf.save();
      
      // Sanitize filename
      const safeName = plan.name.replace(/[^a-z0-9 ]/gi, '').trim() || `document_${startIdx + 1}`;
      zip.file(`${safeName}.pdf`, pdfBytes);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, 'split_documents.zip');
}
