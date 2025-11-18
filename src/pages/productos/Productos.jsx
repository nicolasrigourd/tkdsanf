// src/pages/productos/Productos.jsx
import React, { useMemo, useState } from "react";
import "./Productos.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";

/** MOCK estático (solo visual, panel de carga) */
const MOCK = [
  {
    id: "p1",
    name: "Cinturón Taekwondo – Blanco",
    category: "Cinturones",
    sku: "CT-BLA-001",
    price: 7500,
    discountPct: 0,
    stock: 25,
    status: "Publicado", // Publicado | Borrador
    image:
      "https://images.unsplash.com/photo-1590080876192-75c555f86807?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p2",
    name: "Cinturón Taekwondo – Negro",
    category: "Cinturones",
    sku: "CT-NEG-010",
    price: 14500,
    discountPct: 10,
    stock: 6,
    status: "Borrador",
    image:
      "https://images.unsplash.com/photo-1574055882554-7c0914f05bf6?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p3",
    name: "Dobok Infantil (Chaqueta + Pantalón)",
    category: "Indumentaria",
    sku: "DB-INF-120",
    price: 42000,
    discountPct: 0,
    stock: 8,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1603398749947-7630f0b02b52?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p4",
    name: "Dobok Adulto Ligero (Chaqueta + Pantalón)",
    category: "Indumentaria",
    sku: "DB-ADT-200",
    price: 59000,
    discountPct: 15,
    stock: 12,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1590559899731-c30f8a9c9c6c?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p5",
    name: "Protector Bucal",
    category: "Protecciones",
    sku: "PR-BUC-010",
    price: 6000,
    discountPct: 0,
    stock: 40,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1592906209471-5adf2e90b518?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p6",
    name: "Peto de Competición (Hogu)",
    category: "Protecciones",
    sku: "PT-COM-300",
    price: 65000,
    discountPct: 10,
    stock: 4,
    status: "Borrador",
    image:
      "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p7",
    name: "Espinilleras Taekwondo",
    category: "Protecciones",
    sku: "ES-TKD-050",
    price: 22000,
    discountPct: 0,
    stock: 14,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1624030331078-3f38d1cee36b?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p8",
    name: "Casco de Entrenamiento",
    category: "Protecciones",
    sku: "CS-ENT-090",
    price: 38000,
    discountPct: 0,
    stock: 7,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1617957796317-16dbffef1533?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p9",
    name: "Guantes de Entrenamiento",
    category: "Protecciones",
    sku: "GU-ENT-070",
    price: 35000,
    discountPct: 5,
    stock: 10,
    status: "Borrador",
    image:
      "https://images.unsplash.com/photo-1521804906057-1df8fdb718b6?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p10",
    name: "Bolso Deportivo",
    category: "Accesorios",
    sku: "BO-DEP-015",
    price: 28000,
    discountPct: 0,
    stock: 3,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p11",
    name: "Pantalón Taekwondo",
    category: "Indumentaria",
    sku: "PT-TKD-040",
    price: 21000,
    discountPct: 0,
    stock: 20,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1541140134513-85a161dc4a00?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p12",
    name: "Chaqueta Taekwondo",
    category: "Indumentaria",
    sku: "CH-TKD-041",
    price: 25000,
    discountPct: 0,
    stock: 18,
    status: "Publicado",
    image:
      "https://images.unsplash.com/photo-1611367468030-9825c6c5f9e4?q=80&w=1200&auto=format&fit=crop",
  },
];

const CATEGORIES = ["Todos", "Cinturones", "Indumentaria", "Protecciones", "Accesorios"];
const STATUS = ["Todos", "Publicado", "Borrador"];

