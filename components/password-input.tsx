"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const { className, ...inputProps } = props;

  return (
    <span className="password-input-wrap">
      <input
        {...inputProps}
        className={["password-input", className].filter(Boolean).join(" ")}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="password-visibility-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible
          ? <EyeOff size={17} aria-hidden="true" />
          : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  );
}
