import { Route, Routes } from 'react-router-dom'
import { AuthPage } from './pages/AuthPage'
import { CreatePage } from './pages/CreatePage'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
