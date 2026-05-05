import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    promoCode,
    setPromoCode,
    promoApplied,
    promoError,
    discountPercent,
    applyPromo,
    clearPromo,
    subtotal,
    discount,
    total,
  } = useCart();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            image: i.image,
          })),
          promoCode: promoApplied ? promoCode : undefined,
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
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="flex flex-col">
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
                  className="w-16 h-16 object-cover rounded bg-white flex-shrink-0"
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

            {/* Promo code */}
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Promotion Code
              </p>
              {promoApplied ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge colorScheme="success" size="sm">
                      {promoCode.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {discountPercent}% off
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={clearPromo}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="e.g. OC20OFF"
                      className="h-9 text-sm"
                      onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={applyPromo}
                      disabled={!promoCode.trim()}
                    >
                      Apply
                    </Button>
                  </div>
                  {promoError && (
                    <p className="text-xs text-destructive">{promoError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Try <code className="font-mono bg-subtle-bg px-1 rounded">OC20OFF</code> or leave empty to enter a code on Stripe&apos;s page
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Totals */}
            <div className="px-4 py-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount ({discountPercent}%)</span>
                  <span>−{formatCents(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold pt-1">
                <span>Total</span>
                <span>{formatCents(total)}</span>
              </div>
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
