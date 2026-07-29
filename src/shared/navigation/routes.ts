import type { IconName } from "@shared/components/Icon";

/**
 * The single route registry. Screens never build paths by hand and never import
 * the router directly — they go through this and `navigationService`.
 */
export const routes = {
  today: () => "/",
  inbox: () => "/inbox",
  people: () => "/people",
  person: (id: string) => `/people/${id}`,
  companies: () => "/companies",
  company: (id: string) => `/companies/${id}`,
  projects: () => "/projects",
  project: (id: string) => `/projects/${id}`,
  meetings: () => "/meetings",
  meeting: (id: string) => `/meetings/${id}`,
  ask: () => "/ask",
  review: () => "/review",
} as const;

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Rendered as the small count on the right of the row. */
  countKey?: "inbox" | "projects" | "review";
};

export const primaryNav: NavItem[] = [
  { label: "Today", href: routes.today(), icon: "today" },
  { label: "Inbox", href: routes.inbox(), icon: "inbox", countKey: "inbox" },
  { label: "People", href: routes.people(), icon: "person" },
  { label: "Companies", href: routes.companies(), icon: "company" },
  { label: "Projects", href: routes.projects(), icon: "project", countKey: "projects" },
  { label: "Meetings", href: routes.meetings(), icon: "meeting" },
  { label: "Ask Rob OS", href: routes.ask(), icon: "ask" },
];

export const attentionNav: NavItem[] = [
  { label: "Review Queue", href: routes.review(), icon: "review", countKey: "review" },
];
