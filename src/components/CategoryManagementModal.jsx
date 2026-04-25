import React, { useState } from "react";

const CategoryManagementModal = ({ show, onClose, categories, apiBaseUrl, refreshData }) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");

  if (!show) return null;

  const handleEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = async (catId) => {
    if (!editName.trim()) {
      setError("Kategoriya nomi probel bo'lishi mumkin emas.");
      return;
    }
    setLoadingId(catId);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const paramId = catId.toString();
      const res = await fetch(`${apiBaseUrl}/api/categories/update/${paramId}/`, {
         method: "PUT",
         headers: {
           "Content-Type": "application/json",
           Authorization: `Token ${token}`
         },
         body: JSON.stringify({ name: editName })
      });
      
      if (!res.ok) throw new Error("Kategoriyani yangilab bo'lmadi!");
      await refreshData();
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (catId) => {
    if (!window.confirm("DIQQAT: Ushbu kategoriyani o'chirsangiz, u ichidagi barcha mahsulotlar ham o'chib ketadi! Davom etasizmi?")) {
      return;
    }
    setLoadingId(catId);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const paramId = catId.toString();
      const res = await fetch(`${apiBaseUrl}/api/categories/delete/${paramId}/`, {
         method: "DELETE",
         headers: {
           Authorization: `Token ${token}`
         }
      });
      
      if (!res.ok) throw new Error("Kategoriyani o'chirib bo'lmadi!");
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.5)",
        zIndex: 2000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }}
    >
      <div
        className="modal-content"
        style={{
          background: "var(--color-bg-secondary, #fff)",
          color: "var(--color-text-primary, #000)",
          borderRadius: 12,
          padding: 24,
          width: 500,
          maxWidth: "90%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Kategoriyalar</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>&times;</button>
        </div>

        {error && <div style={{ color: "red", marginBottom: 10, fontSize: 14 }}>{error}</div>}

        <div style={{ overflowY: "auto", flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          {categories.length === 0 ? (
            <p style={{ textAlign: "center", color: "#888" }}>Kategoriyalar mavjud emas</p>
          ) : (
            categories.map(cat => (
              <div key={cat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                {editingId === cat.id ? (
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    style={{ flex: 1, marginRight: 10, padding: 6, borderRadius: 6, border: "1px solid #aaa" }} 
                    disabled={loadingId === cat.id}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 16 }}>{cat.name}</span>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {editingId === cat.id ? (
                    <>
                      <button 
                        onClick={() => handleSaveEdit(cat.id)} 
                        disabled={loadingId === cat.id}
                        style={{ padding: "6px 12px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        {loadingId === cat.id ? "Saqlanmoqda..." : "Saqlash"}
                      </button>
                      <button 
                        onClick={() => setEditingId(null)} 
                        disabled={loadingId === cat.id}
                        style={{ padding: "6px 12px", background: "#aaa", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        Bekor
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleEdit(cat)} 
                        disabled={loadingId === cat.id}
                        style={{ padding: "6px 12px", background: "#2196f3", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        Tahrir
                      </button>
                      <button 
                        onClick={() => handleDelete(cat.id)} 
                        disabled={loadingId === cat.id}
                        style={{ padding: "6px 12px", background: "#f44336", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        {loadingId === cat.id ? "..." : "O'chirish"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryManagementModal;