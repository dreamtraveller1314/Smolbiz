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
