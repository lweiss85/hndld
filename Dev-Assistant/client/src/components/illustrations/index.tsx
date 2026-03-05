interface IllustrationProps {
  className?: string;
}

export function VenmoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.8 1.4c.7 1.2 1 2.4 1 3.9 0 4.8-4.1 11.1-7.5 15.5H6.1L3.5 2.1l6.3-.6 1.6 12.8c1.5-2.4 3.3-6.2 3.3-8.8 0-1.4-.2-2.4-.6-3.2l5.7-.9z" />
    </svg>
  );
}

export function HandledIllustration({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 8L8 28v28h48V28L32 8z"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.3"
      />
      <rect
        x="26" y="38" width="12" height="18" rx="6"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
      />
      <path
        d="M24 32l6 6 10-12"
        stroke="hsl(var(--hndld-gold-500))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ConciergeBell({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <ellipse cx="32" cy="48" rx="24" ry="4" className="fill-current opacity-10" />
      <path
        d="M32 12C32 10.8954 32.8954 10 34 10H30C28.8954 10 28 10.8954 28 12V16H32V12Z"
        className="fill-current opacity-20"
      />
      <circle cx="30" cy="12" r="3" className="fill-current opacity-30" />
      <path
        d="M12 44H52V48H12V44Z"
        className="fill-current opacity-15"
      />
      <path
        d="M14 44C14 32 22 22 32 22C42 22 50 32 50 44"
        className="stroke-current opacity-20"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function CalendarIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="10"
        y="14"
        width="44"
        height="40"
        rx="6"
        className="fill-current opacity-10"
      />
      <rect
        x="10"
        y="14"
        width="44"
        height="12"
        rx="6"
        className="fill-current opacity-15"
      />
      <line x1="22" y1="10" x2="22" y2="18" className="stroke-current opacity-20" strokeWidth="2" strokeLinecap="round" />
      <line x1="42" y1="10" x2="42" y2="18" className="stroke-current opacity-20" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="36" r="3" className="fill-current opacity-20" />
      <circle cx="32" cy="36" r="3" className="fill-current opacity-15" />
      <circle cx="40" cy="36" r="3" className="fill-current opacity-10" />
      <circle cx="24" cy="46" r="3" className="fill-current opacity-10" />
      <circle cx="32" cy="46" r="3" className="fill-current opacity-15" />
    </svg>
  );
}

export function SparkleIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M32 8L36 24L52 28L36 32L32 48L28 32L12 28L28 24L32 8Z"
        className="fill-current opacity-15"
      />
      <circle cx="48" cy="16" r="4" className="fill-current opacity-10" />
      <circle cx="16" cy="48" r="3" className="fill-current opacity-10" />
      <circle cx="52" cy="44" r="2" className="fill-current opacity-10" />
    </svg>
  );
}

export function EnvelopeIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="8"
        y="16"
        width="48"
        height="32"
        rx="4"
        className="fill-current opacity-10"
      />
      <path
        d="M8 20L32 36L56 20"
        className="stroke-current opacity-20"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function CheckmarkIllustration({ className = "" }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="32" cy="32" r="24" className="fill-current opacity-10" />
      <path
        d="M20 32L28 40L44 24"
        className="stroke-current opacity-25"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
