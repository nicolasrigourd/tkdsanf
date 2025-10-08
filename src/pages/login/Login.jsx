import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import logo from "../../assets/tkd-sanf.jpg";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    const raw = localStorage.getItem("userTk");
    if (!raw) {
      console.warn("userTk no existe en localStorage");
      setError("No hay usuario local configurado (userTk).");
      return;
    }

    let user;
    try {
      user = JSON.parse(raw);
    } catch (err) {
      console.error("JSON inválido en userTk:", err, raw);
      setError("Datos de usuario corruptos. Reinstale la app o regenere userTk.");
      return;
    }

    // Soporta objeto o array de usuarios, por si luego expandimos
    const match = Array.isArray(user)
      ? user.find(u => u.username === form.username.trim() && u.password === form.password)
      : (user.username === form.username.trim() && user.password === form.password ? user : null);

    if (match) {
      const session = {
        user: { username: match.username, role: match.role || "admin" },
        logged_at: new Date().toISOString(),
      };
      localStorage.setItem("tkd_session", JSON.stringify(session));
      navigate("/", { replace: true });
    } else {
      setError("Usuario o contraseña incorrectos.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="TKD Admin" className="login-logo" />
        <h1 className="login-title">Asociacion deTaekwondo</h1>
        <p className="login-subtitle">Ingreso al panel de administración</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label">
            Usuario
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={onChange}
              className="login-input"
              placeholder="Ingresa tu nombre de Usuario"
              autoFocus
            />
          </label>

          <label className="login-label">
            Contraseña
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              className="login-input"
              placeholder="Password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button">Iniciar sesión</button>
        </form>
      </div>
    </div>
  );
}
