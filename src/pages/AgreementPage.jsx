import { useState, useRef } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import jsPDF from 'jspdf'
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const CONSIGNMENT_TERMS = [
  {
    id: 'pricing',
    text: 'Campus Reclaimed sets all prices and reductions are taken periodically during the consignment period.',
  },
  {
    id: 'period',
    text: 'The consignment period is 60 days. The Consignor no longer owns the items or will be compensated for them after 60 days.',
  },
  {
    id: 'ownership',
    text: "After the 60 day period all items become property of Campus Reclaimed and will be disposed of at the business's discretion.",
  },
  {
    id: 'notification',
    text: 'Campus Reclaimed will notify the Consignor a week prior to the 60 day mark.',
  },
  {
    id: 'sold_notification',
    text: 'The Consignor will be notified via email if an item is SOLD.',
  },
  {
    id: 'damage',
    text: 'Consigned items with damage not found at initial processing will be disposed of without notification.',
  },
  {
    id: 'liability',
    text: "While good care is taken of consigned items, everything is left at the owner's risk and Campus Reclaimed is not responsible for any loss or damage. If the item is very valuable please check with your insurance company.",
  },
  {
    id: 'payment',
    text: 'Campus Reclaimed will only release funds in the form of Venmo to the undersigned Consignor.',
  },
]

const todayStr = () =>
  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// ─── Styles ────────────────────────────────────────────────────────────────────

const GREEN  = '#1c3a2a'
const CREAM  = '#f7f4ee'
const GOLD   = '#b8935a'
const LIGHT  = '#faf8f4'
const BORDER = '#ddd8ce'

