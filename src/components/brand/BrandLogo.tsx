import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** `dark` = white wordmark on dark backgrounds. `light` = black wordmark. `auto` follows theme. */
  variant?: "auto" | "light" | "dark";
  /** Icon-only mark for collapsed sidebars. */
  mark?: boolean;
  className?: string;
  imgClassName?: string;
};

const WORDMARK_CLASS = "h-8 w-auto max-w-full object-contain object-left";

export function BrandLogo({
  variant = "auto",
  mark = false,
  className,
  imgClassName,
}: BrandLogoProps) {
  if (mark) {
    return (
      <img
        src="/logo-mark.svg"
        alt="FlowTicX"
        className={cn("h-8 w-8 object-contain flex-shrink-0", imgClassName, className)}
      />
    );
  }

  const imgClass = cn(WORDMARK_CLASS, imgClassName);

  if (variant === "dark") {
    return (
      <img
        src="/Logo-dark.svg"
        alt="FlowTicX"
        className={cn(imgClass, className)}
      />
    );
  }

  if (variant === "light") {
    return (
      <img
        src="/Logo-regular.svg"
        alt="FlowTicX"
        className={cn(imgClass, className)}
      />
    );
  }

  return (
    <span className={cn("inline-flex min-w-0", className)}>
      <img
        src="/Logo-regular.svg"
        alt="FlowTicX"
        className={cn(imgClass, "dark:hidden")}
      />
      <img
        src="/Logo-dark.svg"
        alt="FlowTicX"
        className={cn(imgClass, "hidden dark:block")}
      />
    </span>
  );
}
