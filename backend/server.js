import config from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapDefaultCafe } from './firebase-store.js';
import { authSessionMiddleware, requireAuth, requireRoles } from './middleware/firebaseAuth.js';
import authRouter from './routes/auth.js';
import menuRouter from './routes/menu.js';
import ordersRouter from './routes/orders.js';
import tablesRouter from './routes/tables.js';
import analyticsRouter from './routes/analytics.js';
import themeRouter from './routes/theme.js';
import waiterRouter from './routes/waiter.js';
import teamRouter from './routes/team.js';
import firebaseConfigRouter from './routes/firebase-config.js';
import customersRouter from './routes/customers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const firebaseSdkDir = path.join(rootDir, 'node_modules', 'firebase');

config.config({ path: path.join(rootDir, '.env') });
config.config({ path: path.join(rootDir, '.env.local'), override: true });

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
app.use('/vendor/firebase', express.static(firebaseSdkDir));
app.use(express.static(publicDir));

app.use('/api/firebase', firebaseConfigRouter);
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/theme', themeRouter);
app.use('/api/waiter', waiterRouter);
app.use('/api/team', teamRouter);
app.use('/api/customers', customersRouter);

app.get('/sign-in', (req, res) => {
  if (req.session.cafeId) return res.redirect('/dashboard');
  res.sendFile(path.join(publicDir, 'sign-in.html'));
});

app.get('/login', (req, res) => {
  res.redirect('/sign-in');
});

app.get('/sign-up', (req, res) => {
  if (req.session.cafeId) return res.redirect('/dashboard');
  res.sendFile(path.join(publicDir, 'sign-up.html'));
});

app.get('/signup', (req, res) => {
  res.redirect('/sign-up');
});

app.get('/scan', (req, res) => {
  res.sendFile(path.join(publicDir, 'scan.html'));
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(publicDir, 'menu.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

app.get('/admin', requireAuth, requireRoles('owner', 'admin'), (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/cashier', requireAuth, requireRoles('owner', 'admin', 'cashier'), (req, res) => {
  res.sendFile(path.join(publicDir, 'cashier.html'));
});

app.get('/tables', requireAuth, requireRoles('owner', 'admin'), (req, res) => {
  res.sendFile(path.join(publicDir, 'tables.html'));
});

app.get('/analytics', requireAuth, requireRoles('owner', 'admin', 'cashier'), (req, res) => {
  res.sendFile(path.join(publicDir, 'analytics.html'));
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
