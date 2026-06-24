// Utility to crop an image given pixel crop rectangle from react-easy-crop
// Returns a Blob of the cropped image in JPEG format (quality adjustable)
export async function getCroppedImage(imageSrc: string, crop: { x: number; y: number; width: number; height: number }, rotation = 0, quality = 0.9): Promise<Blob> {
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Set canvas size to crop size
  canvas.width = crop.width;
  canvas.height = crop.height;

  // Translate to ensure rotation around center if rotation !=0
  if (rotation !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', quality);
  });
}
