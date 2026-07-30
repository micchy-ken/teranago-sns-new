/**
 * Utility to resolve the API Base URL.
 * In a static hosting environment like GitHub Pages (github.io),
 * there is no backend server running on the same domain to handle relative `/api` paths.
 * In such cases, we direct requests to the real Synology API server.
 */
export const getApiUrl = (path: string): string => {
  if (!path.startsWith('/api')) {
    return path;
  }
  const hostname = window.location.hostname;
  if (hostname.includes('github.io')) {
    return `https://sns.teranago.synology.me${path}`;
  }
  return path;
};
