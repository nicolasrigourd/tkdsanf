// src/pages/alumnos/Alumnos.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./Alumnos.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import { db, getAppConfig, getClasses } from "../../db/indexedDB";
import AlumnoModal from "../../components/alumnos/AlumnoMoodal";
import PaymentsModal from "../../components/pagos/PaymentsModal";
import BackupsModal from "../../components/backups/BackupsModal";
import { createBackup, getTenantQuota } from "../../utils/backups";
import { computeMembershipStateForStudent, todayISO } from "../../utils/membership";
import ConfirmModal from "../../components/confirm/ConfirmModal"; // 👈 modal de confirmación
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


export default function Alumnos() {
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("todos"); // "todos" | "por_vencer" | "vencidos"
  const [openModal, setOpenModal] = useState(false);
  const [editDni, setEditDni] = useState(null);
  const [overrideStart, setOverrideStart] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cfg, setCfg] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState("all"); // "all" | classId

  // modal de pagos
  const [payOpen, setPayOpen] = useState(false);
  const [payFor, setPayFor] = useState({ dni: null, name: "" });

  // modal de backups (restaurar)
  const [backupsOpen, setBackupsOpen] = useState(false);

  // modal de confirmación de eliminación
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState({ dni: null, name: "" });

  const load = async () => {
    setLoading(true);
    const c = await getAppConfig();
    setCfg(c);
    const cls = await getClasses();
    setClasses(cls);
    const all = await db.students.orderBy("last_name").toArray();
    setStudents(all);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // map id->nombre / id->color
  const classMaps = useMemo(() => {
    const name = new Map();
    const color = new Map();
    classes.forEach((c) => {
      name.set(c.id, c.name);
      color.set(c.id, c.color || "#e5e7eb");
    });
    return { name, color };
  }, [classes]);

  // Pre-calcular estado de membresía
  const computed = useMemo(() => {
    if (!cfg) return [];
    const t = todayISO();
    return students.map((s) => {
      const st = computeMembershipStateForStudent(s, cfg, t);
      return { s, st };
    });
  }, [students, cfg]);

  // Buscador
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return computed;
    return computed.filter(({ s }) =>
      s.dni.includes(term) ||
      (s.first_name || "").toLowerCase().includes(term) ||
      (s.last_name || "").toLowerCase().includes(term)
    );
  }, [computed, q]);

  // Filtro por clase
  const byClass = useMemo(() => {
    if (classFilter === "all") return searched;
    return searched.filter(({ s }) => (s.class_id || "") === classFilter);
  }, [searched, classFilter]);

  // Filtro por pestaña/semaforo
  const filtered = useMemo(() => {
    if (tab === "todos") return byClass;
    if (tab === "por_vencer")
      return byClass.filter(({ st }) => st.semaforo === "yellow" && st.active);
    if (tab === "vencidos")
      return byClass.filter(({ st }) => st.semaforo === "red" || !st.active);
    return byClass;
  }, [byClass, tab]);

  // 👉 Abrir modal de eliminación
  const askRemove = (s) => {
    setToDelete({
      dni: s.dni,
      name: `${s.last_name}, ${s.first_name}`,
    });
    setDeleteOpen(true);
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!toDelete.dni) {
      setDeleteOpen(false);
      return;
    }
    await db.students.delete(toDelete.dni);
    setDeleteOpen(false);
    setToDelete({ dni: null, name: "" });
    await load();
  };

  const handleCancelDelete = () => {
    setDeleteOpen(false);
    setToDelete({ dni: null, name: "" });
  };

  // Renovar: por defecto “hoy”
  const renew = (s) => {
    setEditDni(s.dni);
    setOverrideStart(todayISO());
    setOpenModal(true);
  };

  // Helpers UI
  const classChip = (c) => {
    const active = classFilter === c.id;
    return (
      <button
        key={c.id}
        className={`class-chip ${active ? "active" : ""}`}
        style={{ "--chip-color": c.color || "#e5e7eb" }}
        onClick={() => setClassFilter(c.id)}
        type="button"
        title={c.name}
      >
        <span className="dot" />
        {c.name}
      </button>
    );
  };

  // Copia de seguridad
  const handleCreateBackup = async () => {
    try {
      const quota = await getTenantQuota();
      const left = Number(quota?.backupsLeft ?? 0);
      if (left <= 0) {
        alert("No hay cupo para crear copias de seguridad. Contactá al administrador.");
        return;
      }
      const proceed = confirm(
        `Se creará una copia de seguridad en la nube.\nCupo disponible: ${left}.\n¿Continuar?`
      );
      if (!proceed) return;

      const note = prompt("Agregar una nota (opcional):", "") || "";
      const meta = await createBackup({ note, enforceQuota: true });
      alert(`✅ Copia creada.\nID: ${meta.id}`);
    } catch (e) {
      alert(`❌ Error al crear la copia: ${e?.message || e}`);
    }
  };

  // Exportar / descargar listado en PDF
