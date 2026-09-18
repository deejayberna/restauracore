"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth-actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main style={{ maxWidth: 400, margin: "100px auto", padding: "0 1rem" }}>
      <h1>RestauraCore — Acceso Staff</h1>
      {state?.error && (
        <p style={{ color: "red", marginBottom: "1rem" }}>{state.error}</p>
      )}
      <form action={formAction}>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="password">Contraseña</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
        </div>
        <button type="submit" disabled={pending} style={{ width: "100%", padding: "0.75rem" }}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
