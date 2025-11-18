// src/pages/config/Config.jsx
import React, { useEffect, useState } from "react";
import "./Config.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import {
  getAppConfig,
  saveAppConfig,
  getClasses,
  addClass,
  updateClass,
  deleteClass,
} from "../../db/indexedDB";

export default function Config() {
  // ----- Config general -----
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // ----- Clases (grupos) -----
  const [classes, setClasses] = useState([]);
  const [clsForm, setClsForm] = useState({ name: "", color: "#93c5fd" });
  const [editingId, setEditingId] = useState(null);
  const [clsError, setClsError] = useState("");
  const [clsMsg, setClsMsg] = useState("");

  useEffect(() => {
    (async () => {
      const cfg = await getAppConfig();
      setForm({
        ...cfg,

        // Defaults de los NUEVOS campos si aún no existen en IndexedDB
        cycle_due_day: Number.isFinite(cfg.cycle_due_day) ? cfg.cycle_due_day : 1, // día 1
        payment_window_end_day: Number.isFinite(cfg.payment_window_end_day)
          ? cfg.payment_window_end_day
          : 10, // 1→10
        yellow_days_after_due: Number.isFinite(cfg.yellow_days_after_due)
          ? cfg.yellow_days_after_due
          : 5,
        grace_days_after_due: Number.isFinite(cfg.grace_days_after_due)
          ? cfg.grace_days_after_due
          : 0,
      });

      const list = await getClasses();
      setClasses(list);
      setLoading(false);
    })();
  }, []);

  const numberKeys = new Set([
    // NUEVO esquema
    "cycle_due_day",
    "payment_window_end_day",
    "yellow_days_after_due",
    "grace_days_after_due",
    // Precios/desc.
    "price_base",
    "family_discount_pct",
    "new_student_discount_pct",
    "trial_days",
  ]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]: numberKeys.has(name) ? Number(value) : value,
    }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    await saveAppConfig(form);
    setMsg("Configuración guardada.");
    setTimeout(() => setMsg(""), 2500);
  };

  // ----- CRUD de clases -----
  const reloadClasses = async () => {
    const list = await getClasses();
    setClasses(list);
  };

  const submitClass = async () => {
    setClsError("");
    try {
      if (!clsForm.name.trim()) {
        setClsError("El nombre de la clase es obligatorio.");
        return;
      }
      if (editingId) {
        await updateClass(editingId, clsForm);
        setClsMsg("Clase actualizada.");
      } else {
        await addClass(clsForm);
        setClsMsg("Clase agregada.");
      }
      setTimeout(() => setClsMsg(""), 1800);
      setClsForm({ name: "", color: "#93c5fd" });
      setEditingId(null);
      await reloadClasses();
    } catch (err) {
      setClsError(err.message || "No se pudo guardar la clase.");
    }
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setClsForm({ name: it.name, color: it.color || "#93c5fd" });
    setClsError("");
    setClsMsg("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setClsForm({ name: "", color: "#93c5fd" });
    setClsError("");
  };

  const removeClass = async (id) => {
    if (
      !confirm(
        "¿Eliminar esta clase? Los alumnos conservarán su classId (no se borra alumno)."
      )
    )
      return;
    await deleteClass(id);
    await reloadClasses();
  };

  // Permitir Enter en inputs de clases SIN enviar el form principal
  const handleClassKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      submitClass();
    }
  };

  if (loading || !form) {
    return (
      <div className="config-page">
        <Navbar />
        <main className="config-content">
          <p>Cargando configuración...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="config-page">
      <Navbar />
      <main className="config-content">
        <h2>Configuración</h2>

        {/* ===== FORM PRINCIPAL (único form) ===== */}
        <form className="config-form" onSubmit={onSave}>
          {/* === Card: Ciclos y ventana de pago (NUEVO ESQUEMA) === */}
          <fieldset className="cfg-card">
            <div className="cfg-card-head">
              <h3>Ciclo mensual y ventana de pago</h3>
              <p>
                Normaliza el vencimiento al <b>día {form.cycle_due_day}</b> del mes siguiente.
                Del <b>día {form.cycle_due_day}</b> al{" "}
                <b>{form.payment_window_end_day}</b> es la ventana de pago.
              </p>
            </div>
            <div className="cfg-grid">
              <label title="Día del mes siguiente en el que vence la membresía">
                Día de vencimiento (mes siguiente)
                <input
                  type="number"
                  name="cycle_due_day"
                  value={form.cycle_due_day}
                  onChange={onChange}
                  min="1"
                  max="28"
                />
              </label>

              <label title="Último día de la ventana de pago (comienza en 'día de vencimiento')">
                Fin de ventana de pago
                <input
                  type="number"
                  name="payment_window_end_day"
                  value={form.payment_window_end_day}
                  onChange={onChange}
                  min={form.cycle_due_day}
                  max="28"
                />
              </label>

              <label title="Días posteriores al vencimiento que se muestran en amarillo si no pagó el mes actual">
                Días en amarillo post-vencimiento
                <input
                  type="number"
                  name="yellow_days_after_due"
                  value={form.yellow_days_after_due}
                  onChange={onChange}
                  min="0"
                  max="31"
                />
              </label>

              <label title="Días de gracia post-vencimiento antes de pasar a rojo (bloqueo)">
                Días de gracia (bloqueo rojo)
                <input
                  type="number"
                  name="grace_days_after_due"
                  value={form.grace_days_after_due}
                  onChange={onChange}
                  min="0"
                  max="31"
                />
              </label>
            </div>
            <div className="cfg-hint">
              <small>
                Sugerencia: <b>vencimiento 1</b>, <b>ventana hasta 10</b>, <b>amarillo 5</b>,{" "}
                <b>gracia 0</b> o <b>5</b>.
              </small>
            </div>
          </fieldset>

          {/* === Card: Precios y descuentos === */}
          <fieldset className="cfg-card">
            <div className="cfg-card-head">
              <h3>Precios y descuentos</h3>
              <p>Definí el valor base y descuentos aplicables.</p>
            </div>
            <div className="cfg-grid">
              <label>
                Valor de cuota base ($)
                <input
                  type="number"
                  name="price_base"
                  value={form.price_base}
                  onChange={onChange}
                  min="0"
                />
              </label>
              <label>
                % descuento alumno nuevo
                <input
                  type="number"
                  name="new_student_discount_pct"
                  value={form.new_student_discount_pct}
                  onChange={onChange}
                  min="0"
                  max="100"
                />
              </label>
              <label>
                % descuento familiar/hermano
                <input
                  type="number"
                  name="family_discount_pct"
                  value={form.family_discount_pct}
                  onChange={onChange}
                  min="0"
                  max="100"
                />
              </label>
              <label>
                Política ingreso mitad de mes
                <select
                  name="midmonth_policy"
                  value={form.midmonth_policy}
                  onChange={onChange}
                >
                  <option value="manual">Manual (decido al cargar)</option>
                  <option value="prorate">Prorratear automáticamente</option>
                </select>
              </label>
            </div>
          </fieldset>

          {/* === Card: Prueba gratuita === */}
          <fieldset className="cfg-card">
            <div className="cfg-card-head">
              <h3>Prueba gratuita</h3>
              <p>Definí el cupón y la duración de la prueba.</p>
            </div>
            <div className="cfg-grid">
              <label>
                Código de cupón de prueba
                <input
                  type="text"
                  name="trial_coupon_code"
                  value={form.trial_coupon_code || ""}
                  onChange={onChange}
                  placeholder="Ej: TKDPRUEBA"
                />
              </label>
              <label>
                Días de duración de la prueba
                <input
                  type="number"
                  name="trial_days"
                  value={form.trial_days ?? 1}
                  onChange={onChange}
                  min="1"
                  max="7"
                />
              </label>
            </div>
          </fieldset>

          <div className="config-actions">
            <button className="btn primary" type="submit">
              Guardar
            </button>
          </div>

          {msg && <div className="config-msg">{msg}</div>}
        </form>

        {/* ===== CLASES / GRUPOS (FUERA del form principal) ===== */}
        <fieldset className="cfg-card" style={{ marginTop: 14 }}>
          <div className="cfg-card-head">
            <h3>Clases / Grupos</h3>
            <p>
              Definí las clases (Infantil, Juvenil, Adultos) para asignarlas a alumnos y filtrar
              en Home.
            </p>
          </div>

          <div className="cls-form-inline" onKeyDown={handleClassKeyDown}>
            <label className="cls-field">
              <span>Nombre</span>
              <input
                type="text"
                value={clsForm.name}
                onChange={(e) =>
                  setClsForm((f) => ({
                    ...f,
                    name: e.target.value,
                  }))
                }
                placeholder="Ej: Infantil"
              />
            </label>

            <label className="cls-field narrow">
              <span>Color</span>
              <input
                type="color"
                value={clsForm.color}
                onChange={(e) =>
                  setClsForm((f) => ({
                    ...f,
                    color: e.target.value,
                  }))
                }
                aria-label="Color de la clase"
              />
            </label>

            <div className="cls-actions">
              <button type="button" className="btn primary" onClick={submitClass}>
                {editingId ? "Guardar cambios" : "Agregar clase"}
              </button>
              {editingId && (
                <button type="button" className="btn ghost" onClick={cancelEdit}>
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {clsError && <div className="cfg-msg error">{clsError}</div>}
          {clsMsg && <div className="cfg-msg ok">{clsMsg}</div>}

          <ul className="cls-list">
            {classes.length === 0 ? (
              <li className="cls-empty">No hay clases definidas.</li>
            ) : (
              classes.map((it) => (
                <li key={it.id} className="cls-item">
                  <span
                    className="cls-color"
                    style={{ background: it.color || "#e5e7eb" }}
                  />
                  <span className="cls-name">{it.name}</span>
                  <div className="cls-item-actions">
                    <button
                      className="mini"
                      type="button"
                      onClick={() => startEdit(it)}
                    >
                      Editar
                    </button>
                    <button
                      className="mini danger"
                      type="button"
                      onClick={() => removeClass(it.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </fieldset>
      </main>
      <Footer />
    </div>
  );
}
