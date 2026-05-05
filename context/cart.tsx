import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number; // in cents
  quantity: number;
  image?: string;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  promoCode: string;
  promoApplied: boolean;
  promoError: string | null;
  discountPercent: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  setPromoCode: (code: string) => void;
  applyPromo: () => void;
  clearPromo: () => void;
  subtotal: number;
  discount: number;
  total: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);

  const [promoError, setPromoError] = useState<string | null>(null);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPromoApplied(false);
    setDiscountPercent(0);
    setPromoCode("");
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const applyPromo = useCallback(async () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    try {
      const res = await fetch("/api/stripe/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromoApplied(true);
        setDiscountPercent(data.percentOff);
      } else {
        setPromoError(data.error ?? "Invalid code");
      }
    } catch {
      setPromoError("Failed to validate code");
    }
  }, [promoCode]);

  const clearPromo = useCallback(() => {
    setPromoApplied(false);
    setDiscountPercent(0);
    setPromoCode("");
    setPromoError(null);
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = promoApplied ? Math.round(subtotal * (discountPercent / 100)) : 0;
  const total = subtotal - discount;

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        promoCode,
        promoApplied,
        promoError,
        discountPercent,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        openCart,
        closeCart,
        setPromoCode,
        applyPromo,
        clearPromo,
        subtotal,
        discount,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
