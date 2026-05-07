import { useState, useEffect } from "react";
import Head from "next/head";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import { mdiCartOutline } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/cart";
import { Minicart } from "@/components/Minicart";
import { Icon } from "@/lib/icon";
import { getBuildBadgeLabel } from "@/lib/build-metadata";
import type { OcProduct } from "@/pages/api/products";

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

type HomeProps = {
  buildBadgeLabel: string;
};

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  return {
    props: {
      buildBadgeLabel: getBuildBadgeLabel(),
    },
  };
};

export default function Home({
  buildBadgeLabel,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const { addItem, items, openCart } = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);
  const [products, setProducts] = useState<OcProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setLoadingProducts(false));
  }, []);

  function handleAddToCart(product: OcProduct) {
    addItem({
      id: product.id,
      name: product.name,
      price: product.priceInCents,
      image: product.image ?? undefined,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 2000);
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
            <Badge colorScheme="teal" size="sm" className="text-[.6rem]">
              {buildBadgeLabel}
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

        {/* Products from OrderCloud */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300 mb-2">
              Live Catalog
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
              Products Pulled from OrderCloud
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              These product cards are sourced from the OrderCloud catalog in
              real time, while checkout is handled by Stripe Hosted Checkout.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Stripe promo codes accepted at checkout · Test card{" "}
              <code className="bg-subtle-bg px-1.5 py-0.5 rounded font-mono">
                4242 4242 4242 4242
              </code>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-0.5">
            {loadingProducts && (
              <p className="text-sm text-muted-foreground col-span-full">
                Loading products from OrderCloud…
              </p>
            )}

            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => handleAddToCart(product)}
                className="group relative aspect-3/4 w-full overflow-hidden rounded bg-zinc-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                {/* Background image */}
                {product.images ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-zinc-800" />
                )}

                {/* Gradient overlay for text legibility */}
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

                {/* Content pinned to bottom */}
                <div className="relative z-10 flex h-full flex-col justify-end p-5">
                  <h2 className="text-lg font-bold leading-tight text-white mb-1 drop-shadow-sm">
                    {product.name}
                  </h2>
                  <p className="text-sm text-white mb-2">
                    $
                    {(product.priceInCents / 100).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <span className="inline-flex cursor-pointer items-center w-full backdrop-blur-xs bg-white/25 border-white/20 px-4 py-1 text-md font-normal text-white transition-colors duration-200 group-hover:bg-white/25">
                    {addedId === product.id ? "Added ✓" : "Add to Cart"}
                    <span className="ml-auto">➡</span>
                  </span>
                </div>
              </button>
            ))}
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

          <details className="mt-6 rounded-xl border border-border bg-subtle-bg/60 p-4 sm:p-5">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-1">
                  Technical Detail
                </p>
                <p className="text-sm font-semibold">Integration Flow</p>
              </div>
              <span className="text-xs text-muted-foreground">Expand</span>
            </summary>

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              {flowSteps.map((item) => (
                <Card
                  key={item.step}
                  style="flat"
                  padding="md"
                  elevation="none"
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-body-bg flex items-center justify-center text-xs font-bold">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm mb-0.5">
                        {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mb-1">
                        {item.description}
                      </p>
                      <code className="text-xs bg-body-bg px-1.5 py-0.5 rounded font-mono">
                        {item.tech}
                      </code>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </details>
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
                item: "Promotions via Stripe-native promo codes",
                done: true,
                detail:
                  "Stripe-native promotion codes are enabled on the hosted Checkout page. Discount details flow back to OrderCloud via the webhook and are stored in order xp for reconciliation.",
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
                  <span
                    className={done ? "font-medium" : "text-muted-foreground"}
                  >
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
              <Card
                key={source + quote.slice(0, 20)}
                style="outline"
                padding="md"
                elevation="none"
              >
                <blockquote className="text-sm italic text-foreground mb-2">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  —{" "}
                  <a
                    href={`https://${source}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {source}
                  </a>
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-6 p-4 rounded-md bg-subtle-bg">
            <p className="text-sm font-semibold mb-1">
              What this means for our PoC:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>
                Card data never touches our servers — Stripe hosts the entire
                payment form on their domain.
              </li>
              <li>
                We qualify for <strong>SAQ A</strong> — the simplest
                self-assessment questionnaire (fewest controls).
              </li>
              <li>
                No complex payment middleware required — we only create a
                Checkout Session and handle the webhook.
              </li>
              <li>
                Stripe is a <strong>PCI Level 1 Service Provider</strong>,
                certified annually by an independent QSA.
              </li>
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
                question:
                  "Do we need Sitecore-hosted middleware at MVP, or is the minimal session + webhook handler sufficient?",
                status: "answered",
                answer:
                  "This PoC proves the minimal approach works: a single API route creates the Checkout Session, and one webhook endpoint handles completion. No additional middleware needed for MVP.",
              },
              {
                question:
                  "What is our decision on 'generic commerce' vs 'OrderCloud-specific' namespace?",
                status: "open",
                answer:
                  "Still open. This PoC is implementation-agnostic (Stripe SDK only). The namespace decision affects how this integrates with the Content SDK workstream.",
              },
              {
                question:
                  "Confirm PCI / self-attestation posture for Stripe Hosted Checkout.",
                status: "answered",
                answer:
                  "Confirmed. See PCI Compliance section above — Hosted Checkout qualifies us for SAQ A, the simplest tier. No card data touches our servers.",
              },
              {
                question: "How do promotions work with Stripe Hosted Checkout?",
                status: "answered",
                answer:
                  "Stripe-native promo codes are enabled on the hosted Checkout page. On completion, the webhook reads discount details from the session and persists them to the OC order's xp for reporting and reconciliation.",
              },
              {
                question:
                  "How does the checkout session get real product data from OrderCloud?",
                status: "answered",
                answer:
                  "Demonstrated. The server decodes the OC JWT to get the active order ID (from the 'orderid' claim or by querying Me.ListOrders for Unsubmitted orders), then calls LineItems.List() to fetch authoritative pricing. The client sends no product data or prices.",
              },
              {
                question:
                  "How does order fulfillment flow back to OrderCloud after payment?",
                status: "answered",
                answer:
                  "Demonstrated. On checkout.session.completed, the webhook creates an OC order, adds line items with Stripe-charged price override (OverrideUnitPrice), submits the order, and records a payment — with idempotency via xp.stripeSessionId.",
              },
              {
                question:
                  "How does shopper authentication (anonymous vs registered) affect the checkout session?",
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
                question:
                  "Can we support multiple currencies / international shipping?",
                status: "noted",
                answer:
                  "Stripe Checkout supports Adaptive Pricing and configurable shipping rates. Out of scope for MVP but a natural extension.",
              },
            ].map(({ question, status, answer }) => (
              <Card
                key={question.slice(0, 30)}
                style="flat"
                padding="md"
                elevation="none"
              >
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
