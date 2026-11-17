'use strict';
require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const QUOTES_DIR = path.join(DATA_DIR, 'quotes');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const sessions = new Map();
const loginAttempts = new Map();
const MAX_BODY = 2 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf' };
fs.mkdirSync(QUOTES_DIR, { recursive: true });

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); }
function clean(v, n = 300) {
    return String(v ?? '').trim().slice(0, n);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = ''; req.on('data', c => { raw += c; if (Buffer.byteLength(raw) > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); } }); req.on('end', () => {
            try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); }
        }); req.on('error', reject);
    });
}
function readQuotes() {
    try {
        return JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
    } catch {
        return [];

    }
}
function writeQuotes(q) {
    const tmp = QUOTES_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(q, null, 2), { mode: 0o600 }); fs.renameSync(tmp, QUOTES_FILE);
}
function cookie(req, name) {
    const c = String(req.headers.cookie || '').split(';').map(x => x.trim());
    const p = c.find(x => x.startsWith(name + '=')); return p ? decodeURIComponent(p.slice(name.length + 1)) : '';
}
function setSession(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''; res.setHeader('Set-Cookie', `rsda_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
}
function clearSession(res) {
    res.setHeader('Set-Cookie', 'rsda_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}
function admin(req) {
    const token = cookie(req, 'rsda_session');
    const s = sessions.get(token); if (!s || s.expires < Date.now()) {
        if (token) sessions.delete(token);
        return null;
    } return s;
}
function requireAdmin(req, res) { if (!admin(req)) { json(res, 401, { ok: false, message: 'Please sign in again.' }); return false; } return true; }
function safeEqual(a, b) {
    const aa = Buffer.from(String(a));
    const bb = Buffer.from(String(b)); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function mailer() { if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null; return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }); }
function money(v, c) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: c || 'INR', maximumFractionDigits: 2 }).format(Number(v) || 0); }
function quotePdf(q, signed = false) {
    return new Promise((resolve, reject) => {
        const filename = path.join(QUOTES_DIR, `${q.id}-${signed ? 'executed' : 'original'}.pdf`);
        const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
        const out = fs.createWriteStream(filename);
        doc.pipe(out); doc.rect(0, 0, 595, 105).fill('#092d61');
        doc.fillColor('#ffffff').fontSize(19).font('Helvetica-Bold').text('RS DATA ARCHITECT SOLUTIONS', 48, 34);
        doc.fontSize(9).font('Helvetica').text('SOFTWARE DEVELOPMENT SOLUTIONS & SERVICES', 48, 61);
        doc.fillColor('#f58220').fontSize(10).text('QUOTATION', 440, 40, { align: 'right' });
        doc.moveDown(4);
        doc.fillColor('#10284d').fontSize(20).font('Helvetica-Bold').text('Quotation', 48, 130);
        doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Quote No: ${q.quoteNo}     Issue Date: ${q.issueDate}     Valid Until: ${q.validUntil}`, 48, 160);
        doc.fillColor('#10284d').fontSize(11).font('Helvetica-Bold').text('Prepared for', 48, 192);
        doc.font('Helvetica').fontSize(10).fillColor('#333').text(`${q.companyName}\n${q.contactName}\n${q.email}\n${q.address || ''}`, 48, 210, { width: 245 });
        doc.fillColor('#10284d').font('Helvetica-Bold').text('Project / Subject', 330, 192);
        doc.font('Helvetica').fontSize(10).fillColor('#333').text(q.subject, 330, 210, { width: 210 }); let y = 286;
        doc.fillColor('#092d61').rect(48, y, 499, 25).fill();
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9).text('DESCRIPTION', 56, y + 8);
        doc.text('QTY', 340, y + 8, { width: 40, align: 'right' });
        doc.text('RATE', 390, y + 8, { width: 70, align: 'right' });
        doc.text('AMOUNT', 470, y + 8, { width: 68, align: 'right' }); y += 31;
        doc.fillColor('#333').font('Helvetica').fontSize(9); (q.items || []).forEach((it, i) => {
            const desc = String(it.description || '').slice(0, 180);
            doc.text(desc, 56, y, { width: 260 });
            doc.text(String(it.qty), 340, y, { width: 40, align: 'right' });
            doc.text(money(it.rate, q.currency), 390, y, { width: 70, align: 'right' });
            doc.text(money(Number(it.qty) * Number(it.rate), q.currency), 470, y, { width: 68, align: 'right' }); y += Math.max(23, doc.heightOfString(desc, { width: 260 }) + 10); if (y > 650) { doc.addPage(); y = 60; }
        }); y += 10;
        const subtotal = (q.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
        const tax = subtotal * (Number(q.taxPercent) || 0) / 100; doc.moveTo(330, y).lineTo(547, y).strokeColor('#d9e0e9').stroke(); y += 12; doc.font('Helvetica').fontSize(10).fillColor('#555').text('Subtotal', 350, y); doc.text(money(subtotal, q.currency), 460, y, { width: 87, align: 'right' }); y += 19; if (Number(q.taxPercent)) { doc.text(`Tax (${q.taxPercent}%)`, 350, y); doc.text(money(tax, q.currency), 460, y, { width: 87, align: 'right' }); y += 19; } doc.font('Helvetica-Bold').fillColor('#092d61').fontSize(12).text('Total', 350, y);
        doc.text(money(subtotal + tax, q.currency), 460, y, { width: 87, align: 'right' }); y += 35;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#10284d').text('Scope / Deliverables', 48, y); y += 16;
        doc.font('Helvetica').fontSize(9).fillColor('#333').text(q.scope || 'As agreed between the parties.', 48, y, { width: 499 }); y += Math.max(35, doc.heightOfString(q.scope || 'As agreed between the parties.', { width: 499 }) + 16);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#10284d').text('Payment Terms', 48, y); y += 16; doc.font('Helvetica').fontSize(9).fillColor('#333').text(q.paymentTerms || 'Payment terms to be confirmed.', 48, y, { width: 499 }); y += Math.max(35, doc.heightOfString(q.paymentTerms || 'Payment terms to be confirmed.', { width: 499 }) + 16); if (q.notes) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#10284d').text('Additional Notes', 48, y); y += 15;
            doc.font('Helvetica').fontSize(9).fillColor('#333').text(q.notes, 48, y, { width: 499 }); y += doc.heightOfString(q.notes, { width: 499 }) + 18;
        }
        if (signed && q.signatureFile && fs.existsSync(q.signatureFile)) {
            y = Math.min(Math.max(y + 20, 650), 700);
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#10284d').text('Accepted and electronically signed by', 48, y);
            doc.image(q.signatureFile, 48, y + 18, { fit: [180, 55] });
            doc.font('Helvetica').fontSize(9).fillColor('#333').text(`${q.signedName || q.contactName}\nSigned on: ${q.signedAt}\nSigning record: ${q.id}`, 260, y + 23, { width: 280 });
        }
        doc.moveTo(48, 760).lineTo(547, 760).strokeColor('#d9e0e9').stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#68758a').text('No. 14 D, C Colony, 8th Street, Perumalpuram, Tirunelveli, Tamil Nadu 627007, India  |  +91 79045 72080', 48, 770, { width: 499, align: 'center' }); doc.end(); out.on('finish', () => resolve(filename)); out.on('error', reject);
    });
}
async function sendQuoteEmail(q) {
    const transport = mailer(); if (!transport) throw new Error('Email is not configured. Add SMTP settings to .env before sending.');
    const link = `${process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`}/sign/${q.signToken}`;
    const pdf = q.originalPdf && fs.existsSync(q.originalPdf) ? q.originalPdf : await quotePdf(q, false);
    q.originalPdf = pdf; await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER, to:
            q.email, subject: `Quotation ${q.quoteNo} – RS Data Architect Solutions`, text: `Dear ${q.contactName},\n\nPlease review quotation ${q.quoteNo} and use the secure link below to accept and sign:\n${link}\n\nThe quotation PDF is attached for your reference.\n\nRegards,\nRS Data Architect Solutions`, attachments: [{ filename: `${q.quoteNo}.pdf`, path: pdf }]
    }); q.status = 'sent'; q.sentAt = new Date().toISOString(); return link;
}
async function handleApi(req, res, url) {
    const p = url.pathname;
    if (p === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'RS Data Architect Solutions' });
    if (p === '/api/contact' && req.method === 'POST') {
        let b; try {
            b = await readBody(req);
        } catch (e) {
            return json(res, 400, { ok: false, message: e.message });
        } if (b.website) return json(res, 200, { ok: true });
        const item = { id: crypto.randomUUID(), submittedAt: new Date().toISOString(), name: clean(b.name, 100), email: clean(b.email, 160), company: clean(b.company, 120), service: clean(b.service, 100), message: clean(b.message, 2000) }; if (item.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) || item.message.length < 10) return json(res, 400, { ok: false, message: 'Please enter valid contact details and a message.' });
        const all = (() => { try { return JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf8')); } catch { return []; } })(); all.push(item); fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(all, null, 2), { mode: 0o600 }); return json(res, 201, { ok: true, message: 'Thank you. Your enquiry has been received.' });
    }
    if (p === '/api/admin/login' && req.method === 'POST') {
        let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { ok: false, message: e.message }); }
        const ip = req.socket.remoteAddress || 'unknown';
        const a = loginAttempts.get(ip) || { count: 0, until: 0 }; if (a.until > Date.now()) return json(res, 429, { ok: false, message: 'Too many attempts. Please try again later.' });
        const user = process.env.ADMIN_USER;
        const pass = process.env.ADMIN_PASSWORD; if (!user || !pass) return json(res, 503, { ok: false, message: 'Admin credentials are not configured. Set ADMIN_USER and ADMIN_PASSWORD in .env.' }); if (!safeEqual(clean(b.userId, 100), user) || !safeEqual(String(b.password || ''), pass)) { a.count++; if (a.count >= 5) { a.count = 0; a.until = Date.now() + 15 * 60 * 1000; } loginAttempts.set(ip, a); return json(res, 401, { ok: false, message: 'Incorrect User ID or password.' }); } loginAttempts.delete(ip);
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { expires: Date.now() + 8 * 60 * 60 * 1000 }); setSession(res, token); return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') { sessions.delete(cookie(req, 'rsda_session')); clearSession(res); return json(res, 200, { ok: true }); }
    if (p === '/api/admin/me' && req.method === 'GET') return admin(req) ? json(res, 200, { ok: true }) : json(res, 401, { ok: false });
    if (p.startsWith('/api/admin/')) {
        if (!requireAdmin(req, res)) return;
        if (p === '/api/admin/quotes' && req.method === 'GET') return json(res, 200, { ok: true, quotes: readQuotes().map(({ signToken, ...q }) => ({ ...q, originalPdf: undefined, executedPdf: undefined, signatureFile: undefined })) });
        if (p === '/api/admin/quotes' && req.method === 'POST') {
            let b; try {
                b = await readBody(req);

            } catch (e) { return json(res, 400, { ok: false, message: e.message }); }
            const items = Array.isArray(b.items) ? b.items.slice(0, 30).map(x => ({ description: clean(x.description, 300), qty: Math.max(0, Number(x.qty) || 0), rate: Math.max(0, Number(x.rate) || 0) })).filter(x => x.description && x.qty > 0) : [];
            if (!clean(b.companyName, 160) || !clean(b.contactName, 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(b.email, 160)) || !items.length) return json(res, 400, { ok: false, message: 'Company, contact, valid email, and at least one line item are required.' });
            const quotes = readQuotes();
            const id = crypto.randomUUID();
            const q = { id, quoteNo: clean(b.quoteNo, 40) || `RSDA-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(4, '0')}`, companyName: clean(b.companyName, 160), contactName: clean(b.contactName, 120), email: clean(b.email, 160), address: clean(b.address, 500), subject: clean(b.subject, 200) || 'Software Development Services', issueDate: clean(b.issueDate, 20) || new Date().toISOString().slice(0, 10), validUntil: clean(b.validUntil, 20), currency: ['INR', 'USD'].includes(b.currency) ? b.currency : 'INR', taxPercent: Math.max(0, Math.min(100, Number(b.taxPercent) || 0)), items, scope: clean(b.scope, 3000), paymentTerms: clean(b.paymentTerms, 2000), notes: clean(b.notes, 2000), status: 'draft', createdAt: new Date().toISOString(), signToken: crypto.randomBytes(32).toString('hex'), signedAt: null }; q.originalPdf = await quotePdf(q, false);
            quotes.unshift(q); writeQuotes(quotes); return json(res, 201, { ok: true, quote: { id: q.id, quoteNo: q.quoteNo, status: q.status } });
        }
        const sendMatch = p.match(/^\/api\/admin\/quotes\/([\w-]+)\/send$/); if (sendMatch && req.method === 'POST') {
            const quotes = readQuotes();
            const q = quotes.find(x => x.id === sendMatch[1]);
            if (!q) return json(res, 404, { ok: false, message: 'Quote not found.' });
            try {
                const link = await sendQuoteEmail(q); writeQuotes(quotes);
                return json(res, 200, { ok: true, message: 'Quotation email sent.', link });
            } catch (e) {
                return json(res, 503, { ok: false, message: e.message });
            }
        }
        const pdfMatch = p.match(/^\/api\/admin\/quotes\/([\w-]+)\/pdf$/);
        if (pdfMatch && req.method === 'GET') {
            const q = readQuotes().find(x => x.id === pdfMatch[1]);
            if (!q) return json(res, 404, { ok: false, message: 'Quote not found.' });
            const file = url.searchParams.get('type') === 'executed' ? q.executedPdf : q.originalPdf;
            if (!file || !fs.existsSync(file)) return json(res, 404, { ok: false, message: 'PDF not available.' });
            res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${q.quoteNo}.pdf"`, 'Cache-Control': 'no-store' }); return fs.createReadStream(file).pipe(res);
        }
        return json(res, 404, { ok: false, message: 'Admin endpoint not found.' });
    }
    if (p.startsWith('/api/sign/')) {
        const token = p.split('/').pop();
        const quotes = readQuotes();
        const q = quotes.find(x => x.signToken === token);
        if (!q) return json(res, 404, { ok: false, message: 'This signing link is invalid or expired.' });
        if (req.method === 'GET') return json(res, 200, {
            ok: true, quote: { quoteNo: q.quoteNo, companyName: q.companyName, contactName: q.contactName, subject: q.subject, issueDate: q.issueDate, validUntil: q.validUntil, currency: q.currency, taxPercent: q.taxPercent, items: q.items, scope: q.scope, paymentTerms: q.paymentTerms, notes: q.notes, status: q.status, signedAt: q.signedAt }
        });
        if (req.method === 'POST') {
            if (q.status === 'signed') return json(res, 409, { ok: false, message: 'This quotation has already been signed.' });
            if (q.status !== 'sent') return json(res, 403, { ok: false, message: 'This quotation is not currently open for signature.' });
            if (q.validUntil && q.validUntil < new Date().toISOString().slice(0, 10)) return json(res, 410, { ok: false, message: 'This quotation has expired. Please contact the company for an updated copy.' });
            let b; try {
                b = await readBody(req);
            } catch (e) { return json(res, 400, { ok: false, message: e.message }); }
            const sig = String(b.signature || ''); if (!b.consent || !clean(b.signerName, 120) || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 300000) return json(res, 400, { ok: false, message: 'Please enter your name, draw your signature, and confirm acceptance.' });
            const png = Buffer.from(sig.split(',')[1], 'base64'); if (png.length > 180000) return json(res, 400, { ok: false, message: 'Signature image is too large.' });
            q.signatureFile = path.join(QUOTES_DIR, `${q.id}-signature.png`);
            fs.writeFileSync(q.signatureFile, png, { mode: 0o600 });
            q.signedName = clean(b.signerName, 120);
            q.signedAt = new Date().toISOString();
            q.signerIp = req.socket.remoteAddress || 'unknown';
            q.consentText = 'I confirm that I am authorised to sign and agree to the quotation terms displayed.';
            q.status = 'signed';
            q.executedPdf = await quotePdf(q, true); writeQuotes(quotes);
            const transport = mailer(); if (transport) {
                const attachments = [{ filename: `${q.quoteNo}-executed.pdf`, path: q.executedPdf }];
                const mail = { from: process.env.MAIL_FROM || process.env.SMTP_USER, to: q.email, subject: `Fully executed quotation ${q.quoteNo}`, text: `Dear ${q.contactName},\n\nThank you. The signed quotation is attached for your records.\n\nRegards,\nRS Data Architect Solutions`, attachments };
                await transport.sendMail(mail); if (process.env.ADMIN_NOTIFICATION_EMAIL) await transport.sendMail({ ...mail, to: process.env.ADMIN_NOTIFICATION_EMAIL, subject: `Client signed quotation ${q.quoteNo}`, text: `${q.companyName} has signed quotation ${q.quoteNo}. The executed PDF is attached.` });
            } return json(res, 200, { ok: true, message: 'Thank you. Your signed quotation has been recorded.' });
        } return json(res, 405, { ok: false, message: 'Method not allowed.' });
    }
    return null;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
        if (url.pathname.startsWith('/api/')) {
            const handled = await handleApi(req, res, url);
            if (handled !== null) return;
            return json(res, 404, { ok: false, message: 'Not found' });
        } let pathname = decodeURIComponent(url.pathname);
        if (pathname.startsWith('/sign/')) pathname = '/Admin/sign.html';
        if (pathname === '/admin' || pathname === '/admin/') pathname = '/Admin/admin.html';
        if (pathname === '/') pathname = '/client/index.html';
        if (pathname === '/index.html') pathname = '/client/index.html';
        if (pathname === '/admin.html') pathname = '/Admin/admin.html';
        if (pathname === '/sign.html') pathname = '/Admin/sign.html';
        if (pathname === '/styles.css') pathname = '/css/style.css';
        if (pathname === '/admin.css') pathname = '/css/admin.css';
        if (pathname === '/script.js') pathname = '/js/main.js';
        if (pathname === '/admin.js') pathname = '/js/admin.js';
        if (pathname === '/sign.js') pathname = '/js/sign.js';
        const target = path.resolve(PUBLIC_DIR, '.' + pathname);
        if (!target.startsWith(PUBLIC_DIR + path.sep) || !['Admin', 'client', 'css', 'js', 'assets'].includes(pathname.split('/')[1])) return json(res, 403, { ok: false });
        fs.stat(target, (err, stat) => {
            if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': pathname.includes('admin') || pathname.includes('sign') ? 'no-store' : 'public, max-age=3600' });
            if (req.method === 'HEAD') return res.end(); fs.createReadStream(target).pipe(res);
        });
    } catch (e) {
        console.error(e);
        if (!res.headersSent) json(res, 500, { ok: false, message: 'An unexpected server error occurred.' });
        else res.end();
    }
});
server.listen(PORT, () => console.log(`\nRS Data Architect Solutions: http://localhost:${PORT}\nAdmin: http://localhost:${PORT}/admin\n`));
