import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Stock Chart Extractor',
    description: 'Extract chart data and drawing tools from FireAnt.',
    version: '0.1.0',
    permissions: [
      'storage',
      'activeTab',
      'sidePanel',
    ],
    host_permissions: [
      'https://fireant.vn/*',
      'https://*.fireant.vn/*',
    ],
  },
});
