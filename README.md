# DataFlow NG (Paystack TEST mode demo)

A demo data-bundle store using Paystack **test** payments. Static front end + one Vercel serverless function.

## Structure

```
dataflow-paystack/
├── index.html
├── package.json
├── README.md
├── api/
│   └── verify.js
└── lib/
    ├── config.js
    └── prices.js
```

## Setup

1. Put your Paystack **TEST public key** (`pk_test_...`) in `lib/config.js` as `PAYSTACK_PUBLIC_KEY`. Public keys are safe to commit.
2. Plans and prices live in `lib/prices.js` (single source of truth for the page and the server).
3. Push this folder's contents to GitHub (the files listed above, at the repo root).
4. Import the repo in Vercel.
5. In Vercel: **Project → Settings → Environment Variables**, add `PAYSTACK_SECRET_KEY` with your Paystack TEST secret key, then redeploy.

The secret key is never stored in this project. It exists only as a Vercel Environment Variable.

## Test payments

Use Paystack's test cards from their docs, e.g. card `4084 0840 8408 4081`, any future expiry, CVV `408`.

## Admin page

Open `/#admin` and enter the passcode from `lib/config.js` (`ADMIN_PASSCODE`). This is a demo-only, browser-side check and orders are stored in that browser's localStorage. Use a real backend and auth before going live.

## Payment statuses

`pending` → `success` / `failed` / `abandoned`. The server (`/api/verify`) checks the payment with Paystack and confirms the amount matches the plan price.
