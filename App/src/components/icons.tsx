import type { SVGProps } from "react";

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
      <path d="M8 2.5a5.5 5.5 0 1 1 -4.53 8.62" />
      <path d="M2.2 6.2 3.4 8.4 5.6 7.2" />
      <path d="M8 5v3.2l2.2 1.3" />
    </Icon>
  );
}

export function RssIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <path d="M3 7a6 6 0 0 1 6 6" />
      <path d="M3 3a10 10 0 0 1 10 10" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 2.3v1.9M8 11.8v1.9M13.7 8h-1.9M4.2 8H2.3" />
      <path d="M12 4 10.7 5.3M5.3 10.7 4 12M12 12l-1.3-1.3M5.3 5.3 4 4" />
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

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="5.5" r="3" />
      <path d="M6 8.3 3 13.5" />
    </Icon>
  );
}

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

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
    </Icon>
  );
}
