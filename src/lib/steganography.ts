'use client';

/**
 * @fileoverview This file contains all steganography functions for the application.
 * It handles embedding and extracting hidden data from both PNG images (using LSB) and other file types (by appending data).
 * 
 * Steganography Formats:
 * 
 * 1. PNG Least-Significant Bit (LSB):
 *    - A 32-bit header storing the length of the hidden data is embedded in the first 11 pixels.
 *    - The payload is then embedded, consisting of:
 *      - A 4-byte "Beginning of Data" marker: "SGGD" (StegoGuard Guard Data).
 *      - The actual data (e.g., encrypted JSON payload).
 *      - An 8-byte "End of Data" marker for validation.
 *    - This method is robust and resilient to simple image manipulations.
 * 
 * 2. Generic File Appending:
 *    - For non-image files, the data is appended to the end of the original file.
 *    - The appended structure is:
 *      - The actual data.
 *      - A 9-byte "End of Data" marker: "STEGGUARD".
 *      - An 8-byte (64-bit) value indicating the length of the hidden data.
 *    - This allows for hiding data in any file type without corrupting the original file content.
 */

const PNG_BOD_MARKER = new Uint8Array([83, 71, 71, 68]); // "SGGD" - StegoGuard Guard Data
const PNG_EOD_MARKER = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]); // 8-byte end-of-data marker for PNG LSB
const GENERIC_EOD_MARKER = new Uint8Array([83, 84, 69, 71, 71, 85, 65, 82, 68]); // "STEGGUARD"

// --- PNG LSB Steganography Functions ---

/** Defines the options for applying a visible watermark to an image. */
type StampOptions = {
    text: string;
    font: string;
    size: number;
};

/**
 * Loads an image file into an HTMLImageElement.
 * @param {File} file - The image file to load.
 * @returns {Promise<HTMLImageElement>} A promise that resolves with the loaded image element.
 */
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

/**
 * Creates a 2D canvas context and draws an image onto it.
 * @param {HTMLImageElement} img - The image to draw.
 * @returns {CanvasRenderingContext2D} The 2D rendering context with the image drawn.
 */
function getContext(img: HTMLImageElement): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  return ctx;
}

/**
 * Embeds a data payload into a PNG image using the Least-Significant Bit (LSB) technique.
 * @param {File} imageFile - The cover image file. Any standard image format is accepted and will be converted to PNG.
 * @param {ArrayBuffer} dataToEmbed - The data to hide within the image.
 * @param {StampOptions} [stampOptions] - Optional settings for applying a visible watermark.
 * @returns {Promise<string>} A promise that resolves to a data URL of the new PNG image with the embedded data.
 * @throws {Error} if the image is too small to hold the data.
 */
export async function embedDataInPng(
    imageFile: File, 
    dataToEmbed: ArrayBuffer,
    stampOptions?: StampOptions
): Promise<string> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);

  // Apply the visible watermark if options are provided.
  if (stampOptions) {
    ctx.font = `${stampOptions.size}px "${stampOptions.font}"`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const padding = stampOptions.size > 16 ? stampOptions.size : 20;
    ctx.fillText(stampOptions.text, img.width - padding, img.height - padding);
  }

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;
  
  // Construct the full payload with markers.
  const dataLength = dataToEmbed.byteLength;
  const fullPayload = new Uint8Array(PNG_BOD_MARKER.length + dataLength + PNG_EOD_MARKER.length);
  fullPayload.set(PNG_BOD_MARKER, 0);
  fullPayload.set(new Uint8Array(dataToEmbed), PNG_BOD_MARKER.length);
  fullPayload.set(PNG_EOD_MARKER, PNG_BOD_MARKER.length + dataLength);

  // Check if the image has enough capacity.
  const HEADER_PIXELS = 11; // 11 pixels * 3 channels/pixel = 33 bits, enough for a 32-bit length header.
  const requiredPixels = HEADER_PIXELS + Math.ceil((fullPayload.length * 8) / 3);
  const maxPixels = pixels.length / 4;
  if (requiredPixels > maxPixels) {
    throw new Error(`Image is too small. Needs space for ${requiredPixels} pixels, but has only ${maxPixels}.`);
  }
  
  // Embed the 32-bit data length header.
  let headerBitIndex = 0;
  for (let i = 0; i < 32; i++) {
    const bit = (dataLength >> (31 - i)) & 1;
    const pixelIndex = Math.floor(headerBitIndex / 3) * 4;
    const channelIndex = headerBitIndex % 3;
    pixels[pixelIndex + 3] = 255; // Ensure alpha is opaque
    pixels[pixelIndex + channelIndex] = (pixels[pixelIndex + channelIndex] & 0xFE) | bit;
    headerBitIndex++;
  }
  
  // Embed the main payload (BOD marker + data + EOD marker).
  let payloadPixelIndex = HEADER_PIXELS * 4;
  let payloadBitIndex = 0;
  for (let i = 0; i < fullPayload.length; i++) {
    const byte = fullPayload[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte >> (7 - j)) & 1;
      const currentPixelIndex = payloadPixelIndex + (Math.floor(payloadBitIndex / 3) * 4);
      const channelIndex = payloadBitIndex % 3;
      pixels[currentPixelIndex + 3] = 255; // Ensure alpha is opaque
      pixels[currentPixelIndex + channelIndex] = (pixels[currentPixelIndex + channelIndex] & 0xFE) | bit;
      payloadBitIndex++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}

/**
 * Extracts a specified number of bits from image pixel data.
 * @param {Uint8ClampedArray} pixels - The raw pixel data from a canvas.
 * @param {number} startPixel - The pixel index to start extraction from.
 * @param {number} numBits - The number of bits to extract.
 * @returns {number[] | null} An array of bits, or null if there aren't enough pixels.
 */
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

