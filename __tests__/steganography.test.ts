import {
    embedDataInGenericFile,
    extractDataFromGenericFile,
  } from '@/lib/steganography';
  
  // Note: Testing the PNG LSB steganography functions (embedDataInPng, extractDataFromPng)
  // is complex in a JSDOM/Node environment because they rely on the HTML Canvas API,
  // which is not fully implemented. Doing so would require heavy mocking or a full
  // browser testing environment (like Playwright or Cypress).
  //
  // For this suite, we will focus on the generic file steganography functions,
  // which operate on ArrayBuffers and Blobs and are environment-agnostic.
  
  describe('SteganoGuard Generic File Steganography', () => {
    it('should embed and then extract data correctly from a generic file', async () => {
      // 1. Create mock cover file and data to embed
      const coverFileContent = 'This is the original file content.';
      const coverFileBlob = new Blob([coverFileContent], { type: 'text/plain' });
      const coverFile = new File([coverFileBlob], 'original.txt');
  
      const secretDataContent = JSON.stringify({ message: 'this is a secret' });
      const secretDataBuffer = new TextEncoder().encode(secretDataContent).buffer;
  
      // 2. Embed the data
      const stegoBlob = await embedDataInGenericFile(coverFile, secretDataBuffer);
      const stegoFile = new File([stegoBlob], 'stego-file.txt');
  
      // 3. Verify the new file is larger than the original
      expect(stegoBlob.size).toBeGreaterThan(coverFileBlob.size);
  
      // 4. Extract the data
      const extractedBuffer = await extractDataFromGenericFile(stegoFile);
  
      // 5. Verify the extracted data matches the original secret data
      expect(extractedBuffer.byteLength).toBe(secretDataBuffer.byteLength);
      const extractedText = new TextDecoder().decode(extractedBuffer);
      expect(extractedText).toBe(secretDataContent);
    });
  
    it('should throw an error when trying to extract from a file without a valid marker', async () => {
      const invalidFileContent = 'This is just a regular file without any hidden data.';
      const invalidFileBlob = new Blob([invalidFileContent], { type: 'text/plain' });
      const invalidFile = new File([invalidFileBlob], 'invalid.txt');
  
      await expect(extractDataFromGenericFile(invalidFile)).rejects.toThrow(
        'Steganographic marker not found. This does not appear to be a valid SteganoGuard file.'
      );
    });
  
    it('should throw an error if the file is too small to contain data', async () => {
        const smallFileContent = 'small';
        const smallFileBlob = new Blob([smallFileContent], { type: 'text/plain' });
        const smallFile = new File([smallFileBlob], 'small.txt');

        await expect(extractDataFromGenericFile(smallFile)).rejects.toThrow(
            'File is too small to contain steganographic data.'
        );
    });

    it('should throw an error if the data length in the footer is corrupted', async () => {
        // Manually construct a corrupted file
        const coverFileContent = 'This is the original file content.';
        const coverFileBuffer = new TextEncoder().encode(coverFileContent).buffer;
        const secretDataBuffer = new TextEncoder().encode('secret').buffer;
        
        const GENERIC_EOD_MARKER = new Uint8Array([83, 84, 69, 71, 71, 85, 65, 82, 68]); // "STEGGUARD"
        
        // Create a length buffer that claims the data is huge (corrupted)
        const corruptedLengthBuffer = new ArrayBuffer(8);
        new DataView(corruptedLengthBuffer).setBigUint64(0, BigInt(999999), false);

        const corruptedBlob = new Blob([
            coverFileBuffer,
            secretDataBuffer,
            GENERIC_EOD_MARKER,
            corruptedLengthBuffer
        ]);
        const corruptedFile = new File([corruptedBlob], 'corrupted.txt');

        await expect(extractDataFromGenericFile(corruptedFile)).rejects.toThrow(
            'Invalid data length in file footer. The file may be a a corrupt.'
        );
    });
  });
  