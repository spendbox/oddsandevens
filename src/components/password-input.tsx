"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Password field with a show/hide toggle. Accepts the usual input props;
// room is reserved on the right for the eye button so a long password doesn't
// run underneath it.
export function PasswordInput({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={
          "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass " +
          className
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 transition hover:text-zinc-300"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
