import { LogoMark } from "@/components/LogoMark";
import { timeOfDayGreeting } from "@/lib/greeting";

type GreetingProps = {
  name: string | undefined;
};

export function Greeting({ name }: GreetingProps) {
  const greeting = timeOfDayGreeting();

  return (
    <h1 className="flex items-center justify-center gap-3 text-center font-serif text-3xl font-normal text-foreground sm:text-4xl">
      <LogoMark className="size-8 shrink-0 sm:size-9" />
      <span>{name ? `${greeting}, ${name}` : greeting}</span>
    </h1>
  );
}
