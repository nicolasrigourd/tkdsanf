import React, { useEffect, useState } from "react";
import "./Principal.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import IngrSocios from "../../components/ingrsocios/IngrSocios";
import ItemAlumno from "../../components/itemalumno/ItemAlumno";
import ConfirmModal from "../../components/confirm/ConfirmModal";
import FinalizarClaseButton from "../../components/finalizar/FinalizarClaseButton";
import StatusNotice from "../../components/notify/StatusNotice";

import {
  getTodayAttendances,
  addAttendanceToday,
  getAttendancesCountForStudent,
  dismissAttendanceToday, // oculta (no borra) la asistencia de hoy
  getAppConfig,           // 👈 umbrales desde config
} from "../../db/indexedDB";
import { computeStatus } from "../../utils/status";

export default function Principal() {
  const [presentes, setPresentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // estado para el modal de eliminar individual
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null); // {dni, nombre}

  // estado para el aviso flotante con sonido
  const [notice, setNotice] = useState({
    open: false,
    type: "green", // "green" | "yellow" | "red"
    title: "",
    message: "",
  });

  const loadToday = async () => {
    setLoading(true);
    const list = await getTodayAttendances(); // trae solo NO ocultos
    const enriched = await Promise.all(
      list.map(async (alum) => {
        const count = await getAttendancesCountForStudent(alum.dni);
        const status = computeStatus(alum, count);
        return { alum, status };
      })
    );
    setPresentes(enriched);
    setLoading(false);
  };

  useEffect(() => {
    loadToday();
  }, []);

  // helper: días entre hoy y fecha fin (puede ser negativo)
  const daysBetween = (isoEnd) => {
    const today = new Date();
    const end = new Date(isoEnd);
    today.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    const diffMs = end - today; // positivo faltan días; negativo vencido
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleIngresarDni = async (dni) => {
    try {
      const cfg = await getAppConfig();
      const res = await addAttendanceToday(dni); // trae _student
      await loadToday();

      const st = res?._student;
      if (!st) return;

      const nombre = `${st.first_name} ${st.last_name}`;
      const dLeft = daysBetween(st.plan_end_date);
      const yellowDays = cfg?.yellow_days_before_end ?? 5;

      if (dLeft < 0) {
        // 🔴 Vencido (no se autocierra, muestra botones)
        setNotice({
          open: true,
          type: "red",
          title: `Cuota vencida`,
          message: `${nombre}, tu cuota está vencida.`,
        });
      } else if (dLeft <= yellowDays) {
        // 🟡 Por vencer (autocierra)
        setNotice({
          open: true,
          type: "yellow",
          title: `Atención`,
          message: `${nombre}, tu cuota vence en ${dLeft} día${dLeft === 1 ? "" : "s"}.`,
        });
      } else {
        // 🟢 Al día (autocierra)
        setNotice({
          open: true,
          type: "green",
          title: `¡Bienvenido! 😊`,
          message: `Hola ${nombre}, ¡que tengas una gran clase!`,
        });
      }
    } catch (e) {
      setMsg(e.message || "No se pudo registrar la asistencia.");
      setTimeout(() => setMsg(""), 3500);
    }
  };

  // Abre el modal con datos del alumno (eliminar individual)
  const requestRemove = (alum) => {
    const nombre = `${alum.last_name}, ${alum.first_name}`;
    setTarget({ dni: alum.dni, nombre });
    setConfirmOpen(true);
  };

  // Confirmar: oculta y recarga
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

  // handlers aviso rojo
  const handleNoticeClose = () => setNotice((n) => ({ ...n, open: false }));
  const goToRenew = () => {
    // Ejemplo: navegar a Socios con filtro de vencidos (cuando lo tengas)
    // navigate("/alumnos?vencidos=1");
    alert("Acción: Renovar plan (conectar al flujo de renovación en Alumnos).");
    handleNoticeClose();
  };
  const requestDefer = () => {
    // Ejemplo: crear solicitud de prórroga / abrir modal
    alert("Acción: Solicitar prórroga (pendiente de implementar).");
    handleNoticeClose();
  };

  return (
    <div className="principal-page">
      <Navbar />

      {/* reforzado por si algún CSS global pisa reglas */}
      <main
        className="principal-content"
        style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
      >
        <IngrSocios onSubmit={handleIngresarDni} />

        {msg && <div className="principal-msg">{msg}</div>}

        {/* Título + botón al costado */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Alumnos presentes hoy</h2>

          <FinalizarClaseButton
            onAfterFinish={async () => {
              await loadToday(); // vacía la lista tras finalizar
            }}
          />
        </div>

        {/* LISTA (scroll interno) */}
        <div
          className="principal-list"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 0",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {loading ? (
            <p>Cargando...</p>
          ) : presentes.length === 0 ? (
            <p>No hay ingresos registrados hoy.</p>
          ) : (
            <div
              className="principal-scroll"
              style={{
                flex: "1 1 0",
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
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

        {/* Aviso flotante con sonido */}
        <StatusNotice
  open={notice.open}
  type={notice.type}
  title={notice.title}
  message={notice.message}
  autoCloseMs={3000}
  onClose={handleNoticeClose}
  onRenew={goToRenew}
  onDefer={requestDefer}
  longSounds={true}        // 👈 usar sonidos largos
  // enableSound={false}   // si querés silenciar
/>

      </main>

      <Footer />

      {/* Modal de confirmación (eliminar individual) */}
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
