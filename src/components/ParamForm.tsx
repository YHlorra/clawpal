import React, { useMemo, useState } from "react";
import type { Recipe, RecipeParam } from "../lib/types";

function validateField(param: RecipeParam, value: string): string | null {
  const trim = value.trim();
  if (param.required && trim.length === 0) {
    return `${param.label} is required`;
  }
  if (param.minLength !== undefined && trim.length < param.minLength) {
    return `${param.label} is too short`;
  }
  if (param.maxLength !== undefined && trim.length > param.maxLength) {
    return `${param.label} is too long`;
  }
  if (param.pattern && trim.length > 0) {
    try {
      if (!new RegExp(param.pattern).test(trim)) {
        return `${param.label} format is invalid`;
      }
    } catch {
      return `${param.label} has invalid validation rule`;
    }
  }
  return null;
}

export function ParamForm({
  recipe,
  values,
  onChange,
  onSubmit,
}: {
  recipe: Recipe;
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onSubmit: () => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    for (const param of recipe.params) {
      const err = validateField(param, values[param.id] || "");
      if (err) {
        next[param.id] = err;
      }
    }
    return next;
  }, [recipe.params, values]);
  const hasError = Object.keys(errors).length > 0;

  return (
    <form className="param-form" onSubmit={(e) => {
      e.preventDefault();
      if (hasError) {
        return;
      }
      onSubmit();
    }}>
      {recipe.params.map((param: RecipeParam) => (
        <label key={param.id}>
          <span>{param.label}</span>
          {param.type === "textarea" ? (
            <textarea
              value={values[param.id] || ""}
              placeholder={param.placeholder}
              onBlur={() => setTouched((prev) => ({ ...prev, [param.id]: true }))}
              onChange={(e) => {
                onChange(param.id, e.target.value);
                setTouched((prev) => ({ ...prev, [param.id]: true }));
              }}
            />
          ) : (
            <input
              value={values[param.id] || ""}
              placeholder={param.placeholder}
              required={param.required}
              onBlur={() => setTouched((prev) => ({ ...prev, [param.id]: true }))}
              onChange={(e) => {
                onChange(param.id, e.target.value);
                setTouched((prev) => ({ ...prev, [param.id]: true }));
              }}
            />
          )}
          {touched[param.id] && errors[param.id] ? (
            <small style={{ color: "#f98b8b", display: "block" }}>{errors[param.id]}</small>
          ) : null}
        </label>
      ))}
      <button type="submit" disabled={hasError}>Preview</button>
    </form>
  );
}
