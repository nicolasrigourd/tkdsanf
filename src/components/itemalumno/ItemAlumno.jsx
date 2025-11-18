/*
// src/components/itemalumno/ItemAlumno.jsx
import React from "react";
import "./ItemAlumno.css";
import { countMonToSat, todayISO } from "../../utils/membership";

export default function ItemAlumno({ alumno, status, onRemove }) {
  const nombre = `${alumno.last_name}, ${alumno.first_name}`;

  // --- Cálculo de “clases restantes” por calendario (L→S) ---
  const today = todayISO();
  // usamos como inicio el mayor entre hoy y la fecha de inicio del plan
  const start = (alumno.start_date && alumno.start_date > today) ? alumno.start_date : today;
  const end = alumno.plan_end_date;

  let remainingDays = 0;
  if (end && start) {
    // Si ya venció, da 0
    remainingDays = end < start ? 0 : countMonToSat(start, end);
  }

  return (
    <div className="itemalum">
      <div className="itemalum-left">
        <div className={`itemalum-badge ${status.color}`} />
        <div className="itemalum-info">
          <div className="itemalum-name">{nombre}</div>
          <div className="itemalum-meta">
            DNI: <b>{alumno.dni}</b> · Inicio: {alumno.start_date} · Fin plan: {alumno.plan_end_date}
          </div>
        </div>
      </div>

      <div className="itemalum-right">
        <span className={`pill ${status.color}`}>{status.color.toUpperCase()}</span>
        <small className="left-hint">
          {remainingDays} clases restantes
        </small>

        {onRemove && (
          <button className="btn-remove" onClick={() => onRemove(alumno.dni)} title="Eliminar de la lista">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
*/
import React from "react";
import "./ItemAlumno.css";
import { countMonToSat, todayISO } from "../../utils/membership";

export default function ItemAlumno({ alumno, status, onRemove }) {
  const nombre = `${alumno.last_name}, ${alumno.first_name}`;

  // --- Cálculo de “clases restantes” por calendario (L→S) ---
  const today = todayISO();
  // usamos como inicio el mayor entre hoy y la fecha de inicio del plan
  const start =
    alumno.start_date && alumno.start_date > today
      ? alumno.start_date
      : today;
  const end = alumno.plan_end_date;

  let remainingDays = 0;
  if (end && start) {
    // Si ya venció, da 0
    remainingDays = end < start ? 0 : countMonToSat(start, end);
  }

  return (
    <div className="itemalum">
      <div className="itemalum-left">
        {/* 🔹 chip indicador (lo mantenemos) */}
        <div className={`itemalum-badge ${status.color}`} />

        <div className="itemalum-info">
          <div className="itemalum-name">{nombre}</div>
          <div className="itemalum-meta">
            DNI: <b>{alumno.dni}</b> · Inicio: {alumno.start_date} · Fin plan:{" "}
            {alumno.plan_end_date}
          </div>
        </div>
      </div>

      <div className="itemalum-right">
        {/* ❌ Eliminado el chip de texto con color (GREEN/YELLOW/RED) */}

        <small className="left-hint">{remainingDays} clases restantes</small>

        {onRemove && (
          <button
            className="btn-remove"
            onClick={() => onRemove(alumno.dni)}
            title="Eliminar de la lista"
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
