import { useState } from "react";

const formatPhone = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
const formatDate = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const daysSince = (s) => s ? Math.floor((Date.now() - new Date(s + "T00:00:00").getTime()) / 86400000) : 0;

const CATS = [
  { label: "Furniture", src: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop" },
  { label: "Desk & Study", src: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop" },
  { label: "Kitchen", src: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop" },
  { label: "Electronics", src: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&h=400&fit=crop" },
  { label: "Bedding", src: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&h=400&fit=crop" },
  { label: "Books", src: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=400&fit=crop" },
];

const MOCK = [
  { id: "1", donor_name: "Margaret Thompson", donor_email: "margaret@university.edu", address: "456 Oak Ave, Ashburn, VA 20147", phone_number: "(703) 555-0142", date_accepted: "2025-12-15", item_description: "Antique walnut writing desk — 4 drawers, brass hardware", storage_location: "Building A, Row 3", item_image_url: null, notification_sent: "2026-01-15T09:00:00Z", created_at: "2025-12-15T14:30:00Z" },
  { id: "2", donor_name: "James Rodriguez", donor_email: "james.r@university.edu", address: "789 Maple Dr, Sterling, VA 20165", phone_number: "(571) 555-0298", date_accepted: "2026-01-08", item_description: "Set of 6 cherry wood dining chairs — upholstered seats, good condition", storage_location: "Building B, Shelf 12", item_image_url: null, notification_sent: null, created_at: "2026-01-08T10:15:00Z" },
  { id: "3", donor_name: "Susan Park", donor_email: null, address: "321 Elm St, Leesburg, VA 20176", phone_number: "(540) 555-0371", date_accepted: "2026-01-22", item_description: "Box of 35 children's books — picture books and chapter books, excellent condition", storage_location: "Building A, Row 7", item_image_url: null, notification_sent: null, created_at: "2026-01-22T16:45:00Z" },
  { id: "4", donor_name: "Robert Chen", donor_email: "rob.chen@university.edu", address: "1010 Pine Ct, Reston, VA 20190", phone_number: "(703) 555-0584", date_accepted: "2026-02-03", item_description: 'Samsung 55" LED TV — model UN55TU7000, works perfectly, includes remote', storage_location: "Building C, Electronics", item_image_url: null, notification_sent: null, created_at: "2026-02-03T11:20:00Z" },
  { id: "5", donor_name: "Patricia Williams", donor_email: "pat.w@university.edu", address: "567 Birch Ln, Herndon, VA 20170", phone_number: "(571) 555-0716", date_accepted: "2026-02-09", item_description: "Queen-size bed frame — metal with wooden headboard, all hardware included", storage_location: "Building B, Large Items", item_image_url: null, notification_sent: null, created_at: "2026-02-09T09:00:00Z" },
];

const EMPTY = { donorName: "", donorEmail: "", address: "", phoneNumber: "", dateAccepted: new Date().toISOString().split("T")[0], itemDescription: "", storageLocation: "" };

export default function App() {
  const [tab, setTab] = useState("inventory");
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [items, setItems] = useState(MOCK);
  const [search, setSearch] = useState("");
  const [sortF, setSortF] = useState("created_at");
  const [sortD, setSortD] = useState("desc");
  const [expanded, setExpanded] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const stats = { total: items.length, month: items.filter(i => i.date_accepted >= ms).length, pending: items.filter(i => !i.notification_sent && daysSince(i.date_accepted) >= 30 && i.donor_email).length };

  const filtered = items.filter(i => { if (!search.trim()) return true; const q = search.toLowerCase(); return i.donor_name.toLowerCase().includes(q) || i.item_description.toLowerCase().includes(q) || i.storage_location.toLowerCase().includes(q); }).sort((a, b) => { const av = a[sortF] || "", bv = b[sortF] || ""; return sortD === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); });

  const onChange = (e) => { const { name, value } = e.target; setForm(p => ({ ...p, [name]: name === "phoneNumber" ? formatPhone(value) : value })); };
  const reset = () => { setForm({ ...EMPTY }); setEditId(null); };
  const submit = (e) => { e.preventDefault(); setLoading(true); setTimeout(() => { if (editId) { setItems(p => p.map(i => i.id === editId ? { ...i, donor_name: form.donorName, donor_email: form.donorEmail || null, address: form.address, phone_number: form.phoneNumber, date_accepted: form.dateAccepted, item_description: form.itemDescription, storage_location: form.storageLocation } : i)); setMsg({ type: "success", text: "Item updated!" }); } else { setItems(p => [{ id: String(Date.now()), donor_name: form.donorName, donor_email: form.donorEmail || null, address: form.address, phone_number: form.phoneNumber, date_accepted: form.dateAccepted, item_description: form.itemDescription, storage_location: form.storageLocation, item_image_url: null, notification_sent: null, created_at: new Date().toISOString() }, ...p]); setMsg({ type: "success", text: "Item added to inventory!" }); } reset(); setLoading(false); setTimeout(() => setMsg({ type: "", text: "" }), 3000); }, 500); };
  const edit = (item) => { setForm({ donorName: item.donor_name, donorEmail: item.donor_email || "", address: item.address, phoneNumber: item.phone_number, dateAccepted: item.date_accepted, itemDescription: item.item_description, storageLocation: item.storage_location }); setEditId(item.id); setTab("add"); };
  const del = (id) => { setItems(p => p.filter(i => i.id !== id)); setDelConfirm(null); };
  const toggleSort = (f) => { if (sortF === f) setSortD(d => d === "asc" ? "desc" : "asc"); else { setSortF(f); setSortD("desc"); } };

  const S = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
:root{--g9:#0f2921;--g8:#1a3c34;--g7:#2a5a4a;--g6:#3d7a66;--g5:#5a9a82;--g1:#dceee6;--g0:#f0f8f4;--cream:#faf7f2;--cream-d:#f0ebe3;--terra:#c4725a;--terra-l:#f5e0d8;--terra-d:#a85a44;--amber:#c49a2a;--amber-l:#fdf3d8;--tx1:#1a1a1a;--tx2:#555;--txm:#888;--bd:#e4e0da;--bdl:#eee9e2;--wh:#fff;--sh:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);--shm:0 4px 16px rgba(0,0,0,.07);--r:16px;--rs:10px;--rx:6px;--fd:'DM Serif Display',Georgia,serif;--fb:'DM Sans',-apple-system,sans-serif}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--fb);background:var(--cream);color:var(--tx1);line-height:1.6;-webkit-font-smoothing:antialiased}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes catIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes heroIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.cr{min-height:100vh;display:flex;flex-direction:column;background:var(--cream)}
.hero{position:relative;height:310px;overflow:hidden}
.hero-bg{position:absolute;inset:0}.hero-bg img{width:100%;height:100%;object-fit:cover;display:block}
.hero-ov{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(15,41,33,.55),rgba(15,41,33,.82))}
.hero-c{position:relative;z-index:1;max-width:720px;margin:0 auto;padding:4rem 1.5rem 2.5rem;color:#fff;animation:heroIn .8s ease-out}
.hero-badge{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);padding:.3rem .9rem;border-radius:100px;margin-bottom:1.1rem;color:rgba(255,255,255,.9)}
.hero-c h1{font-family:var(--fd);font-size:3rem;font-weight:400;line-height:1.1;letter-spacing:-.01em;margin-bottom:.6rem}
.hero-c h1 em{font-style:italic;color:var(--g1)}
.hero-c p{font-size:1rem;color:rgba(255,255,255,.78);max-width:500px}
.cats{background:var(--wh);border-bottom:1px solid var(--bdl);padding:1.15rem 0}
.cats-s{display:flex;gap:.8rem;overflow-x:auto;padding:0 1.5rem;scrollbar-width:none;max-width:820px;margin:0 auto}
.cats-s::-webkit-scrollbar{display:none}
.cat{flex-shrink:0;width:108px;text-align:center;cursor:default;animation:catIn .5s ease-out both}
.cat img{width:108px;height:75px;object-fit:cover;border-radius:var(--rs);display:block;margin-bottom:.4rem;transition:transform .25s,box-shadow .25s}
.cat:hover img{transform:scale(1.04);box-shadow:var(--shm)}
.cat span{font-size:.75rem;font-weight:600;color:var(--tx2)}
.nav{display:flex;max-width:720px;margin:1.5rem auto 0;padding:0 1.5rem}
.nav-b{flex:1;display:flex;align-items:center;justify-content:center;gap:.45rem;padding:.8rem;border:1px solid var(--bd);background:var(--wh);font-family:var(--fb);font-size:.88rem;font-weight:500;color:var(--txm);cursor:pointer;transition:all .2s}
.nav-b:first-child{border-radius:var(--rs) 0 0 var(--rs)}.nav-b:last-child{border-radius:0 var(--rs) var(--rs) 0;border-left:none}
.nav-b:hover{color:var(--tx1);background:var(--cream)}
.nav-b.on{color:var(--g8);background:var(--g0);border-color:var(--g6);font-weight:600}
.cnt{background:var(--g8);color:#fff;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:100px;min-width:22px;text-align:center}
.main{max-width:720px;width:100%;margin:1.25rem auto 2rem;padding:0 1.5rem;flex:1;animation:fadeUp .4s ease-out}
.fw{background:var(--wh);border-radius:var(--r);box-shadow:var(--shm);overflow:hidden}
.eb{display:flex;align-items:center;gap:.45rem;background:var(--amber-l);color:var(--amber);padding:.65rem 1.5rem;font-size:.85rem;font-weight:500}
.eb button{background:none;border:none;color:var(--amber);text-decoration:underline;cursor:pointer;font:inherit;font-weight:600}
.form{display:flex;flex-direction:column}
.fs{border:none;padding:1.5rem 1.5rem 1.25rem;border-bottom:1px solid var(--bdl)}
.fs:last-of-type{border-bottom:none}
.fs legend{font-family:var(--fd);font-size:1.3rem;display:flex;align-items:center;gap:.65rem;margin-bottom:1.1rem;padding:0}
.ln{font-family:var(--fb);font-size:.68rem;font-weight:700;letter-spacing:.05em;color:var(--g6);background:var(--g0);border:1px solid var(--g1);width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
.fg{display:grid;grid-template-columns:repeat(2,1fr);gap:1.1rem}
.fi{display:flex;flex-direction:column;gap:.25rem}
.fi.s2{grid-column:1/-1}
.fi label{font-size:.8rem;font-weight:600;color:var(--tx2);letter-spacing:.01em}
.rq{color:var(--terra)}
.hn{font-size:.74rem;color:var(--txm)}
.fi input,.fi textarea{padding:.65rem .85rem;border:1.5px solid var(--bd);border-radius:var(--rx);font-family:var(--fb);font-size:.9rem;color:var(--tx1);background:var(--wh);transition:border-color .2s,box-shadow .2s}
.fi input:focus,.fi textarea:focus{outline:none;border-color:var(--g6);box-shadow:0 0 0 3px rgba(42,90,74,.1)}
.fi input::placeholder,.fi textarea::placeholder{color:#bbb}
.fi textarea{resize:vertical;min-height:68px}
.up{display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.75rem;border:2px dashed var(--bd);border-radius:var(--rs);background:var(--cream);cursor:pointer;transition:border-color .2s,background .2s}
.up:hover{border-color:var(--g6);background:var(--g0)}
.up svg{color:var(--g6)}
.up span{font-weight:500;color:var(--tx2);font-size:.85rem}
.tst{display:flex;align-items:center;gap:.45rem;margin:0 1.5rem;padding:.7rem 1rem;border-radius:var(--rx);font-weight:500;font-size:.85rem}
.tst.success{background:var(--g0);color:var(--g8);border:1px solid var(--g1)}
.tst.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.fa{display:flex;gap:.65rem;justify-content:flex-end;padding:1.15rem 1.5rem 1.25rem}
.bp{background:var(--g8);color:#fff;border:none;padding:.7rem 1.5rem;border-radius:var(--rx);font-family:var(--fb);font-size:.9rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:.45rem;transition:background .2s,transform .15s;box-shadow:var(--sh)}
.bp:hover:not(:disabled){background:var(--g7);transform:translateY(-1px);box-shadow:var(--shm)}
.bp:disabled{opacity:.5;cursor:not-allowed}
.bp.sm{padding:.55rem 1.1rem;font-size:.82rem}
.bs{background:transparent;color:var(--tx2);border:1.5px solid var(--bd);padding:.7rem 1.1rem;border-radius:var(--rx);font-family:var(--fb);font-size:.9rem;font-weight:500;cursor:pointer}
.bs:hover{border-color:var(--txm);color:var(--tx1)}
.sp{width:16px;height:16px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
.sp.lg{width:28px;height:28px;border-color:var(--bd);border-top-color:var(--g7)}
.sg{display:grid;grid-template-columns:repeat(3,1fr);gap:.9rem;margin-bottom:1.1rem}
.st{background:var(--wh);border-radius:var(--rs);padding:1rem 1.1rem;box-shadow:var(--sh);display:flex;flex-direction:column;gap:.1rem}
.st-i{width:36px;height:36px;border-radius:var(--rx);display:flex;align-items:center;justify-content:center;background:var(--cream);color:var(--tx2);margin-bottom:.3rem}
.st-i.gr{background:var(--g0);color:var(--g7)}.st-i.am{background:var(--amber-l);color:var(--amber)}
.st-n{font-family:var(--fd);font-size:1.8rem;line-height:1.1}
.st-l{font-size:.75rem;color:var(--txm);font-weight:500}
.tb{background:var(--wh);border-radius:var(--rs);padding:.7rem .9rem;box-shadow:var(--sh);margin-bottom:.9rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.sb{flex:1;min-width:180px;display:flex;align-items:center;gap:.45rem;background:var(--cream);border:1.5px solid var(--bdl);border-radius:var(--rx);padding:.4rem .7rem;transition:border-color .2s}
.sb:focus-within{border-color:var(--g6)}
.sb svg{flex-shrink:0;color:var(--txm)}
.sb input{flex:1;border:none;background:transparent;outline:none;font-family:var(--fb);font-size:.85rem;color:var(--tx1)}
.sb input::placeholder{color:#bbb}
.cl{background:none;border:none;font-size:1.15rem;color:var(--txm);cursor:pointer}
.sog{display:flex;align-items:center;gap:.25rem}
.so{background:transparent;border:1px solid var(--bdl);border-radius:var(--rx);padding:.25rem .55rem;font-size:.75rem;color:var(--txm);cursor:pointer;font-family:var(--fb);display:flex;align-items:center;gap:.2rem;transition:all .15s}
.so:hover{border-color:var(--g6);color:var(--g8)}
.so.on{background:var(--g0);border-color:var(--g6);color:var(--g8);font-weight:600}
.ld{text-align:center;padding:3rem;display:flex;flex-direction:column;align-items:center;gap:.7rem;color:var(--txm)}
.em{text-align:center;padding:2.5rem;background:var(--wh);border-radius:var(--r);box-shadow:var(--sh)}
.em img{width:100%;max-width:340px;height:170px;object-fit:cover;border-radius:var(--rs);margin-bottom:1.1rem}
.em h3{font-family:var(--fd);font-size:1.3rem;margin-bottom:.2rem}
.em p{color:var(--txm);font-size:.88rem;margin-bottom:1.1rem}
.ls{list-style:none;display:flex;flex-direction:column;gap:.55rem}
.cd{background:var(--wh);border-radius:var(--rs);box-shadow:var(--sh);overflow:hidden;transition:box-shadow .2s}
.cd:hover{box-shadow:var(--shm)}
.cd.ex{box-shadow:var(--shm)}
.ch{width:100%;display:flex;align-items:center;justify-content:space-between;gap:.9rem;padding:.8rem 1rem;background:transparent;border:none;cursor:pointer;text-align:left;font-family:var(--fb);transition:background .15s}
.ch:hover{background:var(--cream)}
.cl2{display:flex;align-items:center;gap:.8rem;flex:1;min-width:0}
.th{width:46px;height:46px;border-radius:var(--rx);object-fit:cover;flex-shrink:0;background:var(--g0);color:var(--g5);display:flex;align-items:center;justify-content:center}
.ci{display:flex;flex-direction:column;min-width:0;gap:.08rem}
.ci strong{font-size:.86rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ci .dn{font-size:.76rem;color:var(--txm);display:flex;align-items:center;gap:.3rem}
.cr2{display:flex;align-items:center;gap:.45rem;flex-shrink:0}
.tg{font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:100px;white-space:nowrap}
.tg.lo{background:var(--cream-d);color:var(--tx2)}
.tg.ag{background:var(--g0);color:var(--g7)}
.tg.ag.w{background:var(--terra-l);color:var(--terra-d)}
.tg.sn{background:var(--g0);color:var(--g7)}
.cv{transition:transform .25s;color:var(--txm);flex-shrink:0}
.cv.op{transform:rotate(180deg)}
.dt{padding:0 1.05rem 1.05rem;border-top:1px solid var(--bdl);animation:fadeUp .25s ease-out}
.dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.7rem;padding-top:.8rem}
.dg>div{display:flex;flex-direction:column;gap:.04rem}
.dl{font-size:.68rem;color:var(--txm);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.dg span:not(.dl){font-size:.85rem}
.da{display:flex;align-items:center;gap:.45rem;margin-top:.8rem;padding-top:.7rem;border-top:1px solid var(--bdl)}
.ac{display:flex;align-items:center;gap:.25rem;background:transparent;border:1px solid var(--bd);border-radius:var(--rx);padding:.28rem .6rem;font-size:.78rem;font-weight:500;cursor:pointer;font-family:var(--fb);color:var(--tx2);transition:all .15s}
.ac:hover{border-color:var(--txm);color:var(--tx1)}
.ac.ed:hover{border-color:var(--g6);color:var(--g8)}
.ac.dg2{color:#dc2626;border-color:#fecaca}
.ac.dg2:hover{background:#fef2f2;border-color:#dc2626}
.cfd{display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:#dc2626;font-weight:500}
.ft{text-align:center;padding:1.75rem 1rem;color:var(--txm);font-size:.8rem;border-top:1px solid var(--bdl);margin-top:auto}
@media(max-width:640px){.hero{height:260px}.hero-c{padding:3rem 1.1rem 2rem}.hero-c h1{font-size:2.1rem}.nav{padding:0 1rem;margin-top:1.1rem}.main{padding:0 1rem}.fg{grid-template-columns:1fr}.fi{grid-column:1/-1}.fs{padding:1.1rem}.fa{padding:1rem 1.1rem;flex-direction:column}.bp,.bs{width:100%;justify-content:center}.sg{grid-template-columns:1fr}.tb{flex-direction:column}.sog{width:100%;flex-wrap:wrap}.ch{flex-direction:column;align-items:flex-start}.cr2{width:100%}.dg{grid-template-columns:1fr}.cats-s{padding:0 1rem}}
`;

  return (
    <>
      <style>{S}</style>
      <div className="cr">
        <header className="hero">
          <div className="hero-bg">
            <img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=500&fit=crop" alt="" />
            <div className="hero-ov" />
          </div>
          <div className="hero-c">
            <div className="hero-badge">Campus Sustainability</div>
            <h1>Campus <em>Reclaimed</em></h1>
            <p>Give campus items a second life. Track donations, manage inventory, and keep the cycle going.</p>
          </div>
        </header>

        <section className="cats">
          <div className="cats-s">
            {CATS.map((c, i) => (
              <div key={i} className="cat" style={{ animationDelay: `${i * 0.08}s` }}>
                <img src={c.src} alt={c.label} loading="lazy" />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </section>

        <nav className="nav">
          <button className={`nav-b ${tab === "add" ? "on" : ""}`} onClick={() => setTab("add")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M12 5v14m7-7H5" strokeLinecap="round" /></svg>
            {editId ? "Edit Item" : "New Donation"}
          </button>
          <button className={`nav-b ${tab === "inventory" ? "on" : ""}`} onClick={() => setTab("inventory")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Inventory
            {stats.total > 0 && <span className="cnt">{stats.total}</span>}
          </button>
        </nav>

        {tab === "add" && (
          <div className="main">
            <div className="fw">
              {editId && <div className="eb"><span>Editing item —</span><button onClick={reset}>cancel</button></div>}
              <form onSubmit={submit} className="form">
                <fieldset className="fs">
                  <legend><span className="ln">01</span>Donor Information</legend>
                  <div className="fg">
                    <div className="fi"><label>Full Name <span className="rq">*</span></label><input type="text" name="donorName" value={form.donorName} onChange={onChange} required placeholder="Jane Smith" /></div>
                    <div className="fi"><label>Email Address</label><input type="email" name="donorEmail" value={form.donorEmail} onChange={onChange} placeholder="jane@university.edu" /><span className="hn">For 30-day pickup notifications</span></div>
                    <div className="fi s2"><label>Address <span className="rq">*</span></label><textarea name="address" value={form.address} onChange={onChange} required placeholder="123 University Ave, City, State ZIP" rows={2} /></div>
                    <div className="fi"><label>Phone <span className="rq">*</span></label><input type="tel" name="phoneNumber" value={form.phoneNumber} onChange={onChange} required placeholder="(555) 123-4567" /></div>
                    <div className="fi"><label>Date Accepted <span className="rq">*</span></label><input type="date" name="dateAccepted" value={form.dateAccepted} onChange={onChange} required /></div>
                  </div>
                </fieldset>
                <fieldset className="fs">
                  <legend><span className="ln">02</span>Item Details</legend>
                  <div className="fg">
                    <div className="fi s2"><label>Description <span className="rq">*</span></label><textarea name="itemDescription" value={form.itemDescription} onChange={onChange} required placeholder="Describe the item — type, condition, dimensions, color, brand…" rows={4} /></div>
                    <div className="fi s2"><label>Storage Location <span className="rq">*</span></label><input type="text" name="storageLocation" value={form.storageLocation} onChange={onChange} required placeholder="Building A, Shelf 12" /></div>
                    <div className="fi s2"><label>Photo</label><div className="up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="32" height="32"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Drop a photo or click to browse</span><span className="hn">JPEG, PNG — max 10 MB</span></div></div>
                  </div>
                </fieldset>
                {msg.text && <div className={`tst ${msg.type}`}>{msg.text}</div>}
                <div className="fa">
                  {editId && <button type="button" className="bs" onClick={reset}>Cancel</button>}
                  <button type="submit" className="bp" disabled={loading}>{loading ? <><span className="sp" />Saving…</> : editId ? "Save Changes" : "Add Donation"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === "inventory" && (
          <div className="main">
            <div className="sg">
              <div className="st"><div className="st-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="22" height="22"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" /></svg></div><span className="st-n">{stats.total}</span><span className="st-l">Total Items</span></div>
              <div className="st"><div className="st-i gr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="22" height="22"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg></div><span className="st-n">{stats.month}</span><span className="st-l">This Month</span></div>
              <div className="st"><div className="st-i am"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="22" height="22"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg></div><span className="st-n">{stats.pending}</span><span className="st-l">Pending Notices</span></div>
            </div>

            <div className="tb">
              <div className="sb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="16" height="16"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg><input placeholder="Search donors, items, locations…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="cl" onClick={() => setSearch("")}>&times;</button>}</div>
              <div className="sog">{[["created_at","Recent"],["date_accepted","Date"],["donor_name","Donor"]].map(([f,l]) => <button key={f} className={`so ${sortF===f?"on":""}`} onClick={() => toggleSort(f)}>{l}{sortF===f&&<span>{sortD==="asc"?"↑":"↓"}</span>}</button>)}</div>
            </div>

            {filtered.length === 0 ? (
              <div className="em">
                <img src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=250&fit=crop" alt="" />
                <h3>{search ? "No matching items" : "Your inventory is empty"}</h3>
                <p>{search ? "Try a different search." : "Start by adding your first donation."}</p>
                {!search && <button className="bp sm" onClick={() => setTab("add")}>Add First Donation</button>}
              </div>
            ) : (
              <ul className="ls">
                {filtered.map(item => {
                  const days = daysSince(item.date_accepted);
                  const isExp = expanded === item.id;
                  return (
                    <li key={item.id} className={`cd ${isExp ? "ex" : ""}`}>
                      <button className="ch" onClick={() => setExpanded(isExp ? null : item.id)}>
                        <div className="cl2">
                          <div className="th"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="20" height="20"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                          <div className="ci"><strong>{item.item_description}</strong><span className="dn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="13" height="13"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" /></svg>{item.donor_name}</span></div>
                        </div>
                        <div className="cr2">
                          <span className="tg lo">{item.storage_location}</span>
                          <span className={`tg ag ${days >= 30 ? "w" : ""}`}>{days}d</span>
                          {item.notification_sent && <span className="tg sn">Sent</span>}
                          <svg className={`cv ${isExp ? "op" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                      </button>
                      {isExp && (
                        <div className="dt">
                          <div className="dg"><div><span className="dl">Address</span><span>{item.address}</span></div><div><span className="dl">Phone</span><span>{item.phone_number}</span></div>{item.donor_email && <div><span className="dl">Email</span><span>{item.donor_email}</span></div>}<div><span className="dl">Date Accepted</span><span>{formatDate(item.date_accepted)}</span></div><div><span className="dl">Notification</span><span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split("T")[0])}` : item.donor_email ? "Pending" : "No email on file"}</span></div></div>
                          <div className="da">
                            <button className="ac ed" onClick={() => edit(item)}>✏️ Edit</button>
                            {delConfirm === item.id ? <span className="cfd">Delete? <button className="ac dg2" onClick={() => del(item.id)}>Yes</button><button className="ac" onClick={() => setDelConfirm(null)}>No</button></span> : <button className="ac dg2" onClick={() => setDelConfirm(item.id)}>🗑 Delete</button>}
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

        <footer className="ft">Campus Reclaimed &middot; Reduce, Reuse, Reclaim</footer>
      </div>
    </>
  );
}
