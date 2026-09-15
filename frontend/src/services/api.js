export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export const apiUrl = (path) => `${API_BASE_URL}${path}`;

export const assetUrl = (path) => {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
};
