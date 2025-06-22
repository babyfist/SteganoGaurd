
const PNG_EOD_MARKER = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]); // 8-byte end-of-data marker for PNG LSB
const GENERIC_EOD_MARKER = new Uint8Array([83, 84, 69, 71, 71, 85, 65, 82, 68]); // "STEGGUARD"

// --- PNG LSB Steganography Functions ---

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

export async function embedDataInPng(imageFile: File, dataToEmbed: ArrayBuffer): Promise<string> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;
  
  const dataLength = dataToEmbed.byteLength;
  const fullPayload = new Uint8Array(dataLength + PNG_EOD_MARKER.length);
  fullPayload.set(new Uint8Array(dataToEmbed), 0);
  fullPayload.set(PNG_EOD_MARKER, dataLength);

  // Use LSB of 11 pixels for 32-bit length header (11 pixels * 3 channels/pixel = 33 bits available)
  const HEADER_PIXELS = 11;
  const requiredPixels = HEADER_PIXELS + Math.ceil((fullPayload.length * 8) / 3);
  const maxPixels = pixels.length / 4;
  
  if (requiredPixels > maxPixels) {
    throw new Error(`Image is too small. Needs space for ${requiredPixels} pixels, but has only ${maxPixels}.`);
  }
  
  // Embed 32-bit dataLength into the LSBs of the first 11 pixels' RGB channels
  let headerBitIndex = 0;
  for (let i = 0; i < 32; i++) {
    const bit = (dataLength >> (31 - i)) & 1; // Get bit from MSB to LSB
    const pixelIndex = Math.floor(headerBitIndex / 3) * 4;
    const channelIndex = headerBitIndex % 3;

    pixels[pixelIndex + 3] = 255; // Ensure pixel is opaque to avoid premultiplied alpha issues
    pixels[pixelIndex + channelIndex] = (pixels[pixelIndex + channelIndex] & 0xFE) | bit;
    headerBitIndex++;
  }
  
  // Embed payload starting after the header
  let payloadPixelIndex = HEADER_PIXELS * 4;
  let payloadBitIndex = 0;

  for (let i = 0; i < fullPayload.length; i++) {
    const byte = fullPayload[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte >> (7 - j)) & 1;
      const currentPixelIndex = payloadPixelIndex + (Math.floor(payloadBitIndex / 3) * 4);
      const channelIndex = payloadBitIndex % 3;
      
      pixels[currentPixelIndex + 3] = 255; // Ensure opacity
      pixels[currentPixelIndex + channelIndex] = (pixels[currentPixelIndex + channelIndex] & 0xFE) | bit;
      
      payloadBitIndex++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}

export async function extractDataFromPng(imageFile: File): Promise<ArrayBuffer> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  const HEADER_PIXELS = 11;
  const maxPixels = pixels.length / 4;

  if (maxPixels < HEADER_PIXELS) {
    throw new Error("Image is too small to contain a header.");
  }

  // Extract 32-bit length from LSBs of first 11 pixels' RGB channels
  let lengthBits: number[] = [];
  let headerBitIndex = 0;
  while(lengthBits.length < 32) {
      const pixelIndex = Math.floor(headerBitIndex / 3) * 4;
      const channelIndex = headerBitIndex % 3;
      lengthBits.push(pixels[pixelIndex + channelIndex] & 1);
      headerBitIndex++;
  }

  let dataLength = 0;
  for(let i = 0; i < 32; i++) {
      dataLength = (dataLength << 1) | lengthBits[i];
  }
  
  const maxStorableBytes = Math.floor((maxPixels - HEADER_PIXELS) * 3 / 8);

  if (dataLength === 0 || isNaN(dataLength) || dataLength > maxStorableBytes ) {
    throw new Error("No data length found in image header or data is corrupted.");
  }
  
  const totalBitsToExtract = (dataLength + PNG_EOD_MARKER.length) * 8;
  const extractedBits: number[] = [];
  let payloadPixelIndexOffset = HEADER_PIXELS * 4;
  let payloadBitIndex = 0;
  
  while (extractedBits.length < totalBitsToExtract) {
      const currentPixelIndex = payloadPixelIndexOffset + (Math.floor(payloadBitIndex / 3) * 4);

      if (currentPixelIndex >= pixels.length) {
          throw new Error("Extraction error: Reached end of image data unexpectedly.");
      }

      const channelIndex = payloadBitIndex % 3;
      extractedBits.push(pixels[currentPixelIndex + channelIndex] & 1);
      payloadBitIndex++;
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
  
  if (eodIndex + PNG_EOD_MARKER.length > extractedBytes.length) {
    throw new Error("End-of-data marker not found. Extracted data is shorter than expected.");
  }

  const foundEod = extractedBytes.slice(eodIndex, eodIndex + PNG_EOD_MARKER.length);
  
  if (!PNG_EOD_MARKER.every((val, i) => val === foundEod[i])) {
    throw new Error("End-of-data marker not found or corrupted. Data is likely invalid.");
  }

  return extractedBytes.slice(0, dataLength).buffer;
}


// --- Generic File Steganography (Appending) Functions ---

export async function embedDataInGenericFile(coverFile: File, dataToEmbed: ArrayBuffer): Promise<Blob> {
  const coverFileBuffer = await coverFile.arrayBuffer();
  
  const dataLength = dataToEmbed.byteLength;
  const dataLengthBuffer = new ArrayBuffer(8); // 64-bit integer for length
  new DataView(dataLengthBuffer).setBigUint64(0, BigInt(dataLength), false); // Use BigUint64, network byte order

  const newFileBlob = new Blob([
    coverFileBuffer,
    dataToEmbed,
    dataLengthBuffer,
    GENERIC_EOD_MARKER
  ]);

  return newFileBlob;
}

export async function extractDataFromGenericFile(stegoFile: File): Promise<ArrayBuffer> {
    const stegoFileBuffer = await stegoFile.arrayBuffer();
    const eodMarkerLength = GENERIC_EOD_MARKER.length;
    const lengthMarkerLength = 8;
    const footerLength = eodMarkerLength + lengthMarkerLength;

    if (stegoFileBuffer.byteLength < footerLength) {
        throw new Error("File is too small to contain steganographic data.");
    }

    const fileFooter = stegoFileBuffer.slice(-footerLength);
    const potentialEodMarker = new Uint8Array(fileFooter.slice(-eodMarkerLength));

    if (!GENERIC_EOD_MARKER.every((val, i) => val === potentialEodMarker[i])) {
        throw new Error("Steganographic marker not found. This does not appear to be a valid SteganoGuard file.");
    }

    const lengthView = new DataView(fileFooter.slice(0, lengthMarkerLength));
    const dataLength = Number(lengthView.getBigUint64(0, false));

    const dataEnd = stegoFileBuffer.byteLength - footerLength;
    const dataStart = dataEnd - dataLength;

    if (dataStart < 0) {
        throw new Error("Invalid data length in file footer. The file may be corrupt.");
    }

    const extractedData = stegoFileBuffer.slice(dataStart, dataEnd);
    return extractedData;
}
