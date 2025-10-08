/*
import React from "react";
import "./ItemAlumno.css";

export default function ItemAlumno({ alumno, status }) {
  const nombre = `${alumno.last_name}, ${alumno.first_name}`;
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
        <small className="left-hint">{status.left} clases restantes</small>
      </div>
    </div>
  );
}
*/
import React from "react";
import "./ItemAlumno.css";

export default function ItemAlumno({ alumno, status, onRemove }) {
  const nombre = `${alumno.last_name}, ${alumno.first_name}`;

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
        <small className="left-hint">{status.left} clases restantes</small>

        {/* 👇 Nuevo botón eliminar (solo si se pasa la prop onRemove) */}
        {onRemove && (
          <button className="btn-remove" onClick={() => onRemove(alumno.dni)} title="Eliminar de la lista">
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
