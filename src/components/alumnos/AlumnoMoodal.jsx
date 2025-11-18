// src/components/alumnos/AlumnoModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./AlumnoModal.css";
import {
  db,
  getAppConfig,
  getClasses,
  getOrCreateMembershipForPeriod,
  upsertPaymentWithMembership,
} from "../../db/indexedDB";

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
  const [classes, setClasses] = useState([]);

  const [form, setForm] = useState({
    dni: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    start_date: todayISO(),
    class_id: "",
    is_new_student: false,
    is_family: false,
    manual_discount_amount: 0,
    coupon: "",
    active: true,
  });

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // --- Pago en alta ---
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payReceipt, setPayReceipt] = useState("");

  const toInt = (x) => Number(x || 0);

  const computePeriodFromDate = (iso, dueDay) => {
    const [yStr, mStr, dStr] = (iso || todayISO()).split("-");
    let y = Number(yStr),
      m = Number(mStr),
      d = Number(dStr);
    if (d > dueDay) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return { year: y, month: m };
  };

  // Cargar config + clases + datos si edita/renueva
  useEffect(() => {
    if (!open) return;
    (async () => {
      const c = await getAppConfig();
      const cls = await getClasses();
      setCfg(c);
      setClasses(cls);

      if (editingDni) {
        const st = await db.students.get(editingDni);
        if (st) {
          const start = prefillStartDate ? prefillStartDate : st.start_date || todayISO();
          setForm({
            dni: st.dni,
            first_name: st.first_name || "",
            last_name: st.last_name || "",
            phone: st.phone || "",
            address: st.address || "",
            start_date: start,
            class_id: st.class_id || "",
            is_new_student: false,
            is_family: !!st.is_family,
            manual_discount_amount: 0,
            coupon: "",
            active: true,
          });
        }
      } else {
        const start = prefillStartDate ? prefillStartDate : todayISO();
        // Modo creación: siempre formulario limpio
        setForm({
          dni: "",
          first_name: "",
          last_name: "",
          phone: "",
          address: "",
          start_date: start,
          class_id: "",
          is_new_student: false,
          is_family: false,
          manual_discount_amount: 0,
          coupon: "",
          active: true,
        });
      }

      // reset pago
      setPayNow(false);
      setPayAmount(0);
      setPayMethod("efectivo");
      setPayReceipt("");

      setError("");
      setFieldErrors({});
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

  // === Cálculos derivados (fin, clases, precio, etc.) ===
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
        price_before_discounts: 0,
        period: { year: 0, month: 0 },
      };
    }

    const windowEnd = toInt(cfg.cycle_due_day ?? cfg.billing_window_end_day ?? 10);
    const policy = cfg.midmonth_policy || "manual";

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

    const isOutOfWindow = !isTrial && startDay > windowEnd;

    let priceBeforeDiscounts = isTrial ? 0 : priceBase;
    let suggestedProratedPrice = null;

    if (!isTrial && isOutOfWindow) {
      const baseline = Math.max(1, baselineFullClassesForProration(start, windowEnd));
      const factor = Math.min(1, total_classes / baseline);
      suggestedProratedPrice = Math.round(priceBase * factor);
      if (policy === "prorate") {
        priceBeforeDiscounts = suggestedProratedPrice;
      }
    }

    let price = priceBeforeDiscounts;
    if (!isTrial) {
      if (form.is_new_student && cfg.new_student_discount_pct) {
        price = Math.round(price * (1 - cfg.new_student_discount_pct / 100));
      }
      if (form.is_family && cfg.family_discount_pct) {
        price = Math.round(price * (1 - cfg.family_discount_pct / 100));
      }
      if (policy === "manual" && form.manual_discount_amount > 0) {
        price = Math.max(0, price - form.manual_discount_amount);
      }
    }

    const period = computePeriodFromDate(start, windowEnd);

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
      period,
    };
  }, [cfg, form]);

  const applyFullPrice = () => {
    setForm((p) => ({ ...p, manual_discount_amount: 0 }));
  };

  const applySuggestedProrate = () => {
    if (derived.suggestedProratedPrice == null) return;
    const delta = Math.max(0, (derived.price_base || 0) - derived.suggestedProratedPrice);
    setForm((p) => ({ ...p, manual_discount_amount: delta }));
  };

  useEffect(() => {
    if (!open) return;
    setPayAmount(derived.price_applied || 0);
  }, [derived.price_applied, open]);

  // --- Validaciones de campos ---
  const validateForm = async () => {
    const errors = {};

    // DNI
    const dni = (form.dni || "").trim();
    if (!dni) {
      errors.dni = "El DNI es obligatorio.";
    } else if (!/^\d+$/.test(dni)) {
      errors.dni = "El DNI debe contener solo números.";
    } else if (![7, 8].includes(dni.length)) {
      errors.dni = "El DNI debe tener 7 u 8 dígitos.";
    }

    // Nombre / apellido
    if (!form.first_name.trim()) {
      errors.first_name = "El nombre es obligatorio.";
    }
    if (!form.last_name.trim()) {
      errors.last_name = "El apellido es obligatorio.";
    }

    // Fecha de inicio
    if (!form.start_date) {
      errors.start_date = "La fecha de inicio es obligatoria.";
    }

    // Clase (si hay clases configuradas)
    if (classes.length > 0 && !form.class_id) {
      errors.class_id = "Seleccioná una clase o grupo.";
    }

    // Pago (si corresponde)
    if (payNow) {
      if (payAmount == null || payAmount === "" || isNaN(Number(payAmount))) {
        errors.payAmount = "Importe del pago inválido.";
      } else if (Number(payAmount) < 0) {
        errors.payAmount = "El importe no puede ser negativo.";
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return { ok: false };
    }

    // Validar DNI duplicado en alta
    if (!editingDni) {
      const exists = await db.students.get(form.dni);
      if (exists) {
        setFieldErrors((prev) => ({
          ...prev,
          dni: "Ya existe un socio con ese DNI.",
        }));
        return { ok: false };
      }
    }

    return { ok: true };
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    if (!cfg) return;

    const { ok } = await validateForm();
    if (!ok) return;

    // 1) upsert del alumno
    const studentPayload = {
      dni: form.dni.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      start_date: form.start_date,
      plan_end_date: derived.end_date,
      plan_total_classes: derived.total_classes,
      class_id: form.class_id || "",
      is_trial: derived.is_trial,
      is_new_student: !!form.is_new_student,
      is_family: !!form.is_family,
      manual_discount_amount: Number(form.manual_discount_amount) || 0,
      price_applied: derived.price_applied,
      active: true,
      updated_at: new Date().toISOString(),
      created_at: editingDni ? undefined : new Date().toISOString(),
    };

    await db.students.put(studentPayload);

    // 2) asegurar membership del período
    const periodYear = derived.period.year;
    const periodMonth = derived.period.month;
    const membership = await getOrCreateMembershipForPeriod(
      form.dni,
      periodYear,
      periodMonth,
      cfg
    );

    // 3) Si se marcó pago ahora → registrar/enlazar pago
    if (payNow) {
      await upsertPaymentWithMembership({
        dni: form.dni,
        year: periodYear,
        month: periodMonth,
        amount: Number(payAmount),
        method: payMethod,
        receipt: payReceipt || "",
        date: todayISO(),
      });
    }

    // 4) Sincronizar datos desde la membership
    const freshMem = await getOrCreateMembershipForPeriod(
      form.dni,
      periodYear,
      periodMonth,
      cfg
    );

    await db.students.update(form.dni, {
      plan_end_date: freshMem.end_date,
      plan_total_classes: freshMem.plan_total_classes,
      updated_at: new Date().toISOString(),
    });

    onSaved?.();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="amodal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="amodal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alumno-modal-title"
      >
        <div className="modal-header">
          <h3 id="alumno-modal-title">
            {editingDni
              ? mode === "renew"
                ? "Renovar socio"
                : "Editar socio"
              : "Nuevo socio"}
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {!cfg ? (
          <div className="modal-body">
            <div className="loading-text">Cargando configuración...</div>
          </div>
        ) : (
          <form className="amodal-form modal-body" onSubmit={save}>
            {/* Sección: Datos del alumno */}
            <div className="modal-section">
              <h4 className="section-title">👤 Datos del alumno</h4>
              <div className="row">
                <label className={fieldErrors.dni ? "has-error" : ""}>
                  DNI
                  <input
                    name="dni"
                    value={form.dni}
                    onChange={onChange}
                    disabled={!!editingDni}
                  />
                  {fieldErrors.dni && (
                    <span className="field-error">{fieldErrors.dni}</span>
                  )}
                </label>
                <label className={fieldErrors.start_date ? "has-error" : ""}>
                  Fecha inicio
                  <input
                    type="date"
                    name="start_date"
                    value={form.start_date}
                    onChange={onChange}
                  />
                  {fieldErrors.start_date && (
                    <span className="field-error">{fieldErrors.start_date}</span>
                  )}
                </label>
              </div>

              <div className="row">
                <label className={fieldErrors.first_name ? "has-error" : ""}>
                  Nombre
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={onChange}
                  />
                  {fieldErrors.first_name && (
                    <span className="field-error">{fieldErrors.first_name}</span>
                  )}
                </label>
                <label className={fieldErrors.last_name ? "has-error" : ""}>
                  Apellido
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={onChange}
                  />
                  {fieldErrors.last_name && (
                    <span className="field-error">{fieldErrors.last_name}</span>
                  )}
                </label>
              </div>

              <div className="row">
                <label>
                  Teléfono
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={onChange}
                    placeholder="Ej: 3854112233"
                  />
                </label>
                <label>
                  Dirección
                  <input
                    name="address"
                    value={form.address}
                    onChange={onChange}
                  />
                </label>
              </div>
            </div>

            {/* Sección: Clase y descuentos */}
            <div className="modal-section">
              <h4 className="section-title">🥋 Clase y beneficios</h4>
              <div className="row">
                <label className={fieldErrors.class_id ? "has-error" : ""}>
                  Clase / Grupo
                  <select
                    name="class_id"
                    value={form.class_id}
                    onChange={onChange}
                  >
                    <option value="">Seleccionar…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.class_id && (
                    <span className="field-error">{fieldErrors.class_id}</span>
                  )}
                </label>
                <div className="ghost" />
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
            </div>

            {/* Alerta: fuera de ventana de pago */}
            {derived.isOutOfWindow && !derived.is_trial && (
              <div className="alert-outwindow">
                <div className="alert-title">⚠️ Alta fuera de ventana de pago</div>
                <div className="alert-body">
                  <p>
                    Este socio inicia el <b>{form.start_date}</b> y su plan
                    vencerá el <b>{derived.end_date}</b>. El período se alinea
                    con el día{" "}
                    <b>{cfg.cycle_due_day ?? cfg.billing_window_end_day ?? 10}</b>.
                  </p>
                  <p>
                    Clases de este período (L→S): <b>{derived.total_classes}</b>
                    {derived.policy === "prorate" &&
                      derived.suggestedProratedPrice != null && (
                        <>
                          {" "}
                          · Precio proporcional aplicado:{" "}
                          <b>${derived.price_before_discounts}</b>
                        </>
                      )}
                    {derived.policy === "manual" &&
                      derived.suggestedProratedPrice != null && (
                        <>
                          {" "}
                          · Precio sugerido proporcional:{" "}
                          <b>${derived.suggestedProratedPrice}</b>
                        </>
                      )}
                  </p>

                  {derived.policy === "manual" && (
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
                  )}
                </div>
              </div>
            )}

            {/* Sección: Detalles del plan */}
            <div className="modal-section">
              <h4 className="section-title">📅 Detalles del plan</h4>
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
                  <div className="badge trial">MODO PRUEBA · $0</div>
                ) : (
                  <>
                    {derived.policy === "prorate" && (
                      <div>
                        Precio proporcional (antes de descuentos):{" "}
                        <b>${derived.price_before_discounts}</b>
                      </div>
                    )}
                    <div>
                      Descuento manual:{" "}
                      <b>{Number(form.manual_discount_amount) || 0}</b>
                    </div>
                    <div>
                      Precio aplicado: <b>${derived.price_applied}</b>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Sección: Pago en alta / renovación */}
            {!derived.is_trial && (
              <div className="modal-section">
                <h4 className="section-title">💰 Pago del período</h4>

                <div className="row row-mini">
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={payNow}
                      onChange={(e) => setPayNow(e.target.checked)}
                    />
                    Registrar pago del período {derived.period.month}/
                    {derived.period.year}
                  </label>
                </div>

                {payNow && (
                  <>
                    <div className="row">
                      <label className={fieldErrors.payAmount ? "has-error" : ""}>
                        Importe ($)
                        <input
                          type="number"
                          min="0"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                        />
                        {fieldErrors.payAmount && (
                          <span className="field-error">
                            {fieldErrors.payAmount}
                          </span>
                        )}
                      </label>
                      <label>
                        Medio de pago
                        <select
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value)}
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="debito">Débito</option>
                          <option value="credito">Crédito</option>
                          <option value="otro">Otro</option>
                        </select>
                      </label>
                    </div>
                    <div className="row">
                      <label>
                        Comprobante (opcional)
                        <input
                          value={payReceipt}
                          onChange={(e) => setPayReceipt(e.target.value)}
                          placeholder="Últimos dígitos / referencia"
                        />
                      </label>
                      <div className="ghost" />
                    </div>
                    <div className="hint" style={{ marginTop: 4 }}>
                      Se registrará el pago del período{" "}
                      <b>
                        {derived.period.month}/{derived.period.year}
                      </b>{" "}
                      y se vinculará a la membresía correspondiente.
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <div className="amodal-error">{error}</div>}

            <div className="modal-footer actions">
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                {editingDni
                  ? mode === "renew"
                    ? "Renovar"
                    : "Guardar"
                  : "Crear"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
