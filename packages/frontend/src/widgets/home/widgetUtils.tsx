import type { LucideIcon } from "lucide-react";
export type { LucideIcon };

export function LoadingTile({ title, Icon, tone = "blue" }: {
  title: string;
  Icon: LucideIcon;
  tone?: "blue" | "orange" | "purple" | "pink" | "cyan" | "indigo";
}) {
  const toneMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
    orange: "bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300",
    purple: "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300",
    pink: "bg-pink-100 dark:bg-pink-900/60 text-pink-600 dark:text-pink-300",
    cyan: "bg-cyan-100 dark:bg-cyan-900/60 text-cyan-600 dark:text-cyan-300",
    indigo: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  };
  return (
    <div className="animate-pulse rounded-xl bg-white dark:bg-gray-800 p-4 shadow min-h-[120px] flex flex-col items-center justify-center gap-2">
      <Icon className={`w-6 h-6 ${toneMap[tone]?.split(" ").slice(2).join(" ") || "text-gray-400"}`} />
      <span className="text-xs text-gray-400">{title}</span>
    </div>
  );
}

export function EmptyTile({ title, Icon, tone = "gray" }: {
  title: string;
  Icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow min-h-[120px] flex flex-col items-center justify-center gap-2 opacity-60">
      <Icon className="w-6 h-6 text-gray-300 dark:text-gray-600" />
      <span className="text-xs text-gray-400">{title}</span>
    </div>
  );
}
