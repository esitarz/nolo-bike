import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface LineItem {
  description: string;
  quantity: number;
  amountSubtotal: number;
  amountDiscount: number;
  amountTotal: number;
}

interface SessionData {
  id: string;
  status: string;
  paymentStatus: string;
  customerEmail: string | null;
  customerName: string | null;
  amountSubtotal: number;
  amountTotal: number;
  currency: string;
  discountAmount: number;
  lineItems: LineItem[];
  ocOrderId: string;
  metadata: Record<string, string> | null;
  createdAt: string;
}

function formatCents(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default function CheckoutSuccess() {
  const router = useRouter();
  const sessionId = router.query.session_id as string | undefined;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/stripe/session?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSession(data);
      })
      .catch((err) => console.error("Failed to load session:", err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleCancel() {
    if (!session?.ocOrderId) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocOrderId: session.ocOrderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error);
      setCancelResult(
        data.action === "already-canceled"
          ? "Order was already canceled"
          : `Order canceled — ${data.stripe?.action === "refunded" ? `refund ${formatCents(data.stripe.amount)} (${data.stripe.refundId})` : data.stripe?.action}`,
      );
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Order Confirmation</title>
      </Head>
      <main className="min-h-screen bg-body-bg text-foreground">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold">
              {cancelResult ? "Order Canceled" : "Order Confirmation"}
            </h1>
            {session && (
              <Badge
                colorScheme={
                  cancelResult
                    ? "danger"
                    : session.paymentStatus === "paid"
                      ? "success"
                      : "warning"
                }
                size="sm"
              >
                {cancelResult ? "refunded" : session.paymentStatus}
              </Badge>
            )}
          </div>

          {cancelResult && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {cancelResult}
              </p>
            </div>
          )}

          {loading && (
            <p className="text-sm text-muted-foreground">
              Loading order details…
            </p>
          )}

          {session && (
            <>
              {/* Customer & Order Info */}
              <Card style="outline" padding="md" elevation="xs" className="mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Customer
                    </p>
                    <p className="font-medium">{session.customerName ?? "—"}</p>
                    <p className="text-muted-foreground">
                      {session.customerEmail ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Order Date
                    </p>
                    <p className="font-medium">
                      {new Date(session.createdAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      OC Order ID
                    </p>
                    <p className="font-mono text-xs">
                      {session.ocOrderId}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                      Stripe Session
                    </p>
                    <p className="font-mono text-xs truncate" title={session.id}>
                      {session.id}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Line Items */}
              <Card style="flat" padding="md" elevation="none" className="mb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Items
                </p>
                <div className="flex flex-col gap-3">
                  {session.lineItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity}
                          {item.amountDiscount > 0 && (
                            <span className="text-green-600 ml-2">
                              −{formatCents(item.amountDiscount, session.currency)}{" "}
                              discount
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        {item.amountDiscount > 0 && (
                          <p className="text-xs text-muted-foreground line-through">
                            {formatCents(item.amountSubtotal, session.currency)}
                          </p>
                        )}
                        <p className="font-medium">
                          {formatCents(item.amountTotal, session.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Totals */}
              <Card style="flat" padding="md" elevation="none" className="mb-6">
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>
                      {formatCents(session.amountSubtotal, session.currency)}
                    </span>
                  </div>
                  {session.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>
                        −{formatCents(session.discountAmount, session.currency)}
                      </span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>{cancelResult ? "Total (refunded)" : "Total"}</span>
                    <span className={cancelResult ? "line-through text-muted-foreground" : ""}>
                      {formatCents(session.amountTotal, session.currency)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Link href="/" className="flex-1">
                    <Button variant="default" className="w-full">
                      Continue Shopping
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancel}
                    disabled={cancelLoading || cancelResult !== null}
                  >
                    {cancelLoading
                      ? "Canceling…"
                      : cancelResult
                        ? "Canceled"
                        : "Cancel & Refund"}
                  </Button>
                </div>
                {cancelError && (
                  <p className="text-xs text-destructive text-center">
                    {cancelError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
