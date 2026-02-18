import React, { useState, useEffect, useCallback, useRef } from 'react';
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
const EMPTY_DONOR = { donorName: '', donorEmail: '', address: '', phoneNumber: '' };
const EMPTY_ITEM = { itemDescription: '', storageLocation: '' };

/* ================================================================== */
function App() {
  /* ── navigation ── */
  const [tab, setTab] = useState('donate');

  /* ── donation form state ── */
  const [donorStep, setDonorStep] = useState('search'); // 'search' | 'selected' | 'new'
  const [donorSearch, setDonorSearch] = useState('');
  const [donorResults, setDonorResults] = useState([]);
  const [donorSearching, setDonorSearching] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [donorForm, setDonorForm] = useState({ ...EMPTY_DONOR });
  const [dateAccepted, setDateAccepted] = useState(new Date().toISOString().split('T')[0]);
  const [donationItems, setDonationItems] = useState([{ ...EMPTY_ITEM, _key: Date.now() }]);
  const [imageFiles, setImageFiles] = useState({});
  const [imagePreviews, setImagePreviews] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const searchTimeout = useRef(null);

  /* ── inventory state ── */
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedItem, setExpandedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, donors: 0, pendingNotify: 0 });

  /* ── donors tab state ── */
  const [donors, setDonors] = useState([]);
  const [donorsLoading, setDonorsLoading] = useState(false);
  const [donorSearchQuery, setDonorSearchQuery] = useState('');
  const [expandedDonor, setExpandedDonor] = useState(null);
  const [donorDonations, setDonorDonations] = useState({});
  const [editingDonor, setEditingDonor] = useState(null);
  const [editDonorForm, setEditDonorForm] = useState({ ...EMPTY_DONOR });

  /* ── inline editing ── */
  const [editingItem, setEditingItem] = useState(null);
  const [editItemForm, setEditItemForm] = useState({ ...EMPTY_ITEM });

  /* ════════════════════════════════════════════════
     DONOR SEARCH (for donation form)
     ════════════════════════════════════════════════ */
  const searchDonors = useCallback(async (query) => {
    if (!supabase || !query.trim()) { setDonorResults([]); return; }
    setDonorSearching(true);
    try {
      const q = `%${query.trim()}%`;
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .or(`donor_name.ilike.${q},donor_email.ilike.${q},phone_number.ilike.${q}`)
        .order('donor_name')
        .limit(8);
      if (error) throw error;
      setDonorResults(data || []);
    } catch (err) { console.error('Donor search error:', err); }
    finally { setDonorSearching(false); }
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (donorSearch.trim().length >= 2) {
      searchTimeout.current = setTimeout(() => searchDonors(donorSearch), 300);
    } else { setDonorResults([]); }
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [donorSearch, searchDonors]);

  /* ════════════════════════════════════════════════
     INVENTORY FETCH (joined query)
     ════════════════════════════════════════════════ */
  const fetchItems = useCallback(async () => {
    if (!supabase) return;
    setListLoading(true);
    try {
      const { data, error } = await supabase
        .from('donation_items')
        .select(`*, donation:donations!inner(id, date_accepted, notes, donor:donors!inner(id, donor_name, donor_email, address, phone_number))`)
        .order('created_at', { ascending: sortDir === 'asc' });
      if (error) throw error;

      let filtered = data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        filtered = filtered.filter(item =>
          item.item_description?.toLowerCase().includes(q) ||
          item.storage_location?.toLowerCase().includes(q) ||
          item.donation?.donor?.donor_name?.toLowerCase().includes(q) ||
          item.donation?.donor?.donor_email?.toLowerCase().includes(q)
        );
      }

      if (sortField === 'donor_name') {
        filtered.sort((a, b) => {
          const aName = a.donation?.donor?.donor_name || '';
          const bName = b.donation?.donor?.donor_name || '';
          return sortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
        });
      } else if (sortField === 'date_accepted') {
        filtered.sort((a, b) => {
          const aD = a.donation?.date_accepted || '';
          const bD = b.donation?.date_accepted || '';
          return sortDir === 'asc' ? aD.localeCompare(bD) : bD.localeCompare(aD);
        });
      }

      setItems(filtered);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const uniqueDonors = new Set((data || []).map(i => i.donation?.donor?.id).filter(Boolean));
      setStats({
        total: (data || []).length,
        thisMonth: (data || []).filter(i => i.donation?.date_accepted >= monthStart).length,
        donors: uniqueDonors.size,
        pendingNotify: (data || []).filter(i =>
          !i.notification_sent && daysSince(i.donation?.date_accepted) >= 30 && i.donation?.donor?.donor_email
        ).length
      });
    } catch (err) { console.error('Fetch error:', err); }
    finally { setListLoading(false); }
  }, [searchQuery, sortField, sortDir]);

  useEffect(() => { if (tab === 'inventory') fetchItems(); }, [tab, fetchItems]);

  /* ════════════════════════════════════════════════
     DONORS LIST FETCH
     ════════════════════════════════════════════════ */
  const fetchDonors = useCallback(async () => {
    if (!supabase) return;
    setDonorsLoading(true);
    try {
      const { data, error } = await supabase
        .from('donors')
        .select(`*, donations(id, date_accepted, donation_items(id))`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      let filtered = data || [];
      if (donorSearchQuery.trim()) {
        const q = donorSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(d =>
          d.donor_name?.toLowerCase().includes(q) ||
          d.donor_email?.toLowerCase().includes(q) ||
          d.phone_number?.includes(q)
        );
      }
      setDonors(filtered);
    } catch (err) { console.error('Fetch donors error:', err); }
    finally { setDonorsLoading(false); }
  }, [donorSearchQuery]);

  useEffect(() => { if (tab === 'donors') fetchDonors(); }, [tab, fetchDonors]);

  /* ── fetch donations for a specific donor ── */
  const fetchDonorDonations = async (donorId) => {
    if (!supabase || donorDonations[donorId]) return;
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`*, donation_items(*)`)
        .eq('donor_id', donorId)
        .order('date_accepted', { ascending: false });
      if (error) throw error;
      setDonorDonations(prev => ({ ...prev, [donorId]: data || [] }));
    } catch (err) { console.error('Fetch donor donations error:', err); }
  };

  /* ════════════════════════════════════════════════
     DONATION FORM HANDLERS
     ════════════════════════════════════════════════ */
  const handleDonorFormChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phoneNumber') setDonorForm(prev => ({ ...prev, phoneNumber: formatPhone(value) }));
    else setDonorForm(prev => ({ ...prev, [name]: value }));
  };

  const selectExistingDonor = (donor) => {
    setSelectedDonor(donor);
    setDonorStep('selected');
    setDonorSearch('');
    setDonorResults([]);
  };

  const startNewDonor = () => {
    setDonorStep('new');
    setDonorForm({ ...EMPTY_DONOR, donorName: donorSearch.trim() });
    setDonorResults([]);
  };

  const changeDonor = () => {
    setSelectedDonor(null);
    setDonorStep('search');
    setDonorSearch('');
    setDonorForm({ ...EMPTY_DONOR });
  };

  const handleItemChange = (key, field, value) => {
    setDonationItems(prev => prev.map(item =>
      item._key === key ? { ...item, [field]: value } : item
    ));
  };

  const addItem = () => {
    setDonationItems(prev => [...prev, { ...EMPTY_ITEM, _key: Date.now() }]);
  };

  const removeItem = (key) => {
    if (donationItems.length <= 1) return;
    setDonationItems(prev => prev.filter(item => item._key !== key));
    setImageFiles(prev => { const n = { ...prev }; delete n[key]; return n; });
    setImagePreviews(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleItemImage = (key, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage({ type: 'error', text: 'Image must be under 10 MB.' }); return; }
    setImageFiles(prev => ({ ...prev, [key]: file }));
    const reader = new FileReader();
    reader.onloadend = () => setImagePreviews(prev => ({ ...prev, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  const resetDonationForm = () => {
    setDonorStep('search');
    setDonorSearch('');
    setDonorResults([]);
    setSelectedDonor(null);
    setDonorForm({ ...EMPTY_DONOR });
    setDateAccepted(new Date().toISOString().split('T')[0]);
    setDonationItems([{ ...EMPTY_ITEM, _key: Date.now() }]);
    setImageFiles({});
    setImagePreviews({});
    setMessage({ type: '', text: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) { setMessage({ type: 'error', text: 'Supabase is not configured.' }); return; }

    const validItems = donationItems.filter(i => i.itemDescription.trim() && i.storageLocation.trim());
    if (validItems.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one item with a description and storage location.' });
      return;
    }
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let donorId;
      if (selectedDonor) {
        donorId = selectedDonor.id;
      } else {
        const { data: newDonor, error: donorError } = await supabase
          .from('donors')
          .insert([{
            donor_name: donorForm.donorName.trim(),
            donor_email: donorForm.donorEmail.trim() || null,
            address: donorForm.address.trim(),
            phone_number: donorForm.phoneNumber.trim(),
          }])
          .select().single();
        if (donorError) throw donorError;
        donorId = newDonor.id;
      }

      const { data: donation, error: donError } = await supabase
        .from('donations')
        .insert([{ donor_id: donorId, date_accepted: dateAccepted }])
        .select().single();
      if (donError) throw donError;

      for (const item of validItems) {
        let imageUrl = null;
        const file = imageFiles[item._key];
        if (file) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `inventory-images/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('inventory').upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('inventory').getPublicUrl(filePath);
          imageUrl = urlData.publicUrl;
        }
        const { error: itemError } = await supabase
          .from('donation_items')
          .insert([{ donation_id: donation.id, item_description: item.itemDescription.trim(), storage_location: item.storageLocation.trim(), item_image_url: imageUrl }]);
        if (itemError) throw itemError;
      }

      const count = validItems.length;
      setMessage({ type: 'success', text: `Donation recorded! ${count} item${count > 1 ? 's' : ''} added to inventory.` });
      resetDonationForm();
    } catch (error) {
      console.error('Submit error:', error);
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally { setLoading(false); }
  };

  /* ════════════════════════════════════════════════
     INVENTORY ACTIONS
     ════════════════════════════════════════════════ */
  const handleDeleteItem = async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('donation_items').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      fetchItems();
    } catch (err) { console.error('Delete error:', err); }
  };

  const startEditItem = (item) => {
    setEditingItem(item.id);
    setEditItemForm({ itemDescription: item.item_description, storageLocation: item.storage_location });
  };

  const saveEditItem = async () => {
    if (!supabase || !editingItem) return;
    try {
      const { error } = await supabase.from('donation_items')
        .update({ item_description: editItemForm.itemDescription.trim(), storage_location: editItemForm.storageLocation.trim() })
        .eq('id', editingItem);
      if (error) throw error;
      setEditingItem(null);
      fetchItems();
    } catch (err) { console.error('Edit error:', err); }
  };

  /* ── donor actions ── */
  const startEditDonor = (donor) => {
    setEditingDonor(donor.id);
    setEditDonorForm({ donorName: donor.donor_name, donorEmail: donor.donor_email || '', address: donor.address, phoneNumber: donor.phone_number });
  };

  const saveEditDonor = async () => {
    if (!supabase || !editingDonor) return;
    try {
      const { error } = await supabase.from('donors')
        .update({ donor_name: editDonorForm.donorName.trim(), donor_email: editDonorForm.donorEmail.trim() || null, address: editDonorForm.address.trim(), phone_number: editDonorForm.phoneNumber.trim() })
        .eq('id', editingDonor);
      if (error) throw error;
      setEditingDonor(null);
      fetchDonors();
    } catch (err) { console.error('Edit donor error:', err); }
  };

  const startDonationForDonor = (donor) => {
    setSelectedDonor(donor);
    setDonorStep('selected');
    setTab('donate');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <p className="cr-config-sub">Run <code>migration.sql</code> to create the donors, donations, and donation_items tables.</p>
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
      <nav className="cr-nav three" role="tablist">
        <button role="tab" aria-selected={tab === 'donate'}
          className={`cr-nav-btn ${tab === 'donate' ? 'active' : ''}`}
          onClick={() => setTab('donate')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
            <path d="M12 5v14m7-7H5" strokeLinecap="round" />
          </svg>
          New Donation
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
        <button role="tab" aria-selected={tab === 'donors'}
          className={`cr-nav-btn ${tab === 'donors' ? 'active' : ''}`}
          onClick={() => setTab('donors')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Donors
        </button>
      </nav>

      {/* ═══ TAB: NEW DONATION ═══ */}
      {tab === 'donate' && (
        <main className="cr-main">
          <div className="cr-form-wrapper">
            <form onSubmit={handleSubmit} className="cr-form">

              {/* Step 1: Donor */}
              <fieldset className="cr-fieldset">
                <legend><span className="cr-legend-num">01</span> Donor</legend>

                {donorStep === 'search' && (
                  <div className="cr-donor-search-section">
                    <p className="cr-section-desc">Search for a returning donor or create a new account.</p>
                    <div className="cr-donor-search-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                      </svg>
                      <input type="text" placeholder="Search by name, email, or phone…" value={donorSearch}
                        onChange={e => setDonorSearch(e.target.value)} autoFocus />
                      {donorSearching && <span className="cr-spinner sm"></span>}
                    </div>

                    {donorResults.length > 0 && (
                      <ul className="cr-donor-results">
                        {donorResults.map(d => (
                          <li key={d.id}>
                            <button type="button" className="cr-donor-result" onClick={() => selectExistingDonor(d)}>
                              <div className="cr-donor-avatar">{d.donor_name.charAt(0).toUpperCase()}</div>
                              <div className="cr-donor-result-info">
                                <strong>{d.donor_name}</strong>
                                <span>{d.donor_email || d.phone_number}</span>
                              </div>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="16" height="16">
                                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {donorSearch.trim().length >= 2 && !donorSearching && donorResults.length === 0 && (
                      <div className="cr-no-results"><p>No donors found matching &ldquo;{donorSearch}&rdquo;</p></div>
                    )}

                    <button type="button" className="cr-new-donor-btn" onClick={startNewDonor}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Create New Donor Account
                    </button>
                  </div>
                )}

                {donorStep === 'selected' && selectedDonor && (
                  <div className="cr-selected-donor">
                    <div className="cr-selected-donor-card">
                      <div className="cr-donor-avatar lg">{selectedDonor.donor_name.charAt(0).toUpperCase()}</div>
                      <div className="cr-selected-donor-info">
                        <strong>{selectedDonor.donor_name}</strong>
                        {selectedDonor.donor_email && <span>{selectedDonor.donor_email}</span>}
                        <span>{selectedDonor.phone_number}</span>
                        <span className="cr-donor-address">{selectedDonor.address}</span>
                      </div>
                      <button type="button" className="cr-change-donor" onClick={changeDonor}>Change</button>
                    </div>
                  </div>
                )}

                {donorStep === 'new' && (
                  <div className="cr-new-donor-form">
                    <div className="cr-inline-back">
                      <button type="button" className="cr-link" onClick={() => { setDonorStep('search'); setDonorForm({ ...EMPTY_DONOR }); }}>
                        &larr; Back to search
                      </button>
                    </div>
                    <div className="cr-field-grid">
                      <div className="cr-field">
                        <label htmlFor="donorName">Full Name <span className="cr-req">*</span></label>
                        <input type="text" id="donorName" name="donorName" value={donorForm.donorName}
                          onChange={handleDonorFormChange} required placeholder="Jane Smith" />
                      </div>
                      <div className="cr-field">
                        <label htmlFor="donorEmail">Email Address</label>
                        <input type="email" id="donorEmail" name="donorEmail" value={donorForm.donorEmail}
                          onChange={handleDonorFormChange} placeholder="jane@university.edu" />
                        <span className="cr-hint">For 30-day pickup notifications</span>
                      </div>
                      <div className="cr-field cr-span-2">
                        <label htmlFor="address">Address <span className="cr-req">*</span></label>
                        <textarea id="address" name="address" value={donorForm.address}
                          onChange={handleDonorFormChange} required placeholder="123 University Ave, City, State ZIP" rows="2" />
                      </div>
                      <div className="cr-field">
                        <label htmlFor="phoneNumber">Phone <span className="cr-req">*</span></label>
                        <input type="tel" id="phoneNumber" name="phoneNumber" value={donorForm.phoneNumber}
                          onChange={handleDonorFormChange} required placeholder="(555) 123-4567" />
                      </div>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Step 2 + 3: Date & Items (shown once donor is chosen) */}
              {(donorStep === 'selected' || donorStep === 'new') && (
                <>
                  <fieldset className="cr-fieldset">
                    <legend><span className="cr-legend-num">02</span> Donation Details</legend>
                    <div className="cr-field-grid">
                      <div className="cr-field">
                        <label htmlFor="dateAccepted">Date Accepted <span className="cr-req">*</span></label>
                        <input type="date" id="dateAccepted" value={dateAccepted}
                          onChange={e => setDateAccepted(e.target.value)} required />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="cr-fieldset">
                    <legend>
                      <span className="cr-legend-num">03</span> Items
                      <span className="cr-item-count">{donationItems.length} item{donationItems.length !== 1 ? 's' : ''}</span>
                    </legend>

                    <div className="cr-items-list">
                      {donationItems.map((item, idx) => (
                        <div key={item._key} className="cr-item-entry">
                          <div className="cr-item-entry-header">
                            <span className="cr-item-num">Item {idx + 1}</span>
                            {donationItems.length > 1 && (
                              <button type="button" className="cr-remove-item" onClick={() => removeItem(item._key)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="cr-field-grid">
                            <div className="cr-field cr-span-2">
                              <label>Description <span className="cr-req">*</span></label>
                              <textarea value={item.itemDescription}
                                onChange={e => handleItemChange(item._key, 'itemDescription', e.target.value)}
                                required placeholder="Describe the item — type, condition, dimensions, color, brand…" rows="3" />
                            </div>
                            <div className="cr-field">
                              <label>Storage Location <span className="cr-req">*</span></label>
                              <input type="text" value={item.storageLocation}
                                onChange={e => handleItemChange(item._key, 'storageLocation', e.target.value)}
                                required placeholder="Building A, Shelf 12" />
                            </div>
                            <div className="cr-field">
                              <label>Photo</label>
                              <div className="cr-upload-zone compact">
                                <input type="file" id={`img-${item._key}`} accept="image/*"
                                  onChange={e => handleItemImage(item._key, e)} className="cr-file-input" />
                                <label htmlFor={`img-${item._key}`} className="cr-file-label compact">
                                  {imagePreviews[item._key] ? (
                                    <div className="cr-img-preview compact">
                                      <img src={imagePreviews[item._key]} alt="Preview" />
                                      <div className="cr-img-hover"><span>Replace</span></div>
                                    </div>
                                  ) : (
                                    <div className="cr-upload-prompt compact">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      <span className="cr-upload-text">Add photo</span>
                                    </div>
                                  )}
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button type="button" className="cr-add-item-btn" onClick={addItem}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                        <path d="M12 5v14m7-7H5" strokeLinecap="round" />
                      </svg>
                      Add Another Item
                    </button>
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
                    <button type="button" className="cr-btn-secondary" onClick={resetDonationForm}>Cancel</button>
                    <button type="submit" className="cr-btn-primary" disabled={loading}>
                      {loading ? <><span className="cr-spinner"></span>Saving…</> : (
                        <>Record Donation{donationItems.filter(i => i.itemDescription.trim()).length > 1 &&
                          ` (${donationItems.filter(i => i.itemDescription.trim()).length} items)`}</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </main>
      )}

      {/* ═══ TAB: INVENTORY ═══ */}
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
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.donors}</span>
              <span className="cr-stat-label">Active Donors</span>
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
              <input type="text" placeholder="Search items, donors, locations…" value={searchQuery}
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
              {!searchQuery && <button className="cr-btn-primary sm" onClick={() => setTab('donate')}>Add First Donation</button>}
            </div>
          ) : (
            <ul className="cr-list">
              {items.map(item => {
                const donor = item.donation?.donor;
                const dateAcc = item.donation?.date_accepted;
                const days = daysSince(dateAcc);
                const isExp = expandedItem === item.id;
                const isEditing = editingItem === item.id;

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
                            {donor?.donor_name || 'Unknown'}
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
                        {isEditing ? (
                          <div className="cr-inline-edit">
                            <div className="cr-field-grid">
                              <div className="cr-field cr-span-2">
                                <label>Description</label>
                                <textarea value={editItemForm.itemDescription}
                                  onChange={e => setEditItemForm(p => ({ ...p, itemDescription: e.target.value }))} rows="3" />
                              </div>
                              <div className="cr-field cr-span-2">
                                <label>Storage Location</label>
                                <input type="text" value={editItemForm.storageLocation}
                                  onChange={e => setEditItemForm(p => ({ ...p, storageLocation: e.target.value }))} />
                              </div>
                            </div>
                            <div className="cr-detail-actions">
                              <button className="cr-act edit" onClick={saveEditItem}>Save</button>
                              <button className="cr-act" onClick={() => setEditingItem(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="cr-detail-grid">
                              <div><span className="cr-detail-label">Donor</span><span>{donor?.donor_name}</span></div>
                              <div><span className="cr-detail-label">Address</span><span>{donor?.address}</span></div>
                              <div><span className="cr-detail-label">Phone</span><span>{donor?.phone_number}</span></div>
                              {donor?.donor_email && <div><span className="cr-detail-label">Email</span><span>{donor?.donor_email}</span></div>}
                              <div><span className="cr-detail-label">Date Accepted</span><span>{formatDate(dateAcc)}</span></div>
                              <div><span className="cr-detail-label">Notification</span>
                                <span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split('T')[0])}` : donor?.donor_email ? 'Pending' : 'No email on file'}</span>
                              </div>
                            </div>
                            {item.item_image_url && (
                              <div className="cr-detail-photo"><img src={item.item_image_url} alt={item.item_description} loading="lazy" /></div>
                            )}
                            <div className="cr-detail-actions">
                              <button className="cr-act edit" onClick={() => startEditItem(item)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Edit
                              </button>
                              {deleteConfirm === item.id ? (
                                <span className="cr-confirm-delete">
                                  Delete this item?
                                  <button className="cr-act danger" onClick={() => handleDeleteItem(item.id)}>Yes, delete</button>
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
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      )}

      {/* ═══ TAB: DONORS ═══ */}
      {tab === 'donors' && (
        <main className="cr-main">
          <div className="cr-toolbar">
            <div className="cr-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Search donors…" value={donorSearchQuery}
                onChange={e => setDonorSearchQuery(e.target.value)} />
              {donorSearchQuery && <button className="cr-clear" onClick={() => setDonorSearchQuery('')}>&times;</button>}
            </div>
          </div>

          {donorsLoading ? (
            <div className="cr-loading"><span className="cr-spinner lg"></span><p>Loading donors…</p></div>
          ) : donors.length === 0 ? (
            <div className="cr-empty">
              <h3>{donorSearchQuery ? 'No matching donors' : 'No donors yet'}</h3>
              <p>{donorSearchQuery ? 'Try a different search term.' : 'Donors are created when you record a donation.'}</p>
            </div>
          ) : (
            <ul className="cr-list">
              {donors.map(donor => {
                const totalDonations = donor.donations?.length || 0;
                const totalItems = donor.donations?.reduce((sum, d) => sum + (d.donation_items?.length || 0), 0) || 0;
                const isExp = expandedDonor === donor.id;
                const isEditing = editingDonor === donor.id;

                return (
                  <li key={donor.id} className={`cr-card ${isExp ? 'expanded' : ''}`}>
                    <button className="cr-card-header" onClick={() => {
                      setExpandedDonor(isExp ? null : donor.id);
                      if (!isExp) fetchDonorDonations(donor.id);
                    }} aria-expanded={isExp}>
                      <div className="cr-card-left">
                        <div className="cr-donor-avatar">{donor.donor_name.charAt(0).toUpperCase()}</div>
                        <div className="cr-card-info">
                          <strong>{donor.donor_name}</strong>
                          <span className="cr-card-donor">{donor.donor_email || donor.phone_number}</span>
                        </div>
                      </div>
                      <div className="cr-card-right">
                        <span className="cr-tag location">{totalDonations} visit{totalDonations !== 1 ? 's' : ''}</span>
                        <span className="cr-tag age">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                        <svg className={`cr-chevron ${isExp ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </button>

                    {isExp && (
                      <div className="cr-card-detail">
                        {isEditing ? (
                          <div className="cr-inline-edit">
                            <div className="cr-field-grid">
                              <div className="cr-field"><label>Name</label>
                                <input type="text" value={editDonorForm.donorName}
                                  onChange={e => setEditDonorForm(p => ({ ...p, donorName: e.target.value }))} />
                              </div>
                              <div className="cr-field"><label>Email</label>
                                <input type="email" value={editDonorForm.donorEmail}
                                  onChange={e => setEditDonorForm(p => ({ ...p, donorEmail: e.target.value }))} />
                              </div>
                              <div className="cr-field cr-span-2"><label>Address</label>
                                <textarea value={editDonorForm.address} rows="2"
                                  onChange={e => setEditDonorForm(p => ({ ...p, address: e.target.value }))} />
                              </div>
                              <div className="cr-field"><label>Phone</label>
                                <input type="tel" value={editDonorForm.phoneNumber}
                                  onChange={e => setEditDonorForm(p => ({ ...p, phoneNumber: formatPhone(e.target.value) }))} />
                              </div>
                            </div>
                            <div className="cr-detail-actions">
                              <button className="cr-act edit" onClick={saveEditDonor}>Save</button>
                              <button className="cr-act" onClick={() => setEditingDonor(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="cr-detail-grid">
                              <div><span className="cr-detail-label">Address</span><span>{donor.address}</span></div>
                              <div><span className="cr-detail-label">Phone</span><span>{donor.phone_number}</span></div>
                              {donor.donor_email && <div><span className="cr-detail-label">Email</span><span>{donor.donor_email}</span></div>}
                              <div><span className="cr-detail-label">Member Since</span><span>{formatDate(donor.created_at?.split('T')[0])}</span></div>
                            </div>

                            {donorDonations[donor.id] && (
                              <div className="cr-donation-history">
                                <h4 className="cr-history-title">Donation History</h4>
                                {donorDonations[donor.id].length === 0 ? (
                                  <p className="cr-history-empty">No donations recorded yet.</p>
                                ) : (
                                  <div className="cr-history-list">
                                    {donorDonations[donor.id].map(donation => (
                                      <div key={donation.id} className="cr-history-entry">
                                        <div className="cr-history-date">
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                                            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                                          </svg>
                                          {formatDate(donation.date_accepted)}
                                        </div>
                                        <ul className="cr-history-items">
                                          {(donation.donation_items || []).map(di => (
                                            <li key={di.id}>
                                              <span className="cr-history-item-desc">{di.item_description}</span>
                                              <span className="cr-tag location sm">{di.storage_location}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="cr-detail-actions">
                              <button className="cr-act edit" onClick={() => startDonationForDonor(donor)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                  <path d="M12 5v14m7-7H5" strokeLinecap="round" />
                                </svg>
                                New Donation
                              </button>
                              <button className="cr-act edit" onClick={() => startEditDonor(donor)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Edit Info
                              </button>
                            </div>
                          </>
                        )}
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
