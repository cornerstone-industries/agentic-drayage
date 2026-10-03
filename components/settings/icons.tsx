// Small line icons for Settings, drawn on a 16 px grid in currentColor.
type IconProps = { className?: string };

const base = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} className={className} aria-hidden>
      <path d="M3 8.5 L6.5 12 L13 4.5" />
    </svg>
  );
}

export function CopyIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
      <path d="M10.5 5.5 V3.8 A1.3 1.3 0 0 0 9.2 2.5 H3.8 A1.3 1.3 0 0 0 2.5 3.8 V9.2 A1.3 1.3 0 0 0 3.8 10.5 H5.5" />
    </svg>
  );
}

export function PhoneIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M5.6 2.5 H3.9 A1.4 1.4 0 0 0 2.5 4 C2.8 9.3 6.7 13.2 12 13.5 A1.4 1.4 0 0 0 13.5 12.1 V10.4 L10.6 9.2 L9.2 10.6 C7.7 9.9 6.1 8.3 5.4 6.8 L6.8 5.4 Z" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 8 H13 M9 4 L13 8 L9 12" />
    </svg>
  );
}

export function MinusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className} aria-hidden>
      <path d="M3.5 8 H12.5" />
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className} aria-hidden>
      <path d="M8 3.5 V12.5 M3.5 8 H12.5" />
    </svg>
  );
}

export function AlertIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M8 2.5 L14 13 H2 Z" />
      <path d="M8 6.5 V9" />
      <path d="M8 11.2 V11.3" strokeWidth={2.4} />
    </svg>
  );
}

export function CardIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.6" />
      <path d="M1.8 6.5 H14.2 M4.5 10 H7" />
    </svg>
  );
}
