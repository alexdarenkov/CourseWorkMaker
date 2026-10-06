/** Ссылки только из блоков рисунков нашего диалекта: листинги и текст не меняем. */
import { parseMD } from './markdown'

export function imageSources(md: string): string[] {
  return [...new Set(parseMD(md).flatMap(block => block.type === 'figure' ? [block.src] : []))]
}

export function rewriteImageReferences(md: string, replacements: Map<string, string>) {
  const lines = md.split('\n')
  const linked = new Set<string>()
  for (const block of parseMD(md)) {
    if (block.type !== 'figure' || block.line === undefined) continue
    const target = replacements.get(block.src)
    if (!target) continue
    lines[block.line] = lines[block.line].replace(
      /^(\s*!\[[^\]]*\]\()([^)]*)(\)\s*)$/,
      (_all, before, _src, after) => before + target + after,
    )
    linked.add(block.src)
  }
  return { out: lines.join('\n'), linked: linked.size }
}
