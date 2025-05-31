import { useUser } from "../hooks/userProvider";

export const Topbar = () => {
  const user = useUser();

  return (
    <div className="bg-custom-gray  dark:bg-gray-900 text-grey dark:text-gray-400 px-3 py-1 flex items-center justify-between">
      <div className="text-lg font-semibold">Hello, {user.first_name}!</div>
      <div>
        <img
          src={user.photo_url}
          alt="User icon"
          className="w-8 h-8 rounded-full" // Определите размеры и скругление
        />
      </div>
    </div>
  );
};
