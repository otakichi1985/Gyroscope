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

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.36 3.64l-1.06 1.06M4.7 11.3l-1.06 1.06M12.36 12.36l-1.06-1.06M4.7 4.7 3.64 3.64" />
    </Icon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="3" y1="4.5" x2="13" y2="4.5" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="11.5" x2="13" y2="11.5" />
      <circle cx="6" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="8" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="7" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
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

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M8 2.5 9.85 6.3l4.15.6-3 2.93.71 4.13L8 11.95l-3.71 1.95.71-4.13-3-2.93 4.15-.6L8 2.5Z" />
    </Icon>
  );
}
