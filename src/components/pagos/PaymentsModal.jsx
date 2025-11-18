import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PaymentsModal.css";
import {
  getPaymentsByDniYear,
  upsertPayment,
  deletePayment,
  getAppConfig,
  todayISO,
} from "../../db/indexedDB";

const MONTHS = [
  { m: 1,  label: "Enero" },
  { m: 2,  label: "Febrero" },
  { m: 3,  label: "Marzo" },
  { m: 4,  label: "Abril" },
  { m: 5,  label: "Mayo" },
  { m: 6,  label: "Junio" },
  { m: 7,  label: "Julio" },
  { m: 8,  label: "Agosto" },
  { m: 9,  label: "Septiembre" },
  { m: 10, label: "Octubre" },
  { m: 11, label: "Noviembre" },
  { m: 12, label: "Diciembre" },
];

export default function PaymentsModal({
  open,
  dni,
  studentName = "",
  onClose,
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [byMonth, setByMonth] = useState(() => new Map());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [defaultAmount, setDefaultAmount] = useState(0);

  // expansión + edición
  const [expandedMonth, setExpandedMonth] = useState(null);   // 1..12 | null
  const [form, setForm] = useState({ amount: "", method: "efectivo", date: todayISO(), receipt: "" });
  const originalRef = useRef(form);                           // original para detectar "dirty"
  const [dirty, setDirty] = useState(false);

  // confirmación para descartar cambios
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingActionRef = useRef(null); // () => void

  // ======= Helpers =======
  const setMessage = (text) => { setMsg(text); setTimeout(()=>setMsg(""), 1800); };

  // ======= Cargar config base (importe sugerido) =======
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cfg = await getAppConfig();
        setDefaultAmount(cfg?.price_base || 0);
      } catch {}
    })();
  }, [open]);

  // ======= Cargar pagos (dni/año) =======
  useEffect(() => {
    if (!open || !dni) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dni, year]);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await getPaymentsByDniYear(dni, year);
      const map = new Map();
      list.forEach((p) => map.set(Number(p.month), p));
      setByMonth(map);

      // si hay mes expandido, rehidratar sus valores (y resetear "dirty")
      if (expandedMonth) {
        const paid = map.get(expandedMonth);
        const initial = paid ? {
          amount: String(paid.amount ?? ""),
          method: paid.method || "efectivo",
          date: paid.date || todayISO(),
          receipt: paid.receipt || "",
        } : {
          amount: defaultAmount ? String(defaultAmount) : "",
          method: "efectivo",
          date: todayISO(),
          receipt: "",
        };
        setForm(initial);
        originalRef.current = initial;
        setDirty(false);
      }
    } catch (e) {
      setErr(e?.message || "No se pudo cargar el estado de pagos.");
    } finally {
      setLoading(false);
    }
  };

  // ======= Dirty check =======
  const computeDirty = (current, original) => {
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  // ======= Abrir / cambiar / colapsar mes con protección de cambios =======
  const openMonth = (m) => {
    if (expandedMonth === m) {
      // colapsar
      if (dirty) {
        askDiscard(() => {
          setExpandedMonth(null);
          setDirty(false);
        });
        return;
      }
      setExpandedMonth(null);
      return;
    }

    // cambiar de mes
    const doOpen = () => {
      setErr("");
      setMsg("");
      setExpandedMonth(m);
      const paid = byMonth.get(m);
      const initial = paid ? {
        amount: String(paid.amount ?? ""),
        method: paid.method || "efectivo",
        date: paid.date || todayISO(),
        receipt: paid.receipt || "",
      } : {
        amount: defaultAmount ? String(defaultAmount) : "",
        method: "efectivo",
        date: todayISO(),
        receipt: "",
      };
      setForm(initial);
      originalRef.current = initial;
      setDirty(false);
    };

    if (dirty) {
      askDiscard(doOpen);
      return;
    }
    doOpen();
  };

  // ======= Confirmación para descartar =======
  const askDiscard = (nextAction) => {
    pendingActionRef.current = nextAction;
    setConfirmOpen(true);
  };
  const confirmDiscard = () => {
    setConfirmOpen(false);
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  };
  const cancelDiscard = () => {
    setConfirmOpen(false);
    pendingActionRef.current = null;
  };

  // ======= Guardar pago =======
  const savePayment = async () => {
    try {
      setErr("");
      if (!expandedMonth) throw new Error("No hay mes seleccionado.");
      const amountNum = Number(form.amount);
      if (isNaN(amountNum) || amountNum <= 0) throw new Error("Importe inválido.");
      if (!form.date) throw new Error("Fecha requerida.");

      await upsertPayment({
        dni,
        year,
        month: expandedMonth,
        amount: amountNum,
        method: form.method || "efectivo",
        receipt: form.receipt || "",
        date: form.date,
      });
      await load();
      setMessage("Pago guardado.");
    } catch (e) {
      setErr(e?.message || "No se pudo guardar el pago.");
    }
  };

  // ======= Eliminar pago =======
  const removePayment = async () => {
    const paid = byMonth.get(expandedMonth);
    if (!paid?.id) return;
    if (!confirm(`¿Eliminar el pago de ${labelOf(expandedMonth)} ${year}?`)) return;
    try {
      await deletePayment(paid.id);
      await load();
      setMessage("Pago eliminado.");
    } catch (e) {
      setErr(e?.message || "No se pudo eliminar el pago.");
    }
  };

  const labelOf = (m) => MONTHS.find(x=>x.m===m)?.label || m;

  // ======= Cambios del formulario (marcan dirty) =======
  const onFormChange = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    setDirty(computeDirty(next, originalRef.current));
  };

  // ======= Años (selector compacto) =======
  const yearsOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const arr = [];
    for (let i = y - 2; i <= y + 2; i++) arr.push(i);
    return arr.reverse();
  }, []);

  // ======= Cierre con ESC y backdrop (con protección) =======
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty, expandedMonth, form]);

  const attemptClose = () => {
    if (dirty) {
      askDiscard(() => {
        setDirty(false);
        onClose?.();
      });
      return;
    }
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="pmodal-backdrop" onClick={attemptClose}>
      <div
        className="pmodal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payments-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pmodal-header">
          <div className="title-wrap">
            <h3 id="payments-title">Historial de pagos</h3>
            <div className="student-meta">
              <span className="meta-name">{studentName || "—"}</span>
              {dni && <span className="meta-dni">DNI: <b>{dni}</b></span>}
            </div>
          </div>
          <div className="year-select">
            <label>
              Año
              <select
                value={year}
                onChange={(e) => {
                  const nextY = Number(e.target.value);
                  if (dirty) {
                    askDiscard(() => { setYear(nextY); setExpandedMonth(null); setDirty(false); });
                  } else {
                    setYear(nextY);
                    setExpandedMonth(null);
                  }
                }}
              >
                {yearsOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Mensajes */}
        {err && <div className="pmodal-alert error">{err}</div>}
        {msg && <div className="pmodal-alert ok">{msg}</div>}

        {/* Lista vertical de meses */}
        <div className="pmonths-list">
          {loading ? (
            <div className="pmodal-loading">Cargando…</div>
          ) : (
            MONTHS.map(({ m, label }) => {
              const paid = byMonth.get(m);
              const expanded = expandedMonth === m;
              return (
                <div
                  key={m}
                  className={`row-card ${paid ? "paid" : "unpaid"} ${expanded ? "expanded" : ""}`}
                >
                  {/* Cabecera fila */}
                  <button
                    type="button"
                    className="row-head"
                    onClick={() => openMonth(m)}
                    aria-expanded={expanded}
                    aria-controls={`month-panel-${m}`}
                  >
                    <div className="row-left">
                      <div className="dot" />
                      <div className="row-title">{label}</div>
                    </div>
                    <div className={`row-status ${paid ? "ok" : "pending"}`}>
                      {paid ? "Pagado" : "Impago"}
                    </div>
                  </button>

                  {/* Panel expandible */}
                  <div
                    id={`month-panel-${m}`}
                    className="row-panel"
                    style={{ maxHeight: expanded ? 360 : 0 }}
                  >
                    {expanded && (
                      <div className="panel-inner">
                        {paid ? (
                          <>
                            <div className="panel-grid">
                              <div>
                                <label>Importe ($)</label>
                                <input
                                  type="number"
                                  value={form.amount}
                                  onChange={(e) => onFormChange("amount", e.target.value)}
                                />
                              </div>
                              <div>
                                <label>Método</label>
                                <select
                                  value={form.method}
                                  onChange={(e) => onFormChange("method", e.target.value)}
                                >
                                  <option value="efectivo">Efectivo</option>
                                  <option value="transferencia">Transferencia</option>
                                  <option value="tarjeta">Tarjeta</option>
                                  <option value="otros">Otros</option>
                                </select>
                              </div>
                            </div>
                            <div className="panel-grid">
                              <div>
                                <label>Fecha</label>
                                <input
                                  type="date"
                                  value={form.date}
                                  onChange={(e) => onFormChange("date", e.target.value)}
                                />
                              </div>
                              <div>
                                <label>Comprobante</label>
                                <input
                                  type="text"
                                  value={form.receipt}
                                  onChange={(e) => onFormChange("receipt", e.target.value)}
                                  placeholder="Últimos 3 dígitos / ref."
                                />
                              </div>
                            </div>
                            <div className="panel-actions">
                              <button className="btn tiny primary" onClick={savePayment}>Guardar</button>
                              <button className="btn tiny danger" onClick={removePayment}>Eliminar</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="panel-grid">
                              <div>
                                <label>Importe ($)</label>
                                <input
                                  type="number"
                                  value={form.amount}
                                  onChange={(e) => onFormChange("amount", e.target.value)}
                                />
                              </div>
                              <div>
                                <label>Método</label>
                                <select
                                  value={form.method}
                                  onChange={(e) => onFormChange("method", e.target.value)}
                                >
                                  <option value="efectivo">Efectivo</option>
                                  <option value="transferencia">Transferencia</option>
                                  <option value="tarjeta">Tarjeta</option>
                                  <option value="otros">Otros</option>
                                </select>
                              </div>
                            </div>
                            <div className="panel-grid">
                              <div>
                                <label>Fecha</label>
                                <input
                                  type="date"
                                  value={form.date}
                                  onChange={(e) => onFormChange("date", e.target.value)}
                                />
                              </div>
                              <div>
                                <label>Comprobante</label>
                                <input
                                  type="text"
                                  value={form.receipt}
                                  onChange={(e) => onFormChange("receipt", e.target.value)}
                                  placeholder="Últimos 3 dígitos / ref."
                                />
                              </div>
                            </div>
                            <div className="panel-actions">
                              <button className="btn tiny primary" onClick={savePayment}>Registrar pago</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pmodal-footer">
          <button className="btn" onClick={attemptClose}>Cerrar</button>
        </div>

        {/* Confirmación para descartar cambios */}
        {confirmOpen && (
          <div className="discard-backdrop" onClick={cancelDiscard}>
            <div className="discard-card" onClick={(e)=>e.stopPropagation()}>
              <div className="discard-title">Hay cambios sin guardar</div>
              <div className="discard-text">Si continuás, se perderán las modificaciones.</div>
              <div className="discard-actions">
                <button className="btn" onClick={cancelDiscard}>Cancelar</button>
                <button className="btn danger" onClick={confirmDiscard}>Descartar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
