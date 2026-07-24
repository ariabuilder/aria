export interface ActivityTimelineRowAction {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ActivityTimelineItem {
  id: string;
  userName: string;
  userAvatarUrl?: string | null;
  action: string;
  target: string;
  timestamp: string;
  createdAt: string;
  isHighlighted?: boolean;
  actions?: ActivityTimelineRowAction[];
}
