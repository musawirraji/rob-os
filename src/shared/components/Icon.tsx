import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  ArrowLeft02Icon,
  ArrowUp01Icon,
  Attachment01Icon,
  Briefcase01Icon,
  Building06Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  CommandIcon,
  DocumentAttachmentIcon,
  Folder01Icon,
  Home01Icon,
  InboxIcon,
  InformationCircleIcon,
  Link01Icon,
  Mail01Icon,
  Note01Icon,
  PlusSignIcon,
  Queue01Icon,
  Search01Icon,
  SparklesIcon,
  UserIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

/**
 * The only place the icon library is referenced. Everything else asks for a
 * semantic name, so swapping a glyph is a one-line change here and no feature
 * ever imports HugeIcons directly.
 */
const ICONS = {
  // navigation
  today: Home01Icon,
  inbox: InboxIcon,
  person: UserIcon,
  people: UserMultiple02Icon,
  company: Building06Icon,
  project: Folder01Icon,
  meeting: Calendar03Icon,
  ask: SparklesIcon,
  review: Queue01Icon,
  back: ArrowLeft02Icon,

  // sources — these render inside the source chip
  email: Mail01Icon,
  transcript: Note01Icon,
  document: DocumentAttachmentIcon,
  crm: Briefcase01Icon,
  link: Link01Icon,
  attachment: Attachment01Icon,

  // provenance + status
  fact: CheckmarkCircle01Icon,
  inference: InformationCircleIcon,
  overdue: AlertCircleIcon,
  waiting: Clock01Icon,

  // actions
  search: Search01Icon,
  capture: PlusSignIcon,
  command: CommandIcon,
  send: ArrowUp01Icon,
} as const;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Omit for decorative icons; the label makes it announced. */
  label?: string;
};

export function Icon({ name, size = 16, strokeWidth = 1.5, className, label }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ICONS[name]}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
