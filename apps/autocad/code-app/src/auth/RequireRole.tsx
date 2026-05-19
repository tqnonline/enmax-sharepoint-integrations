import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { useUserRole, type Role } from "./useUserRole";

interface RequireRoleProps {
  roles: Role[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { role, isPending } = useUserRole();

  if (isPending) return null;

  if (role === "Unknown") {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>
          Checking permissions… If this persists, your account may not be in
          the expected Entra security group. Contact IT.
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (!roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
