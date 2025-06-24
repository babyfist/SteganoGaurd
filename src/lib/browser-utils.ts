'use client';

/**
 * Triggers a browser download for a given JSON object.
 * This file contains browser-specific APIs and should only be imported dynamically on the client.
 * @param {object | object[]} data - The JSON object or array to be downloaded.
 * @param {string} filename - The desired filename for the downloaded file (e.g., 'data.json').
 */
export function downloadJson(data: object | object[], filename: string) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
