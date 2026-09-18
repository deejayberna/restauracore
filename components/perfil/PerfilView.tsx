"use client";

import React, { useState } from "react";
import Link from "next/link";
import { User, KeyRound, Store, Shield, LogOut, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cambiarPasswordAction, logoutAction } from "@/lib/auth-actions";
import { type BranchInfo } from "@/components/layout/BranchSwitcher";

export function PerfilView({
  user,
  currentBranchId,
  branches,
}: {
  user: {
    id: string;
    nombre: string;
    email: string;
    rol: string;
  };
  currentBranchId: string;
  branches: BranchInfo[];
}) {
  const { toast } = useToast();
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [cambiando, setCambiando] = useState(false);

  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault();

    if (nuevaPassword.length < 6) {
      toast("La nueva contraseña debe contener al menos 6 caracteres.", "warning");
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      toast("Las contraseñas ingresadas no coinciden.", "warning");
      return;
    }

    setCambiando(true);
    try {
      const res = await cambiarPasswordAction(nuevaPassword);
      if (res.ok) {
        toast("Contraseña actualizada exitosamente.", "success");
        setNuevaPassword("");
        setConfirmarPassword("");
      } else {
        toast(res.error || "No se pudo actualizar la contraseña.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error al actualizar contraseña", "error");
    } finally {
      setCambiando(false);
    }
  }

  const roleColors: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = {
    dueno: "warning",
    gerente: "info",
    chef: "danger",
    cajero: "success",
    mesero: "neutral",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <User className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          Mi Perfil y Seguridad
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Administra tus datos personales, contraseña y sucursales vinculadas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ─── COLUMNA IZQUIERDA: TARJETA DE PERFIL ────────────────────────────── */}
        <div className="space-y-6 md:col-span-1">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-extrabold text-2xl flex items-center justify-center mx-auto shadow-inner">
                {user.nombre.charAt(0).toUpperCase()}
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {user.nombre}
                </h2>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>

              <div className="pt-2">
                <Badge
                  variant={roleColors[user.rol] || "neutral"}
                  size="md"
                  className="uppercase font-bold tracking-wider text-[11px]"
                >
                  Rol: {user.rol}
                </Badge>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <form action={logoutAction}>
                  <Button variant="outline" size="sm" type="submit" className="w-full text-rose-600 hover:text-rose-700">
                    <LogOut className="w-4 h-4 mr-1.5" /> Cerrar Sesión
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── COLUMNA DERECHA: SEGURIDAD Y SUCURSALES ─────────────────────────── */}
        <div className="space-y-6 md:col-span-2">
          {/* Cambio de contraseña */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-600" />
                Actualizar Contraseña
              </CardTitle>
              <CardDescription>
                Define una nueva contraseña segura para tu cuenta de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCambiarPassword} className="space-y-4">
                <Input
                  label="Nueva Contraseña"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  required
                />

                <Input
                  label="Confirmar Nueva Contraseña"
                  type="password"
                  placeholder="Repite tu nueva contraseña"
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  required
                />

                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={cambiando}>
                    Actualizar Contraseña
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sucursales vinculadas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="w-4 h-4 text-indigo-600" />
                Sucursales Asignadas ({branches.length})
              </CardTitle>
              <CardDescription>
                Restaurantes donde tienes una cuenta y rol asignado.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {branches.map((b) => {
                  const isCurrent = b.restaurante_id === currentBranchId;
                  return (
                    <div
                      key={b.restaurante_id}
                      className="p-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {b.nombre}
                        </p>
                        <span className="text-[11px] text-slate-400 uppercase font-semibold">
                          Rol: {b.rol}
                        </span>
                      </div>

                      {isCurrent ? (
                        <Badge variant="success" size="sm" dot>
                          Activa actualmente
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Disponible</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {user.rol === "dueno" && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                  <Link
                    href="/restaurante/configuracion"
                    className="flex items-center justify-between text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 transition"
                  >
                    <span>Configuración de Sucursal y Suscripción &rarr;</span>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

