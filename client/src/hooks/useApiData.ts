import { useEffect, useState } from "react";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error" };

// Loads data once on mount. `load` must be a stable reference (a module-level function).
export function useApiData<T>(load: (signal: AbortSignal) => Promise<T>): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => setState({ status: "success", data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [load]);

  return state;
}
