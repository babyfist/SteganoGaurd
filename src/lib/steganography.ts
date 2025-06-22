
const EOD_MARKER = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]); // 8-byte end-of-data marker

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getContext(img: HTMLImageElement): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  return ctx;
}

export async function embedDataInImage(imageFile: File, dataToEmbed: ArrayBuffer): Promise<string> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;
  
  const dataLength = dataToEmbed.byteLength;
  const fullPayload = new Uint8Array(dataLength + EOD_MARKER.length);
  fullPayload.set(new Uint8Array(dataToEmbed), 0);
  fullPayload.set(EOD_MARKER, dataLength);

  const requiredPixels = 1 + Math.ceil((fullPayload.length * 8) / 3);
  const maxPixels = pixels.length / 4;
  
  if (requiredPixels > maxPixels) {
    throw new Error(`Image is too small. Needs space for ${requiredPixels} pixels, but has only ${maxPixels}.`);
  }
  
  // Use 32 bits (4 bytes) for length, stored in the first pixel's RGBA channels
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, dataLength, false); // false for big-endian
  const lengthBytes = new Uint8Array(view.buffer);
  
  pixels[0] = lengthBytes[0];
  pixels[1] = lengthBytes[1];
  pixels[2] = lengthBytes[2];
  pixels[3] = lengthBytes[3];
  
  let pixelIndex = 4;
  let bitIndex = 0;

  for (let i = 0; i < fullPayload.length; i++) {
    const byte = fullPayload[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte >> (7 - j)) & 1;
      const channelIndex = bitIndex % 3;
      
      // Ensure pixel is opaque before modifying to avoid alpha premultiplication issues
      pixels[pixelIndex + 3] = 255;
      pixels[pixelIndex + channelIndex] = (pixels[pixelIndex + channelIndex] & 0xFE) | bit;
      
      bitIndex++;
      
      if (bitIndex % 3 === 0) {
        pixelIndex += 4;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}

export async function extractDataFromImage(imageFile: File): Promise<ArrayBuffer> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  // Extract 32-bit length from the first pixel's RGBA values
  const lengthBytes = new Uint8Array([pixels[0], pixels[1], pixels[2], pixels[3]]);
  const view = new DataView(lengthBytes.buffer);
  const dataLength = view.getUint32(0, false); // false for big-endian

  const maxStorableBytes = Math.floor(((pixels.length / 4) - 1) * 3 / 8);

  if (dataLength === 0 || isNaN(dataLength) || dataLength > maxStorableBytes ) {
    throw new Error("No data length found in image header or data is corrupted.");
  }
  
  const totalBitsToExtract = (dataLength + EOD_MARKER.length) * 8;
  const extractedBits: number[] = [];
  let pixelIndex = 4;
  
  while (extractedBits.length < totalBitsToExtract) {
      if (pixelIndex >= pixels.length) {
          throw new Error("Extraction error: Reached end of image data unexpectedly.");
      }
      for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
          if (extractedBits.length < totalBitsToExtract) {
              extractedBits.push(pixels[pixelIndex + channelIndex] & 1);
          }
      }
      pixelIndex += 4;
  }

  const allBytes: number[] = [];
  for (let i = 0; i < extractedBits.length; i += 8) {
    if (i + 8 <= extractedBits.length) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | extractedBits[i + j];
      }
      allBytes.push(byte);
    }
  }

  const extractedBytes = new Uint8Array(allBytes);
  const eodIndex = dataLength;
  const foundEod = extractedBytes.slice(eodIndex, eodIndex + EOD_MARKER.length);
  
  if (!EOD_MARKER.every((val, i) => val === foundEod[i])) {
    throw new Error("End-of-data marker not found or corrupted. Data is likely invalid.");
  }

  return extractedBytes.slice(0, dataLength).buffer;
}
