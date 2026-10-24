import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AaharApp } from "@/components/aahar/app";
import "../styles.css";

const stored = localStorage.getItem("aahar-theme");
const dark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark", dark);

const root = document.getElementById("root");
if (!root) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <AaharApp
      user={{
        id: "phone",
        displayName: null,
        primaryEmail: null,
        profileImageUrl: null,
        isDevFallback: true,
      }}
    />
  </StrictMode>,
);
