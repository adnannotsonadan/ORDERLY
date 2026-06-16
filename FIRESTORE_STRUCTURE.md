# Firestore Database Structure (Cost-Optimized)

This document defines a production-ready Firestore structure for this project.

It is aligned to these rules:

1. A user can sign in only if a matching app user document exists in Firestore.
2. A cafe can be created by a user or by an admin.
3. Admin actions must be logged.
4. Table data is publicly readable.
5. Data model minimizes redundant fields, reads, and writes.

## Key design decisions

- Keep identity in two layers:
  - Firebase Auth proves identity.
  - Firestore users collection controls app registration and access.
- Use path-based ownership to avoid storing duplicate cafe_id in every child document.
- Keep public and private data separated by collection scope and security rules.
- Store immutable order item snapshots in orders to preserve historical pricing.
- Keep derived analytics in pre-aggregated documents to avoid scanning all orders repeatedly.

## Collection tree

```text
users
  {uid}

cafes
  {cafeId}
    members
      {uid}
    counters
      order
    tables
      {tableId}
    menu_items
      {itemId}
    orders
      {orderId}
    waiter_calls
      {callId}
    admin_logs
      {logId}
    analytics_daily
      {yyyy_mm_dd}
```

## 1) Registration and login control

Path: users/{uid}

Purpose:

- Firestore-backed registration record.
- User without this document is not allowed to log in to the app UI/API.

Required fields:

- email: string (lowercase)
- display_name: string
- status: string (active | suspended)
- created_at: timestamp
- updated_at: timestamp
- last_login_at: timestamp (optional)

Recommended fields:

- default_cafe_id: string | null
- created_by: string | null (uid of admin if admin-created)

Login gate rule:

- After Firebase token verification, read users/{uid}.
- Continue only when doc exists and status == active.
- Do not auto-create user doc inside sign-in.

## 2) Cafe and membership model

Path: cafes/{cafeId}

Fields:

- name: string
- owner_uid: string
- plan: string (starter | pro | enterprise)
- status: string (active | archived)
- created_by: string (uid who created this cafe, user or admin)
- brandColor: string
- bgColor: string
- surfaceColor: string
- textColor: string
- fontFamily: string
- logoUrl: string
- created_at: timestamp
- updated_at: timestamp

Path: cafes/{cafeId}/members/{uid}

Fields:

- role: string (owner | admin | cashier | waiter)
- status: string (active | disabled)
- invited_by: string | null
- created_at: timestamp
- updated_at: timestamp

Why this is cost efficient:

- Access checks are one read on users/{uid} plus one read on members/{uid}.
- No need to duplicate full user profiles per cafe.

## 3) Public tables scope

Path: cafes/{cafeId}/tables/{tableId}

Fields:

- number: number (unique inside one cafe)
- label: string
- qr_token: string (opaque token used in menu URL)
- active: boolean
- created_at: timestamp
- updated_at: timestamp

Access scope:

- Public read allowed (for QR/menu/table lookup).
- Write allowed only to cafe owner/admin roles.

Note:

- Keep only non-sensitive data in tables because collection is public.

## 4) Menu model

Path: cafes/{cafeId}/menu_items/{itemId}

Fields:

- name: string
- price_minor: number (smallest currency unit)
- category: string
- description: string | null
- image_url: string | null
- available: boolean
- is_trending: boolean
- sort_order: number
- created_at: timestamp
- updated_at: timestamp

Cost notes:

- Use price_minor to avoid floating point corrections.
- Use available boolean instead of deleting often-used items.

## 5) Orders model

Path: cafes/{cafeId}/orders/{orderId}

Fields:

- order_number: number (from counters/order)
- table_id: string
- table_number: number (snapshot for convenience)
- status: string (pending | preparing | completed | cancelled)
- customer_phone: string
- subtotal_minor: number
- tax_minor: number
- total_minor: number
- items: array of item snapshots
- placed_at: timestamp
- updated_at: timestamp
- completed_at: timestamp | null

items[] snapshot fields:

- item_id: string
- name: string
- price_minor: number
- qty: number
- category: string

Why snapshot is not redundancy waste:

- It prevents historical order corruption when menu price/name changes.
- It avoids additional reads to reconstruct old orders.

## 6) Waiter calls model

Path: cafes/{cafeId}/waiter_calls/{callId}

Fields:

- table_id: string
- table_number: number
- status: string (open | closed)
- created_at: timestamp
- closed_at: timestamp | null

Cost notes:

- Query only open calls with status == open.
- Update status instead of deleting immediately; optional TTL/cleanup job later.

## 7) Counters

