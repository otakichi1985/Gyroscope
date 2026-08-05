import type { SVGProps } from "react";

// Shared thin-stroke icon set, matching the style already used for the
// minimize/close glyphs in TitleBar.tsx -- replaces emoji/text glyphs
// elsewhere in the app so the whole UI reads as one consistent icon system
// instead of mixing emoji (OS/font-dependent look) with vector icons.
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </Icon>
  );
}

// A plain clock reads as "time/schedule", not "history" -- adding a
// counter-clockwise sweep with an arrowhead (the same device browsers use
// for their history icon) is what actually signals "past activity".
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5a5.5 5.5 0 1 1 -4.53 8.62" />
      <path d="M2.2 6.2 3.4 8.4 5.6 7.2" />
      <path d="M8 5v3.2l2.2 1.3" />
    </Icon>
  );
}

// The classic RSS/feed glyph (bottom-left dot + two concentric quarter
// arcs) -- used for the feed-management button instead of a generic gear,
// which reads as "settings" and collides with the appearance-settings icon.
export function RssIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 7a6 6 0 0 1 6 6" />
      <path d="M3 3a10 10 0 0 1 10 10" />
    </Icon>
  );
}

// A paint palette (outline + a few color dots) reads more directly as
// "appearance/look" than a generic sliders icon, which is easily mistaken
// for an equalizer or unrelated preferences.
export function PaletteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 8.2c0-3.1 2.7-5.7 6.2-5.7 3.3 0 5.8 2.3 5.8 4.9 0 2.1-1.5 3.1-3 2.9-.8-.1-1.4.5-1.1 1.2.3.8-.3 1.5-1.1 1.5-3.8 0-6.8-2.1-6.8-4.8Z" />
      <circle cx="4.8" cy="7.6" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="5.4" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="5" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="11.4" cy="6.8" r="0.85" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.5h10" />
      <path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M4.5 4.5 5 13a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8.5" />
      <path d="M6.5 7v4" />
      <path d="M9.5 7v4" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11V7a4 4 0 0 1 8 0v4l1.25 1.75H2.75L4 11Z" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    </Icon>
  );
}

export function BellOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11V7c0-.86.22-1.63.6-2.28M6.2 3.35A4 4 0 0 1 12 7v4l1.25 1.75H4.75" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
      <line x1="2.5" y1="2.5" x2="13.5" y2="13.5" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8A5 5 0 1 1 11.5 4.3" />
      <path d="M13 2.5V5.5H10" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5 14 13H2L8 2.5Z" />
      <line x1="8" y1="6.5" x2="8" y2="9.5" />
      <circle cx="8" cy="11.25" r="0.1" fill="currentColor" stroke="currentColor" strokeWidth={0.75} />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5 8 10.5 12 6.5" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6.8" cy="6.8" r="4.3" />
      <line x1="10" y1="10" x2="13.5" y2="13.5" />
    </Icon>
  );
}

// Same diagonal-slash device as BellOffIcon, over a simple landscape-photo
// glyph -- used as the placeholder for thumbnails/favicons when "外部画像を
// 読み込まない" is on (SettingsOverlay.tsx), so the blocked slot still reads
// as "an image was here" rather than a blank/broken box.
export function ImageOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="6" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <path d="M3 11.5 7 8l2 1.8L11 7.5l2 2" />
      <line x1="2.5" y1="2.5" x2="13.5" y2="13.5" />
    </Icon>
  );
}

// A thumbtack -- used for the "位置を固定" quick-access toggle
// (FilterBar.tsx). Head as a filled circle + a downward tip, tilted
// slightly so it reads as a pin being pushed in rather than a plain lollipop.
export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="5.5" r="3" />
      <path d="M6 8.3 3 13.5" />
    </Icon>
  );
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M8 2.5 9.85 6.3l4.15.6-3 2.93.71 4.13L8 11.95l-3.71 1.95.71-4.13-3-2.93 4.15-.6L8 2.5Z" />
    </Icon>
  );
}
