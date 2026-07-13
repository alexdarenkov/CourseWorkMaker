import { defineConfig } from 'vitest/config'

// happy-dom: renderAll/paginate используют document и localStorage (assets.ts).
// Реальную раскладку страниц (offsetHeight) jsdom-среды не считают — вёрстка
// проверяется dev-харнессом preview-test.html в настоящем Chrome.
export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
})
