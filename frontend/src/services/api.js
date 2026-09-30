const envApiUrl = import.meta.env.VITE_API_URL;

// In dev mode without VITE_API_URL, default to local backend on port 8000.
// In production deployment (e.g. Vercel), default to "" (same-origin relative paths) so /api/... rewrites work out-of-the-box.
export const API_BASE_URL = (
  envApiUrl !== undefined
    ? envApiUrl
    : (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/$/, '');

export const apiUrl = (path) => `${API_BASE_URL}${path}`;

export const assetUrl = (path) => {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
};
