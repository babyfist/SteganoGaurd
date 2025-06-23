
const PNG_BOD_MARKER = new Uint8Array([83, 71, 71, 68]); // "SGGD" - StegoGuard Guard Data
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
  const fullPayload = new Uint8Array(PNG_BOD_MARKER.length + dataLength + PNG_EOD_MARKER.length);
  fullPayload.set(PNG_BOD_MARKER, 0);
  fullPayload.set(new Uint8Array(dataToEmbed), PNG_BOD_MARKER.length);
  fullPayload.set(PNG_EOD_MARKER, PNG_BOD_MARKER.length + dataLength);

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

// Helper function to extract bits from image
function extractBitsFromImage(pixels: Uint8ClampedArray, startPixel: number, numBits: number): number[] | null {
    const extractedBits: number[] = [];
    let payloadPixelIndexOffset = startPixel * 4;
    let payloadBitIndex = 0;

    while (extractedBits.length < numBits) {
        const currentPixelIndex = payloadPixelIndexOffset + (Math.floor(payloadBitIndex / 3) * 4);
        if (currentPixelIndex >= pixels.length) {
            return null; // Not enough pixels
        }
        const channelIndex = payloadBitIndex % 3;
        extractedBits.push(pixels[currentPixelIndex + channelIndex] & 1);
        payloadBitIndex++;
    }
    return extractedBits;
}

// Helper to convert bits to bytes
function bitsToBytes(bits: number[]): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        if (i + 8 <= bits.length) {
            let byte = 0;
            for (let j = 0; j < 8; j++) {
                byte = (byte << 1) | bits[i + j];
            }
            bytes.push(byte);
        }
    }
    return new Uint8Array(bytes);
}

export async function extractDataFromPng(imageFile: File): Promise<ArrayBuffer> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  const HEADER_PIXELS = 11;
  
  // 1. Extract Length
  const lengthBits = extractBitsFromImage(pixels, 0, 32);
  if (!lengthBits) {
      throw new Error("Image is too small to contain a header.");
  }
  let dataLength = 0;
  for(let i = 0; i < 32; i++) {
      dataLength = (dataLength << 1) | lengthBits[i];
  }

  const maxStorableBytes = Math.floor((pixels.length / 4 - HEADER_PIXELS) * 3 / 8);
  if (dataLength <= 0 || isNaN(dataLength) || dataLength > maxStorableBytes) {
      throw new Error("No valid SteganoGuard data found in image header.");
  }

  // 2. Try New Format (BOD + data + EOD)
  const newFormatPayloadLength = PNG_BOD_MARKER.length + dataLength + PNG_EOD_MARKER.length;
  const newFormatBits = extractBitsFromImage(pixels, HEADER_PIXELS, newFormatPayloadLength * 8);

  if (newFormatBits) {
      const newBytes = bitsToBytes(newFormatBits);
      const foundBod = newBytes.slice(0, PNG_BOD_MARKER.length);
      if (PNG_BOD_MARKER.every((val, i) => val === foundBod[i])) {
          const eodIndex = PNG_BOD_MARKER.length + dataLength;
          const foundEod = newBytes.slice(eodIndex, eodIndex + PNG_EOD_MARKER.length);
          if (PNG_EOD_MARKER.every((val, i) => val === foundEod[i])) {
              return newBytes.slice(PNG_BOD_MARKER.length, eodIndex).buffer;
          }
      }
  }
  
  // 3. Try Old Format (data + EOD)
  const oldFormatPayloadLength = dataLength + PNG_EOD_MARKER.length;
  const oldFormatBits = extractBitsFromImage(pixels, HEADER_PIXELS, oldFormatPayloadLength * 8);

  if (oldFormatBits) {
      const oldBytes = bitsToBytes(oldFormatBits);
      const eodIndex = dataLength;
      const foundEod = oldBytes.slice(eodIndex, eodIndex + PNG_EOD_MARKER.length);
      if (PNG_EOD_MARKER.every((val, i) => val === foundEod[i])) {
          return oldBytes.slice(0, eodIndex).buffer;
      }
  }

  // 4. If neither worked
  throw new Error("Could not find a valid SteganoGuard message. The file may be corrupt or not encoded.");
}


// --- Generic File Steganography (Appending) Functions ---

export async function embedDataInGenericFile(coverFile: File, dataToEmbed: ArrayBuffer): Promise<Blob> {
  const coverFileBuffer = await coverFile.arrayBuffer();
  
  const dataLength = dataToEmbed.byteLength;
  const dataLengthBuffer = new ArrayBuffer(8); // 64-bit integer for length
  new DataView(dataLengthBuffer).setBigUint64(0, BigInt(dataLength), false); // Use BigUint64, network byte order

  // Appended data will be: [cover][data][marker][length]
  const newFileBlob = new Blob([
    coverFileBuffer,
    dataToEmbed,
    GENERIC_EOD_MARKER,
    dataLengthBuffer,
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

    // Structure at end of file: ...[DATA][MARKER][LENGTH]
    const lengthStart = stegoFileBuffer.byteLength - lengthMarkerLength;
    const markerStart = lengthStart - eodMarkerLength;

    const lengthData = stegoFileBuffer.slice(lengthStart);
    const potentialEodMarker = new Uint8Array(stegoFileBuffer.slice(markerStart, lengthStart));

    if (!GENERIC_EOD_MARKER.every((val, i) => val === potentialEodMarker[i])) {
        throw new Error("Steganographic marker not found. This does not appear to be a valid SteganoGuard file.");
    }

    const lengthView = new DataView(lengthData);
    const dataLength = Number(lengthView.getBigUint64(0, false)); // Big-endian

    const dataEnd = markerStart;
    const dataStart = dataEnd - dataLength;

    if (dataStart < 0) {
        throw new Error("Invalid data length in file footer. The file may be corrupt.");
    }

    const extractedData = stegoFileBuffer.slice(dataStart, dataEnd);
    return extractedData;
}
