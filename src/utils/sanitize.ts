// src/core/utils/sanitize.ts

/**
 * Remove any path‐separator sequences or illegal characters
 * to prevent directory traversal or weird S3 keys.
 */
export function sanitizeFileName(name: string): string {
  return (
    name
      // strip any "../" sequences
      .replace(/(\.\.[/\\])/g, '')
      // remove any control or invalid filesystem chars
      .replace(/[<>:"|?*\x00-\x1F]/g, '')
      // no leading slashes
      .replace(/^[/\\]+/, '')
      // no trailing slashes
      .replace(/[/\\]+$/, '')
  );
}
