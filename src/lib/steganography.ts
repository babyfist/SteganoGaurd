
'use client';

/**
 * @fileoverview This file contains all steganography functions for the application.
 * It handles embedding and extracting hidden data from both PNG images (using LSB) and other file types (by appending data).
 * All functions are client-side only and use browser APIs.
 */

// A magic sequence of bytes to identify the start of our hidden data in generic files.
const MAGIC_HEADER = new Uint8Array([0x53, 0x47, 0x44, 0x41, 0x54, 0x41]); // "SGDATA"

/**
 * Converts a File object to a data URL string.
 * @param file The file to convert.
 * @returns A promise that resolves with the data URL.
 */
function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Converts a File object to an ArrayBuffer.
 * @param file The file to convert.
 * @returns A promise that resolves with the ArrayBuffer.
 */
function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Embeds data into a PNG image using the Least Significant Bit (LSB) technique.
 * @param imageFile The original PNG image file.
 * @param dataToEmbed The data to hide, as an ArrayBuffer.
 * @param stampOptions Optional settings for a visible watermark.
 * @returns A promise that resolves to a data URL for the new steganographic image.
 */
export async function embedDataInPng(imageFile: File, dataToEmbed: ArrayBuffer, stampOptions?: { text: string, font: string, size: number }): Promise<string> {
    if (typeof window === 'undefined') throw new Error("Canvas operations can only be done in the browser.");

    const imageUrl = await fileToDataUrl(imageFile);
    const image = new Image();
    image.src = imageUrl;

    return new Promise((resolve, reject) => {
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context.'));

            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);

            // Apply watermark if requested
            if (stampOptions && stampOptions.text) {
                ctx.font = `${stampOptions.size}px ${stampOptions.font}`;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(stampOptions.text, canvas.width - 10, canvas.height - 10);
            }

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;

            // Prepend the data length (as 4 bytes) to the data itself
            const dataLength = dataToEmbed.byteLength;
            const dataLengthBytes = new Uint8Array(4);
            new DataView(dataLengthBytes.buffer).setUint32(0, dataLength, false); // Big-endian
            const dataWithLength = new Uint8Array(4 + dataLength);
            dataWithLength.set(dataLengthBytes, 0);
            dataWithLength.set(new Uint8Array(dataToEmbed), 4);
            
            const totalBitsToEmbed = dataWithLength.length * 8;
            if (totalBitsToEmbed > (pixels.length / 4 * 3)) { // Only use R,G,B channels
                return reject(new Error('Image is too small to hold the data.'));
            }

            let dataIndex = 0;
            let bitIndex = 0;

            for (let i = 0; i < pixels.length; i++) {
                if (dataIndex >= dataWithLength.length) break;

                // We only use the R, G, B channels, skipping the Alpha channel (i % 4 !== 3)
                if (i % 4 !== 3) {
                    const byte = dataWithLength[dataIndex];
                    const bit = (byte >> (7 - bitIndex)) & 1;
                    
                    pixels[i] = (pixels[i] & 0xFE) | bit;

                    bitIndex++;
                    if (bitIndex === 8) {
                        bitIndex = 0;
                        dataIndex++;
                    }
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error("Failed to load image for steganography."));
    });
}

/**
 * Extracts data hidden in a PNG image using LSB.
 * @param imageFile The steganographic PNG file.
 * @returns A promise that resolves to the hidden data as an ArrayBuffer.
 */
