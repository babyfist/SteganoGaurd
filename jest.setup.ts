import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { Crypto } from '@peculiar/webcrypto';

// JSDOM does not include TextEncoder/TextDecoder, so we polyfill them from Node's util module.
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// JSDOM does not include the Web Crypto API. We polyfill it using @peculiar/webcrypto.
// This allows us to test our cryptographic functions in a Node.js environment.
global.crypto = new Crypto();
