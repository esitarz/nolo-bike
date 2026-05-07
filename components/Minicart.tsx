import { useEffect, useState } from "react";
import { useCart } from "@/context/cart";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function Minicart() {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQuantity,
    subtotal,
  } = useCart();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const drawerWidth = "min(75vw, 24rem)";
    document.body.style.transition = "padding-right 300ms ease-in-out";
    document.body.style.paddingRight = isOpen ? drawerWidth : "0px";

    return () => {
      document.body.style.paddingRight = "0px";
      document.body.style.transition = "";
    };
  }, [isOpen]);

  async function handleCheckout() {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            id: i.id,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start checkout");
      if (!data.url) throw new Error("Missing checkout URL");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Sheet modal={false} open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent
        side="right"
        className="flex flex-col border-l border-border"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Your Cart</SheetTitle>
          <SheetDescription>
            {items.length === 0
              ? "Your cart is empty"
              : `${items.reduce((s, i) => s + i.quantity, 0)} item${items.length > 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3">
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-18 h-18 object-contain rounded bg-white shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCents(item.price)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  >
                    −
                  </Button>
                  <span className="text-sm w-6 text-center">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-xs text-muted-foreground"
                    onClick={() => removeItem(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <>
            <Separator />

            {/* Totals */}
            <div className="px-4 py-3 space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span>Subtotal</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Promo codes can be entered on the Stripe checkout page
              </p>
            </div>
          </>
        )}

        <SheetFooter className="flex-col gap-2">
          <Button
            onClick={handleCheckout}
            disabled={loading || items.length === 0}
            variant="default"
            className="w-full"
          >
            {loading ? "Redirecting to Stripe…" : "Checkout with Stripe"}
          </Button>
          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Test card:{" "}
            <code className="bg-subtle-bg px-1 py-0.5 rounded font-mono">
              4242 4242 4242 4242
            </code>
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
