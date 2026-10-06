import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'

// Главной странице не нужны Mermaid, KaTeX и движок пагинации.
const EditorPage = lazy(() => import('./pages/EditorPage').then(module => ({ default: module.EditorPage })))

export default function App() {
  return (
    <Suspense fallback={<div role="status" className="p-6">Загружаем редактор…</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Suspense>
  )
}
