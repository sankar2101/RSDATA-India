const $ = s => document.querySelector(s);
const loginPanel = $('#loginPanel'), dashboard = $('#dashboard'), status = $('#loginStatus');
async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'Request failed'); return d
}
function money(n, c) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR' }).format(Number(n) || 0) }
function values(form) { return Object.fromEntries(new FormData(form).entries()) }
async function showDashboard() {
    loginPanel.hidden = true; dashboard.hidden = false; await loadQuotes()
}
$('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = 'Signing in…';
    const b = values(e.currentTarget);
    try {
        await api('/api/admin/login', { method: 'POST', body: JSON.stringify(b) });
        e.currentTarget.reset(); await showDashboard()
    } catch (err) { status.textContent = err.message }
});
$('#logout').onclick = async () => {
    await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => { });
    dashboard.hidden = true;
    loginPanel.hidden = false
};
function addItem() {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = '<input name="description" placeholder="Service / product description" required><input name="qty" type="number" min="0.01" step="0.01" value="1" aria-label="Quantity"><input name="rate" type="number" min="0" step="0.01" placeholder="Rate" required aria-label="Rate"><button type="button" class="remove" aria-label="Remove item">×</button>'; $('#items').append(row);
}
$('#addItem').onclick = addItem;
$('#items').addEventListener('click', e => { if (e.target.classList.contains('remove') && $('#items').children.length > 1) e.target.closest('.item-row').remove(); updateTotal() }); $('#items').addEventListener('input', updateTotal); document.querySelector('[name="currency"]').onchange = updateTotal;

function updateTotal() {
    const rows = [...$('#items').children];
    const total = rows.reduce((s, r) => s + (Number(r.querySelector('[name="qty"]').value) || 0) * (Number(r.querySelector('[name="rate"]').value) || 0), 0);
    const tax = total * (Number(document.querySelector('[name="taxPercent"]').value) || 0) / 100; $('#totalPreview').textContent = money(total + tax, document.querySelector('[name="currency"]').value)
}

document.querySelector('[name="taxPercent"]').addEventListener('input', updateTotal);
$('#quoteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const b = values(f); b.items = [...$('#items').children].map(r => ({ description: r.querySelector('[name="description"]').value, qty: r.querySelector('[name="qty"]').value, rate: r.querySelector('[name="rate"]').value }));
    const s = $('#quoteStatus'); s.textContent = 'Generating PDF…';
    try {
        const result = await api('/api/admin/quotes', { method: 'POST', body: JSON.stringify(b) }); s.textContent = `${result.quote.quoteNo} created successfully.`; f.reset(); $('#items').innerHTML = ''; addItem(); document.querySelector('[name="issueDate"]').value = new Date().toISOString().slice(0, 10); updateTotal(); await loadQuotes()
    } catch (err) { s.textContent = err.message }
});

async function loadQuotes() {
    try {
        const d = await api('/api/admin/quotes');
        const q = d.quotes || []; $('#totalCount').textContent = q.length; $('#pendingCount').textContent = q.filter(x => x.status === 'sent').length; $('#signedCount').textContent = q.filter(x => x.status === 'signed').length;
        const box = $('#quoteList'); box.innerHTML = ''; if (!q.length) { box.innerHTML = '<p class="muted">No quotations yet. Create your first quotation.</p>'; return } q.forEach(x => {
            const card = document.createElement('article'); card.className = 'quote-card';
            const top = document.createElement('div'); top.className = 'quote-card-top';
            const info = document.createElement('div');
            const strong = document.createElement('strong'); strong.textContent = x.quoteNo;
            const p = document.createElement('p'); p.textContent = `${x.companyName} · ${x.contactName} · ${x.email}`; info.append(strong, p);
            const badge = document.createElement('span'); badge.className = 'status-pill ' + (x.status === 'signed' ? 'signed' : ''); badge.textContent = x.status; top.append(info, badge);
            const actions = document.createElement('div'); actions.className = 'quote-actions';
            const pdf = document.createElement('a'); pdf.className = 'outline'; pdf.href = `/api/admin/quotes/${x.id}/pdf?type=original`; pdf.target = '_blank'; pdf.textContent = 'Original PDF'; actions.append(pdf); if (x.status === 'signed') {
                const executed = document.createElement('a'); executed.className = 'outline'; executed.href = `/api/admin/quotes/${x.id}/pdf?type=executed`; executed.target = '_blank'; executed.textContent = 'Executed PDF'; actions.append(executed)
            } if (x.status === 'draft' || x.status === 'sent') {
                const send = document.createElement('button'); send.className = 'outline'; send.textContent = x.status === 'sent' ? 'Resend signing link' : 'Email to client'; send.onclick = async () => {
                    send.disabled = true; send.textContent = 'Sending…';
                    try {
                        const out = await api(`/api/admin/quotes/${x.id}/send`, { method: 'POST', body: '{}' }); send.textContent = 'Email sent'; await loadQuotes()
                    } catch (e) {
                        send.disabled = false; send.textContent = 'Email failed'; alert(e.message)
                    }
                }; actions.append(send)
            } card.append(top, actions); box.append(card)
        })
    } catch (e) {
        $('#quoteList').textContent = e.message

    }
}
$('#refresh').onclick = loadQuotes;
(async () => {
    document.querySelector('[name="issueDate"]').value = new Date().toISOString().slice(0, 10);
    try { await api('/api/admin/me'); await showDashboard() } catch { loginPanel.hidden = false; dashboard.hidden = true }
})();