/**
 * Converts an array of bits into a Uint8Array.
 * @param {number[]} bits - The array of bits to convert.
 * @returns {Uint8Array} The resulting byte array.
 */
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

/**
 * Extracts hidden data from a PNG image file.
 * This function is backward-compatible and can read both old and new data formats.
 * @param {File} imageFile - The steganographic image file.
 * @returns {Promise<ArrayBuffer>} A promise that resolves to the extracted data.
 * @throws {Error} if no valid data is found or the file is corrupt.
 */
export async function extractDataFromPng(imageFile: File): Promise<ArrayBuffer> {
  const img = await loadImage(imageFile);
  const ctx = getContext(img);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  const HEADER_PIXELS = 11;
  
  // 1. Extract the 32-bit length header.
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

  // 2. Try to extract using the NEW format (with BOD marker).
  const newFormatPayloadLength = PNG_BOD_MARKER.length + dataLength + PNG_EOD_MARKER.length;
  const newFormatBits = extractBitsFromImage(pixels, HEADER_PIXELS, newFormatPayloadLength * 8);
  if (newFormatBits) {
      const newBytes = bitsToBytes(newFormatBits);
      const foundBod = newBytes.slice(0, PNG_BOD_MARKER.length);
      if (PNG_BOD_MARKER.every((val, i) => val === foundBod[i])) {
          const eodIndex = PNG_BOD_MARKER.length + dataLength;
          const foundEod = newBytes.slice(eodIndex, eodIndex + PNG_EOD_MARKER.length);
          if (PNG_EOD_MARKER.every((val, i) => val === foundEod[i])) {
              // Success with new format.
              return newBytes.slice(PNG_BOD_MARKER.length, eodIndex).buffer;
          }
      }
  }
  
  // 3. If new format fails, FALLBACK to OLD format (without BOD marker) for backward compatibility.
  const oldFormatPayloadLength = dataLength + PNG_EOD_MARKER.length;
  const oldFormatBits = extractBitsFromImage(pixels, HEADER_PIXELS, oldFormatPayloadLength * 8);
  if (oldFormatBits) {
      const oldBytes = bitsToBytes(oldFormatBits);
      const eodIndex = dataLength;
      const foundEod = oldBytes.slice(eodIndex, eodIndex + PNG_EOD_MARKER.length);
      if (PNG_EOD_MARKER.every((val, i) => val === foundEod[i])) {
          // Success with old format.
          return oldBytes.slice(0, eodIndex).buffer;
      }
  }

  // 4. If both fail, throw an error.
  throw new Error("Could not find a valid SteganoGuard message. The file may be corrupt or not encoded.");
}


// --- Generic File Steganography (Appending) Functions ---

/**
 * Embeds data into a generic file by appending it to the end.
 * @param {File} coverFile - The file to hide data in.
 * @param {ArrayBuffer} dataToEmbed - The data to embed.
 * @returns {Promise<Blob>} A promise that resolves to a new Blob containing the original file + appended data.
 */
export async function embedDataInGenericFile(coverFile: File, dataToEmbed: ArrayBuffer): Promise<Blob> {
  const coverFileBuffer = await coverFile.arrayBuffer();
  
  // Create an 8-byte buffer to store the length of the data.
  const dataLength = dataToEmbed.byteLength;
  const dataLengthBuffer = new ArrayBuffer(8);
  new DataView(dataLengthBuffer).setBigUint64(0, BigInt(dataLength), false); // Big-endian

  // Combine the original file, data, EOD marker, and length marker.
  const newFileBlob = new Blob([
    coverFileBuffer,
    dataToEmbed,
    GENERIC_EOD_MARKER,
    dataLengthBuffer,
  ]);

  return newFileBlob;
}

/**
 * Extracts data that was appended to a generic file.
 * @param {File} stegoFile - The file containing the hidden data.
 * @returns {Promise<ArrayBuffer>} A promise that resolves to the extracted data.
 * @throws {Error} if the file is not a valid SteganoGuard file or is corrupt.
 */
export async function extractDataFromGenericFile(stegoFile: File): Promise<ArrayBuffer> {
    const stegoFileBuffer = await stegoFile.arrayBuffer();
    const eodMarkerLength = GENERIC_EOD_MARKER.length;
    const lengthMarkerLength = 8;
    const footerLength = eodMarkerLength + lengthMarkerLength;

    if (stegoFileBuffer.byteLength < footerLength) {
        throw new Error("File is too small to contain steganographic data.");
    }

    // Find the footer components from the end of the file.
    const lengthStart = stegoFileBuffer.byteLength - lengthMarkerLength;
    const markerStart = lengthStart - eodMarkerLength;

    const lengthData = stegoFileBuffer.slice(lengthStart);
    const potentialEodMarker = new Uint8Array(stegoFileBuffer.slice(markerStart, lengthStart));

    // Verify the end-of-data marker.
    if (!GENERIC_EOD_MARKER.every((val, i) => val === potentialEodMarker[i])) {
        throw new Error("Steganographic marker not found. This does not appear to be a valid SteganoGuard file.");
    }

    // Read the data length from the last 8 bytes.
    const lengthView = new DataView(lengthData);
    const dataLength = Number(lengthView.getBigUint64(0, false));

    // Calculate the start and end positions of the hidden data.
    const dataEnd = markerStart;
    const dataStart = dataEnd - dataLength;

    if (dataStart < 0) {
        throw new Error("Invalid data length in file footer. The file may be corrupt.");
    }

    const extractedData = stegoFileBuffer.slice(dataStart, dataEnd);
    return extractedData;
}
