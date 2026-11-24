import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-[13px] text-fg-2">Sign in to your financial command center.</p>
      <ActionForm action={login} className="mt-6 grid gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" name="email">
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password" name="password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="mt-1 w-full">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-[13px] text-fg-2">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
