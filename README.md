# RS Data Architect Solutions — V5

Organised folder-structure release based on the supplied V4 project. The existing website, admin quotation workflow, PDF generation, email integration, and customer signing page have been retained while the frontend files are separated into dedicated folders.

## Folder structure

```text
RS-Data-Architect/
├── Admin/              # Admin dashboard and client signing page
├── client/             # Public company website
├── css/                # Public and admin stylesheets
├── js/                 # Frontend JavaScript
├── assets/             # Approved logo and favicon
├── config/             # Reserved for configuration modules
├── data/               # Runtime quote and enquiry data (not committed)
├── server.js           # Node.js HTTP server and API
├── package.json
├── package-lock.json
├── .env.example
└── .gitignore
```

## Requirements

- Node.js 20 or later
- npm
- SMTP account details if you want the application to email quotations and executed PDFs

## Run locally on Windows PowerShell

1. Extract the ZIP.
2. Open PowerShell in the extracted `rs-data-architect-website` folder (the folder containing `package.json`).
3. Install dependencies:

   ```powershell
   npm install
   ```

4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and set a unique `ADMIN_USER` and a strong `ADMIN_PASSWORD`. Do not share or commit `.env`.
6. For email delivery, configure the SMTP fields and `PUBLIC_BASE_URL` in `.env`. For local testing, `PUBLIC_BASE_URL=http://localhost:3000` is suitable, but customers cannot access your computer's localhost link.
7. Start the app:

   ```powershell
   npm start
   ```

8. Open the public website at `http://localhost:3000` and the admin portal at `http://localhost:3000/admin`.

## Important URLs

- Public website: `/`
- Admin portal: `/admin`
- Customer signing route: `/sign/<secure-token>` (generated when a quote is sent)
- Health check: `/api/health`

## Data and security notes

- Quote records and generated PDFs are stored under `data/quotes/` at runtime. Enquiry records are stored in `data/inquiries.json`.
- `data/` and `.env` are excluded from Git by `.gitignore`.
- Back up the `data/` folder securely. Do not publish customer details, signatures, PDFs, SMTP credentials, or admin passwords in a public repository.
- The built-in signing page records a drawn signature and acceptance details. It is not represented as a qualified/certified e-signature service. Have the process reviewed for the laws and customer requirements applicable to your transactions before production use.
- Before public deployment, use HTTPS, a production domain in `PUBLIC_BASE_URL`, secure SMTP credentials, backups, and appropriate access/security review.

## V5 organisation changes

- `public/index.html` moved to `client/index.html`.
- `public/admin.html` and `public/sign.html` moved to `Admin/`.
- CSS moved to `css/`; JavaScript moved to `js/`.
- Logo and favicon moved to `assets/`.
- `server.js` static routing was updated to serve the new locations while preserving `/`, `/admin`, and `/sign/<token>` URLs.
