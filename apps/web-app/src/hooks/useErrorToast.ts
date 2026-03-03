import { useEffect } from "react";

import { showPersistentErrorToast } from "../errorToasts";

export function useErrorToast(error: string | null | undefined, scope: string): void {
  useEffect(() => {
    if (!error) return;
    showPersistentErrorToast(error, { scope });
  }, [error, scope]);
}
