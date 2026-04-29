import { PDFDocument } from 'pdf-lib';
import { UploadedFile } from '../types';

export const mergePdfs = async (files: UploadedFile[], optimize: boolean = false): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();

  for (const uploadedFile of files) {
    const arrayBuffer = await uploadedFile.file.arrayBuffer();
    
    if (uploadedFile.type === 'pdf') {
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else {
      // Handle Image
      let imageData = arrayBuffer;
      
      // If optimize is true, we can try to compress the image before embedding
      if (optimize && (uploadedFile.file.type === 'image/jpeg' || uploadedFile.file.type === 'image/png')) {
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
            // Downscale if very large
            const maxDim = 1500;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = (height / width) * maxDim;
                width = maxDim;
              } else {
                width = (width / height) * maxDim;
                height = maxDim;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const response = await fetch(compressedDataUrl);
            imageData = await response.arrayBuffer();
          }
        } catch (err) {
          console.error('Failed to compress image:', err);
        }
      }

      let image;
      if (optimize || uploadedFile.file.type === 'image/jpeg' || uploadedFile.file.type === 'image/jpg') {
        // If we compressed it, it's now a JPG
        image = await mergedPdf.embedJpg(imageData);
      } else if (uploadedFile.file.type === 'image/png') {
        image = await mergedPdf.embedPng(imageData);
      } else {
        continue;
      }

      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }
  }

  // Optimize if requested
  const mergedPdfBytes = await mergedPdf.save({
    useObjectStreams: optimize,
    addDefaultFont: !optimize,
    updateFieldAppearance: !optimize
  });
  
  return mergedPdfBytes;
};

export const createPdfBlob = (bytes: Uint8Array): string => {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};
