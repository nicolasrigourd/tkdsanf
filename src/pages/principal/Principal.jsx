// src/pages/principal/Principal.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./Principal.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import IngrSocios from "../../components/ingrsocios/IngrSocios";
import ItemAlumno from "../../components/itemalumno/ItemAlumno";
import ConfirmModal from "../../components/confirm/ConfirmModal";
import FinalizarClaseButton from "../../components/finalizar/FinalizarClaseButton";
import StatusModal from "../../components/notify/StatusModal";
import AlumnoModal from "../../components/alumnos/AlumnoMoodal";

import {
  db,
  getTodayAttendances,
  addAttendanceToday,
  dismissAttendanceToday,
  getAppConfig,
  getClasses,
} from "../../db/indexedDB";
import { computeMembershipStateForStudent, todayISO } from "../../utils/membership";

// Helper: días transcurridos desde la fecha de fin de plan.
// > 0  => ya venció hace N días
// = 0  => vence hoy
// < 0  => todavía no venció
const daysSincePlanEnd = (isoEnd) => {
  if (!isoEnd) return 0;
  const today = new Date();
  const end = new Date(isoEnd);
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffMs = today - end; // hoy - fin
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

export default function Principal() {
  const [presentesAll, setPresentesAll] = useState([]); // todas las asistencias visibles de HOY
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // clases y filtro
  const [classes, setClasses] = useState([]);
  const [activeClassId, setActiveClassId] = useState(null);
  const [pendingByClass, setPendingByClass] = useState({}); // { [classId]: number }

  // eliminar individual
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null); // {dni, nombre}

  // modal de estado (verde/amarillo/rojo)
  const [statusModal, setStatusModal] = useState({
    open: false,
    type: "green", // "green" | "yellow" | "red"
    title: "",
    message: "",
  });

  // renovación (abre AlumnoModal)
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDni, setRenewDni] = useState(null);
  const [renewStartDate, setRenewStartDate] = useState(null);

  // ====== CARGA INICIAL: asistencias + clases ======
  const loadToday = async () => {
    setLoading(true);

    const [list, cls, cfg] = await Promise.all([
      getTodayAttendances(),
      getClasses(),
      getAppConfig(),
    ]);

    setClasses(cls);
    if (!activeClassId && cls.length > 0) setActiveClassId(cls[0].id);

    const today = todayISO();

    // Enriquecemos con el mismo criterio de "Socios"
    const enriched = await Promise.all(
      list.map(async (alum) => {
        const state = computeMembershipStateForStudent(alum, cfg, today);
        const status = { color: state.semaforo, left: state.remainingClasses ?? 0 };
        return { alum, status };
      })
    );

    setPresentesAll(enriched);
    setLoading(false);
  };

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =======================
  //  INGRESO POR DNI con manejo de DÍAS DE GRACIA
  // =======================
  const handleIngresarDni = async (dni) => {
    try {
      const cfg = await getAppConfig();
      const st = await db.students.get(dni);

      if (!st) {
        setMsg("No se encontró el alumno.");
        setTimeout(() => setMsg(""), 3000);
        return;
      }

      const today = todayISO();
      const membership = computeMembershipStateForStudent(st, cfg, today);
      const nombre = `${st.first_name || ""} ${st.last_name || ""}`.trim();

      const graceDays = cfg?.grace_days_after_due ?? 0;
      const diffDays = daysSincePlanEnd(st.plan_end_date); // >0 = ya vencido

      // ⛔ Caso 1: vencido + sin gracia disponible => bloqueo total
      if (diffDays > graceDays) {
        setRenewDni(st.dni);
        setRenewStartDate(todayISO());

        setStatusModal({
          open: true,
          type: "red",
          title: "Membresía vencida",
          message:
            "Tu cuota está vencida y ya no tenés días de gracia. Renová el plan para continuar asistiendo.",
        });

        // 🔒 NO se registra asistencia
        return;
      }

      // ✅ Caso 2: todavía puede entrar (antes del vencimiento o dentro de los días de gracia)
      const res = await addAttendanceToday(dni);
      await loadToday();

      const stAfter = res?._student || st;

      // pendiente si pertenece a otra clase
      if (activeClassId && stAfter.class_id && stAfter.class_id !== activeClassId) {
        setPendingByClass((prev) => ({
          ...prev,
          [stAfter.class_id]: (prev[stAfter.class_id] || 0) + 1,
        }));
      }

      // Mensaje según situación:

      // 🔴 Caso 2.a: vencido pero dentro de los días de gracia
      if (diffDays > 0) {
        setStatusModal({
          open: true,
          type: "red",
          title: "Membresía vencida (días de gracia)",
          message:
            graceDays > 0
              ? `${nombre}, tu cuota está vencida, pero todavía estás dentro de los ${graceDays} día${
                  graceDays === 1 ? "" : "s"
                } de gracia para regularizar el pago.`
              : `${nombre}, tu cuota está vencida pero aún se permite el ingreso de forma excepcional.`,
        });
        return;
      }

      // 🟡 / 🟢 Caso 2.b: todavía no venció (diffDays <= 0)
      if (membership.semaforo === "yellow") {
        setStatusModal({
          open: true,
          type: "yellow",
          title: "Atención",
          message: `${nombre}, tu membresía está dentro del período de pago o próxima a vencer.`,
        });
      } else {
        setStatusModal({
          open: true,
          type: "green",
          title: "¡Bienvenido! 😊",
          message: `Hola ${nombre}, ¡que tengas una gran clase!`,
        });
      }
    } catch (e) {
      setMsg(e.message || "No se pudo registrar la asistencia.");
      setTimeout(() => setMsg(""), 3500);
    }
  };

  // eliminar individual
  const requestRemove = (alum) => {
    const nombre = `${alum.last_name}, ${alum.first_name}`;
    setTarget({ dni: alum.dni, nombre });
    setConfirmOpen(true);
  };

  const confirmRemove = async () => {
    if (!target) return;
    const ok = await dismissAttendanceToday(target.dni);
    setConfirmOpen(false);
    setTarget(null);
    if (ok) await loadToday();
    else {
      setMsg("No había asistencia de hoy para ocultar.");
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const cancelRemove = () => {
    setConfirmOpen(false);
    setTarget(null);
  };

  // modal estado
  const closeModal = () => setStatusModal((m) => ({ ...m, open: false }));
  const renewNow = () => {
    setStatusModal((m) => ({ ...m, open: false }));
    if (renewDni) setRenewOpen(true);
  };
  const askDefer = () => {
    alert("Flujo de prórroga (pendiente)");
  };

  // lista filtrada por clase activa
  const presentes = useMemo(() => {
    if (!activeClassId) return [];
    return presentesAll.filter(({ alum }) => (alum.class_id || "") === activeClassId);
  }, [presentesAll, activeClassId]);

  const handleSelectClass = (classId) => {
    setActiveClassId(classId);
    setPendingByClass((prev) => {
      if (!prev[classId]) return prev;
      const copy = { ...prev };
      delete copy[classId];
      return copy;
    });
  };

  const renderClassChip = (c) => {
    const active = activeClassId === c.id;
    const pending = pendingByClass[c.id] || 0;
    const hasPending = pending > 0 && !active;
    return (
      <button
        key={c.id}
        type="button"
        className={`class-chip ${active ? "active" : ""} ${hasPending ? "has-pending" : ""}`}
        style={{ "--chip-color": c.color || "#e5e7eb" }}
        onClick={() => handleSelectClass(c.id)}
        title={c.name}
      >
        <span className="dot" />
        {c.name}
        {pending > 0 && <span className="badge">{pending}</span>}
      </button>
    );
  };

  const activeClass = classes.find((c) => c.id === activeClassId);
  const activeClassName = activeClass ? activeClass.name : "Sin clase seleccionada";

  return (
    <div className="principal-page">
      <Navbar />

      <main className="principal-content">
        {/* HEADER: clases disponibles (en tarjeta) + input ingreso */}
        <div className="principal-header">
          <div className="header-left">
            <div className="clases-card">
              <h2 className="clases-title">Clases disponibles</h2>
              <div className="class-filter-scroll">
                {classes.length === 0 ? (
                  <span className="no-classes-text">
                    No hay clases definidas. Crealas en <b>Configuración → Clases</b>.
                  </span>
                ) : (
                  <div className="class-filter">
                    {classes.map((c) => renderClassChip(c))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="header-right">
            <IngrSocios onSubmit={handleIngresarDni} />
          </div>
        </div>

        {msg && <div className="principal-msg">{msg}</div>}

        {/* CONTENEDOR PRINCIPAL + BOTÓN FINALIZAR */}
        <div className="principal-list-wrapper">
          <div className="principal-list">
            <div className="principal-list-header">
              <span className="principal-list-title">{activeClassName}</span>
            </div>

            <div className="principal-list-body">
              {loading ? (
                <div className="principal-list-empty">
                  <p>Cargando...</p>
                </div>
              ) : !activeClassId ? (
                <div className="principal-list-empty">
                  <p>Seleccioná una clase para ver los presentes.</p>
                </div>
              ) : presentes.length === 0 ? (
                <div className="principal-list-empty">
                  <p>No hay ingresos registrados hoy para esta clase.</p>
                </div>
              ) : (
                <div className="principal-scroll">
                  {presentes.map(({ alum, status }) => (
                    <ItemAlumno
                      key={alum.dni}
                      alumno={alum}
                      status={status}
                      onRemove={() => requestRemove(alum)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="principal-actions">
            <FinalizarClaseButton
              currentClassId={activeClassId}
              onAfterFinish={async () => await loadToday()}
              disabled={!activeClassId}
            />
          </div>
        </div>

        {/* MODAL GENERAL DE ESTADO */}
        <StatusModal
          open={statusModal.open}
          type={statusModal.type}
          title={statusModal.title}
          message={statusModal.message}
          onClose={closeModal}
          onRenew={renewNow}
          autoCloseMs={3000}
        />

        {/* MODAL DE RENOVACIÓN */}
        <AlumnoModal
          open={renewOpen}
          onClose={() => setRenewOpen(false)}
          onSaved={async () => {
            setRenewOpen(false);
            await loadToday();
          }}
          editingDni={renewDni}
          prefillStartDate={renewStartDate}
          mode="renew"
        />
      </main>

      <Footer />

      {/* Confirmar eliminación */}
      <ConfirmModal
        open={confirmOpen}
        title="Eliminar de la lista"
        message={
          target
            ? `¿Querés eliminar a "${target.nombre}" de la lista de hoy? La asistencia se mantendrá.`
            : "¿Eliminar este ítem de la lista?"
        }
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
      />
    </div>
  );
}
