import React from "react";

export interface HndldIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  accentColor?: string;
}

const IconWrapper: React.FC<HndldIconProps & { children: React.ReactNode }> = ({
  size = 24,
  accentColor = "#C9A96E",
  className,
  children,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {children}
  </svg>
);

export const IconHome: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" stroke="currentColor" />
    <path d="M10 21V14h4v7" stroke="currentColor" />
    <path d="M15 17l2 2 4-4" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" fill="none" />
  </IconWrapper>
);

export const IconSchedule: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" />
    <path d="M8 2v4" stroke="currentColor" />
    <path d="M16 2v4" stroke="currentColor" />
    <path d="M3 9h18" stroke="currentColor" />
    <path d="M7 13h4" stroke="currentColor" />
    <path d="M7 17h2" stroke="currentColor" />
    <path d="M14 15l2 2 3-3" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" fill="none" />
  </IconWrapper>
);

export const IconMessages: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M4 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 3V13H6a2 2 0 0 1-2-2V6z" stroke="currentColor" />
    <path d="M16 9h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-3-3h-3a2 2 0 0 1-2-2v-1" stroke="currentColor" />
    <circle cx="18" cy="5" r="2.5" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconProfile: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <circle cx="12" cy="8" r="4" fill={props.accentColor || "#C9A96E"} stroke="currentColor" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" stroke="currentColor" />
  </IconWrapper>
);

export const IconSpending: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" stroke="currentColor" />
    <path d="M3 8l3-3h12l3 3" stroke="currentColor" />
    <path d="M7 13h5" stroke="currentColor" />
    <circle cx="18" cy="10" r="1.5" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconTasks: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" />
    <path d="M9 2v2h6V2" stroke="currentColor" />
    <path d="M9 10h6" stroke="currentColor" />
    <path d="M9 14h4" stroke="currentColor" />
    <path d="M9 18l1.5 1.5L14 16" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" fill="none" />
  </IconWrapper>
);

export const IconSparkle: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke="currentColor" fill="none" />
    <path d="M12 7l1.2 3.6L17 12l-3.8 1.4L12 17l-1.2-3.6L7 12l3.8-1.4L12 7z" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconCleaning: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M14 3l-1 8" stroke="currentColor" />
    <path d="M9 11h8l1 4H8l1-4z" stroke="currentColor" />
    <path d="M8 15v6" stroke="currentColor" />
    <path d="M12 15v6" stroke="currentColor" />
    <path d="M16 15v6" stroke="currentColor" />
    <path d="M5 7l2-2" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" />
    <path d="M3 10l2.5-0.5" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" />
  </IconWrapper>
);

export const IconCare: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M7 13c-2.5 2-4 4-4 6s1.5 2 3 1l6-4 6 4c1.5 1 3 1 3-1s-1.5-4-4-6" stroke="currentColor" />
    <path d="M12 4c-1.5-1.5-4-1.5-5 0s-1 4 0 5l5 5 5-5c1-1 1-3.5 0-5s-3.5-1.5-5 0z" fill={props.accentColor || "#C9A96E"} stroke={props.accentColor || "#C9A96E"} strokeWidth="1" />
  </IconWrapper>
);

export const IconProvider: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <circle cx="10" cy="7" r="3.5" stroke="currentColor" />
    <path d="M3 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" stroke="currentColor" />
    <rect x="13" y="14" width="6" height="5" rx="1" stroke="currentColor" />
    <path d="M14.5 14v-1a1.5 1.5 0 0 1 3 0v1" stroke="currentColor" />
    <circle cx="19" cy="9" r="2.5" fill={props.accentColor || "#C9A96E"} stroke="none" />
    <path d="M18 9l1 1 2-2" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.25" fill="none" />
  </IconWrapper>
);

export const IconReferrals: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <circle cx="7" cy="7" r="3" stroke="currentColor" />
    <path d="M2 19v-1a4 4 0 0 1 4-4h2" stroke="currentColor" />
    <circle cx="17" cy="7" r="3" stroke="currentColor" />
    <path d="M22 19v-1a4 4 0 0 0-4-4h-2" stroke="currentColor" />
    <path d="M10 14c1-1 3-1 4 0" stroke="currentColor" />
    <circle cx="12" cy="16" r="1.5" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconRatings: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={props.accentColor || "#C9A96E"} stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" />
  </IconWrapper>
);

export const IconAlert: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" fill="none" />
    <line x1="12" y1="9" x2="12" y2="13" stroke={props.accentColor || "#C9A96E"} strokeWidth="2" />
    <circle cx="12" cy="16" r="0.75" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconComplete: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" />
    <path d="M8 12l3 3 5-5" stroke={props.accentColor || "#C9A96E"} strokeWidth="1.75" fill="none" />
  </IconWrapper>
);

export const IconClock: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" />
    <path d="M12 6v6l4 2" stroke="currentColor" />
    <circle cx="12" cy="3.5" r="1.25" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const IconSettings: React.FC<HndldIconProps> = (props) => (
  <IconWrapper {...props}>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" />
    <circle cx="12" cy="12" r="1" fill={props.accentColor || "#C9A96E"} stroke="none" />
  </IconWrapper>
);

export const hndldIcons = {
  home: IconHome,
  schedule: IconSchedule,
  messages: IconMessages,
  profile: IconProfile,
  spending: IconSpending,
  tasks: IconTasks,
  sparkle: IconSparkle,
  cleaning: IconCleaning,
  care: IconCare,
  provider: IconProvider,
  referrals: IconReferrals,
  ratings: IconRatings,
  alert: IconAlert,
  complete: IconComplete,
  clock: IconClock,
  settings: IconSettings,
} as const;

export type HndldIconName = keyof typeof hndldIcons;
