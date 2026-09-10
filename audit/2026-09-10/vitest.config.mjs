import {fileURLToPath} from 'node:url'
export default {
 root: fileURLToPath(new URL('../../frontend',import.meta.url)),
 test: {globals: true, environment: 'happy-dom', setupFiles: [fileURLToPath(new URL('../../frontend/tests/setup.ts',import.meta.url))], include: [fileURLToPath(new URL('./frontend-repro.test.tsx',import.meta.url))]}
}
