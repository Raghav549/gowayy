import { client } from './client';

const MAX_BYTES = 2_500_000;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Reads a browser File and sends it to the shared upload endpoint as base64.
 * Validation happens twice: here for fast feedback and again on the server
 * (mime allow-list, size limit, magic-byte sniffing).
 */
export async function uploadImageFile(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image');
  if (file.size > MAX_BYTES) throw new Error('Images must be 2.5 MB or smaller');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
  const [, mimeType = file.type, dataBase64 = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
  const result = await client.uploadImage?.({ dataBase64, mimeType });
  const url = (result as { url?: string } | undefined)?.url;
  if (!url) throw new Error('Upload did not return an image URL');
  return url;
}
