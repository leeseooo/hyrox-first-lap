// GA4 Admin > Data streams > Web > Measurement ID. This is a public ID, not a secret.
// Leave empty to disable all Google Analytics requests.
export const analyticsConfig = {
  measurementId: 'G-1741K0X3GH',
  // Only these hosts send data, so local dev and preview deployments never pollute reports.
  productionHosts: ['hyrox-first-lap.pages.dev'],
  debug: false,
};
