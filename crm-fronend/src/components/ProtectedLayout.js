"use client";

import { useContext, useEffect, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import { useRouter, usePathname } from "next/navigation";

const parseIdSet = (raw, fallback = "") =>
  new Set(
    String(raw || fallback)
      .split(",")
      .map((x) => Number(String(x || "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const normalizePath = (value) => {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  const noTrailing = withLeading.replace(/\/+$/, "");
  return (noTrailing || "/").toLowerCase();
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const permissionMatchesPath = (permission, pathname) => {
  if (permission.includes("[") && permission.includes("]")) {
    const regex = new RegExp(`^${escapeRegExp(permission).replace(/\\\[.*?\\\]/g, "[^/]+")}$`);
    return regex.test(pathname);
  }

  return (
    permission === pathname ||
    (permission !== "/" && pathname.startsWith(`${permission}/`))
  );
};

const SUPER_ADMIN_ROLE_IDS = parseIdSet(process.env.NEXT_PUBLIC_SUPER_ADMIN_ROLE_IDS, "1");
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.NEXT_PUBLIC_SUPER_ADMIN_USER_IDS, "2");

const ProtectedLayout = ({ children }) => {
  const { token, permissions, user } = useContext(AuthContext);
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/403" ||
    pathname === "/privacy-policy";

  const normalizedPathname = normalizePath(pathname);
  const userId = user?.id ?? null;
  const roleId = user?.roleId ?? null;
  const isSuperAdmin =
    SUPER_ADMIN_ROLE_IDS.has(Number(roleId || 0)) ||
    SUPER_ADMIN_USER_IDS.has(Number(userId || 0));
  const normalizedPermissions = useMemo(
    () => (
      Array.isArray(permissions)
        ? permissions.map((perm) => normalizePath(perm))
        : []
    ),
    [permissions]
  );

  const hasAccess = isPublicRoute
    ? true
    : isSuperAdmin
      ? true
    : normalizedPermissions.some((perm) => permissionMatchesPath(perm, normalizedPathname));

  const shouldRedirectLogin = !isPublicRoute && !token;
  const waitingPermissions = !isPublicRoute && !!token && permissions === null;
  const shouldRedirect403 = !isPublicRoute && !!token && permissions !== null && !hasAccess;

  const loading = shouldRedirectLogin || waitingPermissions || shouldRedirect403;

  useEffect(() => {
    if (shouldRedirectLogin) {
      router.replace("/login");
      return;
    }
    if (shouldRedirect403) {
      console.warn("[ProtectedLayout][403-debug]", {
        pathname: normalizedPathname,
        permissions: normalizedPermissions,
        userId,
        roleId,
      });
      router.replace("/403");
    }
  }, [shouldRedirectLogin, shouldRedirect403, router, normalizedPathname, normalizedPermissions, userId, roleId]);

  useEffect(() => {
    if (loading) {
      document.body.classList.add("loading");
      return () => {
        document.body.classList.remove("loading");
      };
    }

    document.body.classList.remove("loading");
    return undefined;
  }, [loading]);

  if (loading) return null;

  return <>{children}</>;
};

export default ProtectedLayout;
