"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LinkField {
  name: string;
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  initial?: string;
}

/**
 * Asks for a sign-in the hosted LifeOS keeps on this device only. Used when there is no
 * server to hold it, so the note says exactly where it goes.
 */
export function LinkForm({
  fields,
  busy,
  onSave,
  onForget,
  note,
}: {
  fields: LinkField[];
  busy: boolean;
  onSave: (values: Record<string, string>) => void;
  onForget?: () => void;
  note: string;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""])));
  const ready = fields.every((f) => values[f.name].trim());
  return (
    <form
      className="space-y-2 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSave(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className="block space-y-1">
          <span className="text-xs text-muted-foreground">{f.label}</span>
          <Input
            type={f.type ?? "text"}
            value={values[f.name]}
            placeholder={f.placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          />
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={!ready || busy}>Save and check</Button>
        {onForget && <Button type="button" variant="ghost" size="sm" onClick={onForget}>Forget sign-in</Button>}
      </div>
    </form>
  );
}
