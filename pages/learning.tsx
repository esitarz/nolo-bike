import Head from "next/head";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

const phases = [
  {
    days: "Days 1–2",
    title: "Stripe Fundamentals",
    description:
      "Install the SDK, create a Checkout Session server-side, redirect to Stripe, and pay with a test card.",
    status: "current" as const,
  },
  {
    days: "Days 3–4",
    title: "Webhooks & Trust",
    description:
      "Receive checkout.session.completed, verify signatures, and handle events idempotently.",
    status: "upcoming" as const,
  },
  {
    days: "Days 5–6",
    title: "Data Mapping",
    description:
      "Attach your internal order ID to Stripe session metadata and mark orders paid on completion.",
    status: "upcoming" as const,
  },
  {
    days: "Days 7–8",
    title: "Failure Paths",
    description:
      "Handle cancel flows, validate line items server-side, and prevent inconsistent paid states.",
    status: "upcoming" as const,
  },
  {
    days: "Days 9–10",
    title: "Document & Test",
    description:
      "Write a runbook, test success / cancel / duplicate webhook scenarios, capture known gaps.",
    status: "upcoming" as const,
  },
];

const statusColors = {
  current: "teal" as const,
  upcoming: "neutral" as const,
  done: "green" as const,
};

export default function LearningPlan() {
  return (
    <>
      <Head>
        <title>Learning Plan — Stripe Checkout PoC</title>
      </Head>

      <div className="min-h-screen bg-body-bg text-foreground">
        <header className="max-w-3xl mx-auto px-6 pt-8">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Back to Demo
            </Button>
          </Link>
        </header>

        <section className="max-w-3xl mx-auto px-6 pt-8 pb-12 text-center">
          <Badge colorScheme="teal" size="md" className="mb-4">
            In Progress
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Learning Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            A 10-day hands-on plan to ship a real Stripe integration — session
            creation, webhooks, data mapping, and the failure paths that matter.
          </p>
        </section>

        <Separator className="max-w-3xl mx-auto" />

        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">The 10-Day Plan</h2>
          <p className="text-muted-foreground mb-8 text-sm">
            Each phase produces something runnable. No slides, no theory
            without code.
          </p>

          <div className="flex flex-col gap-4">
            {phases.map((phase) => (
              <Card
                key={phase.days}
                style={phase.status === "current" ? "outline" : "flat"}
                padding="md"
                elevation={phase.status === "current" ? "xs" : "none"}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        {phase.days}
                      </span>
                      {phase.status === "current" && (
                        <Badge
                          colorScheme={statusColors[phase.status]}
                          size="sm"
                          variant="bold"
                        >
                          Now
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-base mb-1">
                      {phase.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {phase.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="max-w-3xl mx-auto" />

        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-semibold mb-1">
            Non-Negotiable Stripe Rules
          </h2>
          <p className="text-muted-foreground mb-8 text-sm">
            Internalize these before you write a single route.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                rule: "Session creation is server-only",
                detail:
                  "Your secret key must never reach the browser. Create Checkout Sessions in an API route.",
              },
              {
                rule: "Webhooks are source of truth",
                detail:
                  "Don't trust the success_url redirect. Only mark orders paid after receiving checkout.session.completed.",
              },
              {
                rule: "Verify every webhook signature",
                detail:
                  "Use stripe.webhooks.constructEvent with the raw request body. Reject anything that fails.",
              },
              {
                rule: "Expect duplicate deliveries",
                detail:
                  "Stripe retries on failure. Your handler must be idempotent — process each event.id once.",
              },
            ].map(({ rule, detail }) => (
              <Card key={rule} style="filled" padding="md" elevation="none">
                <p className="font-semibold text-sm mb-1">{rule}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </Card>
            ))}
          </div>
        </section>

        <footer className="max-w-3xl mx-auto px-6 py-8 text-center text-xs text-muted-foreground">
          Built with Next.js · Stripe · Blok
        </footer>
      </div>
    </>
  );
}
