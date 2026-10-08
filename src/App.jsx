import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import './App.css';
import AgreementPage from './pages/AgreementPage';
import ToteRequestPage from './pages/ToteRequestPage';

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
  { label: 'Headboards', src: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&h=400&fit=crop', alt: 'Bed headboard' },
];

const HERO_IMAGE = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=500&fit=crop';

/* ─── constants ─── */
const EMPTY_DONOR = { donorName: '', donorEmail: '', address: '', phoneNumber: '' };
const EMPTY_ITEM = { itemDescription: '', storageLocation: '', category: '', metadata: {}, agreementType: '' };

/* ─── Shopify-aligned category metadata options ─── */
const CLOTHING_SUBCATEGORIES = [
  'Tops & Shirts', 'Bottoms (Pants/Jeans/Shorts)', 'Dresses', 'Outerwear (Coats/Jackets)',
  'Activewear', 'Sweaters & Hoodies', 'Suits & Blazers', 'Sleepwear & Loungewear',
  'Swimwear', 'Underwear & Socks', 'One-Pieces & Jumpsuits', 'Skirts',
];
const CLOTHING_GENDERS  = ['Women', 'Men', 'Unisex', 'Girls', 'Boys'];
const CLOTHING_AGE_GROUPS = ['Adults', 'Teens', 'Kids', 'Toddlers', 'Babies'];
const CLOTHING_SIZES    = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '6XL', '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '24', '25', '26', '27', '28', '29', '30', '31', '32', 'One Size', 'Other'];
const CLOTHING_FABRICS  = [
  'Cotton', 'Polyester', 'Wool', 'Silk', 'Denim', 'Linen', 'Rayon/Viscose',
  'Nylon', 'Cashmere', 'Fleece', 'Acrylic', 'Spandex/Lycra', 'Blend', 'Other',
];
const CLOTHING_CONDITIONS = ['New with tags', 'Like New', 'Good', 'Fair', 'Worn'];

const FURNITURE_SUBCATEGORIES = [
  'Chair', 'Sofa / Loveseat', 'Sectional', 'Table (Dining)', 'Table (Coffee/End)',
  'Desk', 'Dresser / Chest', 'Bed Frame', 'Bookcase / Shelving', 'Cabinet / Storage',
  'Nightstand', 'Ottoman', 'Bench', 'Office Chair', 'Other',
];
const FURNITURE_MATERIALS = [
  'Wood (Solid)', 'Wood (Engineered/MDF)', 'Metal', 'Upholstered (Fabric)',
  'Upholstered (Leather)', 'Upholstered (Faux Leather)', 'Upholstered (Velvet)',
  'Wicker / Rattan', 'Glass', 'Plastic', 'Mixed Materials',
];
const FURNITURE_STYLES = [
  'Modern', 'Mid-Century Modern', 'Traditional', 'Industrial', 'Rustic / Farmhouse',
  'Scandinavian / Minimalist', 'Bohemian', 'Coastal', 'Contemporary', 'Other',
];
const FURNITURE_CONDITIONS = ['Like New', 'Good — minor wear', 'Fair — visible wear', 'Poor — needs repair'];
const OTHER_CONDITIONS  = ['Like New', 'Good — minor wear', 'Fair — visible wear', 'Poor — needs repair'];
const HEADBOARD_TYPES = [
  'Panel / Flat', 'Tufted', 'Slatted / Wood', 'Upholstered', 'Bookcase / Storage',
  'Metal / Wrought Iron', 'Arched', 'Floating / Wall-Mounted', 'Other',
];
const HEADBOARD_MATERIALS = [
  'Wood (Solid)', 'Wood (Engineered/MDF)', 'Metal', 'Upholstered (Fabric)',
  'Upholstered (Leather)', 'Upholstered (Faux Leather)', 'Upholstered (Velvet)',
  'Wicker / Rattan', 'Mixed Materials',
];
const HEADBOARD_STYLES = [
  'Modern', 'Mid-Century Modern', 'Traditional', 'Industrial', 'Rustic / Farmhouse',
  'Scandinavian / Minimalist', 'Bohemian', 'Coastal', 'Contemporary', 'Other',
];
const HEADBOARD_CONDITIONS = ['Like New', 'Good — minor wear', 'Fair — visible wear', 'Poor — needs repair'];

