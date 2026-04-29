import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { UploadedFile, OptimizationLevel } from '../types';

// Configure pdfjs worker
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export const mergePdfs = async (
  files: UploadedFile[], 
  optimization: OptimizationLevel = 'none'
): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();
  const isOptimizing = optimization !== 'none';
  
  // Settings based on level
  let maxDim = 2000;
  let quality = 0.8;
  let shouldReencode = false;
  
  if (optimization === 'minimum') {
    maxDim = 2500;
    quality = 0.9;
    shouldReencode = false;
  } else if (optimization === 'recommended') {
    maxDim = 1600;
    quality = 0.7;
    shouldReencode = true;
  } else if (optimization === 'maximum') {
    maxDim = 1200;
    quality = 0.5;
    shouldReencode = true;
  }

  for (const uploadedFile of files) {
    try {
      const arrayBuffer = await uploadedFile.file.arrayBuffer();
      
      if (uploadedFile.type === 'pdf') {
        if (shouldReencode) {
          try {
            const loadingTask = pdfjs.getDocument({ 
              data: arrayBuffer,
              useSystemFonts: true,
              disableFontFace: false
            });
            const pdf = await loadingTask.promise;
            
            for (let i = 1; i <= pdf.numPages; i++) {
              try {
                const page = await pdf.getPage(i);
                // Use a reasonable scale for initial render
                const viewport = page.getViewport({ scale: 1.5 });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;
                
                let width = viewport.width;
                let height = viewport.height;
                
                // Downscale if exceeds maxDim
                if (width > maxDim || height > maxDim) {
                  const ratio = width / height;
                  if (width > height) {
                    width = maxDim;
                    height = maxDim / ratio;
                  } else {
                    height = maxDim;
                    width = maxDim * ratio;
                  }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const renderContext = {
                  canvasContext: ctx,
                  viewport: page.getViewport({ scale: width / viewport.width * 1.5 }),
                };
                
                // @ts-ignore
                await page.render(renderContext).promise;
                
                const imgData = canvas.toDataURL('image/jpeg', quality);
                const response = await fetch(imgData);
                const resBuffer = await response.arrayBuffer();
                const image = await mergedPdf.embedJpg(resBuffer);
                
                const newPage = mergedPdf.addPage([image.width, image.height]);
                newPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
              } catch (pageErr) {
                console.error(`Error rendering page ${i}:`, pageErr);
                // Fallback to standard copy if rendering fails
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdfDoc, [i-1]);
                copiedPages.forEach(p => mergedPdf.addPage(p));
              }
            }
          } catch (pdfErr) {
            console.error('Error in deep optimization, falling back to standard:', pdfErr);
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(p => mergedPdf.addPage(p));
          }
        } else {
          // Standard merge
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
      } else {
        // Handle images
        let imageData = arrayBuffer;
        
        if (isOptimizing) {
          try {
            const img = new Image();
            const url = URL.createObjectURL(uploadedFile.file);
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = url;
            });
            URL.revokeObjectURL(url);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                const ratio = width / height;
                if (width > height) {
                  width = maxDim;
                  height = maxDim / ratio;
                } else {
                  height = maxDim;
                  width = maxDim * ratio;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              
              const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
              const response = await fetch(compressedDataUrl);
              imageData = await response.arrayBuffer();
            }
          } catch (err) {
            console.error('Failed to compress image:', err);
          }
        }

        let image;
        if (isOptimizing || uploadedFile.file.type === 'image/jpeg' || uploadedFile.file.type === 'image/jpg') {
          image = await mergedPdf.embedJpg(imageData);
        } else if (uploadedFile.file.type === 'image/png') {
          image = await mergedPdf.embedPng(imageData);
        } else {
          continue;
        }

        const page = mergedPdf.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
    } catch (loopErr) {
      console.error(`Error processing file ${uploadedFile.name}:`, loopErr);
    }
  }

  // Final structure optimization
  const mergedPdfBytes = await mergedPdf.save({
    useObjectStreams: isOptimizing
  });
  
  return mergedPdfBytes;
};

export const createPdfBlob = (bytes: Uint8Array): string => {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};
