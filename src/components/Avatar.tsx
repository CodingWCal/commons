import { initials } from "@/lib/avatar";

type Props = {
  name: string;
  color: string;
  size?: number;
  /** Pass a boolean to show a presence dot; omit to hide it. */
  online?: boolean;
};

export default function Avatar({ name, color, size = 36, online }: Props) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white"
        style={{ backgroundColor: color, fontSize: Math.round(size * 0.4) }}
        aria-hidden
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper-2 ${
            online ? "bg-online" : "bg-ink-3"
          }`}
        />
      )}
    </span>
  );
}
