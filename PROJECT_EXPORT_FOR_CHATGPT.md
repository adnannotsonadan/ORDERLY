# Project Export For ChatGPT

## Project

QR Cafe Firestore App

A QR-based cafe ordering app where customers scan a table QR code, browse a menu, place orders, and call a waiter. Cafe owners can sign up, sign in, manage menu items, manage tables, customize theme settings, monitor orders, and view analytics.

## Tech Stack

- Backend: Node.js, Express
- Frontend: HTML, CSS, vanilla JavaScript
- Auth: Firebase Authentication
- Database: Cloud Firestore
- QR generation: `qrcode`

## Main App Flow

1. A cafe owner signs up or signs in.
2. The owner creates or manages tables and menu items.
3. A customer scans a QR code assigned to a table.
4. The customer opens `/menu?cafe_id=...&table=1`.
5. The customer places an order or calls a waiter.
6. The cashier/admin views active orders and analytics.

## Backend Structure

- `backend/server.js`: starts the Express server, mounts routes, serves frontend pages
- `backend/firebase.js`: initializes Firebase Admin and exposes public Firebase config
- `backend/firebase-store.js`: Firestore data access layer
- `backend/middleware/firebaseAuth.js`: auth/session middleware and route protection

## API Endpoints

- `GET/POST/PUT/DELETE /api/menu`
- `POST/GET/PUT/DELETE /api/orders`
- `GET/POST/PUT/DELETE /api/tables`
- `GET /api/analytics`
- `GET/POST/DELETE /api/theme`
- `POST/GET/DELETE /api/waiter`
- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/session`
- `POST /api/auth/logout`

## Frontend Pages

- `/sign-up`: owner registration
- `/sign-in`: owner login
- `/dashboard`: summary dashboard
- `/admin`: menu and theme management
- `/cashier`: active orders and waiter calls
- `/tables`: table setup and QR generation
- `/analytics`: sales insights
- `/menu?cafe_id=...&table=1`: customer menu page
- `/scan`: local QR testing page

## Firestore Data Model

Top-level collection:

- `cafes/{cafeId}`

Nested collections/documents:

- `users/{uid}`
- `cafes/{cafeId}/menu_items`
- `cafes/{cafeId}/tables`
- `cafes/{cafeId}/orders`
- `cafes/{cafeId}/waiter_calls`
- `cafes/{cafeId}/members`
- cafe root theme fields: `brandColor`, `bgColor`, `surfaceColor`, `textColor`, `fontFamily`, `logoUrl`
- `cafes/{cafeId}/counters/order`

## Important Files

- `README.md`: project overview and setup
- `QUICK_START.md`: setup and local run instructions
- `FIRESTORE_STRUCTURE.md`: Firestore structure notes
- `public/menu.html`: customer ordering UI
- `public/admin.html`: cafe owner admin UI
- `public/cashier.html`: cashier workflow UI
- `public/dashboard.html`: dashboard UI

## Run Instructions

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Fill in Firebase server and browser configuration values
4. Start the app with `npm start`
5. Open `http://localhost:3000`

## Environment Variables Needed

Server-side Firebase:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Browser Firebase:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_STORAGE_BUCKET`

Optional defaults:

- `DEFAULT_CAFE_NAME`
- `DEFAULT_CAFE_EMAIL`
- `DEFAULT_CAFE_PASSWORD`

## Current Notes

- This project uses Firestore only.
- Older PostgreSQL-related setup has been removed.
- The cashier page currently refreshes on a timer instead of using real-time Firestore listeners.

## Package Metadata

- Package name: `qr-cafe-menu`
- Version: `1.0.0`
- Entry point: `backend/server.js`

## Safe Export Note

This export intentionally excludes secret values from `.env` and includes only project structure, setup details, and architecture.
