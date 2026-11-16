# QR Dine – Frontend

React frontend for **QR Dine**, a multi-restaurant QR ordering platform. Guests scan a QR code, order from their phone and pay after the meal. Owners and kitchen staff get live dashboards.

**Live demo:** https://qrdine-vinod.vercel.app/?restaurantId=1
**Backend repo (Spring Boot):** https://github.com/Vinodkumar9841/restaurant-backend

> The backend runs on a free tier and sleeps when idle, so the first load can take 1–3 minutes.

## What's inside

- **Guest app:** Dine-in or Takeaway, table picker, menu with photos, live order tracking, table tab with split bill, call waiter, UPI payment
- **Owner dashboard:** menu, table QR codes, kitchen staff, bills, waiter calls, sales analytics
- **Kitchen dashboard:** live order board with sound alerts

## Tech

React, Vite, Axios, WebSocket (STOMP) for live kitchen updates. Deployed on Vercel.

## Run locally

Requirements: Node 18+ and the backend running on port 8080 (see the backend README).

```bash
npm install
npm run dev
```

Open http://localhost:5173/?restaurantId=1

## Author

Vinod Kumar – GitHub: https://github.com/Vinodkumar9841
