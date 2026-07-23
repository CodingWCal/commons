// Deterministic avatar color + initials for a user, so the same person always
// gets the same tile. Palette chosen to read on both light and dark surfaces.
const PALETTE = [
  "#2F6F4F", // commons green
  "#B4532F", // brick
  "#C9962B", // gold
  "#3E6DB5", // blue
  "#7A5AA6", // violet
  "#2E8B8B", // teal
  "#C0504D", // clay
  "#5B8C3E", // moss
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
