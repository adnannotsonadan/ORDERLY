import config from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapDefaultCafe } from './firebase-store.js';
import { authSessionMiddleware, requireAuth } from './middleware/firebaseAuth.js';
import authRouter from './routes/auth.js';
import menuRouter from './routes/menu.js';
import ordersRouter from './routes/orders.js';
import tablesRouter from './routes/tables.js';
import analyticsRouter from './routes/analytics.js';
import themeRouter from './routes/theme.js';
import waiterRouter from './routes/waiter.js';
import firebaseConfigRouter from './routes/firebase-config.js';

config.config('./.env');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
console.log("port: "+process.env.PORT);
const defaultCafe = await bootstrapDefaultCafe();
app.locals.defaultCafeId = defaultCafe.cafeId;
app.locals.defaultCafeName = defaultCafe.cafeName;
app.locals.defaultCafeEmail = defaultCafe.email;

// console.log("env: "+JSON.stringify(process.env));

app.use(express.json());
app.use(authSessionMiddleware);
app.use('/vendor/firebase', express.static(path.join(__dirname, 'node_modules', 'firebase')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/firebase', firebaseConfigRouter);
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/theme', themeRouter);
app.use('/api/waiter', waiterRouter);

app.get('/sign-in', (req, res) => {
  if (req.session.cafeId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'sign-in.html'));
});

app.get('/login', (req, res) => {
  res.redirect('/sign-in');
});

app.get('/sign-up', (req, res) => {
  if (req.session.cafeId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'sign-up.html'));
});

app.get('/signup', (req, res) => {
  res.redirect('/sign-up');
});

app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scan.html'));
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/cashier', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
});

app.get('/tables', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tables.html'));
});

app.get('/analytics', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

app.get('/', (req, res) => {
  if (req.session.cafeId) return res.redirect('/dashboard');
  res.redirect('/sign-in');
});

app.listen(PORT, () => {
  console.log(`QR Cafe SaaS is running on http://localhost:${PORT}`);
  if (app.locals.defaultCafeEmail) {
    console.log(`Default Firebase cafe: ${app.locals.defaultCafeName} (${app.locals.defaultCafeEmail})`);
  }
});

export default app;
