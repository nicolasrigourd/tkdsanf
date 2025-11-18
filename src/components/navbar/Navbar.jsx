// src/components/navbar/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";
import logo from "../../assets/tkd-sanf.jpg";
import ConfirmModal from "../confirm/ConfirmModal";

export default function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false); // menú mobile
  const [profileOpen, setProfileOpen] = useState(false); // dropdown perfil
  const [logoutOpen, setLogoutOpen] = useState(false); // modal confirm logout
  const profileRef = useRef(null);

  // 🔐 Cambio de contraseña
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");

  // ✅ Toast de feedback
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  // Traer usuario desde la sesión
  let username = "Usuario";
  try {
    const raw = localStorage.getItem("tkd_session");
    if (raw) {
      const s = JSON.parse(raw);
      username = s?.user?.username || username;
    }
  } catch {}

  const isActive = (path) =>
    pathname === path ? "navbar-link active" : "navbar-link";

  const toggleMenu = () => setOpen((p) => !p);
  const closeMenu = () => setOpen(false);

  const toggleProfile = () => setProfileOpen((p) => !p);
  const closeProfile = () => setProfileOpen(false);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target)) closeProfile();
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const handleLogoutConfirmed = () => {
    localStorage.removeItem("tkd_session");
    navigate("/login");
  };

  // Abrir modal de cambio de contraseña
  const handleChangePasswordClick = () => {
    setCurrentPwd("");
    setNewPwd("");
    setPwdError("");
    setPwdOpen(true);
    closeProfile();
  };

  // Guardar nueva contraseña
  const handleSubmitPasswordChange = () => {
    setPwdError("");

    const current = currentPwd.trim();
    const next = newPwd.trim();

    if (!current || !next) {
      setPwdError("Completá ambos campos.");
      return;
    }

    try {
      const rawUser = localStorage.getItem("userTk");
      if (!rawUser) {
        setPwdError("No se encontró el usuario en esta máquina.");
        return;
      }

      const userObj = JSON.parse(rawUser);
      if (!userObj || !userObj.username) {
        setPwdError("Formato de usuario inválido en almacenamiento local.");
        return;
      }

      // Validar contraseña actual
      if (userObj.password !== current) {
        setPwdError("La contraseña actual no es correcta.");
        return;
      }

      // Actualizar contraseña
      const updated = { ...userObj, password: next };
      localStorage.setItem("userTk", JSON.stringify(updated));

      setPwdOpen(false);
      setCurrentPwd("");
      setNewPwd("");

      // ✅ Toast de éxito
      showToast("✔️ Contraseña actualizada correctamente");
    } catch (e) {
      setPwdError("Ocurrió un error guardando la nueva contraseña.");
    }
  };

  return (
    <>
      <header className="navbar">
        <div className="navbar-row">
          {/* Izquierda: Logo + Brand */}
          <div className="navbar-left">
            <img src={logo} alt="TKD Admin" className="navbar-logo" />
            <span className="navbar-brand">TKD Sanf Santiago del Estero</span>
          </div>

          {/* Centro: Links (visible en desktop) */}
          <nav className="navbar-center">
            <Link to="/" className={isActive("/")} onClick={closeMenu}>
              Home
            </Link>
            <Link
              to="/alumnos"
              className={isActive("/alumnos")}
              onClick={closeMenu}
            >
              Socios
            </Link>
            <Link
              to="/productos"
              className={isActive("/productos")}
              onClick={closeMenu}
            >
              Productos
            </Link>
            <Link
              to="/notificaciones"
              className={isActive("/notificaciones")}
              onClick={closeMenu}
            >
              Notificaciones
            </Link>
            <Link
              to="/config"
              className={isActive("/config")}
              onClick={closeMenu}
            >
              Configuración
            </Link>
          </nav>

          {/* Derecha: Burger + Perfil */}
          <div className="navbar-right" ref={profileRef}>
            {/* Botón hamburguesa (solo mobile) */}
            <button
              className={`navbar-burger ${open ? "is-open" : ""}`}
              onClick={toggleMenu}
              aria-label="Abrir menú"
              aria-expanded={open}
              aria-controls="navbar-mobile"
              type="button"
            >
              <span />
              <span />
              <span />
            </button>

            {/* Campanita de notificaciones */}
            <button
              className="navbar-bell"
              title="Notificaciones"
              aria-label="Notificaciones"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="bell-icon" aria-hidden="true">
                <path d="M12 2a6 6 0 00-6 6v2.586l-1.293 1.293A1 1 0 005 14h14a1 1 0 00.707-1.707L18.414 10.586V8a6 6 0 00-6-6zm0 20a3 3 0 002.995-2.824L15 19h-6a3 3 0 002.824 2.995L12 22z" />
              </svg>
            </button>

            {/* Perfil con dropdown */}
            <button
              className={`navbar-profile ${profileOpen ? "open" : ""}`}
              onClick={toggleProfile}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              title="Opciones de perfil"
              type="button"
            >
              <span className="avatar" aria-hidden="true">
                👤
              </span>
              <span className="logout-text">{username}</span>
            </button>

            {profileOpen && (
              <div className="profile-menu" role="menu">
                <div className="profile-head">
                  <div className="profile-avatar">👤</div>
                  <div className="profile-user">
                    <div className="profile-name">{username}</div>
                    <div className="profile-role">Administrador</div>
                  </div>
                </div>
                <button
                  className="profile-item"
                  onClick={handleChangePasswordClick}
                  role="menuitem"
                  type="button"
                >
                  Cambiar contraseña
                </button>
                <button
                  className="profile-item danger"
                  onClick={() => setLogoutOpen(true)}
                  role="menuitem"
                  type="button"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Menú colapsable en mobile */}
        <nav
          id="navbar-mobile"
          className={`navbar-mobile ${open ? "open" : ""}`}
          onClick={closeMenu}
        >
          <Link to="/" className={isActive("/")}>
            Home
          </Link>
          <Link to="/alumnos" className={isActive("/alumnos")}>
            Socios
          </Link>
          <Link to="/productos" className={isActive("/productos")}>
            Productos
          </Link>
          <Link to="/notificaciones" className={isActive("/notificaciones")}>
            Notificaciones
          </Link>
          <Link to="/config" className={isActive("/config")}>
            Configuración
          </Link>
        </nav>

        {/* Modal confirmación logout */}
        <ConfirmModal
          open={logoutOpen}
          title="Cerrar sesión"
          message="¿Querés cerrar la sesión actual?"
          confirmText="Sí, cerrar"
          cancelText="Cancelar"
          onConfirm={handleLogoutConfirmed}
          onCancel={() => setLogoutOpen(false)}
        />

        {/* Modal cambio de contraseña */}
        {pwdOpen && (
          <div className="pwd-modal-overlay" role="presentation">
            <div
              className="pwd-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwd-modal-title"
            >
              <h3 id="pwd-modal-title" className="pwd-modal-title">
                Cambiar contraseña
              </h3>
              <div className="pwd-modal-body">
                <label className="pwd-field">
                  Contraseña actual
                  <input
                    type="password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                  />
                </label>
                <label className="pwd-field">
                  Nueva contraseña
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                </label>
                {pwdError && <div className="pwd-error">{pwdError}</div>}
              </div>
              <div className="pwd-modal-actions">
                <button
                  type="button"
                  className="pwd-btn ghost"
                  onClick={() => setPwdOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pwd-btn primary"
                  onClick={handleSubmitPasswordChange}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ✅ Toast de confirmación */}
      {toastMsg && <div className="navbar-toast">{toastMsg}</div>}
    </>
  );
}
