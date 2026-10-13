import { themeLabel } from '../lib/themes'

export function ThemeTags({ themes }: { themes: string[] }) {
  return (
    <div className="theme-tags">
      {themes.map((t) => (
        <span key={t} className="tag">
          {themeLabel(t)}
        </span>
      ))}
    </div>
  )
}