Theme is stored directly on cafes/{cafeId} (no settings subcollection).

Path: cafes/{cafeId}/counters/order

Fields:

- value: number
- updated_at: timestamp

Use transaction/increment for order_number generation.

## 8) Admin logs (audit trail)

Path: cafes/{cafeId}/admin_logs/{logId}

Fields:

- actor_uid: string
- actor_role: string
- action: string
- target_type: string (menu_item | table | order | member | theme | cafe)
- target_id: string | null
- before: map | null
- after: map | null
- ip_hash: string | null
- user_agent: string | null
- created_at: timestamp

Examples of actions to log:

- CAFE_CREATED
- MEMBER_ROLE_UPDATED
- MENU_ITEM_CREATED
- MENU_ITEM_UPDATED
- MENU_ITEM_DELETED
- TABLE_CREATED
- TABLE_UPDATED
- ORDER_STATUS_UPDATED
- THEME_UPDATED

Team member flow:

- Owner/admin creates member doc in cafes/{cafeId}/members/{uid}.
- Member must have users/{uid} with status active.
- Login resolves cafe access by owner_uid or members/{uid}.

Cost notes:

- Keep only required fields, do not store full request payload.
- Move old logs to cold storage periodically if needed.

## 9) Analytics pre-aggregation

Path: cafes/{cafeId}/analytics_daily/{yyyy_mm_dd}

Fields:

- orders_count: number
- completed_orders_count: number
- gross_sales_minor: number
- top_items: map<string, number>
- updated_at: timestamp

Write strategy:

- Update daily aggregates when order status transitions to completed.
- Dashboard reads small aggregate docs instead of scanning all orders.

## 10) Security scope summary

Recommended Firestore rule intent:

- users/{uid}:
  - read/write own user doc.
  - admin can manage all users.
- cafes/{cafeId} and private subcollections:
  - read/write only members with proper role.
- cafes/{cafeId}/tables/{tableId}:
  - read: public
  - write: owner/admin
- orders create:
  - allowed publicly with validation (table exists and active).
- admin_logs:
  - write: server/admin only
  - read: owner/admin only

Important:

- Validate role and membership in rules and server middleware.
- Do not trust cafe_id from client without membership check.

## 11) Indexes to create

Create indexes only for real query patterns.

Recommended initial indexes:

- orders: status + placed_at desc
- orders: table_id + placed_at desc
- waiter_calls: status + created_at desc
- menu_items: category + available + sort_order

Do not pre-create unused composite indexes.

## 12) Data redundancy rules

Store once:

- User profile in users/{uid}
- Cafe profile in cafes/{cafeId}
- Membership/role in cafes/{cafeId}/members/{uid}

Allowed snapshots:

- Order items and table_number in order docs (historical correctness + fewer reads).

Avoid:

- Repeating full user or cafe objects in orders, tables, menu, or logs.

## 13) Minimal examples

users/{uid}

```json
{
  "email": "owner@cafe.com",
  "display_name": "Cafe Owner",
  "status": "active",
  "default_cafe_id": "cafe_abc",
  "created_at": "serverTimestamp",
  "updated_at": "serverTimestamp"
}
```

cafes/{cafeId}

```json
{
  "name": "Downtown Cafe",
  "owner_uid": "uid_123",
  "plan": "starter",
  "status": "active",
  "created_by": "uid_123",
  "created_at": "serverTimestamp",
  "updated_at": "serverTimestamp"
}
```

cafes/{cafeId}/members/{uid}

```json
{
  "role": "owner",
  "status": "active",
  "invited_by": null,
  "created_at": "serverTimestamp",
  "updated_at": "serverTimestamp"
}
```

cafes/{cafeId}/tables/{tableId}

```json
{
  "number": 1,
  "label": "Table 1",
  "qr_token": "t_2f7a9",
  "active": true,
  "created_at": "serverTimestamp",
  "updated_at": "serverTimestamp"
}
```

cafes/{cafeId}/admin_logs/{logId}

```json
{
  "actor_uid": "uid_123",
  "actor_role": "admin",
  "action": "MENU_ITEM_UPDATED",
  "target_type": "menu_item",
  "target_id": "item_001",
  "before": { "price_minor": 200 },
  "after": { "price_minor": 220 },
  "created_at": "serverTimestamp"
}
```

## 14) Implementation note for current codebase

Current auth flow auto-creates cafe defaults during sign-in/session sync. To enforce Firestore-backed registration strictly, update sign-in/session logic so:

- Sign-up creates users/{uid} and optional first cafe.
- Sign-in only succeeds if users/{uid} already exists and active.
- Cafe creation is an explicit action, not implicit login side effect.
