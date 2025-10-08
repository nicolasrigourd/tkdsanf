// src/components/alumnos/AlumnoModal.jsx
/*
import React, { useEffect, useMemo, useState } from "react";
import "./AlumnoModal.css";
import { db, getAppConfig } from "../../db/indexedDB";
import {
  countMonToSat,
  addDays,
  todayISO,
  calcEndDateWithWindow,
  baselineFullClassesForProration,
} from "../../utils/membership";

export default function AlumnoModal({
  open,
  onClose,
  onSaved,
  editingDni = null,
  prefillStartDate = null,
  mode = "create", // "create" | "renew" | "edit"
}) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    dni: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    start_date: todayISO(),
    is_new_student: false,
    is_family: false,
    manual_discount_amount: 0,
    coupon: "",
    active: true,
  });
  const [error, setError] = useState("");

  // Cargar config + datos si edita/renueva
  useEffect(() => {
    if (!open) return;
    (async () => {
      const c = await getAppConfig();
      setCfg(c);

      if (editingDni) {
        const st = await db.students.get(editingDni);
        if (st) {
          setForm({
            dni: st.dni,
            first_name: st.first_name || "",
            last_name: st.last_name || "",
            phone: st.phone || "",
            address: st.address || "",
            // si viene prefillStartDate (renovar), usarlo; sino la original
            start_date: prefillStartDate ? prefillStartDate : (st.start_date || todayISO()),
            is_new_student: false, // en renovación/edición no aplicamos "nuevo" por defecto
            is_family: !!st.is_family,
            manual_discount_amount: 0, // reset manual
            coupon: "", // renovar/editar NO usa cupón de prueba por defecto
            active: true,
          });
        }
      } else {
        // Alta: default hoy (o prefill si un día lo pasás)
        setForm((f) => ({
          ...f,
          start_date: prefillStartDate ? prefillStartDate : todayISO(),
          manual_discount_amount: 0,
          coupon: "",
        }));
      }
      setError("");
    })();
  }, [open, editingDni, prefillStartDate]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]:
        type === "checkbox"
          ? checked
          : name === "manual_discount_amount"
          ? Number(value)
          : value,
    }));
  };

  // Cálculos derivados (fin, clases, precio, estado de ventana)
  const derived = useMemo(() => {
    if (!cfg) {
      return {
        end_date: form.start_date,
        total_classes: 0,
        is_trial: false,
        price_applied: 0,
        price_base: 0,
        isOutOfWindow: false,
        suggestedProratedPrice: null,
      };
    }

    const isTrial =
      form.coupon &&
      cfg.trial_coupon_code &&
      form.coupon.trim().toUpperCase() === cfg.trial_coupon_code.toUpperCase();

    const windowEnd = cfg.billing_window_end_day ?? 10;
    const start = form.start_date || todayISO();
    const startDay = Number(start.split("-")[2] || "1");

    // Fin de plan anclado (o trial)
    const end = isTrial
      ? addDays(start, Math.max(1, cfg.trial_days || 1))
      : calcEndDateWithWindow(start, windowEnd);

    const total_classes = isTrial ? 1 : countMonToSat(start, end);
    const priceBase = cfg.price_base || 0;

    // Precio base según política
    let price = isTrial ? 0 : priceBase;

    // detectamos “fuera de ventana” solo para manual y no trial
    const isOutOfWindow = !isTrial && cfg.midmonth_policy === "manual" && startDay > windowEnd;

    // Sugerencia de prorrateo (para mostrar y acción rápida en manual)
    let suggestedProratedPrice = null;
    if (!isTrial && startDay > windowEnd) {
      const baseline = Math.max(
        1,
        baselineFullClassesForProration(start, windowEnd)
      );
      const factor = Math.min(1, total_classes / baseline);
      suggestedProratedPrice = Math.round(priceBase * factor);
    }

    // Descuentos (si no es trial)
    if (!isTrial) {
      if (form.is_new_student && cfg.new_student_discount_pct) {
        price = Math.round(
          price * (1 - cfg.new_student_discount_pct / 100)
        );
      }
      if (form.is_family && cfg.family_discount_pct) {
        price = Math.round(price * (1 - cfg.family_discount_pct / 100));
      }
      if (cfg.midmonth_policy === "manual" && form.manual_discount_amount > 0) {
        price = Math.max(0, price - form.manual_discount_amount);
      }
      // Nota: si tu policy fuera "prorate", el prorrateo se haría antes de descuentos
      // (ya lo implementamos en una versión previa si cambiás la policy).
    }

    return {
      end_date: end,
      total_classes,
      is_trial: isTrial,
      price_applied: price,
      price_base: priceBase,
      isOutOfWindow,
      suggestedProratedPrice,
    };
  }, [cfg, form]);

  // Acciones rápidas para el aviso fuera de ventana
  const applyFullPrice = () => {
    setForm((p) => ({ ...p, manual_discount_amount: 0 }));
  };
  const applySuggestedProrate = () => {
    if (derived.suggestedProratedPrice == null) return;
    const delta = Math.max(
      0,
      (derived.price_base || 0) - derived.suggestedProratedPrice
    );
    setForm((p) => ({ ...p, manual_discount_amount: delta }));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!cfg) return;

    // Validaciones mínimas
    if (!form.dni || !form.first_name || !form.last_name || !form.start_date) {
      setError("DNI, Nombre, Apellido y Fecha de inicio son obligatorios.");
      return;
    }

    // DNI único en alta
    if (!editingDni) {
      const exists = await db.students.get(form.dni);
      if (exists) {
        setError("Ya existe un socio con ese DNI.");
        return;
      }
    }

    const payload = {
      dni: form.dni.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      start_date: form.start_date,
      plan_end_date: derived.end_date,
      plan_total_classes: derived.total_classes,
      is_trial: derived.is_trial,
      is_new_student: !!form.is_new_student,
      is_family: !!form.is_family,
      manual_discount_amount: Number(form.manual_discount_amount) || 0,
      price_applied: derived.price_applied,
      active: true, // crear/renovar deja activo
      updated_at: new Date().toISOString(),
      created_at: editingDni ? undefined : new Date().toISOString(),
    };

    await db.students.put(payload); // upsert
    onSaved?.();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="amodal-backdrop" onClick={onClose}>
      <div className="amodal-card" onClick={(e) => e.stopPropagation()}>
        <h3>
          {editingDni
            ? mode === "renew"
              ? "Renovar socio"
              : "Editar socio"
            : "Nuevo socio"}
        </h3>

        {!cfg ? (
          <div style={{ padding: "8px" }}>Cargando configuración...</div>
        ) : (
          <form className="amodal-form" onSubmit={save}>
          
            <div className="row">
              <label>
                DNI
                <input
                  name="dni"
                  value={form.dni}
                  onChange={onChange}
                  disabled={!!editingDni}
                />
              </label>
              <label>
                Fecha inicio
                <input
                  type="date"
                  name="start_date"
                  value={form.start_date}
                  onChange={onChange}
                />
              </label>
            </div>

            <div className="row">
              <label>
                Nombre
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={onChange}
                />
              </label>
              <label>
                Apellido
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={onChange}
                />
              </label>
            </div>

            <div className="row">
              <label>
                Teléfono
                <input name="phone" value={form.phone} onChange={onChange} />
              </label>
              <label>
                Dirección
                <input name="address" value={form.address} onChange={onChange} />
              </label>
            </div>

         
            <div className="row row-mini">
              <label className="chk">
                <input
                  type="checkbox"
                  name="is_new_student"
                  checked={form.is_new_student}
                  onChange={onChange}
                />
                Alumno nuevo
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  name="is_family"
                  checked={form.is_family}
                  onChange={onChange}
                />
                Familiar / hermano
              </label>
              <label>
                Cupón
                <input
                  name="coupon"
                  value={form.coupon}
                  onChange={onChange}
                  placeholder={cfg?.trial_coupon_code || "TKDPRUEBA"}
                />
              </label>
            </div>

            {cfg?.midmonth_policy === "manual" && !derived.is_trial && (
              <div className="row">
                <label>
                  Descuento manual ($)
                  <input
                    type="number"
                    name="manual_discount_amount"
                    min="0"
                    value={form.manual_discount_amount}
                    onChange={onChange}
                  />
                </label>
                <div className="ghost" />
              </div>
            )}

           
            {cfg?.midmonth_policy === "manual" &&
              derived.isOutOfWindow &&
              !derived.is_trial && (
                <div className="alert-outwindow">
                  <div className="alert-title">⚠️ Alta fuera de ventana de pago</div>
                  <div className="alert-body">
                    <p>
                      Este socio inicia el <b>{form.start_date}</b> y su plan
                      vencerá el <b>{derived.end_date}</b>. El período es más
                      corto para alinearlo con la ventana de cobro (01–10).
                    </p>
                    <p>
                      Clases de este período (L→S):{" "}
                      <b>{derived.total_classes}</b>
                      {derived.suggestedProratedPrice != null && (
                        <>
                          {" "}
                          · Precio sugerido proporcional:{" "}
                          <b>${derived.suggestedProratedPrice}</b>
                        </>
                      )}
                    </p>

                    <div className="alert-actions">
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={applyFullPrice}
                      >
                        Cobrar cuota completa
                      </button>
                      {derived.suggestedProratedPrice != null && (
                        <button
                          type="button"
                          className="btn tiny alt"
                          onClick={applySuggestedProrate}
                        >
                          Aplicar precio proporcional
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

     
            <h4 className="plan-title">Detalles del plan</h4>
            <div className="calc-box">
              <div>
                Inicio: <b>{form.start_date}</b>
              </div>
              <div>
                Fin de plan: <b>{derived.end_date}</b>
              </div>
              <div>
                Clases del período (L→S): <b>{derived.total_classes}</b>
              </div>
              <div>
                Precio base: <b>${derived.price_base}</b>
              </div>
              {derived.is_trial ? (
                <div className="badge trial">MODO PRUEBA · ${0}</div>
              ) : (
                <>
                  <div>
                    Descuento manual:{" "}
                    <b>${Number(form.manual_discount_amount) || 0}</b>
                  </div>
                  <div>
                    Precio aplicado: <b>${derived.price_applied}</b>
                  </div>
                </>
              )}
            </div>

            {error && <div className="amodal-error">{error}</div>}

            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                {editingDni ? (mode === "renew" ? "Renovar" : "Guardar") : "Crear"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
*/
// src/components/alumnos/AlumnoModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./AlumnoModal.css";
import { db, getAppConfig } from "../../db/indexedDB";
import {
  countMonToSat,
  addDays,
  todayISO,
  calcEndDateWithWindow,
  baselineFullClassesForProration,
} from "../../utils/membership";

