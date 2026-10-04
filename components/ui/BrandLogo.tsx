import React from "react";
import Link from "next/link";

export interface BrandLogoProps {
  variant?: "full" | "mark" | "compact";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  theme?: "light" | "dark" | "auto";
  withSubtitle?: boolean;
  subtitle?: string;
  withBadge?: boolean;
  badgeText?: string;
  className?: string;
  href?: string;
}

export function BrandLogo({
  variant = "full",
  size = "md",
  theme = "auto",
  withSubtitle = false,
  subtitle = "Gestión Inteligente",
  withBadge = false,
  badgeText = "PRO",
  className = "",
  href,
}: BrandLogoProps) {
  // Dimensions according to size
  const sizeConfig = {
    xs: {
      box: "w-7 h-7 rounded-lg ring-1 ring-amber-500/40",
      title: "text-sm",
      sub: "text-[8px] tracking-wider",
      badge: "text-[8px] px-1 py-0.2",
      gap: "gap-2",
    },
    sm: {
      box: "w-8 h-8 rounded-lg ring-1 ring-amber-500/40",
      title: "text-base",
      sub: "text-[9px] tracking-wider",
      badge: "text-[8.5px] px-1.5 py-0.5",
      gap: "gap-2.5",
    },
    md: {
      box: "w-10 h-10 rounded-xl ring-1.5 ring-amber-500/50",
      title: "text-lg sm:text-xl",
      sub: "text-[10px] tracking-wider",
      badge: "text-[9px] px-1.5 py-0.5",
      gap: "gap-3",
    },
    lg: {
      box: "w-12 h-12 rounded-xl ring-1.5 ring-amber-500/50",
      title: "text-xl sm:text-2xl",
      sub: "text-[11px] tracking-widest",
      badge: "text-[10px] px-2 py-0.5",
      gap: "gap-3.5",
    },
    xl: {
      box: "w-16 h-16 rounded-2xl ring-2 ring-amber-500/60",
      title: "text-2xl sm:text-3xl",
      sub: "text-xs tracking-widest",
      badge: "text-xs px-2.5 py-1",
      gap: "gap-4",
    },
  }[size];

  // Theme text styling
  const titleColor =
    theme === "dark"
      ? "text-slate-100"
      : theme === "light"
        ? "text-slate-900"
        : "text-slate-900 dark:text-slate-100";

  const subColor =
    theme === "dark"
      ? "text-slate-400"
      : theme === "light"
        ? "text-slate-500"
        : "text-slate-500 dark:text-slate-400";

  // Emblem Vector Mark (Obsidian & Solar Core Emblem)
  const Emblem = (
    <div
      className={`relative shrink-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-neutral-950 shadow-md shadow-orange-950/40 transition-transform group-hover:scale-105 ${sizeConfig.box}`}
    >
      {/* Outer Glow Highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/10 via-transparent to-amber-400/20 pointer-events-none" />
      <div className="absolute inset-0 rounded-[inherit] border border-amber-500/30 pointer-events-none" />

      {/* SVG Icon Artwork */}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[84%] h-[84%] relative z-10"
      >
        <defs>
          <linearGradient id="bl-core-flame" x1="32" y1="10" x2="32" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFBEB" />
            <stop offset="0.3" stopColor="#FDE68A" />
            <stop offset="0.7" stopColor="#F59E0B" />
            <stop offset="1" stopColor="#EA580C" />
          </linearGradient>

          <linearGradient id="bl-diamond" x1="29" y1="22" x2="35" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#FDE047" />
          </linearGradient>

          <filter id="bl-core-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#EA580C" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Radial Ambient Core Flare */}
        <circle cx="32" cy="32" r="16" fill="#EA580C" opacity="0.35" />

        <g filter="url(#bl-core-glow)">
          {/* Base Cloche / Plate Arc */}
          <path
            d="M14 43.5C20 47.5 44 47.5 50 43.5C47.5 45.5 16.5 45.5 14 43.5Z"
            fill="#FFFFFF"
            opacity="0.95"
          />
          <path
            d="M16 39.5C21.5 43.5 42.5 43.5 48 39.5C45.5 41.5 18.5 41.5 16 39.5Z"
            fill="url(#bl-core-flame)"
            opacity="0.9"
          />

          {/* 3-Tier Dynamic Culinary Crown */}
          {/* Left Wing */}
          <path
            d="M24 36C22 33 21 28 23 23C25 27 27 29 27 33C27 34.5 26 35.5 24 36Z"
            fill="#F59E0B"
            opacity="0.95"
          />
          {/* Right Wing */}
          <path
            d="M40 36C42 33 43 28 41 23C39 27 37 29 37 33C37 34.5 38 35.5 40 36Z"
            fill="#F59E0B"
            opacity="0.95"
          />
          {/* Center Torch */}
          <path
            d="M32 11C32 11 38 18 38 26C38 32.5 35 37 32 37C29 37 26 32.5 26 26C26 18 32 11 32 11Z"
            fill="url(#bl-core-flame)"
          />

          {/* Central Radiant Diamond Spark / Intelligence Core */}
          <path
            d="M32 22L34.5 27L32 32L29.5 27L32 22Z"
            fill="url(#bl-diamond)"
          />

          {/* Top Sparkle Stars */}
          <circle cx="32" cy="11.5" r="1.5" fill="#FFFFFF" />
          <path
            d="M44 15L45.2 17.5L48 18.5L45.2 19.5L44 22L42.8 19.5L40 18.5L42.8 17.5L44 15Z"
            fill="#FDE047"
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
        <div className="flex items-center gap-1.5">
          <span className={`font-black tracking-tight ${sizeConfig.title} ${titleColor}`}>
            Restaura<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500">Core</span>
          </span>
          {withBadge && (
            <span
              className={`rounded-md font-extrabold uppercase tracking-wide bg-slate-900 dark:bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs ${sizeConfig.badge}`}
            >
              {badgeText}
            </span>
          )}
        </div>
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

