import Link from "next/link";
import Head from "next/head";

export default function CheckoutCancel() {
  return (
    <>
      <Head>
        <title>Checkout Cancelled</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-3xl font-bold">Checkout Cancelled</h1>
        <p className="text-muted-foreground text-center max-w-md">
          You cancelled the checkout. No payment was taken.
        </p>
        <Link href="/" className="text-sm underline">
          Back to Home
        </Link>
      </main>
    </>
  );
}
