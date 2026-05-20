export default function AppLoader({ size = 32, className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/dokiedex-mark.svg"
        alt="Loading..."
        className="dokiedex-loader"
        style={{ width: size, height: size, opacity: 0.7 }}
      />
    </div>
  )
}
