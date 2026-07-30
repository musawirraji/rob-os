"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Disables a whole group of controls while their form is submitting.
 *
 * A `<fieldset disabled>` is doing the real work here, not the class: the browser
 * disables every control inside it natively. That matters because the guard against
 * a double submit then does not depend on our JavaScript having loaded — and a
 * queue where an impatient second click files a second write is a data problem, not
 * a polish problem.
 *
 * The dim is the progressive-enhancement half: nice when React is running,
 * unnecessary when it is not.
 */
export function BusyFields({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <fieldset
      className={`ro-fields${pending ? " is-busy" : ""}${className ? ` ${className}` : ""}`}
      disabled={pending}
    >
      {children}
    </fieldset>
  );
}
