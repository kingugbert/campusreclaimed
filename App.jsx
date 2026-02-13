import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

/* ─── helpers ─── */
const formatPhone = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
};

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
};

/* ─── category images (Unsplash) ─── */
const CATEGORY_IMAGES = [
  { label: 'Furniture', src: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop', alt: 'Modern sofa' },
  { label: 'Desk & Study', src: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop', alt: 'Study desk setup' },
  { label: 'Kitchen', src: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop', alt: 'Kitchen items' },
  { label: 'Electronics', src: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&h=400&fit=crop', alt: 'Electronics' },
  { label: 'Bedding', src: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&h=400&fit=crop', alt: 'Bedroom furnishings' },
  { label: 'Books', src: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=400&fit=crop', alt: 'Stack of books' },
];

const HERO_IMAGE = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=500&fit=crop';

/* ─── constants ─── */
const EMPTY_FORM = {
  donorName: '', donorEmail: '', address: '', phoneNumber: '',
  dateAccepted: new Date().toISOString().split('T')[0],
  itemDescription: '', storageLocation: ''
};

/* ================================================================== */
function App() {
  const [tab, setTab] = useState('add');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedItem, setExpandedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, pendingNotify: 0 });

  /* ─── data fetching ─── */
  const fetchItems = useCallback(async () => {
    if (!supabase) return;
    setListLoading(true);
    try {
      let query = supabase
        .from('inventory_items')
        .select('*')
        .order(sortField, { ascending: sortDir === 'asc' });

      if (searchQuery.trim()) {
        const q = `%${searchQuery.trim()}%`;
        query = query.or(`donor_name.ilike.${q},item_description.ilike.${q},storage_location.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStats({
        total: (data || []).length,
        thisMonth: (data || []).filter(i => i.date_accepted >= monthStart).length,
        pendingNotify: (data || []).filter(i => !i.notification_sent && daysSince(i.date_accepted) >= 30 && i.donor_email).length
      });
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setListLoading(false);
    }
  }, [searchQuery, sortField, sortDir]);

  useEffect(() => {
    if (tab === 'inventory') fetchItems();
  }, [tab, fetchItems]);

  /* ─── form handlers ─── */
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phoneNumber') {
      setFormData(prev => ({ ...prev, phoneNumber: formatPhone(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 10 MB.' });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setImageFile(null);
    setImagePreview(null);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) {
      setMessage({ type: 'error', text: 'Supabase is not configured. Check your .env file.' });
      return;
    }
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let imageUrl = editingId ? undefined : null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `inventory-images/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('inventory').upload(filePath, imageFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('inventory').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      const record = {
        donor_name: formData.donorName.trim(),
        donor_email: formData.donorEmail.trim() || null,
        address: formData.address.trim(),
        phone_number: formData.phoneNumber.trim(),
        date_accepted: formData.dateAccepted,
        item_description: formData.itemDescription.trim(),
        storage_location: formData.storageLocation.trim(),
      };
      if (imageUrl !== undefined) record.item_image_url = imageUrl;

      if (editingId) {
        const { error } = await supabase.from('inventory_items').update(record).eq('id', editingId);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Item updated successfully!' });
      } else {
        const { error } = await supabase.from('inventory_items').insert([record]);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Item added to inventory!' });
      }
      resetForm();
    } catch (error) {
      console.error('Submit error:', error);
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setFormData({
      donorName: item.donor_name, donorEmail: item.donor_email || '',
      address: item.address, phoneNumber: item.phone_number,
      dateAccepted: item.date_accepted, itemDescription: item.item_description,
      storageLocation: item.storage_location
    });
    setEditingId(item.id);
    setImagePreview(item.item_image_url || null);
    setImageFile(null);
    setTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchItems();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  /* ─── config warning ─── */
  if (!supabase) {
    return (
      <div className="cr-app">
        <div className="cr-config-warning">
          <div className="cr-config-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="52" height="52">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2>Connect Your Database</h2>
          <p>Create a <code>.env</code> file in the project root:</p>
          <pre>{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
          <p className="cr-config-sub">See the README for full setup instructions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-app">
      {/* ═══ HERO ═══ */}
      <header className="cr-hero">
        <div className="cr-hero-bg">
          <img src={HERO_IMAGE} alt="" aria-hidden="true" />
          <div className="cr-hero-overlay"></div>
        </div>
        <div className="cr-hero-content">
          <div className="cr-hero-badge">Campus Sustainability</div>
          <h1>Campus <span>Reclaimed</span></h1>
          <p>Give campus items a second life. Track donations, manage inventory, and keep the cycle going.</p>
        </div>
      </header>

      {/* ═══ CATEGORY STRIP ═══ */}
      <section className="cr-categories" aria-label="Common donation categories">
        <div className="cr-categories-scroll">
          {CATEGORY_IMAGES.map((cat, i) => (
            <div key={i} className="cr-cat-card" style={{ animationDelay: `${i * 0.08}s` }}>
              <img src={cat.src} alt={cat.alt} loading="lazy" />
              <span>{cat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ NAV TABS ═══ */}
      <nav className="cr-nav" role="tablist">
        <button role="tab" aria-selected={tab === 'add'}
          className={`cr-nav-btn ${tab === 'add' ? 'active' : ''}`}
          onClick={() => setTab('add')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
            <path d="M12 5v14m7-7H5" strokeLinecap="round" />
          </svg>
          {editingId ? 'Edit Item' : 'New Donation'}
        </button>
        <button role="tab" aria-selected={tab === 'inventory'}
          className={`cr-nav-btn ${tab === 'inventory' ? 'active' : ''}`}
          onClick={() => setTab('inventory')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Inventory
          {stats.total > 0 && <span className="cr-count">{stats.total}</span>}
        </button>
      </nav>

      {/* ═══ ADD / EDIT ═══ */}
      {tab === 'add' && (
        <main className="cr-main">
          <div className="cr-form-wrapper">
            {editingId && (
              <div className="cr-edit-banner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Editing item — <button type="button" className="cr-link" onClick={resetForm}>cancel</button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="cr-form">
              <fieldset className="cr-fieldset">
                <legend>
                  <span className="cr-legend-num">01</span>
                  Donor Information
                </legend>
                <div className="cr-field-grid">
                  <div className="cr-field">
                    <label htmlFor="donorName">Full Name <span className="cr-req">*</span></label>
                    <input type="text" id="donorName" name="donorName" value={formData.donorName}
                      onChange={handleInputChange} required placeholder="Jane Smith" />
                  </div>
                  <div className="cr-field">
                    <label htmlFor="donorEmail">Email Address</label>
                    <input type="email" id="donorEmail" name="donorEmail" value={formData.donorEmail}
                      onChange={handleInputChange} placeholder="jane@university.edu" />
                    <span className="cr-hint">For 30-day pickup notifications</span>
                  </div>
                  <div className="cr-field cr-span-2">
                    <label htmlFor="address">Address <span className="cr-req">*</span></label>
                    <textarea id="address" name="address" value={formData.address}
                      onChange={handleInputChange} required placeholder="123 University Ave, City, State ZIP" rows="2" />
                  </div>
                  <div className="cr-field">
                    <label htmlFor="phoneNumber">Phone <span className="cr-req">*</span></label>
                    <input type="tel" id="phoneNumber" name="phoneNumber" value={formData.phoneNumber}
                      onChange={handleInputChange} required placeholder="(555) 123-4567" />
                  </div>
                  <div className="cr-field">
                    <label htmlFor="dateAccepted">Date Accepted <span className="cr-req">*</span></label>
                    <input type="date" id="dateAccepted" name="dateAccepted" value={formData.dateAccepted}
                      onChange={handleInputChange} required />
                  </div>
                </div>
              </fieldset>

              <fieldset className="cr-fieldset">
                <legend>
                  <span className="cr-legend-num">02</span>
                  Item Details
                </legend>
                <div className="cr-field-grid">
                  <div className="cr-field cr-span-2">
                    <label htmlFor="itemDescription">Description <span className="cr-req">*</span></label>
                    <textarea id="itemDescription" name="itemDescription" value={formData.itemDescription}
                      onChange={handleInputChange} required
                      placeholder="Describe the item — type, condition, dimensions, color, brand…" rows="4" />
                  </div>
                  <div className="cr-field cr-span-2">
                    <label htmlFor="storageLocation">Storage Location <span className="cr-req">*</span></label>
                    <input type="text" id="storageLocation" name="storageLocation" value={formData.storageLocation}
                      onChange={handleInputChange} required placeholder="Building A, Shelf 12" />
                  </div>
                  <div className="cr-field cr-span-2">
                    <label>Photo</label>
                    <div className="cr-upload-zone">
                      <input type="file" id="itemImage" accept="image/*" onChange={handleImageChange} className="cr-file-input" />
                      <label htmlFor="itemImage" className="cr-file-label">
                        {imagePreview ? (
                          <div className="cr-img-preview">
                            <img src={imagePreview} alt="Preview" />
                            <div className="cr-img-hover"><span>Replace photo</span></div>
                          </div>
                        ) : (
                          <div className="cr-upload-prompt">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="36" height="36">
                              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="cr-upload-text">Drop a photo or click to browse</span>
                            <span className="cr-hint">JPEG, PNG — max 10 MB</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              </fieldset>

              {message.text && (
                <div className={`cr-toast ${message.type}`} role="alert">
                  {message.type === 'success' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {message.type === 'error' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
                      <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {message.text}
                </div>
              )}

              <div className="cr-form-actions">
                {editingId && <button type="button" className="cr-btn-secondary" onClick={resetForm}>Cancel</button>}
                <button type="submit" className="cr-btn-primary" disabled={loading}>
                  {loading ? <><span className="cr-spinner"></span>Saving…</> : editingId ? 'Save Changes' : 'Add Donation'}
                </button>
              </div>
            </form>
          </div>
        </main>
      )}

      {/* ═══ INVENTORY ═══ */}
      {tab === 'inventory' && (
        <main className="cr-main">
          <div className="cr-stats-grid">
            <div className="cr-stat">
              <div className="cr-stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.total}</span>
              <span className="cr-stat-label">Total Items</span>
            </div>
            <div className="cr-stat">
              <div className="cr-stat-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.thisMonth}</span>
              <span className="cr-stat-label">This Month</span>
            </div>
            <div className="cr-stat">
              <div className="cr-stat-icon amber">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.pendingNotify}</span>
              <span className="cr-stat-label">Pending Notices</span>
            </div>
          </div>

          <div className="cr-toolbar">
            <div className="cr-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Search donors, items, locations…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button className="cr-clear" onClick={() => setSearchQuery('')}>&times;</button>}
            </div>
            <div className="cr-sort-group">
              {[['created_at', 'Recent'], ['date_accepted', 'Date'], ['donor_name', 'Donor']].map(([f, l]) => (
                <button key={f} className={`cr-sort-btn ${sortField === f ? 'on' : ''}`}
                  onClick={() => toggleSort(f)}>
                  {l}{sortField === f && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <div className="cr-loading"><span className="cr-spinner lg"></span><p>Loading inventory…</p></div>
          ) : items.length === 0 ? (
            <div className="cr-empty">
              <img src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=250&fit=crop" alt="Empty room" className="cr-empty-img" />
              <h3>{searchQuery ? 'No matching items' : 'Your inventory is empty'}</h3>
              <p>{searchQuery ? 'Try a different search term.' : 'Start by adding your first donation.'}</p>
              {!searchQuery && (
                <button className="cr-btn-primary sm" onClick={() => setTab('add')}>Add First Donation</button>
              )}
            </div>
          ) : (
            <ul className="cr-list">
              {items.map(item => {
                const days = daysSince(item.date_accepted);
                const isExp = expandedItem === item.id;
                return (
                  <li key={item.id} className={`cr-card ${isExp ? 'expanded' : ''}`}>
                    <button className="cr-card-header" onClick={() => setExpandedItem(isExp ? null : item.id)} aria-expanded={isExp}>
                      <div className="cr-card-left">
                        {item.item_image_url ? (
                          <img src={item.item_image_url} alt="" className="cr-card-thumb" loading="lazy" />
                        ) : (
                          <div className="cr-card-thumb placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="22" height="22">
                              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                        <div className="cr-card-info">
                          <strong>{item.item_description}</strong>
                          <span className="cr-card-donor">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {item.donor_name}
                          </span>
                        </div>
                      </div>
                      <div className="cr-card-right">
                        <span className="cr-tag location">{item.storage_location}</span>
                        <span className={`cr-tag age ${days >= 30 ? 'warn' : ''}`}>{days}d</span>
                        {item.notification_sent && <span className="cr-tag sent" title="Notification sent">Sent</span>}
                        <svg className={`cr-chevron ${isExp ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>

                    {isExp && (
                      <div className="cr-card-detail">
                        <div className="cr-detail-grid">
                          <div><span className="cr-detail-label">Address</span><span>{item.address}</span></div>
                          <div><span className="cr-detail-label">Phone</span><span>{item.phone_number}</span></div>
                          {item.donor_email && <div><span className="cr-detail-label">Email</span><span>{item.donor_email}</span></div>}
                          <div><span className="cr-detail-label">Date Accepted</span><span>{formatDate(item.date_accepted)}</span></div>
                          <div><span className="cr-detail-label">Notification</span>
                            <span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split('T')[0])}` : item.donor_email ? 'Pending' : 'No email on file'}</span>
                          </div>
                        </div>
                        {item.item_image_url && (
                          <div className="cr-detail-photo">
                            <img src={item.item_image_url} alt={item.item_description} loading="lazy" />
                          </div>
                        )}
                        <div className="cr-detail-actions">
                          <button className="cr-act edit" onClick={() => handleEdit(item)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Edit
                          </button>
                          {deleteConfirm === item.id ? (
                            <span className="cr-confirm-delete">
                              Delete this item?
                              <button className="cr-act danger" onClick={() => handleDelete(item.id)}>Yes, delete</button>
                              <button className="cr-act" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            </span>
                          ) : (
                            <button className="cr-act danger" onClick={() => setDeleteConfirm(item.id)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      )}

      {/* ═══ FOOTER ═══ */}
      <footer className="cr-footer">
        <p>Campus Reclaimed &middot; Reduce, Reuse, Reclaim</p>
      </footer>
    </div>
  );
}

export default App;
