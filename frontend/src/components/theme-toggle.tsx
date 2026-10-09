import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

interface ThemeToggleProps {
  /** `default` is the white circle (Figma "Control/Theme toggle"); `rail` sits on the dark rail. */
  tone?: "default" | "rail";
  className?: string;
}

/** Circular theme button: shows the active theme, opens Light / Dark / System. */
export function ThemeToggle({ tone = "default", className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const TriggerIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={tone === "rail" ? "ghost" : "secondary"}
          size="icon"
          aria-label="Change theme"
          className={cn(
            tone === "rail" &&
              "bg-rail-tile text-rail-foreground hover:bg-rail-tile-hover focus-visible:outline-lime",
            className,
          )}
        >
          <TriggerIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isThemePreference(value)) {
              setTheme(value);
            }
          }}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
