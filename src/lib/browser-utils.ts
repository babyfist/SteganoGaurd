
'use client';

/**
 * @fileoverview This file contains browser-specific utility functions.
 * It should only be imported dynamically on the client side where browser APIs like `document` are available.
 */

/**
 * Triggers a browser download for a given JSON object.
 * Creates a temporary anchor element and simulates a click to start the download.
 * @param {object | object[]} data - The JSON object or array to be downloaded.
 * @param {string} filename - The desired filename for the downloaded file (e.g., 'data.json').
 */
export function downloadJson(data: object | object[], filename: string) {
    if (typeof window === 'undefined') {
        console.error("downloadJson can only be called on the client side.");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
