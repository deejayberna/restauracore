import React from "react";
import Link from "next/link";

export interface BrandLogoProps {
  variant?: "full" | "mark" | "compact";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  theme?: "light" | "dark" | "auto";
  withSubtitle?: boolean;
  subtitle?: string;
  className?: string;
  href?: string;
}

export function BrandLogo({
  variant = "full",
  size = "md",
  theme = "auto",
  withSubtitle = false,
  subtitle = "Gestión Inteligente",
  className = "",
  href,
}: BrandLogoProps) {
  // Dimensions according to size
  const sizeConfig = {
    xs: {
      box: "w-6 h-6 rounded-md",
      iconSize: 24,
      title: "text-sm",
      sub: "text-[8px] tracking-wider",
      gap: "gap-2",
    },
    sm: {
      box: "w-8 h-8 rounded-lg",
      iconSize: 32,
      title: "text-base",
      sub: "text-[9px] tracking-wider",
      gap: "gap-2.5",
    },
    md: {
      box: "w-9 h-9 rounded-xl",
      iconSize: 36,
      title: "text-lg",
      sub: "text-[10px] tracking-wider",
      gap: "gap-2.5",
    },
    lg: {
      box: "w-11 h-11 rounded-xl",
      iconSize: 44,
      title: "text-xl",
      sub: "text-[11px] tracking-widest",
      gap: "gap-3",
    },
    xl: {
      box: "w-14 h-14 rounded-2xl",
      iconSize: 56,
      title: "text-2xl sm:text-3xl",
      sub: "text-xs tracking-widest",
      gap: "gap-3.5",
    },
  }[size];

  // Theme text styling
  const titleColor =
    theme === "dark"
      ? "text-white"
      : theme === "light"
        ? "text-slate-900"
        : "text-slate-900 dark:text-white";

  const subColor =
    theme === "dark"
      ? "text-slate-400"
      : theme === "light"
        ? "text-slate-500"
        : "text-slate-500 dark:text-slate-400";

  // Emblem Vector Mark
  const Emblem = (
    <div
      className={`relative shrink-0 flex items-center justify-center overflow-hidden shadow-md shadow-orange-500/20 bg-linear-to-br from-orange-600 via-orange-500 to-amber-500 ${sizeConfig.box}`}
    >
      {/* Subtle top glare */}
      <div className="absolute inset-0 bg-linear-to-b from-white/30 to-transparent pointer-events-none" />
      <div className="absolute inset-[1px] rounded-[inherit] border border-white/35 pointer-events-none" />

      {/* SVG Icon Artwork */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[72%] h-[72%] relative z-10"
      >
        <defs>
          <linearGradient id="bl-flame" x1="24" y1="9" x2="24" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="0.7" stopColor="#FFF7ED" />
            <stop offset="1" stopColor="#FED7AA" />
          </linearGradient>
          <linearGradient id="bl-core" x1="24" y1="18" x2="24" y2="25" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBBF24" />
            <stop offset="1" stopColor="#EA580C" />
          </linearGradient>
          <filter id="bl-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#7C2D12" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter="url(#bl-shadow)">
          {/* Base Cloche / Plate Arc */}
          <path
            d="M12 34C16 37 32 37 36 34C34.5 35.5 13.5 35.5 12 34Z"
            fill="#FFFFFF"
            fillOpacity="0.95"
          />
          <path
            d="M13.5 30C17.5 33.5 30.5 33.5 34.5 30C33 31.5 15 31.5 13.5 30Z"
            fill="#FFFFFF"
            fillOpacity="0.75"
          />

          {/* Dynamic Culinary Flame */}
          <path
            d="M24 9C24 9 29.5 15 29.5 21C29.5 25.5 26 28.5 24 28.5C22 28.5 18.5 25.5 18.5 21C18.5 16.5 21.5 12.5 24 9Z"
            fill="url(#bl-flame)"
          />

          {/* Inner Energy Core */}
          <path
            d="M24 18C25.4 18 26.8 19.6 26.8 21.8C26.8 23.8 25.4 25.3 24 25.3C22.6 25.3 21.2 23.8 21.2 21.8C21.2 20.4 22.4 19.1 24 18Z"
            fill="url(#bl-core)"
          />

          {/* Intelligence Spark */}
          <path
            d="M33.5 12L34.4 14.2L36.6 15.1L34.4 16L33.5 18.2L32.6 16L30.4 15.1L32.6 14.2L33.5 12Z"
            fill="#FFFFFF"
            fillOpacity="0.95"
          />
        </g>
      </svg>
    </div>
  );

  if (variant === "mark") {
    if (href) {
      return (
        <Link
          href={href}
          aria-label="RestauraCore"
          className={`inline-flex items-center transition-transform hover:scale-105 active:scale-95 ${className}`}
        >
          {Emblem}
        </Link>
      );
    }
    return <div className={`inline-flex items-center ${className}`}>{Emblem}</div>;
  }

  const content = (
    <div className={`inline-flex items-center ${sizeConfig.gap} ${className}`}>
      {Emblem}
      <div className="flex flex-col text-left leading-none">
        <span className={`font-black tracking-tight ${sizeConfig.title} ${titleColor}`}>
          Restaura<span className="text-transparent bg-clip-text bg-linear-to-r from-orange-600 to-amber-500">Core</span>
        </span>
        {withSubtitle && (
          <span className={`font-bold uppercase mt-1 ${sizeConfig.sub} ${subColor}`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group inline-flex items-center transition-opacity hover:opacity-95"
      >
        {content}
      </Link>
    );
  }

  return content;
}
