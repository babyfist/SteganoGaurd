
const SIGNATURE_LENGTH_BYTES = 64; // Ed25519 signatures are 64 bytes
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

export async function embedDataInImage(imageFile: File, dataToEmbed: ArrayBuffer, signature: ArrayBuffer): Promise<string> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;
  
  const combinedData = new Uint8Array(dataToEmbed.byteLength + signature.byteLength);
  combinedData.set(new Uint8Array(dataToEmbed), 0);
  combinedData.set(new Uint8Array(signature), dataToEmbed.byteLength);

  const dataLength = combinedData.length;
  // +1 for length header, then space for data and EOD marker
  const requiredPixels = 1 + Math.ceil(((dataLength + EOD_MARKER.length) * 8) / 3);
  const maxPixels = pixels.length / 4;
  
  if (requiredPixels > maxPixels) {
    throw new Error(`Image is too small. Needs space for ${requiredPixels} pixels, but has only ${maxPixels}.`);
  }
  
  // 1. Embed data length in the first pixel's RGB channels
  pixels[0] = (dataLength >> 16) & 0xFF;
  pixels[1] = (dataLength >> 8) & 0xFF;
  pixels[2] = dataLength & 0xFF;
  
  // 2. Embed data and EOD marker
  const fullPayload = new Uint8Array(dataLength + EOD_MARKER.length);
  fullPayload.set(combinedData, 0);
  fullPayload.set(EOD_MARKER, dataLength);

  let pixelIndex = 4; // Start from the second pixel
  let bitIndex = 0;

  for (let i = 0; i < fullPayload.length; i++) {
    const byte = fullPayload[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte >> (7 - j)) & 1;
      const channelIndex = bitIndex % 3; // Use R, G, B channels
      
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

export async function extractDataFromImage(imageFile: File): Promise<{ data: ArrayBuffer, signature: ArrayBuffer }> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  // 1. Extract data length from the first pixel
  const dataLength = (pixels[0] << 16) | (pixels[1] << 8) | pixels[2];

  if (dataLength === 0 || isNaN(dataLength) || dataLength > pixels.length) {
    throw new Error("No data length found in image header or data is corrupted.");
  }
  
  const totalBitsToExtract = (dataLength + EOD_MARKER.length) * 8;
  
  // 2. Extract data bits
  const extractedBits: number[] = [];
  let pixelIndex = 4; // Start from the second pixel
  
  while (extractedBits.length < totalBitsToExtract) {
      if (pixelIndex >= pixels.length) {
          throw new Error("Extraction error: Reached end of image data unexpectedly.");
      }
      for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
          if (extractedBits.length < totalBitsToExtract) {
              const bit = pixels[pixelIndex + channelIndex] & 1;
              extractedBits.push(bit);
          }
      }
      pixelIndex += 4;
  }

  // 3. Reconstruct bytes
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

  // 4. Verify EOD marker
  const eodIndex = dataLength;
  const foundEod = extractedBytes.slice(eodIndex, eodIndex + EOD_MARKER.length);
  
  let eodMatch = EOD_MARKER.every((val, i) => val === foundEod[i]);

  if (!eodMatch) {
    throw new Error("End-of-data marker not found or corrupted. Data is likely invalid.");
  }

  // 5. Separate data and signature
  const mainDataLength = dataLength - SIGNATURE_LENGTH_BYTES;
  if(mainDataLength < 0) {
      throw new Error("Invalid data length, not enough space for a signature.");
  }
  const extractedDataBuffer = extractedBytes.slice(0, mainDataLength).buffer;
  const signatureBuffer = extractedBytes.slice(mainDataLength, dataLength).buffer;

  if (signatureBuffer.byteLength !== SIGNATURE_LENGTH_BYTES) {
      throw new Error(`Extracted signature has incorrect length. Expected ${SIGNATURE_LENGTH_BYTES}, got ${signatureBuffer.byteLength}.`);
  }

  return { data: extractedDataBuffer, signature: signatureBuffer };
}
