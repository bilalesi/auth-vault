import { auth } from "@/auth";
import { SignInButton } from "@/components/sign-in-button";
import { SignOutButton } from "@/components/sign-out-button";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Test AuthManager + TaskManager
          </h1>
        </div>

        <div className="rounded-lg bg-white p-8 shadow">
          {session ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  Welcome ohoooo!
                </h2>
                <p className="mt-2 text-gray-600">
                  You're signed in as{" "}
                  <span className="font-medium">{session.user?.email}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">
                    User Information
                  </h3>
                  <dl className="mt-2 divide-y divide-gray-200 border-t border-gray-200">
                    <div className="flex justify-between py-3">
                      <dt className="text-sm font-medium text-gray-500">
                        Name
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.user?.name || "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between py-3">
                      <dt className="text-sm font-medium text-gray-500">
                        Email
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.user?.email || "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between py-3">
                      <dt className="text-sm font-medium text-gray-500">
                        User ID
                      </dt>
                      <dd className=" text-gray-900 font-mono text-xs">
                        {session.user?.id || "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between py-3">
                      <dt className="text-sm font-medium text-gray-500">
                        Session Expires
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.expires
                          ? new Date(session.expires).toLocaleString()
                          : "N/A"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {session.error && (
                  <div className="rounded-md bg-yellow-50 p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Session Warning
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          {session.error === "RefreshAccessTokenError"
                            ? "Your session has expired. Please sign in again."
                            : session.error}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center gap-1.5">
                <Link
                  href="/tasks"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-teal-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-gray-50 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Tasks
                </Link>
                <SignOutButton />
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  Not signed in
                </h2>
                <p className="mt-2 text-gray-600">
                  Sign in to access your account and manage tokens
                </p>
              </div>
              <SignInButton />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
