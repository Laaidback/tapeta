import { fitSize } from './layout.js';

// Decodes a picked file into a 2D canvas, longer side at most 2000 px.
// The browser applies EXIF orientation; do not rotate by hand.
// Rejects when the file is not a decodable image.
export async function loadImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}
