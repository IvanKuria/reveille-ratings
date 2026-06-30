import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  // WxtVitest wires up the `@/` alias, auto-imports, and a fake-browser
  // environment so unit tests can import modules that reference WXT globals.
  plugins: [WxtVitest()],
  test: {
    // Only our hand-written unit tests; never crawl node_modules / .output.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
