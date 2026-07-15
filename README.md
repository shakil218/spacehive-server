<div align="center">

# 🚀 SpaceHive Server

### Secure & Scalable REST API for SpaceHive

Backend API powering the SpaceHive marketplace with authentication, booking management, payment processing, and admin analytics.

<br/>

<img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js" />
<img src="https://img.shields.io/badge/Express.js-5-black?style=for-the-badge&logo=express" />
<img src="https://img.shields.io/badge/MongoDB-7-green?style=for-the-badge&logo=mongodb" />
<img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" />
<img src="https://img.shields.io/badge/Stripe-Checkout-635BFF?style=for-the-badge&logo=stripe" />

</div>

---

# 🌐 Live API

## Production

https://spacehive-server.vercel.app/

---

# 📖 About

SpaceHive Server is a RESTful backend built with **Express.js**, **MongoDB**, **TypeScript**, and **Stripe**.

It powers the entire SpaceHive platform by handling:

- User Management
- Space Management
- Booking System
- Stripe Payments
- Admin Analytics
- Booking Statistics

The API follows a clean architecture and is designed to be scalable and maintainable.

---

# ✨ Features

## 👤 User Management

- Get Users
- Update User Role
- Update User Status

---

## 🏢 Space Management

- Get All Spaces
- Featured Spaces
- Single Space
- Related Spaces
- Create Space

---

## 📅 Booking Management

- Create Booking
- Get User Bookings
- Booking Details
- Cancel Booking
- Delete Booking

---

## 💳 Stripe Integration

- Stripe Checkout
- Secure Payments
- Webhook Verification
- Booking Confirmation

---

## 📊 Analytics

- Dashboard Summary
- Revenue Analytics
- Monthly Statistics
- User Booking Statistics

---

# 🏗 Architecture

```text
Client

↓

Express REST API

↓

MongoDB Atlas

↓

Stripe

↓

Booking Confirmation
```

---

# 🛠 Tech Stack

## Runtime

- Node.js

## Framework

- Express.js

## Language

- TypeScript

## Database

- MongoDB Atlas

## Payment

- Stripe

## Other

- dotenv

- cors

- tsx

---

# 📦 Packages

```text
express

mongodb

stripe

cors

dotenv

tsx

typescript
```

---

# 📂 Project Structure

```text
src
│
├── controllers
│
├── lib
│
├── middleware
│
├── routes
│
├── types
│
└── server.ts
```

---# 📡 API Endpoints

## Users

| Method | Endpoint |
|---------|----------|
| GET | /api/users |
| PATCH | /api/users/:id/role |
| PATCH | /api/users/:id/status |

---

## Spaces

| Method | Endpoint |
|---------|----------|
| GET | /api/spaces |
| GET | /api/spaces/featured |
| GET | /api/spaces/:id |
| GET | /api/spaces/related/:id |
| POST | /api/spaces |

---

## Bookings

| Method | Endpoint |
|---------|----------|
| POST | /api/bookings |
| GET | /api/bookings/:id |
| GET | /api/bookings/user/:userId |
| PATCH | /api/bookings/:id/cancel |
| DELETE | /api/bookings/:id |

---

## Payments

| Method | Endpoint |
|---------|----------|
| POST | /api/create-checkout-session |
| POST | /api/stripe/webhook |

---

## Statistics

| Method | Endpoint |
|---------|----------|
| GET | /api/admin/dashboard |
| GET | /api/stats |
| GET | /api/user/bookings/statistics/:userId |

---

# 💳 Stripe Flow

```text
Create Booking

↓

Stripe Checkout

↓

Payment Success

↓

Webhook

↓

Booking Confirmed

↓

Update Database
```

---

# 🗄 Database Collections

- users

- spaces

- bookings

---

# 🚀 Installation

Clone Repository

```bash
git clone https://github.com/shakil218/spacehive-server.git
```

Move into project

```bash
cd spacehive-server
```

Install dependencies

```bash
npm install
```

---

# ⚙ Environment Variables

Create

```text
.env
```

```env
PORT=

MONGO_URI=

DB_NAME=

CLIENT_URL=

STRIPE_SECRET_KEY=

STRIPE_WEBHOOK_SECRET=
```

---

# ▶ Run Server

```bash
npm run dev
```

Server

```
http://localhost:5000
```

---

# 🔄 Stripe Webhook (Local)

```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

Copy the generated webhook secret.

```env
STRIPE_WEBHOOK_SECRET=
```

---

# ☁ Deployment

Backend

- Vercel

Database

- MongoDB Atlas

Payment

- Stripe

---

# 📌 Project Notice

This backend was developed as a **personal practice and portfolio project**.

It demonstrates:

- REST API Development

- MongoDB Integration

- Stripe Payments

- Express.js

- TypeScript

- Backend Architecture

The project is publicly available for educational and portfolio purposes.

---

# 👨‍💻 Developer

## Rabiul Hasan Shakil

### Portfolio

https://md-shakil-islam-dev.vercel.app/

### GitHub

https://github.com/shakil218

### LinkedIn

https://www.linkedin.com/in/md-shakil-islam-sagor/

---

# ⭐ Support

If you found this project helpful, please consider giving the repository a ⭐.

It motivates continued learning and future improvements.

---

<div align="center">

# 🚀 SpaceHive Server

### Fast • Secure • Scalable REST API

Built with ❤️ using

Express.js • TypeScript • MongoDB • Stripe

</div>
