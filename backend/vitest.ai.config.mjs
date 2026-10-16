import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['ai-tests/**/*.test.js','shared-tests/**/*.test.js'],fileParallelism:false,testTimeout:20000,hookTimeout:30000}});
