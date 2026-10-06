"use client";

import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
}

export function Turnstile({ onVerify, onError, onExpire, className = "" }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guardar callbacks en refs para evitar que cambios de identidad de funciones disparen re-renders del widget
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  // Sitekey pública de Cloudflare Turnstile
  // Test sitekey universal que siempre pasa: '1x00000000000000000000AA'
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.turnstile) {
      setScriptLoaded(true);
      return;
    }

    const scriptId = "cf-turnstile-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", () => setScriptLoaded(true));
    }
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return;

    // Asegurar exactamente un render por ciclo de vida del componente
    if (widgetIdRef.current) return;

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          setErrorMessage(null);
          onVerifyRef.current(token);
        },
        "error-callback": () => {
          setErrorMessage("No pudimos verificar que eres humano, recarga la página e intenta de nuevo");
          onErrorRef.current?.();
        },
        "expired-callback": () => {
          setErrorMessage("No pudimos verificar que eres humano, recarga la página e intenta de nuevo");
          onExpireRef.current?.();
        },
        theme: "light",
      });
    } catch (err) {
      console.warn("[Turnstile] Error renderizando widget:", err);
      setErrorMessage("No pudimos verificar que eres humano, recarga la página e intenta de nuevo");
      onErrorRef.current?.();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [scriptLoaded, siteKey]);

  return (
    <div className={`flex flex-col items-center my-2 ${className}`}>
      <div ref={containerRef} />
      {errorMessage && (
        <p className="mt-2 text-xs text-red-400 text-center font-medium">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

