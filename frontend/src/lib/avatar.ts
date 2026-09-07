/** Аватар пользователя (дизайн v2): инициалы + спокойный градиент из двух
 *  оттенков, детерминированно вычисляемых по имени (hash → hue). */

export function initialsOf(name: string): string {
  return (
    (name || 'U')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'
  )
}

export function avatarGradient(name: string): string {
  const str = name || 'A'
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const hue = ((h % 360) + 360) % 360
  const hue2 = (hue + 42) % 360
  return `linear-gradient(135deg, hsl(${hue} 72% 62%), hsl(${hue2} 68% 54%))`
}
