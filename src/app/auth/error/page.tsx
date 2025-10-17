"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Authentication Error
          </h2>
        </div>

        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                {error || "Unknown Error"}
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {error === "Configuration" &&
                  "There is a problem with the server configuration."}
                {error === "AccessDenied" &&
                  "You do not have permission to sign in."}
                {error === "Verification" &&
                  "The verification token has expired or has already been used."}
                {error === "RefreshAccessTokenError" &&
                  "Your session has expired. Please sign in again."}
                {!error?.match(
                  /^(Configuration|AccessDenied|Verification|RefreshAccessTokenError)$/
                ) && "An unexpected error occurred during authentication."}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Link
            href="/auth/signin"
            className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
