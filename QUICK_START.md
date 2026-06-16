# Quick Start - QR Cafe Firestore App

## 1. Install packages

```bash
npm install
```

## 2. Configure Firebase

Copy `.env.example` to `.env` and fill in:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

For browser sign-in, also set:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_STORAGE_BUCKET`

Optional starter account:

- `DEFAULT_CAFE_NAME`
- `DEFAULT_CAFE_EMAIL`
- `DEFAULT_CAFE_PASSWORD`

## 3. Start the app

```bash
npm start
```

App runs on `http://localhost:3000`

## Main pages

- `/sign-up` creates a cafe owner account
- `/sign-in` logs into the dashboard
- `/dashboard` shows revenue and recent orders
- `/admin` manages menu items and theme
- `/cashier` manages active orders and waiter calls
- `/tables` manages tables and QR codes
- `/analytics` shows sales insights
- `/menu?cafe_id=...&table=1` is the customer menu

## How data is stored

This project now uses Firestore only.

Main collections:

- `users`
- `cafes`
- `cafes/{cafeId}/members`
- `cafes/{cafeId}/menu_items`
- `cafes/{cafeId}/tables`
- `cafes/{cafeId}/orders`
- `cafes/{cafeId}/waiter_calls`
- cafe root theme fields: `brandColor`, `bgColor`, `surfaceColor`, `textColor`, `fontFamily`, `logoUrl`
- `cafes/{cafeId}/counters/order`

Team members are added under `cafes/{cafeId}/members/{uid}` after the user exists in `users/{uid}`.

## Common issues

### Firebase Admin config error

Check that your server-side Firebase credentials are present in `.env`.

### Firebase client config error

Check that the browser-facing Firebase values are set in `.env`.

### Port 3000 already in use

```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Phone cannot open QR link

Use your computer's local IP instead of `localhost` when testing on another device.
