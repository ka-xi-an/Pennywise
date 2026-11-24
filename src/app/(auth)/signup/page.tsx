import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { signup } from "../actions";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-[13px] text-fg-2">Takes a minute. You can explore with demo data afterwards.</p>
      <ActionForm action={signup} className="mt-6 grid gap-4">
        <Field label="Full name" name="name">
          <Input name="name" autoComplete="name" required autoFocus />
        </Field>
        <Field label="Email" name="email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" name="password" hint="10+ characters with at least three of: lowercase, uppercase, number, symbol.">
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
        <SubmitButton className="mt-1 w-full">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Never enter bank passwords, UPI PINs or card PINs here — Ledgerline never asks for them.
      </p>
      <p className="mt-6 text-center text-[13px] text-fg-2">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
