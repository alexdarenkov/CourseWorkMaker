/**
 * Синтетический "вход" для design-sync: frontend/ — приложение, а не
 * библиотека компонентов (в package.json нет main/module/exports), поэтому
 * настоящего собранного entry для конвертера нет. Этот файл — единственный
 * повод его существования: реэкспортирует ровно тот набор UI-компонентов,
 * который синхронизируется в Claude Design. Не импортируется приложением.
 */
export * from '../src/components/ui'
export { AppHeader } from '../src/components/AppHeader'
export * from '../src/components/icons'

// Инфраструктурные обёртки — не компоненты дизайн-системы, нужны только как
// cfg.provider для превью AppHeader (использует useNavigate()/useAuth()).
// Исключены из списка компонентов через componentSrcMap: null.
export { BrowserRouter } from 'react-router-dom'
export { AuthProvider } from '../src/auth/AuthContext'
