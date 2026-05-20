const PALETTES = [
  ['#e3000b', '#f5c842', '#08080f'],
  ['#4fc3f7', '#7b23d2', '#f5f6fa'],
  ['#22c55e', '#f5c842', '#08080f'],
  ['#ff6b35', '#3b82f6', '#f5f6fa'],
  ['#ce93d8', '#e3000b', '#08080f'],
  ['#78909c', '#f5c842', '#f5f6fa'],
]

export default function CollectorAvatar({
  avatarId,
  username = 'Collector',
  className = 'h-10 w-10',
}) {
  const numericId = Math.max(0, Number(avatarId) || 0)
  const palette = PALETTES[numericId % PALETTES.length]
  const rotation = (numericId * 23) % 360
  const offset = (numericId * 11) % 36

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 ${className}`}
      style={{
        background: `linear-gradient(${rotation}deg, ${palette[0]}, ${palette[1]})`,
      }}
      role="img"
      aria-label={`${username} avatar`}
      title={username}
    >
      <span
        className="absolute rounded-full bg-white/85"
        style={{ width: '48%', height: '48%', left: `${12 + offset / 3}%`, top: `${14 + offset / 4}%` }}
      />
      <span
        className="absolute rounded-lg"
        style={{
          width: '58%',
          height: '18%',
          background: palette[2],
          transform: `rotate(${rotation / 4}deg)`,
        }}
      />
      <span
        className="absolute rounded-full border-2 border-white/80"
        style={{ width: '30%', height: '30%', right: '16%', bottom: '14%' }}
      />
    </div>
  )
}
