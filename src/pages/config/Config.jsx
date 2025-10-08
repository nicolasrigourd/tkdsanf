import React, { useEffect, useState } from "react";
import "./Config.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import { getAppConfig, saveAppConfig } from "../../db/indexedDB";

export default function Config() {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const cfg = await getAppConfig();
      setForm(cfg);
      setLoading(false);
    })();
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    // normalizamos números
    const numLike = [
      "price_base",
      "yellow_days_before_end",
      "grace_days_after_end",
      "family_discount_pct",
      "new_student_discount_pct",
      "trial_days", // ← agregado
    ];
    setForm((p) => ({
      ...p,
      [name]: numLike.includes(name) ? Number(value) : value,
    }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    await saveAppConfig(form);
    setMsg("Configuración guardada.");
    setTimeout(() => setMsg(""), 2500);
  };

  if (loading || !form) {
    return (
      <div className="config-page">
        <Navbar />
        <main className="config-content"><p>Cargando configuración...</p></main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="config-page">
      <Navbar />
      <main className="config-content">
        <h2>Configuración</h2>

        <form className="config-form" onSubmit={onSave}>
          <fieldset>
            <legend>Precios y descuentos</legend>
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
          </fieldset>

          <fieldset>
            <legend>Semáforo y gracia</legend>
            <label>
              Días antes del fin (amarillo)
              <input
                type="number"
                name="yellow_days_before_end"
                value={form.yellow_days_before_end}
                onChange={onChange}
                min="0"
              />
            </label>
            <label>
              Días de gracia post-vencimiento
              <input
                type="number"
                name="grace_days_after_end"
                value={form.grace_days_after_end}
                onChange={onChange}
                min="0"
              />
            </label>
          </fieldset>

          {/* === NUEVO: Prueba gratuita === */}
          <fieldset>
            <legend>Prueba gratuita</legend>
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
          </fieldset>

          <div className="config-actions">
            <button className="btn primary" type="submit">Guardar</button>
          </div>

          {msg && <div className="config-msg">{msg}</div>}
        </form>
      </main>
      <Footer />
    </div>
  );
}
