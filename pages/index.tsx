import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/cart";
import { Minicart } from "@/components/Minicart";

const flowSteps = [
  {
    step: "1",
    title: "Initiate Session",
    description:
      "Server creates a Stripe Checkout Session with line items, shipping, and metadata.",
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
      </Head>

      <div className="min-h-screen bg-body-bg text-foreground">
        {/* Nav */}
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">
            Commerce in SitecoreAI
          </span>
          <div className="flex items-center gap-3">
            <Link href="/learning">
              <Button variant="ghost" size="sm">
                Learning Plan
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={openCart} className="relative">
              Cart
              {cartCount > 0 && (
                <Badge colorScheme="teal" size="sm" className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center text-xs">
                  {cartCount}
                </Badge>
              )}
            </Button>
          </div>
        </nav>

        <Separator className="max-w-5xl mx-auto" />

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
          <div className="max-w-2xl">
            <Badge colorScheme="teal" size="md" className="mb-4">
              Proof of Concept
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Stripe Hosted Checkout
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              MVP scope reducer for Commerce in SitecoreAI. Stripe handles
              payment, shipping, and tax on their hosted domain — we initiate
              the session and process the completion event.
            </p>
            <p className="text-sm text-muted-foreground">
              No PCI self-attestation required. No complex payment middleware.
            </p>
          </div>
        </section>

        {/* Demo Product */}
        <section className="max-w-5xl mx-auto px-6 pb-12">
          <div className="grid md:grid-cols-2 gap-8">
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
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Integration Flow
              </h3>
              {flowSteps.map((item) => (
                <Card key={item.step} style="flat" padding="md" elevation="none">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-subtle-bg flex items-center justify-center text-xs font-bold">
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

        <Separator className="max-w-5xl mx-auto" />

        {/* Architecture context */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">Why Hosted Checkout</h2>
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
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { item: "Checkout Session creation (server-side)", done: true },
              { item: "Redirect to Stripe Hosted Checkout", done: true },
              { item: "Success / Cancel return pages", done: true },
              { item: "Webhook signature verification", done: true },
              { item: "checkout.session.completed handling", done: true },
              { item: "OrderCloud order fulfillment", done: false },
              { item: "Dynamic product catalog (from OC)", done: false },
              { item: "Promotions / coupon mapping", done: false },
            ].map(({ item, done }) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    done ? "text-green-600" : "text-muted-foreground"
                  }
                >
                  {done ? "✓" : "○"}
                </span>
                <span className={done ? "" : "text-muted-foreground"}>
                  {item}
                </span>
              </div>
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
