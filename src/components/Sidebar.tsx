"use client";

import Avatar from "./Avatar";
import Logo from "./Logo";
import type { CurrentUser, SerializedChannel, SerializedUser } from "./chat-types";

type Props = {
  currentUser: CurrentUser;
  channels: SerializedChannel[];
  activeChannelId: string | null;
  online: SerializedUser[];
  onlineIds: Set<string>;
  unread: Record<string, number>;
  status: "connecting" | "live" | "reconnecting";
  open: boolean;
  onSelectChannel: (channel: SerializedChannel) => void;
  onNewChannel: () => void;
  onClose: () => void;
  onLogout: () => void;
};

export default function Sidebar({
  currentUser,
  channels,
  activeChannelId,
  online,
  unread,
  open,
  onSelectChannel,
  onNewChannel,
  onClose,
  onLogout,
}: Props) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-rule bg-paper-2 transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Workspace header */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-rule px-4">
          <Logo size={28} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">
              Commons
            </p>
            <p className="truncate text-xs leading-tight text-ink-3">
              Cursor Boston
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-ink-2 hover:bg-paper-3 lg:hidden"
            aria-label="Close channel list"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
          {/* Channels */}
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Channels
            </span>
            <button
              type="button"
              onClick={onNewChannel}
              className="rounded p-0.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
              aria-label="Create a channel"
              title="Create a channel"
            >
              <PlusIcon />
            </button>
          </div>

          <ul className="space-y-0.5">
            {channels.map((channel) => {
              const isActive = channel.id === activeChannelId;
              const count = unread[channel.id] ?? 0;
              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => onSelectChannel(channel)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-commons-soft font-medium text-commons-strong"
                        : "text-ink-2 hover:bg-paper-3 hover:text-ink"
                    }`}
                  >
                    <span className="text-ink-3">#</span>
                    <span className="truncate">{channel.name}</span>
                    {count > 0 && !isActive && (
                      <span className="ml-auto rounded-full bg-brick px-1.5 text-xs font-semibold text-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Presence */}
          <div className="mb-1 mt-6 px-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Online — {online.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {online.length === 0 && (
              <li className="px-2 py-1 text-xs text-ink-3">No one else is here yet.</li>
            )}
            {online.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink-2"
              >
                <Avatar name={user.displayName} color={user.avatarColor} size={22} online />
                <span className="truncate">
                  {user.displayName}
                  {user.id === currentUser.id && (
                    <span className="text-ink-3"> (you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        {/* User footer */}
        <div className="flex items-center gap-2.5 border-t border-rule px-3 py-3">
          <Avatar
            name={currentUser.displayName}
            color={currentUser.avatarColor}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {currentUser.displayName}
            </p>
            <p className="truncate text-xs text-ink-3">{currentUser.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
