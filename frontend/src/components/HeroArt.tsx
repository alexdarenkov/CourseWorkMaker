/**
 * Иллюстрация главной страницы: плоский «бумажный коллаж» в палитре приложения
 * (веер страниц, граф знаний, круги, строки текста, спич-бабл, точки).
 * Все заливки — от CSS-переменных, поэтому композиция живёт в обеих темах.
 */
export function HeroArt({ width = 440 }: { width?: number }) {
  const tan1 = 'color-mix(in srgb, var(--warm) 22%, var(--surface))'
  const tan2 = 'color-mix(in srgb, var(--warm) 42%, var(--surface))'
  const tan3 = 'color-mix(in srgb, var(--warm) 62%, var(--surface))'

  return (
    <svg
      width={width}
      viewBox="0 0 480 440"
      fill="none"
      aria-hidden
      style={{ display: 'block' }}
    >
      <defs>
        {/* Лепесток-страница: веер собирается поворотами вокруг корешка */}
        <path id="hero-leaf" d="M250 342 C 158 316, 92 234, 106 128 C 186 168, 240 250, 250 342 Z" />
      </defs>

      {/* Большие подложки-круги */}
      <circle cx="248" cy="218" r="172" fill={tan1} opacity="0.85" />
      <path d="M248 46 A172 172 0 0 1 248 390 Z" fill={tan2} opacity="0.55" />
      {/* Терракотовый овал */}
      <ellipse cx="330" cy="196" rx="72" ry="92" fill="#d97757" opacity="0.9" />
      {/* Полукруг снизу слева */}
      <path d="M48 342 A104 104 0 0 1 256 342 Z" fill={tan2} opacity="0.8" />

      {/* Веер страниц */}
      <use href="#hero-leaf" fill={tan3} />
      <use href="#hero-leaf" fill="var(--surface)" transform="rotate(17 250 342)" />
      <use href="#hero-leaf" fill={tan2} transform="rotate(34 250 342)" />
      <use href="#hero-leaf" fill="var(--surface)" transform="rotate(51 250 342)" />
      <use href="#hero-leaf" fill={tan3} transform="rotate(68 250 342)" />

      {/* Граф «знаний» сверху */}
      <g stroke="var(--muted)" strokeWidth="1.2">
        <line x1="250" y1="40" x2="294" y2="62" />
        <line x1="294" y1="62" x2="294" y2="104" />
        <line x1="294" y1="104" x2="250" y2="126" />
        <line x1="250" y1="126" x2="206" y2="104" />
        <line x1="206" y1="104" x2="206" y2="62" />
        <line x1="206" y1="62" x2="250" y2="40" />
        <line x1="206" y1="62" x2="294" y2="104" strokeDasharray="1 4" />
        <line x1="294" y1="62" x2="206" y2="104" strokeDasharray="1 4" />
        <line x1="250" y1="40" x2="250" y2="126" strokeDasharray="1 4" />
      </g>
      <line
        x1="250" y1="126" x2="250" y2="212"
        stroke="var(--muted)" strokeWidth="1.4" strokeDasharray="2 6"
      />
      <circle cx="250" cy="40" r="7" fill={tan2} />
      <circle cx="294" cy="62" r="6" fill="#d97757" />
      <circle cx="294" cy="104" r="6" fill={tan3} />
      <circle cx="250" cy="126" r="7" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.2" />
      <circle cx="206" cy="104" r="6" fill={tan2} />
      <circle cx="206" cy="62" r="6" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.2" />
      <circle cx="250" cy="83" r="5" fill="#d97757" />

      {/* Спич-бабл слева */}
      <g>
        <rect x="34" y="88" width="86" height="58" rx="12" fill="#d97757" opacity="0.92" />
        <path d="M74 146 L64 166 L94 146 Z" fill="#d97757" opacity="0.92" />
        <g stroke="var(--paper)" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          <line x1="48" y1="104" x2="106" y2="104" />
          <line x1="48" y1="116" x2="106" y2="116" />
          <line x1="48" y1="128" x2="88" y2="128" />
        </g>
      </g>

      {/* Строки «текста» справа */}
      <g fill="var(--muted)" opacity="0.75">
        {[
          [376, 128, 72], [368, 140, 88], [380, 152, 62], [368, 164, 80],
          [376, 176, 54], [368, 188, 84], [382, 200, 46],
        ].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height="3.2" rx="1.6" />
        ))}
      </g>

      {/* Точечная сетка снизу справа */}
      <g fill="var(--warm)" opacity="0.65">
        {Array.from({ length: 5 }).flatMap((_, r) =>
          Array.from({ length: 6 }).map((_, c) => (
            <circle key={`${r}-${c}`} cx={392 + c * 14} cy={318 + r * 14} r="2.1" />
          )),
        )}
      </g>

      {/* Кольцо и точка-акцент внизу слева */}
      <circle cx="52" cy="404" r="26" stroke={tan2} strokeWidth="9" fill="none" opacity="0.8" />
      <circle cx="104" cy="416" r="10" fill="#d97757" opacity="0.85" />
    </svg>
  )
}
