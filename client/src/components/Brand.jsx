export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1" y="7" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="17" y="7" width="10" height="14" rx="2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
      <path d="M11 14h6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export default function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <BrandMark />
      CourseBridge
    </span>
  )
}
