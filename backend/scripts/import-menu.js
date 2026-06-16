import dotenv from 'dotenv';
import { firestore, adminAuth, FieldValue } from '../firebase.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// ── Menu data ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  // BLACK COFFEE
  { name: 'Pour Over',            price: 255, category: 'Coffee' },
  { name: 'Origami',              price: 255, category: 'Coffee' },
  { name: 'Aeropress',            price: 255, category: 'Coffee' },
  { name: 'French Press',         price: 255, category: 'Coffee' },
  { name: 'Espresso Doppio',      price: 175, category: 'Coffee' },
  { name: 'Americano',            price: 195, category: 'Coffee' },
  { name: 'Mandarin Black',       price: 225, category: 'Coffee' },
  { name: 'Irish Long Black',     price: 255, category: 'Coffee' },

  // AU-LAIT (Milk Based Coffee)
  { name: 'Cappuccino',                    price: 255, category: 'Coffee' },
  { name: 'French Vanilla Cappuccino',     price: 275, category: 'Coffee' },
  { name: 'Roasted Hazelnut Cappuccino',   price: 275, category: 'Coffee' },
  { name: 'Cortado',                       price: 225, category: 'Coffee' },
  { name: 'Mocha',                         price: 295, category: 'Coffee' },
  { name: 'Hazelnut Mocha',               price: 295, category: 'Coffee' },
  { name: 'Caramel Macchiato',            price: 295, category: 'Coffee' },
  { name: 'Latte',                         price: 265, category: 'Coffee' },
  { name: 'Coconut Jaggery Latte',        price: 275, category: 'Coffee' },
  { name: 'Spanish Latte',                price: 295, category: 'Coffee' },
  { name: 'Hot Chocolate',                price: 295, category: 'Coffee' },

  // THF Espresso Evolution (Specialty Drinks) — marked trending
  { name: 'Espresso Sangria',             price: 375, category: 'Coffee', is_trending: true },
  { name: 'Spiced Espresso Fizz',         price: 375, category: 'Coffee', is_trending: true },
  { name: 'Mango Twisted Coffee',         price: 375, category: 'Coffee', is_trending: true },
  { name: 'Hazelnut Enchantment',         price: 375, category: 'Coffee', is_trending: true },
  { name: 'Cranberry Espresso Lemonade',  price: 375, category: 'Coffee', is_trending: true },
  { name: 'Mocha Martini',               price: 375, category: 'Coffee', is_trending: true },
  { name: 'Tiramisu Affogato',           price: 375, category: 'Coffee', is_trending: true },
  { name: 'Espresso Tonic Surprise',     price: 375, category: 'Coffee', is_trending: true },

  // Frappe
  { name: 'THF Frappe',           price: 275, category: 'Coffee' },
  { name: 'Belgian Mocha Frappe', price: 295, category: 'Coffee' },
  { name: 'Hazelnut Frappe',      price: 295, category: 'Coffee' },
  { name: 'Oreo Frappe',          price: 295, category: 'Coffee' },
  { name: 'Caramel Frappe',       price: 295, category: 'Coffee' },

  // Cold Brew
  { name: 'Classic Cold Brew',    price: 245, category: 'Coffee' },
  { name: 'Cranberry Cold Brew',  price: 295, category: 'Coffee' },
  { name: 'Vanilla Sweet Cream',  price: 295, category: 'Coffee' },
  { name: 'Orange Cold Brew',     price: 295, category: 'Coffee' },

  // Tea
  { name: 'Hibiscus Tea',   price: 175, category: 'Tea' },
  { name: 'Chamomile Tea',  price: 175, category: 'Tea' },
  { name: 'Cascara Tea',    price: 245, category: 'Tea' },
  { name: 'Peach Iced Tea', price: 245, category: 'Tea' },
  { name: 'Lemon Iced Tea', price: 245, category: 'Tea' },

  // Beverages
  { name: 'THF Mojito',                  price: 245, category: 'Beverages' },
  { name: 'Spiced Guava Groove',         price: 265, category: 'Beverages' },
  { name: 'Mango Jalapeno Margarita',    price: 295, category: 'Beverages' },
  { name: 'Tropical Peach',             price: 295, category: 'Beverages' },
  { name: 'Mango Island Breeze',        price: 295, category: 'Beverages' },

  // Shakes
  { name: 'Oreo Shake',           price: 365, category: 'Juices & Shakes' },
  { name: 'Blueberry Shake',      price: 365, category: 'Juices & Shakes' },
  { name: 'KitKat Shake',         price: 365, category: 'Juices & Shakes' },
  { name: 'Ferrero Rocher Shake', price: 365, category: 'Juices & Shakes' },
  { name: 'Toffeenut Shake',      price: 365, category: 'Juices & Shakes' },
  { name: 'Lotus Biscoff Shake',  price: 365, category: 'Juices & Shakes' },

  // Burgers
  { name: 'Classic Veggie Burger',                  price: 245, category: 'Snacks' },
  { name: 'Dual Cheese Burger',                     price: 275, category: 'Snacks' },
  { name: 'Spinach & Mushroom Stroganoff Burger',   price: 275, category: 'Snacks' },
  { name: 'Mac-N-Cheese Burger',                    price: 275, category: 'Snacks' },

  // Pizza
  { name: 'Margherita',              price: 525, category: 'Mains' },
  { name: 'Farm Fresh',              price: 575, category: 'Mains' },
  { name: 'Hell Spicy Sicilian Pizza', price: 575, category: 'Mains' },
  { name: 'Paneer Tikka Pizza',      price: 575, category: 'Mains' },

  // Pasta
  { name: 'Penne Arrabiata',          price: 425, category: 'Mains' },
  { name: 'Spaghetti Aglio-E-Olio',   price: 455, category: 'Mains' },
  { name: 'Fettuccine Alfredo',       price: 455, category: 'Mains' },
  { name: 'Penne Pink Sauce',         price: 455, category: 'Mains' },
  { name: 'Fettuccine Creamy Pesto',  price: 455, category: 'Mains' },
  { name: 'Spaghetti Tapenade',       price: 525, category: 'Mains' },
  { name: 'Mac & Cheese',             price: 525, category: 'Mains' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function menuCollection(cafeId) {
  return firestore.collection('cafes').doc(String(cafeId)).collection('menu_items');
}

async function getCafeIdByEmail(email) {
  const user = await adminAuth.getUserByEmail(email);
  return user.uid;
}

async function importMenu(cafeId) {
  const collection = menuCollection(cafeId);

  // Check for existing items to avoid duplicates
  const existing = await collection.get();
  const existingNames = new Set(existing.docs.map((d) => d.data().name?.toLowerCase()));

  const toInsert = MENU_ITEMS.filter((item) => !existingNames.has(item.name.toLowerCase()));

  if (toInsert.length === 0) {
    console.log('All items already exist — nothing to import.');
    return;
  }

  // Firestore batch limit is 500 writes
  const BATCH_SIZE = 400;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE);
    const batch = firestore.batch();
    for (const item of chunk) {
      const ref = collection.doc();
      batch.set(ref, {
        cafe_id: String(cafeId),
        name: item.name,
        price: item.price * 100, // store in paise
        description: null,
        image_url: null,
        category: item.category,
        available: true,
        is_trending: Boolean(item.is_trending),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    inserted += chunk.length;
    console.log(`  Inserted ${inserted}/${toInsert.length} items...`);
  }

  console.log(`\nDone! ${inserted} items imported, ${existing.docs.length} already existed (skipped).`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const email = process.env.DEFAULT_CAFE_EMAIL || process.argv[2];
  if (!email) {
    console.error('Usage: node import-menu.js <owner-email>');
    console.error('  or set DEFAULT_CAFE_EMAIL in .env');
    process.exit(1);
  }

  console.log(`Looking up cafe for: ${email}`);
  const cafeId = await getCafeIdByEmail(email);
  console.log(`Cafe ID: ${cafeId}`);
  console.log(`Importing ${MENU_ITEMS.length} items...\n`);

  await importMenu(cafeId);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exitCode = 1;
});
