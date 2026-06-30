import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Reveille Ratings',
    version: '1.0.0',
    description:
      "View Rate My Professors ratings and grade distributions while browsing Texas A&M's public class search.",
    permissions: ['storage', 'sidePanel'],
    action: {},
    host_permissions: [
      'https://howdyportal.tamu.edu/*',
      'https://www.ratemyprofessors.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['icons/app/*.png', 'images/*', 'data/*.json'],
        matches: ['https://howdyportal.tamu.edu/*'],
      },
    ],
    icons: {
      '16': 'icons/app/icon-16.png',
      '48': 'icons/app/icon-48.png',
      '128': 'icons/app/icon-128.png',
    },
  },
});
