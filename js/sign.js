const token = location.pathname.split('/').filter(Boolean).pop();
const $ = s => document.querySelector(s);
let quote = null;
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function money(n, c) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR' }).format(Number(n) || 0) }

async function load() {
    try {
        const r = await fetch(`/api/sign/${encodeURIComponent(token)}`);
        const d = await r.json(); if (!r.ok) throw Error(d.message); quote = d.quote;
        const subtotal = quote.items.reduce((s, x) => s + Number(x.qty) * Number(x.rate), 0), tax = subtotal * Number(quote.taxPercent || 0) / 100;
        $('#quoteContent').innerHTML = `<div class="quote-preview"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>${esc(quote.quoteNo)}</strong><span>${esc(quote.issueDate)} · Valid until ${esc(quote.validUntil || 'Not specified')}</span></div><h2>${esc(quote.subject)}</h2><p><b>Prepared for:</b> ${esc(quote.companyName)}<br>${esc(quote.contactName)}</p><div class="line head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>${quote.items.map(x => `<div class="line"><span>${esc(x.description)}</span><span>${esc(x.qty)}</span><span>${money(x.rate, quote.currency)}</span><span>${money(x.qty * x.rate, quote.currency)}</span></div>`).join('')}<p style="text-align:right"><b>Subtotal:</b> ${money(subtotal, quote.currency)}<br>${quote.taxPercent ? `<b>Tax (${esc(quote.taxPercent)}%):</b> ${money(tax, quote.currency)}<br>` : ''}<strong style="font-size:20px;color:#092d61">Total: ${money(subtotal + tax, quote.currency)}</strong></p><h3>Scope / Deliverables</h3><p>${esc(quote.scope || 'As agreed between the parties.').replace(/\n/g, '<br>')}</p><h3>Payment Terms</h3><p>${esc(quote.paymentTerms || 'To be confirmed.').replace(/\n/g, '<br>')}</p>${quote.notes ? `<h3>Additional Notes</h3><p>${esc(quote.notes).replace(/\n/g, '<br>')}</p>` : ''}</div>`; if (quote.status === 'signed') { $('#completed').hidden = false; $('#completed').textContent = `This quotation was already signed on ${new Date(quote.signedAt).toLocaleString()}. Thank you.`; } else if (quote.status === 'draft') {
            $('#completed').hidden = false; $('#completed').textContent = 'This quotation is not yet open for signature. Please contact the company.';

        } else { $('#signArea').hidden = false; setupCanvas() }
    } catch (e) { $('#quoteContent').textContent = e.message }
}
let ctx, canvas, drawing = false, hasInk = false;
function setupCanvas() {
    canvas = $('#signature'); ctx = canvas.getContext('2d'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#10284d';
    const pos = e => {
        const r = canvas.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height }
    };
    const start = e => {
        e.preventDefault(); drawing = true;
        const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y)
    };
    const move = e => {
        if (!drawing) return; e.preventDefault();
        const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true
    };
    const end = () => drawing = false; canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move); window.addEventListener('pointerup', end); $('#clearSig').onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false };
}
$('#submitSign').onclick = async () => {
    const status = $('#signStatus');
    if (!$('#signerName').value.trim() || !hasInk || !$('#consent').checked) {
        status.textContent = 'Enter your name, draw your signature, and confirm the acceptance checkbox.';
        return
    }
    const btn = $('#submitSign'); btn.disabled = true; status.textContent = 'Submitting your signed quotation…';
    try {
        const r = await fetch(`/api/sign/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signerName: $('#signerName').value, signature: canvas.toDataURL('image/png'), consent: $('#consent').checked }) });
        const d = await r.json(); if (!r.ok) throw Error(d.message); $('#signArea').hidden = true; $('#completed').hidden = false; $('#completed').textContent = 'Thank you. Your signed quotation has been recorded. A fully executed PDF will be sent to your email address.';
    } catch (e) { status.textContent = e.message; btn.disabled = false }
};
load();