const s = {
  page: {
    minHeight: '100vh',
    background: CREAM,
    fontFamily: "'Lora', Georgia, 'Times New Roman', serif",
    color: '#2a2a2a',
    paddingBottom: '60px',
  },
  header: {
    background: GREEN,
    padding: '36px 24px 28px',
    textAlign: 'center',
    borderBottom: `3px solid ${GOLD}`,
  },
  logo: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '2rem',
    color: CREAM,
    margin: 0,
    letterSpacing: '0.03em',
  },
  subtitle: {
    fontFamily: "'Lora', Georgia, serif",
    fontSize: '0.85rem',
    color: GOLD,
    margin: '8px 0 0',
    fontWeight: 400,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
  },
  card: {
    maxWidth: '740px',
    margin: '40px auto',
    background: '#fff',
    borderRadius: '3px',
    boxShadow: '0 1px 20px rgba(0,0,0,0.09)',
    overflow: 'hidden',
  },
  section: {
    padding: '32px 40px',
    borderBottom: `1px solid ${BORDER}`,
  },
  sectionHeading: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '1.25rem',
    color: GREEN,
    margin: '0 0 4px 0',
  },
  sectionNote: {
    fontSize: '0.82rem',
    color: '#888',
    margin: '0 0 22px 0',
    lineHeight: 1.5,
  },
  row: {
    display: 'flex',
    gap: '16px',
    marginBottom: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flex: 1,
  },
  label: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    padding: '10px 12px',
    border: `1.5px solid ${BORDER}`,
    borderRadius: '3px',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    background: '#fff',
    color: '#2a2a2a',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
    width: '100%',
  },
  inputReadonly: {
    padding: '10px 12px',
    border: `1.5px solid ${BORDER}`,
    borderRadius: '3px',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    background: LIGHT,
    color: '#888',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
  },
  radioRow: {
    display: 'flex',
    gap: '28px',
    marginTop: '4px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#2a2a2a',
  },
  radio: {
    accentColor: GREEN,
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  termRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '13px 0',
    borderBottom: `1px solid #f0ece5`,
  },
  termContent: {
    display: 'flex',
    gap: '10px',
    flex: 1,
  },
  bullet: {
    color: GOLD,
    fontSize: '1.1rem',
    lineHeight: 1.5,
    flexShrink: 0,
  },
  termText: {
    margin: 0,
    fontSize: '0.88rem',
    lineHeight: 1.65,
    color: '#3a3a3a',
  },
  initialsWrap: {
    flexShrink: 0,
    width: '72px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  initialsLabel: {
    fontSize: '0.65rem',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  initialsInput: {
    width: '60px',
    padding: '7px 6px',
    border: `1.5px solid ${GOLD}`,
    borderRadius: '3px',
    textAlign: 'center',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    fontWeight: 700,
    color: GREEN,
    background: '#fffdf8',
    outline: 'none',
  },
  disclaimerBox: {
    background: '#f7f2ea',
    border: `1px solid ${GOLD}`,
    borderRadius: '3px',
    padding: '16px 18px',
    margin: '22px 0',
  },
  disclaimerText: {
    margin: 0,
    fontSize: '0.85rem',
    lineHeight: 1.65,
    color: '#3a3a3a',
  },
  fieldNote: {
    margin: '2px 0 6px',
    fontSize: '0.79rem',
    color: '#999',
    lineHeight: 1.4,
  },
  sigWrap: {
    border: `1.5px solid ${BORDER}`,
    borderRadius: '3px',
    background: '#fafaf8',
    minHeight: '130px',
    overflow: 'hidden',
  },
  clearBtn: {
    marginTop: '8px',
    padding: '5px 14px',
    background: 'transparent',
    border: `1px solid #ccc`,
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    color: '#777',
    fontFamily: 'inherit',
  },
  agreementStatement: {
    color: '#555',
    fontSize: '0.95rem',
    fontStyle: 'italic',
    margin: '0 0 24px 0',
    paddingLeft: '14px',
    borderLeft: `3px solid ${GOLD}`,
  },
  errorMsg: {
    color: '#b94444',
    fontSize: '0.88rem',
    margin: '16px 0 0',
    padding: '10px 14px',
    background: '#fdf0f0',
    border: '1px solid #e8c4c4',
    borderRadius: '3px',
  },
  submitBtn: {
    marginTop: '28px',
    width: '100%',
    padding: '17px',
    background: GREEN,
    color: CREAM,
    border: 'none',
    borderRadius: '3px',
    fontSize: '1rem',
    fontFamily: "'DM Serif Display', Georgia, serif",
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  successPage: {
    minHeight: '100vh',
    background: CREAM,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Lora', Georgia, serif",
    padding: '40px 24px',
  },
  successCard: {
    background: '#fff',
    borderRadius: '3px',
    padding: '60px 44px',
    maxWidth: '480px',
    textAlign: 'center',
    boxShadow: '0 1px 20px rgba(0,0,0,0.08)',
  },
  successCheck: {
    width: '58px',
    height: '58px',
    background: GREEN,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.6rem',
    color: CREAM,
    margin: '0 auto 22px',
  },
  successHeading: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: '1.7rem',
    color: GREEN,
    margin: '0 0 14px',
  },
  successBody: {
    color: '#555',
    lineHeight: 1.65,
    margin: '0 0 12px',
    fontSize: '0.95rem',
  },
  footer: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: '0.78rem',
    padding: '20px',
    letterSpacing: '0.04em',
  },
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgreementPage() {
  const today = todayStr()

  const [form, setForm] = useState({
    first: '',
    mi: '',
    last: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    email: '',
    phone: '',
    agreementType: '',
    initials: Object.fromEntries(CONSIGNMENT_TERMS.map(t => [t.id, ''])),
    venmo: '',
    printName: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')
  const sigRef = useRef(null)

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }))
  const setInitial = (id, val) =>
    setForm(p => ({ ...p, initials: { ...p.initials, [id]: val } }))

  const isConsignment = form.agreementType === 'consignment'

  // ── PDF generation ────────────────────────────────────────────────────────

  const buildPDF = () => {
    const doc = new jsPDF()
    const lm = 18, rm = 192, w = rm - lm
    let y = 18

    const line = (text, size = 10, style = 'normal', color = [42, 42, 42]) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', style)
      doc.setTextColor(...color)
      const lines = doc.splitTextToSize(text, w)
      doc.text(lines, lm, y)
      y += lines.length * (size * 0.45) + 2
    }

    const rule = () => {
      doc.setDrawColor(200, 194, 182)
      doc.line(lm, y, rm, y)
      y += 5
    }

    // Header
    doc.setFillColor(28, 58, 42)
    doc.rect(0, 0, 210, 28, 'F')
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(247, 244, 238)
    doc.text('Campus Reclaimed', 105, 12, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(184, 147, 90)
    doc.text('PARTICIPATION AGREEMENT', 105, 20, { align: 'center' })
    y = 36

    // Contact
    line('Contact Information', 12, 'bold', [28, 58, 42])
    rule()
    line(`Name: ${form.first}${form.mi ? ' ' + form.mi + '.' : ''} ${form.last}`)
    line(`Email: ${form.email}   Phone: ${form.phone || '—'}`)
    line(`Address: ${form.address || '—'}, ${form.city || '—'}, ${form.state || '—'} ${form.zip || '—'}`)
    y += 4

    // Type
    line(`Agreement Type: ${form.agreementType.toUpperCase()}`, 11, 'bold', [28, 58, 42])
    y += 4

    if (isConsignment) {
      line('Section 1 — Consignment Terms', 12, 'bold', [28, 58, 42])
      rule()

      CONSIGNMENT_TERMS.forEach((term, i) => {
        const bullet = `${i + 1}. ${term.text}`
        const textLines = doc.splitTextToSize(bullet, w - 26)
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(42, 42, 42)
        doc.text(textLines, lm + 4, y)
        const blockH = textLines.length * 4.5
        // initials box on right
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(28, 58, 42)
        doc.text(form.initials[term.id] || '___', rm - 8, y + blockH / 2, { align: 'right' })
        doc.setDrawColor(184, 147, 90)
        doc.rect(rm - 16, y - 3, 18, blockH + 1)
        y += blockH + 5
      })

      y += 2
      // Counterfeit disclaimer
      doc.setFillColor(247, 242, 234)
      const dText =
        "Campus Reclaimed does not accept counterfeit designer goods. Items that cannot be verified by our research or the owner's documentation will not be accepted. Any consignor who repeatedly attempts to consign counterfeit merchandise will have their account terminated."
      const dLines = doc.splitTextToSize(dText, w - 8)
      doc.rect(lm, y - 3, w, dLines.length * 4.5 + 6, 'F')
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(58, 58, 58)
      doc.text(dLines, lm + 4, y + 1)
      y += dLines.length * 4.5 + 10

      line(`Venmo Handle: ${form.venmo}`)
      y += 6
    }

    // Signature section
    line('Section 2 — Agreement & Signature', 12, 'bold', [28, 58, 42])
    rule()
    line('I understand and accept the above conditions.', 9.5, 'italic', [80, 80, 80])
    y += 2
    line(`Print Name: ${form.printName}`)
    line(`Date: ${today}`)
    y += 4

    // Signature image
    const sigData = sigRef.current?.getTrimmedCanvas()?.toDataURL('image/png')
    if (sigData) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text('Signature:', lm, y)
      y += 4
      doc.addImage(sigData, 'PNG', lm, y, 80, 28)
      y += 34
    }

    line(`Submitted: ${new Date().toISOString()}`, 7, 'normal', [170, 170, 170])

    return doc.output('arraybuffer')
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.first || !form.last || !form.email) {
      setError('Please complete all required fields (First Name, Last Name, Email).')
      return
    }
    if (!form.agreementType) {
      setError('Please select Consignment or Donation.')
      return
    }
    if (isConsignment) {
      const missing = CONSIGNMENT_TERMS.filter(t => !form.initials[t.id].trim())
      if (missing.length > 0) {
        setError(`Please initial all consignment terms (${missing.length} remaining).`)
        return
      }
      if (!form.venmo.trim()) {
        setError('Please provide your Venmo handle.')
        return
      }
    }
    if (!form.printName.trim()) {
      setError('Please enter your printed name.')
      return
    }
    if (sigRef.current?.isEmpty()) {
      setError('Please sign the agreement before submitting.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // ── Generate PDF and convert to base64 ──
      const pdfBuffer = buildPDF()
      const bytes     = new Uint8Array(pdfBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const pdf_base64 = btoa(binary)
      const file_name  = `agreement_${form.last}_${form.first}_${Date.now()}.pdf`

      // ── Capture signature ──
      const signature_data = sigRef.current?.getTrimmedCanvas()?.toDataURL('image/png') || null

      // ── POST to submit-agreement Edge Function (uses service role — bypasses RLS) ──
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-agreement`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            pdf_base64,
            file_name,
            form: {
              first_name:       form.first,
              mi:               form.mi || null,
              last_name:        form.last,
              address:          form.address || null,
              city:             form.city || null,
              state_abbr:       form.state || null,
              zip:              form.zip || null,
              email:            form.email,
              phone:            form.phone || null,
              agreement_type:   form.agreementType,
              consignment_acks: isConsignment ? form.initials : null,
              venmo_handle:     isConsignment ? form.venmo : null,
              print_name:       form.printName,
              signature_data,
            },
          }),
        }
      )

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`)

      setSubmitted(true)
    } catch (err) {
      console.error('Submission error:', err)
      setError(`Submission failed: ${err.message || 'Please try again.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div style={s.successPage}>
        <div style={s.successCard}>
          <div style={s.successCheck}>✓</div>
          <h2 style={s.successHeading}>Agreement Received</h2>
          <p style={s.successBody}>
            Thank you, <strong>{form.first}</strong>. Your participation agreement has been submitted
            and a copy is saved on file.
          </p>
          {isConsignment && (
            <p style={s.successBody}>
              You'll receive an email at <strong>{form.email}</strong> when items sell or approaching
              the 60-day mark.
            </p>
          )}
          <p style={{ ...s.successBody, fontSize: '0.82rem', color: '#aaa', marginTop: '20px' }}>
            Questions? Reach out to Campus Reclaimed directly.
          </p>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <h1 style={s.logo}>Campus Reclaimed</h1>
        <p style={s.subtitle}>Participation Agreement</p>
      </header>

      <div style={s.card}>

        {/* ── Contact Information ── */}
        <section style={s.section}>
          <h3 style={{ ...s.sectionHeading, marginBottom: '20px' }}>Contact Information</h3>

          <div style={s.row}>
            <div style={{ ...s.field, flex: 2 }}>
              <label style={s.label}>First Name *</label>
              <input style={s.input} value={form.first} onChange={e => set('first', e.target.value)} />
            </div>
            <div style={{ ...s.field, flex: 0.55 }}>
              <label style={s.label}>MI</label>
              <input style={s.input} value={form.mi} onChange={e => set('mi', e.target.value)} maxLength={2} />
            </div>
            <div style={{ ...s.field, flex: 2 }}>
              <label style={s.label}>Last Name *</label>
              <input style={s.input} value={form.last} onChange={e => set('last', e.target.value)} />
            </div>
          </div>

          <div style={{ ...s.field, marginBottom: '14px' }}>
            <label style={s.label}>Street Address</label>
            <input style={s.input} value={form.address} onChange={e => set('address', e.target.value)} />
          </div>

          <div style={s.row}>
            <div style={{ ...s.field, flex: 2.5 }}>
              <label style={s.label}>City</label>
              <input style={s.input} value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div style={{ ...s.field, flex: 0.8 }}>
              <label style={s.label}>State</label>
              <input style={s.input} value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} />
            </div>
            <div style={{ ...s.field, flex: 1.2 }}>
              <label style={s.label}>Zip Code</label>
              <input style={s.input} value={form.zip} onChange={e => set('zip', e.target.value)} maxLength={10} />
            </div>
          </div>

          <div style={s.row}>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>Email *</label>
              <input style={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>Phone</label>
              <input style={s.input} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── Agreement Type ── */}
        <section style={s.section}>
          <p style={{ ...s.label, marginBottom: '14px', display: 'block' }}>
            I am contributing items via: *
          </p>
          <div style={s.radioRow}>
            {['consignment', 'donation'].map(type => (
              <label key={type} style={s.radioLabel}>
                <input
                  type="radio"
                  name="agreementType"
                  value={type}
                  checked={form.agreementType === type}
                  onChange={() => set('agreementType', type)}
                  style={s.radio}
                />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>
        </section>

        {/* ── Section 1: Consignment Terms ── */}
        {isConsignment && (
          <section style={s.section}>
            <h3 style={s.sectionHeading}>Section 1 — Consignment Terms</h3>
            <p style={s.sectionNote}>
              Please read each term carefully and enter your initials in the box to the right to acknowledge
              you have read and understood it.
            </p>

            {CONSIGNMENT_TERMS.map(term => (
              <div key={term.id} style={s.termRow}>
                <div style={s.termContent}>
                  <span style={s.bullet}>•</span>
                  <p style={s.termText}>{term.text}</p>
                </div>
                <div style={s.initialsWrap}>
                  <span style={s.initialsLabel}>Initials</span>
                  <input
                    style={s.initialsInput}
                    value={form.initials[term.id]}
                    onChange={e => setInitial(term.id, e.target.value)}
                    maxLength={4}
                    placeholder="___"
                    aria-label={`Initials for: ${term.text}`}
                  />
                </div>
              </div>
            ))}

            {/* Counterfeit disclaimer */}
            <div style={s.disclaimerBox}>
              <p style={s.disclaimerText}>
                <strong>Campus Reclaimed does not accept counterfeit designer goods.</strong> Items that cannot
                be verified by our research or the owner's documentation will not be accepted. If you have any
                doubts about an item's authenticity please do not bring it to Campus Reclaimed. Any consignor
                who repeatedly attempts to consign counterfeit merchandise will have their account terminated.
              </p>
            </div>

            {/* Venmo */}
            <div style={{ ...s.field, marginTop: '8px' }}>
              <label style={s.label}>Venmo Handle *</label>
              <p style={s.fieldNote}>
                Campus Reclaimed releases funds only via Venmo. Please provide the handle you'd like payment sent to.
              </p>
              <input
                style={s.input}
                value={form.venmo}
                onChange={e => set('venmo', e.target.value)}
                placeholder="@yourvenmo"
              />
            </div>
          </section>
        )}

        {/* ── Section 2: Signature ── */}
        {form.agreementType && (
          <section style={s.section}>
            <h3 style={s.sectionHeading}>Section 2 — Agreement</h3>

            <p style={s.agreementStatement}>
              I understand and accept the above conditions.
            </p>

            <div style={s.row}>
              <div style={{ ...s.field, flex: 1.6 }}>
                <label style={s.label}>Print Name *</label>
                <input
                  style={s.input}
                  value={form.printName}
                  onChange={e => set('printName', e.target.value)}
                />
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>Date</label>
                <input style={s.inputReadonly} value={today} readOnly />
              </div>
            </div>

            <div style={{ ...s.field, marginTop: '8px' }}>
              <label style={s.label}>Signature *</label>
              <p style={s.fieldNote}>Sign below using your mouse, finger, or stylus.</p>
              <div style={s.sigWrap}>
                <SignatureCanvas
                  ref={sigRef}
                  penColor={GREEN}
                  canvasProps={{
                    style: { width: '100%', height: '130px', display: 'block' },
                  }}
                />
              </div>
              <button type="button" onClick={() => sigRef.current?.clear()} style={s.clearBtn}>
                Clear Signature
              </button>
            </div>

            {error && <p style={s.errorMsg}>{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...s.submitBtn, opacity: submitting ? 0.65 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Submitting…' : 'Submit Participation Agreement'}
            </button>
          </section>
        )}
      </div>

      <footer style={s.footer}>
        Campus Reclaimed · Sustainable Fashion Forward
      </footer>
    </div>
  )
}
