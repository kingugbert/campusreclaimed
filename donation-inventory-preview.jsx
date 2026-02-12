import { useState, useCallback } from "react";

/* ─── helpers ─── */
const formatPhone = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};
const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86400000);
};

const EMPTY_FORM = {
  donorName: "", donorEmail: "", address: "", phoneNumber: "",
  dateAccepted: new Date().toISOString().split("T")[0],
  itemDescription: "", storageLocation: "",
};

const MOCK_ITEMS = [
  { id: "1", donor_name: "Margaret Thompson", donor_email: "margaret@example.com", address: "456 Oak Avenue, Ashburn, VA 20147", phone_number: "(703) 555-0142", date_accepted: "2025-12-15", item_description: "Antique walnut writing desk — 4 drawers, brass hardware, minor scratches on top surface", storage_location: "Building A, Row 3", item_image_url: null, notification_sent: "2026-01-15T09:00:00Z", created_at: "2025-12-15T14:30:00Z" },
  { id: "2", donor_name: "James Rodriguez", donor_email: "james.r@email.com", address: "789 Maple Drive, Sterling, VA 20165", phone_number: "(571) 555-0298", date_accepted: "2026-01-08", item_description: "Set of 6 matching dining chairs — cherry wood, upholstered seats in cream fabric, good condition", storage_location: "Building B, Shelf 12", item_image_url: null, notification_sent: null, created_at: "2026-01-08T10:15:00Z" },
  { id: "3", donor_name: "Susan Park", donor_email: null, address: "321 Elm Street, Leesburg, VA 20176", phone_number: "(540) 555-0371", date_accepted: "2026-01-22", item_description: "Box of children's books (approx 35) — mixed ages, picture books and chapter books, excellent condition", storage_location: "Building A, Row 7", item_image_url: null, notification_sent: null, created_at: "2026-01-22T16:45:00Z" },
  { id: "4", donor_name: "Robert Chen", donor_email: "rob.chen@email.com", address: "1010 Pine Court, Reston, VA 20190", phone_number: "(703) 555-0584", date_accepted: "2026-02-03", item_description: "Samsung 55\" LED TV — model UN55TU7000, 2022, works perfectly, includes remote and wall mount bracket", storage_location: "Building C, Electronics", item_image_url: null, notification_sent: null, created_at: "2026-02-03T11:20:00Z" },
  { id: "5", donor_name: "Patricia Williams", donor_email: "pat.w@email.com", address: "567 Birch Lane, Herndon, VA 20170", phone_number: "(571) 555-0716", date_accepted: "2026-02-09", item_description: "Queen-size bed frame — metal frame with wooden headboard, disassembled, all hardware included", storage_location: "Building B, Large Items", item_image_url: null, notification_sent: null, created_at: "2026-02-09T09:00:00Z" },
];

