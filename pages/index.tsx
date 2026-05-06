import { useState } from "react";
import Head from "next/head";
import { mdiCartOutline } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/cart";
import { Minicart } from "@/components/Minicart";
import { Icon } from "@/lib/icon";

const flowSteps = [
  {
    step: "1",
    title: "Initiate Session",
    description:
      "Server decodes the OC JWT for the active order ID, fetches line items from that order, and creates a Stripe Checkout Session with authoritative pricing.",
    tech: "POST /api/stripe/create-checkout-session",
  },
  {
    step: "2",
    title: "Redirect to Stripe",
    description:
      "Customer is redirected to Stripe's hosted checkout page. Stripe handles payment, shipping, and tax.",
    tech: "window.location.href = session.url",
  },
  {
    step: "3",
    title: "Handle Completion",
    description:
      "Stripe sends checkout.session.completed webhook. Server verifies signature and fulfills the order.",
    tech: "POST /api/stripe/webhook",
  },
];

export default function Home() {
  const { addItem, items, openCart } = useCart();
  const [added, setAdded] = useState(false);

  function handleAddToCart() {
    addItem({
      id: "space-horse-tiagra",
      name: "Space Horse Tiagra",
      price: 189900,
      image: "/images/space-horse-tiagra.jpg",
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <Head>
        <title>Stripe Hosted Checkout — PoC</title>
        <link rel="icon" href="/nolo-icon.svg" type="image/svg+xml" />
      </Head>

      <div className="min-h-screen bg-body-bg text-foreground">
        {/* Nav */}
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">
              Commerce in SitecoreAI
            </span>
            <Badge colorScheme="teal" size="sm">
              Proof of Concept
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            {/* <Link href="/learning">
              <Button variant="ghost" size="sm">
                Learning Plan
              </Button>
            </Link> */}
            <Button
              variant="outline"
              size="icon"
              onClick={openCart}
              className="relative"
              aria-label="Open cart"
            >
              <Icon path={mdiCartOutline} />
              {cartCount > 0 && (
                <Badge
                  colorScheme="teal"
                  size="sm"
                  className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center text-xs"
                >
                  {cartCount}
                </Badge>
              )}
            </Button>
          </div>
        </nav>

        <Separator className="max-w-5xl mx-auto" />

        {/* Demo Product */}
        <section className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8 py-12">
            <Card style="outline" padding="lg" elevation="xs">
              <div className="flex flex-col h-full">
                <img
                  src="/images/space-horse-tiagra.jpg"
                  alt="Space Horse Tiagra"
                  className="w-full rounded-md mb-4 bg-white"
                />
                <Badge colorScheme="neutral" size="sm" className="mb-3 w-fit">
                  All-City Cycles
                </Badge>
                <h2 className="text-2xl font-bold mb-2">Space Horse Tiagra</h2>
                <p className="text-muted-foreground text-sm mb-4 flex-1">
                  The agile and stable Space Horse is our most versatile and
                  popular model, ready to take you and your gear wherever
                  adventure leads — from road riding to randonneuring to
                  full-fledged touring.
                </p>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-3xl font-bold">$1,899.00</span>
                  <span className="text-sm text-muted-foreground">USD</span>
                </div>
                <Button
                  onClick={handleAddToCart}
                  variant="default"
                  className="w-full"
                >
                  {added ? "Added ✓" : "Add to Cart"}
                </Button>
                <p className="mt-3 text-xs text-muted-foreground text-center">
                  Try promo code in cart · Test card:{" "}
                  <code className="bg-subtle-bg px-1.5 py-0.5 rounded font-mono">
                    4242 4242 4242 4242
                  </code>
                </p>
              </div>
            </Card>

            {/* Flow diagram */}
            <div className="flex flex-col gap-3">
             
              <h3 className="text-sm mt-6 font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Integration Flow
              </h3>
              {flowSteps.map((item) => (
                <Card
                  key={item.step}
                  style="flat"
                  padding="md"
                  elevation="none"
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-subtle-bg flex items-center justify-center text-xs font-bold">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm mb-0.5">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mb-1">
                        {item.description}
                      </p>
                      <code className="text-xs bg-subtle-bg px-1.5 py-0.5 rounded font-mono">
                        {item.tech}
                      </code>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>


        {/* Architecture context */}
        <section className="max-w-5xl mx-auto px-6 pb-12">
          <p className="text-muted-foreground mb-8 text-sm max-w-2xl">
            Stripe Hosted Checkout is a full-page redirect (not an iframe). It
            intentionally reduces MVP scope by offloading payment, shipping, and
            tax to Stripe.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: "No PCI burden",
                detail:
                  "Card data never touches our servers. Stripe hosts the entire payment form.",
              },
              {
                title: "Shipping & tax handled",
                detail:
                  "Configure rates in Stripe Dashboard. No need to build shipping/tax logic in Phase 1.",
              },
              {
                title: "Webhook-driven fulfillment",
                detail:
                  "checkout.session.completed is the source of truth. Don't trust the redirect alone.",
              },
            ].map(({ title, detail }) => (
              <Card key={title} style="filled" padding="md" elevation="none">
                <p className="font-semibold text-sm mb-1">{title}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="max-w-5xl mx-auto" />

        {/* What's implemented */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">Implementation Status</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            What&apos;s working in this PoC today.
          </p>
          <div className="flex flex-col gap-4">
            {[
              {
                item: "Checkout Session creation (server-side, OC order-driven)",
                done: true,
                detail:
                  "Server decodes the OC access token JWT to extract the active order ID, fetches line items from that order via LineItems.List(), and creates a Stripe Checkout Session. OC is the single pricing authority — client sends no prices.",
              },
              {
                item: "Redirect to Stripe Hosted Checkout",
                done: true,
                detail:
                  "Client-side redirect to Stripe's hosted payment page — no card fields touch our domain.",
              },
              {
                item: "Success / Cancel return pages",
                done: true,
                detail:
                  "Dedicated routes handle post-checkout UX with session details for confirmation.",
              },
              {
                item: "Webhook signature verification",
                done: true,
                detail:
                  "Raw body parsing + stripe.webhooks.constructEvent() ensures only authentic Stripe events are processed.",
              },
              {
                item: "checkout.session.completed handling",
                done: true,
                detail:
                  "Webhook handler retrieves the full session (with expanded line items) and triggers OC fulfillment.",
              },
              {
                item: "Promotions via OrderCloud API",
                done: true,
                detail:
                  "Promo codes are validated against OC's Promotions API at checkout time. The resolved discount is applied to Stripe's unit_amount — OC is the promo authority, Stripe just sees final prices.",
              },
              {
                item: "OrderCloud order fulfillment",
                done: true,
                detail:
                  "On payment completion: creates OC order → adds line items (with Stripe-charged price override) → submits order → records payment. Includes idempotency via xp.stripeSessionId.",
              },
            ].map(({ item, done, detail }) => (
              <div key={item} className="flex gap-2 text-sm">
                <span
                  className={`mt-0.5 ${done ? "text-green-600" : "text-muted-foreground"}`}
                >
                  {done ? "✓" : "○"}
                </span>
                <div>
                  <span className={done ? "font-medium" : "text-muted-foreground"}>
                    {item}
                  </span>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator className="max-w-5xl mx-auto" />

        {/* PCI Compliance Proof */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">
            PCI Compliance — No Self-Attestation Required
          </h2>
          <p className="text-muted-foreground mb-6 text-sm max-w-2xl">
            Stripe&apos;s documentation confirms that Hosted Checkout eliminates
            direct card data handling, reducing our PCI obligations to the
            simplest tier (SAQ A).
          </p>
          <div className="flex flex-col gap-4">
            {[
              {
                quote:
                  "Stripe Checkout and Stripe Elements use a hosted payment field for handling all payment card data, so the cardholder enters all sensitive payment information in a payment field that originates directly from our PCI DSS–validated servers.",
                source: "stripe.com/guides/pci-compliance",
              },
              {
                quote:
                  "Many business models don't need to handle sensitive card data. You can instead use one of our low risk payment integrations to securely collect and transmit payment information directly to Stripe without it passing through your servers, reducing your PCI obligations.",
                source: "docs.stripe.com/security/guide",
              },
              {
                quote:
                  "Stripe can help significantly reduce the PCI burden for companies by providing a variety of tokenized integration methods (e.g., Checkout, Elements, mobile SDKs, Terminal SDKs), avoiding the need to directly handle sensitive credit card data.",
                source: "stripe.com/guides/pci-compliance",
              },
            ].map(({ quote, source }) => (
              <Card key={source + quote.slice(0, 20)} style="outline" padding="md" elevation="none">
                <blockquote className="text-sm italic text-foreground mb-2">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  — <a href={`https://${source}`} target="_blank" rel="noopener noreferrer" className="underline">{source}</a>
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-6 p-4 rounded-md bg-subtle-bg">
            <p className="text-sm font-semibold mb-1">What this means for our PoC:</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Card data never touches our servers — Stripe hosts the entire payment form on their domain.</li>
              <li>We qualify for <strong>SAQ A</strong> — the simplest self-assessment questionnaire (fewest controls).</li>
              <li>No complex payment middleware required — we only create a Checkout Session and handle the webhook.</li>
              <li>Stripe is a <strong>PCI Level 1 Service Provider</strong>, certified annually by an independent QSA.</li>
            </ul>
          </div>
        </section>

        <Separator className="max-w-5xl mx-auto" />

        {/* Outstanding Questions & Stakeholder FAQ */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">
            Outstanding Questions &amp; Stakeholder FAQ
          </h2>
          <p className="text-muted-foreground mb-6 text-sm max-w-2xl">
            Questions remaining from the Stripe Hosted Checkout workstream doc
            and anticipated questions from other project workstreams.
          </p>
          <div className="grid gap-4">
            {[
              {
                question: "Do we need Sitecore-hosted middleware at MVP, or is the minimal session + webhook handler sufficient?",
                status: "answered",
                answer:
                  "This PoC proves the minimal approach works: a single API route creates the Checkout Session, and one webhook endpoint handles completion. No additional middleware needed for MVP.",
              },
              {
                question: "What is our decision on 'generic commerce' vs 'OrderCloud-specific' namespace?",
                status: "open",
                answer:
                  "Still open. This PoC is implementation-agnostic (Stripe SDK only). The namespace decision affects how this integrates with the Content SDK workstream.",
              },
              {
                question: "Confirm PCI / self-attestation posture for Stripe Hosted Checkout.",
                status: "answered",
                answer:
                  "Confirmed. See PCI Compliance section above — Hosted Checkout qualifies us for SAQ A, the simplest tier. No card data touches our servers.",
              },
              {
                question: "How do OrderCloud promotions map to Stripe coupons/promo codes?",
                status: "answered",
                answer:
                  "Demonstrated in this PoC with a dual-path approach: Path A — Stripe-native promo codes on the hosted page. Path B — Server-side OC promo resolution applied to line item prices before session creation.",
              },
              {
                question: "How does the checkout session get real product data from OrderCloud?",
                status: "answered",
                answer:
                  "Demonstrated. The server decodes the OC JWT to get the active order ID (from the 'orderid' claim or by querying Me.ListOrders for Unsubmitted orders), then calls LineItems.List() to fetch authoritative pricing. The client sends no product data or prices.",
              },
              {
                question: "How does order fulfillment flow back to OrderCloud after payment?",
                status: "answered",
                answer:
                  "Demonstrated. On checkout.session.completed, the webhook creates an OC order, adds line items with Stripe-charged price override (OverrideUnitPrice), submits the order, and records a payment — with idempotency via xp.stripeSessionId.",
              },
              {
                question: "How does shopper authentication (anonymous vs registered) affect the checkout session?",
                status: "open",
                answer:
                  "Depends on the Auth & Envoy/Proxy workstream. Registered users may need customer_email or customer ID pre-populated on the session.",
              },
              {
                question: "What happens if the webhook fails or is delayed?",
                status: "noted",
                answer:
                  "Stripe retries webhooks for up to 3 days. The success page should not be the source of truth — always rely on the webhook for fulfillment.",
              },
              {
                question: "Can we support multiple currencies / international shipping?",
                status: "noted",
                answer:
                  "Stripe Checkout supports Adaptive Pricing and configurable shipping rates. Out of scope for MVP but a natural extension.",
              },
            ].map(({ question, status, answer }) => (
              <Card key={question.slice(0, 30)} style="flat" padding="md" elevation="none">
                <div className="flex items-start gap-3">
                  <Badge
                    colorScheme={
                      status === "answered"
                        ? "success"
                        : status === "open"
                        ? "warning"
                        : "neutral"
                    }
                    size="sm"
                    className="shrink-0 mt-0.5"
                  >
                    {status}
                  </Badge>
                  <div>
                    <p className="text-sm font-semibold mb-1">{question}</p>
                    <p className="text-xs text-muted-foreground">{answer}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="max-w-5xl mx-auto px-6 py-8 text-center text-xs text-muted-foreground border-t border-border">
          Stripe Hosted Checkout PoC · Commerce in SitecoreAI · Phase 1 MVP
        </footer>
      </div>

      <Minicart />
    </>
  );
}
