import { useQuery } from "@tanstack/react-query";

import { q } from "@/lib/queries";

/**
 * The signed-in member's effective permissions (custom-role aware), for hiding controls
 * they cannot use. The server enforces every permission regardless of what the UI shows.
 */
export function usePermissions() {
  const session = useQuery(q.session());
  const permissions = session.data?.user.permissions ?? [];
  return {
    loading: session.isLoading,
    role: session.data?.user.role ?? null,
    organization: session.data?.organization ?? null,
    can: (permission: string) => permissions.includes(permission),
  };
}
