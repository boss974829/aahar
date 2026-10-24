import { createFileRoute } from "@tanstack/react-router";
import { AaharApp } from "@/components/aahar/app";
import { AuthGate } from "@/components/aahar/gate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AuthGate>{(user) => <AaharApp user={user} />}</AuthGate>;
}
