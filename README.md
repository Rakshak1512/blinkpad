# BlinkPad – Ephemeral 24h Text, Screenshot & File Sharing Platform

> A production-ready, privacy-first temporary sharing Progressive Web App (PWA) with Google Firebase Firestore database integration, strict 24-hour cloud expiration, full offline IndexedDB draft editing, automated sync, instant screenshot pasting, and optional password protection.

---

## 🌟 Key Features & Architecture

- **BlinkPad Brand Identity**: Official glowing 24h notepad and pencil emblem with deep navy (`#0B091B`) and vibrant purple theme, default dark mode.
- **Firebase Firestore Database**: Secure cloud database integration for page manifests, text contents, and metadata.
- **Strict 24-Hour Expiration Ceiling**: Every cloud pad expires exactly 24 hours after creation. Editing, uploading, or offline syncing cannot extend the 24-hour ceiling.
- **IST Timestamp Formatting**: Timestamps are stored as Unix millisecond integers in Firestore and formatted consistently in `Asia/Kolkata` (IST) as `D Month YYYY, hh:mm:ss AM/PM` (e.g. `4 November 2026, 11:53:47 PM`).
- **Prompted on Every Reopen**: If a password is set, closing the tab, reopening, or refreshing (<kbd>F5</kbd>) strictly prompts for the password every time without storing tokens in persistent browser storage.
- **Installable Progressive Web App (PWA)**: Full support for installation on Android, iOS (Add to Home Screen), Windows, macOS, and Chrome/Edge/Safari with dedicated Web App Manifest and Service Worker (`sw.js`).
- **Complete Offline Functionality (IndexedDB)**: Create new pads and edit existing notes without internet connectivity. Changes are preserved through browser reloads or restarts.
- **All-in-One Pad Interface**: Text notes, drag & drop uploads, Ctrl+V screenshot paste, and direct streaming downloads all on a single unified view.

---

## 🚀 Running Locally

### 1. Backend Setup (Port 8787)
```bash
cd backend
npm install
# Copy environment example and configure your Firebase credentials
cp .env.example .env
# Start the backend server
npm start
```
The backend API server will run at `http://localhost:8787`.

### 2. Frontend Setup (Port 5173)
```bash
cd frontend
npm install
# Copy environment example
cp .env.example .env
# Start the Vite development server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing

```bash
# Run backend test suite
cd backend
npm test

# Run frontend production build
cd ../frontend
npm run build
```

---

## 🔒 Security & Privacy

- **No Secrets in Repository**: Service account keys, `.env` files, and local binaries are strictly ignored by `.gitignore`.
- **Ephemeral Authentication**: Session tokens for password-protected pads are stored in-memory only and wiped on tab close or page refresh.

---

## ☁️ Vercel Deployment (Exactly Two Projects)

This repository is a monorepo. Import the same GitHub repository into Vercel **twice** so the frontend and backend are two separate Vercel projects:

### 1. Backend project
- Repository: `Rakshak1512/blinkpad`
- Root Directory: `backend`
- Framework Preset: Express (Vercel should detect the exported Express app in `src/server.ts`)
- Install Command: `npm install`
- Add these Environment Variables in Vercel:
  - `APP_NAME=BlinkPad`
  - `APP_ENV=production`
  - `AUTH_SECRET`: a random secret of at least 32 characters
  - `FIREBASE_PROJECT_ID`: your Firebase project ID
  - `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON as one environment-variable value
  - `APP_BASE_URL`: the deployed frontend URL
  - `BACKEND_URL`: the deployed backend URL

Do not upload the service-account JSON file to GitHub or expose it in any `VITE_*` variable.

### 2. Frontend project
- Import the same repository again.
- Root Directory: `frontend`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Add:
  - `VITE_APP_NAME=BlinkPad`
  - `VITE_API_BASE_URL=https://YOUR-BACKEND-VERCEL-DOMAIN/api`

Replace the backend domain with the actual production URL shown by your backend Vercel project, then redeploy the frontend.

Both Vercel projects deploy from the same Git repository and automatically receive new commits. They are still only two hosting projects: Frontend and Backend. Firebase remains the database.

### Firebase date/time fields
Firestore keeps the numeric millisecond fields `created_at`, `expires_at`, and `updated_at` unchanged because the 24-hour expiry checks depend on them. New writes also include readable IST companion fields:
- `created_at_ist`
- `expires_at_ist`
- `updated_at_ist`
- File-level `uploaded_at_ist` and `expires_at_ist`

The companion values use `D Month YYYY, hh:mm:ss AM/PM` in `Asia/Kolkata`. To add these readable fields to documents that already exist, run the one-time backfill from the `backend` folder after setting `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_SERVICE_ACCOUNT_PATH`):

```bash
npm install
npm run backfill:ist
```

### Important file-upload limitation before production
The current Firebase adapter saves file bytes to a local `uploads/` directory while Firestore stores the file metadata. Vercel Functions do not provide durable local file storage across invocations or instances. Therefore, **file uploads/downloads are not production-durable on Vercel yet**. Configure a persistent object-storage provider before relying on attachments in production. Firestore metadata and text pages are separate from the binary-file storage requirement.
