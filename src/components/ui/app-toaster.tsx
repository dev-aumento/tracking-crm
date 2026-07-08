import { Toaster as Sonner } from "sonner";

export function AppToaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      expand
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-gray-200 shadow-lg",
          title: "text-sm font-semibold text-gray-900",
          description: "text-xs text-gray-600",
        },
      }}
    />
  );
}
