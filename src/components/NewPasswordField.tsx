"use client";

import { PASSWORD_RULES, PASSWORD_RULES_ATTR } from "@/lib/password";

// New-password input with a live checklist of the password rules.
export function NewPasswordField({
  id,
  value,
  onChange,
  placeholder = "Password",
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className: string;
}) {
  return (
    <div>
      <input
        type="password"
        required
        minLength={10}
        maxLength={72}
        name="new-password"
        id={id}
        autoComplete="new-password"
        passwordrules={PASSWORD_RULES_ATTR}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-rules`}
        className={className}
      />
      <ul id={`${id}-rules`} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(value);
          return (
            <li
              key={rule.label}
              data-met={met}
              className={met ? "text-mint" : "text-fog/70"}
            >
              {met ? "✓" : "○"} {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
