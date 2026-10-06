import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]"
        aria-hidden="true"
      />
      <input
        className={cn(
          "luxe-input luxe-input-with-leading-icon w-full",
          className
        )}
        {...props}
      />
    </div>
  );
}

export { SearchInput };
