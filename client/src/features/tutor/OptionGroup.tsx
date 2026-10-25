import { useId } from "react";
import { cn } from "@/lib/utils";

type OptionGroupProps = {
  legend: string;
  options: readonly string[];
  selected: number | undefined;
  onSelect: (index: number) => void;
  disabled?: boolean;
  // "A) …" letters, for answer choices.
  lettered?: boolean;
  // Row of compact choices (e.g. confidence) instead of a stacked list.
  inline?: boolean;
  legendClassName?: string;
};

// A native radio group: arrow keys move between options, Space selects.
export function OptionGroup({
  legend,
  options,
  selected,
  onSelect,
  disabled = false,
  lettered = false,
  inline = false,
  legendClassName,
}: OptionGroupProps) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={cn("mb-2", legendClassName)}>{legend}</legend>
      <div className={cn("flex gap-2", inline ? "flex-wrap" : "flex-col")}>
        {options.map((option, index) => (
          <label
            key={option}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 transition-colors",
              "hover:bg-accent/50 has-[:checked]:border-ring has-[:checked]:bg-accent/60",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              "has-[:disabled]:cursor-default has-[:disabled]:hover:bg-background has-[:disabled:checked]:hover:bg-accent/60",
              inline && "items-center py-2",
            )}
          >
            <input
              type="radio"
              name={name}
              value={index}
              checked={selected === index}
              onChange={() => onSelect(index)}
              className={cn("size-4 shrink-0 accent-brand", !inline && "mt-1")}
            />
            {lettered && (
              <span aria-hidden="true" className="font-semibold text-secondary-foreground">
                {String.fromCharCode(65 + index)}
              </span>
            )}
            <span className="text-foreground">{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
