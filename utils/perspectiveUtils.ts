import { Point } from '../types';

/**
 * Solves a system of linear equations using Gaussian elimination.
 */
/**
 * Solves a system of linear equations using Gaussian elimination with partial pivoting.
 */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(A[j][i]) > Math.abs(A[max][i])) {
        max = j;
      }
    }

    [A[i], A[max]] = [A[max], A[i]];
    [b[i], b[max]] = [b[max], b[i]];

    if (Math.abs(A[i][i]) < 1e-10) return null;

    for (let j = i + 1; j < n; j++) {
      const f = A[j][i] / A[i][i];
      b[j] -= f * b[i];
      for (let k = i; k < n; k++) {
        A[j][k] -= f * A[i][k];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = 0;
    for (let j = i + 1; j < n; j++) {
      s += A[i][j] * x[j];
    }
    x[i] = (b[i] - s) / A[i][i];
  }
  return x;
}

/**
 * Calculates the homography matrix that maps points from (src) to (dst).
 */
export function getHomography(src: Point[], dst: Point[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const res = solve(A, b);
  if (!res) return null;
  return [...res, 1];
}

/**
 * Warps an image using a homography matrix.
 */
export async function warpPerspective(
  image: HTMLImageElement | HTMLCanvasElement,
  srcPoints: Point[],
  destWidth: number,
  destHeight: number
): Promise<Blob | null> {
  // Ensure we have valid dimensions
  const w = Math.max(1, Math.round(destWidth));
  const h = Math.max(1, Math.round(destHeight));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const destPoints: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  // Map dest -> src (inverse mapping)
  const matrix = getHomography(destPoints, srcPoints);
  if (!matrix) return null;

  // Use a temporary canvas to get source image data
  const tempCanvas = document.createElement('canvas');
  const imgWidth = 'naturalWidth' in image ? (image.naturalWidth || image.width) : image.width;
  const imgHeight = 'naturalHeight' in image ? (image.naturalHeight || image.height) : image.height;
  tempCanvas.width = imgWidth;
  tempCanvas.height = imgHeight;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return null;
  tempCtx.drawImage(image, 0, 0);
  
  const srcData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const dstData = ctx.createImageData(w, h);

  const imgW = tempCanvas.width;
  const imgH = tempCanvas.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z = matrix[6] * x + matrix[7] * y + matrix[8];
      const srcX = (matrix[0] * x + matrix[1] * y + matrix[2]) / z;
      const srcY = (matrix[3] * x + matrix[4] * y + matrix[5]) / z;

      if (srcX >= 0 && srcX < imgW - 1 && srcY >= 0 && srcY < imgH - 1) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const dx = srcX - x0;
        const dy = srcY - y0;

        const idx00 = (y0 * imgW + x0) * 4;
        const idx01 = (y0 * imgW + (x0 + 1)) * 4;
        const idx10 = ((y0 + 1) * imgW + x0) * 4;
        const idx11 = ((y0 + 1) * imgW + (x0 + 1)) * 4;

        const outIdx = (y * w + x) * 4;
        for (let i = 0; i < 4; i++) {
          dstData.data[outIdx + i] = 
            srcData.data[idx00 + i] * (1 - dx) * (1 - dy) +
            srcData.data[idx01 + i] * dx * (1 - dy) +
            srcData.data[idx10 + i] * (1 - dx) * dy +
            srcData.data[idx11 + i] * dx * dy;
        }
      } else {
        // Fill with white for out-of-bounds (typical for scans)
        const outIdx = (y * w + x) * 4;
        dstData.data[outIdx] = 255;
        dstData.data[outIdx + 1] = 255;
        dstData.data[outIdx + 2] = 255;
        dstData.data[outIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

