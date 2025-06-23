import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * A utility function to merge Tailwind CSS classes conditionally.
 * It intelligently combines class names, resolving conflicts gracefully.
 * @param {...ClassValue[]} inputs - A list of class names or conditional class objects.
 * @returns {string} The merged, final class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Triggers a browser download for a given JSON object.
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