const handlePrint = () => {
  if (!students || students.length === 0) {
    alert("No hay socios para exportar.");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const title = "Listado de Socios";
  const generatedAt = `Generado: ${new Date().toLocaleString("es-AR")}`;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 14, 18);

  // Subtítulo fecha
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(generatedAt, 14, 24);

  // Tabla
  const head = [["DNI", "Apellido, Nombre", "Clase", "Inicio", "Fin plan", "Activo"]];

  const body = students.map((s) => [
    s.dni || "",
    `${s.last_name || ""}, ${s.first_name || ""}`,
    s.class_id || "—",
    s.start_date || "—",
    s.plan_end_date || "—",
    s.active ? "Sí" : "No",
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 30,
    styles: {
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
  });

  doc.save("listado-socios.pdf");
};

  return (
    <div className="alumnos-page">
      <Navbar />

      <main className="alumnos-content">
        <header className="alumnos-header">
          <h2>Socios</h2>
          <div className="actions">
            <button
              className="btn btn-green"
              onClick={handleCreateBackup}
              title="Crear copia de seguridad en la nube"
              type="button"
            >
              ☁️ Crear copia
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => setBackupsOpen(true)}
              title="Restaurar desde copias guardadas"
              type="button"
            >
              ☁️ Restaurar
            </button>

            <button
              className="btn btn-ghost"
              onClick={handlePrint}
              title="Imprimir listado de socios"
              type="button"
            >
              🖨️ Imprimir
            </button>

            <button
              className="btn btn-primary"
              onClick={() => {
                setEditDni(null);
                setOverrideStart(null);
                setOpenModal(true);
              }}
              type="button"
            >
              + Nuevo socio
            </button>
          </div>
        </header>

        {/* Tabs estado */}
        <div className="alumnos-tabs">
          <button
            className={`tab-btn ${tab === "todos" ? "active" : ""}`}
            onClick={() => setTab("todos")}
            type="button"
          >
            Todos
          </button>
          <button
            className={`tab-btn ${tab === "por_vencer" ? "active" : ""}`}
            onClick={() => setTab("por_vencer")}
            type="button"
          >
            Por vencer
          </button>
          <button
            className={`tab-btn ${tab === "vencidos" ? "active" : ""}`}
            onClick={() => setTab("vencidos")}
            type="button"
          >
            Vencidos
          </button>
        </div>

        {/* Filtros */}
        <div className="alumnos-toolbar">
          <input
            className="search"
            placeholder="Buscar por DNI, nombre o apellido..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="class-filter">
            <button
              type="button"
              className={`class-chip ${classFilter === "all" ? "active" : ""}`}
              onClick={() => setClassFilter("all")}
              title="Todas las clases"
            >
              Todas
            </button>
            {classes.map((c) => classChip(c))}
          </div>
        </div>

        <section className="alumnos-table-wrap">
          {loading ? (
            <div className="empty">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No hay socios en esta vista.</div>
          ) : (
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>DNI</th>
                  <th>Apellido, Nombre</th>
                  <th>Clase</th>
                  <th>Inicio</th>
                  <th>Fin plan</th>
                  <th>Estado</th>
                  <th>Activo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ s, st }) => (
                  <tr key={s.dni}>
                    <td>{s.dni}</td>
                    <td>
                      {s.last_name}, {s.first_name}{" "}
                      {s.is_trial && <span className="badge badge-tag blue">PRUEBA</span>}
                    </td>
                    <td>
                      {classMaps.name.get(s.class_id) ? (
                        <span
                          className="class-tag"
                          style={{
                            "--tag-color": classMaps.color.get(s.class_id) || "#e5e7eb",
                          }}
                          title={classMaps.name.get(s.class_id)}
                        >
                          <span className="dot" />
                          {classMaps.name.get(s.class_id)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{s.start_date}</td>
                    <td>{s.plan_end_date}</td>

                    <td>
                      <span
                        className={`badge badge-state ${st.semaforo}`}
                        title={st.semaforo.toUpperCase()}
                        aria-label={st.semaforo}
                      >
                        {st.semaforo === "green"
                          ? "Al día"
                          : st.semaforo === "yellow"
                          ? "Por vencer"
                          : "Vencido"}
                      </span>
                    </td>

                    <td>{st.active ? "Sí" : "No"}</td>
                    <td className="row-actions">
                      <button
                        className="link action-btn"
                        onClick={() => {
                          setEditDni(s.dni);
                          setOverrideStart(null);
                          setOpenModal(true);
                        }}
                        type="button"
                      >
                        Editar
                      </button>

                      <button
                        className="link action-btn"
                        onClick={() => {
                          setPayFor({
                            dni: s.dni,
                            name: `${s.last_name}, ${s.first_name}`,
                          });
                          setPayOpen(true);
                        }}
                        type="button"
                      >
                        Pagos
                      </button>

                      {(tab === "por_vencer" || tab === "vencidos") && (
                        <button
                          className="link action-btn"
                          onClick={() => renew(s)}
                          type="button"
                        >
                          Renovar
                        </button>
                      )}

                      <button
                        className="link action-btn danger"
                        onClick={() => askRemove(s)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <Footer />

      {/* Modal socio (crear/editar/renovar) */}
      <AlumnoModal
        open={openModal}
        editingDni={editDni}
        onClose={() => setOpenModal(false)}
        onSaved={load}
        prefillStartDate={overrideStart}
        mode={overrideStart ? "renew" : editDni ? "edit" : "create"}
      />

      {/* Modal pagos */}
      <PaymentsModal
        open={payOpen}
        dni={payFor.dni}
        studentName={payFor.name}
        onClose={() => setPayOpen(false)}
      />

      {/* Modal backups (restaurar) */}
      <BackupsModal
        open={backupsOpen}
        onClose={() => setBackupsOpen(false)}
        onRestored={() => {
          load();
        }}
      />

      {/* Modal confirmar eliminación de socio */}
      <ConfirmModal
        open={deleteOpen}
        title="Eliminar socio"
        message={
          toDelete.dni
            ? `¿Querés eliminar al socio "${toDelete.name}" del padrón? Esta acción es permanente.`
            : "¿Eliminar este socio?"
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
