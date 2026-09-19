"use client";

import React, { useState, useTransition } from "react";
import {
  UtensilsCrossed,
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  ChefHat,
  Clock,
  DollarSign,
  Layers,
  X,
  ArrowUpDown,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  crearCategoriaAction,
  editarCategoriaAction,
  cambiarEstadoCategoriaAction,
  crearPlatilloAction,
  editarPlatilloAction,
  cambiarDisponibilidadPlatilloAction,
  eliminarPlatilloAction,
  obtenerRecetaPlatilloAction,
  guardarRecetaPlatilloAction,
  subirFotoPlatilloAction,
  type PlatilloInput,
} from "@/lib/menu-actions";

interface Categoria {
  id: string;
  restaurante_id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

interface Platillo {
  id: string;
  restaurante_id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: string;
  foto_url: string | null;
  disponible: boolean;
  tiempo_prep_minutos: number | null;
  tieneReceta: boolean;
  totalIngredientesReceta: number;
}

interface Ingrediente {
  id: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario: string;
  stock_actual: string;
}

interface RecetaItemUI {
  ingredienteId: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario: number;
  cantidadRequerida: number;
}

export function MenuAdminClient({
  initialCategorias,
  initialPlatillos,
  initialIngredientes,
}: {
  initialCategorias: Categoria[];
  initialPlatillos: Platillo[];
  initialIngredientes: Ingrediente[];
}) {
  const [tab, setTab] = useState<"platillos" | "categorias">("platillos");
  const [categorias, setCategorias] = useState<Categoria[]>(initialCategorias);
  const [platillos, setPlatillos] = useState<Platillo[]>(initialPlatillos);
  const [ingredientes] = useState<Ingrediente[]>(initialIngredientes);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "disponibles" | "agotados" | "sin_receta">("todos");

  // Modales
  const [modalCategoria, setModalCategoria] = useState<{
    abierto: boolean;
    modo: "crear" | "editar";
    categoriaId?: string;
    nombre: string;
    orden: number;
    activo: boolean;
  }>({
    abierto: false,
    modo: "crear",
    nombre: "",
    orden: 0,
    activo: true,
  });

  const [modalPlatillo, setModalPlatillo] = useState<{
    abierto: boolean;
    modo: "crear" | "editar";
    platilloId?: string;
    categoriaId: string;
    nombre: string;
    descripcion: string;
    precio: string;
    tiempoPrepMinutos: string;
    fotoUrl: string;
    disponible: boolean;
    tieneReceta?: boolean;
  }>({
    abierto: false,
    modo: "crear",
    categoriaId: "",
    nombre: "",
    descripcion: "",
    precio: "",
    tiempoPrepMinutos: "15",
    fotoUrl: "",
    disponible: true,
  });

  const [modalReceta, setModalReceta] = useState<{
    abierto: boolean;
    platillo?: Platillo;
    items: RecetaItemUI[];
    cargando: boolean;
    guardando: boolean;
  }>({
    abierto: false,
    items: [],
    cargando: false,
    guardando: false,
  });

  // Notificaciones y transiciones
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tipo: "exito" | "error" | "info"; mensaje: string } | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  // ─── ACCIONES CATEGORÍAS ──────────────────────────────────────────────────

  const abrirCrearCategoria = () => {
    setModalCategoria({
      abierto: true,
      modo: "crear",
      nombre: "",
      orden: categorias.length + 1,
      activo: true,
    });
  };

  const abrirEditarCategoria = (c: Categoria) => {
    setModalCategoria({
      abierto: true,
      modo: "editar",
      categoriaId: c.id,
      nombre: c.nombre,
      orden: c.orden,
      activo: c.activo,
    });
  };

