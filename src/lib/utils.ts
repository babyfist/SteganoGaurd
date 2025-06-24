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
