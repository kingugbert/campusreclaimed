// src/pages/ToteRequestPage.jsx
// Public page — no auth required
// Embedded in Shopify via iframe:
//   <iframe src="https://92mauwn4py.us-east-1.awsapprunner.com/request-tote"
//           width="100%" height="820" frameborder="0" scrolling="no"></iframe>

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '', venmo: '', item_types: '',
};

export default function ToteRequestPage() {
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState(null);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('tote-request', {
        body: {
          name:       form.name.trim(),
          email:      form.email.trim(),
          phone:      form.phone.trim(),
          address:    form.address.trim(),
          venmo:      form.venmo.trim() || null,
          item_types: form.item_types.trim() || null,
        },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again or email info@campusreclaimed.com.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── styles ── */
  const s = {
    page:     { fontFamily: "'Segoe UI', Arial, sans-serif", background: '#faf7f2', minHeight: '100vh', padding: '0 0 40px' },
    header:   { background: '#1a3c34', color: '#fff', padding: '20px 24px', marginBottom: 24 },
    h1:       { margin: 0, fontSize: 22, fontWeight: 400 },
    subtitle: { margin: '4px 0 0', opacity: .75, fontSize: 14 },
    card:     { background: '#fff', borderRadius: 12, border: '1px solid #e4e0da', padding: '24px 24px 28px', maxWidth: 520, margin: '0 auto' },
    label:    { display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 },
    req:      { color: '#c4725a', marginLeft: 2 },
    input:    { width: '100%', padding: '10px 12px', border: '1.5px solid #e4e0da', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
    hint:     { fontSize: 12, color: '#888', marginTop: 4 },
    field:    { marginBottom: 18 },
    btn:      { width: '100%', padding: '13px', background: '#1a3c34', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
    btnDis:   { opacity: .6, cursor: 'not-allowed' },
    error:    { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 14 },
    success:  { textAlign: 'center', padding: '32px 24px' },
    checkmark:{ fontSize: 48, marginBottom: 12 },
    sxTitle:  { fontSize: 22, fontWeight: 600, color: '#1a3c34', margin: '0 0 8px' },
    sxText:   { color: '#555', lineHeight: 1.6, marginBottom: 20 },
    agreeBtn: { display: 'inline-block', background: '#1a3c34', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 15 },
  };

  if (submitted) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>Campus <em>Reclaimed</em></h1>
          <p style={s.subtitle}>Sustainable student resale</p>
        </div>
        <div style={{ ...s.card, ...s.success }}>
          <div style={s.checkmark}>✅</div>
          <h2 style={s.sxTitle}>Tote request received!</h2>
          <p style={s.sxText}>
            Thanks! An ambassador will drop off your tote within <strong>24–48 hours</strong>.
            You'll also get a confirmation email with all the details.
          </p>
          <p style={{ ...s.sxText, marginBottom: 24 }}>
            In the meantime, please sign your <strong>Participation Agreement</strong> — 
            this is required before we can process your items.
          </p>
          <a href="https://92mauwn4py.us-east-1.awsapprunner.com/agreement"
            target="_blank" rel="noreferrer" style={s.agreeBtn}>
            Sign Participation Agreement →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Campus <em>Reclaimed</em></h1>
        <p style={s.subtitle}>Request a tote bag pickup</p>
      </div>
      <div style={s.card}>
        <p style={{ color: '#555', marginTop: 0, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
          Fill out the form below and an ambassador will drop off a tote within 24–48 hours.
          Leave it out for pickup 2–3 days later once it's full.
        </p>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={s.field}>
            <label style={s.label}>Name<span style={s.req}>*</span></label>
            <input style={s.input} type="text" placeholder="Jane Smith"
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Email<span style={s.req}>*</span></label>
            <input style={s.input} type="email" placeholder="you@wfu.edu"
              value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Phone Number<span style={s.req}>*</span></label>
            <input style={s.input} type="tel" placeholder="(336) 555-0100"
              value={form.phone} onChange={e => set('phone', e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Dorm Room / Address<span style={s.req}>*</span></label>
            <input style={s.input} type="text" placeholder="Johnson Hall 214"
              value={form.address} onChange={e => set('address', e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>What type of items do you have?</label>
            <input style={s.input} type="text" placeholder="e.g. Clothes, shoes, books, small furniture…"
              value={form.item_types} onChange={e => set('item_types', e.target.value)} />
            <p style={s.hint}>This helps your ambassador prepare — no need to be exact.</p>
          </div>
          <div style={s.field}>
            <label style={s.label}>Venmo handle <span style={{ fontWeight: 400, color: '#888' }}>(optional — only if consigning items)</span></label>
            <input style={s.input} type="text" placeholder="@yourvenmo"
              value={form.venmo} onChange={e => set('venmo', e.target.value)} />
            <p style={s.hint}>Required only if you want to receive payout for sold items.</p>
          </div>

          <button type="submit" style={{ ...s.btn, ...(submitting ? s.btnDis : {}) }} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Request My Tote 🧺'}
          </button>
        </form>
      </div>
    </div>
  );
}
