import { content } from "@/constants/content";

export function timeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return content.home.greetings.morning;
  if (hour < 18) return content.home.greetings.afternoon;
  return content.home.greetings.evening;
}