  const guardarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCategoria.nombre.trim()) return;

    startTransition(async () => {
      if (modalCategoria.modo === "crear") {
        const res = await crearCategoriaAction({
          nombre: modalCategoria.nombre,
          orden: Number(modalCategoria.orden) || 0,
        });
        if (res.error) {
          setFeedback({ tipo: "error", mensaje: res.error });
        } else if (res.categoria) {
          setCategorias((prev) => [...prev, res.categoria as Categoria]);
          setFeedback({ tipo: "exito", mensaje: `Categoría "${res.categoria.nombre}" creada.` });
          setModalCategoria((prev) => ({ ...prev, abierto: false }));
        }
      } else if (modalCategoria.categoriaId) {
        const res = await editarCategoriaAction(modalCategoria.categoriaId, {
          nombre: modalCategoria.nombre,
          orden: Number(modalCategoria.orden) || 0,
          activo: modalCategoria.activo,
        });
        if (res.error) {
          setFeedback({ tipo: "error", mensaje: res.error });
        } else if (res.categoria) {
          setCategorias((prev) =>
            prev.map((c) => (c.id === res.categoria.id ? (res.categoria as Categoria) : c))
          );
          setFeedback({ tipo: "exito", mensaje: `Categoría "${res.categoria.nombre}" actualizada.` });
          setModalCategoria((prev) => ({ ...prev, abierto: false }));
        }
      }
    });
  };

  const toggleEstadoCategoria = (c: Categoria) => {
    const nuevoEstado = !c.activo;
    startTransition(async () => {
      const res = await cambiarEstadoCategoriaAction(c.id, nuevoEstado);
      if (res.error) {
        setFeedback({ tipo: "error", mensaje: res.error });
      } else {
        setCategorias((prev) =>
          prev.map((item) => (item.id === c.id ? { ...item, activo: nuevoEstado } : item))
        );
        setFeedback({
          tipo: "info",
          mensaje: `Categoría "${c.nombre}" ${nuevoEstado ? "activada" : "desactivada"}.`,
        });
      }
    });
  };

  // ─── ACCIONES PLATILLOS ───────────────────────────────────────────────────

  const abrirCrearPlatillo = () => {
    const defaultCat = categorias[0]?.id || "";
    setModalPlatillo({
      abierto: true,
      modo: "crear",
      categoriaId: defaultCat,
      nombre: "",
      descripcion: "",
      precio: "",
      tiempoPrepMinutos: "15",
      fotoUrl: "",
      disponible: true,
      tieneReceta: false,
    });
  };

  const abrirEditarPlatillo = (p: Platillo) => {
    setModalPlatillo({
      abierto: true,
      modo: "editar",
      platilloId: p.id,
      categoriaId: p.categoria_id || (categorias[0]?.id ?? ""),
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      precio: p.precio,
      tiempoPrepMinutos: p.tiempo_prep_minutos?.toString() || "15",
      fotoUrl: p.foto_url || "",
      disponible: p.disponible,
      tieneReceta: p.tieneReceta,
    });
  };

  const guardarPlatillo = async (e: React.FormEvent) => {
    e.preventDefault();
    const precioNum = parseFloat(modalPlatillo.precio);
    if (isNaN(precioNum) || precioNum <= 0) {
      setFeedback({ tipo: "error", mensaje: "Ingresa un precio válido mayor a 0." });
      return;
    }

    const input: PlatilloInput = {
      categoriaId: modalPlatillo.categoriaId,
      nombre: modalPlatillo.nombre,
      descripcion: modalPlatillo.descripcion,
      precio: precioNum,
      tiempoPrepMinutos: parseInt(modalPlatillo.tiempoPrepMinutos, 10) || 15,
      fotoUrl: modalPlatillo.fotoUrl || undefined,
      disponible: modalPlatillo.disponible,
    };

    startTransition(async () => {
      if (modalPlatillo.modo === "crear") {
        const res = await crearPlatilloAction(input);
        if (res.error) {
          setFeedback({ tipo: "error", mensaje: res.error });
        } else if (res.platillo) {
          const nuevo: Platillo = {
            ...(res.platillo as any),
            tieneReceta: false,
            totalIngredientesReceta: 0,
          };
          setPlatillos((prev) => [...prev, nuevo]);
          setFeedback({
            tipo: "exito",
            mensaje: `Platillo "${nuevo.nombre}" creado exitosamente. Recuerda definir su receta para descontar stock.`,
          });
          setModalPlatillo((prev) => ({ ...prev, abierto: false }));
        }
      } else if (modalPlatillo.platilloId) {
        const res = await editarPlatilloAction(modalPlatillo.platilloId, input);
        if (res.error) {
          setFeedback({ tipo: "error", mensaje: res.error });
        } else if (res.platillo) {
          setPlatillos((prev) =>
            prev.map((item) =>
              item.id === res.platillo.id
                ? { ...item, ...(res.platillo as any) }
                : item
            )
          );
          setFeedback({ tipo: "exito", mensaje: `Platillo "${res.platillo.nombre}" actualizado.` });
          setModalPlatillo((prev) => ({ ...prev, abierto: false }));
        }
      }
    });
  };

  const toggleDisponibilidadPlatillo = (p: Platillo) => {
    const nuevaDisp = !p.disponible;
    startTransition(async () => {
      const res = await cambiarDisponibilidadPlatilloAction(p.id, nuevaDisp);
      if (res.error) {
        setFeedback({ tipo: "error", mensaje: res.error });
      } else {
        setPlatillos((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, disponible: nuevaDisp } : item))
        );
        setFeedback({
          tipo: "info",
          mensaje: `Platillo "${p.nombre}" marcado como ${nuevaDisp ? "disponible" : "agotado / no disponible"}.`,
        });
      }
    });
  };

  const manejarEliminarPlatillo = (p: Platillo) => {
    if (!confirm(`¿Deseas eliminar o retirar el platillo "${p.nombre}" del menú?`)) return;

    startTransition(async () => {
      const res = await eliminarPlatilloAction(p.id);
      if (res.error) {
        setFeedback({ tipo: "error", mensaje: res.error });
      } else if (res.desactivado) {
        // Tenía ventas históricas: se desactivó
        setPlatillos((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, disponible: false } : item))
        );
        setFeedback({ tipo: "info", mensaje: res.mensaje || "Platillo desactivado." });
      } else if (res.eliminado) {
        // No tenía ventas: borrado físico
        setPlatillos((prev) => prev.filter((item) => item.id !== p.id));
        setFeedback({ tipo: "exito", mensaje: res.mensaje || "Platillo eliminado." });
      }
    });
  };

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoFoto(true);
    const fd = new FormData();
    fd.append("foto", file);

    try {
      const res = await subirFotoPlatilloAction(fd);
      if (res.error) {
        setFeedback({ tipo: "error", mensaje: res.error });
      } else if (res.fotoUrl) {
        setModalPlatillo((prev) => ({ ...prev, fotoUrl: res.fotoUrl }));
        setFeedback({ tipo: "exito", mensaje: "Foto subida correctamente al bucket público." });
      }
    } catch (err: any) {
      setFeedback({ tipo: "error", mensaje: "Error inesperado al subir foto: " + err.message });
    } finally {
      setSubiendoFoto(false);
    }
  };

  // ─── ACCIONES RECETA ──────────────────────────────────────────────────────

  const abrirGestionReceta = async (p: Platillo) => {
    setModalReceta({
      abierto: true,
      platillo: p,
      items: [],
      cargando: true,
      guardando: false,
    });

    const res = await obtenerRecetaPlatilloAction(p.id);
    if (res.error) {
      setFeedback({ tipo: "error", mensaje: res.error });
      setModalReceta((prev) => ({ ...prev, abierto: false, cargando: false }));
    } else {
      const itemsUI: RecetaItemUI[] = (res.receta || []).map((r: any) => ({
        ingredienteId: r.ingrediente_id,
        nombre: r.ingrediente_nombre,
        unidad_medida: r.unidad_medida,
        costo_unitario: Number(r.costo_unitario) || 0,
        cantidadRequerida: Number(r.cantidad_requerida) || 0,
      }));
      setModalReceta({
        abierto: true,
        platillo: p,
        items: itemsUI,
        cargando: false,
        guardando: false,
      });
    }
  };

  const agregarIngredienteAReceta = (ingId: string) => {
    if (!ingId) return;
    const yaExiste = modalReceta.items.some((i) => i.ingredienteId === ingId);
    if (yaExiste) {
      setFeedback({ tipo: "error", mensaje: "Este ingrediente ya está en la receta." });
      return;
    }
    const ing = ingredientes.find((i) => i.id === ingId);
    if (!ing) return;

    setModalReceta((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          ingredienteId: ing.id,
          nombre: ing.nombre,
          unidad_medida: ing.unidad_medida,
          costo_unitario: Number(ing.costo_unitario) || 0,
          cantidadRequerida: 1,
        },
      ],
    }));
  };

  const actualizarCantidadIngrediente = (ingId: string, cantidad: number) => {
    setModalReceta((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.ingredienteId === ingId ? { ...i, cantidadRequerida: cantidad } : i
      ),
    }));
  };

  const eliminarIngredienteReceta = (ingId: string) => {
    setModalReceta((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.ingredienteId !== ingId),
    }));
  };

  const guardarReceta = async () => {
    if (!modalReceta.platillo) return;

    // Validar cantidades
    for (const item of modalReceta.items) {
      if (item.cantidadRequerida <= 0) {
        setFeedback({
          tipo: "error",
          mensaje: `La cantidad de "${item.nombre}" debe ser mayor a 0.`,
        });
        return;
      }
    }

    setModalReceta((prev) => ({ ...prev, guardando: true }));

    const res = await guardarRecetaPlatilloAction(
      modalReceta.platillo.id,
      modalReceta.items.map((i) => ({
        ingredienteId: i.ingredienteId,
        cantidadRequerida: i.cantidadRequerida,
      }))
    );

    setModalReceta((prev) => ({ ...prev, guardando: false }));

    if (res.error) {
      setFeedback({ tipo: "error", mensaje: res.error });
    } else {
      const tiene = modalReceta.items.length > 0;
      setPlatillos((prev) =>
        prev.map((item) =>
          item.id === modalReceta.platillo?.id
            ? { ...item, tieneReceta: tiene, totalIngredientesReceta: modalReceta.items.length }
            : item
        )
      );
      setFeedback({
        tipo: "exito",
        mensaje: `Receta de "${modalReceta.platillo.nombre}" guardada con ${modalReceta.items.length} ingrediente(s).`,
      });
      setModalReceta((prev) => ({ ...prev, abierto: false }));
    }
  };

  // ─── CÁLCULOS EN VIVO PARA MODAL RECETA ────────────────────────────────────

  const costoTotalReceta = modalReceta.items.reduce(
    (acc, curr) => acc + curr.cantidadRequerida * curr.costo_unitario,
    0
  );
  const precioVentaPlatillo = modalReceta.platillo ? parseFloat(modalReceta.platillo.precio) : 0;
  const foodCostPorcentaje =
    precioVentaPlatillo > 0 ? (costoTotalReceta / precioVentaPlatillo) * 100 : 0;

  // ─── FILTRADO DE PLATILLOS ────────────────────────────────────────────────

  const platillosFiltrados = platillos.filter((p) => {
    const coincideBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(busqueda.toLowerCase()));

    const coincideCategoria =
      filtroCategoria === "todas" || p.categoria_id === filtroCategoria;

    let coincideEstado = true;
    if (filtroEstado === "disponibles") coincideEstado = p.disponible;
    else if (filtroEstado === "agotados") coincideEstado = !p.disponible;
    else if (filtroEstado === "sin_receta") coincideEstado = !p.tieneReceta;

    return coincideBusqueda && coincideCategoria && coincideEstado;
  });

  return (
    <div className="space-y-6">
      {/* Banner / Feedback flotante */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            feedback.tipo === "exito"
              ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : feedback.tipo === "error"
              ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
              : "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.tipo === "exito" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : feedback.tipo === "error" ? (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-sky-600 shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.mensaje}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selector de Pestañas */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("platillos")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              tab === "platillos"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Platillos ({platillos.length})</span>
          </button>
          <button
            onClick={() => setTab("categorias")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              tab === "categorias"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Categorías ({categorias.length})</span>
          </button>
        </div>

        {tab === "platillos" ? (
          <Button onClick={abrirCrearPlatillo} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Platillo
          </Button>
        ) : (
          <Button onClick={abrirCrearCategoria} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Categoría
          </Button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VISTA 1: PLATILLOS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === "platillos" && (
        <div className="space-y-6">
          {/* Barra de Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o descripción..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-orange-500"
              />
            </div>

            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-orange-500"
            >
              <option value="todas">Todas las categorías ({platillos.length})</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {!c.activo ? "(Inactiva)" : ""}
                </option>
              ))}
            </select>

            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="py-2 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-orange-500"
            >
              <option value="todos">Todos los estados</option>
              <option value="disponibles">Solo disponibles</option>
              <option value="agotados">Agotados / Ocultos</option>
              <option value="sin_receta">⚠️ Sin receta definida ({platillos.filter((p) => !p.tieneReceta).length})</option>
            </select>
          </div>

          {/* Advertencia global si hay platillos sin receta */}
          {platillos.some((p) => !p.tieneReceta && p.disponible) && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Hay platillos en venta sin receta de inventario
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                  Los platillos marcados con la etiqueta <strong>"Sin receta"</strong> no descontarán ingredientes
                  automáticamente de tu inventario al venderse. Haz clic en <strong>"Definir Receta"</strong> en cada uno
                  para vincular sus ingredientes.
                </p>
              </div>
            </div>
          )}

          {/* Grilla de Platillos */}
          {platillosFiltrados.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8">
              <UtensilsCrossed className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No se encontraron platillos</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Prueba cambiando los filtros de búsqueda o agrega tu primer platillo al menú.
              </p>
              <Button onClick={abrirCrearPlatillo} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
                <Plus className="w-4 h-4 mr-1.5" />
                Crear Platillo
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {platillosFiltrados.map((p) => {
                const cat = categorias.find((c) => c.id === p.categoria_id);
                return (
                  <Card
                    key={p.id}
                    className={`overflow-hidden transition-all flex flex-col justify-between border ${
                      !p.disponible ? "opacity-75 bg-slate-50 dark:bg-slate-900/50" : "bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div>
                      {/* Cabecera con Foto o Placeholder */}
                      <div className="relative h-40 w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                        {p.foto_url ? (
                          <img
                            src={p.foto_url}
                            alt={p.nombre}
                            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <ImageIcon className="w-10 h-10 mb-1" />
                            <span className="text-xs">Sin imagen</span>
                          </div>
                        )}

                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                          <Badge variant={p.disponible ? "success" : "danger"} size="sm" dot>
                            {p.disponible ? "Disponible" : "Agotado"}
                          </Badge>
                        </div>

                        {cat && (
                          <div className="absolute bottom-2.5 left-2.5">
                            <span className="text-[11px] font-semibold tracking-wide bg-black/60 backdrop-blur-sm text-white px-2.5 py-1 rounded-md">
                              {cat.nombre}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Contenido */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 leading-snug">
                            {p.nombre}
                          </h3>
                          <span className="text-base font-extrabold text-orange-600 dark:text-orange-400 shrink-0">
                            ${parseFloat(p.precio).toFixed(2)}
                          </span>
                        </div>

                        {p.descripcion && (
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{p.descripcion}</p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                          {p.tiempo_prep_minutos && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {p.tiempo_prep_minutos} min
                            </span>
                          )}

                          {/* REQUISITO #3: Advertencia no bloqueante de falta de receta */}
                          {p.tieneReceta ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <ChefHat className="w-3.5 h-3.5" />
                              Receta: {p.totalIngredientesReceta} ingrediente(s)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Sin receta (no descuenta stock)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botonera inferior */}
                    <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2 mt-2">
                      <Button
                        variant={p.tieneReceta ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => abrirGestionReceta(p)}
                        className={`text-xs ${
                          !p.tieneReceta ? "border border-amber-300 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60" : ""
                        }`}
                      >
                        <ChefHat className="w-3.5 h-3.5 mr-1.5" />
                        {p.tieneReceta ? "Ver Receta" : "Definir Receta"}
                      </Button>

                      <div className="flex items-center gap-1">
                        <button
                          title={p.disponible ? "Marcar como agotado" : "Marcar como disponible"}
                          onClick={() => toggleDisponibilidadPlatillo(p)}
                          className={`p-2 rounded-lg transition-colors ${
                            p.disponible
                              ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p.disponible ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </button>

                        <button
                          title="Editar platillo"
                          onClick={() => abrirEditarPlatillo(p)}
                          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          title="Eliminar / Retirar platillo"
                          onClick={() => manejarEliminarPlatillo(p)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VISTA 2: CATEGORÍAS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {tab === "categorias" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Organización de Categorías del Menú
                </h3>
                <p className="text-xs text-slate-500">
                  Define el orden de aparición en el menú digital para los comensales. Las categorías nunca se borran
                  físicamente para preservar el historial de ventas.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {categorias.map((c) => {
                const totalPlatillos = platillos.filter((p) => p.categoria_id === c.id).length;
                return (
                  <div
                    key={c.id}
                    className={`p-4 flex items-center justify-between transition-colors ${
                      !c.activo ? "bg-slate-50/50 dark:bg-slate-950/40 opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center border border-orange-200 dark:border-orange-900/50">
                        #{c.orden}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{c.nombre}</h4>
                          <Badge variant={c.activo ? "success" : "neutral"} size="sm">
                            {c.activo ? "Activa" : "Desactivada"}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {totalPlatillos} platillo(s) en esta categoría
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={c.activo ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => toggleEstadoCategoria(c)}
                        className="text-xs"
                      >
                        {c.activo ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => abrirEditarCategoria(c)}
                        className="text-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CATEGORÍA (CREAR / EDITAR) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {modalCategoria.abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {modalCategoria.modo === "crear" ? "Nueva Categoría" : "Editar Categoría"}
              </h3>
              <button
                onClick={() => setModalCategoria((prev) => ({ ...prev, abierto: false }))}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarCategoria} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de la categoría *
                </label>
                <input
                  type="text"
                  required
                  value={modalCategoria.nombre}
                  onChange={(e) => setModalCategoria((prev) => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej. Entradas, Cortes, Bebidas..."
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Orden de aparición en el menú
                </label>
                <input
                  type="number"
                  min="0"
                  value={modalCategoria.orden}
                  onChange={(e) =>
                    setModalCategoria((prev) => ({ ...prev, orden: parseInt(e.target.value, 10) || 0 }))
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Los números menores se muestran primero en el menú digital.
                </span>
              </div>

              {modalCategoria.modo === "editar" && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estado de la categoría
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalCategoria.activo}
                      onChange={(e) =>
                        setModalCategoria((prev) => ({ ...prev, activo: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalCategoria((prev) => ({ ...prev, abierto: false }))}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {isPending ? "Guardando..." : "Guardar Categoría"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: PLATILLO (CREAR / EDITAR) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {modalPlatillo.abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {modalPlatillo.modo === "crear" ? "Nuevo Platillo" : "Editar Platillo"}
              </h3>
              <button
                onClick={() => setModalPlatillo((prev) => ({ ...prev, abierto: false }))}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarPlatillo} className="p-5 space-y-4">
              {/* REQUISITO #3: Advertencia en modal si no tiene receta */}
              {modalPlatillo.modo === "editar" && !modalPlatillo.tieneReceta && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                    Este platillo no tiene receta — no se descontará inventario automáticamente al venderse.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Platillo *
                  </label>
                  <input
                    type="text"
                    required
                    value={modalPlatillo.nombre}
                    onChange={(e) => setModalPlatillo((prev) => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Ej. Tacos de Ribeye (3 pzas)"
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Categoría *
                  </label>
                  <select
                    required
                    value={modalPlatillo.categoriaId}
                    onChange={(e) => setModalPlatillo((prev) => ({ ...prev, categoriaId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                  >
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {!c.activo ? "(Inactiva)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Precio ($ MXN) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={modalPlatillo.precio}
                    onChange={(e) => setModalPlatillo((prev) => ({ ...prev, precio: e.target.value }))}
                    placeholder="185.00"
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descripción (para el comensal)
                </label>
                <textarea
                  rows={2}
                  value={modalPlatillo.descripcion}
                  onChange={(e) => setModalPlatillo((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Ingredientes principales, preparación, alérgenos..."
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tiempo de preparación estimado (minutos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={modalPlatillo.tiempoPrepMinutos}
                    onChange={(e) =>
                      setModalPlatillo((prev) => ({ ...prev, tiempoPrepMinutos: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex items-center justify-between sm:pt-6">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Disponible para ordenar
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalPlatillo.disponible}
                      onChange={(e) =>
                        setModalPlatillo((prev) => ({ ...prev, disponible: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Subida de Foto (Bucket 'menu-fotos' público) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Fotografía del Platillo (Marketing del Menú)
                </label>
                <div className="flex items-center gap-4">
                  {modalPlatillo.fotoUrl ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                      <img
                        src={modalPlatillo.fotoUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setModalPlatillo((prev) => ({ ...prev, fotoUrl: "" }))}
                        className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white hover:bg-black"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <Upload className="w-6 h-6 mb-0.5" />
                      <span className="text-[10px]">Sin foto</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors">
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>{subiendoFoto ? "Subiendo..." : "Seleccionar imagen"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={subiendoFoto}
                        onChange={subirFoto}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Almacenada en bucket público 'menu-fotos'. JPG, PNG, WEBP (máx. 5MB).
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalPlatillo((prev) => ({ ...prev, abierto: false }))}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isPending || subiendoFoto} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {isPending ? "Guardando..." : "Guardar Platillo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL: RECETA (DESCUENTO DE INVENTARIO) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {modalReceta.abierto && modalReceta.platillo && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 flex items-center justify-center">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    Receta: {modalReceta.platillo.nombre}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ingredientes descontados automáticamente al vender este platillo
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalReceta((prev) => ({ ...prev, abierto: false }))}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* REQUISITO #3: Banner si la receta está vacía */}
              {modalReceta.items.length === 0 && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      Este platillo no tiene receta definida
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      No se descontará inventario automáticamente al venderse. Agrega abajo los ingredientes que consume.
                    </p>
                  </div>
                </div>
              )}

              {/* Selector para agregar ingredientes del catálogo de /inventario */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Agregar ingrediente desde /inventario
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="select-ingrediente"
                    defaultValue=""
                    className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-orange-500"
                  >
                    <option value="" disabled>
                      Selecciona un ingrediente existente...
                    </option>
                    {ingredientes.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.nombre} ({ing.unidad_medida}) — Costo: ${parseFloat(ing.costo_unitario).toFixed(2)} — Stock:{" "}
                        {parseFloat(ing.stock_actual).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const sel = document.getElementById("select-ingrediente") as HTMLSelectElement;
                      if (sel && sel.value) {
                        agregarIngredienteAReceta(sel.value);
                        sel.value = "";
                      }
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>

              {/* Lista de ingredientes agregados */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Ingredientes Requeridos ({modalReceta.items.length})
                </h4>

                {modalReceta.items.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                    No has agregado ningún ingrediente a esta receta todavía.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {modalReceta.items.map((item) => (
                      <div
                        key={item.ingredienteId}
                        className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {item.nombre}
                          </h5>
                          <span className="text-[11px] text-slate-500">
                            Costo: ${item.costo_unitario.toFixed(2)} por {item.unidad_medida}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={item.cantidadRequerida}
                            onChange={(e) =>
                              actualizarCantidadIngrediente(
                                item.ingredienteId,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-right font-mono"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-400 w-10">
                            {item.unidad_medida}
                          </span>

                          <button
                            type="button"
                            onClick={() => eliminarIngredienteReceta(item.ingredienteId)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel de Métricas / Costeo de Receta (Food Cost) */}
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-[11px] text-slate-500 uppercase block">Costo Ingredientes</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    ${costoTotalReceta.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 uppercase block">Precio Venta</span>
                  <span className="text-base font-extrabold text-orange-600 dark:text-orange-400">
                    ${precioVentaPlatillo.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 uppercase block">Food Cost (%)</span>
                  <span
                    className={`text-base font-extrabold ${
                      foodCostPorcentaje > 40
                        ? "text-rose-600"
                        : foodCostPorcentaje > 30
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {foodCostPorcentaje.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Botonera */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalReceta((prev) => ({ ...prev, abierto: false }))}
                >
                  Cerrar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={modalReceta.guardando}
                  onClick={guardarReceta}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {modalReceta.guardando ? "Guardando Receta..." : "Guardar Receta"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

