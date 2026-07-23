// Minimal Commons mark: two overlapping "gathering" bubbles on a rounded tile.
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill="var(--commons)" />
      <circle cx="13" cy="15" r="6" fill="white" fillOpacity="0.95" />
      <circle cx="20" cy="17" r="6" fill="white" fillOpacity="0.55" />
    </svg>
  );
}
