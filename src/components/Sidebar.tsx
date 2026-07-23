"use client";

import { useState } from "react";
import Avatar from "./Avatar";
import Logo from "./Logo";
import type { CurrentUser, SerializedChannel, SerializedUser } from "./chat-types";

type Props = {
  currentUser: CurrentUser;
  channels: SerializedChannel[];
  dms: SerializedChannel[];
  activeChannelId: string | null;
  online: SerializedUser[];
  unread: Record<string, number>;
  open: boolean;
  onSelectChannel: (channel: SerializedChannel) => void;
  onStartDm: (userId: string) => void;
  onNewChannel: () => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onLogout: (scope: "current" | "all") => void;
};

export default function Sidebar({
  currentUser,
  channels,
  dms,
  activeChannelId,
  online,
  unread,
  open,
  onSelectChannel,
  onStartDm,
  onNewChannel,
  onOpenSearch,
  onClose,
  onLogout,
}: Props) {
  const onlineIds = new Set(online.map((u) => u.id));
  const [menuOpen, setMenuOpen] = useState(false);

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

        {/* Search */}
        <div className="px-2 pt-3">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex w-full items-center gap-2 rounded-md border border-rule bg-paper px-2.5 py-1.5 text-sm text-ink-3 hover:border-rule-2 hover:text-ink-2"
          >
            <SearchIcon />
            <span>Search messages…</span>
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

          {/* Direct messages */}
          <div className="mb-1 mt-6 px-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Direct messages
            </span>
          </div>
          <ul className="space-y-0.5">
            {dms.length === 0 && (
              <li className="px-2 py-1 text-xs text-ink-3">
                Pick someone below to start a DM.
              </li>
            )}
            {dms.map((dm) => {
              const isActive = dm.id === activeChannelId;
              const count = unread[dm.id] ?? 0;
              const partnerOnline = dm.partner ? onlineIds.has(dm.partner.id) : false;
              return (
                <li key={dm.id}>
                  <button
                    type="button"
                    data-testid="dm-item"
                    onClick={() => onSelectChannel(dm)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-commons-soft font-medium text-commons-strong"
                        : "text-ink-2 hover:bg-paper-3 hover:text-ink"
                    }`}
                  >
                    {dm.partner && (
                      <Avatar
                        name={dm.partner.displayName}
                        color={dm.partner.avatarColor}
                        size={20}
                        online={partnerOnline}
                      />
                    )}
                    <span className="truncate">{dm.name}</span>
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
            {online.map((user) => {
              const isSelf = user.id === currentUser.id;
              const inner = (
                <>
                  <Avatar
                    name={user.displayName}
                    color={user.avatarColor}
                    size={22}
                    online
                  />
                  <span className="truncate">
                    {user.displayName}
                    {isSelf && <span className="text-ink-3"> (you)</span>}
                  </span>
                </>
              );
              return (
                <li key={user.id}>
                  {isSelf ? (
                    <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink-2">
                      {inner}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartDm(user.id)}
                      title={`Message ${user.displayName}`}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-ink-2 hover:bg-paper-3 hover:text-ink"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              title="Account"
            >
              <LogoutIcon />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-50 mb-1 w-52 overflow-hidden rounded-md border border-rule bg-paper-2 py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout("current");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper-3"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout("all");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper-3"
                  >
                    Sign out of all devices
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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
