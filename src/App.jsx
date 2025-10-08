import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Login from "./pages/login/Login";
import Principal from "./pages/principal/Principal";
import Alumnos from "./pages/alumnos/Alumnos";
import Config from "./pages/config/Config";

function ProtectedRoute() {
  const sessionRaw = localStorage.getItem("tkd_session");
  const session = sessionRaw ? JSON.parse(sessionRaw) : null;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Ruta pública */}
      <Route path="/login" element={<Login />} />

      {/* Rutas protegidas */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Principal />} />
        <Route path="/alumnos" element={<Alumnos />} />
       <Route path="/config" element={<Config />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
