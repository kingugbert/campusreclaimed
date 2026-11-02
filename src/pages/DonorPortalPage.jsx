// src/pages/DonorPortalPage.jsx
// Public donor portal — accessible at /donor (no auth required).
//
// Auth flow (magic link):
//   1. Consignor enters email → POST portal-auth → "check your email" screen
//   2. Email arrives with link: /donor?token=<hex>
//   3. On load, if ?token= is in URL → POST lookup-donor { token } → show items
//   4. Token is one-time-use; expired/used tokens show an error with a re-request option
//
// Once authenticated, consignors can:
//   - See status of all their consignment items (listed, sold, payout pending/paid)
//   - Request a payout for unpaid sold items via the request-payout edge function

import { useState, useEffect } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const statusLabel = {
  in_storage: 'In Storage',
  listed:     'Listed for Sale',
  sold:       'Sold',
  claimed:    'Claimed',
  removed:    'Removed',
};

const statusColor = {
  in_storage: '#6b7280',
  listed:     '#2563eb',
  sold:       '#16a34a',
  claimed:    '#d97706',
  removed:    '#dc2626',
};

export default function DonorPortalPage() {
  const [email,        setEmail]        = useState('');
  const [items,        setItems]        = useState(null);
  const [donor,        setDonor]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [payoutStatus, setPayoutStatus] = useState('');
  const [payoutMsg,    setPayoutMsg]    = useState('');

  // 'form' | 'check-email' | 'token-error' | 'items'
  const [view, setView] = useState('form');
  const [tokenError, setTokenError] = useState('');

  // ── On load: check for ?token= in URL ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    // Remove token from URL immediately (one-time use, don't leave it in history)
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    setLoading(true);
    fetch(`${SUPABASE_URL}/functions/v1/lookup-donor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setTokenError(data.error || 'This sign-in link is invalid or has expired.');
          setView('token-error');
        } else {
          setDonor(data.donor);
          setItems(data.items);
          setEmail(data.donor?.donor_email || '');
          setView('items');
        }
      })
      .catch(() => {
        setTokenError('Something went wrong. Please request a new sign-in link.');
        setView('token-error');
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Calculate payout ───────────────────────────────────────────────────
  const totalOwed = (items || [])
    .filter(i => i.agreement_type === 'consignment' && i.status === 'sold' && !i.payout_paid)
    .reduce((sum, i) => {
      if (i.payout_override != null) return sum + Number(i.payout_override);
      if (i.shopify_payout != null && i.payout_percentage != null) {
        return sum + (Number(i.shopify_payout) * Number(i.payout_percentage) / 100);
      }
      return sum;
    }, 0);

  const hasUnpaidItems = totalOwed > 0;

  // ── Submit email → send magic link ─────────────────────────────────────
  async function handleLookup(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/portal-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Something went wrong.');
      }

      setView('check-email');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Request payout (uses stored email from donor object) ───────────────
  async function handleRequestPayout() {
    setPayoutStatus('loading');
    setPayoutMsg('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: donor?.donor_email || email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayoutStatus('error');
        setPayoutMsg(data.error || 'Failed to submit payout request.');
      } else {
        setPayoutStatus('success');
        setPayoutMsg(`Payout request submitted for $${data.total_owed?.toFixed(2)}. We'll be in touch shortly.`);
      }
    } catch {
      setPayoutStatus('error');
      setPayoutMsg('Network error. Please try again.');
    }
  }

  const formatAmount = (item) => {
    if (item.payout_override != null) return `$${Number(item.payout_override).toFixed(2)}`;
    if (item.shopify_payout != null && item.payout_percentage != null) {
      return `$${(Number(item.shopify_payout) * Number(item.payout_percentage) / 100).toFixed(2)}`;
    }
    return '—';
  };

  function resetToForm() {
    setView('form');
    setEmail('');
    setItems(null);
    setDonor(null);
    setError('');
    setTokenError('');
    setPayoutStatus('');
    setPayoutMsg('');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: '#1a3c34', color: '#fff', padding: '20px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>Campus <em>Reclaimed</em></h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.75 }}>Consignor Portal</p>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>

        {/* Loading spinner while validating token */}
        {loading && view === 'form' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e0da', padding: 48, textAlign: 'center' }}>
            <p style={{ color: '#6b7280', margin: 0 }}>Signing you in…</p>
          </div>
        )}

        {/* Email form */}
        {!loading && view === 'form' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e0da', padding: 32 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#1a1a1a' }}>Sign In to Your Portal</h2>
            <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
              Enter your email address and we'll send you a secure sign-in link — no password needed.
            </p>
            <form onSubmit={handleLookup}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #d1d5db', fontSize: 15, outline: 'none',
                  boxSizing: 'border-box', marginBottom: 16,
                }}
              />
              {error && (
                <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 12px' }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: '#1a3c34', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '11px 28px', fontSize: 15, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Sending…' : 'Send Sign-In Link'}
              </button>
            </form>
          </div>
        )}

        {/* Check your email screen */}
        {view === 'check-email' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e0da', padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#1a1a1a' }}>Check Your Email</h2>
            <p style={{ margin: '0 0 8px', color: '#374151', fontSize: 15 }}>
              We sent a sign-in link to <strong>{email}</strong>.
            </p>
            <p style={{ margin: '0 0 28px', color: '#6b7280', fontSize: 14 }}>
              The link expires in 15 minutes. If you don't see it, check your spam folder.
            </p>
            <button
              onClick={resetToForm}
              style={{
                background: 'none', border: '1px solid #d1d5db', borderRadius: 8,
                padding: '9px 20px', fontSize: 14, cursor: 'pointer', color: '#374151',
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        {/* Token error screen */}
        {view === 'token-error' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #fecaca', padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#1a1a1a' }}>Sign-In Link Problem</h2>
            <p style={{ margin: '0 0 28px', color: '#dc2626', fontSize: 15 }}>{tokenError}</p>
            <button
              onClick={resetToForm}
              style={{
                background: '#1a3c34', color: '#fff', border: 'none', borderRadius: 8,
                padding: '11px 28px', fontSize: 15, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Request a New Link
            </button>
          </div>
        )}

        {/* Items view */}
        {view === 'items' && items !== null && (
          <div>
            {/* Donor greeting + sign out */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: '#1a1a1a' }}>Hi, {donor?.donor_name?.split(' ')[0]}!</h2>
                <p style={{ margin: '2px 0 0', fontSize: 14, color: '#6b7280' }}>{donor?.donor_email}</p>
              </div>
              <button
                onClick={resetToForm}
                style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}
              >
                Sign Out
              </button>
            </div>

            {/* Payout summary */}
            {hasUnpaidItems && (
              <div style={{
                background: '#fff', borderRadius: 12, border: '1px solid #bbf7d0',
                padding: '20px 24px', marginBottom: 20,
                borderLeft: '4px solid #16a34a',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>
                      Payout Available: <span style={{ color: '#16a34a' }}>${totalOwed.toFixed(2)}</span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                      From {items.filter(i => i.status === 'sold' && !i.payout_paid).length} sold item(s) awaiting payment
                    </p>
                  </div>
                  {payoutStatus !== 'success' && (
                    <button
                      onClick={handleRequestPayout}
                      disabled={payoutStatus === 'loading'}
                      style={{
                        background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '10px 22px', fontSize: 14, fontWeight: 500,
                        cursor: payoutStatus === 'loading' ? 'not-allowed' : 'pointer',
                        opacity: payoutStatus === 'loading' ? 0.7 : 1,
                      }}
                    >
                      {payoutStatus === 'loading' ? 'Submitting…' : 'Request Payout'}
                    </button>
                  )}
                </div>
                {payoutMsg && (
                  <p style={{
                    margin: '12px 0 0', fontSize: 14,
                    color: payoutStatus === 'success' ? '#16a34a' : '#dc2626',
                  }}>
                    {payoutMsg}
                  </p>
                )}
              </div>
            )}

            {/* Items list */}
            {items.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e0da', padding: 32, textAlign: 'center', color: '#6b7280' }}>
                No consignment items found for this account.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map(item => {
                  const payoutAmt = formatAmount(item);
                  return (
                    <div
                      key={item.id}
                      style={{
                        background: '#fff', borderRadius: 12, border: '1px solid #e4e0da',
                        padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start',
                      }}
                    >
                      {item.primary_image && (
                        <img
                          src={item.primary_image}
                          alt={item.item_description}
                          style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>
                            {item.item_description || 'Item'}
                          </p>
                          <span style={{
                            flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '3px 10px',
                            borderRadius: 20, background: statusColor[item.status] + '20',
                            color: statusColor[item.status],
                          }}>
                            {statusLabel[item.status] || item.status}
                          </span>
                        </div>
                        {item.category && (
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>{item.category}</p>
                        )}
                        {item.status === 'sold' && (
                          <div style={{ marginTop: 6 }}>
                            {item.payout_paid ? (
                              <p style={{ margin: 0, fontSize: 13, color: '#16a34a' }}>
                                ✓ Payout paid{item.payout_paid_date ? ` on ${new Date(item.payout_paid_date).toLocaleDateString('en-US')}` : ''}: <strong>{payoutAmt}</strong>
                              </p>
                            ) : (
                              <p style={{ margin: 0, fontSize: 13, color: '#d97706' }}>
                                Payout pending: <strong>{payoutAmt}</strong>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 20px 48px', color: '#9ca3af', fontSize: 13 }}>
        <p style={{ margin: 0 }}>Campus Reclaimed · <a href="mailto:info@campusreclaimed.com" style={{ color: '#6b7280' }}>info@campusreclaimed.com</a></p>
      </div>
    </div>
  );
}
