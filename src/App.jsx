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
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

/* ─── constants ─── */
const EMPTY_FORM = {
  donorName: '',
  donorEmail: '',
  address: '',
  phoneNumber: '',
  dateAccepted: new Date().toISOString().split('T')[0],
  itemDescription: '',
  storageLocation: ''
};

/* ================================================================== */
function App() {
  const [tab, setTab] = useState('add');          // 'add' | 'inventory'
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Inventory list state
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
        query = query.or(
          `donor_name.ilike.${q},item_description.ilike.${q},storage_location.ilike.${q}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);

      // compute stats from full dataset
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

        const { error: uploadError } = await supabase.storage
          .from('inventory')
          .upload(filePath, imageFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('inventory')
          .getPublicUrl(filePath);
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
        const { error } = await supabase
          .from('inventory_items')
          .update(record)
          .eq('id', editingId);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Item updated successfully!' });
      } else {
        const { error } = await supabase
          .from('inventory_items')
          .insert([record]);
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
      donorName: item.donor_name,
      donorEmail: item.donor_email || '',
      address: item.address,
      phoneNumber: item.phone_number,
      dateAccepted: item.date_accepted,
      itemDescription: item.item_description,
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
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchItems();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  /* ─── config warning ─── */
  if (!supabase) {
    return (
      <div className="app-container">
        <div className="config-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="48" height="48">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2>Supabase Not Configured</h2>
          <p>Create a <code>.env</code> file in the project root with your Supabase credentials:</p>
          <pre>{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
          <p>See the README for full setup instructions.</p>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  return (
    <div className="app-container">
      {/* ── header ── */}
      <header className="header-section">
        <div className="header-content">
          <h1>Donation Inventory</h1>
          <p className="subtitle">Track and manage donated items with ease</p>
        </div>
        <div className="header-decoration" aria-hidden="true"></div>
      </header>

      {/* ── tabs ── */}
      <nav className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'add'}
          className={`tab-btn ${tab === 'add' ? 'active' : ''}`}
          onClick={() => setTab('add')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
            <path d="M12 5v14m7-7H5" strokeLinecap="round" />
          </svg>
          {editingId ? 'Edit Item' : 'Add Item'}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'inventory'}
          className={`tab-btn ${tab === 'inventory' ? 'active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          Inventory
          {stats.total > 0 && <span className="badge">{stats.total}</span>}
        </button>
      </nav>

      {/* ════════════════ ADD / EDIT TAB ════════════════ */}
      {tab === 'add' && (
        <div className="form-container">
          {editingId && (
            <div className="editing-banner">
              Editing item — <button type="button" className="link-btn" onClick={resetForm}>cancel</button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="inventory-form">
            {/* Donor section */}
            <fieldset className="form-section">
              <legend className="section-title">Donor Information</legend>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="donorName">Donor Name *</label>
                  <input type="text" id="donorName" name="donorName" value={formData.donorName}
                    onChange={handleInputChange} required placeholder="Jane Smith" />
                </div>

                <div className="form-group">
                  <label htmlFor="donorEmail">Donor Email</label>
                  <input type="email" id="donorEmail" name="donorEmail" value={formData.donorEmail}
                    onChange={handleInputChange} placeholder="jane@example.com" />
                  <span className="field-hint">Required for 30-day email notifications</span>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="address">Address *</label>
                  <textarea id="address" name="address" value={formData.address}
                    onChange={handleInputChange} required placeholder="123 Main Street, City, State ZIP" rows="2" />
                </div>

                <div className="form-group">
                  <label htmlFor="phoneNumber">Phone Number *</label>
                  <input type="tel" id="phoneNumber" name="phoneNumber" value={formData.phoneNumber}
                    onChange={handleInputChange} required placeholder="(555) 123-4567" />
                </div>

                <div className="form-group">
                  <label htmlFor="dateAccepted">Date Accepted *</label>
                  <input type="date" id="dateAccepted" name="dateAccepted" value={formData.dateAccepted}
                    onChange={handleInputChange} required />
                </div>
              </div>
            </fieldset>

            {/* Item section */}
            <fieldset className="form-section">
              <legend className="section-title">Item Details</legend>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label htmlFor="itemDescription">Item Description *</label>
                  <textarea id="itemDescription" name="itemDescription" value={formData.itemDescription}
                    onChange={handleInputChange} required placeholder="Detailed description of the donated item…" rows="4" />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="storageLocation">Storage Location *</label>
                  <input type="text" id="storageLocation" name="storageLocation" value={formData.storageLocation}
                    onChange={handleInputChange} required placeholder="Shelf A-12, Warehouse 3" />
                </div>

                <div className="form-group full-width image-upload-group">
                  <label htmlFor="itemImage">Item Photo</label>
                  <div className="image-upload-area">
                    <input type="file" id="itemImage" accept="image/*" onChange={handleImageChange} className="file-input" />
                    <label htmlFor="itemImage" className="file-label">
                      {imagePreview ? (
                        <div className="image-preview">
                          <img src={imagePreview} alt="Preview" />
                          <div className="image-overlay"><span>Change Photo</span></div>
                        </div>
                      ) : (
                        <div className="upload-prompt">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>Click to upload photo</span>
                          <span className="field-hint">JPEG, PNG — max 10 MB</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>

            {message.text && (
              <div className={`message ${message.type}`} role="alert">{message.text}</div>
            )}

            <div className="form-actions">
              {editingId && (
                <button type="button" className="cancel-button" onClick={resetForm}>Cancel</button>
              )}
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? (
                  <><span className="spinner" aria-hidden="true"></span>Processing…</>
                ) : editingId ? 'Save Changes' : 'Add to Inventory'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ════════════════ INVENTORY TAB ════════════════ */}
      {tab === 'inventory' && (
        <div className="inventory-panel">
          {/* stats row */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Items</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.thisMonth}</span>
              <span className="stat-label">This Month</span>
            </div>
            <div className="stat-card accent">
              <span className="stat-value">{stats.pendingNotify}</span>
              <span className="stat-label">Pending Notification</span>
            </div>
          </div>

          {/* search & sort */}
          <div className="list-toolbar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Search by donor, item, or location…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')} aria-label="Clear search">&times;</button>
              )}
            </div>
            <div className="sort-controls">
              <span className="sort-label">Sort:</span>
              {[
                ['created_at', 'Newest'],
                ['date_accepted', 'Date Accepted'],
                ['donor_name', 'Donor'],
              ].map(([field, label]) => (
                <button key={field} className={`sort-btn ${sortField === field ? 'active' : ''}`}
                  onClick={() => toggleSort(field)}>
                  {label}
                  {sortField === field && (
                    <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* items list */}
          {listLoading ? (
            <div className="list-loading"><span className="spinner large" aria-hidden="true"></span><p>Loading inventory…</p></div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="56" height="56">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3>{searchQuery ? 'No matching items' : 'No items yet'}</h3>
              <p>{searchQuery ? 'Try a different search term.' : 'Add your first donation using the Add Item tab.'}</p>
            </div>
          ) : (
            <ul className="items-list">
              {items.map(item => {
                const days = daysSince(item.date_accepted);
                const isExpanded = expandedItem === item.id;
                return (
                  <li key={item.id} className={`item-card ${isExpanded ? 'expanded' : ''}`}>
                    <button className="item-summary" onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}>
                      <div className="item-main">
                        {item.item_image_url && (
                          <img src={item.item_image_url} alt="" className="item-thumb" loading="lazy" />
                        )}
                        <div className="item-info">
                          <strong className="item-desc">{item.item_description}</strong>
                          <span className="item-donor">from {item.donor_name}</span>
                        </div>
                      </div>
                      <div className="item-meta">
                        <span className="item-location">{item.storage_location}</span>
                        <span className={`item-age ${days >= 30 ? 'warn' : ''}`}>{days}d ago</span>
                        {item.notification_sent && <span className="notified-badge" title="Notification sent">✉</span>}
                        <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="item-detail">
                        <div className="detail-grid">
                          <div><span className="detail-label">Address</span><span>{item.address}</span></div>
                          <div><span className="detail-label">Phone</span><span>{item.phone_number}</span></div>
                          {item.donor_email && <div><span className="detail-label">Email</span><span>{item.donor_email}</span></div>}
                          <div><span className="detail-label">Date Accepted</span><span>{formatDate(item.date_accepted)}</span></div>
                          <div><span className="detail-label">Notification</span>
                            <span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split('T')[0])}` : item.donor_email ? 'Pending' : 'No email on file'}</span>
                          </div>
                        </div>
                        {item.item_image_url && (
                          <div className="detail-image">
                            <img src={item.item_image_url} alt={item.item_description} loading="lazy" />
                          </div>
                        )}
                        <div className="detail-actions">
                          <button className="action-btn edit" onClick={() => handleEdit(item)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="16" height="16">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Edit
                          </button>
                          {deleteConfirm === item.id ? (
                            <span className="confirm-delete">
                              Delete this item?
                              <button className="action-btn danger" onClick={() => handleDelete(item.id)}>Yes</button>
                              <button className="action-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                            </span>
                          ) : (
                            <button className="action-btn danger" onClick={() => setDeleteConfirm(item.id)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="16" height="16">
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
        </div>
      )}
    </div>
  );
}

export default App;
