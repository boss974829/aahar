import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

function paintTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("aahar-theme", dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#07140e" : "#f4faf6");
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  return (
    <button
      type="button"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      onClick={() => {
        const next = !document.documentElement.classList.contains("dark");
        paintTheme(next);
        setDark(next);
      }}
      className="icon-btn press"
    >
      {dark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "ghost";
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "press inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-leaf text-on-leaf",
        variant === "quiet" && "btn-quiet",
        variant === "ghost" && "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-1 rounded-full bg-soft p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn("press h-11 rounded-full px-2 text-sm font-semibold", on ? "btn-quiet text-ink" : "text-muted")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel p-5", className)}>{children}</section>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <p className="banner" role="status">
      {children}
    </p>
  );
}

export function PageIntro({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div>
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h1 className={cn("text-4xl text-ink", kicker && "mt-2")}>{title}</h1>
      {children ? <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div> : null}
    </div>
  );
}
