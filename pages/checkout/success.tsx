import Link from "next/link";
import Head from "next/head";

export default function CheckoutSuccess() {
  return (
    <>
      <Head>
        <title>Payment Successful</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-3xl font-bold text-green-600">Payment Successful!</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your payment was processed. In a real app, your order would be
          confirmed via the webhook.
        </p>
        <Link href="/" className="text-sm underline">
          Back to Home
        </Link>
      </main>
    </>
  );
}
