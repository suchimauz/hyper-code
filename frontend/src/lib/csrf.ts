/** Cookie-bound CSRF token the server embeds in the shell page (<meta name="csrf-token">); empty when absent. */
export function pageCsrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content?.trim() ?? '';
}
