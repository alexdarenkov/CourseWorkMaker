import { CodeIcon, DiagramIcon, GearIcon, IconButton, ImageIcon, MathIcon, MinusIcon, PlusIcon, TableIcon } from 'md2docx-frontend'

/** Ровно тот тулбар, что стоит над редактором в приложении. */
export function Toolbar() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <IconButton title="Вставить изображение" onClick={() => {}}>
        <ImageIcon />
      </IconButton>
      <IconButton title="Вставить таблицу" onClick={() => {}}>
        <TableIcon />
      </IconButton>
      <IconButton title="Вставить блок кода" onClick={() => {}}>
        <CodeIcon />
      </IconButton>
      <IconButton title="Вставить схему" onClick={() => {}}>
        <DiagramIcon />
      </IconButton>
      <IconButton title="Вставить формулу" onClick={() => {}}>
        <MathIcon />
      </IconButton>
      <IconButton title="Настройки" onClick={() => {}}>
        <GearIcon size={16} />
      </IconButton>
    </div>
  )
}

/** Компактный размер — как в тулбаре превью (зум и настройки страницы). */
export function Compact() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <IconButton title="Уменьшить" onClick={() => {}} size={28} hoverBg="var(--hover-2)">
        <MinusIcon />
      </IconButton>
      <IconButton title="Увеличить" onClick={() => {}} size={28} hoverBg="var(--hover-2)">
        <PlusIcon />
      </IconButton>
    </div>
  )
}
