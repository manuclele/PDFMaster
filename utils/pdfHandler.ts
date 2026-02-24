import { PDFDocument } from 'pdf-lib';
import { UploadedFile } from '../types';

export const mergePdfs = async (files: UploadedFile[]): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();

  for (const uploadedFile of files) {
    const arrayBuffer = await uploadedFile.file.arrayBuffer();
    
    if (uploadedFile.type === 'pdf') {
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else {
      // Handle Image
      let image;
      if (uploadedFile.file.type === 'image/jpeg' || uploadedFile.file.type === 'image/jpg') {
        image = await mergedPdf.embedJpg(arrayBuffer);
      } else if (uploadedFile.file.type === 'image/png') {
        image = await mergedPdf.embedPng(arrayBuffer);
      } else {
        // Fallback for other images if possible, or skip
        continue;
      }

      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
      
      // Apply rotation if any (simplified, as we might want to rotate the page instead)
      if (uploadedFile.rotation) {
        // In pdf-lib, rotation is in degrees. 
        // We might need to adjust page dimensions if rotating 90/270
      }
    }
  }

  const mergedPdfBytes = await mergedPdf.save();
  return mergedPdfBytes;
};

export const createPdfBlob = (bytes: Uint8Array): string => {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};
