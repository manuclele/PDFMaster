export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  type: 'pdf' | 'image';
  rotation?: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
  error: string | null;
}

export type ViewMode = 'merge' | 'split';
