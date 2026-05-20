const CREATURES = [
  { body: '#f5c842', belly: '#fff0bf', cheek: '#e3000b', accent: '#08080f', horn: '#f5c842' },
  { body: '#4fc3f7', belly: '#e6fbff', cheek: '#7b23d2', accent: '#101827', horn: '#f5f6fa' },
  { body: '#22c55e', belly: '#d9ffe9', cheek: '#f5c842', accent: '#082014', horn: '#72dd9b' },
  { body: '#ff7a36', belly: '#ffe6cf', cheek: '#e3000b', accent: '#1f1210', horn: '#f5c842' },
  { body: '#ce93d8', belly: '#fff0ff', cheek: '#f5c842', accent: '#160b20', horn: '#f5f6fa' },
  { body: '#f5f6fa', belly: '#dce6f7', cheek: '#4fc3f7', accent: '#08080f', horn: '#f5c842' },
]

export default function CollectorAvatar({
  avatarId,
  username = 'Collector',
  className = 'h-10 w-10',
}) {
  const numericId = Math.max(0, Number(avatarId) || 0)
  const creature = CREATURES[numericId % CREATURES.length]
  const tilt = ((numericId % 5) - 2) * 4

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 ${className}`}
      style={{
        background: `radial-gradient(circle at 42% 34%, ${creature.body}33, transparent 42%), linear-gradient(145deg, #14101d, #08080f)`,
      }}
      role="img"
      aria-label={`${username} avatar`}
      title={username}
    >
      <span className="absolute bottom-[13%] h-[64%] w-[68%] rounded-[48%_48%_42%_42%] border-2 border-black/80" style={{ background: creature.body, transform: `rotate(${tilt}deg)` }} />
      <span className="absolute left-[22%] top-[14%] h-[33%] w-[18%] -rotate-[27deg] rounded-[70%_70%_25%_25%] border-2 border-black/80" style={{ background: creature.horn }} />
      <span className="absolute right-[21%] top-[14%] h-[33%] w-[18%] rotate-[27deg] rounded-[70%_70%_25%_25%] border-2 border-black/80" style={{ background: creature.horn }} />
      <span className="absolute bottom-[13%] h-[28%] w-[44%] rounded-[50%_50%_42%_42%]" style={{ background: creature.belly }} />
      <span className="absolute left-[32%] top-[43%] h-[10%] w-[10%] rounded-full" style={{ background: creature.accent }} />
      <span className="absolute right-[32%] top-[43%] h-[10%] w-[10%] rounded-full" style={{ background: creature.accent }} />
      <span className="absolute left-[27%] top-[54%] h-[12%] w-[14%] rounded-full opacity-90" style={{ background: creature.cheek }} />
      <span className="absolute right-[27%] top-[54%] h-[12%] w-[14%] rounded-full opacity-90" style={{ background: creature.cheek }} />
      <span className="absolute top-[59%] h-[8%] w-[18%] rounded-b-full border-b-2" style={{ borderColor: creature.accent }} />
    </div>
  )
}
