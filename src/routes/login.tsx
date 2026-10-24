import { createFileRoute } from "@tanstack/react-router";
import { LoginOnly } from "@/components/aahar/gate";

export const Route = createFileRoute("/login")({ component: LoginOnly });