/* ================================================================== */
/* ─── LOGIN SCREEN ─── */
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cr-app">
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

      <main className="cr-main">
        <div className="cr-login-wrapper">
          <div className="cr-login-card">
            <h2 className="cr-login-title">Staff Sign In</h2>
            <p className="cr-login-subtitle">Sign in to manage donations and inventory</p>

            {error && (
              <div className="cr-toast error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="20" height="20">
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="cr-login-form">
              <div className="cr-field">
                <label htmlFor="login-email">Email</label>
                <input type="email" id="login-email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.edu" required autoFocus />
              </div>
              <div className="cr-field">
                <label htmlFor="login-password">Password</label>
                <input type="password" id="login-password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6} />
              </div>
              <button type="submit" className="cr-btn-primary cr-login-btn" disabled={loading}>
                {loading ? <><span className="cr-spinner"></span>Signing in…</> : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="cr-footer">
        <p>Campus Reclaimed &middot; Reduce, Reuse, Reclaim</p>
      </footer>
    </div>
  );
}

/* ================================================================== */
/* ─── PARTICIPATION BADGE ─── */
function ParticipationBadge({ status, large = false }) {
  const cfg = {
    pending:     { label: 'Pending Agreement', color: '#7a4800', bg: '#fff3e0', border: '#f5c48a' },
    donation:    { label: 'Donation',          color: '#1a3c34', bg: '#dceee6', border: '#5a9a82' },
    consignment: { label: 'Consignment',       color: '#1a2e4a', bg: '#dce8f5', border: '#6a9ec8' },
  };
  const key = status && cfg[status] ? status : 'pending';
  const { label, color, bg, border } = cfg[key];
  const icon = key === 'pending' ? '⏳' : key === 'donation' ? '🎁' : '🔄';
  return (
    <span className={`cr-participation-badge ${key} ${large ? 'lg' : ''}`}
      style={{ color, background: bg, borderColor: border }}>
      <span className="cr-badge-icon">{icon}</span>
      {label}
    </span>
  );
}

/* ================================================================== */
function App() {
  /* ── auth ── */
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

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
  const [imageFiles, setImageFiles] = useState({});       // { key: [File, File, ...] }
  const [imagePreviews, setImagePreviews] = useState({}); // { key: [dataUrl, dataUrl, ...] }
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const searchTimeout = useRef(null);

  /* ── inventory state ── */
  const [rawItems, setRawItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedItem, setExpandedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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

  /* ── shopify publish ── */
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_storage' | 'listed' | 'sold'
  const [publishingItem, setPublishingItem] = useState(null);
  const [publishForm, setPublishForm] = useState({ price: '', title: '' });
  const [publishLoading, setPublishLoading] = useState(false);
  const [unlistingItem, setUnlistingItem] = useState(null);
  const [priceSuggestion, setPriceSuggestion] = useState(null);   // { suggested_price, price_range, rationale, floor_price }
  const [priceLoading, setPriceLoading] = useState(false);

  /* ── 30-day notification emails ── */
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);   // { type: 'success'|'error', text }

  // Waiver tracking
  const [donorWaivers, setDonorWaivers] = useState({}); // { donorId: [{ id, waiver_url, signed_at }, ...] }

  /* ── agreements sub-tab state ── */
  const [donorSubTab, setDonorSubTab]             = useState('donors');
  const [agreements, setAgreements]               = useState([]);
  const [agreementsLoading, setAgreementsLoading] = useState(false);

  /* ── payouts sub-tab state ── */
  const [payouts, setPayouts]                     = useState([]);
  const [payoutsLoading, setPayoutsLoading]       = useState(false);
  const [payoutFilter, setPayoutFilter]           = useState('unpaid'); // 'all' | 'unpaid' | 'paid'
  const [savingPayout, setSavingPayout]           = useState(null); // item id being saved
  const [agreementSearch, setAgreementSearch]     = useState('');
  const [agreementTypeFilter, setAgreementTypeFilter] = useState('all');
  const [aiStatus, setAiStatus] = useState({}); // { itemKey: 'analyzing' | 'done' | 'error' }

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
        .select(`*, item_images(id, image_url, display_order), donation:donations!inner(id, date_accepted, notes, donor:donors!inner(id, donor_name, donor_email, address, phone_number, participation_status))`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRawItems(data || []);
    } catch (err) { console.error('Fetch error:', err); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'inventory') fetchItems(); }, [tab, fetchItems]);

  /* ── derived: filtered + sorted inventory view (client-side, no refetch per keystroke) ── */
  const items = useMemo(() => {
    let filtered = rawItems;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => (item.status || 'in_storage') === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(item =>
        item.item_description?.toLowerCase().includes(q) ||
        item.storage_location?.toLowerCase().includes(q) ||
        item.donation?.donor?.donor_name?.toLowerCase().includes(q) ||
        item.donation?.donor?.donor_email?.toLowerCase().includes(q)
      );
    }

    const sorted = [...filtered];
    if (sortField === 'donor_name') {
      sorted.sort((a, b) => {
        const aName = a.donation?.donor?.donor_name || '';
        const bName = b.donation?.donor?.donor_name || '';
        return sortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
      });
    } else if (sortField === 'date_accepted') {
      sorted.sort((a, b) => {
        const aD = a.donation?.date_accepted || '';
        const bD = b.donation?.date_accepted || '';
        return sortDir === 'asc' ? aD.localeCompare(bD) : bD.localeCompare(aD);
      });
    } else {
      sorted.sort((a, b) => {
        const aC = a.created_at || '';
        const bC = b.created_at || '';
        return sortDir === 'asc' ? aC.localeCompare(bC) : bC.localeCompare(aC);
      });
    }
    return sorted;
  }, [rawItems, searchQuery, statusFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const uniqueDonors = new Set(rawItems.map(i => i.donation?.donor?.id).filter(Boolean));
    return {
      total: rawItems.length,
      thisMonth: rawItems.filter(i => i.donation?.date_accepted >= monthStart).length,
      donors: uniqueDonors.size,
      pendingNotify: rawItems.filter(i =>
        !i.notification_sent && daysSince(i.donation?.date_accepted) >= 30 && i.donation?.donor?.donor_email
      ).length,
      inStorage: rawItems.filter(i => (i.status || 'in_storage') === 'in_storage').length,
      listed: rawItems.filter(i => i.status === 'listed').length,
      sold: rawItems.filter(i => i.status === 'sold').length,
    };
  }, [rawItems]);

  /* ════════════════════════════════════════════════
     DONORS LIST FETCH
     ════════════════════════════════════════════════ */
  const fetchDonors = useCallback(async () => {
    if (!supabase) return;
    setDonorsLoading(true);
    try {
      const { data, error } = await supabase
        .from('donors')
        .select(`*, donations(id, date_accepted, donation_items(id)), donor_waivers(id, waiver_url, signed_at)`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      let filtered = data || [];

      // Build waiver lookup from the joined data
      const waiverMap = {};
      filtered.forEach(d => {
        if (d.donor_waivers && d.donor_waivers.length > 0) {
          waiverMap[d.id] = d.donor_waivers;
        }
      });
      setDonorWaivers(prev => ({ ...prev, ...waiverMap }));

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

  /* ── fetch participation agreements ── */
  const fetchAgreements = useCallback(async () => {
    if (!supabase) return;
    setAgreementsLoading(true);
    try {
      const { data, error } = await supabase
        .from('participation_agreements')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setAgreements(data || []);
    } catch (err) { console.error('Fetch agreements error:', err); }
    finally { setAgreementsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'donors' && donorSubTab === 'agreements') fetchAgreements();
  }, [tab, donorSubTab, fetchAgreements]);

  /* ── fetch payouts (sold consignment items with donor + venmo) ── */
  const fetchPayouts = useCallback(async () => {
    if (!supabase) return;
    setPayoutsLoading(true);
    try {
      // Fetch all sold items
      const { data: soldItems, error: itemsErr } = await supabase
        .from('donation_items')
        .select(`
          id, item_description, shopify_payout, payout_percentage,
          payout_paid, payout_paid_date, payout_override, sold_at, buyer_name,
          agreement_type, price,
          donation:donations!inner(
            donor:donors!inner(id, donor_name, donor_email)
          )
        `)
        .eq('status', 'sold')
        .eq('agreement_type', 'consignment')
        .order('sold_at', { ascending: false });
      if (itemsErr) throw itemsErr;

      // Fetch all participation agreements to get Venmo handles
      const { data: agmts } = await supabase
        .from('participation_agreements')
        .select('first_name, last_name, email, venmo_handle')
        .eq('agreement_type', 'consignment');

      // Build a Venmo lookup by email and name
      const venmoByEmail = {};
      const venmoByName  = {};
      (agmts || []).forEach(a => {
        const name = `${a.first_name} ${a.last_name}`.toLowerCase().trim();
        if (a.email)        venmoByEmail[a.email.toLowerCase()] = a.venmo_handle;
        if (name)           venmoByName[name]                   = a.venmo_handle;
      });

      // Attach Venmo to each sold item
      const enriched = (soldItems || []).map(item => {
        const donor = item.donation?.donor;
        const email = donor?.donor_email?.toLowerCase();
        const name  = donor?.donor_name?.toLowerCase().trim();
        const venmo = (email && venmoByEmail[email]) || (name && venmoByName[name]) || null;
        return { ...item, venmo_handle: venmo };
      });

      setPayouts(enriched);
    } catch (err) { console.error('Fetch payouts error:', err); }
    finally { setPayoutsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'donors' && donorSubTab === 'payouts') fetchPayouts();
  }, [tab, donorSubTab, fetchPayouts]);

  /* ── save payout changes (percentage, paid status, paid date) ── */
  const savePayoutRecord = async (itemId, updates) => {
    if (!supabase) return;
    setSavingPayout(itemId);
    try {
      const { error } = await supabase
        .from('donation_items')
        .update(updates)
        .eq('id', itemId);
      if (error) throw error;
      setPayouts(prev => prev.map(p => p.id === itemId ? { ...p, ...updates } : p));
    } catch (err) { console.error('Save payout error:', err); }
    finally { setSavingPayout(null); }
  };

  /* ── export payouts to CSV ── */
  const exportPayoutsCSV = () => {
    const headers = [
      'Donor Name', 'Email', 'Venmo Handle', 'Item Description',
      'Sold Date', 'Buyer', 'Sale Amount', 'Consignor %',
      'Calculated Payout', 'Override Payout', 'Effective Payout',
      'Paid', 'Paid Date'
    ];
    const rows = payouts.map(p => {
      const donor      = p.donation?.donor;
      const saleAmt    = parseFloat(p.shopify_payout || p.price || 0);
      const pct        = parseFloat(p.payout_percentage || 20);
      const calculated = (saleAmt * pct / 100).toFixed(2);
      const override   = p.payout_override != null ? parseFloat(p.payout_override).toFixed(2) : '';
      const effective  = p.payout_override != null ? parseFloat(p.payout_override).toFixed(2) : calculated;
      return [
        donor?.donor_name || '',
        donor?.donor_email || '',
        p.venmo_handle || '',
        p.item_description || '',
        p.sold_at ? p.sold_at.split('T')[0] : '',
        p.buyer_name || '',
        saleAmt.toFixed(2),
        pct + '%',
        calculated,
        override,
        effective,
        p.payout_paid ? 'Yes' : 'No',
        p.payout_paid_date || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `campus-reclaimed-payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const handleMetaChange = (key, field, value) => {
    setDonationItems(prev => prev.map(item =>
      item._key === key ? { ...item, metadata: { ...item.metadata, [field]: value } } : item
    ));
  };

  /* ════════════════════════════════════════════════
     AI IMAGE ANALYSIS
     ════════════════════════════════════════════════ */
  const analyzeItemImage = async (itemKey, dataUrl) => {
    setAiStatus(prev => ({ ...prev, [itemKey]: 'analyzing' }));
    try {
      const base64 = dataUrl.split(',')[1];
      const mediaType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      const { data, error } = await supabase.functions.invoke('analyze-item', {
        body: { base64, mediaType }
      });
      if (error) throw error;
      setDonationItems(prev => prev.map(item => {
        if (item._key !== itemKey) return item;
        return {
          ...item,
          // Staff-entered values always win over AI suggestions
          category: item.category || data.category,
          itemDescription: item.itemDescription.trim() || data.description || item.itemDescription,
          metadata: { ...(data.metadata || {}), ...item.metadata },
        };
      }));
      setAiStatus(prev => ({ ...prev, [itemKey]: 'done' }));
    } catch (err) {
      console.error('AI analysis error:', err);
      setAiStatus(prev => ({ ...prev, [itemKey]: 'error' }));
    }
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
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const existing = imageFiles[key] || [];
    const remaining = 4 - existing.length;
    if (remaining <= 0) { setMessage({ type: 'error', text: 'Maximum 4 photos per item.' }); return; }
    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      if (file.size > 10 * 1024 * 1024) { setMessage({ type: 'error', text: 'Each image must be under 10 MB.' }); return; }
    }
    setImageFiles(prev => ({ ...prev, [key]: [...(prev[key] || []), ...toAdd] }));
    const isFirstPhoto = existing.length === 0;
    toAdd.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [key]: [...(prev[key] || []), reader.result] }));
        if (isFirstPhoto && idx === 0) analyzeItemImage(key, reader.result);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeItemImage = (key, index) => {
    setImageFiles(prev => {
      const arr = [...(prev[key] || [])];
      arr.splice(index, 1);
      return { ...prev, [key]: arr };
    });
    setImagePreviews(prev => {
      const arr = [...(prev[key] || [])];
      arr.splice(index, 1);
      return { ...prev, [key]: arr };
    });
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
        // Check for an existing donor before creating a duplicate.
        // Email is the primary key when provided (case-insensitive);
        // otherwise fall back to name + phone.
        const trimName = donorForm.donorName.trim();
        const trimEmail = donorForm.donorEmail.trim() || null;
        const trimPhone = donorForm.phoneNumber.trim();

        let existingDonors = null;
        if (trimEmail) {
          const { data } = await supabase
            .from('donors').select('id')
            .ilike('donor_email', trimEmail)
            .limit(1);
          existingDonors = data;
        }
        if (!existingDonors || existingDonors.length === 0) {
          let nameQuery = supabase.from('donors').select('id').ilike('donor_name', trimName);
          if (trimPhone) nameQuery = nameQuery.eq('phone_number', trimPhone);
          else nameQuery = nameQuery.is('phone_number', null);
          const { data } = await nameQuery.limit(1);
          existingDonors = data;
        }

        if (existingDonors && existingDonors.length > 0) {
          donorId = existingDonors[0].id;
        } else {
          const { data: newDonor, error: donorError } = await supabase
            .from('donors')
            .insert([{
              donor_name: trimName,
              donor_email: trimEmail,
              address: donorForm.address.trim(),
              phone_number: trimPhone,
            }])
            .select().single();
          if (donorError) throw donorError;
          donorId = newDonor.id;
        }
      }

      const { data: donation, error: donError } = await supabase
        .from('donations')
        .insert([{ donor_id: donorId, date_accepted: dateAccepted }])
        .select().single();
      if (donError) throw donError;

      for (const item of validItems) {
        // Upload all images (up to 4) for this item
        const imageUrls = [];
        const files = imageFiles[item._key] || [];
        for (const file of files) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `inventory-images/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('inventory').upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('inventory').getPublicUrl(filePath);
          imageUrls.push(urlData.publicUrl);
        }
        // Set item_image_url to first image for backward compat / card thumbnail
        const primaryImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
        const { data: insertedItem, error: itemError } = await supabase
          .from('donation_items')
          .insert([{
            donation_id: donation.id,
            item_description: item.itemDescription.trim(),
            storage_location: item.storageLocation.trim(),
            item_image_url: primaryImageUrl,
            category: item.category || null,
            metadata: Object.keys(item.metadata || {}).length > 0 ? item.metadata : null,
            agreement_type: item.agreementType || null,
          }])
          .select('id').single();
        if (itemError) throw itemError;
        // Insert into item_images table
        if (imageUrls.length > 0) {
          const imageRows = imageUrls.map((url, i) => ({ item_id: insertedItem.id, image_url: url, display_order: i }));
          const { error: imgError } = await supabase.from('item_images').insert(imageRows);
          if (imgError) console.error('Image insert error:', imgError);
        }
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
    setEditItemForm({
      itemDescription: item.item_description,
      storageLocation: item.storage_location,
      category: item.category || '',
      metadata: item.metadata || {},
      agreementType: item.agreement_type || '',
    });
  };

  const saveEditItem = async () => {
    if (!supabase || !editingItem) return;
    try {
      const { error } = await supabase.from('donation_items')
        .update({
          item_description: editItemForm.itemDescription.trim(),
          storage_location: editItemForm.storageLocation.trim(),
          category: editItemForm.category || null,
          metadata: Object.keys(editItemForm.metadata || {}).length > 0 ? editItemForm.metadata : null,
          agreement_type: editItemForm.agreementType || null,
        })
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

  /* ════════════════════════════════════════════════
     SHOPIFY ACTIONS
     ════════════════════════════════════════════════ */
  const startPublish = (item) => {
    setPublishingItem(item.id);
    setPublishForm({ price: item.price || '', title: item.item_description });
    setPriceSuggestion(null);
  };

  const cancelPublish = () => {
    setPublishingItem(null);
    setPublishForm({ price: '', title: '' });
    setPriceSuggestion(null);
  };

  const suggestPrice = async (itemId) => {
    if (!supabase || !itemId) return;
    setPriceLoading(true);
    setPriceSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-price', {
        body: { itemId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPriceSuggestion({ ...data, forItem: itemId });
    } catch (err) {
      console.error('Price suggestion error:', err);
      setPriceSuggestion({ error: err.message, forItem: itemId });
    } finally {
      setPriceLoading(false);
    }
  };

  const publishToShopify = async () => {
    if (!supabase || !publishingItem || !publishForm.price) return;
    setPublishLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-publish', {
        body: {
          itemId: publishingItem,
          price: parseFloat(publishForm.price),
          title: publishForm.title.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPublishingItem(null);
      setPublishForm({ price: '', title: '' });
      setPriceSuggestion(null);
      fetchItems();
    } catch (err) {
      console.error('Publish error:', err);
      setMessage({ type: 'error', text: `Publish failed: ${err.message}` });
    } finally { setPublishLoading(false); }
  };

  const unlistFromShopify = async (item) => {
    if (!supabase || !item.shopify_product_id) return;
    setUnlistingItem(item.id);
    try {
      // Delete the product from Shopify via Edge Function
      const { error: shopifyErr } = await supabase.functions.invoke('shopify-publish', {
        body: { action: 'delete', productId: item.shopify_product_id }
      });
      if (shopifyErr) console.warn('Shopify delete warning:', shopifyErr);

      // Always clear locally even if Shopify delete fails
      const { error } = await supabase
        .from('donation_items')
        .update({
          status: 'in_storage',
          shopify_product_id: null,
          shopify_variant_id: null,
          price: null,
        })
        .eq('id', item.id);
      if (error) throw error;

      setUnlistingItem(null);
      fetchItems();
    } catch (err) {
      console.error('Unlist error:', err);
      setUnlistingItem(null);
    }
  };

  const sendNotifications = async () => {
    if (!supabase || notifySending) return;
    setNotifySending(true);
    setNotifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('email-notifications', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setNotifyResult({ type: 'success', text: data.message || 'Notifications sent.' });
      fetchItems();   // refresh notification_sent flags and the pending count
    } catch (err) {
      console.error('Notification send error:', err);
      setNotifyResult({ type: 'error', text: `Send failed: ${err.message}` });
    } finally { setNotifySending(false); }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'listed': return 'Listed';
      case 'sold': return 'Sold';
      case 'claimed': return 'Claimed';
      case 'removed': return 'Removed';
      default: return 'In Storage';
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
          <p className="cr-config-sub">Run <code>migration.sql</code> to create the donors, donations, and donation_items tables.</p>
        </div>
      </div>
    );
  }

  /* ─── public routes (no auth required) ─── */
  if (window.location.pathname === '/agreement') {
    return <AgreementPage />;
  }
  if (window.location.pathname === '/request-tote') {
    return <ToteRequestPage />;
  }

  /* ─── auth loading ─── */
  if (authLoading) {
    return (
      <div className="cr-app">
        <div className="cr-auth-loading">
          <span className="cr-spinner large"></span>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  /* ─── login gate ─── */
  if (!session) {
    return <LoginScreen />;
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
        <button className="cr-sign-out" onClick={handleSignOut} title="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sign Out
        </button>
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
                      <div className="cr-selected-donor-right">
                        <ParticipationBadge status={selectedDonor.participation_status} />
                        <button type="button" className="cr-change-donor" onClick={changeDonor}>Change</button>
                      </div>
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

                            {/* Category selector */}
                            <div className="cr-field cr-span-2">
                              <label>Category</label>
                              <div className="cr-category-pills">
                                {['Clothing', 'Furniture', 'Electronics', 'Books', 'Headboards', 'Kitchen', 'Bedding', 'Desk & Study', 'Other'].map(cat => (
                                  <button key={cat} type="button"
                                    className={`cr-cat-pill ${item.category === cat ? 'active' : ''}`}
                                    onClick={() => handleItemChange(item._key, 'category', item.category === cat ? '' : cat)}>
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Agreement type toggle */}
                            <div className="cr-field cr-span-2">
                              <label>Agreement Type <span className="cr-req">*</span></label>
                              <div className="cr-agreement-toggle">
                                <button type="button"
                                  className={`cr-agreement-btn donation ${item.agreementType === 'donation' ? 'active' : ''}`}
                                  onClick={() => handleItemChange(item._key, 'agreementType', item.agreementType === 'donation' ? '' : 'donation')}>
                                  <span className="cr-agreement-icon">🎁</span>Donation
                                </button>
                                <button type="button"
                                  className={`cr-agreement-btn consignment ${item.agreementType === 'consignment' ? 'active' : ''}`}
                                  onClick={() => handleItemChange(item._key, 'agreementType', item.agreementType === 'consignment' ? '' : 'consignment')}>
                                  <span className="cr-agreement-icon">🔄</span>Consignment
                                </button>
                              </div>
                            </div>

                            {/* ── Clothing metadata ── */}
                            {item.category === 'Clothing' && (
                              <div className="cr-meta-section cr-span-2">
                                <p className="cr-meta-title">Clothing Details <span className="cr-hint">(for Shopify listing)</span></p>
                                <div className="cr-field-grid">
                                  <div className="cr-field">
                                    <label>Type</label>
                                    <select value={item.metadata.subcategory || ''} onChange={e => handleMetaChange(item._key, 'subcategory', e.target.value)}>
                                      <option value="">Select type…</option>
                                      {CLOTHING_SUBCATEGORIES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Gender</label>
                                    <select value={item.metadata.gender || ''} onChange={e => handleMetaChange(item._key, 'gender', e.target.value)}>
                                      <option value="">Select…</option>
                                      {CLOTHING_GENDERS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Age Group</label>
                                    <select value={item.metadata.age_group || ''} onChange={e => handleMetaChange(item._key, 'age_group', e.target.value)}>
                                      <option value="">Select…</option>
                                      {CLOTHING_AGE_GROUPS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Size</label>
                                    <select value={item.metadata.size || ''} onChange={e => handleMetaChange(item._key, 'size', e.target.value)}>
                                      <option value="">Select…</option>
                                      {CLOTHING_SIZES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Color</label>
                                    <input type="text" placeholder="e.g. Navy Blue" value={item.metadata.color || ''}
                                      onChange={e => handleMetaChange(item._key, 'color', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Brand</label>
                                    <input type="text" placeholder="e.g. Levi's" value={item.metadata.brand || ''}
                                      onChange={e => handleMetaChange(item._key, 'brand', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Fabric / Material</label>
                                    <select value={item.metadata.fabric || ''} onChange={e => handleMetaChange(item._key, 'fabric', e.target.value)}>
                                      <option value="">Select…</option>
                                      {CLOTHING_FABRICS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Condition</label>
                                    <select value={item.metadata.condition || ''} onChange={e => handleMetaChange(item._key, 'condition', e.target.value)}>
                                      <option value="">Select…</option>
                                      {CLOTHING_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                    <input type="number" step="0.1" min="0" placeholder="e.g. 1.5" value={item.metadata.weight_lbs || ''}
                                      onChange={e => handleMetaChange(item._key, 'weight_lbs', e.target.value)} />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ── Furniture metadata ── */}
                            {item.category === 'Furniture' && (
                              <div className="cr-meta-section cr-span-2">
                                <p className="cr-meta-title">Furniture Details <span className="cr-hint">(for Shopify listing)</span></p>
                                <div className="cr-field-grid">
                                  <div className="cr-field">
                                    <label>Type</label>
                                    <select value={item.metadata.subcategory || ''} onChange={e => handleMetaChange(item._key, 'subcategory', e.target.value)}>
                                      <option value="">Select type…</option>
                                      {FURNITURE_SUBCATEGORIES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Color / Finish</label>
                                    <input type="text" placeholder="e.g. Walnut Brown" value={item.metadata.color || ''}
                                      onChange={e => handleMetaChange(item._key, 'color', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Material</label>
                                    <select value={item.metadata.material || ''} onChange={e => handleMetaChange(item._key, 'material', e.target.value)}>
                                      <option value="">Select…</option>
                                      {FURNITURE_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Style</label>
                                    <select value={item.metadata.style || ''} onChange={e => handleMetaChange(item._key, 'style', e.target.value)}>
                                      <option value="">Select…</option>
                                      {FURNITURE_STYLES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Dimensions <span className="cr-hint">(W × D × H)</span></label>
                                    <input type="text" placeholder='e.g. 60" × 30" × 36"' value={item.metadata.dimensions || ''}
                                      onChange={e => handleMetaChange(item._key, 'dimensions', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Condition</label>
                                    <select value={item.metadata.condition || ''} onChange={e => handleMetaChange(item._key, 'condition', e.target.value)}>
                                      <option value="">Select…</option>
                                      {FURNITURE_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                    <input type="number" step="1" min="0" placeholder="e.g. 45" value={item.metadata.weight_lbs || ''}
                                      onChange={e => handleMetaChange(item._key, 'weight_lbs', e.target.value)} />
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Notes <span className="cr-hint">(assembly needed, pet home, smoke-free, missing hardware, etc.)</span></label>
                                    <input type="text" value={item.metadata.notes || ''}
                                      onChange={e => handleMetaChange(item._key, 'notes', e.target.value)} />
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                    <div className="cr-shipping-toggle">
                                      <button type="button"
                                        className={`cr-shipping-btn ${!item.metadata.local_only ? 'active ship' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', false)}>
                                        📦 Shipping Allowed
                                      </button>
                                      <button type="button"
                                        className={`cr-shipping-btn ${item.metadata.local_only ? 'active noshipping' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', true)}>
                                        📍 Local Pickup Only
                                      </button>
                                    </div>
                                    {item.metadata.local_only && (
                                      <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ── Headboards metadata ── */}
                            {item.category === 'Headboards' && (
                              <div className="cr-meta-section cr-span-2">
                                <p className="cr-meta-title">Headboard Details <span className="cr-hint">(for Shopify listing)</span></p>
                                <div className="cr-field-grid">
                                  <div className="cr-field">
                                    <label>Type</label>
                                    <select value={item.metadata.subcategory || ''} onChange={e => handleMetaChange(item._key, 'subcategory', e.target.value)}>
                                      <option value="">Select type…</option>
                                      {HEADBOARD_TYPES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Color / Finish</label>
                                    <input type="text" placeholder="e.g. Dark Walnut" value={item.metadata.color || ''}
                                      onChange={e => handleMetaChange(item._key, 'color', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Material</label>
                                    <select value={item.metadata.material || ''} onChange={e => handleMetaChange(item._key, 'material', e.target.value)}>
                                      <option value="">Select…</option>
                                      {HEADBOARD_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Style</label>
                                    <select value={item.metadata.style || ''} onChange={e => handleMetaChange(item._key, 'style', e.target.value)}>
                                      <option value="">Select…</option>
                                      {HEADBOARD_STYLES.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Dimensions <span className="cr-hint">(W × H)</span></label>
                                    <input type="text" placeholder='e.g. 60" × 48"' value={item.metadata.dimensions || ''}
                                      onChange={e => handleMetaChange(item._key, 'dimensions', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Condition</label>
                                    <select value={item.metadata.condition || ''} onChange={e => handleMetaChange(item._key, 'condition', e.target.value)}>
                                      <option value="">Select…</option>
                                      {HEADBOARD_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                    <input type="number" step="1" min="0" placeholder="e.g. 20" value={item.metadata.weight_lbs || ''}
                                      onChange={e => handleMetaChange(item._key, 'weight_lbs', e.target.value)} />
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Notes <span className="cr-hint">(size compatibility, wall-mount hardware included, etc.)</span></label>
                                    <input type="text" value={item.metadata.notes || ''}
                                      onChange={e => handleMetaChange(item._key, 'notes', e.target.value)} />
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                    <div className="cr-shipping-toggle">
                                      <button type="button"
                                        className={`cr-shipping-btn ${!item.metadata.local_only ? 'active ship' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', false)}>
                                        📦 Shipping Allowed
                                      </button>
                                      <button type="button"
                                        className={`cr-shipping-btn ${item.metadata.local_only ? 'active noshipping' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', true)}>
                                        📍 Local Pickup Only
                                      </button>
                                    </div>
                                    {item.metadata.local_only && (
                                      <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* ── Other metadata ── */}
                            {item.category === 'Other' && (
                              <div className="cr-meta-section cr-span-2">
                                <p className="cr-meta-title">Item Details <span className="cr-hint">(for Shopify listing)</span></p>
                                <div className="cr-field-grid">
                                  <div className="cr-field">
                                    <label>Color</label>
                                    <input type="text" placeholder="e.g. Black" value={item.metadata.color || ''}
                                      onChange={e => handleMetaChange(item._key, 'color', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Material</label>
                                    <select value={item.metadata.material || ''} onChange={e => handleMetaChange(item._key, 'material', e.target.value)}>
                                      <option value="">Select…</option>
                                      {FURNITURE_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field">
                                    <label>Dimensions <span className="cr-hint">(W × D × H)</span></label>
                                    <input type="text" placeholder='e.g. 12" × 8" × 4"' value={item.metadata.dimensions || ''}
                                      onChange={e => handleMetaChange(item._key, 'dimensions', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Weight</label>
                                    <input type="text" placeholder="e.g. 2 lbs" value={item.metadata.weight || ''}
                                      onChange={e => handleMetaChange(item._key, 'weight', e.target.value)} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Condition</label>
                                    <select value={item.metadata.condition || ''} onChange={e => handleMetaChange(item._key, 'condition', e.target.value)}>
                                      <option value="">Select…</option>
                                      {OTHER_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Notes <span className="cr-hint">(missing parts, pet home, smoke-free, needs repair, etc.)</span></label>
                                    <input type="text" placeholder="Any additional details" value={item.metadata.notes || ''}
                                      onChange={e => handleMetaChange(item._key, 'notes', e.target.value)} />
                                  </div>
                                  <div className="cr-field cr-span-2">
                                    <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                    <div className="cr-shipping-toggle">
                                      <button type="button"
                                        className={`cr-shipping-btn ${!item.metadata.local_only ? 'active ship' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', false)}>
                                        📦 Shipping Allowed
                                      </button>
                                      <button type="button"
                                        className={`cr-shipping-btn ${item.metadata.local_only ? 'active noshipping' : ''}`}
                                        onClick={() => handleMetaChange(item._key, 'local_only', true)}>
                                        📍 Local Pickup Only
                                      </button>
                                    </div>
                                    {item.metadata.local_only && (
                                      <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="cr-field">
                              <label>Storage Location <span className="cr-req">*</span></label>
                              <input type="text" value={item.storageLocation}
                                onChange={e => handleItemChange(item._key, 'storageLocation', e.target.value)}
                                required placeholder="Building A, Shelf 12" />
                            </div>
                            <div className="cr-field">
                              <label>
                                Photos <span className="cr-hint">(up to 4)</span>
                                {aiStatus[item._key] === 'analyzing' && (
                                  <span className="cr-ai-badge analyzing"><span className="cr-spinner sm"></span> Analyzing…</span>
                                )}
                                {aiStatus[item._key] === 'done' && (
                                  <span className="cr-ai-badge done">✦ AI filled</span>
                                )}
                                {aiStatus[item._key] === 'error' && (
                                  <span className="cr-ai-badge error">AI unavailable</span>
                                )}
                              </label>
                              <div className="cr-multi-upload">
                                {(imagePreviews[item._key] || []).map((src, i) => (
                                  <div key={i} className="cr-upload-thumb">
                                    <img src={src} alt={`Preview ${i + 1}`} />
                                    <button type="button" className="cr-upload-remove" onClick={() => removeItemImage(item._key, i)}
                                      aria-label="Remove photo">&times;</button>
                                    {i === 0 && aiStatus[item._key] !== 'analyzing' && (
                                      <button type="button" className="cr-reanalyze"
                                        onClick={() => analyzeItemImage(item._key, src)}
                                        title="Re-analyze with AI">✦</button>
                                    )}
                                  </div>
                                ))}
                                {(imagePreviews[item._key] || []).length < 4 && (
                                  <div className="cr-upload-zone compact add-more">
                                    <input type="file" id={`img-${item._key}`} accept="image/*" multiple
                                      onChange={e => handleItemImage(item._key, e)} className="cr-file-input" />
                                    <label htmlFor={`img-${item._key}`} className="cr-file-label compact">
                                      <div className="cr-upload-prompt compact">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                                          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span className="cr-upload-text">
                                          {(imagePreviews[item._key] || []).length === 0 ? 'Add photos' : 'Add more'}
                                        </span>
                                      </div>
                                    </label>
                                  </div>
                                )}
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
          <div className="cr-stats-grid four">
            <div className="cr-stat">
              <div className="cr-stat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.inStorage || 0}</span>
              <span className="cr-stat-label">In Storage</span>
            </div>
            <div className="cr-stat">
              <div className="cr-stat-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.listed || 0}</span>
              <span className="cr-stat-label">Listed on Store</span>
            </div>
            <div className="cr-stat">
              <div className="cr-stat-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="24" height="24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.sold || 0}</span>
              <span className="cr-stat-label">Sold</span>
            </div>
            <div className="cr-stat">
              <div className="cr-stat-icon amber">
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
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="cr-stat-num">{stats.pendingNotify}</span>
              <span className="cr-stat-label">Pending Notifications</span>
              {stats.pendingNotify > 0 && (
                <button className="cr-notify-btn" onClick={sendNotifications} disabled={notifySending}>
                  {notifySending ? <><span className="cr-spinner sm"></span> Sending…</> : 'Send Emails'}
                </button>
              )}
            </div>
          </div>

          {notifyResult && (
            <div className={`cr-toast ${notifyResult.type}`} role="status">
              {notifyResult.text}
              <button className="cr-clear" onClick={() => setNotifyResult(null)}>&times;</button>
            </div>
          )}

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

          <div className="cr-status-filter">
            {[
              ['all', 'All', stats.total],
              ['in_storage', 'In Storage', stats.inStorage],
              ['listed', 'Listed', stats.listed],
              ['sold', 'Sold', stats.sold],
            ].map(([key, label, count]) => (
              <button key={key}
                className={`cr-status-btn ${statusFilter === key ? 'on' : ''} ${key}`}
                onClick={() => setStatusFilter(key)}>
                {label}
                {count > 0 && <span className="cr-status-count">{count}</span>}
              </button>
            ))}
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
                        {(() => {
                          const images = (item.item_images || []).sort((a, b) => a.display_order - b.display_order);
                          const thumbUrl = images.length > 0 ? images[0].image_url : item.item_image_url;
                          const imageCount = images.length || (item.item_image_url ? 1 : 0);
                          return thumbUrl ? (
                            <div className="cr-card-thumb-wrap">
                              <img src={thumbUrl} alt="" className="cr-card-thumb" loading="lazy" />
                              {imageCount > 1 && <span className="cr-thumb-count">{imageCount}</span>}
                            </div>
                          ) : (
                            <div className="cr-card-thumb placeholder">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="22" height="22">
                                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4M4 7l8 4M4 7v10l8 4m0-10v10" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          );
                        })()}
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
                        {item.agreement_type && (
                          <span className={`cr-tag cr-agr-tag ${item.agreement_type}`}>
                            {item.agreement_type === 'consignment' ? '🔄 Consignment' : '🎁 Donation'}
                          </span>
                        )}
                        <span className={`cr-tag status ${item.status || 'in_storage'}`}>{getStatusLabel(item.status)}</span>
                        {item.price && <span className="cr-tag price">${parseFloat(item.price).toFixed(2)}</span>}
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
                              <div className="cr-field cr-span-2">
                                <label>Category</label>
                                <div className="cr-category-pills">
                                  {['Clothing', 'Furniture', 'Electronics', 'Books', 'Headboards', 'Kitchen', 'Bedding', 'Desk & Study', 'Other'].map(cat => (
                                    <button key={cat} type="button"
                                      className={`cr-cat-pill ${editItemForm.category === cat ? 'active' : ''}`}
                                      onClick={() => setEditItemForm(p => ({ ...p, category: p.category === cat ? '' : cat }))}>
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="cr-field cr-span-2">
                                <label>Agreement Type</label>
                                <div className="cr-agreement-toggle">
                                  <button type="button"
                                    className={`cr-agreement-btn donation ${editItemForm.agreementType === 'donation' ? 'active' : ''}`}
                                    onClick={() => setEditItemForm(p => ({ ...p, agreementType: p.agreementType === 'donation' ? '' : 'donation' }))}>
                                    <span className="cr-agreement-icon">🎁</span>Donation
                                  </button>
                                  <button type="button"
                                    className={`cr-agreement-btn consignment ${editItemForm.agreementType === 'consignment' ? 'active' : ''}`}
                                    onClick={() => setEditItemForm(p => ({ ...p, agreementType: p.agreementType === 'consignment' ? '' : 'consignment' }))}>
                                    <span className="cr-agreement-icon">🔄</span>Consignment
                                  </button>
                                </div>
                              </div>
                              {editItemForm.category === 'Clothing' && (
                                <div className="cr-meta-section cr-span-2">
                                  <p className="cr-meta-title">Clothing Details</p>
                                  <div className="cr-field-grid">
                                    <div className="cr-field">
                                      <label>Type</label>
                                      <select value={editItemForm.metadata.subcategory || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, subcategory: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_SUBCATEGORIES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Gender</label>
                                      <select value={editItemForm.metadata.gender || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, gender: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_GENDERS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Age Group</label>
                                      <select value={editItemForm.metadata.age_group || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, age_group: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_AGE_GROUPS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Size</label>
                                      <select value={editItemForm.metadata.size || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, size: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_SIZES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Color</label>
                                      <input type="text" placeholder="e.g. Navy Blue" value={editItemForm.metadata.color || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, color: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Brand</label>
                                      <input type="text" placeholder="e.g. Levi's" value={editItemForm.metadata.brand || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, brand: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Fabric</label>
                                      <select value={editItemForm.metadata.fabric || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, fabric: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_FABRICS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Condition</label>
                                      <select value={editItemForm.metadata.condition || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, condition: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {CLOTHING_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                      <input type="number" step="0.1" min="0" placeholder="e.g. 1.5" value={editItemForm.metadata.weight_lbs || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, weight_lbs: e.target.value } }))} />
                                    </div>
                                  </div>
                                </div>
                              )}
                              {editItemForm.category === 'Furniture' && (
                                <div className="cr-meta-section cr-span-2">
                                  <p className="cr-meta-title">Furniture Details</p>
                                  <div className="cr-field-grid">
                                    <div className="cr-field">
                                      <label>Type</label>
                                      <select value={editItemForm.metadata.subcategory || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, subcategory: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {FURNITURE_SUBCATEGORIES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Color / Finish</label>
                                      <input type="text" placeholder="e.g. Walnut Brown" value={editItemForm.metadata.color || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, color: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Material</label>
                                      <select value={editItemForm.metadata.material || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, material: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {FURNITURE_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Style</label>
                                      <select value={editItemForm.metadata.style || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, style: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {FURNITURE_STYLES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Dimensions</label>
                                      <input type="text" placeholder='e.g. 60" × 30" × 36"' value={editItemForm.metadata.dimensions || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, dimensions: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Condition</label>
                                      <select value={editItemForm.metadata.condition || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, condition: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {FURNITURE_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                      <input type="number" step="1" min="0" placeholder="e.g. 45" value={editItemForm.metadata.weight_lbs || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, weight_lbs: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Notes</label>
                                      <input type="text" value={editItemForm.metadata.notes || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, notes: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                      <div className="cr-shipping-toggle">
                                        <button type="button"
                                          className={`cr-shipping-btn ${!editItemForm.metadata.local_only ? 'active ship' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: false } }))}>
                                          📦 Shipping Allowed
                                        </button>
                                        <button type="button"
                                          className={`cr-shipping-btn ${editItemForm.metadata.local_only ? 'active noshipping' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: true } }))}>
                                          📍 Local Pickup Only
                                        </button>
                                      </div>
                                      {editItemForm.metadata.local_only && (
                                        <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {editItemForm.category === 'Headboards' && (
                                <div className="cr-meta-section cr-span-2">
                                  <p className="cr-meta-title">Headboard Details</p>
                                  <div className="cr-field-grid">
                                    <div className="cr-field">
                                      <label>Type</label>
                                      <select value={editItemForm.metadata.subcategory || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, subcategory: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {HEADBOARD_TYPES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Color / Finish</label>
                                      <input type="text" placeholder="e.g. Dark Walnut" value={editItemForm.metadata.color || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, color: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Material</label>
                                      <select value={editItemForm.metadata.material || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, material: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {HEADBOARD_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Style</label>
                                      <select value={editItemForm.metadata.style || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, style: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {HEADBOARD_STYLES.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Dimensions <span className="cr-hint">(W × H)</span></label>
                                      <input type="text" placeholder='e.g. 60" × 48"' value={editItemForm.metadata.dimensions || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, dimensions: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Condition</label>
                                      <select value={editItemForm.metadata.condition || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, condition: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {HEADBOARD_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Weight (lbs) <span className="cr-hint">(for shipping rates)</span></label>
                                      <input type="number" step="1" min="0" placeholder="e.g. 20" value={editItemForm.metadata.weight_lbs || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, weight_lbs: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Notes</label>
                                      <input type="text" value={editItemForm.metadata.notes || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, notes: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                      <div className="cr-shipping-toggle">
                                        <button type="button"
                                          className={`cr-shipping-btn ${!editItemForm.metadata.local_only ? 'active ship' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: false } }))}>
                                          📦 Shipping Allowed
                                        </button>
                                        <button type="button"
                                          className={`cr-shipping-btn ${editItemForm.metadata.local_only ? 'active noshipping' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: true } }))}>
                                          📍 Local Pickup Only
                                        </button>
                                      </div>
                                      {editItemForm.metadata.local_only && (
                                        <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {editItemForm.category === 'Other' && (
                                <div className="cr-meta-section cr-span-2">
                                  <p className="cr-meta-title">Item Details</p>
                                  <div className="cr-field-grid">
                                    <div className="cr-field">
                                      <label>Color</label>
                                      <input type="text" placeholder="e.g. Black" value={editItemForm.metadata.color || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, color: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Material</label>
                                      <select value={editItemForm.metadata.material || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, material: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {FURNITURE_MATERIALS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field">
                                      <label>Dimensions <span className="cr-hint">(W × D × H)</span></label>
                                      <input type="text" placeholder='e.g. 12" × 8" × 4"' value={editItemForm.metadata.dimensions || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, dimensions: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Weight</label>
                                      <input type="text" placeholder="e.g. 2 lbs" value={editItemForm.metadata.weight || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, weight: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field">
                                      <label>Condition</label>
                                      <select value={editItemForm.metadata.condition || ''} onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, condition: e.target.value } }))}>
                                        <option value="">Select…</option>
                                        {OTHER_CONDITIONS.map(v => <option key={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Notes <span className="cr-hint">(missing parts, pet home, smoke-free, needs repair, etc.)</span></label>
                                      <input type="text" placeholder="Any additional details" value={editItemForm.metadata.notes || ''}
                                        onChange={e => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, notes: e.target.value } }))} />
                                    </div>
                                    <div className="cr-field cr-span-2">
                                      <label>Shipping <span className="cr-hint">(controls buyer checkout options)</span></label>
                                      <div className="cr-shipping-toggle">
                                        <button type="button"
                                          className={`cr-shipping-btn ${!editItemForm.metadata.local_only ? 'active ship' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: false } }))}>
                                          📦 Shipping Allowed
                                        </button>
                                        <button type="button"
                                          className={`cr-shipping-btn ${editItemForm.metadata.local_only ? 'active noshipping' : ''}`}
                                          onClick={() => setEditItemForm(p => ({ ...p, metadata: { ...p.metadata, local_only: true } }))}>
                                          📍 Local Pickup Only
                                        </button>
                                      </div>
                                      {editItemForm.metadata.local_only && (
                                        <span className="cr-hint cr-noshipping-hint">Shipping will be disabled at Shopify checkout for this item</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
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
                              <div><span className="cr-detail-label">Agreement</span>
                                <span className={`cr-agr-inline ${item.agreement_type || 'none'}`}>
                                  {item.agreement_type === 'consignment' ? '🔄 Consignment' : item.agreement_type === 'donation' ? '🎁 Donation' : '—'}
                                </span>
                              </div>
                              <div><span className="cr-detail-label">Notification</span>
                                <span>{item.notification_sent ? `Sent ${formatDate(item.notification_sent.split('T')[0])}` : donor?.donor_email ? 'Pending' : 'No email on file'}</span>
                              </div>
                            </div>
                            {(() => {
                              const images = (item.item_images || []).sort((a, b) => a.display_order - b.display_order);
                              const allUrls = images.length > 0
                                ? images.map(img => img.image_url)
                                : (item.item_image_url ? [item.item_image_url] : []);
                              return allUrls.length > 0 && (
                                <div className={`cr-detail-photos ${allUrls.length === 1 ? 'single' : ''}`}>
                                  {allUrls.map((url, i) => (
                                    <img key={i} src={url} alt={`${item.item_description} photo ${i + 1}`} loading="lazy" />
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Shopify publish form (inline) */}
                            {publishingItem === item.id && (
                              <div className="cr-publish-form">
                                <h4 className="cr-publish-title">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Publish to Shopify Store
                                </h4>

                                {/* Pre-publish checklist */}
                                <div className="cr-publish-checklist">
                                  <div className={`cr-check-row ${item.category ? 'ok' : 'warn'}`}>
                                    <span className="cr-check-icon">{item.category ? '✓' : '⚠'}</span>
                                    <span>Category: <strong>{item.category || 'Not set — item will publish as "Donated Item" with no collection tags'}</strong></span>
                                  </div>
                                  <div className={`cr-check-row ${item.agreement_type ? 'ok' : 'warn'}`}>
                                    <span className="cr-check-icon">{item.agreement_type ? '✓' : '⚠'}</span>
                                    <span>Agreement type: <strong>{item.agreement_type || 'Not set'}</strong></span>
                                  </div>
                                  {item.category === 'Clothing' && (
                                    <div className={`cr-check-row ${item.metadata?.gender ? 'ok' : 'warn'}`}>
                                      <span className="cr-check-icon">{item.metadata?.gender ? '✓' : '⚠'}</span>
                                      <span>Gender: <strong>{item.metadata?.gender || 'Not set — item won\'t appear in Men\'s or Women\'s collections'}</strong></span>
                                    </div>
                                  )}
                                  {item.category === 'Clothing' && (
                                    <div className={`cr-check-row ${item.metadata?.size ? 'ok' : 'warn'}`}>
                                      <span className="cr-check-icon">{item.metadata?.size ? '✓' : '⚠'}</span>
                                      <span>Size: <strong>{item.metadata?.size || 'Not set'}</strong></span>
                                    </div>
                                  )}
                                  {(item.category === 'Clothing' || item.category === 'Furniture' || item.category === 'Headboards') && (
                                    <div className={`cr-check-row ${item.metadata?.weight_lbs ? 'ok' : 'warn'}`}>
                                      <span className="cr-check-icon">{item.metadata?.weight_lbs ? '✓' : '⚠'}</span>
                                      <span>Weight: <strong>{item.metadata?.weight_lbs ? `${item.metadata.weight_lbs} lbs` : 'Not set — carrier-calculated shipping will be inaccurate'}</strong></span>
                                    </div>
                                  )}
                                  {(item.category === 'Furniture' || item.category === 'Headboards') && (
                                    <div className={`cr-check-row ${item.metadata?.local_only ? 'noshipping' : 'ok'}`}>
                                      <span className="cr-check-icon">{item.metadata?.local_only ? '📍' : '📦'}</span>
                                      <span>Shipping: <strong>{item.metadata?.local_only ? 'Local Pickup Only — shipping disabled at checkout' : 'Allowed — carrier-calculated rates apply'}</strong></span>
                                    </div>
                                  )}
                                  {(!item.category || (item.category === 'Clothing' && !item.metadata?.gender)) && (
                                    <p className="cr-check-hint">⚠ Edit this item first to fill in missing fields, then publish.</p>
                                  )}
                                </div>

                                <div className="cr-field-grid">
                                  <div className="cr-field">
                                    <label>Listing Title</label>
                                    <input type="text" value={publishForm.title}
                                      onChange={e => setPublishForm(p => ({ ...p, title: e.target.value }))}
                                      placeholder={item.item_description} />
                                  </div>
                                  <div className="cr-field">
                                    <label>Price <span className="cr-req">*</span></label>
                                    <div className="cr-price-row">
                                      <div className="cr-price-input">
                                        <span className="cr-price-prefix">$</span>
                                        <input type="number" step="0.01" min="0" value={publishForm.price}
                                          onChange={e => setPublishForm(p => ({ ...p, price: e.target.value }))}
                                          placeholder="0.00" required />
                                      </div>
                                      <button type="button" className="cr-act cr-suggest-btn"
                                        onClick={() => suggestPrice(item.id)}
                                        disabled={priceLoading}>
                                        {priceLoading
                                          ? <><span className="cr-spinner sm"></span> Thinking…</>
                                          : <>✦ Suggest Price</>}
                                      </button>
                                    </div>
                                    {priceSuggestion && priceSuggestion.forItem === item.id && !priceSuggestion.error && (
                                      <div className="cr-price-suggestion">
                                        <div className="cr-price-suggestion-header">
                                          <span className="cr-price-suggestion-badge">✦ AI Price Suggestion</span>
                                          <span className="cr-price-suggestion-range">
                                            Range: ${priceSuggestion.price_range.low.toFixed(2)} – ${priceSuggestion.price_range.high.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="cr-price-suggestion-main">
                                          <span className="cr-price-suggestion-value">${priceSuggestion.suggested_price.toFixed(2)}</span>
                                          <button type="button" className="cr-act edit cr-price-accept"
                                            onClick={() => setPublishForm(p => ({ ...p, price: priceSuggestion.suggested_price.toFixed(2) }))}>
                                            Use This Price
                                          </button>
                                        </div>
                                        <p className="cr-price-suggestion-rationale">{priceSuggestion.rationale}</p>
                                        {priceSuggestion.floor_price > 0 && (
                                          <p className="cr-price-suggestion-floor">Floor: ${priceSuggestion.floor_price.toFixed(2)} (condition-based minimum)</p>
                                        )}
                                      </div>
                                    )}
                                    {priceSuggestion?.error && priceSuggestion.forItem === item.id && (
                                      <p className="cr-price-suggestion-error">Could not get suggestion: {priceSuggestion.error}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="cr-detail-actions">
                                  <button className="cr-act publish" onClick={publishToShopify} disabled={publishLoading || !publishForm.price}>
                                    {publishLoading ? 'Publishing…' : 'Publish to Store'}
                                  </button>
                                  <button className="cr-act" onClick={cancelPublish}>Cancel</button>
                                </div>
                              </div>
                            )}

                            {/* Shopify listing info (for listed items) */}
                            {item.status === 'listed' && item.shopify_product_id && publishingItem !== item.id && (
                              <div className="cr-shopify-info">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="16" height="16">
                                  <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Listed on Shopify &middot; ${parseFloat(item.price).toFixed(2)}
                                {item.shopify_product_id && <span className="cr-shopify-id"> &middot; Product #{item.shopify_product_id}</span>}
                              </div>
                            )}

                            {/* Sold info */}
                            {item.status === 'sold' && (
                              <div className="cr-sold-info">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="16" height="16">
                                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Sold{item.sold_at ? ` on ${formatDate(item.sold_at.split('T')[0])}` : ''}
                                {item.price && ` for $${parseFloat(item.price).toFixed(2)}`}
                                {item.shopify_order_id && <span> &middot; Order #{item.shopify_order_id}</span>}
                              </div>
                            )}

                            <div className="cr-detail-actions">
                              {/* Publish button — only for in_storage items */}
                              {(item.status === 'in_storage' || !item.status) && publishingItem !== item.id && (
                                <button className="cr-act publish" onClick={() => startPublish(item)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Publish to Store
                                </button>
                              )}

                              {/* Unlist button — only for listed items */}
                              {item.status === 'listed' && (
                                <button className="cr-act danger" onClick={() => unlistFromShopify(item)}
                                  disabled={unlistingItem === item.id}>
                                  {unlistingItem === item.id ? 'Unlisting…' : 'Unlist from Store'}
                                </button>
                              )}

                              {/* Edit — not available for sold items */}
                              {item.status !== 'sold' && (
                                <button className="cr-act edit" onClick={() => startEditItem(item)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Edit
                                </button>
                              )}

                              {deleteConfirm === item.id ? (
                                <span className="cr-confirm-delete">
                                  Delete this item?
                                  <button className="cr-act danger" onClick={() => handleDeleteItem(item.id)}>Yes, delete</button>
                                  <button className="cr-act" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                                </span>
                              ) : (
                                item.status !== 'sold' && item.status !== 'listed' && (
                                  <button className="cr-act danger" onClick={() => setDeleteConfirm(item.id)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Delete
                                  </button>
                                )
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
          <div className="cr-sub-tabs">
            <button className={`cr-sub-tab ${donorSubTab === 'donors' ? 'active' : ''}`}
              onClick={() => setDonorSubTab('donors')}>
              Donors
            </button>
            <button className={`cr-sub-tab ${donorSubTab === 'agreements' ? 'active' : ''}`}
              onClick={() => setDonorSubTab('agreements')}>
              Agreements
              {agreements.length > 0 && <span className="cr-sub-tab-count">{agreements.length}</span>}
            </button>
            <button className={`cr-sub-tab ${donorSubTab === 'payouts' ? 'active' : ''}`}
              onClick={() => setDonorSubTab('payouts')}>
              Payouts
              {payouts.filter(p => !p.payout_paid).length > 0 && (
                <span className="cr-sub-tab-count warn">{payouts.filter(p => !p.payout_paid).length}</span>
              )}
            </button>
          </div>

          {donorSubTab === 'donors' && (<>
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
                        <ParticipationBadge status={donor.participation_status} />
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

                            {/* ── Participation Agreement Section ── */}
                            <div className="cr-waiver-section">
                              <h4 className="cr-history-title">Participation Agreement</h4>
                              <div className="cr-agreement-row">
                                <ParticipationBadge status={donor.participation_status} large />
                                {(!donor.participation_status || donor.participation_status === 'pending') && donor.donor_email && (
                                  <a
                                    className="cr-act edit cr-send-agreement"
                                    href={`mailto:${donor.donor_email}?subject=Campus%20Reclaimed%20Participation%20Agreement&body=Hi%20${encodeURIComponent(donor.donor_name.split(' ')[0])}%2C%0A%0APlease%20complete%20your%20Campus%20Reclaimed%20Participation%20Agreement%20at%20the%20link%20below%20before%20dropping%20off%20your%20items.%0A%0Ahttps%3A%2F%2F92mauwn4py.us-east-1.awsapprunner.com%2Fagreement%0A%0AThanks!`}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="15" height="15">
                                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="M22 6l-10 7L2 6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Send Agreement
                                  </a>
                                )}
                                {donor.participation_status && donor.participation_status !== 'pending' && (
                                  <span className="cr-agreement-complete">Agreement on file ✓</span>
                                )}
                              </div>
                              {/* Waiver PDFs (from older system) */}
                              {donorWaivers[donor.id] && donorWaivers[donor.id].length > 0 && (
                                <div className="cr-waiver-list">
                                  {donorWaivers[donor.id].map(w => (
                                    <div key={w.id} className="cr-waiver-entry">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="16" height="16">
                                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      <span className="cr-waiver-date">Signed {formatDate(w.signed_at?.split('T')[0])}</span>
                                      <a href={w.waiver_url} target="_blank" rel="noopener noreferrer" className="cr-act edit cr-waiver-link">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="14" height="14">
                                          <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        View PDF
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}
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
          </>)}

          {donorSubTab === 'agreements' && (
            <div className="cr-agreements-panel">
              <div className="cr-toolbar cr-agreements-toolbar">
                <div className="cr-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                  </svg>
                  <input type="text" placeholder="Search by name or email…" value={agreementSearch}
                    onChange={e => setAgreementSearch(e.target.value)} />
                  {agreementSearch && <button className="cr-clear" onClick={() => setAgreementSearch('')}>&times;</button>}
                </div>
                <div className="cr-agreement-filters">
                  {['all', 'consignment', 'donation'].map(f => (
                    <button key={f}
                      className={`cr-filter-btn ${agreementTypeFilter === f ? 'active' : ''}`}
                      onClick={() => setAgreementTypeFilter(f)}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="cr-act edit cr-refresh-btn" onClick={fetchAgreements} disabled={agreementsLoading}>
                  {agreementsLoading ? <span className="cr-spinner sm"></span> : '↻'} Refresh
                </button>
              </div>

              {agreementsLoading ? (
                <div className="cr-loading"><span className="cr-spinner lg"></span><p>Loading agreements…</p></div>
              ) : (() => {
                const q = agreementSearch.trim().toLowerCase();
                const filtered = agreements.filter(a => {
                  const matchesSearch = !q ||
                    (a.first_name + ' ' + a.last_name).toLowerCase().includes(q) ||
                    (a.email || '').toLowerCase().includes(q) ||
                    (a.phone || '').includes(q);
                  const matchesType = agreementTypeFilter === 'all' || a.agreement_type === agreementTypeFilter;
                  return matchesSearch && matchesType;
                });
                if (filtered.length === 0) return (
                  <div className="cr-empty">
                    <h3>{agreements.length === 0 ? 'No agreements yet' : 'No matching agreements'}</h3>
                    <p>{agreements.length === 0 ? 'Submitted agreements will appear here.' : 'Try adjusting your search or filter.'}</p>
                  </div>
                );
                return (
                  <div className="cr-agreements-table-wrap">
                    <table className="cr-agreements-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Type</th>
                          <th>Submitted</th>
                          <th>Agreement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.first_name}{a.mi ? ' ' + a.mi + '.' : ''} {a.last_name}</strong></td>
                            <td>{a.email || '—'}</td>
                            <td>{a.phone || '—'}</td>
                            <td>
                              <span className={`cr-tag ${a.agreement_type === 'consignment' ? 'consignment' : 'donation'}`}>
                                {a.agreement_type === 'consignment' ? '🔄 Consignment' : '🎁 Donation'}
                              </span>
                            </td>
                            <td className="cr-agreements-date">
                              {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </td>
                            <td>
                              {a.pdf_url ? (
                                <a href={a.pdf_url} target="_blank" rel="noopener noreferrer"
                                  className="cr-act edit cr-waiver-link">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="13" height="13">
                                    <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  View PDF
                                </a>
                              ) : <span className="cr-hint">No PDF</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="cr-agreements-count">{filtered.length} agreement{filtered.length !== 1 ? 's' : ''}{agreementTypeFilter !== 'all' ? ' (' + agreementTypeFilter + ')' : ''}</p>
                  </div>
                );
              })()}
            </div>
          )}
          {donorSubTab === 'payouts' && (
            <div className="cr-payouts-panel">
              <div className="cr-toolbar">
                <div className="cr-payout-filter">
                  {[['unpaid', 'Unpaid'], ['paid', 'Paid'], ['all', 'All']].map(([val, label]) => (
                    <button key={val}
                      className={`cr-filter-btn ${payoutFilter === val ? 'active' : ''}`}
                      onClick={() => setPayoutFilter(val)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="cr-act edit cr-refresh-btn" onClick={exportPayoutsCSV} disabled={payouts.length === 0} title="Download CSV">
                    ⬇ Export CSV
                  </button>
                  <button className="cr-act edit cr-refresh-btn" onClick={fetchPayouts} disabled={payoutsLoading}>
                    {payoutsLoading ? <span className="cr-spinner sm"></span> : '↻'} Refresh
                  </button>
                </div>
              </div>

              {payoutsLoading ? (
                <div className="cr-loading"><span className="cr-spinner lg"></span><p>Loading payouts…</p></div>
              ) : (() => {
                const filtered = payouts.filter(p => {
                  if (payoutFilter === 'unpaid') return !p.payout_paid;
                  if (payoutFilter === 'paid')   return !!p.payout_paid;
                  return true;
                });

                if (filtered.length === 0) return (
                  <div className="cr-empty">
                    <h3>{payouts.length === 0 ? 'No consignment sales yet' : `No ${payoutFilter} payouts`}</h3>
                    <p>{payouts.length === 0 ? 'Payouts appear here when consignment items are sold.' : 'Try a different filter.'}</p>
                  </div>
                );

                const totalOwed = filtered.filter(p => !p.payout_paid)
                  .reduce((sum, p) => sum + ((p.shopify_payout || p.price || 0) * (p.payout_percentage || 20) / 100), 0);

                return (
                  <>
                    {payoutFilter !== 'paid' && (
                      <div className="cr-payout-summary">
                        <span>Total outstanding: <strong>${totalOwed.toFixed(2)}</strong></span>
                        <span className="cr-hint">{filtered.filter(p => !p.payout_paid).length} unpaid item{filtered.filter(p => !p.payout_paid).length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="cr-payout-list">
                      {filtered.map(p => {
                        const donor       = p.donation?.donor;
                        const saleAmount   = parseFloat(p.shopify_payout || p.price || 0);
                        const pct          = parseFloat(p.payout_percentage || 20);
                        const calculated   = (saleAmount * pct / 100).toFixed(2);
                        const hasOverride  = p.payout_override != null && p.payout_override !== '';
                        const amountOwed   = hasOverride ? parseFloat(p.payout_override).toFixed(2) : calculated;
                        const isPaid       = !!p.payout_paid;

                        return (
                          <div key={p.id} className={`cr-payout-card ${isPaid ? 'paid' : 'unpaid'}`}>
                            <div className="cr-payout-header">
                              <div className="cr-payout-donor">
                                <div className="cr-donor-avatar">{donor?.donor_name?.charAt(0).toUpperCase() || '?'}</div>
                                <div>
                                  <strong>{donor?.donor_name || '—'}</strong>
                                  {p.venmo_handle && <span className="cr-payout-venmo">💸 {p.venmo_handle}</span>}
                                </div>
                              </div>
                              <div className={`cr-payout-status-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                                {isPaid ? '✓ Paid' : '⏳ Unpaid'}
                              </div>
                            </div>

                            <div className="cr-payout-item-desc">{p.item_description}</div>

                            <div className="cr-payout-details">
                              <div className="cr-payout-detail-row">
                                <span className="cr-detail-label">Sold</span>
                                <span>{p.sold_at ? formatDate(p.sold_at.split('T')[0]) : '—'}</span>
                              </div>
                              {p.buyer_name && (
                                <div className="cr-payout-detail-row">
                                  <span className="cr-detail-label">Buyer</span>
                                  <span>{p.buyer_name}</span>
                                </div>
                              )}
                              <div className="cr-payout-detail-row">
                                <span className="cr-detail-label">Sale amount</span>
                                <span>${saleAmount.toFixed(2)}</span>
                              </div>
                              <div className="cr-payout-detail-row">
                                <span className="cr-detail-label">Consignor %</span>
                                <div className="cr-payout-pct-input">
                                  <input
                                    type="number" min="0" max="100" step="1"
                                    value={pct}
                                    disabled={isPaid}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 20;
                                      savePayoutRecord(p.id, { payout_percentage: val });
                                    }}
                                  />
                                  <span>%</span>
                                </div>
                              </div>
                              <div className="cr-payout-detail-row cr-payout-amount-row">
                                <span className="cr-detail-label">Amount owed</span>
                                <strong className="cr-payout-amount" style={hasOverride ? { color: '#b85c00' } : {}}>
                                  ${amountOwed}{hasOverride && <span style={{ fontSize: '0.75em', fontWeight: 400, marginLeft: 4 }}>overridden</span>}
                                </strong>
                              </div>
                              {!isPaid && (
                                <div className="cr-payout-detail-row">
                                  <span className="cr-detail-label">Override $</span>
                                  <input
                                    type="number" min="0" step="0.01"
                                    placeholder={calculated}
                                    value={p.payout_override != null ? p.payout_override : ''}
                                    style={{ width: '90px', padding: '3px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.9em' }}
                                    onChange={e => {
                                      const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                      savePayoutRecord(p.id, { payout_override: val });
                                    }}
                                  />
                                </div>
                              )}
                            </div>

                            <div className="cr-payout-actions">
                              <label className="cr-payout-paid-label">
                                <input
                                  type="checkbox"
                                  checked={isPaid}
                                  disabled={savingPayout === p.id}
                                  onChange={e => {
                                    const nowPaid = e.target.checked;
                                    savePayoutRecord(p.id, {
                                      payout_paid:      nowPaid,
                                      payout_paid_date: nowPaid ? new Date().toISOString().split('T')[0] : null,
                                    });
                                  }}
                                />
                                {savingPayout === p.id ? <span className="cr-spinner sm"></span> : 'Mark as paid'}
                              </label>
                              {isPaid && p.payout_paid_date && (
                                <div className="cr-payout-paid-date-row">
                                  <span className="cr-detail-label">Paid on</span>
                                  <input
                                    type="date"
                                    value={p.payout_paid_date}
                                    onChange={e => savePayoutRecord(p.id, { payout_paid_date: e.target.value })}
                                    className="cr-payout-date-input"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
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
