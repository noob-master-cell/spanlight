import { Toaster as SonnerToaster } from "sonner";

import { useTheme } from "@/lib/theme";

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-border !bg-surface !text-foreground !shadow-lg !text-sm !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster };
