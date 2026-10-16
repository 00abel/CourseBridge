// components/Brand.jsx: the CourseBridge logo and name.

export function BridgeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 17c2.5-6 5.5-8.5 9-8.5s6.5 2.5 9 8.5" />
      <path d="M2 17h20M7.5 17v-4M12 17v-7M16.5 17v-4" />
    </svg>
  )
}

export default function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="brand-mark"><BridgeIcon /></span>
      CourseBridge
    </span>
  )
}
