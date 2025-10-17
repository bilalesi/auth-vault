"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Authenticate with Keycloak
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Authentication Error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error === "OAuthSignin" && "Error constructing OAuth URL"}
                  {error === "OAuthCallback" && "Error handling OAuth callback"}
                  {error === "OAuthCreateAccount" &&
                    "Could not create OAuth account"}
                  {error === "EmailCreateAccount" &&
                    "Could not create email account"}
                  {error === "Callback" && "Error in OAuth callback handler"}
                  {error === "OAuthAccountNotLinked" &&
                    "Account already exists with different provider"}
                  {error === "EmailSignin" &&
                    "Check your email for sign in link"}
                  {error === "CredentialsSignin" &&
                    "Sign in failed. Check your credentials"}
                  {error === "SessionRequired" &&
                    "Please sign in to access this page"}
                  {error === "RefreshAccessTokenError" &&
                    "Session expired. Please sign in again"}
                  {!error.match(
                    /^(OAuthSignin|OAuthCallback|OAuthCreateAccount|EmailCreateAccount|Callback|OAuthAccountNotLinked|EmailSignin|CredentialsSignin|SessionRequired|RefreshAccessTokenError)$/
                  ) && "An error occurred during authentication"}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-6">
          <button
            onClick={() => signIn("keycloak", { callbackUrl })}
            className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                className="h-5 w-5 text-indigo-500 group-hover:text-indigo-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            Sign in with Keycloak
          </button>

          <div className="text-center text-sm text-gray-600">
            <p>You will be redirected to Keycloak for authentication</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
