Charter (what this workstream owns)

Deliver the MVP checkout experience using Stripe’s hosted checkout as a scope reducer:

    Define the intended hosted-checkout flow and what we need to implement vs what Stripe provides.

    Track open questions around promotions alignment and any compliance/PCI considerations.

    Identify the minimal “middleware” (if any) that must exist in the starter to initiate checkout and handle the completion event.

Why this is in MVP

    Checkout is one of the core MVP user journeys. 4

    Hosted Stripe checkout is explicitly discussed as an MVP scope reducer (shipping/tax/payment handled in hosted checkout). 94

Current alignment / discussion highlights

    Hosted Stripe is appealing because it’s a fully hosted checkout experience on Stripe’s domain (not an iframe), and Stripe handles checkout-related calculations before sending a completion event back. 610

    There is explicit concern about whether this introduces PCI/self-attestation requirements; the team discussed that it appears to reduce compliance requirements, but it should be double-checked. 61110

    A recurring design question: should this live under an OrderCloud-specific namespace or as a more generic “commerce” abstraction (Stripe as one implementation)? 6107

MVP Scope (initial)
In-scope

    A hosted checkout UX (redirect to Stripe checkout) suitable for an MVP commerce flow. 46

    Ability to configure basic checkout branding (icon/logo/colors) and shipping rates/rules as outlined in alignment notes. 4

Out-of-scope (explicit / implied)

    Multiple payment processors for MVP. 4

    Anything that requires non-trivial payment middleware beyond initiating a session + completion handling is a follow-up unless confirmed otherwise. 7

Known risks / hangups

    Promotions mapping: OrderCloud promotions vs Stripe coupons/promo codes may need reconciliation. 84

Open Questions (to drive next conversation)

    Do we need any Sitecore-hosted middleware at MVP, or can the starter initiate checkout purely with Stripe-hosted flows + a minimal completion handler? 7

    What is our decision on “generic commerce” vs “OrderCloud-specific” namespace for this integration? 76

    Confirm the PCI / self-attestation posture for the exact Stripe-hosted approach we intend to use. 611

References

    Hosted Stripe Checkout Page (link + noted hangups) 8

    Commerce in SitecoreAI MVP Alignment Meeting (checkout details + out-of-scope) 4

    Technical Breakdown (hosted checkout described as scope reducer) 9

    Auth for shoppers on SAI sites (PCI discussion + namespace question) 610

    SitecoreAI + OrderCloud project scope discussion (generic commerce package direction) 7