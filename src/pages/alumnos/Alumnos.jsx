/*
import React, { useEffect, useMemo, useState } from "react";
import "./Alumnos.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import { db, seedMockStudents } from "../../db/indexedDB";
import AlumnoModal from "../../components/alumnos/AlumnoMoodal";
import { computeStatus } from "../../utils/status";

export default function Alumnos() {
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editDni, setEditDni] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    await seedMockStudents();
    const all = await db.students.orderBy("last_name").toArray();
    setStudents(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return students;
    return students.filter(s =>
      s.dni.includes(term) ||
      s.first_name.toLowerCase().includes(term) ||
      s.last_name.toLowerCase().includes(term)
    );
  }, [q, students]);

  const remove = async (dni) => {
    if (!confirm("¿Eliminar este socio?")) return;
    await db.students.delete(dni);
    await load();
  };

  return (
    <div className="alumnos-page">
      <Navbar />

      <main className="alumnos-content">
        <header className="alumnos-header">
          <h2>Socios</h2>
          <div className="actions">
            <button className="btn" onClick={() => { setEditDni(null); setOpenModal(true); }}>+ Nuevo socio</button>
            <button className="btn secondary" onClick={async ()=>{
              const data = await db.students.toArray();
              const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "socios.json"; a.click(); URL.revokeObjectURL(url);
            }}>Exportar JSON</button>
          </div>
        </header>

        <div className="alumnos-toolbar">
          <input
            className="search"
            placeholder="Buscar por DNI, nombre o apellido..."
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
         
        </div>

        <section className="alumnos-table-wrap">
          {loading ? (
            <div className="empty">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No hay socios que coincidan.</div>
          ) : (
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>DNI</th>
                  <th>Apellido, Nombre</th>
                  <th>Inicio</th>
                  <th>Fin plan</th>
                  <th>Estado</th>
                  <th>Activo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s=>{
                  const { left, color } = computeStatus(s, 0); // 0 asistencias en mock
                  return (
                    <tr key={s.dni}>
                      <td>{s.dni}</td>
                      <td>{s.last_name}, {s.first_name}</td>
                      <td>{s.start_date}</td>
                      <td>{s.plan_end_date}</td>
                      <td><span className={`badge ${color}`}>{color.toUpperCase()} · {left}</span></td>
                      <td>{s.active ? "Sí" : "No"}</td>
                      <td className="row-actions">
                        <button className="link" onClick={()=>{ setEditDni(s.dni); setOpenModal(true); }}>Editar</button>
                        <button className="link danger" onClick={()=>remove(s.dni)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <Footer />

      <AlumnoModal
        open={openModal}
        editingDni={editDni}
        onClose={()=>setOpenModal(false)}
        onSaved={load}
      />
    </div>
  );
}
*/
import React, { useEffect, useMemo, useState } from "react";
import "./Alumnos.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import { db, seedMockStudents, getAppConfig } from "../../db/indexedDB";
import AlumnoModal from "../../components/alumnos/AlumnoMoodal";
import { computeMembershipStateForStudent, todayISO } from "../../utils/membership";

export default function Alumnos() {
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("todos"); // "todos" | "por_vencer" | "vencidos"
  const [openModal, setOpenModal] = useState(false);
  const [editDni, setEditDni] = useState(null);
  const [overrideStart, setOverrideStart] = useState(null); // fecha pre-cargada para el modal
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState(null);

  const load = async () => {
    setLoading(true);
    await seedMockStudents();
    const c = await getAppConfig();
    setCfg(c);
    const all = await db.students.orderBy("last_name").toArray();
    setStudents(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Pre-calcular estado de membresía por alumno
  const computed = useMemo(() => {
    if (!cfg) return [];
    const t = todayISO();
    return students.map(s => {
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
      s.first_name.toLowerCase().includes(term) ||
      s.last_name.toLowerCase().includes(term)
    );
  }, [computed, q]);

  // Filtro por pestaña
  const filtered = useMemo(() => {
    if (tab === "todos") return searched;
    if (tab === "por_vencer") return searched.filter(({ st }) => st.semaforo === "yellow" && st.active);
    if (tab === "vencidos") return searched.filter(({ st }) => st.semaforo === "red" || !st.active);
    return searched;
  }, [searched, tab]);

  const remove = async (dni) => {
    if (!confirm("¿Eliminar este socio?")) return;
    await db.students.delete(dni);
    await load();
  };

  // Renovar: por defecto siempre propone "hoy" como nueva fecha de inicio (editable en el modal)
  const renew = (s) => {
    setEditDni(s.dni);
    setOverrideStart(todayISO());
    setOpenModal(true);
  };

  return (
    <div className="alumnos-page">
      <Navbar />

      <main className="alumnos-content">
        <header className="alumnos-header">
          <h2>Socios</h2>
          <div className="actions">
            <button
              className="btn"
              onClick={() => { setEditDni(null); setOverrideStart(null); setOpenModal(true); }}
            >
              + Nuevo socio
            </button>
            <button
              className="btn secondary"
              onClick={async ()=>{
                const data = await db.students.toArray();
                const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "socios.json"; a.click(); URL.revokeObjectURL(url);
              }}
            >
              Exportar JSON
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="alumnos-tabs">
          <button
            className={`tab-btn ${tab === "todos" ? "active" : ""}`}
            onClick={()=>setTab("todos")}
          >
            Todos
          </button>
          <button
            className={`tab-btn ${tab === "por_vencer" ? "active" : ""}`}
            onClick={()=>setTab("por_vencer")}
          >
            Por vencer
          </button>
          <button
            className={`tab-btn ${tab === "vencidos" ? "active" : ""}`}
            onClick={()=>setTab("vencidos")}
          >
            Vencidos
          </button>
        </div>

        <div className="alumnos-toolbar">
          <input
            className="search"
            placeholder="Buscar por DNI, nombre o apellido..."
            value={q}
            onChange={(e)=>setQ(e.target.value)}
          />
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
                      {s.is_trial && <span className="badge blue">PRUEBA</span>}
                    </td>
                    <td>{s.start_date}</td>
                    <td>{s.plan_end_date}</td>
                    <td><span className={`badge ${st.semaforo}`}>{st.semaforo.toUpperCase()}</span></td>
                    <td>{st.active ? "Sí" : "No"}</td>
                    <td className="row-actions">
                      <button
                        className="link"
                        onClick={()=>{ setEditDni(s.dni); setOverrideStart(null); setOpenModal(true); }}
                      >
                        Editar
                      </button>
                      {(tab === "por_vencer" || tab === "vencidos") && (
                        <button className="link" onClick={()=>renew(s)}>Renovar</button>
                      )}
                      <button className="link danger" onClick={()=>remove(s.dni)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <Footer />

      <AlumnoModal
        open={openModal}
        editingDni={editDni}
        onClose={()=>setOpenModal(false)}
        onSaved={load}
        prefillStartDate={overrideStart}    // ← ahora por defecto viene "hoy" si es renovar
        mode={overrideStart ? "renew" : "create"}
      />
    </div>
  );
}
