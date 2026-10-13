/** Logo: an origin claim branching into variants. */
export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="brand-mark">
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFF1C2" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFF1C2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="8" cy="16" r="7" fill="url(#bm-glow)" />
      <path d="M8 16 C 14 16, 15 7, 23 6.5" stroke="#56D8FF" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M8 16 C 14 16, 16 16, 25 16" stroke="#B98CFF" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M8 16 C 14 16, 15 25, 21 26" stroke="#FF5A76" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M21 26 C 24 26, 26 23.5, 28 23" stroke="#FF6FD8" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="8" cy="16" r="3.4" fill="#FFF1C2" />
      <circle cx="23" cy="6.5" r="2.4" fill="#56D8FF" />
      <circle cx="25" cy="16" r="2.4" fill="#B98CFF" />
      <circle cx="21" cy="26" r="2.4" fill="#FF5A76" />
      <circle cx="28" cy="23" r="1.7" fill="#FF6FD8" />
    </svg>
  );
}
