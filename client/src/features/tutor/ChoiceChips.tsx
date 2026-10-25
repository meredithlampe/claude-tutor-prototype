import { useId } from "react";
import { Button } from "@/components/ui/button";

type ChoiceChipsProps = {
  label: string;
  choices: readonly string[];
  onChoose: (choice: string) => void;
};

// Tappable suggested replies above the composer. Each one sends its text as a chat message.
export function ChoiceChips({ label, choices, onChoose }: ChoiceChipsProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <p id={labelId} className="px-1 text-sm text-secondary-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <Button
            key={choice}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChoose(choice)}
            className="rounded-full pointer-coarse:h-11"
          >
            {choice}
          </Button>
        ))}
      </div>
    </div>
  );
}
