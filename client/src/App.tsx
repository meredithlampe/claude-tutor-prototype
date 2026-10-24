import { content } from "@/constants/content";

export default function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="font-serif text-4xl text-foreground">{content.app.name}</h1>
      <p className="text-muted-foreground">{content.app.scaffoldNotice}</p>
    </main>
  );
}
