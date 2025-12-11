import { PDFDocument } from 'pdf-lib';
import { UploadedFile } from '../types';

export const mergePdfs = async (files: UploadedFile[]): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();

  for (const uploadedFile of files) {
    const arrayBuffer = await uploadedFile.file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  return mergedPdfBytes;
};

export const createPdfBlob = (bytes: Uint8Array): string => {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};