export default function Productos() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [sort, setSort] = useState("recientes"); // recientes | precio_asc | precio_desc | stock_asc | stock_desc
  const [selected, setSelected] = useState([]); // ids seleccionados

  const filtered = useMemo(() => {
    let list = MOCK;

    // búsqueda
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (it) =>
          it.name.toLowerCase().includes(term) ||
          it.sku.toLowerCase().includes(term) ||
          (it.category || "").toLowerCase().includes(term)
      );
    }

    // categoría
    if (cat !== "Todos") list = list.filter((it) => it.category === cat);

    // estado
    if (status !== "Todos") list = list.filter((it) => it.status === status);

    // orden
    if (sort === "precio_asc") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "precio_desc") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "stock_asc") list = [...list].sort((a, b) => a.stock - b.stock);
    else if (sort === "stock_desc") list = [...list].sort((a, b) => b.stock - a.stock);
    else list = [...list]; // recientes = orden mock

    return list;
  }, [q, cat, status, sort]);

  const isAllSelected = filtered.length > 0 && selected.length === filtered.length;

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (isAllSelected) setSelected([]);
    else setSelected(filtered.map((p) => p.id));
  };

  // Acciones "mock" (solo visual)
  const handleBulk = (action) => {
    console.log("Acción masiva:", action, selected);
    alert(`Acción masiva: ${action} (${selected.length} ítems seleccionados)\n*Vista demo*`);
  };
  const handleCardAction = (action, id) => {
    console.log("Acción card:", action, id);
    alert(`"${action}" sobre ${id}\n*Vista demo*`);
  };

  return (
    <div className="productos-page">
      <Navbar />

      <main className="productos-content">
        <header className="productos-header">
          <div>
            <h2>Productos</h2>
            <p className="sub">
              Panel para cargar y administrar productos del e-commerce (vista demo).
            </p>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-primary"
              onClick={() => alert("Nuevo producto (demo)")}
            >
              + Nuevo producto
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="productos-toolbar">
          <input
            className="search"
            placeholder="Buscar por nombre, SKU o categoría…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                Estado: {s}
              </option>
            ))}
          </select>
          <select className="sel" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recientes">Orden: recientes</option>
            <option value="precio_asc">Precio: menor a mayor</option>
            <option value="precio_desc">Precio: mayor a menor</option>
            <option value="stock_asc">Stock: menor a mayor</option>
            <option value="stock_desc">Stock: mayor a menor</option>
          </select>
        </div>

        {/* Bulk bar (aparece si hay selección) */}
        {selected.length > 0 && (
          <div className="bulkbar">
            <div className="bulkbar-left">
              <span className="checkwrap">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                />
                <span className="bulkcount">
                  {selected.length} seleccionado(s)
                </span>
              </span>
            </div>
            <div className="bulkbar-actions">
              <button className="btn btn-ghost" onClick={() => handleBulk("Publicar")}>
                Publicar
              </button>
              <button className="btn btn-ghost" onClick={() => handleBulk("Pasar a borrador")}>
                Pasar a borrador
              </button>
              <button className="btn btn-danger" onClick={() => handleBulk("Eliminar")}>
                Eliminar
              </button>
            </div>
          </div>
        )}

        {/* Grid de tarjetas */}
        {filtered.length === 0 ? (
          <div className="empty">No hay productos en esta vista.</div>
        ) : (
          <>
            {/* Select all fila actual */}
            <div className="selectall-row">
              <label className="selectall">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                />
                Seleccionar todo en la vista
              </label>
            </div>

            <div className="grid">
              {filtered.map((p) => {
                const hasSale = Number(p.discountPct || 0) > 0;
                const final = Math.round(
                  Number(p.price || 0) * (1 - Number(p.discountPct || 0) / 100)
                );
                const stockClass =
                  p.stock > 10 ? "ok" : p.stock > 0 ? "warn" : "out";
                const isSelected = selected.includes(p.id);

                return (
                  <div key={p.id} className={`card ${isSelected ? "card-selected" : ""}`}>
                    <div className="thumb">
                      {/* Checkbox overlay */}
                      <label className="selectbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </label>

                      {/* Estado */}
                      <div
                        className={`chip-status ${
                          p.status === "Publicado" ? "pub" : "draft"
                        }`}
                      >
                        {p.status}
                      </div>

                      {/* Imagen */}
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src =
                              "https://images.unsplash.com/photo-1603398749947-7630f0b02b52?q=80&w=1200&auto=format&fit=crop";
                          }}
                          sizes="(max-width: 1280px) 33vw, (max-width: 900px) 50vw, (max-width: 600px) 100vw, 25vw"
                        />
                      ) : (
                        <div className="noimg">Sin imagen</div>
                      )}

                      {/* Categoría */}
                      <div className="chip-cat">{p.category}</div>
                    </div>

                    <div className="card-body">
                      <div className="name" title={p.name}>
                        {p.name}
                      </div>
                      <div className="sku">
                        SKU: <b>{p.sku}</b>
                      </div>

                      <div className="price-row">
                        {hasSale ? (
                          <>
                            <s>${Number(p.price || 0)}</s>
                            <span className="price">${final}</span>
                            <span className="tag tag-sale">-{p.discountPct}%</span>
                          </>
                        ) : (
                          <span className="price">${Number(p.price || 0)}</span>
                        )}
                      </div>

                      <div className="meta-row">
                        <span className={`stock ${stockClass}`}>Stock: {p.stock}</span>
                        <span className="pill pill-muted">Preview de card</span>
                      </div>

                      {/* Acciones admin por tarjeta (solo visual) */}
                      <div className="card-actions">
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => handleCardAction("Editar", p.id)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => handleCardAction("Duplicar", p.id)}
                        >
                          Duplicar
                        </button>
                        <button
                          className="btn btn-danger sm"
                          onClick={() => handleCardAction("Eliminar", p.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
