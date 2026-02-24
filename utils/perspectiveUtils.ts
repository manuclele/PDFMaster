import { Point } from '../types';

/**
 * Solves a system of linear equations using Gaussian elimination.
 */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const tmpA = A[maxRow];
    A[maxRow] = A[i];
    A[i] = tmpA;
    const tmpB = b[maxRow];
    b[maxRow] = b[i];
    b[i] = tmpB;

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  // Solve equation Ax=b for an upper triangular matrix A
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      b[k] -= A[k][i] * x[i];
    }
  }
  return x;
}

/**
 * Calculates the homography matrix that maps points from (src) to (dst).
 * The matrix is returned as an array of 9 values [a, b, c, d, e, f, g, h, 1].
 */
export function getHomography(src: Point[], dst: Point[]): number[] {
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
  return [...res, 1];
}

/**
 * Warps an image using a homography matrix.
 */
export async function warpPerspective(
  image: HTMLImageElement,
  srcPoints: Point[],
  destWidth: number,
  destHeight: number
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = destWidth;
  canvas.height = destHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // We need the inverse homography to map each pixel in the destination back to the source
  const destPoints: Point[] = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ];

  // Map dest -> src
  const h = getHomography(destPoints, srcPoints);

  // Use a temporary canvas to get image data
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return null;
  tempCtx.drawImage(image, 0, 0);
  const srcData = tempCtx.getImageData(0, 0, image.width, image.height);
  const dstData = ctx.createImageData(destWidth, destHeight);

  for (let y = 0; y < destHeight; y++) {
    for (let x = 0; x < destWidth; x++) {
      const z = h[6] * x + h[7] * y + h[8];
      const srcX = (h[0] * x + h[1] * y + h[2]) / z;
      const srcY = (h[3] * x + h[4] * y + h[5]) / z;

      if (srcX >= 0 && srcX < image.width - 1 && srcY >= 0 && srcY < image.height - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const dx = srcX - x0;
        const dy = srcY - y0;

        const idx00 = (y0 * image.width + x0) * 4;
        const idx01 = (y0 * image.width + x1) * 4;
        const idx10 = (y1 * image.width + x0) * 4;
        const idx11 = (y1 * image.width + x1) * 4;

        for (let i = 0; i < 4; i++) {
          const val = 
            srcData.data[idx00 + i] * (1 - dx) * (1 - dy) +
            srcData.data[idx01 + i] * dx * (1 - dy) +
            srcData.data[idx10 + i] * (1 - dx) * dy +
            srcData.data[idx11 + i] * dx * dy;
          dstData.data[(y * destWidth + x) * 4 + i] = val;
        }
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
  });
}
