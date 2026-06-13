import { Route, Routes } from 'react-router-dom'
import { AuthPage } from './pages/AuthPage'
import { EditorPage } from './pages/EditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EditorPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="*" element={<EditorPage />} />
    </Routes>
  )
}
