"use client";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <h1 className="mb-6 text-center text-2xl font-bold">
          {isRegister ? "Create Account" : "Welcome Back"}
        </h1>

        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          {isRegister && (
            <div>
              <label className="mb-1 block text-sm text-foreground/50">Username</label>
              <input
                type="text"
                placeholder="Choose a username"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-foreground/50">Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-foreground/50">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="mt-2 rounded-lg bg-accent py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {isRegister ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-foreground/50">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-accent hover:underline"
          >
            {isRegister ? "Sign In" : "Sign Up"}
          </button>
        </p>

        <Link
          href="/"
          className="mt-4 block text-center text-sm text-foreground/30 hover:text-foreground/50"
        >
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
