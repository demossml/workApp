import type React from "react";

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-custom-gray dark:bg-gray-800 p-4">
      <div className="flex items-center mb-4">
        {/* Spinner */}
        <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin" />
      </div>
    </div>
  );
};
