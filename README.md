# SmolBIZ
A lightweight all-in-one business management system for micro & small enterprises. Built with plain HTML/CSS/JS without any build tools. Powered by Supabase for backend services and Groq for AI business analytics. Ready to run and easy to deploy.

## Project Overview
SmolBIZ is built for sole proprietors, small retail shops and tiny teams. It covers the full business workflow including merchant onboarding, inventory tracking, sales bookkeeping, staff attendance, internal real-time chat, smart scheduling and B2B partner management. No complicated backend development required — the whole system runs as a static website.

### Core Feature List
### Merchant Onboarding & Access Control
- Admin account registration and business profile setup
- Staff invitation and role separation (dual views for admins and regular staff)

### Product & Sales Management
- Product creation, SKU tracking and inventory logs
- Sales checkout, expense recording and live business KPI dashboard
- Automated AI sales insights and basic sales volume forecasting

### Staff Attendance Check-in
- GPS location clock-in via browser with customizable valid radius for store premises
- Photo capture for attendance records using device camera
- Lightweight geofence verification to meet basic store attendance requirements

### Real-time Team Chat & Smart Scheduling
- Group chat powered by Supabase Realtime
- Simple text intent recognition: type phrases like "team meeting tomorrow at 4 PM" to auto-generate calendar events
- Built-in calendar panel to view all internal meetings

### B2B Partner Management
- Save partner contact information and archive all cooperation records

### Supporting Infrastructure
- Cloud file storage for business logos, attendance photos and sales receipts
- Row-level security policies to separate data between different merchants

## Tech Stack
Frontend: Native HTML / CSS / Vanilla JavaScript (ES Module), no Webpack or Vite build tools

Backend Base: Supabase (database, user authentication, real-time communication, object storage, row-level security)

AI Capabilities: Groq LLM (Llama 3.3 series models for business analysis and natural language parsing)

Database: PostgreSQL (hosted on Supabase)

Deployment: Render

## Picture Demo
### Admin View
<img width="1600" height="771" alt="WhatsApp Image 2026-07-05 at 11 42 41 PM" src="https://github.com/user-attachments/assets/37751f79-060f-42e5-86ad-9f78611794df" />
<img width="1600" height="772" alt="WhatsApp Image 2026-07-05 at 11 42 49 PM" src="https://github.com/user-attachments/assets/715459e3-7f62-4668-b876-e1146396b3f8" />
<img width="1600" height="774" alt="WhatsApp Image 2026-07-05 at 11 42 54 PM" src="https://github.com/user-attachments/assets/ec092162-a013-4189-b71b-39a1abdd20d5" />
<img width="1600" height="772" alt="WhatsApp Image 2026-07-05 at 11 43 00 PM" src="https://github.com/user-attachments/assets/879f0ee4-af18-4500-a0ab-007a03064ee5" />
<img width="1600" height="771" alt="WhatsApp Image 2026-07-05 at 11 43 08 PM" src="https://github.com/user-attachments/assets/ba7b2d38-ae97-4374-9615-3c2b47e750e9" />
<img width="1600" height="880" alt="WhatsApp Image 2026-07-05 at 11 43 16 PM" src="https://github.com/user-attachments/assets/ca8b40cc-adc2-4acf-a5bf-790fdc057221" />
<img width="1600" height="773" alt="WhatsApp Image 2026-07-05 at 11 43 23 PM" src="https://github.com/user-attachments/assets/1e8508b6-406d-4128-97a7-c07ff6987698" />
<img width="1600" height="774" alt="WhatsApp Image 2026-07-05 at 11 43 34 PM" src="https://github.com/user-attachments/assets/8a226ed4-29bc-4132-8261-7a9384633696" />
<img width="1600" height="772" alt="WhatsApp Image 2026-07-05 at 11 43 43 PM" src="https://github.com/user-attachments/assets/f4dd1711-b81e-48b2-9c25-e94521472b2c" />

### Worker View
<img width="1600" height="769" alt="WhatsApp Image 2026-07-05 at 11 44 47 PM" src="https://github.com/user-attachments/assets/3c3b3eea-2fe8-4391-9d4d-88ffadd3d32c" />
<img width="1600" height="761" alt="WhatsApp Image 2026-07-05 at 11 45 14 PM" src="https://github.com/user-attachments/assets/0e15ba66-a15a-46c2-bb78-bd122c069949" />
<img width="1600" height="769" alt="WhatsApp Image 2026-07-05 at 11 45 36 PM" src="https://github.com/user-attachments/assets/e7ded4fc-1dc3-44d0-b9be-098714b6cb2e" />