export default function AlumnoModal({
  open,
  onClose,
  onSaved,
  editingDni = null,
  prefillStartDate = null,
  mode = "create", // "create" | "renew" | "edit"
}) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    dni: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    start_date: todayISO(),
    is_new_student: false,
    is_family: false,
    manual_discount_amount: 0,
    coupon: "",
    active: true,
  });
  const [error, setError] = useState("");

  // Cargar config + datos si edita/renueva
  useEffect(() => {
    if (!open) return;
    (async () => {
      const c = await getAppConfig();
      setCfg(c);

      if (editingDni) {
        const st = await db.students.get(editingDni);
        if (st) {
          setForm({
            dni: st.dni,
            first_name: st.first_name || "",
            last_name: st.last_name || "",
            phone: st.phone || "",
            address: st.address || "",
            start_date: prefillStartDate ? prefillStartDate : (st.start_date || todayISO()),
            is_new_student: false,
            is_family: !!st.is_family,
            manual_discount_amount: 0,
            coupon: "",
            active: true,
          });
        }
      } else {
        setForm((f) => ({
          ...f,
          start_date: prefillStartDate ? prefillStartDate : todayISO(),
          manual_discount_amount: 0,
          coupon: "",
        }));
      }
      setError("");
    })();
  }, [open, editingDni, prefillStartDate]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]:
        type === "checkbox"
          ? checked
          : name === "manual_discount_amount"
          ? Number(value)
          : value,
    }));
  };

  // === Cálculos derivados (fin, clases, precio, estado de ventana) ===
  const derived = useMemo(() => {
    if (!cfg) {
      return {
        end_date: form.start_date,
        total_classes: 0,
        is_trial: false,
        price_applied: 0,
        price_base: 0,
        isOutOfWindow: false,
        suggestedProratedPrice: null,
        policy: "manual",
      };
    }

    const policy = cfg.midmonth_policy || "manual";
    const windowEnd = cfg.billing_window_end_day ?? 10;

    // Trial
    const isTrial =
      form.coupon &&
      cfg.trial_coupon_code &&
      form.coupon.trim().toUpperCase() === cfg.trial_coupon_code.toUpperCase();

    const start = form.start_date || todayISO();
    const startDay = Number(start.split("-")[2] || "1");
    const end = isTrial
      ? addDays(start, Math.max(1, cfg.trial_days || 1))
      : calcEndDateWithWindow(start, windowEnd);

    const total_classes = isTrial ? 1 : countMonToSat(start, end);
    const priceBase = cfg.price_base || 0;

    // Detectar si está fuera de ventana (siempre, para mostrar aviso)
    const isOutOfWindow = !isTrial && startDay > windowEnd;

    // --- Precio base previo a descuentos ---
    let priceBeforeDiscounts = isTrial ? 0 : priceBase;

    // (A) PRORRATEO AUTOMÁTICO si policy = "prorate" y fuera de ventana
    let suggestedProratedPrice = null;
    if (!isTrial && isOutOfWindow) {
      const baseline = Math.max(1, baselineFullClassesForProration(start, windowEnd));
      const factor = Math.min(1, total_classes / baseline);
      suggestedProratedPrice = Math.round(priceBase * factor);
      if (policy === "prorate") {
        // aplicar prorrateo directo
        priceBeforeDiscounts = suggestedProratedPrice;
      }
    }

    // (B) Descuentos % (sobre priceBeforeDiscounts)
    let price = priceBeforeDiscounts;
    if (!isTrial) {
      if (form.is_new_student && cfg.new_student_discount_pct) {
        price = Math.round(price * (1 - cfg.new_student_discount_pct / 100));
      }
      if (form.is_family && cfg.family_discount_pct) {
        price = Math.round(price * (1 - cfg.family_discount_pct / 100));
      }
      // (C) Descuento manual solo en policy manual
      if (policy === "manual" && form.manual_discount_amount > 0) {
        price = Math.max(0, price - form.manual_discount_amount);
      }
    }

    return {
      policy,
      end_date: end,
      total_classes,
      is_trial: isTrial,
      price_applied: price,
      price_base: priceBase,
      isOutOfWindow,
      suggestedProratedPrice,
      price_before_discounts: priceBeforeDiscounts,
    };
  }, [cfg, form]);

  // Acciones rápidas para manual
  const applyFullPrice = () => {
    setForm((p) => ({ ...p, manual_discount_amount: 0 }));
  };
  const applySuggestedProrate = () => {
    if (derived.suggestedProratedPrice == null) return;
    const delta = Math.max(0, (derived.price_base || 0) - derived.suggestedProratedPrice);
    setForm((p) => ({ ...p, manual_discount_amount: delta }));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!cfg) return;

    if (!form.dni || !form.first_name || !form.last_name || !form.start_date) {
      setError("DNI, Nombre, Apellido y Fecha de inicio son obligatorios.");
      return;
    }

    if (!editingDni) {
      const exists = await db.students.get(form.dni);
      if (exists) { setError("Ya existe un socio con ese DNI."); return; }
    }

    const payload = {
      dni: form.dni.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      start_date: form.start_date,
      plan_end_date: derived.end_date,
      plan_total_classes: derived.total_classes,
      is_trial: derived.is_trial,
      is_new_student: !!form.is_new_student,
      is_family: !!form.is_family,
      manual_discount_amount: Number(form.manual_discount_amount) || 0,
      price_applied: derived.price_applied,
      active: true,
      updated_at: new Date().toISOString(),
      created_at: editingDni ? undefined : new Date().toISOString(),
    };

    await db.students.put(payload);
    onSaved?.();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="amodal-backdrop" onClick={onClose}>
      <div className="amodal-card" onClick={(e) => e.stopPropagation()}>
        <h3>
          {editingDni
            ? mode === "renew"
              ? "Renovar socio"
              : "Editar socio"
            : "Nuevo socio"}
        </h3>

        {!cfg ? (
          <div style={{ padding: "8px" }}>Cargando configuración...</div>
        ) : (
          <form className="amodal-form" onSubmit={save}>
            {/* Identidad */}
            <div className="row">
              <label>
                DNI
                <input
                  name="dni"
                  value={form.dni}
                  onChange={onChange}
                  disabled={!!editingDni}
                />
              </label>
              <label>
                Fecha inicio
                <input
                  type="date"
                  name="start_date"
                  value={form.start_date}
                  onChange={onChange}
                />
              </label>
            </div>

            <div className="row">
              <label>
                Nombre
                <input name="first_name" value={form.first_name} onChange={onChange} />
              </label>
              <label>
                Apellido
                <input name="last_name" value={form.last_name} onChange={onChange} />
              </label>
            </div>

            <div className="row">
              <label>
                Teléfono
                <input name="phone" value={form.phone} onChange={onChange} />
              </label>
              <label>
                Dirección
                <input name="address" value={form.address} onChange={onChange} />
              </label>
            </div>

            {/* Descuentos / Cupón */}
            <div className="row row-mini">
              <label className="chk">
                <input
                  type="checkbox"
                  name="is_new_student"
                  checked={form.is_new_student}
                  onChange={onChange}
                />
                Alumno nuevo
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  name="is_family"
                  checked={form.is_family}
                  onChange={onChange}
                />
                Familiar / hermano
              </label>
              <label>
                Cupón
                <input
                  name="coupon"
                  value={form.coupon}
                  onChange={onChange}
                  placeholder={cfg?.trial_coupon_code || "TKDPRUEBA"}
                />
              </label>
            </div>

            {/* Descuento manual (solo visible en policy manual y no trial) */}
            {derived.policy === "manual" && !derived.is_trial && (
              <div className="row">
                <label>
                  Descuento manual ($)
                  <input
                    type="number"
                    name="manual_discount_amount"
                    min="0"
                    value={form.manual_discount_amount}
                    onChange={onChange}
                  />
                </label>
                <div className="ghost" />
              </div>
            )}

            {/* Aviso: fuera de ventana (info siempre; acciones solo en manual) */}
            {derived.isOutOfWindow && !derived.is_trial && (
              <div className="alert-outwindow">
                <div className="alert-title">⚠️ Alta fuera de ventana de pago</div>
                <div className="alert-body">
                  <p>
                    Este socio inicia el <b>{form.start_date}</b> y su plan vencerá el{" "}
                    <b>{derived.end_date}</b>. El período es más corto para alinearlo con la
                    ventana de cobro (01–10).
                  </p>
                  <p>
                    Clases de este período (L→S): <b>{derived.total_classes}</b>
                    {derived.policy === "prorate" && derived.suggestedProratedPrice != null && (
                      <> · Precio proporcional aplicado: <b>${derived.price_before_discounts}</b></>
                    )}
                    {derived.policy === "manual" && derived.suggestedProratedPrice != null && (
                      <> · Precio sugerido proporcional: <b>${derived.suggestedProratedPrice}</b></>
                    )}
                  </p>

                  {derived.policy === "manual" && (
                    <div className="alert-actions">
                      <button type="button" className="btn tiny" onClick={applyFullPrice}>
                        Cobrar cuota completa
                      </button>
                      {derived.suggestedProratedPrice != null && (
                        <button type="button" className="btn tiny alt" onClick={applySuggestedProrate}>
                          Aplicar precio proporcional
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Detalles del plan */}
            <h4 className="plan-title">Detalles del plan</h4>
            <div className="calc-box">
              <div>Inicio: <b>{form.start_date}</b></div>
              <div>Fin de plan: <b>{derived.end_date}</b></div>
              <div>Clases del período (L→S): <b>{derived.total_classes}</b></div>
              <div>Precio base: <b>${derived.price_base}</b></div>
              {derived.is_trial ? (
                <div className="badge trial">MODO PRUEBA · ${0}</div>
              ) : (
                <>
                  {derived.policy === "prorate" && (
                    <div>Precio proporcional (antes de descuentos): <b>${derived.price_before_discounts}</b></div>
                  )}
                  <div>Descuento manual: <b>${Number(form.manual_discount_amount) || 0}</b></div>
                  <div>Precio aplicado: <b>${derived.price_applied}</b></div>
                </>
              )}
            </div>

            {error && <div className="amodal-error">{error}</div>}

            <div className="actions">
              <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn primary">
                {editingDni ? (mode === "renew" ? "Renovar" : "Guardar") : "Crear"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
