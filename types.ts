export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
  error: string | null;
}

export type ViewMode = 'merge' | 'split';
