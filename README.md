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