export default function App() {
  const [tab, setTab] = useState("inventory");
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [items, setItems] = useState(MOCK_ITEMS);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedItem, setExpandedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const stats = {
    total: items.length,
    thisMonth: items.filter(i => i.date_accepted >= monthStart).length,
    pendingNotify: items.filter(i => !i.notification_sent && daysSince(i.date_accepted) >= 30 && i.donor_email).length,
  };

  const filteredItems = items
    .filter(i => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return i.donor_name.toLowerCase().includes(q) || i.item_description.toLowerCase().includes(q) || i.storage_location.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = a[sortField] || "", bv = b[sortField] || "";
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "phoneNumber") setFormData(p => ({ ...p, phoneNumber: formatPhone(value) }));
    else setFormData(p => ({ ...p, [name]: value }));
  };

  const resetForm = () => { setFormData({ ...EMPTY_FORM }); setImagePreview(null); setEditingId(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (editingId) {
        setItems(prev => prev.map(i => i.id === editingId ? {
          ...i, donor_name: formData.donorName, donor_email: formData.donorEmail || null,
          address: formData.address, phone_number: formData.phoneNumber,
          date_accepted: formData.dateAccepted, item_description: formData.itemDescription,
          storage_location: formData.storageLocation,
        } : i));
        setMessage({ type: "success", text: "Item updated successfully!" });
      } else {
        setItems(prev => [{
          id: String(Date.now()), donor_name: formData.donorName, donor_email: formData.donorEmail || null,
          address: formData.address, phone_number: formData.phoneNumber,
          date_accepted: formData.dateAccepted, item_description: formData.itemDescription,
          storage_location: formData.storageLocation, item_image_url: null,
          notification_sent: null, created_at: new Date().toISOString(),
        }, ...prev]);
        setMessage({ type: "success", text: "Item added to inventory!" });
      }
      resetForm();
      setLoading(false);
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    }, 600);
  };

  const handleEdit = (item) => {
    setFormData({
      donorName: item.donor_name, donorEmail: item.donor_email || "", address: item.address,
      phoneNumber: item.phone_number, dateAccepted: item.date_accepted,
      itemDescription: item.item_description, storageLocation: item.storage_location,
    });
    setEditingId(item.id);
    setTab("add");
  };

  const handleDelete = (id) => {
    setItems(p => p.filter(i => i.id !== id));
    setDeleteConfirm(null);
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: "linear-gradient(145deg, #fefce8 0%, #fff7ed 50%, #fef3c7 100%)", minHeight: "100vh", color: "#292524" }}>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        .di-container { max-width:940px; margin:0 auto; padding:2rem 1.25rem 4rem; animation:fadeIn .5s ease-out; }
        .di-header { position:relative; background:#fff; border-radius:14px 14px 0 0; padding:2.25rem 2rem; box-shadow:0 2px 12px rgba(120,113,108,.08); overflow:hidden; }
        .di-header h1 { font-size:2.4rem; font-weight:700; letter-spacing:-.02em; margin-bottom:.2rem; }
        .di-header p { font-size:.95rem; color:#57534e; }
        .di-header-deco { position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:linear-gradient(135deg,#fbbf24,#d97706); border-radius:50%; opacity:.08; }
        .di-tabs { display:flex; background:#fff; border-top:1px solid #e7e5e4; margin-bottom:1.75rem; border-radius:0 0 14px 14px; box-shadow:0 4px 12px rgba(120,113,108,.08); overflow:hidden; }
        .di-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:.5rem; padding:.85rem 1rem; border:none; background:transparent; font-size:.93rem; font-weight:500; color:#78716c; cursor:pointer; border-bottom:3px solid transparent; transition:all .2s; }
        .di-tab:hover { color:#292524; background:#fefce8; }
        .di-tab.active { color:#b45309; font-weight:600; border-bottom-color:#d97706; background:linear-gradient(to top,#fffbeb,transparent); }
        .di-badge { background:#d97706; color:#fff; font-size:.72rem; font-weight:600; padding:1px 7px; border-radius:20px; min-width:22px; text-align:center; }
        .di-panel { background:#fff; border-radius:14px; padding:2rem; box-shadow:0 2px 12px rgba(120,113,108,.08); animation:fadeIn .4s ease-out; }
        .di-editing-banner { background:#fef3c7; color:#b45309; padding:.6rem 1rem; border-radius:10px; margin-bottom:1.25rem; font-weight:500; font-size:.88rem; }
        .di-editing-banner button { background:none; border:none; color:#b45309; text-decoration:underline; cursor:pointer; font:inherit; }
        .di-form { display:flex; flex-direction:column; gap:2rem; }
        .di-section-title { font-size:1.4rem; font-weight:600; padding-bottom:.5rem; border-bottom:2px solid #d97706; margin-bottom:.5rem; }
        .di-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:1.25rem; }
        .di-group { display:flex; flex-direction:column; gap:.3rem; }
        .di-group.fw { grid-column:1/-1; }
        .di-group label { font-weight:500; font-size:.88rem; color:#292524; }
        .di-group input, .di-group textarea { padding:.7rem .85rem; border:2px solid #e7e5e4; border-radius:10px; font:inherit; font-size:.93rem; color:#292524; background:#fff; transition:border-color .2s,box-shadow .2s; }
        .di-group input:focus, .di-group textarea:focus { outline:none; border-color:#d97706; box-shadow:0 0 0 3px rgba(217,119,6,.1); }
        .di-group textarea { resize:vertical; min-height:80px; }
        .di-hint { font-size:.78rem; color:#78716c; }
        .di-upload { display:flex; flex-direction:column; align-items:center; gap:.6rem; padding:2rem; border:2px dashed #e7e5e4; border-radius:14px; background:#fefce8; cursor:pointer; transition:border-color .2s; }
        .di-upload:hover { border-color:#d97706; }
        .di-upload svg { color:#d97706; }
        .di-upload span { color:#57534e; font-weight:500; font-size:.88rem; }
        .di-msg { padding:.7rem 1rem; border-radius:10px; font-weight:500; font-size:.88rem; }
        .di-msg.success { background:#d1fae5; color:#065f46; border:1px solid #059669; }
        .di-msg.error { background:#fee2e2; color:#991b1b; border:1px solid #dc2626; }
        .di-actions { display:flex; gap:.75rem; justify-content:flex-end; margin-top:.5rem; }
        .di-submit { background:linear-gradient(135deg,#d97706,#b45309); color:#fff; border:none; padding:.8rem 1.75rem; border-radius:10px; font:inherit; font-size:.95rem; font-weight:600; cursor:pointer; box-shadow:0 3px 10px rgba(217,119,6,.25); display:flex; align-items:center; gap:.6rem; transition:transform .15s,box-shadow .15s; }
        .di-submit:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 16px rgba(217,119,6,.35); }
        .di-submit:disabled { opacity:.55; cursor:not-allowed; }
        .di-cancel { background:transparent; color:#57534e; border:2px solid #e7e5e4; padding:.8rem 1.25rem; border-radius:10px; font:inherit; font-size:.95rem; font-weight:500; cursor:pointer; transition:border-color .2s; }
        .di-cancel:hover { border-color:#78716c; color:#292524; }
        .di-spinner { width:18px; height:18px; border:2.5px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
        .di-spinner.lg { width:28px; height:28px; border-color:#e7e5e4; border-top-color:#d97706; }
        /* inventory */
        .di-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.25rem; }
        .di-stat { background:#fff; border-radius:10px; padding:1rem 1.15rem; box-shadow:0 2px 8px rgba(120,113,108,.08); }
        .di-stat.acc { border-left:4px solid #d97706; }
        .di-stat-val { font-size:1.7rem; font-weight:700; line-height:1.2; }
        .di-stat-lbl { font-size:.78rem; color:#78716c; font-weight:500; }
        .di-toolbar { background:#fff; border-radius:10px; padding:.8rem 1rem; box-shadow:0 2px 8px rgba(120,113,108,.08); margin-bottom:1rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
        .di-search { flex:1; min-width:200px; display:flex; align-items:center; gap:.5rem; background:#fafaf9; border:2px solid #e7e5e4; border-radius:10px; padding:.45rem .7rem; transition:border-color .2s; }
        .di-search:focus-within { border-color:#d97706; }
        .di-search input { flex:1; border:none; background:transparent; outline:none; font:inherit; font-size:.88rem; }
        .di-clear { background:none; border:none; font-size:1.2rem; color:#78716c; cursor:pointer; }
        .di-sorts { display:flex; align-items:center; gap:.35rem; }
        .di-sort-lbl { font-size:.78rem; color:#78716c; font-weight:500; margin-right:.1rem; }
        .di-sort { background:transparent; border:1px solid #e7e5e4; border-radius:6px; padding:.25rem .55rem; font-size:.78rem; color:#57534e; cursor:pointer; font:inherit; display:flex; align-items:center; gap:.2rem; transition:all .15s; }
        .di-sort:hover { border-color:#d97706; color:#b45309; }
        .di-sort.on { background:#fffbeb; border-color:#d97706; color:#b45309; font-weight:600; }
        .di-empty { text-align:center; padding:3rem; background:#fff; border-radius:14px; box-shadow:0 2px 8px rgba(120,113,108,.08); }
        .di-empty h3 { margin:.5rem 0 .2rem; }
        .di-empty p { color:#78716c; font-size:.88rem; }
        .di-list { display:flex; flex-direction:column; gap:.6rem; list-style:none; }
        .di-card { background:#fff; border-radius:10px; box-shadow:0 1px 6px rgba(120,113,108,.08); overflow:hidden; transition:box-shadow .2s; }
        .di-card:hover { box-shadow:0 3px 12px rgba(120,113,108,.14); }
        .di-card.exp { box-shadow:0 4px 16px rgba(120,113,108,.14); }
        .di-summary { width:100%; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.8rem 1rem; background:transparent; border:none; cursor:pointer; text-align:left; font:inherit; transition:background .15s; }
        .di-summary:hover { background:#fefce8; }
        .di-main { display:flex; align-items:center; gap:.8rem; flex:1; min-width:0; }
        .di-thumb { width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0; background:#f5f5f4; display:flex; align-items:center; justify-content:center; color:#d6d3d1; font-size:1.2rem; }
        .di-info { display:flex; flex-direction:column; min-width:0; }
        .di-item-desc { font-size:.88rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .di-item-donor { font-size:.78rem; color:#78716c; }
        .di-meta { display:flex; align-items:center; gap:.55rem; flex-shrink:0; }
        .di-loc { font-size:.76rem; color:#57534e; background:#f5f5f4; padding:2px 8px; border-radius:4px; white-space:nowrap; }
        .di-age { font-size:.76rem; color:#78716c; font-weight:500; white-space:nowrap; }
        .di-age.warn { color:#b45309; font-weight:600; }
        .di-notified { font-size:.88rem; }
        .di-chev { transition:transform .2s; color:#78716c; flex-shrink:0; }
        .di-card.exp .di-chev { transform:rotate(180deg); }
        .di-detail { padding:0 1rem 1rem; border-top:1px solid #e7e5e4; animation:fadeIn .25s ease-out; }
        .di-detail-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:.7rem; padding-top:.8rem; }
        .di-detail-grid > div { display:flex; flex-direction:column; gap:.05rem; }
        .di-dlbl { font-size:.73rem; color:#78716c; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
        .di-detail-grid span:not(.di-dlbl) { font-size:.88rem; }
        .di-detail-acts { display:flex; align-items:center; gap:.5rem; margin-top:.8rem; padding-top:.7rem; border-top:1px solid #e7e5e4; }
        .di-act { display:flex; align-items:center; gap:.3rem; background:transparent; border:1px solid #e7e5e4; border-radius:6px; padding:.3rem .6rem; font-size:.8rem; font-weight:500; cursor:pointer; font:inherit; color:#57534e; transition:all .15s; }
        .di-act:hover { border-color:#78716c; color:#292524; }
        .di-act.edit:hover { border-color:#d97706; color:#b45309; }
        .di-act.danger { color:#dc2626; border-color:#fecaca; }
        .di-act.danger:hover { background:#fee2e2; border-color:#dc2626; }
        .di-confirm { display:flex; align-items:center; gap:.4rem; font-size:.8rem; color:#dc2626; font-weight:500; }
        @media(max-width:640px) {
          .di-container { padding:.75rem .75rem 3rem; }
          .di-header h1 { font-size:1.9rem; }
          .di-header { padding:1.5rem 1.15rem; }
          .di-panel { padding:1.15rem; }
          .di-grid { grid-template-columns:1fr; }
          .di-group { grid-column:1/-1; }
          .di-stats { grid-template-columns:1fr; }
          .di-toolbar { flex-direction:column; }
          .di-sorts { width:100%; flex-wrap:wrap; }
          .di-summary { flex-direction:column; align-items:flex-start; }
          .di-meta { width:100%; }
          .di-actions { flex-direction:column; }
          .di-submit,.di-cancel { width:100%; justify-content:center; }
        }
      `}</style>

      <div className="di-container">
        <header className="di-header">
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1>Donation Inventory</h1>
            <p>Track and manage donated items with ease</p>
          </div>
          <div className="di-header-deco" />
        </header>

        <nav className="di-tabs">
          <button className={`di-tab ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M12 5v14m7-7H5" strokeLinecap="round" /></svg>
            {editingId ? "Edit Item" : "Add Item"}
          </button>
          <button className={`di-tab ${tab === "inventory" ? "active" : ""}`} onClick={() => setTab("inventory")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
            Inventory
            {stats.total > 0 && <span className="di-badge">{stats.total}</span>}
          </button>
        </nav>

        {tab === "add" && (
          <div className="di-panel">
            {editingId && (
              <div className="di-editing-banner">Editing item — <button onClick={resetForm}>cancel</button></div>
            )}
            <form onSubmit={handleSubmit} className="di-form">
              <div>
                <h2 className="di-section-title">Donor Information</h2>
                <div className="di-grid" style={{ marginTop: ".75rem" }}>
                  <div className="di-group">
                    <label>Donor Name *</label>
                    <input type="text" name="donorName" value={formData.donorName} onChange={handleInputChange} required placeholder="Jane Smith" />
                  </div>
                  <div className="di-group">
                    <label>Donor Email</label>
                    <input type="email" name="donorEmail" value={formData.donorEmail} onChange={handleInputChange} placeholder="jane@example.com" />
                    <span className="di-hint">Required for 30-day email notifications</span>
                  </div>
                  <div className="di-group fw">
                    <label>Address *</label>
                    <textarea name="address" value={formData.address} onChange={handleInputChange} required placeholder="123 Main Street, City, State ZIP" rows={2} />
                  </div>
                  <div className="di-group">
                    <label>Phone Number *</label>
                    <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} required placeholder="(555) 123-4567" />
                  </div>
                  <div className="di-group">
                    <label>Date Accepted *</label>
                    <input type="date" name="dateAccepted" value={formData.dateAccepted} onChange={handleInputChange} required />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="di-section-title">Item Details</h2>
                <div className="di-grid" style={{ marginTop: ".75rem" }}>
                  <div className="di-group fw">
                    <label>Item Description *</label>
                    <textarea name="itemDescription" value={formData.itemDescription} onChange={handleInputChange} required placeholder="Detailed description of the donated item…" rows={4} />
                  </div>
                  <div className="di-group fw">
                    <label>Storage Location *</label>
                    <input type="text" name="storageLocation" value={formData.storageLocation} onChange={handleInputChange} required placeholder="Shelf A-12, Warehouse 3" />
                  </div>
                  <div className="di-group fw">
                    <label>Item Photo</label>
                    <div className="di-upload">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="36" height="36">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Click to upload photo</span>
                      <span className="di-hint">JPEG, PNG — max 10 MB</span>
                    </div>
                  </div>
                </div>
              </div>

              {message.text && <div className={`di-msg ${message.type}`}>{message.text}</div>}

              <div className="di-actions">
                {editingId && <button type="button" className="di-cancel" onClick={resetForm}>Cancel</button>}
                <button type="submit" className="di-submit" disabled={loading}>
                  {loading ? <><span className="di-spinner" />Processing…</> : editingId ? "Save Changes" : "Add to Inventory"}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === "inventory" && (
          <div style={{ animation: "fadeIn .4s ease-out" }}>
            <div className="di-stats">
              <div className="di-stat"><span className="di-stat-val">{stats.total}</span><span className="di-stat-lbl">Total Items</span></div>
              <div className="di-stat"><span className="di-stat-val">{stats.thisMonth}</span><span className="di-stat-lbl">This Month</span></div>
              <div className="di-stat acc"><span className="di-stat-val">{stats.pendingNotify}</span><span className="di-stat-lbl">Pending Notification</span></div>
            </div>

            <div className="di-toolbar">
              <div className="di-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
                <input placeholder="Search by donor, item, or location…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {searchQuery && <button className="di-clear" onClick={() => setSearchQuery("")}>&times;</button>}
              </div>
              <div className="di-sorts">
                <span className="di-sort-lbl">Sort:</span>
                {[["created_at","Newest"],["date_accepted","Date Accepted"],["donor_name","Donor"]].map(([f,l]) => (
                  <button key={f} className={`di-sort ${sortField===f?"on":""}`} onClick={() => toggleSort(f)}>
                    {l}{sortField===f && <span>{sortDir==="asc"?"↑":"↓"}</span>}
                  </button>
                ))}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="di-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth={1.5} width="50" height="50"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <h3>{searchQuery ? "No matching items" : "No items yet"}</h3>
                <p>{searchQuery ? "Try a different search term." : "Add your first donation using the Add Item tab."}</p>
              </div>
            ) : (
              <ul className="di-list">
                {filteredItems.map(item => {
                  const days = daysSince(item.date_accepted);
                  const isExp = expandedItem === item.id;
                  return (
                    <li key={item.id} className={`di-card ${isExp?"exp":""}`}>
                      <button className="di-summary" onClick={() => setExpandedItem(isExp ? null : item.id)}>
                        <div className="di-main">
                          <div className="di-thumb">📦</div>
                          <div className="di-info">
                            <strong className="di-item-desc">{item.item_description}</strong>
                            <span className="di-item-donor">from {item.donor_name}</span>
                          </div>
                        </div>
                        <div className="di-meta">
                          <span className="di-loc">{item.storage_location}</span>
                          <span className={`di-age ${days>=30?"warn":""}`}>{days}d ago</span>
                          {item.notification_sent && <span className="di-notified" title="Notification sent">✉</span>}
                          <svg className="di-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                      </button>
                      {isExp && (
                        <div className="di-detail">
                          <div className="di-detail-grid">
                            <div><span className="di-dlbl">Address</span><span>{item.address}</span></div>
                            <div><span className="di-dlbl">Phone</span><span>{item.phone_number}</span></div>
                            {item.donor_email && <div><span className="di-dlbl">Email</span><span>{item.donor_email}</span></div>}
                            <div><span className="di-dlbl">Date Accepted</span><span>{formatDate(item.date_accepted)}</span></div>
                            <div><span className="di-dlbl">Notification</span>
                              <span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split("T")[0])}` : item.donor_email ? "Pending" : "No email on file"}</span>
                            </div>
                          </div>
                          <div className="di-detail-acts">
                            <button className="di-act edit" onClick={() => handleEdit(item)}>✏️ Edit</button>
                            {deleteConfirm === item.id ? (
                              <span className="di-confirm">Delete this item?
                                <button className="di-act danger" onClick={() => handleDelete(item.id)}>Yes</button>
                                <button className="di-act" onClick={() => setDeleteConfirm(null)}>No</button>
                              </span>
                            ) : (
                              <button className="di-act danger" onClick={() => setDeleteConfirm(item.id)}>🗑 Delete</button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
