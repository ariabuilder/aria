export const EN_ACTIVITY_MESSAGES = {
  "activity.title": "Activity",
  "activity.empty": "No activity yet",
  "activity.actionsFor": "Actions for {{user}}",
  "activity.action.created": "created",
  "activity.action.published": "published",
  "activity.action.scheduled": "scheduled",
  "activity.action.archived": "archived",
  "activity.action.unpublished": "unpublished",
  "activity.action.restored": "restored",
  "activity.action.duplicated": "duplicated",
  "activity.action.updated": "updated",
  "activity.action.saved": "saved",
  "activity.target.entry": "this entry",
  "activity.target.page": "this page",
  "activity.target.content": "content",
  "activity.target.revision": "a revision",
  "activity.restoreRevision": "Restore revision",
  "activity.deleteRevision": "Delete revision",
} as const;

export type ActivityMessageKey = keyof typeof EN_ACTIVITY_MESSAGES;
export type ActivityMessageCatalog = Record<ActivityMessageKey, string>;

export const FR_ACTIVITY_MESSAGES = {
  "activity.title": "Activite",
  "activity.empty": "Aucune activite pour le moment",
  "activity.actionsFor": "Actions pour {{user}}",
  "activity.action.created": "à créé",
  "activity.action.published": "à publié",
  "activity.action.scheduled": "à planifie",
  "activity.action.archived": "à archive",
  "activity.action.unpublished": "à depublie",
  "activity.action.restored": "à restaure",
  "activity.action.duplicated": "à duplique",
  "activity.action.updated": "à mis à jour",
  "activity.action.saved": "à enregistré",
  "activity.target.entry": "cette entrée",
  "activity.target.page": "cette page",
  "activity.target.content": "le contenu",
  "activity.target.revision": "une revision",
  "activity.restoreRevision": "Restaurer la revision",
  "activity.deleteRevision": "Supprimer la revision",
} satisfies ActivityMessageCatalog;
