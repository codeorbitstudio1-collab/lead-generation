# LeadGen Platform Guide

## What This Does
LeadGen is a lead generation and outreach platform. It helps you:
- discover businesses by category and location
- score and prioritize leads
- enrich contact data
- send outreach emails
- track clients, schedules, and follow-ups
- generate setup plans for new clients or projects

## Main Workflow
1. Register or log in.
2. Run a search from `New Search`.
3. Choose a discovery source:
   - `Google Maps` for local business discovery
   - `Open Web` for website-based prospecting
   - `Public Directories` for directory-style business discovery
4. Review results and save the best leads.
5. Use `Leads` to update status, notes, and email.
6. Use `Outreach` to send emails and log responses.
7. Use `Templates` to build reusable outreach copy.
8. Use `Schedules` for recurring searches.
9. Use `Client Dashboard` to track converted work.
10. Use `Setup Planner` to turn a client brief into an action plan.

## New Lead Sources
### 1. Google Maps
Best for local service businesses, stores, agencies, and location-based prospecting.

### 2. Open Web
Best when you want broader category discovery and public website/email extraction.

### 3. Public Directories
Best when businesses are listed in public directories like Yelp or Yellow Pages.

## Lead Scoring
The dashboard now ranks leads automatically.
High scores usually mean:
- no website
- no email yet
- phone available
- fresh lead
- good review profile
- low outreach history

Use the `Priority Queue` on the dashboard to decide what to work on first.

## Setup Planner
Use `Setup Planner` when you start a new client or project.
It generates:
- a lead targeting query
- an outreach draft
- a checklist
- a phased timeline

This is useful for onboarding a new service, niche, or client campaign.

## Pages
- `Lead Dashboard`: overview, scoring, recent searches
- `Client Dashboard`: active client work and billing flow
- `New Search`: lead discovery
- `Leads`: manage lead records
- `Outreach`: track sending and responses
- `Templates`: create reusable email templates
- `Freelance`: manage freelance project leads
- `LinkedIn`: contract project pipeline
- `Schedules`: scheduled searches
- `Settings`: API keys and email setup
- `Setup Planner`: campaign setup assistant

## Setup Checklist
Before running live lead generation:
- set `GOOGLE_MAPS_API_KEY` if you want live Maps results
- configure `gmail_email` and `gmail_app_password` for sending mail
- set `sender_name`
- set `openai_api_key` if you want AI-generated outreach
- confirm `JWT_SECRET` is strong and unique

## Environment Variables
Backend:
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `GOOGLE_MAPS_API_KEY`
- `CORS_ORIGINS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Frontend:
- `REACT_APP_BACKEND_URL`

## Recommended Usage
For fast prospecting:
1. Use `New Search` with `Google Maps`.
2. Switch to `Open Web` for broad niche discovery.
3. Switch to `Public Directories` for directory-heavy categories.
4. Use the `Priority Queue` to work the best leads first.
5. Move qualified leads into outreach or clients.

## Notes
- This project uses a JWT-based auth flow.
- The frontend stores the token in browser storage.
- Existing test failures in this repo are tied to admin bootstrap/login setup, not the lead-source changes.
