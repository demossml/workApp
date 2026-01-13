interface ProgressStepsProps {
  current: "initial" | "photos" | "cash_check";
}

export default function ProgressSteps({ current }: ProgressStepsProps) {
  const steps = [
    { id: "initial", label: "Открытие" },
    { id: "photos", label: "Фото" },
    { id: "cash_check", label: "Касса" },
  ];

  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((s, index) => (
        <div key={s.id} className="flex flex-col items-center text-center">
          <div
            className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold 
              ${current === s.id ? "bg-blue-600 text-white" : "bg-gray-300 dark:bg-gray-700"}`}
          >
            {index + 1}
          </div>
          <span className="text-xs mt-1">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
