import { TextField } from 'md2docx-frontend'
import { useState } from 'react'

/** Поле входа — как на странице авторизации. */
export function Email() {
  const [v, setV] = useState('')
  return (
    <TextField
      label="Электронная почта"
      type="email"
      placeholder="you@university.ru"
      value={v}
      onChange={(e) => setV(e.target.value)}
    />
  )
}

/** Поле пароля с ограничением длины — регистрация. */
export function Password() {
  const [v, setV] = useState('')
  return (
    <TextField
      label="Пароль"
      type="password"
      placeholder="Минимум 8 символов"
      value={v}
      onChange={(e) => setV(e.target.value)}
    />
  )
}
