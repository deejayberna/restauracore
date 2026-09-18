"use client";

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  CheckCircle2,
  Clock,
  Ban,
  RotateCw,
  Edit2,
  UtensilsCrossed,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import {
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  invitarPersonalAction,
  cambiarRolPersonalAction,
  alternarEstadoPersonalAction,
  reenviarInvitacionAction,
  type RolTipo,
} from "@/lib/personal-actions";
import { asignarMeseroMesaAction } from "@/lib/mesas-actions";
import { useRouter } from "next/navigation";

export interface EmpleadoItem {
  id: string; // usuario_restaurantes.id
  usuario_id: string;
  nombre: string;
  email: string;
  rol: RolTipo;
  activo: boolean;
  invitacion_pendiente: boolean;
  creado_en: Date | string;
}

export interface MesaItem {
  id: string;
  numero: number;
  meseroAsignadoId?: string | null;
}

export function PersonalView({
  currentUserRole,
  empleados,
  mesas,
}: {
  currentUserRole: RolTipo;
  empleados: EmpleadoItem[];
  mesas: MesaItem[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("equipo");

  // Modal de Invitación
  const [modalInvitarOpen, setModalInvitarOpen] = useState(false);
  const [invitarNombre, setInvitarNombre] = useState("");
  const [invitarEmail, setInvitarEmail] = useState("");
  const [invitarRol, setInvitarRol] = useState<RolTipo>("mesero");
  const [invitando, setInvitando] = useState(false);

  // Modal de Cambio de Rol
  const [modalRolOpen, setModalRolOpen] = useState(false);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState<EmpleadoItem | null>(null);
  const [nuevoRol, setNuevoRol] = useState<RolTipo>("mesero");
  const [cambiandoRol, setCambiandoRol] = useState(false);

  // Asignación de mesa
  const [asignandoMesa, setAsignandoMesa] = useState<string | null>(null);

  const esDueno = currentUserRole === "dueno";

  // Opciones de rol según jerarquía
  const opcionesRol = esDueno
    ? [
        { value: "mesero", label: "Mesero" },
        { value: "cajero", label: "Cajero" },
        { value: "chef", label: "Chef / Cocina" },
        { value: "gerente", label: "Gerente" },
        { value: "dueno", label: "Dueño" },
      ]
    : [
        { value: "mesero", label: "Mesero" },
        { value: "cajero", label: "Cajero" },
        { value: "chef", label: "Chef / Cocina" },
      ];

  const roleColors: Record<RolTipo, "info" | "warning" | "success" | "neutral" | "danger"> = {
    dueno: "warning",
    gerente: "info",
    chef: "danger",
    cajero: "success",
    mesero: "neutral",
  };

  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault();
    if (!invitarNombre.trim() || !invitarEmail.trim()) {
      toast("Completa todos los campos obligatorios.", "warning");
      return;
    }

    setInvitando(true);
    try {
      const res = await invitarPersonalAction({
        nombre: invitarNombre.trim(),
        email: invitarEmail.trim(),
        rol: invitarRol,
      });

      if (res.ok) {
        toast(res.mensaje, "success");
        setModalInvitarOpen(false);
        setInvitarNombre("");
        setInvitarEmail("");
        setInvitarRol("mesero");
        router.refresh();
      }
    } catch (err: any) {
      toast(err.message || "Error al invitar personal", "error");
    } finally {
      setInvitando(false);
    }
  }

  async function handleCambiarRol(e: React.FormEvent) {
    e.preventDefault();
    if (!empleadoSeleccionado) return;

    setCambiandoRol(true);
    try {
      const res = await cambiarRolPersonalAction({
        usuario_id: empleadoSeleccionado.usuario_id,
        nuevo_rol: nuevoRol,
      });

      if (res.ok) {
        toast("Rol modificado exitosamente.", "success");
        setModalRolOpen(false);
        setEmpleadoSeleccionado(null);
        router.refresh();
      }
    } catch (err: any) {
      toast(err.message || "Error al cambiar rol", "error");
    } finally {
      setCambiandoRol(false);
    }
  }

  async function handleToggleActivo(empleado: EmpleadoItem) {
    const accionTexto = empleado.activo ? "desactivar" : "activar";
    if (!confirm(`¿Estás seguro de ${accionTexto} a ${empleado.nombre}?`)) {
      return;
    }

    try {
      const res = await alternarEstadoPersonalAction({
        usuario_id: empleado.usuario_id,
        activo: !empleado.activo,
      });
      if (res.ok) {
        toast(res.mensaje, "success");
        router.refresh();
      }
    } catch (err: any) {
      toast(err.message || "Error al cambiar estado", "error");
    }
  }

  async function handleReenviarInvitacion(email: string) {
    try {
      const res = await reenviarInvitacionAction(email);
      if (res.ok) {
        toast(res.mensaje, "success");
      }
    } catch (err: any) {
      toast(err.message || "Error al reenviar invitación", "error");
    }
  }

  async function handleAsignarMesa(mesaId: string, meseroId: string) {
    setAsignandoMesa(mesaId);
    try {
      const res = await asignarMeseroMesaAction({
        mesa_id: mesaId,
        mesero_id: meseroId,
      });
      if (res.ok) {
        toast("Mesa asignada correctamente.", "success");
        router.refresh();
      }
    } catch (err: any) {
      toast(err.message || "Error al asignar mesa", "error");
    } finally {
      setAsignandoMesa(null);
    }
  }

  const meserosDisponibles = empleados.filter((e) => e.rol === "mesero" && e.activo);

  return (
    <div className="space-y-6">
      {/* ─── ENCABEZADO ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            Gestión de Personal & Permisos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Administra los roles del equipo, invitaciones seguras vía Supabase Auth y asignaciones de
            mesas.
          </p>
        </div>

        <Button
          onClick={() => setModalInvitarOpen(true)}
          icon={<UserPlus className="w-4 h-4" />}
          size="md"
        >
          Invitar Empleado
        </Button>
      </div>

      {/* ─── PESTAÑAS ───────────────────────────────────────────────────────── */}
      <Tabs
        tabs={[
          { id: "equipo", label: "Equipo de Trabajo", count: empleados.length },
          { id: "mesas", label: "Asignación de Mesas", count: mesas.length },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ─── PESTAÑA 1: EQUIPO DE TRABAJO ────────────────────────────────────── */}
      {activeTab === "equipo" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Directorio del Restaurante</CardTitle>
            <CardDescription>
              Personal vinculado activamente o pendiente de aceptar invitación.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <TableContainer className="border-0 rounded-none">
              <TableHead>
                <tr>
                  <TableHeaderCell>Colaborador</TableHeaderCell>
                  <TableHeaderCell>Rol</TableHeaderCell>
                  <TableHeaderCell>Estado de Acceso</TableHeaderCell>
                  <TableHeaderCell className="text-right">Acciones</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {empleados.map((emp) => {
                  const puedeEditarRol =
                    esDueno ||
                    (!["dueno", "gerente"].includes(emp.rol) && currentUserRole === "gerente");

                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs shrink-0">
                            {emp.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {emp.nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {emp.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={roleColors[emp.rol]}
                          size="sm"
                          className="uppercase font-semibold tracking-wider text-[10px]"
                        >
                          {emp.rol}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {emp.invitacion_pendiente ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="warning" dot size="sm">
                              Invitación pendiente de aceptar
                            </Badge>
                            <button
                              type="button"
                              onClick={() => handleReenviarInvitacion(emp.email)}
                              className="touch-target text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 p-1"
                              title="Reenviar correo de invitación"
                              aria-label="Reenviar invitación"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : emp.activo ? (
                          <Badge variant="success" dot size="sm">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="danger" dot size="sm">
                            Inactivo
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {puedeEditarRol && (
                            <button
                              type="button"
                              onClick={() => {
                                setEmpleadoSeleccionado(emp);
                                setNuevoRol(emp.rol);
                                setModalRolOpen(true);
                              }}
                              className="touch-target p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Cambiar rol"
                              aria-label="Cambiar rol"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {puedeEditarRol && (
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(emp)}
                              className={`touch-target p-1.5 rounded-lg transition-colors ${
                                emp.activo
                                  ? "text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                  : "text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              }`}
                              title={emp.activo ? "Desactivar acceso" : "Reactivar acceso"}
                              aria-label={emp.activo ? "Desactivar acceso" : "Reactivar acceso"}
                            >
                              {emp.activo ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* ─── PESTAÑA 2: ASIGNACIÓN DE MESAS ──────────────────────────────────── */}
      {activeTab === "mesas" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-sky-600" />
              Asignación Operativa de Mesas por Turno
            </CardTitle>
            <CardDescription>
              Asigna a cada mesero las mesas que atenderá hoy para organizar el servicio en salón.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mesas.length === 0 ? (
              <p className="text-xs text-slate-500">No hay mesas registradas en este restaurante.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {mesas.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        Mesa #{m.numero}
                      </span>
                      <span className="text-[10px] uppercase font-semibold text-slate-400">
                        Piso Activo
                      </span>
                    </div>

                    <Select
                      label="Mesero Asignado"
                      value={m.meseroAsignadoId ?? ""}
                      disabled={asignandoMesa === m.id || meserosDisponibles.length === 0}
                      onChange={(e) => handleAsignarMesa(m.id, e.target.value)}
                    >
                      <option value="">-- Sin mesero fijo --</option>
                      {meserosDisponibles.map((mesero) => (
                        <option key={mesero.usuario_id} value={mesero.usuario_id}>
                          {mesero.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── MODAL INVITAR PERSONAL ─────────────────────────────────────────── */}
      <Modal
        isOpen={modalInvitarOpen}
        onClose={() => setModalInvitarOpen(false)}
        title="Invitar Nuevo Empleado"
        description="Se enviará un correo seguro para que el empleado establezca su contraseña. El administrador nunca ve ni define contraseñas."
      >
        <form onSubmit={handleInvitar} className="space-y-4">
          <Input
            label="Nombre Completo"
            placeholder="Ej. Carlos Martínez"
            value={invitarNombre}
            onChange={(e) => setInvitarNombre(e.target.value)}
            required
          />

          <Input
            label="Correo Electrónico"
            type="email"
            placeholder="carlos@ejemplo.com"
            value={invitarEmail}
            onChange={(e) => setInvitarEmail(e.target.value)}
            required
          />

          <Select
            label="Rol en el Restaurante"
            options={opcionesRol}
            value={invitarRol}
            onChange={(e) => setInvitarRol(e.target.value as RolTipo)}
          />

          <div className="p-3 bg-sky-50 dark:bg-sky-950/60 rounded-xl text-xs text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800">
            🔒 <strong>Principio de Privacidad:</strong> Supabase Auth enviará un token seguro al correo
            indicado para el alta de contraseña del colaborador.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalInvitarOpen(false)}
              disabled={invitando}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={invitando}>
              Enviar Invitación
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL CAMBIAR ROL ──────────────────────────────────────────────── */}
      <Modal
        isOpen={modalRolOpen}
        onClose={() => setModalRolOpen(false)}
        title={`Cambiar Rol de ${empleadoSeleccionado?.nombre}`}
        description="Modifica los permisos de acceso del colaborador en este restaurante."
      >
        <form onSubmit={handleCambiarRol} className="space-y-4">
          <Select
            label="Nuevo Rol"
            options={opcionesRol}
            value={nuevoRol}
            onChange={(e) => setNuevoRol(e.target.value as RolTipo)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalRolOpen(false)}
              disabled={cambiandoRol}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={cambiandoRol}>
              Actualizar Rol
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

