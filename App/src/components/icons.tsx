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
// arcs) -- used for the feed-management button. A gear would collide with the
// settings button's icon, hence the dedicated RSS mark.
export function RssIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 7a6 6 0 0 1 6 6" />
      <path d="M3 3a10 10 0 0 1 10 10" />
    </Icon>
  );
}

// A gear -- the universal "settings" glyph (user request: the settings button
// is the place for everything, so it should read as settings, not "appearance
// only"). Central hub with short teeth radiating outward.
export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 2.3v1.9M8 11.8v1.9M13.7 8h-1.9M4.2 8H2.3" />
      <path d="M12 4 10.7 5.3M5.3 10.7 4 12M12 12l-1.3-1.3M5.3 5.3 4 4" />
    </Icon>
  );
}

// A paint palette (outline + a few color dots) reads more directly as
// "appearance/look" than a generic sliders icon, which is easily mistaken
// for an equalizer or unrelated preferences.
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

// A single shaft with the arrowhead at one end reads as "this direction,
// not the other" more clearly than a two-headed up/down glyph would --
// TimelineToolbar flips it (rotate-180) for the descending state, so one
// icon covers both, the same way ChevronDownIcon does for expand/collapse.
export function SortIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="8" y1="2.5" x2="8" y2="13" />
      <path d="M4.5 9.5 8 13l3.5-3.5" />
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

// Single upward-pointing arrow -- used by the floating scroll-to-top button.
export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="8" y1="13" x2="8" y2="3.5" />
      <path d="M4.5 7 8 3.5 11.5 7" />
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

// A compass -- used for the "探す" tab (DiscoverOverlay.tsx), distinct from
// SearchIcon (the in-timeline article search) since this opens a whole
// screen for finding new *sites*, not filtering the current one.
export function CompassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M10.2 5.8 8.9 8.9 5.8 10.2 7.1 7.1 10.2 5.8Z" />
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

// Reader-view typography control: a large "A" next to a small "a" -- the
// canonical text-size glyph (same device as reader modes in browsers/ebooks).
export function TypeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 3.5 2.9 12.5" />
      <path d="M4.2 3.5 5.5 12.5" />
      <path d="M3.4 9.3h1.6" />
      <circle cx="10.6" cy="9.8" r="1.4" />
      <path d="M10.6 11.2v1.2" />
    </Icon>
  );
}

// Arrow leaving a box through the top-right corner -- the standard
// "open in external browser / new tab" glyph.
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 2.5V6" />
      <path d="M13.5 2.5 8.5 7.5" />
      <path d="M4.5 3H8" />
      <path d="M3 4.5v6a2.5 2.5 0 0 0 2.5 2.5h5A2.5 2.5 0 0 0 13 10.5V7.5" />
    </Icon>
  );
}

// Two overlapping pages -- the standard "copy" glyph (used for リンクをコピー).
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
    </Icon>
  );
}
