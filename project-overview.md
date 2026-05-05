Objective: Align engineering stakeholders on the MVP scope for Commerce in SitecoreAI, confirm technical approach, and agree on next steps for delivery.
Initiative: Here is the Initiative for this project: [EX-3767] SitecoreAI OOTB Commerce - Jira
Project Ownership

    Project Owner: @Miranda Danielson 

    Lead Developer: @Robert Watt 

    EA Sponsor: @Jeff Ilse 

    Additional contacts available here

MVP Scope (What we’re building)
User personas (MVP)

    Developer / Partner
    Component development and Solution implementation

    Business User
    Sitecore Users - Marketer, Catalog Manager, Partner — non-technical

    Shopper
    OrderCloud Buyer Users (anonymous & registered) 

Core user journeys (MVP)

    Agentic product discovery

    Authentication

    Add to cart

    Checkout

Phase 1 focus (what needs to feel like “real commerce”)

    Out-of-the-box commerce components (cart/checkout, etc.)

    Catalog surfaced in SitecoreAI

    Transactional commerce (real order submission vs. mock UI)

    Scope note: Phase 1 is explicitly targeting SitecoreAI / Unified UI. “Pages world” is called out as separate and not part of Unified UI scope for this phase.

Workstreams (organized around the MVP journeys)
Shopper Authentication & Envoy/Proxy

Map Sitecore context IDs to the correct OrderCloud marketplace/buyer client and define the buyer auth and routing model (direct vs Envoy/Edge proxy) so shopper APIs work reliably in MVP.
Sitecore Content SDK Integration

Expose add-to-cart and cart/minicart via the Content SDK, driven by OrderCloud, ensuring session/token handling and product/pricing retrieval patterns are consistent with MVP constraints.
Stripe Hosted Checkout Integration

Deliver checkout via Stripe Hosted Checkout to intentionally reduce Phase 1 scope, handling payment/shipping/tax on Stripe while Sitecore/OrderCloud initiate the session and process success/cancel returns.
Commerce Administrator Tooling

Provide the MVP path for commerce administration in SitecoreAI—i.e., how customers get a usable product catalog into OrderCloud so the storefront journeys can run on real data.

    MVP Solution: Catalog Import Tool - Provide a focused tool to import a minimal, MVP-constrained catalog into OrderCloud (single price, single category, no specs/variants) so other journeys have real products to operate on.

Agentic Product Discovery Feed

Publish a structured product feed for agentic discovery, defining the minimal MVP schema and delivery cadence so external discovery services can surface the catalog without requiring full transactional commerce.
MVP Deliverables (Concrete artifacts)
Deliverables in scope (MVP)

    Catalog Import Tool (simple import constraints; decide MVP limits)

    Product detail page component

    Add-to-cart component

    Cart + mini-cart pattern

    Checkout component (hosted checkout approach discussed)

Out-of-scope (MVP)

    Complex catalog import (specs, complex pricing)

    Personalized product search

    Multiple payment processors (beyond hosted checkout approach)

Open Questions / Risks (Keep visible)
Catalog / Import

    What’s the MVP product limit?

    Do we leverage an agent for import (or is that overkill)?

    Is a lightweight admin/merch experience required in MVP?

Promotions

    Promotions called out as something we “need to solve for” — track explicitly for MVP vs post-MVP.

Next / How this Confluence space is organized

This project uses a small set of “hub” pages:

    This page = high-level orientation + stable links + decisions

    Project Rolodex = “who to talk to” and what each person/team unblocks (sub-page)

    Workstream pages = one page per journey (discovery/auth/cart/checkout) once we start splitting into deeper design docs

    Meeting notes pages remain as raw history, but key decisions should be pulled up into the relevant hub/workstream page