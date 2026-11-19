// SPDX-License-Identifier: MIT
// Copyright (c) 2026 RICHARDwuxiaofei
/** Shared by geometry and material planning without a runtime dependency cycle. */
export const statuses = {
  Online: "#2ed319",
  "Join Me": "#00b8ff",
  "Ask Me": "#e97c03",
  Busy: "#c80928",
  Offline: "#8c939c",
};
export type Status = keyof typeof statuses;
export const resolvedDot = (c: { dotColor: string; status: Status }) =>
  c.dotColor === "auto" ? statuses[c.status] : c.dotColor;
