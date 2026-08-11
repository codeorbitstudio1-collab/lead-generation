# LeadGen Command Center — PRD

## Original Problem Statement
User manually searches Google Maps for local businesses (restaurants, spa/salon, hotels, transport) to find those without websites for cold-call sales outreach. Wants a platform to enter a location + category → fetch all businesses → mark those without websites as leads → daily 10 AM auto-fetch → manage pipeline.

## User Personas
- **Solo Sales Founder** (primary) — pitches website services to local SMBs.

## Core Requirements (static)
- Search Google Maps by location + category
- Detect businesses without websites → "hot leads"
- Lead pipeline (New/Contacted/Interested/Converted/Rejected) + notes + CSV export
- Configurable scheduled daily searches (default 10AM)
- JWT auth
- Graceful mock fallback until API key added

## What's Implemented (2026-07-28)
- Backend (FastAPI + Mongo + APScheduler):
  - Auth, Search, Leads (+bulk), Analytics, Schedules, Settings (multi-key)
  - Outreach: GPT-5.2 email generation + Gmail SMTP + IMAP reply polling (fixed SINCE date bug)
  - AI Agent chat (GPT-5.2, per-session history, intent detection)
  - **Email discovery (NEW)**: POST /api/leads/{id}/discover-email — scrapes website homepage + /contact + /about pages, extracts mailto: + regex emails, filters noreply, scores info@/contact@/owner@ higher
  - **Templates (NEW)**: full CRUD + preview with `{business_name} {rating} {reviews} {category} {sender_name}` variables; per-template sent_count/reply_count
  - **A/B Groups (NEW)**: pair two templates; sends pick random variant; per-variant reply-rate stats
  - Updated /outreach/send to accept `template_id` OR `ab_group_id` (records variant + template on outreach doc)
- Frontend (React + shadcn):
  - Pages: Login, Register, Dashboard, Search, Leads (bulk toolbar), **Outreach**, **Templates+A/B**, Schedules, Settings
  - Floating AI Assistant chat widget (GPT-5.2)
  - Compose dialog: **3 modes** (AI Draft / Template / A/B Group) + inline **email discovery** button
- Backend testing: **63/63 pytest cases passing** (iter1 15 + iter2 19 + iter3 29)

## Prioritized Backlog

### P1
- Live Google Places verification (needs user's real API key)
- Email discovery for "no website" businesses (scrape / find owner email)
- Bulk actions on leads table

### P2
- Team accounts / lead assignment
- CRM integration (Hubspot / Zapier webhook)
- WhatsApp / cold-email templates + open tracking
- Map view of leads
- Duplicate detection across searches

## Credentials
- Admin: admin@leadfinder.io / Admin@123
- API key: added via Settings page (currently mock)