export async function extractDataFromPng(imageFile: File): Promise<ArrayBuffer> {
    if (typeof window === 'undefined') throw new Error("Canvas operations can only be done in the browser.");

    const imageUrl = await fileToDataUrl(imageFile);
    const image = new Image();
    image.src = imageUrl;

    return new Promise((resolve, reject) => {
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context.'));

            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            
            // First, extract the 32 bits for the length
            const lengthBits: number[] = [];
            let lastIndexForLength = 0;
            for (let i = 0; i < pixels.length; i++) {
                if (i % 4 !== 3) { // Skip alpha channel
                    lengthBits.push(pixels[i] & 1);
                }
                if (lengthBits.length >= 32) {
                    lastIndexForLength = i + 1; // The next bit will be at this index
                    break;
                }
            }

            if (lengthBits.length < 32) {
                return reject(new Error('Image is too small to contain data length.'));
            }

            let dataLength = 0;
            for (let i = 0; i < 32; i++) {
                dataLength = (dataLength << 1) | lengthBits[i];
            }

            if (dataLength <= 0 || dataLength > (pixels.length / 4 * 3)) {
                 return reject(new Error('No valid data length found in image.'));
            }

            const totalBitsToExtract = dataLength * 8;
            const bits: number[] = [];
            
            // Start extracting from where the length data ended
            for (let i = lastIndexForLength; i < pixels.length; i++) {
                if (bits.length >= totalBitsToExtract) break;

                if (i % 4 !== 3) { // Skip alpha channel
                    bits.push(pixels[i] & 1);
                }
            }

            if(bits.length < totalBitsToExtract){
                return reject(new Error('Could not extract full data payload from image. It may be corrupted.'));
            }

            const extractedBytes = new Uint8Array(dataLength);
            for (let i = 0; i < dataLength; i++) {
                let byte = 0;
                for (let j = 0; j < 8; j++) {
                    byte = (byte << 1) | bits[i * 8 + j];
                }
                extractedBytes[i] = byte;
            }

            resolve(extractedBytes.buffer);
        };
        image.onerror = () => reject(new Error("Failed to load image for extraction."));
    });
}

/**
 * Embeds data into a generic file by appending it after a magic header.
 * @param coverFile The original file.
 * @param dataToEmbed The data to hide.
 * @returns A promise that resolves to a new Blob containing the original file and the hidden data.
 */
export async function embedDataInGenericFile(coverFile: File, dataToEmbed: ArrayBuffer): Promise<Blob> {
    const coverBuffer = await fileToArrayBuffer(coverFile);
    
    // Data length (4 bytes) + data itself
    const dataLength = dataToEmbed.byteLength;
    const dataLengthBytes = new Uint8Array(4);
    new DataView(dataLengthBytes.buffer).setUint32(0, dataLength, false);

    const combined = new Uint8Array(coverBuffer.byteLength + MAGIC_HEADER.length + 4 + dataLength);
    combined.set(new Uint8Array(coverBuffer), 0);
    combined.set(MAGIC_HEADER, coverBuffer.byteLength);
    combined.set(dataLengthBytes, coverBuffer.byteLength + MAGIC_HEADER.length);
    combined.set(new Uint8Array(dataToEmbed), coverBuffer.byteLength + MAGIC_HEADER.length + 4);

    return new Blob([combined], { type: coverFile.type });
}


/**
 * Extracts data from a generic file that was appended after a magic header.
 * @param stegoFile The file containing the hidden data.
 * @returns A promise that resolves to the hidden data as an ArrayBuffer.
 */
export async function extractDataFromGenericFile(stegoFile: File): Promise<ArrayBuffer> {
    const stegoBuffer = await fileToArrayBuffer(stegoFile);
    const stegoBytes = new Uint8Array(stegoBuffer);

    // Search for the magic header from the end of the file
    for (let i = stegoBytes.length - MAGIC_HEADER.length; i >= 0; i--) {
        const slice = stegoBytes.subarray(i, i + MAGIC_HEADER.length);
        let found = true;
        for (let j = 0; j < MAGIC_HEADER.length; j++) {
            if (slice[j] !== MAGIC_HEADER[j]) {
                found = false;
                break;
            }
        }
        
        if (found) {
            const dataLengthStart = i + MAGIC_HEADER.length;
            if (dataLengthStart + 4 > stegoBytes.length) continue; // Not enough room for length

            const dataLength = new DataView(stegoBuffer).getUint32(dataLengthStart, false);
            const dataStart = dataLengthStart + 4;

            if(dataStart + dataLength > stegoBytes.length) continue; // Not enough room for data

            return stegoBuffer.slice(dataStart, dataStart + dataLength);
        }
    }

    throw new Error('Magic header not found in file.');
}
